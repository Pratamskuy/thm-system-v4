const db = require('../db');
const { sendBorrowStatusNotification } = require('../services/emailService');

const MAX_ITEMS_PER_REQUEST = 20;

const BORROW_SELECT_FIELDS = `
    b.*,
    COALESCE(u.full_name, u.name) AS full_name,
    u.email AS email,
    i.item_name,
    i.categories_id,
    c.categories AS category,
    officer.full_name AS officer_name,
    r.return_date,
    r.late,
    r.fine AS denda,
    br.status AS request_status
`;

const createError = (message, code) => {
    const err = new Error(message);
    if (code) {
        err.code = code;
    }
    return err;
};

const withTransaction = (work, callback) => {
    db.getConnection((err, connection) => {
        if (err) {
            return callback(err, null);
        }

        connection.beginTransaction((txErr) => {
            if (txErr) {
                connection.release();
                return callback(txErr, null);
            }

            const done = (workErr, result) => {
                if (workErr) {
                    return connection.rollback(() => {
                        connection.release();
                        callback(workErr, null);
                    });
                }

                connection.commit((commitErr) => {
                    if (commitErr) {
                        return connection.rollback(() => {
                            connection.release();
                            callback(commitErr, null);
                        });
                    }

                    connection.release();
                    callback(null, result);
                });
            };

            try {
                work(connection, done);
            } catch (unexpectedErr) {
                done(unexpectedErr);
            }
        });
    });
};

const determineRequestStatus = (stats) => {
    const total = Number(stats.total) || 0;
    const pending = Number(stats.pending_count) || 0;
    const queued = Number(stats.queued_count) || 0;
    const taken = Number(stats.taken_count) || 0;
    const waitingReturn = Number(stats.waiting_return_count) || 0;
    const returned = Number(stats.returned_count) || 0;
    const rejected = Number(stats.rejected_count) || 0;
    const cancelled = Number(stats.cancelled_count) || 0;
    const activeCount = pending + queued + taken + waitingReturn;
    const finishedCount = returned + rejected + cancelled;

    if (total === 0) {
        return 'cancelled';
    }

    if (pending === total) {
        return 'submitted';
    }

    if (queued === total) {
        return 'queued';
    }

    if (pending > 0 || queued > 0) {
        return pending === total ? 'submitted' : 'processing';
    }

    if (activeCount === 0 && finishedCount === total) {
        if (rejected + cancelled === total) {
            return rejected > 0 ? 'rejected' : 'cancelled';
        }
        return 'completed';
    }

    if (taken + waitingReturn > 0 && rejected + cancelled > 0) {
        return 'partially_approved';
    }

    if (taken + waitingReturn > 0) {
        return 'approved';
    }

    return 'processing';
};

const syncRequestStatusOnConnection = (connection, requestId, callback) => {
    if (!requestId) {
        return callback(null);
    }

    const statsQuery = `
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
            SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
            SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) AS taken_count,
            SUM(CASE WHEN status = 'waiting for return' THEN 1 ELSE 0 END) AS waiting_return_count,
            SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS returned_count,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count
        FROM borrow_data
        WHERE request_id = ?
    `;

    connection.query(statsQuery, [requestId], (statsErr, rows) => {
        if (statsErr) {
            return callback(statsErr);
        }

        const nextStatus = determineRequestStatus(rows[0] || {});
        const updateQuery = `
            UPDATE borrow_requests
            SET status = ?
            WHERE id = ?
        `;

        connection.query(updateQuery, [nextStatus, requestId], callback);
    });
};

const syncRequestStatus = (requestId, callback) => {
    withTransaction((connection, done) => {
        syncRequestStatusOnConnection(connection, requestId, (err) => {
            if (err) {
                return done(err);
            }

            done(null, { requestId });
        });
    }, callback);
};

const syncManyRequestStatusesOnConnection = (connection, requestIds, callback) => {
    const uniqueRequestIds = Array.from(new Set((requestIds || []).filter(Boolean)));
    if (uniqueRequestIds.length === 0) {
        return callback(null);
    }

    let index = 0;
    const next = (err) => {
        if (err) {
            return callback(err);
        }

        if (index >= uniqueRequestIds.length) {
            return callback(null);
        }

        const requestId = uniqueRequestIds[index];
        index += 1;

        syncRequestStatusOnConnection(connection, requestId, next);
    };

    next(null);
};

