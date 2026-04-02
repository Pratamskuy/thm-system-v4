const mysql = require('mysql2');

const DATABASE_NAME = 'db_peminjaman';

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: DATABASE_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

const runQueriesSequentially = (connection, queries, callback) => {
    let index = 0;

    const next = (err) => {
        if (err) {
            return callback(err);
        }

        if (index >= queries.length) {
            return callback(null);
        }

        const query = queries[index];
        index += 1;
        connection.query(query, next);
    };

    next();
};

const runTasksSequentially = (tasks, callback) => {
    let index = 0;

    const next = (err) => {
        if (err) {
            return callback(err);
        }

        if (index >= tasks.length) {
            return callback(null);
        }

        const task = tasks[index];
        index += 1;
        task(next);
    };

    next();
};

const ensureColumn = (connection, tableName, columnName, definition, callback) => {
    const checkQuery = `SHOW COLUMNS FROM ${tableName} LIKE ?`;
    connection.query(checkQuery, [columnName], (err, rows) => {
        if (err) {
            return callback(err);
        }

        if (rows.length > 0) {
            return callback(null);
        }

        const alterQuery = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`;
        connection.query(alterQuery, callback);
    });
};

const ensureEnumDefinition = (connection, tableName, columnName, enumValues, defaultValue, callback) => {
    const checkQuery = `SHOW COLUMNS FROM ${tableName} LIKE ?`;
    connection.query(checkQuery, [columnName], (err, rows) => {
        if (err) {
            return callback(err);
        }

        if (rows.length === 0) {
            return callback(new Error(`Kolom ${tableName}.${columnName} tidak ditemukan`));
        }

        const currentType = String(rows[0].Type || '');
        const currentDefault = String(rows[0].Default || '');
        const hasAllValues = enumValues.every((value) => currentType.includes(`'${value}'`));

        if (hasAllValues && currentDefault === defaultValue) {
            return callback(null);
        }

        const escapedValues = enumValues.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(', ');
        const alterQuery = `
            ALTER TABLE ${tableName}
            MODIFY COLUMN ${columnName} ENUM(${escapedValues}) DEFAULT '${defaultValue}'
        `;
        connection.query(alterQuery, callback);
    });
};

const ensureIndex = (connection, tableName, indexName, indexColumns, callback) => {
    const checkQuery = `SHOW INDEX FROM ${tableName} WHERE Key_name = ?`;
    connection.query(checkQuery, [indexName], (err, rows) => {
        if (err) {
            return callback(err);
        }

        if (rows.length > 0) {
            return callback(null);
        }

        const createIndexQuery = `ALTER TABLE ${tableName} ADD INDEX ${indexName} ${indexColumns}`;
        connection.query(createIndexQuery, callback);
    });
};

const insertDefaultRoles = (connection, callback) => {
    const checkRoles = `SELECT COUNT(*) as count FROM user_role`;
    connection.query(checkRoles, (err, results) => {
        if (err) {
            return callback(err);
        }

        if (results[0].count > 0) {
            return callback(null);
        }

        const insertRoles = `
            INSERT INTO user_role (id, role) VALUES
            (1, 'admin'),
            (2, 'petugas'),
            (3, 'peminjam')
        `;
        connection.query(insertRoles, callback);
    });
};

const migrateItemConditionStock = (connection, callback) => {
    const normalizeQuery = `
        UPDATE items
        SET stock_normal = available,
            stock_ok = 0,
            stock_not_good = 0,
            stock_broken = GREATEST(total - available, 0)
        WHERE stock_normal = 0
          AND stock_ok = 0
          AND stock_not_good = 0
          AND stock_broken = 0
          AND item_condition != 'broken'
    `;

    const brokenQuery = `
        UPDATE items
        SET stock_normal = 0,
            stock_ok = 0,
            stock_not_good = 0,
            stock_broken = total
        WHERE stock_normal = 0
          AND stock_ok = 0
          AND stock_not_good = 0
          AND stock_broken = 0
          AND item_condition = 'broken'
    `;

    connection.query(normalizeQuery, (err) => {
        if (err) {
            return callback(err);
        }
        connection.query(brokenQuery, callback);
    });
};

const createAllTables = (connection, callback) => {
    const createUserRoleTable = `CREATE TABLE IF NOT EXISTS user_role (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role VARCHAR(50) NOT NULL UNIQUE
    )`;

    const createUserDataTable = `CREATE TABLE IF NOT EXISTS user_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        address VARCHAR(255),
        role_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_id) REFERENCES user_role(id) ON DELETE SET NULL
    )`;

    const createCategoriesTable = `CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        categories VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    const createItemsTable = `CREATE TABLE IF NOT EXISTS items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        description TEXT,
        total INT NOT NULL DEFAULT 0,
        available INT NOT NULL DEFAULT 0,
        categories_id INT,
        item_condition ENUM('normal', 'ok', 'not good', 'broken') DEFAULT 'normal',
        stock_normal INT NOT NULL DEFAULT 0,
        stock_ok INT NOT NULL DEFAULT 0,
        stock_not_good INT NOT NULL DEFAULT 0,
        stock_broken INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categories_id) REFERENCES categories(id) ON DELETE SET NULL
    )`;

    const createBorrowRequestsTable = `CREATE TABLE IF NOT EXISTS borrow_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_user INT NOT NULL,
        status ENUM(
            'submitted',
            'queued',
            'processing',
            'approved',
            'partially_approved',
            'rejected',
            'cancelled',
            'completed'
        ) DEFAULT 'submitted',
        notes TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_borrow_requests_user_status (id_user, status),
        FOREIGN KEY (id_user) REFERENCES user_data(id) ON DELETE CASCADE
    )`;

    const createBorrowDataTable = `CREATE TABLE IF NOT EXISTS borrow_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NULL,
        id_user INT NOT NULL,
        id_items INT NOT NULL,
        item_count INT NOT NULL DEFAULT 1,
        borrow_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        return_date_expected DATETIME NOT NULL,
        status ENUM(
            'available',
            'approved',
            'rejected',
            'waiting for return',
            'pending',
            'queued',
            'taken',
            'cancelled'
        ) DEFAULT 'pending',
        item_condition ENUM('normal', 'ok', 'not good', 'broken') DEFAULT 'normal',
        id_officer_approval INT,
        approval_date DATETIME,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_borrow_data_item_queue (id_items, status, borrow_date, id),
        INDEX idx_borrow_data_request_status (request_id, status),
        FOREIGN KEY (request_id) REFERENCES borrow_requests(id) ON DELETE SET NULL,
        FOREIGN KEY (id_user) REFERENCES user_data(id),
        FOREIGN KEY (id_items) REFERENCES items(id),
        FOREIGN KEY (id_officer_approval) REFERENCES user_data(id) ON DELETE SET NULL
    )`;

    const createReturnDataTable = `CREATE TABLE IF NOT EXISTS return_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        borrow_id INT NOT NULL UNIQUE,
        officer_id INT,
        return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        item_condition ENUM('normal', 'ok', 'not good', 'broken') DEFAULT 'normal',
        late INT DEFAULT 0,
        fine DECIMAL(10, 2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (borrow_id) REFERENCES borrow_data(id),
        FOREIGN KEY (officer_id) REFERENCES user_data(id)
    )`;

    const createLogTable = `CREATE TABLE IF NOT EXISTS log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_user INT,
        action VARCHAR(255) NOT NULL,
        table_affected VARCHAR(100),
        id_data INT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_user) REFERENCES user_data(id) ON DELETE SET NULL
    )`;

    const createBorrowIdempotencyTable = `CREATE TABLE IF NOT EXISTS borrow_submit_idempotency (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_user INT NOT NULL,
        idempotency_key VARCHAR(128) NOT NULL,
        request_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_borrow_submit_idempotency (id_user, idempotency_key),
        FOREIGN KEY (id_user) REFERENCES user_data(id) ON DELETE CASCADE,
        FOREIGN KEY (request_id) REFERENCES borrow_requests(id) ON DELETE SET NULL
    )`;

    const tableQueries = [
        createUserRoleTable,
        createUserDataTable,
        createCategoriesTable,
        createItemsTable,
        createBorrowRequestsTable,
        createBorrowDataTable,
        createReturnDataTable,
        createLogTable,
        createBorrowIdempotencyTable,
    ];

    runQueriesSequentially(connection, tableQueries, (err) => {
        if (err) {
            return callback(err);
        }

        const migrationTasks = [
            (next) => ensureColumn(connection, 'borrow_data', 'request_id', 'INT NULL', next),
            (next) => ensureColumn(connection, 'borrow_data', 'item_condition', "ENUM('normal', 'ok', 'not good', 'broken') DEFAULT 'normal'", next),
            (next) =>
                ensureEnumDefinition(
                    connection,
                    'borrow_data',
                    'status',
                    [
                        'available',
                        'approved',
                        'rejected',
                        'waiting for return',
                        'pending',
                        'queued',
                        'taken',
                        'cancelled',
                    ],
                    'pending',
                    next
                ),
            (next) =>
                ensureEnumDefinition(
                    connection,
                    'borrow_requests',
                    'status',
                    [
                        'submitted',
                        'queued',
                        'processing',
                        'approved',
                        'partially_approved',
                        'rejected',
                        'cancelled',
                        'completed',
                    ],
                    'submitted',
                    next
                ),
            (next) => ensureIndex(connection, 'borrow_data', 'idx_borrow_data_item_queue', '(id_items, status, borrow_date, id)', next),
            (next) => ensureIndex(connection, 'borrow_data', 'idx_borrow_data_request_status', '(request_id, status)', next),
            (next) => ensureIndex(connection, 'borrow_requests', 'idx_borrow_requests_user_status', '(id_user, status)', next),
            (next) => ensureColumn(connection, 'items', 'stock_normal', 'INT NOT NULL DEFAULT 0', next),
            (next) => ensureColumn(connection, 'items', 'stock_ok', 'INT NOT NULL DEFAULT 0', next),
            (next) => ensureColumn(connection, 'items', 'stock_not_good', 'INT NOT NULL DEFAULT 0', next),
            (next) => ensureColumn(connection, 'items', 'stock_broken', 'INT NOT NULL DEFAULT 0', next),
            (next) => insertDefaultRoles(connection, next),
            (next) => migrateItemConditionStock(connection, next),
        ];

        runTasksSequentially(migrationTasks, callback);
    });
};

const initDatabase = () => {
    const tempConnection = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
    });

    tempConnection.connect((err) => {
        if (err) {
            console.error('Koneksi MySQL gagal:', err.message);
            return;
        }

        tempConnection.query(`CREATE DATABASE IF NOT EXISTS ${DATABASE_NAME}`, (createDbErr) => {
            if (createDbErr) {
                console.error('Gagal membuat database:', createDbErr.message);
                tempConnection.end();
                return;
            }

            tempConnection.query(`USE ${DATABASE_NAME}`, (useDbErr) => {
                if (useDbErr) {
                    console.error('Gagal memilih database:', useDbErr.message);
                    tempConnection.end();
                    return;
                }

                createAllTables(tempConnection, (tableErr) => {
                    if (tableErr) {
                        console.error('Gagal inisialisasi tabel:', tableErr.message);
                    } else {
                        // Database siap digunakan.
                    }

                    tempConnection.end();
                });
            });
        });
    });
};

module.exports = db;
module.exports.initDatabase = initDatabase;
