import { createCrudController } from '../createCrudController.js';
import { tasksService } from './tasks.service.js';
import { attachmentsService } from '../attachments/attachments.service.js';
import { ok, fail } from '../../utils/apiResponse.js';

export const tasksController = createCrudController(tasksService);

tasksController.create = async (req, res, next) => {
  try {
    const task = await tasksService.create({
      workspaceId: req.workspaceId,
      data: req.body,
      io: req.app.locals.io,
    });
    return res.status(201).json(ok(task));
  } catch (error) {
    const message = String(error?.message || '');
    if (
      message.includes('title is required') ||
      message.includes('projectId is required') ||
      message.includes('invalid priority') ||
      message.includes('invalid issue type') ||
      message.includes('epic cannot have a parent') ||
      message.includes('subtask must have a parent task') ||
      message.includes('task parent must be an epic') ||
      message.includes('subtask parent must be a task') ||
      message.includes('task cannot be parent of itself') ||
      message.includes('parent task not found') ||
      message.includes('assignee must be an active workspace member') ||
      message.includes('primary assignee must be an active workspace member') ||
      message.includes('invalid contact collaborator') ||
      message.includes('invalid employee collaborator') ||
      message.includes('invalid external collaborator type') ||
      message.includes('Sub-task depth limit exceeded') ||
      message.includes('Custom field')
    ) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (message.includes('project not found')) {
      return res.status(404).json(fail('Project not found', 'NOT_FOUND'));
    }
    return next(error);
  }
};

tasksController.updateStatus = async (req, res, next) => {
  try {
    const { status, statusId } = req.body;
    if (!status && !statusId) {
      return res.status(400).json(fail('status or statusId is required', 'VALIDATION_ERROR'));
    }

    const task = await tasksService.update({
      workspaceId: req.workspaceId,
      id: req.params.taskId,
      data: { status, statusId },
      io: req.app.locals.io,
    });
    if (!task) {
      return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
    }
    return res.status(200).json(ok(task));
  } catch (error) {
    const message = String(error?.message || '');
    if (
      message.includes('Approval pending') ||
      message.includes('Blocked by open dependencies') ||
      message.includes('Invalid workflow transition')
    ) {
      return res.status(409).json(fail(message, 'CONFLICT'));
    }
    return next(error);
  }
};

tasksController.update = async (req, res, next) => {
  try {
    const task = await tasksService.update({
      workspaceId: req.workspaceId,
      id: req.params.id,
      data: req.body,
      io: req.app.locals.io,
    });
    if (!task) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
    return res.status(200).json(ok(task));
  } catch (error) {
    const message = String(error?.message || '');
    if (
      message.includes('invalid priority') ||
      message.includes('invalid issue type') ||
      message.includes('epic cannot have a parent') ||
      message.includes('subtask must have a parent task') ||
      message.includes('task parent must be an epic') ||
      message.includes('subtask parent must be a task') ||
      message.includes('task cannot be parent of itself') ||
      message.includes('parent task not found') ||
      message.includes('assignee must be an active workspace member') ||
      message.includes('primary assignee must be an active workspace member') ||
      message.includes('invalid contact collaborator') ||
      message.includes('invalid employee collaborator') ||
      message.includes('invalid external collaborator type') ||
      message.includes('Sub-task depth limit exceeded') ||
      message.includes('Custom field')
    ) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (
      message.includes('Approval pending') ||
      message.includes('Blocked by open dependencies') ||
      message.includes('Invalid workflow transition')
    ) {
      return res.status(409).json(fail(message, 'CONFLICT'));
    }
    return next(error);
  }
};

tasksController.bulkUpdate = async (req, res, next) => {
  try {
    const result = await tasksService.bulkUpdate({
      workspaceId: req.workspaceId,
      taskIds: req.body?.taskIds || [],
      updates: req.body?.updates || {},
      action: req.body?.action,
      io: req.app.locals.io,
    });
    return res.status(200).json(ok(result));
  } catch (error) {
    const message = String(error?.message || '');
    if (
      message.includes('invalid priority') ||
      message.includes('invalid issue type') ||
      message.includes('epic cannot have a parent') ||
      message.includes('subtask must have a parent task') ||
      message.includes('task parent must be an epic') ||
      message.includes('subtask parent must be a task') ||
      message.includes('task cannot be parent of itself') ||
      message.includes('parent task not found') ||
      message.includes('assignee must be an active workspace member') ||
      message.includes('primary assignee must be an active workspace member') ||
      message.includes('invalid contact collaborator') ||
      message.includes('invalid employee collaborator') ||
      message.includes('invalid external collaborator type') ||
      message.includes('Invalid workflow transition') ||
      message.includes('Approval pending') ||
      message.includes('Blocked by open dependencies')
    ) {
      return res.status(409).json(fail(message, 'CONFLICT'));
    }
    return next(error);
  }
};

