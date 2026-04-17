import { Router } from 'express';
import { employeesController } from './employees.controller.js';

const router = Router({ mergeParams: true });

router.get('/', employeesController.list);
router.post('/', employeesController.create);
router.get('/my-tasks/time-summary', employeesController.myTimeSummary);
router.get('/:id', employeesController.getById);
router.patch('/:id', employeesController.update);
router.delete('/:id', employeesController.remove);
router.get('/:id/timeline', employeesController.timeline);
router.get('/:id/time-logs', employeesController.employeeTimeLogs);
router.get('/:id/performance', employeesController.performance);

export const employeesRoutes = router;
