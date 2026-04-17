# SaleVision Backend

Backend service for the SaleVision frontend with MongoDB + Socket.IO realtime updates.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set values:

```bash
cp .env.example .env
```

3. Start dev server:

```bash
npm run dev
```

## Email Configuration (Gmail)

The backend sends invitation, welcome, and password-reset emails through Gmail SMTP.
Set these environment variables:

```bash
MAIL_PROVIDER=gmail
MAIL_FROM_EMAIL=nexisonservices@gmail.com
MAIL_FROM_NAME="Nexison Services"
MAIL_GMAIL_APP_PASSWORD=your_16_char_gmail_app_password
APP_URL=http://localhost:5173
```

Notes:
- `MAIL_GMAIL_APP_PASSWORD` must be a Google App Password from the same Gmail account.
- `APP_URL` is used for invite and reset-password links (`/invite/:token`, `/reset-password/:token`).

## API Endpoints

### v1 Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET /api/v1/auth/me`

### v1 Workspace-scoped (JWT + membership required)

- `/api/v1/workspaces/:workspaceId/...`
- Uses middleware order: `requireAuth` -> `workspaceResolver` -> `requireWorkspaceMembership`

- `GET /api/health`
- `GET /api/workspaces/:workspaceId/dashboard`
- `GET /api/workspaces/:workspaceId/projects/:projectId/board`
- `PATCH /api/workspaces/:workspaceId/tasks/:taskId/status`
- `GET /api/workspaces/:workspaceId/tasks/:taskId`
- `GET /api/workspaces/:workspaceId/tasks/:taskId/comments`
- `POST /api/workspaces/:workspaceId/tasks/:taskId/comments`
- `POST /api/workspaces/:workspaceId/seed` (disabled in production)

## Realtime Events

Client emits:

- `workspace:join` `{ workspaceId, projectId? }`

Server emits:

- `workspace:joined`
- `task:updated`
- `comment:created`
- `board:refreshed`
- `dashboard:refreshed`

## Seed Flow

Use the seed endpoint once in development to populate a workspace.
The frontend bootstraps this automatically when no project is configured.
