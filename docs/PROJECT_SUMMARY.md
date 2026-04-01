# THM System v2 — Project Summary

A full-stack **Tool & Hardware Management** system for managing item borrowing and returns, with role-based access for **Admin**, **Petugas**, and **Peminjam**.

---

## 1) Tech Stack

### Backend
- **Node.js** runtime
- **Express** API framework
- **MySQL** database via `mysql2`
- **JWT** authentication via `jsonwebtoken`
- **Password hashing** via `bcryptjs`
- **File upload** via `multer`
- **CORS / env config** via `cors`, `dotenv`

### Frontend
- **React** (Vite app)
- **react-router-dom** for routing
- **Context API** for auth state
- **Fetch API** (centralized service layer) for backend communication

---

## 2) High-Level Architecture

- Frontend runs on Vite dev server (typically `localhost:5173`).
- Backend runs on Express (typically `localhost:3000`).
- Frontend calls backend endpoints under `/api`.
- Backend validates JWT, applies role middleware, then accesses MySQL models.

---

**Built with ❤️ for your THM System**
## 3) Core Domain Models (Database Tables)

- `user_role` → role definitions (`admin`, `petugas`, `peminjam`)
- `user_data` → account/profile data
- `categories` → item categories
- `items` → inventory, total stock, available stock, condition
- `borrow_data` → borrow requests, status flow, approval metadata
- `return_data` → return confirmations, condition, late/fine fields
- `log` → activity/audit log

---

## 4) Main Features

- Authentication: login/register/profile with JWT.
- Role-based authorization:
  - **Admin**: full access (users, categories, items, borrows, returns, logs)
  - **Petugas**: operational flow (approve/reject/confirm borrow-return)
  - **Peminjam**: submit borrow, request return, see own records
- Item and category management.
- Borrow workflow (pending → approved/taken or rejected).
- Return workflow with stock restoration.
- **Multi-borrow (v2):** UI supports submitting multiple borrow items in one process.

---

## 5) API Surface (Summary)

- **Auth**: `/api/login`, `/api/register`, `/api/profile`
- **Users**: `/api/users/*` (admin)
- **Categories**: `/api/kategori/*`
- **Items**: `/api/alat/*`
- **Borrows**: `/api/peminjaman/*`
- **Returns**: `/api/pengembalian/*`
- **Logs**: `/api/log-aktivitas` (admin)

---

## 6) Frontend Structure (Practical)

- `src/App.jsx` → route map + protected route wrappers
- `src/context/AuthContext.jsx` → login/logout/profile + role helpers
- `src/services/api.js` → centralized API helper + token header handling
- `src/pages/*` → feature pages (dashboard, items, borrows, categories, users)
- `src/components/navbar.jsx` → role-aware navigation

---

## 7) Backend Structure (Practical)

- `backend/index.js` → app setup, middleware, route mounting
- `backend/routes/routes.js` → endpoint definitions + auth guards
- `backend/controllers/*` → request handlers/business logic
- `backend/models/*` → SQL queries/data access
- `backend/middleware/*` → JWT verification, role checks, upload handling
- `backend/db.js` → DB connection + initial table creation

---

## 8) Typical Request Flow

1. User logs in and receives JWT.
2. Frontend stores token in `localStorage`.
3. Subsequent API calls include `Authorization: Bearer <token>`.
4. Backend verifies token, checks role, executes controller/model query.
5. Response is rendered in React UI.

---

## 9) Current Strengths

- Clear role separation and permissions.
- Centralized API handling on frontend.
- Structured backend (routes/controllers/models).
- Inventory-aware borrow/return lifecycle.
- Ready base for reporting, notifications, and analytics extensions.

---

## 10) Suggested Next Improvements

- Add migration/seed tooling for DB lifecycle.
- Add automated tests (API + component level).
- Remove debug logs for production builds.
- Standardize naming and language across code/comments.
- Add OpenAPI/Swagger docs for endpoint discoverability.