const processQueuedForItemOnConnection = (connection, itemId, callback) => {
    if (!itemId) {
        return callback(null, {
            itemId: null,
            promotedBorrowIds: [],
            promotedRequestIds: [],
        });
    }

    const lockItemQuery = `
        SELECT id, available
        FROM items
        WHERE id = ?
        FOR UPDATE
    `;

    connection.query(lockItemQuery, [itemId], (itemErr, itemRows) => {
        if (itemErr) {
            return callback(itemErr);
        }

        if (itemRows.length === 0) {
            return callback(createError(`Item dengan ID ${itemId} tidak ditemukan`, 'ITEM_NOT_FOUND'));
        }

        const queueLockQuery = `
            SELECT bd.id, bd.request_id, bd.item_count, u.email, COALESCE(u.full_name, u.name) AS user_name, i.item_name
            FROM borrow_data bd
            JOIN user_data u ON bd.id_user = u.id
            JOIN items i ON bd.id_items = i.id
            WHERE bd.id_items = ? AND bd.status = 'queued'
            ORDER BY bd.borrow_date ASC, bd.id ASC
            FOR UPDATE
        `;

        connection.query(queueLockQuery, [itemId], (queueErr, queuedRows) => {
            if (queueErr) {
                return callback(queueErr);
            }

            if (queuedRows.length === 0) {
                return callback(null, {
                    itemId,
                    promotedBorrowIds: [],
                    promotedRequestIds: [],
                });
            }

            let remainingAvailable = Number(itemRows[0].available) || 0;
            if (remainingAvailable <= 0) {
                return callback(null, {
                    itemId,
                    promotedBorrowIds: [],
                    promotedRequestIds: [],
                });
            }

            const queueToPromote = [];
            for (const queuedRow of queuedRows) {
                const requestedCount = Number(queuedRow.item_count) || 0;
                if (requestedCount < 1) {
                    continue;
                }

                // FIFO queue: stop when the first pending queue entry cannot be fulfilled.
                if (remainingAvailable < requestedCount) {
                    break;
                }

                remainingAvailable -= requestedCount;
                queueToPromote.push(queuedRow);
            }

            if (queueToPromote.length === 0) {
                return callback(null, {
                    itemId,
                    promotedBorrowIds: [],
                    promotedRequestIds: [],
                });
            }

            let index = 0;
            const promotedBorrowIds = [];
            const promotedRequestIds = new Set();
            let totalReserved = 0;

            const promoteNext = (promoteErr) => {
                if (promoteErr) {
                    return callback(promoteErr);
                }

                if (index >= queueToPromote.length) {
                    if (totalReserved <= 0) {
                        return callback(null, {
                            itemId,
                            promotedBorrowIds,
                            promotedRequestIds: Array.from(promotedRequestIds),
                        });
                    }

                    const reserveStockQuery = `
                        UPDATE items
                        SET available = available - ?
                        WHERE id = ? AND available >= ?
                    `;

                    return connection.query(
                        reserveStockQuery,
                        [totalReserved, itemId, totalReserved],
                        (reserveErr, reserveResult) => {
                            if (reserveErr) {
                                return callback(reserveErr);
                            }

                            if (reserveResult.affectedRows === 0) {
                                return callback(
                                    createError(
                                        'Gagal memproses antrean item karena stok berubah',
                                        'INSUFFICIENT_STOCK'
                                    )
                                );
                            }

                            syncManyRequestStatusesOnConnection(
                                connection,
                                Array.from(promotedRequestIds),
                                (syncErr) => {
                                    if (syncErr) {
                                        return callback(syncErr);
                                    }

                                    callback(null, {
                                        itemId,
                                        promotedBorrowIds,
                                        promotedRequestIds: Array.from(promotedRequestIds),
                                    });
                                }
                            );
                        }
                    );
                }

                const target = queueToPromote[index];
                index += 1;

                const promoteQuery = `
                    UPDATE borrow_data
                    SET status = 'pending'
                    WHERE id = ? AND status = 'queued'
                `;

                connection.query(promoteQuery, [target.id], (updateErr, updateResult) => {
                    if (updateErr) {
                        return callback(updateErr);
                    }

                    if (updateResult.affectedRows > 0) {
                        promotedBorrowIds.push(target.id);
                        totalReserved += Number(target.item_count) || 0;
                        if (target.request_id) {
                            promotedRequestIds.add(target.request_id);
                        }

                        // Send email notification asynchronously (don't block transaction)
                        sendBorrowStatusNotification(target.email, target.user_name, target.item_name, 'Pending')
                            .catch(emailErr => console.error('Failed to send email notification:', emailErr));
                    }

                    promoteNext(null);
                });
            };

            promoteNext(null);
        });
    });
};

const releaseStockAndPromoteQueueOnConnection = (connection, itemId, amount, callback) => {
    const releaseAmount = Number(amount) || 0;
    if (!itemId || releaseAmount <= 0) {
        return callback(null, {
            itemId,
            promotedBorrowIds: [],
            promotedRequestIds: [],
        });
    }

    const releaseStockQuery = `
        UPDATE items
        SET available = available + ?
        WHERE id = ?
    `;

    connection.query(releaseStockQuery, [releaseAmount, itemId], (releaseErr) => {
        if (releaseErr) {
            return callback(releaseErr);
        }

        processQueuedForItemOnConnection(connection, itemId, callback);
    });
};

