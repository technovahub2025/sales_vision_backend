# SaleVision Backend Features

This document explains the main backend features in detail, based on the actual routes, models, services, and middleware in the codebase.

## 1. Authentication and Account Management

The backend includes a full authentication flow for user onboarding and session management.

### What it does
- User registration
- Login and session creation
- Session refresh
- Logout
- Forgot password and password reset
- Current-user lookup through `me`
- Profile updates
- Password updates
- Notification preference updates

### Why it matters
This is the foundation of the app. Every protected workspace feature depends on a valid authenticated user. The backend also supports secure session handling, which lets the frontend keep users logged in without requiring them to re-enter credentials too often.

### Important backend pieces
- `src/modules/auth/auth.routes.js`
- `src/modules/auth/auth.controller.js`
- `src/modules/auth/auth.service.js`
- `src/models/user.model.js`
- `src/models/refreshToken.model.js`
- `src/models/passwordResetToken.model.js`
- `src/middlewares/auth.js`

### Typical behavior
- A new user registers and receives an account.
- A user logs in and gets authenticated session tokens or cookies.
- If the access session expires, the refresh endpoint creates a new one.
- Forgotten passwords are handled through reset tokens and email-based recovery.

## 2. Workspace Management

Workspaces are the main tenant boundary in the backend. Most data is scoped to a workspace, which means users only see data that belongs to their own workspace.

### What it does
- Create and manage workspaces
- Resolve the current workspace from the request
- Enforce workspace membership
- Support workspace seeding for initial setup
- Repair workspace integrity when data becomes inconsistent

### Why it matters
This backend is not single-tenant. A workspace acts like a container for projects, tasks, users, teams, CRM data, and settings. That makes the system safe for multiple organizations or teams to use the same backend instance.

### Important backend pieces
- `src/modules/workspaces/workspaces.routes.js`
- `src/modules/workspaces/workspaces.service.js`
- `src/middlewares/workspaceResolver.js`
- `src/middlewares/requireWorkspaceMember.js`
- `src/services/workspace.service.js`
- `src/services/workspaceIntegrity.service.js`
- `src/models/workspace.model.js`
- `src/models/workspaceMember.model.js`
- `src/models/workspaceInvite.model.js`

### Typical behavior
- A user creates or joins a workspace.
- Each workspace request is checked to ensure the user is a member.
- Workspace-scoped data like tasks or projects is fetched only inside that workspace.
- A repair process can be run during startup to fix missing or inconsistent workspace records.

## 3. Projects

Projects organize work into logical groups. They are usually the top-level work container inside a workspace.

### What it does
- Create and update projects
- List projects inside a workspace
- Support project membership and project-specific views

### Why it matters
Projects help teams group related tasks, milestones, and planning information. They are the main structure users work inside after entering a workspace.

### Important backend pieces
- `src/modules/projects/projects.routes.js`
- `src/modules/projects/projects.controller.js`
- `src/modules/projects/projects.service.js`
- `src/models/project.model.js`
- `src/models/projectMember.model.js`

### Typical behavior
- A workspace can contain multiple projects.
- Users can be assigned to one or more projects.
- Project data is used by board-style and roadmap-style views.

## 4. Tasks

Tasks are the central work item in the app. This is the richest part of the backend and includes many supporting operations.

### What it does
- Create, list, update, and delete tasks
- Bulk update multiple tasks
- Duplicate tasks
- Change task status
- Set task estimates
- Approve tasks
- Export tasks to CSV
- Manage task attachments
- Track task dependencies
- Track manual time logs and timers
- View task activity history

### Why it matters
Tasks are the core object for execution. Everything else in the system, including comments, attachments, workflows, analytics, and notifications, tends to connect back to tasks.

### Important backend pieces
- `src/modules/tasks/tasks.routes.js`
- `src/modules/tasks/tasks.controller.js`
- `src/modules/tasks/tasks.service.js`
- `src/modules/tasks/tasks.schemas.js`
- `src/models/task.model.js`
- `src/models/taskAttachment.model.js`
- `src/models/taskComment.model.js`
- `src/models/taskDependency.model.js`
- `src/models/taskOrder.model.js`
- `src/models/timeLog.model.js`

