# FuelOps Pro: Gas Station Back Office

FuelOps Pro is a full-stack back-office application for gas stations and convenience stores. Phase 1 provides a database-backed path from authentication through inventory, sales, and financial reporting.

## Phase 1 features

- JWT authentication with password hashing
- Store-based authorization for owners, managers, and staff
- PostgreSQL inventory with stock and reorder levels
- Transactional sales that prevent overselling and deduct inventory atomically
- Dashboard and reports backed by persisted sales and inventory
- Revenue, cost of goods sold, expenses, and net-profit calculation
- Socket.IO events that refresh open store screens after sales or inventory changes
- Repeatable seed data for a local owner, store, and starter products

## Technology

- Frontend: React 19, Vite 8, React Router, Tailwind CSS, Axios, Recharts
- Backend: Node.js, Express 5, TypeScript, Prisma, Zod, JWT, Socket.IO
- Database: PostgreSQL 15
- Tests: Jest and TypeScript compiler checks

This is an npm project; it does not use Maven.

## Prerequisites

- Node.js 20.19+ (or 22.12+)
- npm
- Docker Desktop, or a local PostgreSQL 15 installation

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
npm run db:push
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

## Current scope

Inventory, convenience-store sales, authentication, store selection, dashboards, and reports are included in Phase 1. Fuel workflows, employees, vendors, audit persistence, billing, and production POS-provider integrations remain later-phase work; their existing UI should be treated as preview functionality.