const getAll = (callback) => {
    const query = `
        SELECT
            ${BORROW_SELECT_FIELDS}
        FROM borrow_data b
        LEFT JOIN user_data u ON b.id_user = u.id
        LEFT JOIN items i ON b.id_items = i.id
        LEFT JOIN categories c ON i.categories_id = c.id
        LEFT JOIN user_data officer ON b.id_officer_approval = officer.id
        LEFT JOIN return_data r ON r.borrow_id = b.id
        LEFT JOIN borrow_requests br ON br.id = b.request_id
        ORDER BY b.id DESC
    `;

    db.query(query, callback);
};

const getRequestBatches = (callback) => {
    const query = `
        SELECT
            br.id AS request_id,
            br.id_user,
            COALESCE(u.full_name, u.name) AS borrower,
            br.status AS request_status,
            br.notes AS request_notes,
            br.submitted_at,
            b.id AS borrow_id,
            b.id_items,
            i.item_name,
            c.categories AS category,
            b.item_count,
            b.return_date_expected,
            b.status AS borrow_status
        FROM borrow_requests br
        LEFT JOIN user_data u ON br.id_user = u.id
        LEFT JOIN borrow_data b ON b.request_id = br.id
        LEFT JOIN items i ON b.id_items = i.id
        LEFT JOIN categories c ON i.categories_id = c.id
        ORDER BY br.submitted_at DESC, b.id ASC
    `;

    db.query(query, callback);
};

const approveBatch = (requestId, officerId, callback) => {
    withTransaction((connection, done) => {
        const selectQuery = `
            SELECT id
            FROM borrow_data
            WHERE request_id = ? AND status = 'pending'
            FOR UPDATE
        `;

        connection.query(selectQuery, [requestId], (selectErr, rows) => {
            if (selectErr) {
                return done(selectErr);
            }

            if (!rows || rows.length === 0) {
                return done(createError('Tidak ada peminjaman pending pada batch ini', 'NO_PENDING_BATCH'));
            }

            const ids = rows.map((row) => row.id);
            const updateQuery = `
                UPDATE borrow_data
                SET
                    status = 'taken',
                    id_officer_approval = ?,
                    approval_date = NOW()
                WHERE id IN (?)
            `;

            connection.query(updateQuery, [officerId, ids], (updateErr, updateRes) => {
                if (updateErr) {
                    return done(updateErr);
                }

                syncRequestStatusOnConnection(connection, requestId, (syncErr) => {
                    if (syncErr) {
                        return done(syncErr);
                    }

                    done(null, { requestId, affectedRows: updateRes.affectedRows });
                });
            });
        });
    }, callback);
};

const getById = (id, callback) => {
    const query = `
        SELECT
            ${BORROW_SELECT_FIELDS}
        FROM borrow_data b
        LEFT JOIN user_data u ON b.id_user = u.id
        LEFT JOIN items i ON b.id_items = i.id
        LEFT JOIN categories c ON i.categories_id = c.id
        LEFT JOIN user_data officer ON b.id_officer_approval = officer.id
        LEFT JOIN return_data r ON r.borrow_id = b.id
        LEFT JOIN borrow_requests br ON br.id = b.request_id
        WHERE b.id = ?
    `;

    db.query(query, [id], callback);
};

const getByUser = (id_user, callback) => {
    const query = `
        SELECT
            b.id,
            b.request_id,
            b.id_user,
            COALESCE(u.full_name, u.name) AS full_name,
            b.id_items,
            i.item_name,
            i.categories_id,
            c.categories AS category,
            b.item_count,
            b.borrow_date,
            b.return_date_expected,
            b.status,
            b.notes,
            b.approval_date,
            r.return_date,
            r.late,
            r.fine AS denda,
            br.status AS request_status
        FROM borrow_data b
        LEFT JOIN items i ON b.id_items = i.id
        LEFT JOIN categories c ON i.categories_id = c.id
        LEFT JOIN user_data u ON b.id_user = u.id
        LEFT JOIN return_data r ON r.borrow_id = b.id
        LEFT JOIN borrow_requests br ON br.id = b.request_id
        WHERE b.id_user = ?
        ORDER BY b.created_at DESC
    `;

    db.query(query, [id_user], (err, results) => {
        if (err) {
            return callback(err, null);
        }

        callback(null, results);
    });
};

