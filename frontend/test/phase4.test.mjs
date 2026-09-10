import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceDraft, uploadMessage } from '../src/utils/invoiceDraft.mjs';
import { quoteCart } from '../src/utils/saleQuote.mjs';
const inventory = [{ id: 'water', sku: 'WATER-001', name: 'Water', productName: 'Water', price: 1.49, taxRate: 0.08,
  catalog: { packages: [{ id: 'each', name: 'Each', unitsPerPackage: 1 }, { id: 'case', name: 'Case 24', unitsPerPackage: 24 }] },
  balances: [{ id: 'balance', packageId: 'each', location: 'SHELF', quantity: 10, reserved: 2, package: { name: 'Each', unitsPerPackage: 1 } }] }];
test('unknown or empty invoice descriptions never select the first product', () => {
  for (const description of ['', 'Wrong stock']) {
    const draft = buildInvoiceDraft({ extraction: { items: [{ description, unitsPerPackage: 1 }] } }, inventory, [], '2026-09-06');
    assert.equal(draft.lines[0].inventoryId, ''); assert.equal(draft.lines[0].packageId, '');
    assert.equal(draft.lines[0].quantity, ''); assert.equal(draft.lines[0].unitCost, '');
  }
});
test('a saved manual mapping survives reopening even when an AI draft exists', () => {
  const reviewed = { invoiceNumber: 'MANUAL', lines: [{ inventoryId: 'chosen-by-owner', quantity: 10, unitCost: 15 }] };
  const draft = buildInvoiceDraft({ reviewDraft: reviewed, extraction: { invoiceNumber: 'AI', items: [] } }, inventory, [], '2026-09-06');
  assert.deepEqual(draft.lines, reviewed.lines); assert.equal(draft.invoiceNumber, reviewed.invoiceNumber); assert.equal(draft.discount, 0); draft.lines[0].quantity = 2; assert.equal(reviewed.lines[0].quantity, 10);
});
test('exact SKU can match, but missing or ambiguous packaging stays unselected', () => {
  const document = { extraction: { items: [{ sku: 'water-001', description: 'Printed water', unitsPerPackage: null }] } };
  assert.equal(buildInvoiceDraft(document, inventory, [], '2026-09-06').lines[0].packageId, '');
  document.extraction.items[0].unitsPerPackage = 24;
  assert.equal(buildInvoiceDraft(document, inventory, [], '2026-09-06').lines[0].packageId, 'case');
  assert.equal(buildInvoiceDraft(document, [{ ...inventory[0], catalog: { packages: [...inventory[0].catalog.packages, { id: 'othercase', unitsPerPackage: 24 }] } }], [], '2026-09-06').lines[0].packageId, '');
});
test('duplicate upload messages describe existing posted data and never claim extraction', () => {
  assert.match(uploadMessage({ duplicate: true, status: 'POSTED' }), /already posted/);
  assert.match(uploadMessage({ duplicate: true, status: 'POSTED' }), /extraction was not run/);
  assert.match(uploadMessage({ duplicate: false }), /Choose Extract invoice/);
});
test('sales quote uses actual package location, reservations, repeated lines, and stored tax', () => {
  const line = { id: 'water', packageId: 'each', location: 'SHELF', qty: 2 };
  assert.deepEqual(quoteCart([line], inventory), { subtotal: 2.98, tax: 0.24, total: 3.22 });
  assert.ok(quoteCart([{ ...line, location: 'BACKROOM' }], inventory).error);
  assert.ok(quoteCart([{ ...line, qty: 5 }, { ...line, qty: 4 }], inventory).error);
  assert.ok(quoteCart([{ ...line, packageId: 'case' }], inventory).error);
});
test('undefined pack retail prices block sales instead of using individual prices', () => {
  const product = { ...inventory[0], balances: [{ packageId: 'case', location: 'BACKROOM', quantity: 2, reserved: 0, sellingPrice: null, package: { name: 'Case 24', unitsPerPackage: 24 } }] };
  const line = { id: 'water', packageId: 'case', location: 'BACKROOM', qty: 1 };
  assert.ok(quoteCart([line], [product]).error);
  product.balances[0].sellingPrice = '20.00';
  assert.deepEqual(quoteCart([line], [product]), { subtotal: 20, tax: 1.6, total: 21.6 });
});
