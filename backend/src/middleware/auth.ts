import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';

export async function authenticateToken(token: string) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret');
  if (typeof decoded === 'string' || typeof decoded.id !== 'string') throw new Error('Invalid token');
  const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, role: true, storeId: true } });
  if (!user) throw new Error('User no longer exists');
  return { user, expiresAt: decoded.exp ? decoded.exp * 1000 : 0 };
}
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
  try { (req as any).user = (await authenticateToken(token)).user; }
  catch { return res.status(401).json({ error: 'Unauthorized: Invalid token or account' }); }
  next();
};
export const requireRole = (allowedRoles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!allowedRoles.includes((req as any).user?.role)) return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  next();
};
