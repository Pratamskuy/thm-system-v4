const User = require('../models/user');
const borrow = require('../models/pinjam');
const jwt = require('jsonwebtoken');
const activityLog = require('../models/activityLog');
require('dotenv').config();

// Endpoint: GET /api/users
const getAll = (req, res) => {
    User.getAll((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengambil data user",
                error: err.message
            });
        }
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data user",
            data: results
        });
    });
};

// Endpoint: GET /api/users/:id
const getById = (req, res) => {
    const { id } = req.params;

    User.getById(id, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengambil data user",
                error: err.message
            });
        }
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User tidak ditemukan"
            });
        }
        res.status(200).json({
            success: true,
            data: results[0]
        });
    });
};

// Endpoint: POST /api/register
const register = (req, res) => {
    const data = req.body;

    // Validasi input
    if (!data.name || !data.email || !data.password) {
        return res.status(400).json({
            success: false,
            message: "Username, email, dan password wajib diisi"
        });
    }

    User.create(data, (err, results) => {
        if (err) {
            // Cek jika email sudah ada
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({
                    success: false,
                    message: "Email sudah terdaftar"
                });
            }
            return res.status(500).json({
                success: false,
                message: "Gagal mendaftarkan user",
                error: err.message
            });
        }

        // Catat log aktivitas
        activityLog.create({
            id_user: results.insertId,
            action: 'REGISTER',
            table_affected: 'user_data',
            id_data: results.insertId,
            notes: `User baru mendaftar: ${data.email}`
        }, () => { });

        res.status(201).json({
            success: true,
            message: "Berhasil mendaftarkan user",
            data: { id: results.insertId }
        });
    });
};

// Endpoint: POST /api/login
const login = (req, res) => {
    const { email, password } = req.body;

    // Validasi input
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email dan password wajib diisi"
        });
    }

    // Cari user berdasarkan email
    User.getByEmail(email, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Terjadi kesalahan",
                error: err.message
            });
        }

        // User tidak ditemukan
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Email tidak terdaftar"
            });
        }

        const user = results[0];

        // Cek password
        const isPasswordValid = User.verifyPassword(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Password salah"
            });
        }

        // Buat token JWT
        // Token berisi id dan role_id user
        const token = jwt.sign(
            { id: user.id, role_id: user.role_id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' } // Token berlaku 24 jam
        );

        // Data user yang dikirim ke frontend (tanpa password)
        const userData = {
            id: user.id,
            name: user.name,
            email: user.email,
            full_name: user.full_name,
            address: user.address,
            role_id: user.role_id
        };

        // Catat log aktivitas
        activityLog.create({
            id_user: user.id,
            action: 'LOGIN',
            table_affected: 'users',
            id_data: user.id,
            notes: `User login: ${email}`
        }, () => { });

        res.status(200).json({
            success: true,
            message: "Login berhasil",
            data: userData,
            token: token
        });
    });
};

// Endpoint: PUT /api/users/:id
const update = (req, res) => {
    const { id } = req.params;
    const data = req.body;

    User.update(id, data, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengupdate user",
                error: err.message
            });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "User tidak ditemukan"
            });
        }

        // Catat log aktivitas
        activityLog.create({
            id_user: req.userId,
            action: 'UPDATE',
            table_affected: 'users',
            id_data: id,
            notes: `User diupdate: ID ${id}`
        }, () => { });

        res.status(200).json({
            success: true,
            message: "Berhasil mengupdate user"
        });
    });
};

// Endpoint: DELETE /api/users/:id
const deleteUser = (req, res) => {
    const { id } = req.params;

    // Prevent admins from deleting themselves
    if (Number(req.user.id) === Number(id)) {
        return res.status(403).json({
            success: false,
            message: 'Admin tidak dapat menghapus dirinya sendiri'
        });
    }

    // Prevent deleting users with active borrows
    borrow.hasActiveByUser(id, (err, activeCount) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Gagal memeriksa status peminjaman user',
                error: err.message
            });
        }

        if (activeCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'User memiliki peminjaman aktif dan tidak dapat dihapus'
            });
        }

        User.deleteById(id, (deleteErr, results) => {
            if (deleteErr) {
                return res.status(500).json({
                    success: false,
                    message: "Gagal menghapus user",
                    error: deleteErr.message
                });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "User tidak ditemukan"
                });
            }

            // Catat log aktivitas
            activityLog.create({
                id_user: req.userId,
                action: 'DELETE',
                table_affected: 'users',
                id_data: id,
                notes: `User dihapus: ID ${id}`
            }, () => { });

            res.status(200).json({
                success: true,
                message: "Berhasil menghapus user"
            });
        });
    });
};

// Endpoint: GET /api/profile
// Mengambil data user yang sedang login
const getProfile = (req, res) => {
    const userId = req.user.id; // 🔥 FIX DI SINI

    User.getById(userId, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengambil profil",
                error: err.message
            });
        }
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User tidak ditemukan"
            });
        }

        const { password, ...userData } = results[0];

        res.status(200).json({
            success: true,
            data: userData
        });
    });
};

// Export semua fungsi
module.exports = {
    getAll,
    getById,
    register,
    login,
    update,
    deleteUser,
    getProfile
};