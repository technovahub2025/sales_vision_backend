import { Router } from 'express';

export function createCrudRoutes(controller) {
  const router = Router({ mergeParams: true });
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
