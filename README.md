# FuelOps Pro: Gas Station Back Office

FuelOps Pro is a full-stack back-office application for gas stations and convenience stores. Phase 1 provides the database-backed authentication, inventory, sales, and reporting foundation. Phase 2 completes the day-to-day management workflows on top of that same PostgreSQL/Prisma backend.

## Phase 1 features

- JWT authentication with password hashing
- Store-based authorization for owners, managers, and staff
- PostgreSQL inventory with stock and reorder levels
- Transactional sales that prevent overselling and deduct inventory atomically
- Dashboard and reports backed by persisted sales and inventory
- Revenue, cost of goods sold, expenses, and net-profit calculation
- Socket.IO events that refresh open store screens after sales or inventory changes
- Repeatable seed data for a local owner, store, and starter products

## Phase 2 features

- Inventory view, edit, delete, search, category filters, stock filters, physical counts, and audit history
- Persistent vendor CRUD with purchase-history protection
- Persistent employee CRUD with hashed passwords, role restrictions, shifts, and store authorization
- Persistent audit-log API used by inventory, vendors, employees, and manual audit actions
- Seeded fuel tanks, tank audits, delivery capacity checks, and protected fuel updates
- Report date ranges (today, seven days, thirty days, and all time) with persisted COGS and expense calculations
- POS connection status, disconnect, correctly shaped CSV imports, store authorization, and oversell protection

## Phase 3 features

- A shared product catalog with store-level inventory, package definitions, barcodes, backroom/shelf balances, reservations, and an append-only stock movement ledger
- Safe pack/case/loose-unit conversions, physical counts, idempotent adjustments, and stock version checks to prevent lost updates
- Owner-to-owner store transfers with cost-price receipts, dispatch/receive/return/damage states, PDF receipts with QR references, and check settlement tracking
- Supplier invoice inbox that stores the original PDF/photo, supports reviewed extraction when an OpenAI Responses API key is configured, and posts approved landed cost into inventory
- Time-zone-aware reporting, daily close protections, expense corrections, and a grounded assistant that reads current database values for stock, packs, fuel, profit, transfers, and checks
- Seeded example products across grocery, beverages, beer, hot food, prepared food, and energy drinks in two stores; rerunning the seed preserves existing balances

## Technology

- Frontend: React 19, Vite 8, React Router, Tailwind CSS, Axios, Recharts
- Backend: Node.js, Express 5, TypeScript, Prisma, Zod, JWT, Socket.IO
- Database: PostgreSQL 15
- Tests: Jest and TypeScript compiler checks

This is an npm project; it does not use Maven.

## Prerequisites

- Node.js 20.19+ (or 22.12+)
- npm
- Docker Desktop, or a local PostgreSQL 15+ installation (PostgreSQL 16 is supported)

## Start PostgreSQL

The included Docker Compose file starts PostgreSQL with the values already used by `backend/.env.example`.

```bash
cd backend
docker compose up -d
```

If PostgreSQL is installed directly on your computer, create a database named `fuelops_erp` and update `DATABASE_URL` in `backend/.env`.

## Configure and start the backend

```bash
cd backend
cp .env.example .env
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The API runs at `http://localhost:5001`. Verify it at `http://localhost:5001/api/health`.

## Configure and start the frontend

Open another terminal:

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

## Local login

- Email: `admin@fuelops.com`
- Password: `admin123`

Run `npm run db:seed` again whenever you need to restore this account and the starter inventory. Change the demo password and `JWT_SECRET` before deploying.

## Verification commands

```bash
cd backend
npm test -- --runInBand
npx tsc --noEmit

cd ../frontend
npm run lint
npm run build
```

## Database changes after Phase 2

Phase 3 introduces migration files. A fresh database should use `npm run db:migrate`; an existing database that was created by the Phase 2 `db:push` flow must first be backed up and marked as having the baseline migration applied. The exact commands, including the Homebrew PostgreSQL setup, are in [`docs/PHASE3_SETUP.md`](docs/PHASE3_SETUP.md).

Do not run `db:push` against a production database. Keep `db:push` for a disposable local database only; deploy the checked-in migrations everywhere else.

## Current scope

Authentication, store selection, inventory, convenience-store sales, fuel operations, daily close, reports, employees, vendors, audit logs, and the local POS/CSV workflow are now database-backed. Billing plan buttons are still presentation-only until a payment provider and subscription API are selected. The POS API/SFTP screens provide the local contract and import path; production provider credentials and webhook/SFTP infrastructure still need to be supplied by the deployment.