### Detailed behavior
- Task creation is permission-controlled.
- Task status updates are separated from generic updates so workflows can be handled more cleanly.
- Bulk updates make it easier to move or modify multiple tasks at once.
- Dependency management helps teams model blocked or related work.
- Time logs and timers support effort tracking and productivity analysis.
- Attachment endpoints allow files or URLs to be linked to a task.

## 5. Comments and Collaboration

Comments give teams a way to discuss work in context.

### What it does
- Add comments
- List comments
- Support task-specific commenting
- Store collaboration history

### Why it matters
Discussion lives close to the work item instead of being scattered across emails or external chats. That makes it easier to understand decisions and progress later.

### Important backend pieces
- `src/modules/comments/comments.routes.js`
- `src/modules/comments/comments.controller.js`
- `src/modules/comments/comments.service.js`
- `src/models/comment.model.js`
- `src/models/taskComment.model.js`

### Typical behavior
- A user leaves a comment on a task to ask for clarification.
- Another user replies or follows the discussion.
- Comment activity can also trigger notifications.

## 6. Sprints and Roadmap

The backend supports planning work over time using sprint and roadmap features.

### What it does
- Create and manage sprints
- Organize work into sprint cycles
- Provide roadmap-level planning views

### Why it matters
This is useful for teams that follow Agile or iterative delivery workflows. Sprints help with short-term execution, while roadmap views help with longer-term planning.

### Important backend pieces
- `src/modules/sprints/sprints.routes.js`
- `src/modules/sprints/sprints.controller.js`
- `src/modules/sprints/sprints.service.js`
- `src/modules/roadmap/roadmap.routes.js`
- `src/modules/roadmap/roadmap.controller.js`
- `src/modules/roadmap/roadmap.service.js`
- `src/models/sprint.model.js`

### Typical behavior
- Tasks can be grouped into a sprint.
- Sprint data can be used to monitor delivery progress.
- Roadmap routes provide a broader planning layer beyond individual tasks.

## 7. Workflow Management

Workflows define how tasks or process items move between statuses.

### What it does
- Define workflow states
- Define transitions between states
- Apply workflow structure to task flow

### Why it matters
Different teams work differently. Workflows make the task lifecycle configurable instead of forcing one fixed status model for every workspace.

### Important backend pieces
- `src/modules/workflow/workflow.routes.js`
- `src/modules/workflow/workflow.controller.js`
- `src/modules/workflow/workflow.service.js`
- `src/models/workflow.model.js`
- `src/models/workflowStatus.model.js`
- `src/models/workflowTransition.model.js`

### Typical behavior
- A workspace can define custom process stages.
- A task can move only through allowed transitions.
- Workflow structure can enforce business rules around approvals or stage movement.

## 8. CRM Features

The backend includes CRM-style entities for sales and relationship management.

### What it does
- Manage leads
- Manage contacts
- Manage clients
- Track campaigns

### Why it matters
This makes the backend more than a project tracker. It can also support sales pipelines and customer relationship workflows.

### Important backend pieces
- `src/modules/leads/leads.routes.js`
- `src/modules/leads/leads.service.js`
- `src/modules/contacts/contacts.routes.js`
- `src/modules/contacts/contacts.service.js`
- `src/modules/clients/clients.routes.js`
- `src/modules/clients/clients.service.js`
- `src/modules/campaigns/campaigns.routes.js`
- `src/modules/campaigns/campaigns.service.js`
- `src/models/lead.model.js`
- `src/models/contact.model.js`
- `src/models/client.model.js`
- `src/models/campaign.model.js`

### Typical behavior
- A lead is created and tracked through follow-up stages.
- A lead can become a contact or client.
- Campaign records support outreach or marketing activity tracking.

## 9. Teams and People Management

The backend has dedicated modules for internal organization.

### What it does
- Manage teams
- Manage employees
- Manage users
- Support user assignment and organizational grouping

### Why it matters
Teams and people management make it easier to assign tasks, organize responsibilities, and structure access.

### Important backend pieces
- `src/modules/teams/teams.routes.js`
- `src/modules/teams/teams.service.js`
- `src/modules/employees/employees.routes.js`
- `src/modules/employees/employees.service.js`
- `src/modules/users/users.routes.js`
- `src/modules/users/users.service.js`
- `src/models/team.model.js`
- `src/models/employee.model.js`
- `src/models/user.model.js`

