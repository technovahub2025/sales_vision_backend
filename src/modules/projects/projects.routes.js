import { Router } from 'express';
import { projectsController } from './projects.controller.js';
import { requirePermission } from '../../middlewares/rbac.js';

const router = Router({ mergeParams: true });

router.get('/', projectsController.list);
router.post('/', requirePermission('project', 'create'), projectsController.create);
router.patch('/:projectId', requirePermission('project', 'update'), projectsController.update);
router.delete('/:projectId', requirePermission('project', 'delete'), projectsController.delete);
router.get('/:projectId/overview', projectsController.overview);
router.get('/:projectId/time-logs', projectsController.timeLogs);
router.get('/:projectId/members', projectsController.members);
router.post('/:projectId/members', requirePermission('workspace', 'manageMembers'), projectsController.addMember);
router.patch('/:projectId/members/:userId', requirePermission('workspace', 'manageMembers'), projectsController.updateMemberRole);
router.delete('/:projectId/members/:userId', requirePermission('workspace', 'manageMembers'), projectsController.removeMember);
router.get('/:projectId/board', projectsController.board);
router.patch('/:projectId/board/view', requirePermission('project', 'update'), projectsController.updateView);
router.post('/:projectId/board/columns', requirePermission('sprint', 'manage'), projectsController.createColumn);
router.patch('/:projectId/board/columns/:columnKey', requirePermission('sprint', 'manage'), projectsController.updateColumn);
router.delete('/:projectId/board/columns/:columnKey', requirePermission('sprint', 'manage'), projectsController.deleteColumn);
router.post('/:projectId/board/tasks', requirePermission('task', 'create'), projectsController.createTask);
router.patch('/:projectId/board/tasks/:taskId/move', requirePermission('task', 'update'), projectsController.moveTask);
router.delete('/:projectId/board/tasks/:taskId', requirePermission('task', 'delete'), projectsController.deleteTask);

export const projectsRoutes = router;
