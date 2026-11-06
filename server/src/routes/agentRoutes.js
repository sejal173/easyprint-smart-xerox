import { Router } from 'express';
import { requireAgent } from '../middleware/authMiddleware.js';
import {
  agentHeartbeat,
  claimNextJob,
  updateJobStatus,
  getJobFile,
  downloadSignedFile,
  renewJobLease,
  getJobStatus,
} from '../controllers/agentController.js';

const router = Router();

// Storage download with signed token
router.get('/storage-download', downloadSignedFile);

// Protected agent endpoints (require Bearer agent token)
router.post('/heartbeat', requireAgent, agentHeartbeat);
router.get('/jobs/next', requireAgent, claimNextJob);
router.get('/jobs/:id/status', requireAgent, getJobStatus);
router.post('/jobs/:id/lease', requireAgent, renewJobLease);
router.patch('/jobs/:id/status', requireAgent, updateJobStatus);
router.get('/jobs/:id/file', requireAgent, getJobFile);

export default router;

