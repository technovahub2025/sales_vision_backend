import { Router } from 'express';
import { securityController } from './security.controller.js';

const router = Router({ mergeParams: true });

router.get('/sessions', securityController.listSessions);
router.post('/sessions', securityController.createSession);
router.patch('/sessions/:id', securityController.updateSession);

router.get('/api-keys', securityController.listApiKeys);
router.post('/api-keys', securityController.createApiKey);
router.patch('/api-keys/:id', securityController.updateApiKey);
router.delete('/api-keys/:id', securityController.removeApiKey);

router.get('/security', securityController.listSessions);
router.patch('/security/:id', securityController.updateSession);

export const securityRoutes = router;