### Typical behavior
- A workspace can define teams for different functions.
- Employees or users can be linked to teams.
- Team grouping helps with task ownership and reporting.

## 10. My Tasks

This module gives each user a personal task view.

### What it does
- Shows tasks assigned to the current user
- Creates a user-centered work queue

### Why it matters
Not every user wants to browse project-by-project. A personal task view helps each person focus on their own workload.

### Important backend pieces
- `src/modules/myTasks/myTasks.routes.js`
- `src/modules/myTasks/myTasks.controller.js`
- `src/modules/myTasks/myTasks.service.js`

## 11. Dashboard and Analytics

These features turn raw task and workspace data into summary views and metrics.

### What it does
- Dashboard summaries
- Analytics snapshots
- Reporting data for progress and performance

### Why it matters
Users and managers need quick visibility into workload, progress, and trends. These endpoints power the overview pages in the frontend.

### Important backend pieces
- `src/modules/dashboard/dashboard.routes.js`
- `src/modules/dashboard/dashboard.controller.js`
- `src/modules/dashboard/dashboard.service.js`
- `src/modules/analytics/analytics.routes.js`
- `src/modules/analytics/analytics.controller.js`
- `src/modules/analytics/analytics.service.js`
- `src/models/analyticsSnapshot.model.js`

### Typical behavior
- The dashboard returns a snapshot of the workspace state.
- Analytics data can be stored and reused for charts or reporting.
- Summary views reduce the need for the frontend to assemble too much data itself.

## 12. Notifications

Notifications keep users informed when work changes.

### What it does
- Create notifications
- List notifications
- Schedule automated notification jobs
- Send realtime updates through Socket.IO

### Why it matters
This keeps the app responsive and collaborative. Users should know when tasks change, comments are added, or important activity happens.

### Important backend pieces
- `src/modules/notifications/notifications.routes.js`
- `src/modules/notifications/notifications.controller.js`
- `src/modules/notifications/notifications.service.js`
- `src/modules/notifications/notifications.scheduler.js`
- `src/models/notification.model.js`
- `src/sockets/index.js`

### Typical behavior
- An action creates a notification record.
- The scheduler can process delayed or queued notification tasks.
- Socket.IO can push updates to connected clients in real time.

## 13. Activity Tracking

Activity tracking records what happened in the system.

### What it does
- Store change history
- Track important actions across modules
- Support audit and timeline views

### Why it matters
Activity logs help teams understand who changed what and when. They are useful for transparency, debugging, and accountability.

### Important backend pieces
- `src/modules/activity/activity.routes.js`
- `src/modules/activity/activity.controller.js`
- `src/modules/activity/activity.service.js`
- `src/modules/activity/activity.query.service.js`
- `src/models/activity.model.js`
- `src/models/auditLog.model.js`

## 14. Attachments and File Handling

The backend supports uploads and attachment records for tasks and related entities.

### What it does
- Upload task images or files
- Attach uploaded items to tasks
- Add attachment URLs
- Remove attachments

### Why it matters
Teams often need supporting files, screenshots, or documents tied directly to a work item.

### Important backend pieces
- `src/modules/attachments/attachments.routes.js`
- `src/modules/attachments/attachments.controller.js`
- `src/modules/attachments/attachments.service.js`
- `src/middlewares/uploadMiddleware.js`
- `src/models/attachment.model.js`
- `src/models/taskAttachment.model.js`

### Notes
- The README states task uploads are limited to 3 image files per task.
- Upload validation helps keep file handling controlled and secure.

## 15. Search

The search module provides a way to find records across the workspace.

### What it does
- Search workspace data
- Help users quickly find tasks, projects, leads, or other records

### Why it matters
Search is a productivity feature. It reduces the time users spend navigating large workspaces.

### Important backend pieces
- `src/modules/search/search.routes.js`
- `src/modules/search/search.controller.js`
- `src/modules/search/search.service.js`

## 16. Custom Fields and Labels

These features make the backend flexible for different teams and workflows.

### What it does
- Define custom fields
- Store workspace-specific field definitions
- Tag records with labels

### Why it matters
Not every team tracks the same data. Custom fields let the system adapt to different business processes without changing the database model every time.

