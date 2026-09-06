import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { getAccessibleStores } from '../utils/storeAccess';
import { writeAuditLog } from '../utils/audit';

const router = Router();
router.use(requireAuth);

const vendorSchema = z.object({
  name: z.string().trim().min(2, 'Vendor name must contain at least 2 characters'),
  category: z.string().trim().min(1, 'Category is required'),
  contactInfo: z.string().trim().max(255).optional().nullable()
});

const getAuditStoreId = async (userId: string, requestedStoreId?: string) => {
  const stores = await getAccessibleStores(userId);
  if (requestedStoreId && stores.some((store) => store.id === requestedStoreId)) return requestedStoreId;
  return stores[0]?.id;
};

const toVendorView = (vendor: any) => {
  const lastPurchase = vendor.purchases?.[0];
  return {
    id: vendor.id,
    name: vendor.name,
    category: vendor.category,
    contactInfo: vendor.contactInfo,
    lastOrder: lastPurchase?.date ? new Date(lastPurchase.date).toISOString().split('T')[0] : 'N/A',
    status: 'Active',
    rating: vendor.purchases?.length ? 'Established' : 'New',
    purchaseCount: vendor._count?.purchases ?? vendor.purchases?.length ?? 0,
    createdAt: vendor.createdAt,
    updatedAt: vendor.updatedAt
  };
};

const purchaseInclude = (storeIds: string[]) => ({
  where: { storeId: { in: storeIds } },
  orderBy: { date: 'desc' as const },
  take: 1
});

const vendorInclude = (storeIds: string[]) => ({
  purchases: purchaseInclude(storeIds),
  _count: { select: { purchases: true } }
});

router.get('/', async (req, res) => {
  try {
    const stores = await getAccessibleStores((req as any).user.id);
    const storeIds = stores.map((store) => store.id);
    const vendors = await prisma.vendor.findMany({
      orderBy: { name: 'asc' },
      include: vendorInclude(storeIds)
    });
    res.json(vendors.map(toVendorView));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const stores = await getAccessibleStores((req as any).user.id);
    const vendorId = String(req.params.id);
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: vendorInclude(stores.map((store) => store.id))
    });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json(toVendorView(vendor));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

router.post('/', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const data = vendorSchema.parse({
      ...req.body,
      contactInfo: req.body.contactInfo || null
    });
    const vendor = await prisma.vendor.create({ data });
    const storeId = await getAuditStoreId((req as any).user.id, req.body.storeId);
    if (storeId) {
      await writeAuditLog(prisma, {
        storeId,
        userId: (req as any).user.id,
        action: `Added vendor: ${vendor.name}`,
        module: 'Vendors',
        oldValue: null,
        newValue: vendor.category
      });
    }
    res.status(201).json(toVendorView({ ...vendor, purchases: [] }));
  } catch (error: any) {
    const message = error?.name === 'ZodError'
      ? error.issues.map((issue: any) => issue.message).join(', ')
      : 'Failed to create vendor';
    res.status(400).json({ error: message });
  }
});

router.put('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const data = vendorSchema.partial().parse({
      ...req.body,
      ...(req.body.contactInfo !== undefined ? { contactInfo: req.body.contactInfo || null } : {})
    });
    const vendorId = String(req.params.id);
    const existing = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });
    const vendor = await prisma.vendor.update({ where: { id: existing.id }, data });
    const storeId = await getAuditStoreId((req as any).user.id, req.body.storeId);
    if (storeId) {
      await writeAuditLog(prisma, {
        storeId,
        userId: (req as any).user.id,
        action: `Updated vendor: ${vendor.name}`,
        module: 'Vendors',
        oldValue: `${existing.category}${existing.contactInfo ? `, ${existing.contactInfo}` : ''}`,
        newValue: `${vendor.category}${vendor.contactInfo ? `, ${vendor.contactInfo}` : ''}`
      });
    }
    const stores = await getAccessibleStores((req as any).user.id);
    const updated = await prisma.vendor.findUnique({
      where: { id: vendor.id },
      include: vendorInclude(stores.map((store) => store.id))
    });
    if (!updated) return res.status(404).json({ error: 'Vendor not found' });
    res.json(toVendorView(updated));
  } catch (error: any) {
    const message = error?.name === 'ZodError'
      ? error.issues.map((issue: any) => issue.message).join(', ')
      : 'Failed to update vendor';
    res.status(400).json({ error: message });
  }
});

router.delete('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const vendorId = String(req.params.id);
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    const purchaseCount = await prisma.purchase.count({ where: { vendorId: vendor.id } });
    if (purchaseCount > 0) {
      return res.status(409).json({ error: 'This vendor has purchase history and cannot be deleted.' });
    }
    await prisma.vendor.delete({ where: { id: vendor.id } });
    const storeId = await getAuditStoreId((req as any).user.id, req.query.storeId as string | undefined);
    if (storeId) {
      await writeAuditLog(prisma, {
        storeId,
        userId: (req as any).user.id,
        action: `Deleted vendor: ${vendor.name}`,
        module: 'Vendors',
        oldValue: vendor.category,
        newValue: null
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

export default router;
