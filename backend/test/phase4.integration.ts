import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../src/db';
import invoiceRoutes from '../src/routes/invoices';
import inventoryRoutes from '../src/routes/inventory';
import saleRoutes from '../src/routes/sales';
import assistantRoutes from '../src/routes/assistant';
import { errors } from '../src/utils/http';
import * as invoices from '../src/services/invoices';

jest.setTimeout(60000);
const app = express(); app.use(express.json({ limit: '10mb' }));
app.use('/invoices', invoiceRoutes); app.use('/inventory', inventoryRoutes); app.use('/sales', saleRoutes); app.use('/assistant', assistantRoutes); app.use(errors);
let token: string, otherToken: string, staffToken: string, owner: string, store: string, secondStore: string, vendor: string, staff: string;
const date = '2026-09-06';
const key = () => randomUUID();
const post = (url: string, body: any, requestKey = key(), auth = token) => request(app).post(url).set('Authorization', `Bearer ${auth}`).set('Idempotency-Key', requestKey).send(body);
const get = (url: string, auth = token) => request(app).get(url).set('Authorization', `Bearer ${auth}`);
async function item(name = 'Water', units = 24, stock = 0) {
  const product = await prisma.product.create({ data: { ownerId: owner, sku: key(), name, category: 'Beverages', packages: { create: [{ name: 'Each', unitsPerPackage: 1 }, { name: `Case ${units}`, unitsPerPackage: units }] } }, include: { packages: true } });
  const each = product.packages.find(p => p.unitsPerPackage === 1)!;
  const pack = product.packages.find(p => p.unitsPerPackage === units)!;
  const record = await prisma.inventory.create({ data: { storeId: store, catalogId: product.id, sku: product.sku, productName: name, category: 'Beverages', costPrice: 0.5, sellingPrice: 1.49, taxRate: 0.08, stockQuantity: stock,
    balances: { create: { packageId: each.id, location: 'BACKROOM', quantity: stock } } } });
  return { ...record, each, pack };
}
const line = (product: Awaited<ReturnType<typeof item>>, quantity = 2, unitCost = 12) => ({ inventoryId: product.id, packageId: product.pack.id, location: 'BACKROOM', supplierDescription: product.productName, quantity, unitCost });
const purchase = (lines: any[], fields: any = {}) => ({ vendorId: vendor, invoiceNumber: key(), date, totalCost: lines.reduce((sum,l) => sum + l.quantity*l.unitCost, 0), discount: 0, extraCharges: 0, chargesTreatment: 'CAPITALIZE', reviewed: true, lines, ...fields });
const manual = (lines: any[], fields: any = {}) => ({ ...purchase(lines, fields), storeId: store, noReceiptReason: 'Delivery arrived without paperwork' });
const upload = async (tag: string = key(), filename = 'invoice.pdf') => {
  const result = await post('/invoices', { storeId: store, filename, fileBase64: Buffer.from(`%PDF-1.4\n${tag}\n%%EOF`).toString('base64') });
  expect(result.status).toBe(201); return result.body;
};
beforeAll(async () => {
  if (!process.env.FUELOPS_TEST_SCHEMA?.startsWith('fuelops_test_')) throw new Error('Run through npm run test:integration.');
  const user = await prisma.user.create({ data: { name: 'Owner', email: `${key()}@example.test`, password: 'test-only', role: 'OWNER' } }); owner = user.id;
  token = jwt.sign({ id: owner, role: 'OWNER' }, process.env.JWT_SECRET!);
  const other = await prisma.user.create({ data: { name: 'Other', email: `${key()}@example.test`, password: 'test-only', role: 'OWNER' } });
  otherToken = jwt.sign({ id: other.id, role: 'OWNER' }, process.env.JWT_SECRET!);
  store = (await prisma.store.create({ data: { ownerId: owner, name: 'A', location: 'Test', timezone: 'America/Chicago' } })).id;
  secondStore = (await prisma.store.create({ data: { ownerId: owner, name: 'B', location: 'Test', timezone: 'America/Chicago' } })).id;
  vendor = (await prisma.vendor.create({ data: { ownerId: owner, name: 'Supplier', category: 'Grocery' } })).id;
  staff = (await prisma.user.create({ data: { name: 'Staff', email: `${key()}@example.test`, password: 'test-only', role: 'STAFF', storeId: store } })).id;
  staffToken = jwt.sign({ id: staff, role: 'OWNER', storeId: store }, process.env.JWT_SECRET!); // Deliberately stale/incorrect claims.
});
afterAll(async () => { await prisma.$disconnect(); });

