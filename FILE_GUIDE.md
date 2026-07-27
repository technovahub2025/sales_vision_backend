# File Guide

Generated on 2026-07-27. This guide covers the meaningful project files in the backend and skips dependencies/runtime artifacts like `node_modules` and `.local`.

## Root

| File | Explanation |
| --- | --- |
| `.gitignore` | Git ignore rules for generated, local, and machine-specific files. |
| `npm` | Empty placeholder file in the repo root; it does not participate in runtime behavior. |
| `package-lock.json` | Locked dependency tree that pins exact package versions for reproducible installs. |
| `package.json` | Project manifest, dependency list, and npm scripts for running and testing the backend. |
| `README.md` | High-level project overview and setup instructions. |

## Scripts

| File | Explanation |
| --- | --- |
| `scripts/cleanup-ai-data.js` | Maintenance script that deletes AI-related collections, with dry-run support and optional workspace scoping. |

## src/config

| File | Explanation |
| --- | --- |
| `src/config/cloudinary.js` | Cloudinary client configuration used for file and media uploads. |
| `src/config/cors.js` | CORS origin policy shared by Express and Socket.IO. |
| `src/config/db.js` | MongoDB connection helpers plus startup index preparation for task data. |
| `src/config/jwt.js` | JWT settings and token-related configuration helpers. |
| `src/config/redis.js` | Redis client lifecycle helpers, including support for mock Redis in local or test environments. |

## src/controllers

| File | Explanation |
| --- | --- |
| `src/controllers/seed.controller.js` | HTTP controller for workspace seeding and initial data bootstrap operations. |
| `src/controllers/system.controller.js` | System-level endpoints such as health checks and legacy usage reporting. |

## src/middlewares

| File | Explanation |
| --- | --- |
| `src/middlewares/asyncHandler.js` | Wrapper for async route handlers so rejected promises reach Express error handling. |
| `src/middlewares/auth.js` | Authentication and membership role guards for protected routes. |
| `src/middlewares/authToken.js` | Token extraction and auth-token parsing middleware. |
| `src/middlewares/errorHandler.js` | Central error formatter that normalizes validation, duplicate key, and server failures. |
| `src/middlewares/planGuards.js` | Subscription or plan-limit guards that block features based on entitlement. |
| `src/middlewares/rateLimiter.js` | Factory for request-rate limiting middleware. |
| `src/middlewares/rbac.js` | Role-based access control helpers for permission checks. |
| `src/middlewares/requestId.js` | Assigns or propagates a request ID for traceability across logs and responses. |
| `src/middlewares/requireWorkspaceMember.js` | Ensures the current user belongs to the requested workspace. |
| `src/middlewares/sanitize.js` | Input sanitization and payload-size protection middleware. |
| `src/middlewares/superAdminAuth.js` | Special authentication guard for super-admin endpoints. |
| `src/middlewares/uploadMiddleware.js` | Multer-based upload pipeline and file handling rules. |
| `src/middlewares/validation.js` | Request validation middleware that runs Zod schemas against params, query, and body. |
| `src/middlewares/workspaceResolver.js` | Resolves workspace context from the incoming request. |

## src/models

