const item = require('../models/item');
const borrow = require('../models/pinjam');
const LogAktivitas = require('../models/activityLog');

// ===== GET ALL ALAT =====
// Endpoint: GET /api/alat
const getAll = (req, res) => {
    item.getAll((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengambil data alat",
                error: err.message
            });
        }
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data alat",
            data: results
        });
    });
};

// ===== GET ALAT TERSEDIA =====
// Endpoint: GET /api/alat/tersedia
// Untuk peminjam melihat alat yang bisa dipinjam
const getAvailable = (req, res) => {
    item.getAvailable((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengambil data alat tersedia",
                error: err.message
            });
        }
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data alat tersedia",
            data: results
        });
    });
};

// ===== GET ALAT BY ID =====
// Endpoint: GET /api/alat/:id
const getById = (req, res) => {
    const { id } = req.params;

    item.getById(id, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengambil data alat",
                error: err.message
            });
        }
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "item tidak ditemukan"
            });
        }
        res.status(200).json({
            success: true,
            data: results[0]
        });
    });
};

// ===== CREATE ALAT =====
// Endpoint: POST /api/alat
const create = (req, res) => {
    const data = req.body;

    // Jika ada file gambar yang diupload, tambahkan ke data
    if (req.file) {
        data.gambar = req.file.filename;
    }

    // Validasi input
    if (!data.item_name || !data.total) {
        return res.status(400).json({
            success: false,
            message: "Nama alat dan total wajib diisi"
        });
    }

    item.create(data, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal menambahkan alat",
                error: err.message
            });
        }

        // Catat log aktivitas
        LogAktivitas.create({
            id_user: req.userId,
            aksi: 'CREATE',
            tabel_terkait: 'alat',
            id_data: results.insertId,
            keterangan: `item baru ditambahkan: ${data.item_name}`
        }, () => { });

        res.status(201).json({
            success: true,
            message: "Berhasil menambahkan alat",
            data: { id: results.insertId, gambar: data.gambar }
        });
    });
};

// ===== UPDATE ALAT =====
// Endpoint: PUT /api/alat/:id
const update = (req, res) => {
    const { id } = req.params;
    const data = req.body;

    // Jika ada file gambar yang diupload, tambahkan ke data
    if (req.file) {
        data.gambar = req.file.filename;
    }

    // Validasi input
    if (!data.item_name) {
        return res.status(400).json({
            success: false,
            message: "Nama alat wajib diisi"
        });
    }

    item.update(id, data, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengupdate alat",
                error: err.message
            });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "item tidak ditemukan"
            });
        }

        // Catat log aktivitas
        LogAktivitas.create({
            id_user: req.userId,
            aksi: 'UPDATE',
            tabel_terkait: 'alat',
            id_data: id,
            keterangan: `item diupdate: ${data.item_name}`
        }, () => { });

        res.status(200).json({
            success: true,
            message: "Berhasil mengupdate alat"
        });
    });
};

// ===== DELETE ALAT =====
// Endpoint: DELETE /api/alat/:id
const deleteitem = (req, res) => {
    const { id } = req.params;

    // Prevent deleting items with active borrows
    borrow.hasActiveByItem(id, (err, activeCount) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal memeriksa status peminjaman item',
                error: err.message
            });
        }

        if (activeCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Item memiliki peminjaman aktif dan tidak dapat dihapus'
            });
        }

        item.deleteById(id, (deleteErr, results) => {
            if (deleteErr) {
                return res.status(500).json({
                    success: false,
                    message: "Gagal menghapus alat",
                    error: deleteErr.message
                });
            }
            if (results.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "item tidak ditemukan"
                });
            }

            // Catat log aktivitas
            LogAktivitas.create({
                id_user: req.userId,
                aksi: 'DELETE',
                tabel_terkait: 'alat',
                id_data: id,
                keterangan: `item dihapus: ID ${id}`
            }, () => { });

            res.status(200).json({
                success: true,
                message: "Berhasil menghapus alat"
            });
        });
    });
};

// Export semua fungsi
module.exports = {
    getAll,
    getAvailable,
    getById,
    create,
    update,
    deleteitem
};