tasksController.listAttachments = async (req, res, next) => {
  try {
    const { items, meta } = await attachmentsService.list({
      workspaceId: req.workspaceId,
      entityType: 'task',
      taskId: req.params.taskId,
      entityId: req.params.taskId,
      query: req.query,
    });
    return res.status(200).json(ok(items, meta));
  } catch (error) {
    return next(error);
  }
};

tasksController.createAttachment = async (req, res, next) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json(fail('files are required', 'VALIDATION_ERROR'));
    }
    const attachments = await attachmentsService.uploadMany({
      workspaceId: req.workspaceId,
      entityType: 'task',
      entityId: req.params.taskId,
      files: req.files || [],
      user: req.user,
      io: req.app.locals.io,
    });
    if (!attachments) {
      return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
    }
    return res.status(201).json(ok(attachments));
  } catch (error) {
    return next(error);
  }
};

tasksController.removeAttachment = async (req, res, next) => {
  try {
    const item = await attachmentsService.remove({
      workspaceId: req.workspaceId,
      entityType: 'task',
      entityId: req.params.taskId,
      attachmentId: req.params.attachmentId,
      io: req.app.locals.io,
    });
    if (!item) return res.status(404).json(fail('Attachment not found', 'NOT_FOUND'));
    return res.status(200).json(ok(item));
  } catch (error) {
    return next(error);
  }
};

tasksController.startTimer = async (req, res, next) => {
  try {
    const employeeId = req.body?.employeeId;
    const userId = req.body?.userId || req.user?._id || req.auth?.userId;
    if (!userId) {
      return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
    }
    const data = await tasksService.startTimer({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      employeeId,
      userId,
      description: req.body?.description,
      io: req.app.locals.io,
    });
    return res.status(201).json(ok(data));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('Invalid user identity for timer')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (message.includes('Task not found') || message.includes('Employee not found')) {
      return res.status(404).json(fail(message, 'NOT_FOUND'));
    }
    if (message.includes('Timer already running')) {
      return res.status(409).json(fail(message, 'CONFLICT'));
    }
    return next(error);
  }
};

tasksController.stopTimer = async (req, res, next) => {
  try {
    const employeeId = req.body?.employeeId;
    const userId = req.body?.userId || req.user?._id || req.auth?.userId;
    if (!userId) {
      return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
    }
    const data = await tasksService.stopTimer({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      employeeId,
      userId,
      io: req.app.locals.io,
    });
    return res.status(200).json(ok(data));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('Invalid user identity for timer')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (message.includes('No active timer found') || message.includes('Employee not found')) {
      return res.status(404).json(fail(message, 'NOT_FOUND'));
    }
    return next(error);
  }
};

tasksController.pauseTimer = async (req, res, next) => {
  try {
    const employeeId = req.body?.employeeId;
    const userId = req.body?.userId || req.user?._id || req.auth?.userId;
    if (!userId) {
      return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
    }
    const data = await tasksService.pauseTimer({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      employeeId,
      userId,
      io: req.app.locals.io,
    });
    return res.status(200).json(ok(data));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('Invalid user identity for timer')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (message.includes('No active timer found') || message.includes('Employee not found')) {
      return res.status(404).json(fail(message, 'NOT_FOUND'));
    }
    return next(error);
  }
};

tasksController.resumeTimer = async (req, res, next) => {
  try {
    const employeeId = req.body?.employeeId;
    const userId = req.body?.userId || req.user?._id || req.auth?.userId;
    if (!userId) {
      return res.status(400).json(fail('userId is required', 'VALIDATION_ERROR'));
    }
    const data = await tasksService.resumeTimer({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      employeeId,
      userId,
      io: req.app.locals.io,
    });
    return res.status(200).json(ok(data));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('Invalid user identity for timer')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (message.includes('No paused timer found') || message.includes('Employee not found')) {
      return res.status(404).json(fail(message, 'NOT_FOUND'));
    }
    return next(error);
  }
};