| File | Explanation |
| --- | --- |
| `src/models/_base.js` | Shared Mongoose base helpers, including timestamp defaults and workspace-scoped field definitions. |
| `src/models/activity.model.js` | Mongoose model/schema definition for activity. |
| `src/models/analyticsSnapshot.model.js` | Mongoose model/schema definition for analyticsSnapshot. |
| `src/models/attachment.model.js` | Mongoose model/schema definition for attachment. |
| `src/models/auditLog.model.js` | Mongoose model/schema definition for auditLog. |
| `src/models/campaign.model.js` | Mongoose model/schema definition for campaign. |
| `src/models/client.model.js` | Mongoose model/schema definition for client. |
| `src/models/comment.model.js` | Mongoose model/schema definition for comment. |
| `src/models/contact.model.js` | Mongoose model/schema definition for contact. |
| `src/models/customFieldDefinition.model.js` | Mongoose model/schema definition for customFieldDefinition. |
| `src/models/employee.model.js` | Mongoose model/schema definition for employee. |
| `src/models/label.model.js` | Mongoose model/schema definition for label. |
| `src/models/lead.model.js` | Mongoose model/schema definition for lead. |
| `src/models/notification.model.js` | Mongoose model/schema definition for notification. |
| `src/models/passwordResetToken.model.js` | Mongoose model/schema definition for passwordResetToken. |
| `src/models/project.model.js` | Mongoose model/schema definition for project. |
| `src/models/projectMember.model.js` | Mongoose model/schema definition for projectMember. |
| `src/models/refreshToken.model.js` | Mongoose model/schema definition for refreshToken. |
| `src/models/securityApiKey.model.js` | Mongoose model/schema definition for securityApiKey. |
| `src/models/securitySession.model.js` | Mongoose model/schema definition for securitySession. |
| `src/models/settingPreference.model.js` | Mongoose model/schema definition for settingPreference. |
| `src/models/settingProfile.model.js` | Mongoose model/schema definition for settingProfile. |
| `src/models/sprint.model.js` | Mongoose model/schema definition for sprint. |
| `src/models/superAdmin.model.js` | Mongoose model/schema definition for superAdmin. |
| `src/models/task.model.js` | Mongoose model/schema definition for task. |
| `src/models/taskAttachment.model.js` | Mongoose model/schema definition for taskAttachment. |
| `src/models/taskComment.model.js` | Mongoose model/schema definition for taskComment. |
| `src/models/taskDependency.model.js` | Mongoose model/schema definition for taskDependency. |
| `src/models/taskOrder.model.js` | Mongoose model/schema definition for taskOrder. |
| `src/models/team.model.js` | Mongoose model/schema definition for team. |
| `src/models/timeLog.model.js` | Mongoose model/schema definition for timeLog. |
| `src/models/user.model.js` | Mongoose model/schema definition for user. |
| `src/models/workflow.model.js` | Mongoose model/schema definition for workflow. |
| `src/models/workflowStatus.model.js` | Mongoose model/schema definition for workflowStatus. |
| `src/models/workflowTransition.model.js` | Mongoose model/schema definition for workflowTransition. |
| `src/models/workspace.model.js` | Mongoose model/schema definition for workspace. |
| `src/models/workspaceInvite.model.js` | Mongoose model/schema definition for workspaceInvite. |
| `src/models/workspaceMember.model.js` | Mongoose model/schema definition for workspaceMember. |

## src/repositories

| File | Explanation |
| --- | --- |
| `src/repositories/createRepository.js` | Repository factory that wraps persistence access patterns. |

## src/routes

| File | Explanation |
| --- | --- |
| `src/routes/index.js` | Legacy route mount that logs usage and exposes older workspace-scoped endpoints while the app migrates to /api/v1. |
| `src/routes/v1.routes.js` | Primary versioned API router that mounts auth, workspace, CRM, admin, search, attachment, and team-related routes. |

## src/services

| File | Explanation |
| --- | --- |
| `src/services/mail.service.js` | Shared email transport and sending helpers. |
| `src/services/planLimits.service.js` | Central checks for plan quotas and feature limits. |
| `src/services/seed.service.js` | Business logic used when seeding workspaces and starter data. |
| `src/services/workspace.service.js` | Workspace domain operations and helper logic. |
| `src/services/workspaceIntegrity.service.js` | Repair and consistency routines for workspace data integrity. |

## src/sockets

| File | Explanation |
| --- | --- |
| `src/sockets/emitters.js` | Reusable Socket.IO emit helpers for broadcasting domain events. |
| `src/sockets/index.js` | Socket.IO registration entry point that attaches all socket handlers. |
| `src/sockets/rooms.js` | Room naming and room-management helpers for Socket.IO. |

## src/utils