const getPending = (callback) => {
    const query = `
        SELECT
            ${BORROW_SELECT_FIELDS}
        FROM borrow_data b
        LEFT JOIN user_data u ON b.id_user = u.id
        LEFT JOIN items i ON b.id_items = i.id
        LEFT JOIN categories c ON i.categories_id = c.id
        LEFT JOIN user_data officer ON b.id_officer_approval = officer.id
        LEFT JOIN return_data r ON r.borrow_id = b.id
        LEFT JOIN borrow_requests br ON br.id = b.request_id
        WHERE b.status IN ('pending', 'queued')
        ORDER BY b.borrow_date ASC, b.id ASC
    `;

    db.query(query, callback);
};

const getActive = (callback) => {
    const query = `
        SELECT
            ${BORROW_SELECT_FIELDS}
        FROM borrow_data b
        LEFT JOIN user_data u ON b.id_user = u.id
        LEFT JOIN items i ON b.id_items = i.id
        LEFT JOIN categories c ON i.categories_id = c.id
        LEFT JOIN user_data officer ON b.id_officer_approval = officer.id
        LEFT JOIN return_data r ON r.borrow_id = b.id
        LEFT JOIN borrow_requests br ON br.id = b.request_id
        WHERE b.status IN ('taken', 'waiting for return')
        ORDER BY b.return_date_expected ASC
    `;

    db.query(query, callback);
};

const requestReturnByRequest = (requestId, userId, callback) => {
    withTransaction((connection, done) => {
        const selectTakenQuery = `
            SELECT id
            FROM borrow_data
            WHERE request_id = ? AND id_user = ? AND status = 'taken'
            FOR UPDATE
        `;

        connection.query(selectTakenQuery, [requestId, userId], (selectErr, rows) => {
            if (selectErr) {
                return done(selectErr);
            }

            if (!rows || rows.length === 0) {
                return done(createError('Tidak ada item dalam batch yang berstatus taken untuk dikembalikan', 'NO_TAKEN_ITEMS'));
            }

            const ids = rows.map((r) => r.id);
            const updateQuery = `
                UPDATE borrow_data
                SET status = 'waiting for return'
                WHERE id IN (?)
            `;

            connection.query(updateQuery, [ids], (updateErr, result) => {
                if (updateErr) {
                    return done(updateErr);
                }

                const insertReturnRows = (index) => {
                    if (index >= ids.length) {
                        return syncRequestStatusOnConnection(connection, requestId, (syncErr) => {
                            if (syncErr) {
                                return done(syncErr);
                            }

                            done(null, { requestId, affectedRows: result.affectedRows });
                        });
                    }

                    const borrowId = ids[index];
                    const insertQuery = `
                        INSERT INTO return_data (borrow_id)
                        VALUES (?)
                    `;

                    connection.query(insertQuery, [borrowId], (insertErr) => {
                        if (insertErr && insertErr.code !== 'ER_DUP_ENTRY') {
                            return done(insertErr);
                        }

                        insertReturnRows(index + 1);
                    });
                };

                insertReturnRows(0);
            });
        });
    }, callback);
};

const hasActiveByUser = (id_user, callback) => {
    const query = `
        SELECT COUNT(*) AS activeCount
        FROM borrow_data
        WHERE id_user = ? AND status IN ('taken', 'waiting for return')
    `;

    db.query(query, [id_user], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results[0]?.activeCount || 0);
    });
};

const hasActiveByItem = (id_items, callback) => {
    const query = `
        SELECT COUNT(*) AS activeCount
        FROM borrow_data
        WHERE id_items = ? AND status IN ('taken', 'waiting for return')
    `;

    db.query(query, [id_items], (err, results) => {
        if (err) return callback(err, null);
        callback(null, results[0]?.activeCount || 0);
    });
};

const getReturnRequests = (callback) => {
    const query = `
        SELECT
            ${BORROW_SELECT_FIELDS}
        FROM borrow_data b
        LEFT JOIN user_data u ON b.id_user = u.id
        LEFT JOIN items i ON b.id_items = i.id
        LEFT JOIN user_data officer ON b.id_officer_approval = officer.id
        LEFT JOIN return_data r ON r.borrow_id = b.id
        LEFT JOIN borrow_requests br ON br.id = b.request_id
        WHERE b.status = 'waiting for return'
        ORDER BY b.borrow_date ASC
    `;

    db.query(query, callback);
};

const getRequestsByUser = (id_user, callback) => {
    const query = `
        SELECT
            br.id AS request_id,
            br.status AS request_status,
            br.notes AS request_notes,
            br.submitted_at,
            b.id AS borrow_id,
            b.id_items,
            i.item_name,
            b.item_count,
            b.return_date_expected,
            b.status AS borrow_status
        FROM borrow_requests br
        LEFT JOIN borrow_data b ON b.request_id = br.id
        LEFT JOIN items i ON b.id_items = i.id
        WHERE br.id_user = ?
        ORDER BY br.submitted_at DESC, b.id ASC
    `;

    db.query(query, [id_user], callback);
};

