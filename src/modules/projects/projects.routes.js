import { Router } from 'express';
import { projectsController } from './projects.controller.js';

const router = Router({ mergeParams: true });

router.get('/', projectsController.list);
router.post('/', projectsController.create);
router.patch('/:projectId', projectsController.update);
router.delete('/:projectId', projectsController.delete);
router.get('/:projectId/overview', projectsController.overview);
router.get('/:projectId/time-logs', projectsController.timeLogs);
router.get('/:projectId/members', projectsController.members);
router.post('/:projectId/members', projectsController.addMember);
router.patch('/:projectId/members/:userId', projectsController.updateMemberRole);
router.delete('/:projectId/members/:userId', projectsController.removeMember);
router.get('/:projectId/board', projectsController.board);
router.patch('/:projectId/board/view', projectsController.updateView);
router.post('/:projectId/board/columns', projectsController.createColumn);
router.patch('/:projectId/board/columns/:columnKey', projectsController.updateColumn);
router.delete('/:projectId/board/columns/:columnKey', projectsController.deleteColumn);
router.post('/:projectId/board/tasks', projectsController.createTask);
router.patch('/:projectId/board/tasks/:taskId/move', projectsController.moveTask);
router.delete('/:projectId/board/tasks/:taskId', projectsController.deleteTask);

export const projectsRoutes = router;
