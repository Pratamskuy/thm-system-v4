const borrow = require('../models/pinjam');
const activityLog = require('../models/activityLog');
const returnModel = require('../models/returnModel');

const MAX_ITEMS_PER_REQUEST = 20;

const logActivity = (payload) => {
    activityLog.create(payload, () => {});
};

const mapBorrowError = (err, res, fallbackMessage) => {
    if (!err) {
        return res.status(500).json({
            success: false,
            message: fallbackMessage,
        });
    }

    if (err.code === 'BORROW_NOT_FOUND') {
        return res.status(404).json({
            success: false,
            message: err.message,
        });
    }

    if (err.code === 'ITEM_NOT_FOUND') {
        return res.status(404).json({
            success: false,
            message: err.message,
        });
    }

    if (
        err.code === 'INVALID_STATUS' ||
        err.code === 'INSUFFICIENT_STOCK' ||
        err.code === 'INVALID_ITEM_COUNT' ||
        err.code === 'MAX_ITEMS_EXCEEDED' ||
        err.code === 'IDEMPOTENCY_LOOKUP_FAILED'
    ) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }

    if (err.code === 'IDEMPOTENCY_IN_PROGRESS') {
        return res.status(409).json({
            success: false,
            message: err.message,
        });
    }

    return res.status(500).json({
        success: false,
        message: fallbackMessage,
        error: err.message,
    });
};

const normalizeCreatePayload = (body) => {
    if (Array.isArray(body.items) && body.items.length > 0) {
        return body.items;
    }

    if (body.id_items) {
        return [
            {
                id_items: body.id_items,
                item_count: body.item_count,
                return_date_expected: body.return_date_expected,
                notes: body.notes,
            },
        ];
    }

    return [];
};

const validateItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
        return { valid: false, message: 'Minimal satu item harus dipilih' };
    }

    if (items.length > MAX_ITEMS_PER_REQUEST) {
        return {
            valid: false,
            message: `Maksimal ${MAX_ITEMS_PER_REQUEST} item per permintaan`,
        };
    }

    const seen = new Set();

    for (const entry of items) {
        const id_items = Number.parseInt(entry.id_items, 10);
        const item_count = Number.parseInt(entry.item_count, 10) || 1;
        const return_date_expected = entry.return_date_expected;

        if (!id_items || id_items < 1) {
            return { valid: false, message: 'ID item tidak valid pada daftar item' };
        }

        if (!item_count || item_count < 1) {
            return { valid: false, message: 'Jumlah item minimal 1 pada setiap item' };
        }

        if (!return_date_expected) {
            return { valid: false, message: 'Tanggal kembali wajib diisi untuk semua item' };
        }

        const duplicateKey = `${id_items}|${return_date_expected}`;
        if (seen.has(duplicateKey)) {
            return {
                valid: false,
                message: 'Duplikasi item dengan tanggal kembali yang sama tidak diperbolehkan',
            };
        }

        seen.add(duplicateKey);
    }

    return { valid: true };
};

const getAll = (req, res) => {
    borrow.getAll((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil data peminjaman',
                error: err.message,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Berhasil mengambil data peminjaman',
            data: results,
        });
    });
};

const getById = (req, res) => {
    const { id } = req.params;

    borrow.getById(id, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil data peminjaman',
                error: err.message,
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Peminjaman tidak ditemukan',
            });
        }

        res.status(200).json({
            success: true,
            data: results[0],
        });
    });
};

const getMyborrow = (req, res) => {
    const id_user = req.user.id;

    if (!id_user) {
        return res.status(401).json({
            success: false,
            message: 'User tidak terautentikasi',
        });
    }

    borrow.getByUser(id_user, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil data peminjaman',
                error: err.message,
            });
        }

        res.status(200).json({
            success: true,
            total: results.length,
            data: results,
        });
    });
};

const getRequestBatches = (req, res) => {
    borrow.getRequestBatches((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil riwayat batch peminjaman',
                error: err.message,
            });
        }

        const requests = results.reduce((acc, row) => {
            if (!acc[row.request_id]) {
                acc[row.request_id] = {
                    request_id: row.request_id,
                    id_user: row.id_user,
                    borrower: row.borrower,
                    request_status: row.request_status,
                    request_notes: row.request_notes,
                    submitted_at: row.submitted_at,
                    items: [],
                };
            }

            if (row.borrow_id) {
                acc[row.request_id].items.push({
                    borrow_id: row.borrow_id,
                    id_items: row.id_items,
                    item_name: row.item_name,
                    item_count: row.item_count,
                    return_date_expected: row.return_date_expected,
                    borrow_status: row.borrow_status,
                });
            }

            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: Object.values(requests),
        });
    });
};