### Important backend pieces
- `src/modules/customFields/customFields.routes.js`
- `src/modules/customFields/customFields.service.js`
- `src/models/customFieldDefinition.model.js`
- `src/modules/labels/labels.routes.js`
- `src/modules/labels/labels.service.js`
- `src/models/label.model.js`

## 17. Security and Admin Controls

The backend contains layered security features for ordinary users, workspace admins, and super admins.

### What it does
- Permission checks
- Role-based access control
- Security settings
- Sessions and API keys
- Super admin endpoints
- Security-related models and audit history

### Why it matters
This protects workspace data and separates normal product usage from elevated admin functionality.

### Important backend pieces
- `src/modules/security/security.routes.js`
- `src/modules/security/security.service.js`
- `src/modules/superAdmin/superAdmin.routes.js`
- `src/modules/superAdmin/superAdmin.service.js`
- `src/modules/superAdmin/superAdmin.validation.js`
- `src/middlewares/rbac.js`
- `src/middlewares/superAdminAuth.js`
- `src/models/securitySession.model.js`
- `src/models/securityApiKey.model.js`
- `src/models/superAdmin.model.js`
- `src/models/auditLog.model.js`

## 18. Invites

Invite handling lets workspace owners bring new users into the system.

### What it does
- Create workspace invites
- Look up invite information by token
- Accept invites
- Send invite-related emails

### Why it matters
This is the onboarding path for new teammates and collaborators.

### Important backend pieces
- `src/modules/invites/invites.routes.js`
- `src/modules/invites/invites.controller.js`
- `src/modules/invites/invites.service.js`
- `src/modules/invites/invites.schemas.js`
- `src/models/workspaceInvite.model.js`
- `src/modules/auth/auth.mailer.js`

## 19. Settings

Settings let users and workspaces control preferences and configuration.

### What it does
- Manage profile settings
- Manage notification preferences
- Manage workspace-related settings
- Support security-related settings

### Why it matters
Settings give the backend a place to store user preferences and workspace configuration without hardcoding behavior.

### Important backend pieces
- `src/modules/settings/settings.routes.js`
- `src/modules/settings/settings.controller.js`
- `src/modules/settings/settings.service.js`
- `src/models/settingPreference.model.js`
- `src/models/settingProfile.model.js`

## 20. Realtime Communication

The backend is not only REST-based. It also uses Socket.IO for live events.

### What it does
- Join workspace rooms
- Broadcast task updates
- Broadcast comment events
- Refresh board and dashboard views in real time

### Why it matters
Realtime updates make collaboration feel instant. Users do not need to refresh the page to see changes.

### Important backend pieces
- `server.js`
- `src/sockets/index.js`
- `src/sockets/emitters.js`
- `src/sockets/rooms.js`

## 21. Infrastructure and Startup Behavior

The startup code is part of the product behavior because it wires together all core services.

### What it does
- Loads environment variables
- Connects to MongoDB
- Starts the HTTP server
- Configures Socket.IO
- Enables Redis adapter support when available
- Starts the notification scheduler
- Runs workspace integrity repair if enabled
- Handles graceful shutdown

### Why it matters
This makes the backend production-aware. It can start, recover, and shut down cleanly while keeping core services coordinated.

### Important backend pieces
- `server.js`
- `src/app.js`
- `src/config/db.js`
- `src/config/redis.js`
- `src/modules/notifications/notifications.scheduler.js`
- `src/services/workspaceIntegrity.service.js`

## 22. Shared Backend Patterns

Several shared patterns are used throughout the codebase.

### Common patterns
- Controllers handle HTTP requests and responses.
- Services contain business logic.
- Routes connect URLs to controllers.
- Schemas validate incoming data.
- Middlewares handle auth, permissions, uploads, and sanitization.
- Models define database structure.

### Why it matters
This keeps the backend modular. It also makes the codebase easier to maintain because each feature follows a predictable structure.

## Summary

SaleVision Backend combines:
- authentication
- workspace isolation
- project and task management
- CRM data
- comments and notifications
- analytics and dashboards
- roles and security
- realtime collaboration
- uploads and attachments

That combination makes it a multi-tenant collaboration and sales operations backend rather than a simple CRUD API.