test('renamed duplicate upload returns the posted record; retry cannot double stock', async () => {
  const product = await item(); const tag = key(); const doc = await upload(tag);
  const payload = purchase([line(product)]), operation = key();
  const approved = await post(`/invoices/${doc.id}/approve`, payload, operation); expect(approved.status).toBe(201);
  const retried = await post(`/invoices/${doc.id}/approve`, payload, operation); expect(retried.body.id).toBe(approved.body.id);
  const duplicate = await post('/invoices', { storeId: store, filename: 'renamed.pdf', fileBase64: Buffer.from(`%PDF-1.4\n${tag}\n%%EOF`).toString('base64') });
  expect(duplicate.status).toBe(200); expect(duplicate.body).toMatchObject({ id: doc.id, filename: 'invoice.pdf', duplicate: true, extractionPerformed: false, status: 'POSTED' });
  expect(duplicate.body.reviewDraft.lines).toEqual(payload.lines);
  expect(duplicate.body.purchases[0].id).toBe(approved.body.id);
  expect((await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(48);
});
test('same filename with different bytes creates a fresh document, but duplicate business number is blocked', async () => {
  const product = await item(); const first = await upload(), second = await upload();
  expect(first.id).not.toBe(second.id); expect(second.extraction).toBeNull(); expect(second.reviewDraft).toBeNull();
  const payload = purchase([line(product)]);
  expect((await post(`/invoices/${first.id}/approve`, payload)).status).toBe(201);
  const result = await post(`/invoices/${second.id}/approve`, { ...payload, invoiceNumber: ` ${payload.invoiceNumber.toUpperCase()} ` });
  expect(result.status).toBe(409); expect(result.body.error).toContain('already posted');
  expect((await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(48);
});
test('draft saving survives reload and rejects another session overwriting it', async () => {
  const product = await item(), doc = await upload(); const draft = purchase([line(product)]);
  const save = (draft: any, expectedUpdatedAt: string) => request(app).put(`/invoices/${doc.id}/draft`).set('Authorization', `Bearer ${token}`).send({ draft, expectedUpdatedAt });
  const saved = await save(draft, doc.updatedAt); expect(saved.status).toBe(200);
  const stale = await save({ ...draft, totalCost: 999 }, doc.updatedAt); expect(stale.status).toBe(409);
  expect((await get(`/invoices/${doc.id}`)).body.reviewDraft).toEqual(draft);
  expect((await post(`/invoices/${doc.id}/approve`, { ...draft, expectedUpdatedAt: doc.updatedAt })).status).toBe(409);
  expect((await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(0);
});
test('extraction uses the current file, preserves saved review, and never receives stock', async () => {
  const product = await item(), doc = await upload('current-document');
  const manualDraft = purchase([line(product)]);
  await request(app).put(`/invoices/${doc.id}/draft`).set('Authorization', `Bearer ${token}`).send({ draft: manualDraft, expectedUpdatedAt: doc.updatedAt });
  process.env.OPENAI_API_KEY = 'test-placeholder-never-sent'; process.env.OPENAI_MODEL = 'test-model';
  const extraction = { vendorName: 'Supplier', invoiceNumber: 'NEW-42', date, subtotal: 24, discount: 0, extraCharges: 0, totalCost: 24, warnings: [], items: [{ description: 'Current water', sku: product.sku, unitLabel: 'Case 24', unitsPerPackage: 24, quantity: 2, unitCost: 12, lineCost: 24, uncertainty: null }] };
  const spy = jest.spyOn(invoices, 'extractInvoice').mockResolvedValue(extraction);
  try {
    const response = await post(`/invoices/${doc.id}/extract`, {}); expect(response.status).toBe(200);
    expect(Buffer.from(spy.mock.calls[0][0].bytes).toString()).toContain('current-document');
    expect(response.body.extraction.invoiceNumber).toBe('NEW-42'); expect(response.body.reviewDraft).toEqual(manualDraft);
    expect(response.body.status).toBe('REVIEW');
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(0);
  } finally { spy.mockRestore(); delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MODEL; }
});
test('sample invoice receives 7 package types with discount and freight totaling $474.44', async () => {
  const spec = [['Water',24,10,15.60],['Soda',6,12,4.32],['Beer',24,4,25.20],['Chips',1,48,1.05],['Coffee',1,40,0.55],['Energy',12,3,14.40],['Sandwich',1,12,3.10]] as const;
  const lines = [];
  for (const [name, units, quantity, cost] of spec) { const product = await item(name, units === 1 ? 2 : units); lines.push({ ...line(product, quantity, cost), packageId: units === 1 ? product.each.id : product.pack.id }); }
  const doc = await upload();
  const result = await post(`/invoices/${doc.id}/approve`, purchase(lines, { invoiceNumber: 'LSB-2026-0906-1042', totalCost: 474.44, discount: 5, extraCharges: 18 }));
  expect(result.status).toBe(201); expect(Number(result.body.subtotal)).toBe(461.44); expect(Number(result.body.totalCost)).toBe(474.44);
  let valuation = 0;
  for (const [index,l] of lines.entries()) {
    const current = await prisma.inventory.findUniqueOrThrow({ where: { id: l.inventoryId } });
    expect(current.stockQuantity).toBe(spec[index][1] * spec[index][2]); valuation += Number(current.costPrice) * current.stockQuantity;
  }
  expect(valuation).toBeCloseTo(474.44, 2);
});
test('bad totals, foreign package, foreign store and missing receipt reason roll back entirely', async () => {
  const product = await item(), foreign = await item();
  for (const body of [manual([line(product)], { totalCost: 999 }), { ...manual([line(product)]), noReceiptReason: '' }, manual([{ ...line(product), packageId: foreign.pack.id }]), { ...manual([line(product)]), storeId: secondStore }]) {
    const result = await post('/invoices/manual', body); expect(result.status).toBe(400);
  }
  expect((await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(0);
  expect(await prisma.purchaseLine.count({ where: { inventoryId: product.id } })).toBe(0);
});
test('purchase without receipt generates reference, records reason and is idempotent', async () => {
  const product = await item(); const payload = manual([line(product)], { invoiceNumber: '' }), operation = key();
  const first = await post('/invoices/manual', payload, operation); expect(first.status).toBe(201);
  expect(first.body.source).toBe('MANUAL'); expect(first.body.documentId).toBeNull(); expect(first.body.invoiceNumber).toMatch(/^MANUAL-/);
  expect(first.body.noReceiptReason).toContain('without paperwork');
  expect((await post('/invoices/manual', payload, operation)).body.id).toBe(first.body.id);
  expect((await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(48);
});
test('owner can void an untouched receipt and correct it without losing history or prior cost', async () => {
  const product = await item('Opening water', 24, 10), doc = await upload();
  const body = purchase([line(product)]); const approved = await post(`/invoices/${doc.id}/approve`, body);
  expect(approved.status).toBe(201);
  const result = await post(`/invoices/purchases/${approved.body.id}/void`, { reason: 'Incorrect package quantity entered' });
  expect(result.status).toBe(200);
  const current = await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } });
  expect(current.stockQuantity).toBe(10); expect(Number(current.costPrice)).toBe(0.5);
  expect((await get(`/invoices/${doc.id}`)).body.reviewDraft).toBeNull();
  expect((await post(`/invoices/${doc.id}/approve`, { ...body, lines: [line(product, 1)], totalCost: 12 })).status).toBe(201);
  const records = await prisma.purchase.findMany({ where: { documentId: doc.id } });
  expect(records.map(p => p.status).sort()).toEqual(['POSTED','VOIDED']);
  expect(await prisma.stockMovement.count({ where: { inventoryId: product.id, kind: 'PURCHASE_VOID' } })).toBe(1);
});
test('pack opening preserves units and blocks void after movement; terminal sells actual shelf package', async () => {
  const product = await item(); const receipt = await post('/invoices/manual', manual([line(product)])); expect(receipt.status).toBe(201);
  const current = await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } });
  const opened = await post(`/inventory/${product.id}/stock`, { kind: 'CONVERT', packageId: product.pack.id, location: 'BACKROOM', quantity: 1, toPackageId: product.each.id, toLocation: 'SHELF', reason: 'Restock cooler', expectedVersion: current.version });
  expect(opened.status).toBe(200); expect(opened.body.stockQuantity).toBe(48);
  expect(opened.body.balances.find((b: any) => b.packageId === product.each.id && b.location === 'SHELF').quantity).toBe(24);
  expect((await post(`/invoices/purchases/${receipt.body.id}/void`, { reason: 'Incorrect invoice' })).status).toBe(409);
  const invalid = await post('/sales', { storeId: store, paymentType: 'CASH', items: [{ productId: product.id, packageId: key(), quantity: 1, location: 'SHELF' }] }); expect(invalid.status).toBe(400);
  const sold = await post('/sales', { storeId: store, paymentType: 'CASH', items: [{ productId: product.id, packageId: product.each.id, quantity: 2, location: 'SHELF' }] });
  expect(sold.status).toBe(201); expect(Number(sold.body.totalAmount)).toBe(3.22); expect(Number(sold.body.taxAmount)).toBe(0.24);
  expect((await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(46);
});
test('reserved stock cannot be consumed or voided', async () => {
  const product = await item(), received = await post('/invoices/manual', manual([line(product)]));
  await prisma.stockBalance.update({ where: { inventoryId_packageId_location: { inventoryId: product.id, packageId: product.pack.id, location: 'BACKROOM' } }, data: { reserved: 1 } });
  const result = await post(`/invoices/purchases/${received.body.id}/void`, { reason: 'Wrong receipt quantity' });
  expect(result.status).toBe(409);
  expect((await prisma.purchase.findUniqueOrThrow({ where: { id: received.body.id } })).status).toBe('POSTED');
  expect((await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(48);
});
test('owner boundaries and current staff permissions override stale token claims', async () => {
  const product = await item(), doc = await upload();
  expect((await get(`/invoices/${doc.id}`, otherToken)).status).toBe(404);
  expect((await get(`/invoices?storeId=${store}`, otherToken)).status).toBe(403);
  expect((await post('/invoices/manual', manual([line(product)]), key(), staffToken)).status).toBe(403);
  await prisma.user.update({ where: { id: staff }, data: { storeId: secondStore } });
  expect((await get(`/invoices?storeId=${store}`, staffToken)).status).toBe(403);
});

test('assistant reads invoices and interprets check stock as inventory, not checks', async () => {
  const product = await item('Orange soda', 6, 8);
  const reply = await post('/assistant/query', { storeId: store, message: `Check stock for SKU ${product.sku}` });
  expect(reply.status).toBe(200); expect(reply.body.intent).toBe('inventory'); expect(reply.body.answer).toContain('Orange soda');
  expect(reply.body.answer).toContain('8 available');
  const invoice = await post('/assistant/query', { storeId: store, message: 'Check invoice purchases' });
  expect(invoice.body.intent).toBe('purchases'); expect(invoice.body.answer).toContain('awaiting review');
  const mutation = await post('/assistant/query', { storeId: store, message: 'Receive 10 packs of water' });
  expect(mutation.body.intent).toBe('confirmation_required');
});
test('failed extraction retains the manual review and records a retryable error', async () => {
  const product = await item(), doc = await upload(); const draft = purchase([line(product)]);
  await request(app).put(`/invoices/${doc.id}/draft`).set('Authorization', `Bearer ${token}`).send({ draft, expectedUpdatedAt: doc.updatedAt });
  process.env.OPENAI_API_KEY = 'test-only-not-sent'; process.env.OPENAI_MODEL = 'test-model';
  const spy = jest.spyOn(invoices, 'extractInvoice').mockRejectedValue(new Error('Provider unavailable'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await post(`/invoices/${doc.id}/extract`, {})).status).toBe(500);
    const saved = (await get(`/invoices/${doc.id}`)).body;
    expect(saved.status).toBe('FAILED'); expect(saved.reviewDraft).toEqual(draft);
    expect(saved.error).toBe('Provider unavailable');
  } finally { spy.mockRestore(); log.mockRestore(); delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MODEL; }
});
test('closed days block purchase posting and reversal without changing stock', async () => {
  const product = await item(); const receipt = await post('/invoices/manual', manual([line(product)])); expect(receipt.status).toBe(201);
  const closing = await prisma.dailyClosing.create({ data: { storeId: store, date: new Date(`${date}T00:00:00Z`), status: 'CLOSED', totalSales: 0, totalExpenses: 0, netProfit: 0 } });
  try {
    expect((await post('/invoices/manual', manual([line(product)]))).status).toBe(409);
    expect((await post(`/invoices/purchases/${receipt.body.id}/void`, { reason: 'Wrong posted quantity' })).status).toBe(409);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(48);
  } finally { await prisma.dailyClosing.delete({ where: { id: closing.id } }); }
});
test('legacy Phase 3 receipts with intact movements can be corrected and expensed charges reverse atomically', async () => {
  const product = await item(), doc = await upload();
  const original = await post(`/invoices/${doc.id}/approve`, purchase([line(product)])); expect(original.status).toBe(201);
  await prisma.purchaseLine.updateMany({ where: { purchaseId: original.body.id }, data: { costBefore: null, versionAfter: null } });
  expect((await post(`/invoices/purchases/${original.body.id}/void`, { reason: 'Wrong original manual entry' })).status).toBe(200);
  const next = await post(`/invoices/${doc.id}/approve`, purchase([line(product)], { extraCharges: 2, totalCost: 26, chargesTreatment: 'EXPENSE' })); expect(next.status).toBe(201);
  expect(await prisma.expense.count({ where: { id: next.body.chargesExpenseId } })).toBe(1);
  expect((await post(`/invoices/purchases/${next.body.id}/void`, { reason: 'Cancel untouched delivery' })).status).toBe(200);
  expect(await prisma.expense.count({ where: { id: next.body.chargesExpenseId } })).toBe(0);
});
