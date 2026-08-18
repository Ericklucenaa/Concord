import { Router } from 'express';
import { 
  createChannel, 
  updateChannel, 
  deleteChannel, 
  getChannelPermissions, 
  updateChannelPermissions 
} from '../controllers/channelController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireServerRole } from '../middleware/permissions.js';
import { ROLES } from '../../../shared/constants.js';

const router = Router();

router.use(authenticateToken);

// Create channel under server
router.post('/server/:serverId', requireServerRole([ROLES.OWNER, ROLES.ADMIN]), createChannel);

// Manage single channel
router.put('/:channelId', updateChannel);
router.delete('/:channelId', deleteChannel);

// Permissions
router.get('/:channelId/permissions', getChannelPermissions);
router.put('/:channelId/permissions', updateChannelPermissions);

export default router;
