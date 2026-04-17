import { Router } from 'express';
import { health, legacyUsage } from '../controllers/system.controller.js';
import { seedWorkspace } from '../controllers/seed.controller.js';
import { requireAuth, requireMembershipRole } from '../middlewares/auth.js';
import { requireWorkspaceMember } from '../middlewares/requireWorkspaceMember.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
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
import { invitesRoutes } from '../modules/invites/invites.routes.js';
import { attachmentsRoutes } from '../modules/attachments/attachments.routes.js';
import { searchRoutes } from '../modules/search/search.routes.js';
import { buildRateLimiter } from '../middlewares/rateLimiter.js';
import { workspacesRoutes } from '../modules/workspaces/workspaces.routes.js';

const v1 = Router();
const publicApiLimiter = buildRateLimiter({
  windowMs: 60 * 1000,
  max: 200,
  message: 'Too many requests for this API window.',
});
const importLimiter = buildRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Import rate limit reached.',
});

v1.get('/health', health);
v1.get('/health/legacy-usage', legacyUsage);
v1.use('/auth', authRoutes);
v1.use(publicApiLimiter);

const workspaceRouter = Router({ mergeParams: true });
workspaceRouter.use(requireWorkspaceMember);
const crmRouter = Router({ mergeParams: true });
crmRouter.use('/leads/import', importLimiter);
crmRouter.use('/leads', leadsRoutes);
crmRouter.use('/contacts', contactsRoutes);
crmRouter.use('/campaigns', campaignsRoutes);
crmRouter.use('/clients', clientsRoutes);

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
workspaceRouter.use('/leads/import', importLimiter);
workspaceRouter.use('/campaigns', campaignsRoutes);
workspaceRouter.use('/leads', leadsRoutes);
workspaceRouter.use('/clients', clientsRoutes);
workspaceRouter.use('/contacts', contactsRoutes);
workspaceRouter.use('/crm', crmRouter);
workspaceRouter.use('/employees', employeesRoutes);
workspaceRouter.use('/teams', teamsRoutes);
workspaceRouter.use('/analytics', analyticsRoutes);
workspaceRouter.use('/activity', activityRoutes);
workspaceRouter.use('/attachments', attachmentsRoutes);
workspaceRouter.use('/search', searchRoutes);
workspaceRouter.use('/settings', settingsRoutes);
workspaceRouter.use('/settings', securityRoutes);
workspaceRouter.use('/invites', requireMembershipRole(['owner', 'admin']), invitesRoutes);
workspaceRouter.post('/seed', seedWorkspace);

v1.use('/workspaces/:workspaceId', workspaceRouter);
v1.use('/workspaces', requireAuth, workspacesRoutes);

export default v1;
