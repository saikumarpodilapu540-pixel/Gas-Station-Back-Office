import { Prisma } from '@prisma/client';
import { prisma } from '../db';

type AuditDb = Prisma.TransactionClient | typeof prisma;

export type AuditInput = {
  storeId: string;
  userId: string;
  action: string;
  module: string;
  oldValue?: string | null;
  newValue?: string | null;
};

export const writeAuditLog = async (db: AuditDb, input: AuditInput) => {
  return db.auditLog.create({
    data: {
      storeId: input.storeId,
      userId: input.userId,
      action: input.action,
      module: input.module,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null
    }
  });
};
