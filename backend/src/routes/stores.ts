import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getAccessibleStores } from '../utils/storeAccess';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const stores = await getAccessibleStores((req as any).user.id);
  res.json(stores);
});

export default router;