const expirePendingBorrows = (callback) => {
    withTransaction((connection, done) => {
        const selectQuery = `
            SELECT id, request_id, id_items, item_count
            FROM borrow_data
            WHERE status = 'pending'
              AND borrow_date < DATE_SUB(NOW(), INTERVAL 24 HOUR)
            FOR UPDATE
        `;

        connection.query(selectQuery, (selectErr, rows) => {
            if (selectErr) {
                return done(selectErr);
            }

            if (!rows || rows.length === 0) {
                return done(null, { expiredCount: 0 });
            }

            const requestIds = new Set();
            const itemCounts = {};
            const borrowIds = rows.map((r) => r.id);

            rows.forEach((row) => {
                requestIds.add(row.request_id);
                const key = row.id_items;
                itemCounts[key] = (itemCounts[key] || 0) + row.item_count;
            });

            const updateBorrowQuery = `
                UPDATE borrow_data
                SET status = 'cancelled', notes = CONCAT(IFNULL(notes, ''), '\nExpired after 24h pending pickup')
                WHERE id IN (?)
            `;

            connection.query(updateBorrowQuery, [borrowIds], (updateErr) => {
                if (updateErr) {
                    return done(updateErr);
                }

                const keys = Object.keys(itemCounts);
                let releaseIndex = 0;

                const releaseNext = (releaseErr) => {
                    if (releaseErr) {
                        return done(releaseErr);
                    }
                    if (releaseIndex >= keys.length) {
                        // Sync all affected request statuses
                        const requestArray = Array.from(requestIds);
                        let syncIndex = 0;

                        const syncNext = (syncErr) => {
                            if (syncErr) {
                                return done(syncErr);
                            }
                            if (syncIndex >= requestArray.length) {
                                return done(null, { expiredCount: rows.length });
                            }

                            const reqId = requestArray[syncIndex++];
                            syncRequestStatusOnConnection(connection, reqId, syncNext);
                        };

                        return syncNext(null);
                    }

                    const itemId = keys[releaseIndex];
                    const amount = itemCounts[itemId];
                    releaseIndex += 1;

                    releaseStockAndPromoteQueueOnConnection(connection, itemId, amount, releaseNext);
                };

                releaseNext(null);
            });
        });
    }, callback);
};

