# Phase 4 upgrade and verification

This patch is incremental on top of `sai-2026.09.0` (Phase 3). It does not reset or delete application data.

## Apply it to the Phase 3 checkout

```bash
git switch sai-2026.09.0
git pull --ff-only origin sai-2026.09.0
phase4_patch=~/Downloads/gas-station-phase4.patch
git apply --check "$phase4_patch"
git apply "$phase4_patch"
cd backend
npm run db:generate
npm run db:migrate
```

If `git apply` says a file already exists, the patch was already applied or the file was left by an earlier attempt. Check first:

```bash
git status --short
git diff --stat
```

Do not run `git clean -f` after a failed apply; it can remove the new migration and test files. If the changes are already present, skip the apply and run the migration/checks.

For an existing Phase 3 database, take a backup before the migration:

```bash
pg_dump --format=custom --file=fuelops-before-phase4.dump fuelops_erp
cd backend
npm run db:migrate:status
npm run db:migrate
```

The migration adds purchase discounts and source metadata, a no-receipt reason, safe void status, charge-expense linkage, and receipt-line valuation snapshots. It also replaces Phase 3 single-use document/invoice uniqueness with active-record partial indexes so a corrected receipt can be reposted while its voided history remains.

## Start and use it

```bash
cd backend
cp .env.example .env   # only if .env does not exist
npm run db:seed         # safe for the existing seed data
npm run dev

# another terminal
cd frontend
npm run dev
```

Open `http://localhost:5173`, select a store, and sign in. In **Purchases & Invoice Inbox**:

- Upload the supplier PDF/photo. Uploading stores the original file only; it never receives stock.
- Select **Extract invoice** only after configuring the backend key. Review every product, package, quantity, cost, discount, freight/other charge, and total.
- If the same file is uploaded again, the screen opens the existing record and explicitly says that it did not extract or receive stock again.
- For a delivery without paperwork, select **Purchase without receipt**, enter a reference if available, explain why there is no receipt, map each package, and post it.
- In purchase history, **Correct mistaken purchase** is owner-only. It reverses only an untouched receipt, keeps the audit/history, and blocks when stock has been sold, moved, counted, reserved, or otherwise changed.

In **Inventory**, use **Manage stock & packages** to define `Each`, six-pack, case, or another package size. Receiving a case increases individual-unit stock by `quantity × unitsPerPackage`. Use **Open / repack packages** when a case is opened for shelf restocking; the individual-unit total stays unchanged. Sales now require an available package and location, and pack sales require that package's own retail price.

## Optional invoice extraction

Set both values in `backend/.env`:

```dotenv
OPENAI_API_KEY="your-platform-api-key"
OPENAI_MODEL="your-enabled-vision-model"
```

Keep the key only on the backend. A ChatGPT web subscription/session key is not an API credential; create or use a key from the OpenAI API platform with billing/model access. The app sends the PDF or image to the Responses API as an input file/image and asks for strict JSON. Extraction is an untrusted draft and approval is always a human-reviewed database transaction.

If no key is configured, manual invoice review and purchases without receipts still work. The page displays this state instead of pretending extraction succeeded.

## Checks

```bash
cd backend
npm run typecheck
npm test -- --runInBand

cd ../frontend
npm run lint
npm run build
npm test
```

The backend integration suite is opt-in because it needs a disposable PostgreSQL server:

```bash
# TEST_DATABASE_URL must point to an empty local PostgreSQL server
cd backend
TEST_DATABASE_URL='postgresql://fuelops:fuelopspassword@127.0.0.1:5432/postgres' npm run test:integration
```

That suite creates and drops a temporary schema and covers duplicate uploads, saved-review recovery, discount totals, manual receipts, owner correction, pack conversion, reserved stock, stale permissions, assistant intent, closed days, and expense reversal. Never point it at a production schema.

If a write appears to disappear after refresh, inspect the browser Network tab: a successful `201`/`200` followed by a fresh `GET` proves the record was read back from PostgreSQL. A `4xx` response explains validation, totals, closed-day, or access failure; the backend terminal also logs the endpoint and errors.
