import express from 'express';
import dashboardRoutes from './routes/dashboard.js';
import stacksRoutes from './routes/stacks.js';
import containersRoutes from './routes/containers.js';
import imagesRoutes from './routes/images.js';
import networksRoutes from './routes/networks.js';
import volumesRoutes from './routes/volumes.js';
import updatesRoutes from './routes/updates.js';
import eventsRoutes from './routes/events.js';
import notificationsRoutes from './routes/notifications.js';
import settingsRoutes from './routes/settings.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
  });
});

// Mount route modules
router.use('/dashboard', dashboardRoutes);
router.use('/stacks', stacksRoutes);
router.use('/containers', containersRoutes);
router.use('/images', imagesRoutes);
router.use('/networks', networksRoutes);
router.use('/volumes', volumesRoutes);
router.use('/updates', updatesRoutes);
router.use('/events', eventsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/settings', settingsRoutes);

export default router;
