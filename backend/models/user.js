const db = require("../db");
const bcrypt = require('bcryptjs')

//alat pencari data user ajaib(semua)
const getAll = (callback) => {
    const query = `
        SELECT 
            user_data.id,
            user_data.name,
            user_data.email,
            user_data.full_name,
            user_data.address,
            user_data.role_id,
            user_role.role as role_name,
            user_data.created_at
        FROM user_data
        LEFT JOIN user_role ON user_data.role_id = user_role.id
        ORDER BY user_data.id DESC
    `;
    db.query(query, callback);
};

//mesin pencari by id
const getById = (id, callback) => {
    const query = `
        SELECT 
            user_data.*,
            user_role.role as role_name
        FROM user_data
        LEFT JOIN user_role ON user_data.role_id = user_role.id
        WHERE user_data.id = ?
    `;
    db.query(query, [id], callback);
};

//get by email buat lpgin
const getByEmail = (email, callback) => {
    const query = "SELECT * FROM user_data WHERE email = ?";
    db.query(query, [email], callback);
};

// Membuat user baru dengan password yang di-hash
const create = (data, callback) => {
    // Cek apakah semua data lengkap
    const { name, email, password, full_name, address, role_id } = data;

    if (!name || !email || !password) {
        return callback(new Error("Username, email, dan password wajib diisi"));
    }

    // Hash password supaya aman
    const hashedPass = bcrypt.hashSync(password, 10);

    const query = `
        INSERT INTO user_data (name, email, password, full_name, address, role_id)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(query, [name, email, hashedPass, full_name || null, address || null, role_id || 3], callback);
};

//updat 
const update = (id, data, callback) => {
    const { name, email, password, full_name, address, role_id } = data;

    // Jika password diisi, hash password baru
    // Jika tidak diisi, jangan update password
    if (password && password.length > 0) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        const query = `
            UPDATE user_data 
            SET name = ?, email = ?, password = ?, full_name = ?, address = ?, role_id = ?
            WHERE id = ?
        `;
        db.query(query, [name, email, hashedPassword, full_name, address, role_id, id], callback);
    } else {
        // Update tanpa password
        const query = `
            UPDATE user_data 
            SET name = ?, email = ?, full_name = ?, address = ?, role_id = ?
            WHERE id = ?
        `;
        db.query(query, [name, email, full_name, address, role_id, id], callback);
    }
};

//hapus user
const deleteById = (id, callback) => {
    const query = "DELETE FROM user_data WHERE id = ?";
    db.query(query, [id], callback);
};

//verif pass
const verifyPassword = (plainPassword, hashedPassword) => {
    return bcrypt.compareSync(plainPassword, hashedPassword);
};

module.exports = {
    getAll,
    getById,
    getByEmail,
    create,
    update,
    deleteById,
    verifyPassword
};