const createBatch = (data, callback) => {
    const { id_user, items, request_notes, idempotency_key } = data;

    if (!id_user || !Array.isArray(items) || items.length === 0) {
        return callback(createError('Data peminjaman tidak lengkap'), null);
    }

    if (items.length > MAX_ITEMS_PER_REQUEST) {
        return callback(
            createError(`Maksimal ${MAX_ITEMS_PER_REQUEST} item per permintaan`, 'MAX_ITEMS_EXCEEDED'),
            null
        );
    }

    const normalizedItems = items
        .map((entry) => ({
            id_items: Number.parseInt(entry.id_items, 10),
            item_count: Number.parseInt(entry.item_count, 10) || 1,
            return_date_expected: entry.return_date_expected,
            notes: entry.notes || null,
        }))
        .sort((a, b) => {
            if (a.id_items !== b.id_items) {
                return a.id_items - b.id_items;
            }

            return String(a.return_date_expected || '').localeCompare(String(b.return_date_expected || ''));
        });

    withTransaction((connection, done) => {
        const reserveByIdempotency = (next) => {
            if (!idempotency_key) {
                return next();
            }

            const reserveQuery = `
                INSERT INTO borrow_submit_idempotency (id_user, idempotency_key, request_id)
                VALUES (?, ?, NULL)
            `;

            connection.query(reserveQuery, [id_user, idempotency_key], (reserveErr) => {
                if (!reserveErr) {
                    return next();
                }

                if (reserveErr.code !== 'ER_DUP_ENTRY') {
                    return done(reserveErr);
                }

                const lookupQuery = `
                    SELECT request_id
                    FROM borrow_submit_idempotency
                    WHERE id_user = ? AND idempotency_key = ?
                    LIMIT 1
                    FOR UPDATE
                `;

                connection.query(lookupQuery, [id_user, idempotency_key], (lookupErr, lookupRows) => {
                    if (lookupErr) {
                        return done(lookupErr);
                    }

                    if (lookupRows.length === 0) {
                        return done(createError('Gagal memverifikasi idempotency key', 'IDEMPOTENCY_LOOKUP_FAILED'));
                    }

                    const existingRequestId = lookupRows[0].request_id;
                    if (!existingRequestId) {
                        return done(createError('Request dengan key yang sama sedang diproses', 'IDEMPOTENCY_IN_PROGRESS'));
                    }

                    return done(null, {
                        requestId: existingRequestId,
                        itemIds: [],
                        pendingItemIds: [],
                        queuedItemIds: [],
                        reused: true,
                    });
                });
            });
        };

        reserveByIdempotency(() => {
            const insertRequestQuery = `
                INSERT INTO borrow_requests (id_user, status, notes, submitted_at)
                VALUES (?, 'submitted', ?, NOW())
            `;

            connection.query(insertRequestQuery, [id_user, request_notes || null], (requestErr, requestResult) => {
                if (requestErr) {
                    return done(requestErr);
                }

                const requestId = requestResult.insertId;
                const insertedItemIds = [];
                const pendingItemIds = [];
                const queuedItemIds = [];

                const processItem = (index) => {
                    if (index >= normalizedItems.length) {
                        return syncRequestStatusOnConnection(connection, requestId, (syncErr) => {
                            if (syncErr) {
                                return done(syncErr);
                            }

                            if (!idempotency_key) {
                                return done(null, {
                                    requestId,
                                    itemIds: insertedItemIds,
                                    pendingItemIds,
                                    queuedItemIds,
                                    reused: false,
                                });
                            }

                            const finalizeIdempotencyQuery = `
                                UPDATE borrow_submit_idempotency
                                SET request_id = ?
                                WHERE id_user = ? AND idempotency_key = ?
                            `;

                            connection.query(
                                finalizeIdempotencyQuery,
                                [requestId, id_user, idempotency_key],
                                (idempotencyErr) => {
                                    if (idempotencyErr) {
                                        return done(idempotencyErr);
                                    }

                                    done(null, {
                                        requestId,
                                        itemIds: insertedItemIds,
                                        pendingItemIds,
                                        queuedItemIds,
                                        reused: false,
                                    });
                                }
                            );
                        });
                    }

                    const current = normalizedItems[index];
                    const lockItemQuery = `
                        SELECT id, item_name, total, available, stock_normal, stock_ok, stock_not_good, stock_broken
                        FROM items
                        WHERE id = ?
                        FOR UPDATE
                    `;

                    connection.query(lockItemQuery, [current.id_items], (lockErr, itemRows) => {
                        if (lockErr) {
                            return done(lockErr);
                        }

                        if (itemRows.length === 0) {
                            return done(createError(`Item dengan ID ${current.id_items} tidak ditemukan`, 'ITEM_NOT_FOUND'));
                        }

                        const itemRow = itemRows[0];
                        if (itemRow.item_condition === 'broken') {
                            return done(createError(`Item "${itemRow.item_name}" tidak dapat dipinjam karena status broken`, 'BROKEN_ITEM'));
                        }

                        if (current.item_count > Number(itemRow.total)) {
                            return done(
                                createError(
                                    `Jumlah pinjam untuk item "${itemRow.item_name}" melebihi total item (${itemRow.total})`,
                                    'INVALID_ITEM_COUNT'
                                )
                            );
                        }

                        const availableStock = Number(itemRow.available) || 0;
                        const stockNormal = Number(itemRow.stock_normal) || 0;
                        const stockOk = Number(itemRow.stock_ok) || 0;
                        const stockNotGood = Number(itemRow.stock_not_good) || 0;
                        const shouldReserveStock = availableStock >= current.item_count;
                        const borrowStatus = shouldReserveStock ? 'pending' : 'queued';

                        const insertBorrowItem = () => {
                            const insertBorrowItemQuery = `
                                INSERT INTO borrow_data (
                                    request_id,
                                    id_user,
                                    id_items,
                                    item_count,
                                    return_date_expected,
                                    notes,
                                    status
                                )
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            `;

                            connection.query(
                                insertBorrowItemQuery,
                                [
                                    requestId,
                                    id_user,
                                    current.id_items,
                                    current.item_count,
                                    current.return_date_expected,
                                    current.notes,
                                    borrowStatus,
                                ],
                                (insertErr, insertResult) => {
                                    if (insertErr) {
                                        return done(insertErr);
                                    }

                                    insertedItemIds.push(insertResult.insertId);
                                    if (borrowStatus === 'queued') {
                                        queuedItemIds.push(insertResult.insertId);
                                    } else {
                                        pendingItemIds.push(insertResult.insertId);
                                    }
                                    processItem(index + 1);
                                }
                            );
                        };

                        if (!shouldReserveStock) {
                            return insertBorrowItem();
                        }

                        const reserveStockQuery = `
                            UPDATE items
                            SET available = available - ?,
                                stock_normal = ?,
                                stock_ok = ?,
                                stock_not_good = ?
                            WHERE id = ? AND available >= ?
                        `;

                        const remainingToReserve = current.item_count;
                        let normalToUse = Math.min(stockNormal, remainingToReserve);
                        let remaining = remainingToReserve - normalToUse;
                        let okToUse = Math.min(stockOk, remaining);
                        remaining -= okToUse;
                        let notGoodToUse = Math.min(stockNotGood, remaining);
                        remaining -= notGoodToUse;

                        const nextStockNormal = stockNormal - normalToUse;
                        const nextStockOk = stockOk - okToUse;
                        const nextStockNotGood = stockNotGood - notGoodToUse;

                        connection.query(
                            reserveStockQuery,
                            [
                                current.item_count,
                                nextStockNormal,
                                nextStockOk,
                                nextStockNotGood,
                                current.id_items,
                                current.item_count,
                            ],
                            (reserveErr, reserveResult) => {
                                if (reserveErr) {
                                    return done(reserveErr);
                                }

                                if (reserveResult.affectedRows === 0) {
                                    return done(
                                        createError(
                                            `Stok item "${itemRow.item_name}" berubah saat diproses. Silakan ulangi.`,
                                            'INSUFFICIENT_STOCK'
                                        )
                                    );
                                }

                                insertBorrowItem();
                            }
                        );
                    });
                };

                processItem(0);
            });
        });
    }, callback);
};

