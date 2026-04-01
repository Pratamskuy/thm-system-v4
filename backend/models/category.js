const db = require("../db");
//get sak kabehane categories
const getAll = (callback) => {
    const query = "SELECT * FROM categories ORDER BY id DESC";
    db.query(query, callback);
};

//get kabeh, tapi by id
const getById = (callback) => {
    const query = "SELECT * FROM categories WHERE id = ?";
    db.query(query,[id], callback);
};

//nggae categories anyar
const create = (data, callback) => {
    const {categories, description } = data;

    if (!categories) {
        return callback(new Error("isi semua kolom yang wajib diisi"));
    }
    const query = "INSERT INTO categories (categories, description) VALUES (?, ?)";
    db.query(query, [categories, description || null], callback);
};

//update categories
const update = (id, data, callback) => {
    const {categories, description } = data;
    const query = "UPDATE categories SET categories = ?, description = ? WHERE id = ?";
    db.query(query, [categories, description, id], callback);
};

//delet kategroi
const deleteById = (id, callback) => {
    const query = "DELETE FROM categories WHERE id = ?";
    db.query(query, [id], callback);
};

module.exports = {
    getAll,
    getById,
    create,
    update,
    deleteById
};
