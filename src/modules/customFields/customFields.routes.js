import { Router } from 'express';
import { customFieldsController } from './customFields.controller.js';

const router = Router({ mergeParams: true });

router.get('/', customFieldsController.list);
router.post('/', customFieldsController.create);
router.patch('/:id', customFieldsController.update);

export const customFieldsRoutes = router;
