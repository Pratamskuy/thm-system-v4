const returning_item = require('../models/kembali');
const borrow = require('../models/pinjam');
const item = require('../models/item');
const activityLog = require('../models/activityLog');
const returnModel = require('../models/returnModel')

// ===== GET ALL PENGEMBALIAN =====
// Endpoint: GET /api/pengembalian
const getAll = (req, res) => {
    returning_item.getAll((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengambil data pengembalian",
                error: err.message
            });
        }
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data pengembalian",
            data: results
        });
    });
};

// ===== GET PENGEMBALIAN BY ID =====
// Endpoint: GET /api/pengembalian/:id
const getById = (req, res) => {
    const { id } = req.params;

    returning_item.getById(id, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengambil data pengembalian",
                error: err.message
            });
        }
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "returning_item tidak ditemukan"
            });
        }
        res.status(200).json({
            success: true,
            data: results[0]
        });
    });
};

// ===== CREATE PENGEMBALIAN =====
// Endpoint: POST /api/pengembalian
// Memproses pengembalian alat
const create = (req, res) => {
    const { borrow_id, item_condition, notes } = req.body;
    const normalizedCondition = item_condition || 'normal';
    const officer_id = req.user.id;

    // Validasi input
    if (!borrow_id) {
        return res.status(400).json({
            success: false,
            message: "ID borrow_data wajib diisi"
        });
    }

    // Ambil data borrow_data
    borrow.getById(borrow_id, (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "peminjaman tidak ditemukan"
            });
        }

        const borrow_data = results[0];

        // Cek apakah borrow_data statusnya 'dipinjam' atau 'menunggu_pengembalian'
        if (borrow_data.status !== 'taken' && borrow_data.status !== 'waiting for return') {
            return res.status(400).json({
                success: false,
                message: "Status peminjaman tidak valid untuk dikembalikan"
            });
        }

        // Data untuk pengembalian
        const dataReturn = {
            borrow_id,
            officer_id,
            item_condition: normalizedCondition,
            notes,
            return_date_expected: borrow_data.return_date_expected
        };

        const restoreStock = normalizedCondition !== 'broken';

        // Buat record pengembalian
        returning_item.create(dataReturn, (err, results) => {
            if (err) {
                // Jika sudah ada pengembalian untuk borrow_data ini
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({
                        success: false,
                        message: "borrow ini sudah dikembalikan"
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Gagal memproses pengembalian",
                    error: err.message
                });
            }

            borrow.updateStatus(borrow_id, 'available', (err) => {
                if (err) console.error("Gagal update status borrow_data:", err);
            });

            const finishResponse = () => {
                const { late, denda } = returning_item.hitungDenda(
                    borrow_data.retunr_date_expected,
                    new Date(),
                    normalizedCondition
                );

                activityLog.create({
                    id_user: officer_id,
                    aksi: 'CREATE',
                    tabel_terkait: 'pengembalian',
                    id_data: results.insertId,
                    keterangan: `returning_item alat: ${borrow_data.item_name}. Denda: Rp ${denda}`
                }, () => { });

                res.status(201).json({
                    success: true,
                    message: "Berhasil memproses pengembalian",
                    data: {
                        id: results.insertId,
                        terlambat_hari: late,
                        denda,
                        denda_formatted: `Rp ${denda.toLocaleString('id-ID')}`
                    }
                });
            };

            item.updateJumlahTersedia(
                borrow_data.id_items,
                borrow_data.item_count,
                'tambah',
                normalizedCondition,
                (err) => {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Gagal mengupdate stok item',
                            error: err.message
                        });
                    }

                    borrow.processQueuedByItem(borrow_data.id_items, (queueErr) => {
                        if (queueErr) {
                            console.error("Gagal memproses antrean peminjaman:", queueErr);
                        }
                        finishResponse();
                    });
                }
            );
        });
    });
};