| File | Explanation |
| --- | --- |
| `src/utils/ApiError.js` | Custom API error class for throwing structured application errors. |
| `src/utils/apiResponse.js` | Helpers for consistent success and failure JSON responses. |
| `src/utils/crypto.js` | Cryptographic helpers for hashing, token generation, or secure random values. |
| `src/utils/legacyTelemetry.js` | Tracks usage of legacy routes so migration impact can be measured. |
| `src/utils/lruCache.js` | Lightweight in-memory LRU cache implementation. |
| `src/utils/pagination.js` | Pagination helpers for list endpoints. |
| `src/utils/roles.js` | Role constants and helper utilities for authorization logic. |

## src/modules

### src/modules/activity

| File | Explanation |
| --- | --- |
| `src/modules/activity/activity.controller.js` | Express controller for the activity module, responsible for request/response handling. |
| `src/modules/activity/activity.query.service.js` | Business-logic layer for the activity module. |
| `src/modules/activity/activity.routes.js` | HTTP route definitions for the activity module. |
| `src/modules/activity/activity.service.js` | Business-logic layer for the activity module. |

### src/modules/analytics

| File | Explanation |
| --- | --- |
| `src/modules/analytics/analytics.controller.js` | Express controller for the analytics module, responsible for request/response handling. |
| `src/modules/analytics/analytics.routes.js` | HTTP route definitions for the analytics module. |
| `src/modules/analytics/analytics.service.js` | Business-logic layer for the analytics module. |

### src/modules/attachments

| File | Explanation |
| --- | --- |
| `src/modules/attachments/attachments.controller.js` | Express controller for the attachments module, responsible for request/response handling. |
| `src/modules/attachments/attachments.routes.js` | HTTP route definitions for the attachments module. |
| `src/modules/attachments/attachments.service.js` | Business-logic layer for the attachments module. |

### src/modules/auth

| File | Explanation |
| --- | --- |
| `src/modules/auth/auth.controller.js` | Express controller for the auth module, responsible for request/response handling. |
| `src/modules/auth/auth.mailer.js` | Email sending helper for the auth module. |
| `src/modules/auth/auth.mailer.templates.js` | Email template definitions for the auth module. |
| `src/modules/auth/auth.routes.js` | HTTP route definitions for the auth module. |
| `src/modules/auth/auth.schemas.js` | Zod request schemas for the auth module. |
| `src/modules/auth/auth.service.js` | Business-logic layer for the auth module. |

### src/modules/campaigns

| File | Explanation |
| --- | --- |
| `src/modules/campaigns/campaigns.controller.js` | Express controller for the campaigns module, responsible for request/response handling. |
| `src/modules/campaigns/campaigns.routes.js` | HTTP route definitions for the campaigns module. |
| `src/modules/campaigns/campaigns.service.js` | Business-logic layer for the campaigns module. |

### src/modules/clients

| File | Explanation |
| --- | --- |
| `src/modules/clients/clients.controller.js` | Express controller for the clients module, responsible for request/response handling. |
| `src/modules/clients/clients.routes.js` | HTTP route definitions for the clients module. |
| `src/modules/clients/clients.service.js` | Business-logic layer for the clients module. |

### src/modules/comments

| File | Explanation |
| --- | --- |
| `src/modules/comments/comments.controller.js` | Express controller for the comments module, responsible for request/response handling. |
| `src/modules/comments/comments.routes.js` | HTTP route definitions for the comments module. |
| `src/modules/comments/comments.service.js` | Business-logic layer for the comments module. |

### src/modules/contacts

| File | Explanation |
| --- | --- |
| `src/modules/contacts/contacts.controller.js` | Express controller for the contacts module, responsible for request/response handling. |
| `src/modules/contacts/contacts.routes.js` | HTTP route definitions for the contacts module. |
| `src/modules/contacts/contacts.service.js` | Business-logic layer for the contacts module. |

### src/modules/createCrudController.js

| File | Explanation |
| --- | --- |
| `src/modules/createCrudController.js` | Factory for generating standard CRUD controllers. |

### src/modules/createCrudRoutes.js

