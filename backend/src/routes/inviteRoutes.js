import { Router } from 'express';
import { 
  createInvite, 
  joinByCode, 
  getPendingInvites, 
  respondInvite 
} from '../controllers/inviteController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireServerRole } from '../middleware/permissions.js';
import { ROLES } from '../../../shared/constants.js';

const router = Router();

router.use(authenticateToken);

router.post('/server/:serverId', requireServerRole([ROLES.OWNER, ROLES.ADMIN]), createInvite);
router.post('/join', joinByCode);
router.get('/pending', getPendingInvites);
router.post('/:inviteId/respond', respondInvite);

export default router;
