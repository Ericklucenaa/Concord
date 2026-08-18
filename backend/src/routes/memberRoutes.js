import { Router } from 'express';
import { 
  updateMemberRole, 
  muteMember, 
  kickMember 
} from '../controllers/memberController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.put('/server/:serverId/member/:memberId/role', updateMemberRole);
router.put('/server/:serverId/member/:memberId/mute', muteMember);
router.delete('/server/:serverId/member/:memberId', kickMember);

export default router;