| File | Explanation |
| --- | --- |
| `src/modules/createCrudRoutes.js` | Factory for generating standard CRUD route sets. |

### src/modules/createCrudService.js

| File | Explanation |
| --- | --- |
| `src/modules/createCrudService.js` | Factory for generating standard CRUD services. |

### src/modules/customFields

| File | Explanation |
| --- | --- |
| `src/modules/customFields/customFields.controller.js` | Express controller for the customFields module, responsible for request/response handling. |
| `src/modules/customFields/customFields.routes.js` | HTTP route definitions for the customFields module. |
| `src/modules/customFields/customFields.service.js` | Business-logic layer for the customFields module. |

### src/modules/dashboard

| File | Explanation |
| --- | --- |
| `src/modules/dashboard/dashboard.controller.js` | Express controller for the dashboard module, responsible for request/response handling. |
| `src/modules/dashboard/dashboard.routes.js` | HTTP route definitions for the dashboard module. |
| `src/modules/dashboard/dashboard.service.js` | Business-logic layer for the dashboard module. |

### src/modules/employees

| File | Explanation |
| --- | --- |
| `src/modules/employees/employees.controller.js` | Express controller for the employees module, responsible for request/response handling. |
| `src/modules/employees/employees.routes.js` | HTTP route definitions for the employees module. |
| `src/modules/employees/employees.service.js` | Business-logic layer for the employees module. |

### src/modules/invites

| File | Explanation |
| --- | --- |
| `src/modules/invites/invites.controller.js` | Express controller for the invites module, responsible for request/response handling. |
| `src/modules/invites/invites.routes.js` | HTTP route definitions for the invites module. |
| `src/modules/invites/invites.schemas.js` | Zod request schemas for the invites module. |
| `src/modules/invites/invites.service.js` | Business-logic layer for the invites module. |

### src/modules/labels

| File | Explanation |
| --- | --- |
| `src/modules/labels/labels.controller.js` | Express controller for the labels module, responsible for request/response handling. |
| `src/modules/labels/labels.routes.js` | HTTP route definitions for the labels module. |
| `src/modules/labels/labels.service.js` | Business-logic layer for the labels module. |

### src/modules/leads

| File | Explanation |
| --- | --- |
| `src/modules/leads/leads.controller.js` | Express controller for the leads module, responsible for request/response handling. |
| `src/modules/leads/leads.routes.js` | HTTP route definitions for the leads module. |
| `src/modules/leads/leads.service.js` | Business-logic layer for the leads module. |

### src/modules/myTasks

| File | Explanation |
| --- | --- |
| `src/modules/myTasks/myTasks.controller.js` | Express controller for the myTasks module, responsible for request/response handling. |
| `src/modules/myTasks/myTasks.routes.js` | HTTP route definitions for the myTasks module. |
| `src/modules/myTasks/myTasks.service.js` | Business-logic layer for the myTasks module. |

### src/modules/notifications

| File | Explanation |
| --- | --- |
| `src/modules/notifications/notifications.controller.js` | Express controller for the notifications module, responsible for request/response handling. |
| `src/modules/notifications/notifications.routes.js` | HTTP route definitions for the notifications module. |
| `src/modules/notifications/notifications.scheduler.js` | Background scheduler for the notifications module. |
| `src/modules/notifications/notifications.schemas.js` | Zod request schemas for the notifications module. |
| `src/modules/notifications/notifications.service.js` | Business-logic layer for the notifications module. |

### src/modules/projects

| File | Explanation |
| --- | --- |
| `src/modules/projects/projects.controller.js` | Express controller for the projects module, responsible for request/response handling. |
| `src/modules/projects/projects.routes.js` | HTTP route definitions for the projects module. |
| `src/modules/projects/projects.service.js` | Business-logic layer for the projects module. |

### src/modules/roadmap

| File | Explanation |
| --- | --- |
| `src/modules/roadmap/roadmap.controller.js` | Express controller for the roadmap module, responsible for request/response handling. |
| `src/modules/roadmap/roadmap.routes.js` | HTTP route definitions for the roadmap module. |
| `src/modules/roadmap/roadmap.service.js` | Business-logic layer for the roadmap module. |