const approveBatch = (req, res) => {
    const { requestId } = req.params;
    const officerId = req.user.id;

    borrow.approveBatch(requestId, officerId, (err, result) => {
        if (err) {
            return mapBorrowError(err, res, 'Gagal menyetujui batch peminjaman');
        }

        res.status(200).json({
            success: true,
            message: `Batch peminjaman #${requestId} berhasil disetujui`,
            data: result,
        });
    });
};

const requestReturnByRequest = (req, res) => {
    const requestId = req.params.requestId;
    const userId = req.user.id;

    borrow.requestReturnByRequest(requestId, userId, (err, result) => {
        if (err) {
            if (err.code === 'NO_TAKEN_ITEMS') {
                return res.status(400).json({
                    success: false,
                    message: err.message,
                });
            }
            return mapBorrowError(err, res, 'Gagal mengajukan pengembalian batch');
        }

        res.status(200).json({
            success: true,
            message: 'Permintaan pengembalian batch berhasil diajukan',
            data: result,
        });
    });
};

const getRequestsByUser = (req, res) => {
    const id_user = req.user.id;

    borrow.getRequestsByUser(id_user, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil riwayat batch peminjaman',
                error: err.message,
            });
        }

        // Group by request_id for clean batch front-end structure
        const requests = results.reduce((acc, row) => {
            if (!acc[row.request_id]) {
                acc[row.request_id] = {
                    request_id: row.request_id,
                    request_status: row.request_status,
                    request_notes: row.request_notes,
                    submitted_at: row.submitted_at,
                    items: [],
                };
            }
            if (row.borrow_id) {
                acc[row.request_id].items.push({
                    borrow_id: row.borrow_id,
                    id_items: row.id_items,
                    item_name: row.item_name,
                    item_count: row.item_count,
                    return_date_expected: row.return_date_expected,
                    borrow_status: row.borrow_status,
                });
            }
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: Object.values(requests),
        });
    });
};

