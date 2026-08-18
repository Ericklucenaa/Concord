import { Router } from 'express';
import { register, login, loginWithGoogle, getMe, updateProfile } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', loginWithGoogle);
router.get('/me', authenticateToken, getMe);
router.put('/profile', authenticateToken, updateProfile);

export default router;
