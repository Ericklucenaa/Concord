import { Router } from 'express';
import { 
  createServer, 
  getUserServers, 
  getServerDetails, 
  updateServer, 
  deleteServer, 
  leaveServer 
} from '../controllers/serverController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireServerRole } from '../middleware/permissions.js';
import { ROLES } from '../../../shared/constants.js';

const router = Router();

router.use(authenticateToken);

router.post('/', createServer);
router.get('/', getUserServers);
router.get('/:serverId', getServerDetails);
router.put('/:serverId', requireServerRole([ROLES.OWNER, ROLES.ADMIN]), updateServer);
router.delete('/:serverId', deleteServer);
router.post('/:serverId/leave', leaveServer);

export default router;
