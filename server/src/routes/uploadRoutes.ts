import { Router, Response } from 'express';
import { protect } from '../middlewares/auth';
import { upload } from '../middlewares/upload';
import { AuthenticatedRequest } from '../middlewares/auth';

const router = Router();

// Route: POST /api/upload
// Expects a multipart form data file field named "file"
router.post(
  '/',
  protect,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      // Construct file download URL
      // We will serve static files from '/uploads' route on the server
      const fileUrl = `/uploads/${req.file.filename}`;

      res.status(200).json({
        success: true,
        file: {
          url: fileUrl,
          name: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'File upload failed' });
    }
  }
);

export default router;
