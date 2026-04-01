const express = require('express');
const router = express.Router();

const userController = require('../controllers/ControllerUser');
const kategoriController = require('../controllers/ControllerCategories');
const itemController = require('../controllers/ControllerItem');
const borrowController = require('../controllers/ControllerBorrow');
const returningController = require('../controllers/ControllerReturn');
const activityLogController = require('../controllers/LogController');

const { verifyToken, isAdmin, isAdminOrPetugas } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.post('/login', userController.login);
router.post('/register', userController.register);

router.get('/profile', verifyToken, userController.getProfile);

router.get('/users', verifyToken, isAdmin, userController.getAll);
router.get('/users/:id', verifyToken, isAdmin, userController.getById);
router.put('/users/:id', verifyToken, isAdmin, userController.update);
router.delete('/users/:id', verifyToken, isAdmin, userController.deleteUser);

router.get('/kategori', verifyToken, kategoriController.getAll);
router.get('/kategori/:id', verifyToken, kategoriController.getById);
router.post('/kategori', verifyToken, isAdmin, kategoriController.create);
router.put('/kategori/:id', verifyToken, isAdmin, kategoriController.update);
router.delete('/kategori/:id', verifyToken, isAdmin, kategoriController.deleteCategories);

router.get('/alat/tersedia', verifyToken, itemController.getAvailable);
router.get('/alat', verifyToken, itemController.getAll);
router.get('/alat/:id', verifyToken, itemController.getById);
router.post('/alat', verifyToken, isAdmin, upload.single('gambar'), itemController.create);
router.put('/alat/:id', verifyToken, isAdmin, upload.single('gambar'), itemController.update);
router.delete('/alat/:id', verifyToken, isAdmin, itemController.deleteitem);

router.get('/peminjaman/my', verifyToken, borrowController.getMyborrow);
router.get('/peminjaman/pending', verifyToken, isAdminOrPetugas, borrowController.getPending);
router.get('/peminjaman/active', verifyToken, isAdminOrPetugas, borrowController.getActive);
router.get('/peminjaman/return-requests', verifyToken, isAdminOrPetugas, borrowController.getReturnRequests);
router.get('/peminjaman', verifyToken, isAdminOrPetugas, borrowController.getAll);
router.get('/peminjaman/requests', verifyToken, borrowController.getRequestsByUser);
router.get('/peminjaman/batches', verifyToken, isAdminOrPetugas, borrowController.getRequestBatches);
router.get('/peminjaman/expire-pending', verifyToken, isAdminOrPetugas, borrowController.expirePendingBorrows);
router.put('/peminjaman/request/:requestId/approve', verifyToken, isAdminOrPetugas, borrowController.approveBatch);
router.put('/peminjaman/request/:requestId/return', verifyToken, borrowController.requestReturnByRequest);
router.get('/peminjaman/:id', verifyToken, borrowController.getById);
router.post('/peminjaman', verifyToken, borrowController.create);
router.put('/peminjaman/:id/approve', verifyToken, isAdminOrPetugas, borrowController.approve);
router.put('/peminjaman/:id/reject', verifyToken, isAdminOrPetugas, borrowController.reject);
router.put('/peminjaman/:id/cancel', verifyToken, borrowController.cancel);
router.delete('/peminjaman/:id', verifyToken, isAdmin, borrowController.deleteborrow);
router.put('/peminjaman/:id/return', verifyToken, borrowController.requestReturn);

router.get('/pengembalian', verifyToken, isAdminOrPetugas, returningController.getAll);
router.put('/pengembalian/:id/confirm', verifyToken, isAdminOrPetugas, returningController.confirmReturn)
router.get('/pengembalian/:id', verifyToken, returningController.getById);
router.post('/pengembalian', verifyToken, isAdminOrPetugas, returningController.create);
router.delete('/pengembalian/:id', verifyToken, isAdmin, returningController.deletereturning_item);

router.get('/log-aktivitas', verifyToken, isAdmin, activityLogController.getAll);

module.exports = router;