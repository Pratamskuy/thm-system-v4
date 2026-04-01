const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const db = require("./db");
const routes = require("./routes/routes");
const borrow = require("./models/pinjam");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: ["http://localhost:5173"],                                                                                                                                                                                                                                                                                                                                                                                                                         //rereswrrygrgtytgfdedvhy5bej7in etmm ahaaaaaahhhgggghh
    credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

app.use("/api", routes);

app.get("/", (req, res) => {
    res.json({
        message: "Selamat datang di API Peminjaman Alat",
        version: "1.0.0",
        endpoints: {
            users: "/api/users",
            kategori: "/api/kategori",
            alat: "/api/alat",
            peminjaman: "/api/peminjaman",
            pengembalian: "/api/pengembalian"
        }
    });
});

db.initDatabase();

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`Server berjalan di http://localhost:${PORT}`);
    console.log(`========================================\n`);

    const intervalMinutes = Number(process.env.EXPIRE_PENDING_INTERVAL_MINUTES || 15);
    const safeMinutes = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 15;
    const intervalMs = safeMinutes * 60 * 1000;

    const runExpirePending = () => {
        borrow.expirePendingBorrows((err, result) => {
            if (err) {
                console.error('Gagal menjalankan expire pending:', err.message);
                return;
            }

            const expiredCount = result?.expiredCount || 0;
            if (expiredCount > 0) {
                // ${expiredCount} peminjaman pending kedaluwarsa otomatis
            }
        });
    };

    runExpirePending();
    setInterval(runExpirePending, intervalMs);
});
