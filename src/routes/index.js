import { Router } from 'express';
import { health } from '../controllers/system.controller.js';
import { seedWorkspace } from '../controllers/seed.controller.js';
import { requireWorkspaceMember } from '../middlewares/requireWorkspaceMember.js';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes.js';
import { projectsRoutes } from '../modules/projects/projects.routes.js';
import { tasksRoutes } from '../modules/tasks/tasks.routes.js';
import { commentsRoutes, taskCommentsRoutes } from '../modules/comments/comments.routes.js';
import { campaignsRoutes } from '../modules/campaigns/campaigns.routes.js';
import { leadsRoutes } from '../modules/leads/leads.routes.js';
import { contactsRoutes } from '../modules/contacts/contacts.routes.js';
import { employeesRoutes } from '../modules/employees/employees.routes.js';
import { analyticsRoutes } from '../modules/analytics/analytics.routes.js';
import { settingsRoutes } from '../modules/settings/settings.routes.js';
import { securityRoutes } from '../modules/security/security.routes.js';
import { activityRoutes } from '../modules/activity/activity.routes.js';
import { usersRoutes } from '../modules/users/users.routes.js';
import { myTasksRoutes } from '../modules/myTasks/myTasks.routes.js';
import { clientsRoutes } from '../modules/clients/clients.routes.js';
import { teamsRoutes } from '../modules/teams/teams.routes.js';
import { notificationsRoutes } from '../modules/notifications/notifications.routes.js';
import { customFieldsRoutes } from '../modules/customFields/customFields.routes.js';
import { labelsRoutes } from '../modules/labels/labels.routes.js';
import { sprintsProjectRoutes, sprintsRoutes } from '../modules/sprints/sprints.routes.js';
import { roadmapRoutes } from '../modules/roadmap/roadmap.routes.js';
import { workflowRoutes } from '../modules/workflow/workflow.routes.js';
import { recordLegacyHit } from '../utils/legacyTelemetry.js';
const router = Router();

router.use((req, res, next) => {
  recordLegacyHit(req.method, req.originalUrl);
  console.warn(`[LEGACY] ${req.method} ${req.originalUrl} - migrate to /api/v1`);
  return next();
});

router.get('/health', health);
router.post('/workspaces/:workspaceId/seed', requireWorkspaceMember, seedWorkspace);

const workspaceRouter = Router({ mergeParams: true });
workspaceRouter.use(requireWorkspaceMember);
workspaceRouter.use('/dashboard', dashboardRoutes);
workspaceRouter.use('/projects', projectsRoutes);
workspaceRouter.use('/users', usersRoutes);
workspaceRouter.use('/tasks', tasksRoutes);
workspaceRouter.use('/', sprintsProjectRoutes);
workspaceRouter.use('/', sprintsRoutes);
workspaceRouter.use('/', roadmapRoutes);
workspaceRouter.use('/my-tasks', myTasksRoutes);
workspaceRouter.use('/comments', commentsRoutes);
workspaceRouter.use('/', taskCommentsRoutes);
workspaceRouter.use('/notifications', notificationsRoutes);
workspaceRouter.use('/custom-fields', customFieldsRoutes);
workspaceRouter.use('/labels', labelsRoutes);
workspaceRouter.use('/workflows', workflowRoutes);
workspaceRouter.use('/campaigns', campaignsRoutes);
workspaceRouter.use('/leads', leadsRoutes);
workspaceRouter.use('/clients', clientsRoutes);
workspaceRouter.use('/contacts', contactsRoutes);
workspaceRouter.use('/employees', employeesRoutes);
workspaceRouter.use('/teams', teamsRoutes);
workspaceRouter.use('/analytics', analyticsRoutes);
workspaceRouter.use('/activity', activityRoutes);
workspaceRouter.use('/settings', settingsRoutes);
workspaceRouter.use('/settings', securityRoutes);

router.use('/workspaces/:workspaceId', workspaceRouter);

export default router;


