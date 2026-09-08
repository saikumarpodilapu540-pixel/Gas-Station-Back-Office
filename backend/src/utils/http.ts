import { Request, Response, NextFunction } from 'express';
import { AppError, Actor } from '../services/operations';
export const actorOf = (req: Request): Actor => (req as any).user;
export const keyOf = (req: Request) => String(req.headers['idempotency-key'] || req.body?.requestKey || '');
export const endpoint = (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);
export function errors(error: any, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof AppError) return res.status(error.status).json({ error: error.message });
  if (error?.name === 'ZodError') return res.status(400).json({ error: error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  if (error?.code === 'P2002') return res.status(409).json({ error: 'A record with these identifiers already exists.' });
  if (error?.code === 'P2025') return res.status(404).json({ error: 'Record not found.' });
  if (error?.code === 'P2034') return res.status(409).json({ error: 'Records changed concurrently. Refresh and retry.' });
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Upload exceeds the size limit.' });
  console.error(error?.message || 'Unexpected API error');
  return res.status(500).json({ error: 'The operation could not be completed. Check the server logs.' });
}
export const emitStore = (req: Request, storeId: string) => req.app.get('io')?.to(`store-${storeId}`).emit('inventory_updated', { storeId });
