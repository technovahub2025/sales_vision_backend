import { ok } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { workspacesService } from './workspaces.service.js';

export const workspacesController = {
  list: asyncHandler(async (req, res) => {
    const data = await workspacesService.list({ userId: req.auth.userId });
    return res.status(200).json(ok(data));
  }),

  create: asyncHandler(async (req, res) => {
    const data = await workspacesService.create({
      actorId: req.auth.userId,
      body: req.body,
      req,
      io: req.app.locals.io,
    });
    return res.status(201).json(ok(data, 'Workspace created'));
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await workspacesService.getById({
      workspaceId: req.params.workspaceId,
      userId: req.auth.userId,
    });
    return res.status(200).json(ok(data));
  }),

  update: asyncHandler(async (req, res) => {
    const data = await workspacesService.update({
      workspaceId: req.params.workspaceId,
      actorId: req.auth.userId,
      body: req.body,
      req,
      io: req.app.locals.io,
    });
    return res.status(200).json(ok(data, 'Workspace updated'));
  }),

  remove: asyncHandler(async (req, res) => {
    const data = await workspacesService.remove({
      workspaceId: req.params.workspaceId,
      actorId: req.auth.userId,
      req,
      io: req.app.locals.io,
    });
    return res.status(200).json(ok(data, 'Workspace deleted'));
  }),

  listMembers: asyncHandler(async (req, res) => {
    const data = await workspacesService.listMembers({ workspaceId: req.params.workspaceId });
    return res.status(200).json(ok(data));
  }),

  inviteMember: asyncHandler(async (req, res) => {
    const data = await workspacesService.inviteMember({
      workspaceId: req.params.workspaceId,
      actorId: req.auth.userId,
      body: req.body,
      req,
    });
    return res.status(201).json(ok(data, 'Invite created'));
  }),

  updateMember: asyncHandler(async (req, res) => {
    const data = await workspacesService.updateMember({
      workspaceId: req.params.workspaceId,
      actorId: req.auth.userId,
      userId: req.params.userId,
      body: req.body,
      req,
      io: req.app.locals.io,
    });
    return res.status(200).json(ok(data, 'Member updated'));
  }),

  removeMember: asyncHandler(async (req, res) => {
    const data = await workspacesService.removeMember({
      workspaceId: req.params.workspaceId,
      actorId: req.auth.userId,
      userId: req.params.userId,
      req,
      io: req.app.locals.io,
    });
    return res.status(200).json(ok(data, 'Member removed'));
  }),

  auditLog: asyncHandler(async (req, res) => {
    const data = await workspacesService.auditLog({
      workspaceId: req.params.workspaceId,
      query: req.query,
    });
    return res.status(200).json(ok(data.items, { ...data.meta }));
  }),

  activity: asyncHandler(async (req, res) => {
    const data = await workspacesService.activity({
      workspaceId: req.params.workspaceId,
      query: req.query,
    });
    return res.status(200).json(ok(data.items, { ...data.meta }));
  }),
};