const create = (data, callback) => {
    createBatch(
        {
            id_user: data.id_user,
            request_notes: data.notes || null,
            idempotency_key: data.idempotency_key || null,
            items: [
                {
                    id_items: data.id_items,
                    item_count: data.item_count || 1,
                    return_date_expected: data.return_date_expected,
                    notes: data.notes || null,
                },
            ],
        },
        (err, results) => {
            if (err) {
                return callback(err, null);
            }

            callback(null, {
                insertId: results.itemIds[0] || null,
                requestId: results.requestId,
                reused: results.reused,
            });
        }
    );
};

const approve = (id, officer_id, callback) => {
    withTransaction((connection, done) => {
        const lockQuery = `
            SELECT id, request_id, status
            FROM borrow_data
            WHERE id = ?
            FOR UPDATE
        `;

        connection.query(lockQuery, [id], (lockErr, rows) => {
            if (lockErr) {
                return done(lockErr);
            }

            if (rows.length === 0) {
                return done(createError('Peminjaman tidak ditemukan', 'BORROW_NOT_FOUND'));
            }

            const record = rows[0];
            if (record.status !== 'pending') {
                return done(createError('Peminjaman ini sudah diproses sebelumnya', 'INVALID_STATUS'));
            }

            const approveQuery = `
                UPDATE borrow_data
                SET
                    status = 'taken',
                    id_officer_approval = ?,
                    approval_date = NOW()
                WHERE id = ? AND status = 'pending'
            `;

            connection.query(approveQuery, [officer_id, id], (approveErr, result) => {
                if (approveErr) {
                    return done(approveErr);
                }

                syncRequestStatusOnConnection(connection, record.request_id, (syncErr) => {
                    if (syncErr) {
                        return done(syncErr);
                    }

                    done(null, result);
                });
            });
        });
    }, callback);
};

const reject = (id, officer_id, notes, callback) => {
    withTransaction((connection, done) => {
        const lockQuery = `
            SELECT id, id_items, item_count, request_id, status
            FROM borrow_data
            WHERE id = ?
            FOR UPDATE
        `;

        connection.query(lockQuery, [id], (lockErr, rows) => {
            if (lockErr) {
                return done(lockErr);
            }

            if (rows.length === 0) {
                return done(createError('Peminjaman tidak ditemukan', 'BORROW_NOT_FOUND'));
            }

            const record = rows[0];
            if (record.status !== 'pending' && record.status !== 'queued') {
                return done(createError('Peminjaman ini sudah diproses sebelumnya', 'INVALID_STATUS'));
            }

            const rejectQuery = `
                UPDATE borrow_data
                SET status = 'rejected', id_officer_approval = ?, approval_date = NOW(), notes = ?
                WHERE id = ? AND status IN ('pending', 'queued')
            `;

            connection.query(rejectQuery, [officer_id, notes || null, id], (rejectErr, result) => {
                if (rejectErr) {
                    return done(rejectErr);
                }

                const finishReject = () =>
                    syncRequestStatusOnConnection(connection, record.request_id, (syncErr) => {
                        if (syncErr) {
                            return done(syncErr);
                        }

                        done(null, result);
                    });

                if (record.status !== 'pending') {
                    return finishReject();
                }

                releaseStockAndPromoteQueueOnConnection(
                    connection,
                    record.id_items,
                    record.item_count,
                    (releaseErr) => {
                        if (releaseErr) {
                            return done(releaseErr);
                        }

                        finishReject();
                    }
                );
            });
        });
    }, callback);
};

