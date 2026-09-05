import { prisma } from '../db';

export const getAccessibleStores = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { ownedStores: true, store: true }
  });

  if (!user) return [];

  const stores = [...user.ownedStores];
  if (user.store && !stores.some((store) => store.id === user.store!.id)) {
    stores.push(user.store);
  }

  return stores;
};

export const canAccessStore = async (userId: string, storeId: string) => {
  const stores = await getAccessibleStores(userId);
  return stores.some((store) => store.id === storeId);
};
