import { Router } from 'express';
import { signUp, login, verifyEmail, forgotPassword, resetPassword } from '../controllers/authController';
import { authLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Apply auth rate limiter to all auth routes
router.use(authLimiter);

router.post('/signup', signUp);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