const cancel = (id, user_id, callback) => {
    withTransaction((connection, done) => {
        const lockQuery = `
            SELECT id, id_items, item_count, request_id, status
            FROM borrow_data
            WHERE id = ? AND id_user = ?
            FOR UPDATE
        `;

        connection.query(lockQuery, [id, user_id], (lockErr, rows) => {
            if (lockErr) {
                return done(lockErr);
            }

            if (rows.length === 0) {
                return done(createError('Peminjaman tidak ditemukan', 'BORROW_NOT_FOUND'));
            }

            const record = rows[0];
            if (record.status !== 'pending' && record.status !== 'queued') {
                return done(createError('Peminjaman tidak bisa dibatalkan', 'INVALID_STATUS'));
            }

            const cancelQuery = `
                UPDATE borrow_data
                SET status = 'cancelled', notes = 'Cancelled by user'
                WHERE id = ? AND id_user = ? AND status IN ('pending', 'queued')
            `;

            connection.query(cancelQuery, [id, user_id], (cancelErr, result) => {
                if (cancelErr) {
                    return done(cancelErr);
                }

                const finishCancel = () =>
                    syncRequestStatusOnConnection(connection, record.request_id, (syncErr) => {
                        if (syncErr) {
                            return done(syncErr);
                        }

                        done(null, result);
                    });

                if (record.status !== 'pending') {
                    return finishCancel();
                }

                releaseStockAndPromoteQueueOnConnection(
                    connection,
                    record.id_items,
                    record.item_count,
                    (releaseErr) => {
                        if (releaseErr) {
                            return done(releaseErr);
                        }

                        finishCancel();
                    }
                );
            });
        });
    }, callback);
};

const updateStatus = (id, status, callback) => {
    withTransaction((connection, done) => {
        const lockQuery = `
            SELECT id, request_id
            FROM borrow_data
            WHERE id = ?
            FOR UPDATE
        `;

        connection.query(lockQuery, [id], (lockErr, rows) => {
            if (lockErr) {
                return done(lockErr);
            }

            if (rows.length === 0) {
                return done(createError('Peminjaman tidak ditemukan', 'BORROW_NOT_FOUND'));
            }

            const updateQuery = `
                UPDATE borrow_data
                SET status = ?
                WHERE id = ?
            `;

            connection.query(updateQuery, [status, id], (updateErr, result) => {
                if (updateErr) {
                    return done(updateErr);
                }

                syncRequestStatusOnConnection(connection, rows[0].request_id, (syncErr) => {
                    if (syncErr) {
                        return done(syncErr);
                    }

                    done(null, result);
                });
            });
        });
    }, callback);
};

const deleteById = (id, callback) => {
    withTransaction((connection, done) => {
        const lockQuery = `
            SELECT id, id_items, item_count, request_id, status
            FROM borrow_data
            WHERE id = ?
            FOR UPDATE
        `;

        connection.query(lockQuery, [id], (lockErr, rows) => {
            if (lockErr) {
                return done(lockErr);
            }

            if (rows.length === 0) {
                return done(createError('Peminjaman tidak ditemukan', 'BORROW_NOT_FOUND'));
            }

            const record = rows[0];

            const continueDelete = () => {
                const deleteQuery = `DELETE FROM borrow_data WHERE id = ?`;
                connection.query(deleteQuery, [id], (deleteErr, result) => {
                    if (deleteErr) {
                        return done(deleteErr);
                    }

                    syncRequestStatusOnConnection(connection, record.request_id, (syncErr) => {
                        if (syncErr) {
                            return done(syncErr);
                        }

                        done(null, result);
                    });
                });
            };

            if (record.status !== 'pending') {
                return continueDelete();
            }

            releaseStockAndPromoteQueueOnConnection(
                connection,
                record.id_items,
                record.item_count,
                (releaseErr) => {
                if (releaseErr) {
                    return done(releaseErr);
                }

                continueDelete();
                }
            );
        });
    }, callback);
};

const processQueuedByItem = (itemId, callback) => {
    withTransaction((connection, done) => {
        processQueuedForItemOnConnection(connection, itemId, (err, result) => {
            if (err) {
                return done(err);
            }

            done(null, result);
        });
    }, callback);
};

module.exports = {
    getAll,
    getById,
    getByUser,
    getPending,
    getActive,
    getReturnRequests,
    getRequestBatches,
    getRequestsByUser,
    expirePendingBorrows,
    requestReturnByRequest,
    approveBatch,
    hasActiveByUser,
    hasActiveByItem,
    create,
    createBatch,
    approve,
    reject,
    cancel,
    updateStatus,
    syncRequestStatus,
    deleteById,
    processQueuedByItem,
};