### src/modules/search

| File | Explanation |
| --- | --- |
| `src/modules/search/search.controller.js` | Express controller for the search module, responsible for request/response handling. |
| `src/modules/search/search.routes.js` | HTTP route definitions for the search module. |
| `src/modules/search/search.service.js` | Business-logic layer for the search module. |

### src/modules/security

| File | Explanation |
| --- | --- |
| `src/modules/security/security.controller.js` | Express controller for the security module, responsible for request/response handling. |
| `src/modules/security/security.routes.js` | HTTP route definitions for the security module. |
| `src/modules/security/security.service.js` | Business-logic layer for the security module. |

### src/modules/settings

| File | Explanation |
| --- | --- |
| `src/modules/settings/settings.controller.js` | Express controller for the settings module, responsible for request/response handling. |
| `src/modules/settings/settings.routes.js` | HTTP route definitions for the settings module. |
| `src/modules/settings/settings.service.js` | Business-logic layer for the settings module. |

### src/modules/sprints

| File | Explanation |
| --- | --- |
| `src/modules/sprints/sprints.controller.js` | Express controller for the sprints module, responsible for request/response handling. |
| `src/modules/sprints/sprints.routes.js` | HTTP route definitions for the sprints module. |
| `src/modules/sprints/sprints.service.js` | Business-logic layer for the sprints module. |

### src/modules/superAdmin

| File | Explanation |
| --- | --- |
| `src/modules/superAdmin/superAdmin.controller.js` | Express controller for the superAdmin module, responsible for request/response handling. |
| `src/modules/superAdmin/superAdmin.routes.js` | HTTP route definitions for the superAdmin module. |
| `src/modules/superAdmin/superAdmin.service.js` | Business-logic layer for the superAdmin module. |
| `src/modules/superAdmin/superAdmin.validation.js` | Validation schemas and rules for the superAdmin module. |

### src/modules/tasks

| File | Explanation |
| --- | --- |
| `src/modules/tasks/tasks.controller.js` | Express controller for the tasks module, responsible for request/response handling. |
| `src/modules/tasks/tasks.routes.js` | HTTP route definitions for the tasks module. |
| `src/modules/tasks/tasks.schemas.js` | Zod request schemas for the tasks module. |
| `src/modules/tasks/tasks.service.js` | Business-logic layer for the tasks module. |

### src/modules/teams

| File | Explanation |
| --- | --- |
| `src/modules/teams/teams.controller.js` | Express controller for the teams module, responsible for request/response handling. |
| `src/modules/teams/teams.routes.js` | HTTP route definitions for the teams module. |
| `src/modules/teams/teams.service.js` | Business-logic layer for the teams module. |

### src/modules/users

| File | Explanation |
| --- | --- |
| `src/modules/users/users.controller.js` | Express controller for the users module, responsible for request/response handling. |
| `src/modules/users/users.routes.js` | HTTP route definitions for the users module. |
| `src/modules/users/users.service.js` | Business-logic layer for the users module. |

### src/modules/workflow

| File | Explanation |
| --- | --- |
| `src/modules/workflow/workflow.controller.js` | Express controller for the workflow module, responsible for request/response handling. |
| `src/modules/workflow/workflow.routes.js` | HTTP route definitions for the workflow module. |
| `src/modules/workflow/workflow.service.js` | Business-logic layer for the workflow module. |

### src/modules/workspaces

| File | Explanation |
| --- | --- |
| `src/modules/workspaces/workspaces.controller.js` | Express controller for the workspaces module, responsible for request/response handling. |
| `src/modules/workspaces/workspaces.routes.js` | HTTP route definitions for the workspaces module. |
| `src/modules/workspaces/workspaces.service.js` | Business-logic layer for the workspaces module. |
| `src/modules/workspaces/workspaces.validation.js` | Validation schemas and rules for the workspaces module. |

