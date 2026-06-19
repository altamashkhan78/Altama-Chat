import { Router } from 'express';
import { protect } from '../middlewares/auth';
import {
  getConversations,
  getOrCreateConversation,
  togglePin,
  toggleArchive,
  initiateE2EExchange,
  completeE2EExchange,
} from '../controllers/chatController';

const router = Router();

// Require authorization for all chat routes
router.use(protect);

router.get('/', getConversations);
router.post('/', getOrCreateConversation);
router.put('/pin/:conversationId', togglePin);
router.put('/archive/:conversationId', toggleArchive);
router.post('/e2e/initiate', initiateE2EExchange);
router.post('/e2e/complete', completeE2EExchange);

export default router;
