const db = require("../db");
const DENDA_PER_HARI = 5000;
//get all(aku wis mumet)
const getAll = (callback) => {
    const query = `
        SELECT 
            return_data.*,
            borrow_data.id_user,
            borrow_data.borrow_date,
            borrow_data.return_date_expected,
            user_data.full_name as nama_peminjam,
            items.item_name,
            officer.full_name as nama_officer
        FROM return_data
        LEFT JOIN borrow_data ON return_data.borrow_id = borrow_data.id
        LEFT JOIN user_data ON borrow_data.id_user = user_data.id
        LEFT JOIN items ON borrow_data.id_items = items.id
        LEFT JOIN user_data as officer ON return_data.officer_id = officer.id
        ORDER BY return_data.id DESC
    `;
    db.query(query, callback);
};

//get by id
const getById = (id, callback) => {
    const query = `
        SELECT 
            return_data.*,
            borrow_data.id_user,
            borrow_data.borrow_date,
            borrow_data.return_date_expected,
            user_data.full_name as nama_peminjam,
            items.item_name
        FROM return_data
        LEFT JOIN borrow_data ON return_data.borrow_id = borrow_data.id
        LEFT JOIN user_data ON borrow_data.id_user = user_data.id
        LEFT JOIN items ON borrow_data.id_items = items.id
        WHERE return_data.id = ?
    `;
    db.query(query, [id], callback);
};

//hitung denda
const hitungDenda = (returnDateExpected, returnDate, kondisi = 'normal') => {
    const harusKembali = new Date(returnDateExpected);
    const kembali = new Date(returnDate);

    // Hitung selisih hari
    let selisih = Math.floor((kembali - harusKembali) / (1000 * 60 * 60 * 24));

    // Denda keterlambatan
    let dendaTerlambat = 0;
    if (selisih > 0) {
        dendaTerlambat = selisih * DENDA_PER_HARI;
    } else {
        // Jika tidak terlambat
        selisih = 0;
    }

    // Denda kerusakan
    let dendaKerusakan = 0;
    if (kondisi === 'not good') {
        dendaKerusakan = 20000; //denda rusak ringan
    } else if (kondisi === 'broken') {
        dendaKerusakan = 50000; //denda rusak berat
    }

    return {
        late: selisih > 0 ? selisih : 0,
        denda: dendaTerlambat + dendaKerusakan,
        rincian: {
            denda_terlambat: dendaTerlambat,
            denda_kerusakan: dendaKerusakan
        }
    };
};

//record return_data
const create = (data, callback) => {
    const { borrow_id, officer_id, item_condition, notes, return_date_expected } = data;

    if (!borrow_id) {
        return callback(new Error("ID peminjaman wajib diisi"));
    }

    // Hitung denda berdasarkan tanggal dan kondisi
    const tanggalKembali = new Date();
    const { late, denda } = hitungDenda(return_date_expected, tanggalKembali, item_condition);

    const query = `
        INSERT INTO return_data (borrow_id, officer_id, item_condition, late, fine, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.query(query, [borrow_id, officer_id, item_condition || 'baik', late, fine, notes], callback);
};

//delete by id
const deleteById = (id, callback) => {
    const query = "DELETE FROM return_data WHERE id = ?";
    db.query(query, [id], callback);
};

module.exports = {
    getAll,
    getById,
    hitungDenda,
    create,
    deleteById,
};
