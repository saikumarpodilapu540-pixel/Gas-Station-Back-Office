import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { canAccessStore } from '../utils/storeAccess';
import { writeAuditLog } from '../utils/audit';

const router = Router();
router.use(requireAuth);

const createEmployeeSchema = z.object({
  storeId: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'Name must contain at least 2 characters'),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(6, 'Password must contain at least 6 characters'),
  role: z.enum(['MANAGER', 'STAFF']).default('STAFF'),
  shift: z.string().trim().min(1).max(100).optional().nullable()
});

const updateEmployeeSchema = z.object({
  storeId: z.string().uuid().optional(),
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['MANAGER', 'STAFF']).optional(),
  shift: z.string().trim().min(1).max(100).optional().nullable()
});

const employeeSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  shift: true,
  storeId: true,
  createdAt: true,
  updatedAt: true
} as const;

const toEmployeeView = (employee: any) => ({
  ...employee,
  role: employee.role === 'OWNER' ? 'Owner' : employee.role === 'MANAGER' ? 'Manager' : 'Staff',
  salesHandled: 0
});

const resolveStoreId = async (userId: string, requestedStoreId?: string) => {
  const storeId = requestedStoreId;
  if (!storeId) return undefined;
  return (await canAccessStore(userId, storeId)) ? storeId : null;
};

router.get('/', async (req, res) => {
  try {
    const storeId = await resolveStoreId((req as any).user.id, (req.query.storeId as string) || (req as any).user.storeId);
    if (storeId === null) return res.status(403).json({ error: 'You do not have access to this store' });
    if (!storeId) return res.status(400).json({ error: 'storeId is required' });
    const employees = await prisma.user.findMany({
      where: { storeId },
      select: employeeSelect,
      orderBy: { name: 'asc' }
    });
    res.json(employees.map(toEmployeeView));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

router.post('/', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const data = createEmployeeSchema.parse({
      ...req.body,
      storeId: req.body.storeId || (req as any).user.storeId,
      shift: req.body.shift || null
    });
    if (!(await canAccessStore((req as any).user.id, data.storeId!))) {
      return res.status(403).json({ error: 'You do not have access to this store' });
    }
    const password = await bcrypt.hash(data.password, 10);
    const employee = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password,
        role: data.role,
        shift: data.shift,
        storeId: data.storeId
      },
      select: employeeSelect
    });
    await writeAuditLog(prisma, {
      storeId: data.storeId!,
      userId: (req as any).user.id,
      action: `Added employee: ${employee.name}`,
      module: 'Employees',
      oldValue: null,
      newValue: `${employee.role}, ${employee.shift || 'No shift'}`
    });
    res.status(201).json(toEmployeeView(employee));
  } catch (error: any) {
    const message = error?.code === 'P2002'
      ? 'An employee with this email already exists.'
      : error?.name === 'ZodError'
        ? error.issues.map((issue: any) => issue.message).join(', ')
        : 'Failed to create employee';
    res.status(400).json({ error: message });
  }
});

router.put('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const data = updateEmployeeSchema.parse({ ...req.body, shift: req.body.shift === '' ? null : req.body.shift });
    const employeeId = String(req.params.id);
    const existing = await prisma.user.findUnique({ where: { id: employeeId }, select: employeeSelect });
    if (!existing) return res.status(404).json({ error: 'Employee not found' });
    if (!existing.storeId || !(await canAccessStore((req as any).user.id, existing.storeId))) {
      return res.status(403).json({ error: 'You do not have access to this employee' });
    }
    if (existing.role === 'OWNER' && existing.id !== (req as any).user.id) {
      return res.status(403).json({ error: 'Owner accounts cannot be managed from the employee screen.' });
    }
    if (existing.role === 'OWNER' && data.role !== undefined) {
      return res.status(400).json({ error: 'You cannot change the owner role here.' });
    }
    if (existing.id === (req as any).user.id) {
      return res.status(400).json({ error: 'You cannot edit your own account here.' });
    }
    const updateData: any = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.shift !== undefined ? { shift: data.shift } : {})
    };
    if (data.password) updateData.password = await bcrypt.hash(data.password, 10);
    const employee = await prisma.user.update({
      where: { id: existing.id },
      data: updateData,
      select: employeeSelect
    });
    await writeAuditLog(prisma, {
      storeId: existing.storeId!,
      userId: (req as any).user.id,
      action: `Updated employee: ${employee.name}`,
      module: 'Employees',
      oldValue: `${existing.role}, ${existing.shift || 'No shift'}`,
      newValue: `${employee.role}, ${employee.shift || 'No shift'}`
    });
    res.json(toEmployeeView(employee));
  } catch (error: any) {
    const message = error?.code === 'P2002'
      ? 'An employee with this email already exists.'
      : error?.name === 'ZodError'
        ? error.issues.map((issue: any) => issue.message).join(', ')
        : 'Failed to update employee';
    res.status(400).json({ error: message });
  }
});

router.delete('/:id', requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const employeeId = String(req.params.id);
    const existing = await prisma.user.findUnique({ where: { id: employeeId }, select: employeeSelect });
    if (!existing) return res.status(404).json({ error: 'Employee not found' });
    if (existing.id === (req as any).user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    if (existing.role === 'OWNER') return res.status(403).json({ error: 'Owner accounts cannot be deleted from the employee screen.' });
    if (!existing.storeId || !(await canAccessStore((req as any).user.id, existing.storeId))) {
      return res.status(403).json({ error: 'You do not have access to this employee' });
    }
    await prisma.user.delete({ where: { id: existing.id } });
    await writeAuditLog(prisma, {
      storeId: existing.storeId!,
      userId: (req as any).user.id,
      action: `Deleted employee: ${existing.name}`,
      module: 'Employees',
      oldValue: `${existing.role}, ${existing.shift || 'No shift'}`,
      newValue: null
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(409).json({ error: error?.code === 'P2003' ? 'Employee has related audit history and cannot be deleted.' : 'Failed to delete employee' });
  }
});

export default router;
