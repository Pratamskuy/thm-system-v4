const activityLog = require('../models/activityLog')

const getAll = (req, res) => {
    activityLog.getAll((err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Gagal mengambil log aktivitas",
                error: err.message
            });
        }
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil log aktivitas",
            data: results
        });
    });
};

// Export fungsi
module.exports = {
    getAll
};
