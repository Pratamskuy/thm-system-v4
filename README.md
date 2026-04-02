*Versi 2 menambahkan fitur batch borrow (multi-item) dengan kuantitas per item.*
# THM System v2

Sistem manajemen peminjaman alat (Tool & Hardware Management) berbasis full-stack JavaScript dengan fitur autentikasi, manajemen item, alur peminjaman-pengembalian, dan kontrol akses berbasis peran.

## Ringkasan Proyek

THM System v2 dirancang untuk mendukung proses operasional peminjaman alat secara terstruktur untuk tiga jenis pengguna utama:

- Admin: akses penuh (user, kategori, item, peminjaman, pengembalian, log).
- Petugas: mengelola alur peminjaman/pengembalian.
- Peminjam: mengajukan peminjaman dan pengembalian item.

Versi 2 menambahkan kemampuan batch borrow (mengajukan beberapa item sekaligus, kuantitas per item) melalui Cart dan halaman peminjaman.

---

## Arsitektur

### 1) Backend

- Runtime: Node.js
- Framework: Express
- Database: MySQL
- Autentikasi: JWT
- Upload file: Multer

Backend berjalan default di port `3000` dan mengekspose semua endpoint pada prefix `/api`.

### 2) Frontend

- Framework: React
- Build tool: Vite
- Routing: react-router-dom
- State auth global: Context API

Frontend mengonsumsi API backend melalui service terpusat di `src/services/api.js`.
Frontend berjalan default di port `5173` (Vite). Proxy `/api` ke `http://localhost:3000` tersedia di `vite.config.js`.

---

## Fitur Utama

### 1. Autentikasi dan Otorisasi

- Login/register pengguna.
- Penyimpanan token JWT di localStorage.
- Verifikasi token untuk route yang dilindungi.
- Role-based access control (Admin/Petugas/Peminjam).

### 2. Dashboard Dinamis per Role

- Statistik item total dan tersedia.
- Statistik peminjaman pending/aktif untuk admin/petugas.
- Statistik peminjaman pribadi untuk peminjam.
- Ringkasan transaksi terbaru.

### 3. Manajemen Item

- Lihat daftar item.
- CRUD item (admin).
- Tracking stok (total, available, dan status peminjaman per item).
- Available berkurang saat request dibuat (pending) dan dikembalikan saat return, reject, cancel, atau expire.
- Item yang stoknya belum cukup masuk antrean (queued) dan diproses FIFO saat stok tersedia.
- Kondisi item (normal, ok, not good, broken).

### 4. Manajemen Kategori

- CRUD kategori (admin).
- Pengelompokan item agar lebih rapi.

### 5. Manajemen User

- Lihat daftar user (admin).
- Update data user dan role.
- Hapus user.

### 6. Peminjaman (Borrow)

- Peminjam membuat pengajuan peminjaman single atau batch dari Cart.
- Maksimal 20 item per permintaan.
- Request batch menyimpan status agregat (submitted, queued, processing, approved, partially_approved, completed, rejected, cancelled).
- Admin/petugas melakukan approve/reject per item atau approve batch.
- Peminjam dapat membatalkan item berstatus pending/queued.
- Saat request dibuat, stok available di-reserve untuk item pending; item yang tidak cukup stok masuk antrean (queued).
- Endpoint mendukung header `Idempotency-Key` untuk mencegah double submit.

### 7. Pengembalian (Return)

- Peminjam dapat request return per item atau per batch.
- Admin/petugas konfirmasi pengembalian.
- Sistem mengembalikan stok item secara otomatis setelah return dikonfirmasi dan memproses antrean queued.
- Perhitungan keterlambatan/denda pada alur pengembalian.

### 8. Log Aktivitas

- Aktivitas penting dicatat untuk audit (khusus admin).

---

## Struktur Direktori

```bash
thmSYS_v2/
|- backend/
|  |- controllers/
|  |- middleware/
|  |- models/
|  |- routes/
|  |- db.js
|  |- index.js
|  `- package.json
|- frontend/
|  |- src/
|  |  |- components/
|  |  |- context/
|  |  |- pages/
|  |  |- services/
|  |  |- App.jsx
|  |  `- main.jsx
|  `- package.json
`- docs/
   |- PROJECT_SUMMARY.md
   |- ERD.drawio
   `- FLOWCHART THMs.drawio
```

---

## Daftar Endpoint API (Ringkas)

### Auth
- `POST /api/login`
- `POST /api/register`
- `GET /api/profile`

### Users (Admin)
- `GET /api/users`
- `GET /api/users/:id`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`

### Kategori
- `GET /api/kategori`
- `GET /api/kategori/:id`
- `POST /api/kategori`
- `PUT /api/kategori/:id`
- `DELETE /api/kategori/:id`

