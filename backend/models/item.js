const db = require("../db");

const parseStockValue = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : 0;
};

const normalizeStockCounts = (data) => {
    const hasConditionCounts =
        data.stock_normal !== undefined ||
        data.stock_ok !== undefined ||
        data.stock_not_good !== undefined ||
        data.stock_broken !== undefined;

    let stock_normal = parseStockValue(data.stock_normal);
    let stock_ok = parseStockValue(data.stock_ok);
    let stock_not_good = parseStockValue(data.stock_not_good);
    let stock_broken = parseStockValue(data.stock_broken);
    const totalValue = parseStockValue(data.total);
    const availableValue = parseStockValue(data.available);

    if (!hasConditionCounts) {
        if (data.item_condition === 'broken') {
            stock_normal = 0;
            stock_ok = 0;
            stock_not_good = 0;
            stock_broken = totalValue;
        } else {
            stock_normal = availableValue;
            stock_ok = 0;
            stock_not_good = 0;
            stock_broken = Math.max(0, totalValue - availableValue);
        }
    }

    const available = stock_normal + stock_ok + stock_not_good;
    const total = totalValue || available + stock_broken;

    return {
        stock_normal,
        stock_ok,
        stock_not_good,
        stock_broken,
        available,
        total,
    };
};

//tampilkan data kabeh ae wiss 
const getAll = (callback) => {
    const query = `
        SELECT 
            items.*,
            categories.categories,
            COALESCE(queue_stats.requested_not_approved, 0) AS requested_not_approved,
            COALESCE(borrowed_stats.borrowed_approved, 0) AS borrowed_approved
        FROM items
        LEFT JOIN categories ON items.categories_id = categories.id
        LEFT JOIN (
            SELECT
                id_items,
                SUM(CASE WHEN status IN ('pending', 'queued') THEN item_count ELSE 0 END) AS requested_not_approved
            FROM borrow_data
            GROUP BY id_items
        ) AS queue_stats ON queue_stats.id_items = items.id
        LEFT JOIN (
            SELECT
                id_items,
                SUM(
                    CASE
                        WHEN status IN ('taken', 'waiting for return', 'approved') THEN item_count
                        ELSE 0
                    END
                ) AS borrowed_approved
            FROM borrow_data
            GROUP BY id_items
        ) AS borrowed_stats ON borrowed_stats.id_items = items.id
        ORDER BY items.item_name ASC
    `;
    db.query(query, callback);
};

//tampilkan data berdasarkan ID
const getById = (id, callback) => {
    const query = `
        SELECT 
            items.*,
            categories.categories
        FROM items
        LEFT JOIN categories ON items.categories_id = categories.id
        WHERE items.id = ?
    `;
    db.query(query, [id], callback);
};

//data yang iso disilih tok
const getAvailable = (callback) => {
    const query = `
        SELECT 
            items.*,
            categories.categories
        FROM items
        LEFT JOIN categories 
            ON items.categories_id = categories.id
        WHERE items.available > 0
        ORDER BY items.item_name ASC
    `;
    db.query(query, callback);
};

//nggae data
const create = (data, callback) => {
    const { item_name, description, categories_id, item_condition } = data;
    const stock = normalizeStockCounts(data);

    if (!item_name || !stock.total || !categories_id) {
        return callback(new Error("isi semua kolom yang wajib diisi"));
    }

    const query = `
        INSERT INTO items (
            item_name,
            description,
            total,
            available,
            categories_id,
            item_condition,
            stock_normal,
            stock_ok,
            stock_not_good,
            stock_broken
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        query,
        [
            item_name,
            description || null,
            stock.total,
            stock.available,
            categories_id,
            item_condition || 'normal',
            stock.stock_normal,
            stock.stock_ok,
            stock.stock_not_good,
            stock.stock_broken,
        ],
        callback
    );
};

//update data fwgygsfwgygguekgeuAHAHUGFWEFGAUFGWEUOFGEWOAFGU ngoding muemet pak tulung
const update = (id, data, callback) => {
    const {
        item_name,
        description,
        categories_id,
        item_condition,
    } = data;
    const stock = normalizeStockCounts(data);

    const query = `
        UPDATE items 
        SET 
            item_name = ?,
            description = ?,
            total = ?,
            available = ?,
            categories_id = ?,
            item_condition = ?,
            stock_normal = ?,
            stock_ok = ?,
            stock_not_good = ?,
            stock_broken = ?
        WHERE id = ?
    `;

    const params = [
        item_name,
        description,
        stock.total,
        stock.available,
        categories_id,
        item_condition,
        stock.stock_normal,
        stock.stock_ok,
        stock.stock_not_good,
        stock.stock_broken,
        id
    ];

    db.query(query, params, callback);
};

const conditionField = (condition) => {
    if (condition === 'ok') return 'stock_ok';
    if (condition === 'not good') return 'stock_not_good';
    if (condition === 'broken') return 'stock_broken';
    return 'stock_normal';
};

const updateCondition = (id, item_condition, callback) => {
    const query = `
        UPDATE items
        SET item_condition = ?
        WHERE id = ?
    `;
    db.query(query, [item_condition, id], callback);
};

//hapus items
const deleteById = (id, callback) => {
    const query = "DELETE FROM items WHERE id = ?";
    db.query(query, [id], callback);
};

// Mengurangi/menambah item_count tersedia saat peminjaman/pengembalian
const updateJumlahTersedia = (id, item_count, operation, item_condition = 'normal', callback) => {
    const count = Number(item_count) || 0;
    const field = conditionField(item_condition);

    if (operation === 'kurang') {
        return callback(new Error('updateJumlahTersedia does not support decrement by condition; use borrow reservation logic instead'));
    } else if (operation === 'tambah') {
        if (item_condition === 'broken') {
            const query = `
                UPDATE items
                SET stock_broken = stock_broken + ?
                WHERE id = ?
            `;
            db.query(query, [count, id], callback);
        } else {
            const query = `
                UPDATE items
                SET available = available + ?,
                    ${field} = ${field} + ?
                WHERE id = ?
            `;
            db.query(query, [count, count, id], callback);
        }
    } else {
        callback(new Error('Unknown operation'));
    }
};

module.exports = {
    getAll,
    getById,
    getAvailable,
    create,
    update,
    deleteById,
    updateCondition,
    updateJumlahTersedia
};
