import { Router } from 'express';
import { teamsController } from './teams.controller.js';

const router = Router({ mergeParams: true });

router.get('/', teamsController.list);
router.post('/', teamsController.create);
router.get('/:teamId', teamsController.getById);
router.patch('/:teamId', teamsController.update);
router.post('/:teamId/members', teamsController.addMember);
router.delete('/:teamId/members/:userId', teamsController.removeMember);
router.get('/:teamId/workload', teamsController.workload);

export const teamsRoutes = router;
