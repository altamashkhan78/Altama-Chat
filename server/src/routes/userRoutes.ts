import { Router } from 'express';
import { protect } from '../middlewares/auth';
import {
  getProfile,
  updateProfile,
  changePassword,
  searchUsers,
  blockUser,
  unblockUser,
  getBlockedUsers,
  updatePrivacySettings,
} from '../controllers/userController';

const router = Router();

// Require authorization for all user routes
router.use(protect);

router.get('/profile/:userId', getProfile);
router.put('/profile', updateProfile);
router.put('/change-password', changePassword);
router.get('/search', searchUsers);
router.post('/block', blockUser);
router.post('/unblock', unblockUser);
router.get('/blocked', getBlockedUsers);
router.put('/privacy', updatePrivacySettings);

export default router;