const expirePendingBorrows = (req, res) => {
    borrow.expirePendingBorrows((err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal meng-expire peminjaman pending',
                error: err.message,
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.expiredCount || 0} peminjaman pending kedaluwarsa dan dibatalkan`,
            data: result,
        });
    });
};

const getPending = (req, res) => {
    borrow.getPending((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil data peminjaman pending',
                error: err.message,
            });
        }

        res.status(200).json({
            success: true,
            data: results,
        });
    });
};

const getActive = (req, res) => {
    borrow.getActive((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil data peminjaman aktif',
                error: err.message,
            });
        }

        res.status(200).json({
            success: true,
            data: results,
        });
    });
};

const create = (req, res) => {
    const items = normalizeCreatePayload(req.body);
    const validation = validateItems(items);

    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            message: validation.message,
        });
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotency_key || null;

    const payload = {
        id_user: req.user.id,
        request_notes: req.body.request_notes || req.body.notes || null,
        idempotency_key: idempotencyKey,
        items,
    };

    borrow.createBatch(payload, (err, result) => {
        if (err) {
            return mapBorrowError(err, res, 'Gagal mengajukan peminjaman');
        }

        logActivity({
            id_user: req.user.id,
            action: 'CREATE',
            table_affected: 'borrow_requests',
            id_data: result.requestId,
            notes: `Pengajuan peminjaman ${result.reused ? 'idempotent-hit' : 'baru'}: request ${result.requestId}`,
        });

        const responseData = {
            request_id: result.requestId,
            item_ids: result.itemIds,
            pending_item_ids: result.pendingItemIds || [],
            queued_item_ids: result.queuedItemIds || [],
            reused: result.reused,
        };

        if (result.itemIds.length === 1) {
            responseData.id = result.itemIds[0];
        }

        const queuedCount = responseData.queued_item_ids.length;
        const pendingCount = responseData.pending_item_ids.length;
        let message = 'Berhasil mengajukan peminjaman. Stok sudah di-reserve dan menunggu persetujuan petugas.';

        if (queuedCount > 0 && pendingCount > 0) {
            message =
                'Berhasil mengajukan peminjaman. Sebagian item di-reserve (pending) dan sebagian masuk antrean (queued).';
        } else if (queuedCount > 0) {
            message = 'Berhasil mengajukan peminjaman. Item masuk antrean (queued) karena stok belum mencukupi.';
        }

        return res.status(result.reused ? 200 : 201).json({
            success: true,
            message: result.reused
                ? 'Request yang sama sudah pernah diproses sebelumnya'
                : message,
            data: responseData,
        });
    });
};

const approve = (req, res) => {
    const { id } = req.params;
    const officer_id = req.user.id;

    borrow.approve(id, officer_id, (err, results) => {
        if (err) {
            return mapBorrowError(err, res, 'Gagal menyetujui peminjaman');
        }

        if (results.affectedRows === 0) {
            return res.status(400).json({
                success: false,
                message: 'Peminjaman gagal diproses',
            });
        }

        logActivity({
            id_user: officer_id,
            action: 'APPROVE',
            table_affected: 'borrow_data',
            id_data: Number(id),
            notes: `Peminjaman item disetujui: ID ${id}`,
        });

        return res.status(200).json({
            success: true,
            message: 'Peminjaman berhasil disetujui',
        });
    });
};

const reject = (req, res) => {
    const { id } = req.params;
    const notes = req.body.notes || req.body.catatan || null;
    const officer_id = req.user.id;

    borrow.reject(id, officer_id, notes, (err, results) => {
        if (err) {
            return mapBorrowError(err, res, 'Gagal menolak peminjaman');
        }

        if (results.affectedRows === 0) {
            return res.status(400).json({
                success: false,
                message: 'Peminjaman gagal diproses',
            });
        }

        logActivity({
            id_user: officer_id,
            action: 'REJECT',
            table_affected: 'borrow_data',
            id_data: Number(id),
            notes: `Peminjaman item ditolak: ID ${id}`,
        });

        return res.status(200).json({
            success: true,
            message: 'Peminjaman berhasil ditolak',
        });
    });
};

const getReturnRequests = (req, res) => {
    borrow.getReturnRequests((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil data pengajuan pengembalian',
                error: err.message,
            });
        }

        res.status(200).json({
            success: true,
            data: results,
        });
    });
};

const deleteborrow = (req, res) => {
    const { id } = req.params;

    borrow.deleteById(id, (err, results) => {
        if (err) {
            return mapBorrowError(err, res, 'Gagal menghapus peminjaman');
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Peminjaman tidak ditemukan',
            });
        }

        logActivity({
            id_user: req.user.id,
            action: 'DELETE',
            table_affected: 'borrow_data',
            id_data: Number(id),
            notes: `Peminjaman dihapus: ID ${id}`,
        });

        res.status(200).json({
            success: true,
            message: 'Berhasil menghapus peminjaman',
        });
    });
};

const requestReturn = (req, res) => {
    const borrow_id = req.params.id;
    const id_user = req.user.id;

    borrow.getById(borrow_id, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Server error',
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Peminjaman tidak ditemukan',
            });
        }

        const peminjaman = results[0];

        if (Number(peminjaman.id_user) !== Number(id_user)) {
            return res.status(403).json({
                success: false,
                message: 'Bukan pemilik peminjaman',
            });
        }

        if (peminjaman.status !== 'taken') {
            return res.status(400).json({
                success: false,
                message: 'Status peminjaman tidak valid untuk request return',
            });
        }

        returnModel.findByBorrowId(borrow_id, (returnErr, existingReturn) => {
            if (returnErr) {
                return res.status(500).json({
                    success: false,
                    message: 'Server error',
                });
            }

            if (existingReturn.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Request pengembalian sudah diajukan',
                });
            }

            returnModel.create({ borrow_id }, (createErr) => {
                if (createErr) {
                    return res.status(500).json({
                        success: false,
                        message: 'Gagal membuat request pengembalian',
                    });
                }

                borrow.updateStatus(borrow_id, 'waiting for return', (statusErr) => {
                    if (statusErr) {
                        return res.status(500).json({
                            success: false,
                            message: 'Gagal update status peminjaman',
                        });
                    }

                    logActivity({
                        id_user,
                        action: 'REQUEST_RETURN',
                        table_affected: 'borrow_data',
                        id_data: Number(borrow_id),
                        notes: `Request pengembalian diajukan: ID ${borrow_id}`,
                    });

                    return res.status(200).json({
                        success: true,
                        message: 'Request pengembalian berhasil diajukan',
                    });
                });
            });
        });
    });
};

const cancel = (req, res) => {
    const { id } = req.params;
    const user_id = req.user.id;

    borrow.cancel(id, user_id, (err, results) => {
        if (err) {
            return mapBorrowError(err, res, 'Gagal membatalkan peminjaman');
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Peminjaman tidak ditemukan atau tidak dapat dibatalkan',
            });
        }

        logActivity({
            id_user: user_id,
            action: 'CANCEL',
            table_affected: 'borrow_data',
            id_data: Number(id),
            notes: `Peminjaman dibatalkan: ID ${id}`,
        });

        res.status(200).json({
            success: true,
            message: 'Peminjaman berhasil dibatalkan',
        });
    });
};

module.exports = {
    getAll,
    getById,
    getMyborrow,
    getRequestBatches,
    getPending,
    getActive,
    getRequestsByUser,
    expirePendingBorrows,
    approveBatch,
    requestReturnByRequest,
    create,
    approve,
    reject,
    cancel,
    deleteborrow,
    requestReturn,
    getReturnRequests,
};
