import { Router } from 'express';
import { getChannelMessages, deleteMessage } from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/channel/:channelId', getChannelMessages);
router.delete('/:messageId', deleteMessage);

export default router;
