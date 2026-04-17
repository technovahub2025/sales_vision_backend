import { Router } from 'express';
import { labelsController } from './labels.controller.js';

const router = Router({ mergeParams: true });

router.get('/', labelsController.list);
router.post('/', labelsController.create);
router.delete('/:id', labelsController.remove);

export const labelsRoutes = router;