tasksController.createManualTimeLog = async (req, res, next) => {
  try {
    const employeeId = req.body?.employeeId;
    const userId = req.body?.userId || req.user?._id || req.auth?.userId;
    if (!userId || !req.body?.startTime || !req.body?.endTime) {
      return res.status(400).json(fail('userId, startTime, endTime are required', 'VALIDATION_ERROR'));
    }
    const data = await tasksService.createManualTimeLog({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      employeeId,
      userId,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      description: req.body?.description,
      io: req.app.locals.io,
    });
    return res.status(201).json(ok(data));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('Invalid user identity for timer')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    if (message.includes('Task not found') || message.includes('Employee not found')) {
      return res.status(404).json(fail(message, 'NOT_FOUND'));
    }
    if (message.includes('Invalid time range')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    return next(error);
  }
};

tasksController.listTaskTimeLogs = async (req, res, next) => {
  try {
    const data = await tasksService.listTimeLogsByTask({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      userId: req.query?.userId || req.user?._id || req.auth?.userId || null,
    });
    return res.status(200).json(ok(data.items, data.summary));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('Invalid user identity for timer')) {
      return res.status(400).json(fail(message, 'VALIDATION_ERROR'));
    }
    return next(error);
  }
};

tasksController.getDependencies = async (req, res, next) => {
  try {
    const { items, topologicalOrder } = await tasksService.dependencies({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
    });
    return res.status(200).json(ok(items, { total: items.length, topologicalOrder }));
  } catch (error) {
    return next(error);
  }
};

tasksController.addDependency = async (req, res, next) => {
  try {
    const item = await tasksService.addDependency({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      data: req.body,
      io: req.app.locals.io,
    });
    return res.status(201).json(ok(item));
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('dependsOnTaskId is required')) {
      return res.status(400).json(fail('dependsOnTaskId is required', 'VALIDATION_ERROR'));
    }
    if (message.includes('Circular dependency detected')) {
      return res.status(409).json(fail('Circular dependency detected', 'CONFLICT'));
    }
    return next(error);
  }
};

tasksController.removeDependency = async (req, res, next) => {
  try {
    const item = await tasksService.removeDependency({
      workspaceId: req.workspaceId,
      id: req.params.dependencyId,
      io: req.app.locals.io,
    });
    if (!item) return res.status(404).json(fail('Dependency not found', 'NOT_FOUND'));
    return res.status(200).json(ok(item));
  } catch (error) {
    return next(error);
  }
};

tasksController.approve = async (req, res, next) => {
  try {
    const item = await tasksService.approve({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      data: {
        status: req.body?.status || 'approved',
        actorId: req.body?.actorId || req.user?._id,
      },
      io: req.app.locals.io,
    });
    if (!item) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
    return res.status(200).json(ok(item));
  } catch (error) {
    return next(error);
  }
};

tasksController.addAttachmentUrl = async (req, res, next) => {
  try {
    const item = await tasksService.addAttachmentUrl({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      data: req.body,
      io: req.app.locals.io,
    });
    if (!item) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
    return res.status(201).json(ok(item));
  } catch (error) {
    if (String(error?.message || '').includes('url and filename are required')) {
      return res.status(400).json(fail('url and filename are required', 'VALIDATION_ERROR'));
    }
    return next(error);
  }
};

tasksController.removeAttachmentUrl = async (req, res, next) => {
  try {
    const item = await tasksService.removeAttachmentUrl({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      attachmentId: req.params.attachmentId,
      io: req.app.locals.io,
    });
    if (!item) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
    return res.status(200).json(ok(item));
  } catch (error) {
    return next(error);
  }
};

tasksController.duplicate = async (req, res, next) => {
  try {
    const item = await tasksService.duplicate({
      workspaceId: req.workspaceId,
      id: req.params.taskId,
      io: req.app.locals.io,
    });
    if (!item) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
    return res.status(201).json(ok(item));
  } catch (error) {
    return next(error);
  }
};

tasksController.activity = async (req, res, next) => {
  try {
    const { items, meta } = await tasksService.getActivity({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      query: req.query,
    });
    return res.status(200).json(ok(items, meta));
  } catch (error) {
    return next(error);
  }
};

tasksController.setEstimate = async (req, res, next) => {
  try {
    const item = await tasksService.setEstimate({
      workspaceId: req.workspaceId,
      taskId: req.params.taskId,
      minutes: req.body.minutes,
      io: req.app.locals.io,
    });
    if (!item) return res.status(404).json(fail('Task not found', 'NOT_FOUND'));
    return res.status(200).json(ok(item));
  } catch (error) {
    return next(error);
  }
};

tasksController.exportCsv = async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks-export.csv"');
    await tasksService.exportCsv({
      workspaceId: req.workspaceId,
      query: req.query,
      write: (chunk) => res.write(chunk),
    });
    return res.end();
  } catch (error) {
    if (!res.headersSent) {
      return next(error);
    }
    return res.end();
  }
};
