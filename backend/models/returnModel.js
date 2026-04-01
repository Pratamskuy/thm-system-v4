const db = require('../db');

const findByBorrowId = (borrow_id, callback) => {
  const query = `SELECT * FROM return_data WHERE borrow_id = ?`;
  db.query(query, [borrow_id], callback);
};

const create = (data, callback) => {
  const { borrow_id } = data;

  const query = `
       INSERT INTO return_data (borrow_id)
    VALUES (?)
  `;

  db.query(query, [borrow_id], callback);
};

const confirm = (borrow_id, officer_id, item_condition, late, fine, notes, callback) => {
  const query = `
    UPDATE return_data
    SET officer_id = ?, return_date = NOW(), item_condition = ?, late = ?, fine = ?, notes = ?
    WHERE borrow_id = ?
  `;

  db.query(query, [officer_id, item_condition, late, fine, notes, borrow_id], callback);
};

module.exports = {
  findByBorrowId,
  create,
  confirm
};