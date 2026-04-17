import { Router } from 'express';
import { clientsController } from './clients.controller.js';

const router = Router({ mergeParams: true });

router.get('/', clientsController.list);
router.post('/', clientsController.create);
router.get('/:id', clientsController.getById);
router.patch('/:id', clientsController.update);
router.delete('/:id', clientsController.remove);
router.patch('/:id/restore', clientsController.restore);
router.get('/:id/leads', clientsController.leads);
router.get('/:id/projects', clientsController.projects);
router.post('/:id/notes', clientsController.addNote);

export const clientsRoutes = router;
