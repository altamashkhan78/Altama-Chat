import { Router } from 'express';
import { protect } from '../middlewares/auth';
import {
  sendMessage,
  getMessages,
  editMessage,
  deleteMessage,
  forwardMessage,
  searchMessages,
} from '../controllers/messageController';

const router = Router();

// Require authorization for all message routes
router.use(protect);

router.post('/', sendMessage);
router.get('/:conversationId', getMessages);
router.put('/edit/:messageId', editMessage);
router.delete('/:messageId', deleteMessage);
router.post('/forward', forwardMessage);
router.get('/:conversationId/search', searchMessages);

export default router;
