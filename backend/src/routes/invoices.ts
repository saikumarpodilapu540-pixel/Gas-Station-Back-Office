import { Router } from 'express';
import { createHash } from 'crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { actorOf, emitStore, endpoint, keyOf } from '../utils/http';
import { accessStore, fail, manager, operate, ownerFor } from '../services/operations';
import { approveInvoice, extractInvoice, manualPurchaseSchema, postPurchase, purchaseSchema, voidPurchase } from '../services/invoices';
import { aiConfigured } from '../services/aiProvider';
const router = Router(); router.use(requireAuth);
const metadata = { id: true, ownerId: true, storeId: true, filename: true, mimeType: true, status: true, extraction: true, reviewDraft: true, error: true, createdAt: true, updatedAt: true,
  purchases: { include: { lines: true, vendor: true }, orderBy: { createdAt: 'desc' } } } as const;
async function accessible(req: any, id: string) {
  const doc = await prisma.invoiceDocument.findUnique({ where: { id }, select: metadata });
  if (!doc || doc.ownerId !== await ownerFor(prisma, actorOf(req))) return fail('Invoice not found.',404);
  await accessStore(prisma, actorOf(req), doc.storeId); return doc;
}
router.get('/capabilities', (_req, res) => res.json({ extractionAvailable: aiConfigured(), maxFileBytes: 6 * 1024 * 1024, formats: ['application/pdf','image/png','image/jpeg'] }));
router.get('/', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId); await accessStore(prisma, actorOf(req), storeId);
  res.json(await prisma.invoiceDocument.findMany({ where: { storeId }, select: metadata, orderBy: { createdAt: 'desc' }, take: 100 }));
}));
router.get('/purchases', endpoint(async (req, res) => {
  const storeId = z.string().uuid().parse(req.query.storeId); await accessStore(prisma, actorOf(req), storeId);
  res.json(await prisma.purchase.findMany({ where: { storeId }, include: { lines: true, vendor: true }, orderBy: { date: 'desc' }, take: 100 }));
}));
router.post('/', endpoint(async (req, res) => {
  manager(actorOf(req));
  const data = z.object({ storeId: z.string().uuid(), filename: z.string().trim().min(1).max(150), fileBase64: z.string().max(9 * 1024 * 1024) }).parse(req.body);
  await accessStore(prisma, actorOf(req), data.storeId); const ownerId = await ownerFor(prisma, actorOf(req));
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data.fileBase64)) fail('Invalid file encoding.');
  const bytes = Buffer.from(data.fileBase64, 'base64');
  if (bytes.length === 0 || bytes.length > 6 * 1024 * 1024) fail('Upload a file up to 6 MB.');
  const mimeType = bytes.subarray(0,5).toString() === '%PDF-' ? 'application/pdf' : bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' : null;
  if (!mimeType) fail('Upload a PDF, PNG, or JPEG invoice.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const existing = await prisma.invoiceDocument.findUnique({ where: { ownerId_sha256: { ownerId, sha256 } }, select: metadata });
  if (existing) {
    if (existing.storeId !== data.storeId) fail('This file is already registered for another store. Select that store to review it.',409);
    return res.json({ ...existing, duplicate: true, extractionPerformed: false });
  }
  let document;
  try { document = await prisma.invoiceDocument.create({ data: { ownerId, storeId: data.storeId, filename: data.filename.replace(/[^a-zA-Z0-9._ -]/g,'_'), mimeType: mimeType!, sha256, bytes, uploadedById: actorOf(req).id }, select: metadata }); } catch (error: any) {
    if (error.code !== 'P2002') throw error;
    const repeated = await prisma.invoiceDocument.findUniqueOrThrow({ where: { ownerId_sha256: { ownerId, sha256 } }, select: metadata });
    if (repeated.storeId !== data.storeId) fail('This file is already registered for another store.',409);
    return res.json({ ...repeated, duplicate: true, extractionPerformed: false });
  }
  res.status(201).json({ ...document, duplicate: false, extractionPerformed: false });
}));
router.post('/manual', endpoint(async (req, res) => {
  const data = manualPurchaseSchema.parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'manual-purchase', data }, (tx, op) =>
    postPurchase(tx, op, data.storeId, { ...data, invoiceNumber: data.invoiceNumber || `MANUAL-${op.id}` }, { noReceiptReason: data.noReceiptReason }));
  emitStore(req, result.storeId); res.status(201).json(result);
}));
router.post('/purchases/:id/void', endpoint(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'void-purchase', id, reason }, (tx, op) => voidPurchase(tx, op, id, reason));
  emitStore(req, result.storeId); res.json(result);
}));
router.get('/:id', endpoint(async (req, res) => res.json(await accessible(req, String(req.params.id)))));
router.get('/:id/file', endpoint(async (req, res) => {
  const doc = await accessible(req, String(req.params.id));
  const original = await prisma.invoiceDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { bytes: true } });
  res.setHeader('Content-Type', doc.mimeType); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Content-Disposition',`attachment; filename="${doc.filename}"`); res.send(Buffer.from(original.bytes));
}));
router.post('/:id/extract', endpoint(async (req, res) => {
  manager(actorOf(req)); const doc = await accessible(req, String(req.params.id));
  if (!aiConfigured()) fail('Configure OPENAI_API_KEY and OPENAI_MODEL on the backend to extract invoices. Manual entry is available.',503);
  if (doc.status === 'POSTED') fail('This invoice is already posted.',409);
  const runAt = new Date();
  const claim = await prisma.invoiceDocument.updateMany({ where: { id: doc.id, status: { not: 'POSTED' }, OR: [{ status: { not: 'PROCESSING' } }, { updatedAt: { lt: new Date(Date.now()-120000) } }] }, data: { status: 'PROCESSING', error: null, updatedAt: runAt } });
  if (!claim.count) fail('Extraction is already in progress.',409);
  try {
    const original = await prisma.invoiceDocument.findUniqueOrThrow({ where: { id: doc.id } });
    const extraction = await extractInvoice(original);
    await prisma.invoiceDocument.updateMany({ where: { id: doc.id, status: 'PROCESSING', updatedAt: runAt }, data: { status: 'REVIEW', extraction, error: null } });
  } catch (error: any) {
    await prisma.invoiceDocument.updateMany({ where: { id: doc.id, status: 'PROCESSING', updatedAt: runAt }, data: { status: 'FAILED', error: error.message } }); throw error;
  }
  res.json(await accessible(req, doc.id));
}));
router.put('/:id/draft', endpoint(async (req, res) => {
  manager(actorOf(req)); const doc = await accessible(req, String(req.params.id));
  const expectedUpdatedAt = z.iso.datetime().parse(req.body.expectedUpdatedAt);
  const draft = z.record(z.string(), z.unknown()).parse(req.body.draft);
  if (JSON.stringify(draft).length > 100000) fail('Invoice draft is too large.');
  const changed = await prisma.invoiceDocument.updateMany({ where: { id: doc.id, updatedAt: new Date(expectedUpdatedAt), status: { notIn: ['POSTED','PROCESSING'] } }, data: { reviewDraft: draft as any, status: 'REVIEW' } });
  if (!changed.count) fail('This draft changed, is processing, or was posted. Reopen it before saving.',409); res.json(await accessible(req, doc.id));
}));
router.post('/:id/approve', endpoint(async (req, res) => {
  const id = String(req.params.id), data = purchaseSchema.parse(req.body);
  const result = await operate(actorOf(req), keyOf(req), { action: 'approve-invoice', id, data }, (tx, op) => approveInvoice(tx, op, id, data));
  emitStore(req, result.storeId); res.status(201).json(result);
}));
router.get('/:id/mappings', endpoint(async (req, res) => {
  await accessible(req, String(req.params.id)); const ownerId = await ownerFor(prisma, actorOf(req));
  const vendor = await prisma.vendor.findFirst({ where: { id: String(req.query.vendorId), ownerId } }); if (!vendor) fail('Vendor not found.',404);
  res.json(await prisma.supplierItemMapping.findMany({ where: { vendorId: vendor!.id } }));
}));
export default router;
