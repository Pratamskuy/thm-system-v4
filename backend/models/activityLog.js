const db = require("../db");
//alat pemanggil log ajaib
const getAll = (callback) => {
    const query = `
        SELECT 
            log.*,
            user_data.full_name as full_name,
            user_data.email as email
        FROM log
        LEFT JOIN user_data ON log.id_user = user_data.id
        ORDER BY log.created_at DESC
        LIMIT 100
    `;
    db.query(query, callback);
};

//alat pencatat log ajaib
const create = (data, callback) => {
    const { id_user, action, table_affected, id_data, notes } = data;

    const query = `
        INSERT INTO log (id_user, action, table_affected, id_data, notes)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(query, [id_user, action, table_affected, id_data, notes], callback);
};

//alat penghapus log lama ajaib
const deleteOldLogs = (callback) => {
    const query = "DELETE FROM log WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)";
    db.query(query, callback);
};

module.exports = {
    getAll,
    create,
    deleteOldLogs
};