const confirmReturn = (req, res) => {
    const borrowId = req.params.id;
    const officer_id = req.user.id;
    const { item_condition, notes } = req.body;
    const normalizedCondition = item_condition || 'normal';
    const restoreStock = normalizedCondition !== 'broken';
    
    borrow.getById(borrowId, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal mengambil data peminjaman',
                error: err.message
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Peminjaman tidak ditemukan'
            });
        }

        const peminjaman = results[0];

        if (peminjaman.status !== 'waiting for return') {
            return res.status(400).json({
                success: false,
                message: 'Status peminjaman tidak valid untuk dikonfirmasi'
            });
        }

        returnModel.findByBorrowId(borrowId, (err, returnRows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Gagal mengambil data pengembalian',
                    error: err.message
                });
            }
            const proceedConfirm = () => {
                const { late, denda } = returning_item.hitungDenda(
                    peminjaman.return_date_expected,
                    new Date(),
                    normalizedCondition
                );

                returnModel.confirm(borrowId, officer_id, normalizedCondition, late, denda, notes, (err) => {
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Gagal mengonfirmasi pengembalian',
                            error: err.message
                        });
                    }

                    const finishConfirm = () => {
                        borrow.updateStatus(borrowId, 'available', (err) => {
                            if (err) {
                                return res.status(500).json({
                                    success: false,
                                    message: 'Gagal memperbarui status peminjaman',
                                    error: err.message
                                });
                            }

                            activityLog.create({
                                id_user: officer_id,
                                aksi: 'CONFIRM_RETURN',
                                tabel_terkait: 'peminjaman',
                                id_data: borrowId,
                                keterangan: `Pengembalian dikonfirmasi: ID ${borrowId}. Denda: Rp ${denda}`
                            }, () => { });

                            return res.status(200).json({
                                success: true,
                                message: 'Pengembalian berhasil dikonfirmasi',
                                data: {
                                    late,
                                    denda,
                                    denda_formatted: `Rp ${denda.toLocaleString('id-ID')}`
                                }
                            });
                        });
                    };

                    item.updateJumlahTersedia(
                        peminjaman.id_items,
                        peminjaman.item_count,
                        'tambah',
                        normalizedCondition,
                        (err) => {
                            if (err) {
                                return res.status(500).json({
                                    success: false,
                                    message: 'Gagal mengupdate stok item',
                                    error: err.message
                                });
                            }

                            borrow.processQueuedByItem(peminjaman.id_items, (queueErr) => {
                                if (queueErr) {
                                    console.error('Gagal memproses antrean peminjaman:', queueErr);
                                }
                                finishConfirm();
                            });
                        }
                    );
                });
            };

            if (returnRows.length === 0) {
                returnModel.create({ borrow_id: borrowId }, (createErr) => {
                    if (createErr && createErr.code !== 'ER_DUP_ENTRY') {
                        return res.status(500).json({
                            success: false,
                            message: 'Gagal membuat data pengembalian',
                            error: createErr.message
                        });
                    }

                    return proceedConfirm();
                });
            } else {
                proceedConfirm();
            }
        });
    });
};
// ===== DELETE PENGEMBALIAN =====
// Endpoint: DELETE /api/pengembalian/:id
const deletereturning_item = (req, res) => {
    const { id } = req.params;

    returning_item.deleteById(id, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal menghapus pengembalian",
                error: err.message
            });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "returning_item tidak ditemukan"
            });
        }

        // Catat log aktivitas
        activityLog.create({
            id_user: req.user.id,
            aksi: 'DELETE',
            tabel_terkait: 'pengembalian',
            id_data: id,
            keterangan: `returning_item dihapus: ID ${id}`
        }, () => { });

        res.status(200).json({
            success: true,
            message: "Berhasil menghapus pengembalian"
        });
    });
};

// Export semua fungsi
module.exports = {
    getAll,
    getById,
    create,
    deletereturning_item,
    confirmReturn
};