### Item
- `GET /api/alat/tersedia`
- `GET /api/alat`
- `GET /api/alat/:id`
- `POST /api/alat`
- `PUT /api/alat/:id`
- `DELETE /api/alat/:id`

### Peminjaman
- `GET /api/peminjaman/my`
- `GET /api/peminjaman/requests`
- `GET /api/peminjaman/batches`
- `GET /api/peminjaman/pending`
- `GET /api/peminjaman/active`
- `GET /api/peminjaman/return-requests`
- `GET /api/peminjaman/expire-pending`
- `GET /api/peminjaman`
- `GET /api/peminjaman/:id`
- `POST /api/peminjaman`
- `PUT /api/peminjaman/request/:requestId/approve`
- `PUT /api/peminjaman/request/:requestId/return`
- `PUT /api/peminjaman/:id/approve`
- `PUT /api/peminjaman/:id/reject`
- `PUT /api/peminjaman/:id/cancel`
- `PUT /api/peminjaman/:id/return`
- `DELETE /api/peminjaman/:id`

### Pengembalian
- `GET /api/pengembalian`
- `GET /api/pengembalian/:id`
- `POST /api/pengembalian`
- `PUT /api/pengembalian/:id/confirm`
- `DELETE /api/pengembalian/:id`

### Log
- `GET /api/log-aktivitas`

---

## Alur Utama Proses Bisnis

1. User login ke sistem.
2. Peminjam memilih item, menambahkan ke Cart, lalu submit batch peminjaman.
3. Sistem membuat request batch, reserve stok untuk item yang cukup (pending) dan menandai item lain sebagai queued.
4. Admin/petugas meninjau request dan approve/reject per item atau approve batch.
5. Item yang disetujui berubah menjadi `taken` dan tercatat sebagai Dipinjam di manajemen item.
6. Peminjam mengajukan return per item atau per batch saat item selesai dipakai.
7. Admin/petugas mengonfirmasi return, stok kembali, dan antrean queued diproses.
8. Status batch disinkronkan otomatis (approved/partially_approved/completed/rejected/cancelled).

---

## Cara Menjalankan Proyek

## Backend

```bash
cd backend
npm install
node index.js
```

## Frontend

```bash
cd frontend
npm install
npm run thm
```

Default API frontend mengarah ke: `http://localhost:3000/api`

---

## Catatan

- Pastikan MySQL aktif sebelum menjalankan backend.
- Konfigurasi database ada di `backend/db.js` (default `db_peminjaman`, user `root`, password kosong).
- Sistem memiliki inisialisasi database/tabel otomatis pada startup backend.
- Pending lebih dari 24 jam akan di-expire otomatis; interval job dapat diatur via `EXPIRE_PENDING_INTERVAL_MINUTES` (default 15 menit).
- `POST /api/peminjaman` mendukung header `Idempotency-Key` untuk mencegah submit ganda.
- CORS backend sudah disiapkan untuk environment localhost frontend.

---

## Rencana Pengembangan Lanjutan

- Penambahan test otomatis (unit/integration).
- Search/filter lanjutan di semua modul.
- Export laporan (PDF/Excel).
- Notifikasi email/WhatsApp untuk status transaksi.
- Peningkatan observability (structured log + monitoring).

## notes

1. Note: For Gmail, you'll need to:

   Enable 2-factor authentication
   Generate an "App Password" in Google Account settings
   Use the app password (not your regular password) in EMAIL_PASS
   How It Works
   When items are returned and stock becomes available, the system automatically:

   Moves queued borrow requests to "pending" status
   Sends an email notification to the user with details about their item
   The email includes the user's name, item name, and new status.

   Both features are now active across your entire website! The dark mode toggle is in the navbar, and email notifications will be sent automatically when borrow statuses change from queued to pending.



VERSION 4:
UPDATING:
Perubahan:

item.js
getAll disortir berdasarkan item_condition
getAvailable sekarang hanya menampilkan item tersedia dan tidak broken
ditambahkan updateCondition untuk mengubah kondisi item

pinjam.js
peminjaman akan ditolak jika item statusnya broken

ControllerReturn.js
konfirmasi/pembuatan pengembalian sekarang menyimpan item_condition
jika kondisi broken, stok tidak dikembalikan ke available
kondisi item diperbarui di tabel items

item.jsx
mode peminjaman mengambil /alat/tersedia untuk menyembunyikan item broken
daftar item disortir berdasarkan kondisi

api.js
returnAPI.confirm menerima payload { item_condition, notes }

swalService.js
ditambahkan dialog konfirmasi pengembalian dengan dropdown kondisi + catatan

borrow.jsx
tombol konfirmasi return sekarang memunculkan popup status
batch confirm juga dapat mengirim status yang dipilih
Kalau kamu mau, saya bisa lanjut tambahkan tampilan badge berbeda untuk setiap kondisi di halaman item/admin.