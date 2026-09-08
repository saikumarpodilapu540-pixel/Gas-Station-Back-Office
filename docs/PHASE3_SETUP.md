# Phase 3 setup and upgrade

Phase 3 expects PostgreSQL, not an embedded database. The application uses the database name `fuelops_erp`, the `fuelops` database user, Prisma migrations, and the API on port `5001`.

## 1. Create the local PostgreSQL database on macOS

With Homebrew PostgreSQL 16 already installed, start it and check that it is accepting connections:

```bash
brew services start postgresql@16
pg_isready -h localhost -p 5432
```

Create the application role and database. If either object already exists, the `DO`/`createdb` command can be skipped as appropriate:

```bash
psql -d postgres -c "CREATE ROLE fuelops LOGIN PASSWORD 'fuelopspassword';"
createdb -O fuelops fuelops_erp
```

If PostgreSQL is using a different port, use that port in `backend/.env`.

## 2. Configure and migrate a fresh database

From the repository root:

```bash
cd backend
cp .env.example .env
# Edit .env if your PostgreSQL username, password, port, or JWT secret differs.
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The two checked-in migrations create the Phase 2 schema and then add the Phase 3 catalog, package balances, movements, transfers, settlements, invoice documents, purchase lines, and constraints. The seed adds two stores and realistic examples such as loose water bottles, six-packs, 24-count cases, beer, soda, chips, coffee, energy drinks, and sandwiches. It is safe to run again: existing stock balances are preserved.

## 3. Upgrade a database already used by Phase 2

Make a backup first:

```bash
pg_dump --format=custom --file=fuelops-before-phase3.dump fuelops_erp
```

Confirm that the existing database is the Phase 2 schema and that `backend/.env` points to it. Then record the old schema as the baseline and deploy only the Phase 3 migration:

```bash
cd backend
npm run db:generate
npx prisma migrate resolve --applied 202609060001_phase2_baseline
npm run db:migrate
npm run db:seed
```

`migrate resolve` does not alter business tables; it prevents Prisma from trying to recreate tables that already exist. Only use it when this database was created from the Phase 2 branch. If the database is disposable, create a new `fuelops_erp` database and follow the fresh-database path instead.

After the migration, verify the new structures:

```bash
psql fuelops_erp -c "select count(*) as products from products;"
psql fuelops_erp -c "select count(*) as packages from product_packages;"
psql fuelops_erp -c "select count(*) as movements from stock_movements;"
```

The migration converts every existing inventory row into a catalog product with an `Each` package and an opening movement. Before relying on pack counts, define the real case or six-pack quantity for that product and perform a physical count by package and location.

## 4. Start the frontend

In another terminal:

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:5173`. The seeded login is `admin@fuelops.com` / `admin123`; change it before sharing the app.

## 5. Optional invoice extraction

Invoice upload and manual review work without an AI key. To enable draft extraction, set both values in `backend/.env`:

```dotenv
OPENAI_API_KEY="..."
OPENAI_MODEL="..."
```

The original file is stored first, extraction is only a review draft, and no stock is changed until an owner or manager maps the lines, verifies the total, and approves the receipt.

## 6. Checks before reporting an issue

```bash
curl http://localhost:5001/api/health
cd backend && npm test -- --runInBand
cd ../frontend && npm run lint && npm run build
```

If a vendor, inventory edit, transfer, or invoice disappears after refresh, inspect the browser Network tab for the request status and the backend terminal for its `/api/...` line. A successful `201`/`200` followed by a fresh `GET` proves the write reached PostgreSQL; a `4xx` response contains the validation or authorization reason.
