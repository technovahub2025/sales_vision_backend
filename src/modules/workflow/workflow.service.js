import mongoose from 'mongoose';
import { Workflow } from '../../models/workflow.model.js';
import { WorkflowStatus } from '../../models/workflowStatus.model.js';
import { WorkflowTransition } from '../../models/workflowTransition.model.js';
import { appendActivity } from '../activity/activity.service.js';
import { emitDomainEvent } from '../../sockets/emitters.js';

function toObjectId(value) {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

export const FINAL_STATUS_KEYS = new Set(['completed', 'done', 'closed', 'won', 'lost']);
const DEFAULT_TASK_STATUSES = [
  { key: 'todo', name: 'To Do', order: 1, color: '#94A3B8', isFinal: false },
  { key: 'in_progress', name: 'In Progress', order: 2, color: '#2563EB', isFinal: false },
  { key: 'in_review', name: 'In Review', order: 3, color: '#F59E0B', isFinal: false },
  { key: 'completed', name: 'Completed', order: 4, color: '#16A34A', isFinal: true },
];

async function resolveWorkflowRecord({ workspaceId, workflowId, entityType = 'task' }) {
  const workflowObj = toObjectId(workflowId);
  if (workflowObj) {
    const workflow = await Workflow.findOne(
      { workspaceId, _id: workflowObj, entityType, isArchived: { $ne: true } },
      { _id: 1, entityType: 1 },
    ).lean();
    if (workflow) return workflow;
  }

  const fallback = await Workflow.findOne(
    { workspaceId, entityType, isDefault: true, isArchived: { $ne: true } },
    { _id: 1, entityType: 1 },
  ).lean();
  return fallback || null;
}

async function resolveStatusByAny({ workspaceId, workflowId, statusId, statusKey }) {
  if (!workflowId) return null;

  const statusObj = toObjectId(statusId);
  if (statusObj) {
    const status = await WorkflowStatus.findOne(
      {
        workspaceId,
        workflowId,
        _id: statusObj,
        isArchived: { $ne: true },
      },
      { _id: 1, workflowId: 1, key: 1, isFinal: 1 },
    ).lean();
    if (status) return status;
  }

  if (statusKey) {
    const status = await WorkflowStatus.findOne(
      {
        workspaceId,
        workflowId,
        key: String(statusKey),
        isArchived: { $ne: true },
      },
      { _id: 1, workflowId: 1, key: 1, isFinal: 1 },
    ).lean();
    if (status) return status;
  }

  return null;
}

export async function resolveTaskStatus({ workspaceId, workflowId, statusId, statusKey }) {
  const workflow = await resolveWorkflowRecord({ workspaceId, workflowId, entityType: 'task' });
  if (!workflow) {
    const key = statusKey ? String(statusKey) : null;
    return {
      workflowId: null,
      statusId: null,
      key,
      isFinal: key ? FINAL_STATUS_KEYS.has(key) : false,
      resolvedByWorkflow: false,
    };
  }

  const status = await resolveStatusByAny({
    workspaceId,
    workflowId: workflow._id,
    statusId,
    statusKey,
  });

  if (!status) {
    const key = statusKey ? String(statusKey) : null;
    return {
      workflowId: workflow._id,
      statusId: null,
      key,
      isFinal: key ? FINAL_STATUS_KEYS.has(key) : false,
      resolvedByWorkflow: false,
    };
  }

  return {
    workflowId: workflow._id,
    statusId: status._id,
    key: status.key,
    isFinal: Boolean(status.isFinal),
    resolvedByWorkflow: true,
  };
}

export async function validateTransition({ workspaceId, workflowId, fromStatusId, toStatusId }) {
  const workflowObj = toObjectId(workflowId);
  const fromObj = toObjectId(fromStatusId);
  const toObj = toObjectId(toStatusId);
  if (!workflowObj || !toObj) return true;

  if (fromObj && String(fromObj) === String(toObj)) return true;

  const transitionCount = await WorkflowTransition.countDocuments({
    workspaceId,
    workflowId: workflowObj,
    isArchived: { $ne: true },
  });

  if (!transitionCount) return true;

  const allowed = await WorkflowTransition.findOne(
    {
      workspaceId,
      workflowId: workflowObj,
      fromStatusId: fromObj || null,
      toStatusId: toObj,
      isArchived: { $ne: true },
    },
    { _id: 1 },
  ).lean();

  return Boolean(allowed);
}

async function defaultTaskWorkflow(workspaceId) {
  let workflow = await Workflow.findOne(
    { workspaceId, entityType: 'task', isDefault: true, isArchived: { $ne: true } },
    { _id: 1, workspaceId: 1, entityType: 1, name: 1, isDefault: 1 },
  ).lean();

  if (!workflow) {
    const created = await Workflow.create({
      workspaceId,
      entityType: 'task',
      name: 'Default Task Workflow',
      description: 'System default task workflow',
      isDefault: true,
    });
    workflow = {
      _id: created._id,
      workspaceId: created.workspaceId,
      entityType: created.entityType,
      name: created.name,
      isDefault: created.isDefault,
    };
  }

  const statuses = [];
  for (const status of DEFAULT_TASK_STATUSES) {
    const existing = await WorkflowStatus.findOne(
      { workspaceId, workflowId: workflow._id, key: status.key, isArchived: { $ne: true } },
      { _id: 1, workflowId: 1, key: 1, name: 1, order: 1, color: 1, isFinal: 1 },
    ).lean();

    if (existing) {
      statuses.push(existing);
      continue;
    }

    const created = await WorkflowStatus.create({
      workspaceId,
      workflowId: workflow._id,
      ...status,
    });
    statuses.push({
      _id: created._id,
      workflowId: created.workflowId,
      key: created.key,
      name: created.name,
      order: created.order,
      color: created.color,
      isFinal: created.isFinal,
    });
  }

  const statusMap = new Map(statuses.map((status) => [status.key, status]));
  const transitionsToEnsure = [
    ['todo', 'in_progress'],
    ['in_progress', 'in_review'],
    ['in_review', 'completed'],
    ['in_review', 'in_progress'],
    ['in_progress', 'todo'],
  ];

  for (const [fromKey, toKey] of transitionsToEnsure) {
    const from = statusMap.get(fromKey);
    const to = statusMap.get(toKey);
    if (!from || !to) continue;

    const exists = await WorkflowTransition.findOne(
      {
        workspaceId,
        workflowId: workflow._id,
        fromStatusId: from._id,
        toStatusId: to._id,
        isArchived: { $ne: true },
      },
      { _id: 1 },
    ).lean();
    if (exists) continue;

    await WorkflowTransition.create({
      workspaceId,
      workflowId: workflow._id,
      fromStatusId: from._id,
      toStatusId: to._id,
    });
  }

  return { workflow, statuses };
}

async function listWorkflows({ workspaceId, entityType = 'task' }) {
  const items = await Workflow.find(
    { workspaceId, entityType, isArchived: { $ne: true } },
    { entityType: 1, name: 1, description: 1, isDefault: 1, updatedAt: 1, createdAt: 1 },
  )
    .sort({ isDefault: -1, updatedAt: -1 })
    .lean();
  return { items, meta: { total: items.length } };
}

async function createWorkflow({ workspaceId, data, io }) {
  const name = String(data?.name || '').trim();
  const entityType = data?.entityType === 'lead' ? 'lead' : 'task';
  if (!name) throw new Error('name is required');

  const created = await Workflow.create({
    workspaceId,
    entityType,
    name,
    description: String(data?.description || ''),
    isDefault: Boolean(data?.isDefault),
  });

  if (created.isDefault) {
    await Workflow.updateMany(
      { workspaceId, entityType, _id: { $ne: created._id } },
      { $set: { isDefault: false } },
    );
  }

  const workflow = await Workflow.findById(
    created._id,
    { entityType: 1, name: 1, description: 1, isDefault: 1, updatedAt: 1, createdAt: 1 },
  ).lean();

  await appendActivity({
    workspaceId,
    module: 'workflow',
    action: 'created',
    entity: 'workflow',
    entityId: workflow._id,
    payload: workflow,
  });
  emitDomainEvent(io, { workspaceId, moduleName: 'workflow', entity: 'workflow', action: 'created', data: workflow });
  emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: 'workflow', action: 'created' } });

  return workflow;
}

async function listStatuses({ workspaceId, workflowId }) {
  const workflowObj = toObjectId(workflowId);
  if (!workflowObj) throw new Error('invalid workflowId');
  const items = await WorkflowStatus.find(
    { workspaceId, workflowId: workflowObj, isArchived: { $ne: true } },
    { workflowId: 1, key: 1, name: 1, order: 1, color: 1, isFinal: 1, updatedAt: 1 },
  )
    .sort({ order: 1, updatedAt: -1 })
    .lean();
  return { items, meta: { total: items.length } };
}

async function createStatus({ workspaceId, workflowId, data, io }) {
  const workflowObj = toObjectId(workflowId);
  if (!workflowObj) throw new Error('invalid workflowId');
  const key = String(data?.key || '').trim();
  const name = String(data?.name || '').trim();
  if (!key || !name) throw new Error('key and name are required');

  const created = await WorkflowStatus.create({
    workspaceId,
    workflowId: workflowObj,
    key,
    name,
    order: Number(data?.order || 0),
    color: data?.color || '#64748B',
    isFinal: Boolean(data?.isFinal),
  });

  const status = await WorkflowStatus.findById(
    created._id,
    { workflowId: 1, key: 1, name: 1, order: 1, color: 1, isFinal: 1, updatedAt: 1 },
  ).lean();

  await appendActivity({
    workspaceId,
    module: 'workflow',
    action: 'status_created',
    entity: 'workflow_status',
    entityId: status._id,
    payload: status,
  });
  emitDomainEvent(io, { workspaceId, moduleName: 'workflow', entity: 'workflow_status', action: 'created', data: status });
  emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: 'workflow_status', action: 'created' } });
  return status;
}

async function updateStatus({ workspaceId, workflowId, statusId, data, io }) {
  const workflowObj = toObjectId(workflowId);
  const statusObj = toObjectId(statusId);
  if (!workflowObj || !statusObj) throw new Error('invalid workflow/status id');

  const patch = {};
  if (data?.name !== undefined) patch.name = String(data.name || '').trim();
  if (data?.key !== undefined) patch.key = String(data.key || '').trim();
  if (data?.order !== undefined) patch.order = Number(data.order || 0);
  if (data?.color !== undefined) patch.color = String(data.color || '#64748B');
  if (data?.isFinal !== undefined) patch.isFinal = Boolean(data.isFinal);
  if (!Object.keys(patch).length) throw new Error('no fields to update');

  const status = await WorkflowStatus.findOneAndUpdate(
    { workspaceId, workflowId: workflowObj, _id: statusObj, isArchived: { $ne: true } },
    { $set: patch },
    { new: true, projection: { workflowId: 1, key: 1, name: 1, order: 1, color: 1, isFinal: 1, updatedAt: 1 } },
  ).lean();
  if (!status) return null;

  await appendActivity({
    workspaceId,
    module: 'workflow',
    action: 'status_updated',
    entity: 'workflow_status',
    entityId: status._id,
    payload: status,
  });
  emitDomainEvent(io, { workspaceId, moduleName: 'workflow', entity: 'workflow_status', action: 'updated', data: status });
  emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: 'workflow_status', action: 'updated' } });
  return status;
}

async function listTransitions({ workspaceId, workflowId }) {
  const workflowObj = toObjectId(workflowId);
  if (!workflowObj) throw new Error('invalid workflowId');

  const items = await WorkflowTransition.find(
    { workspaceId, workflowId: workflowObj, isArchived: { $ne: true } },
    { workflowId: 1, fromStatusId: 1, toStatusId: 1, updatedAt: 1 },
  )
    .sort({ updatedAt: -1 })
    .lean();

  return { items, meta: { total: items.length } };
}

async function createTransition({ workspaceId, workflowId, data, io }) {
  const workflowObj = toObjectId(workflowId);
  const fromStatusObj = toObjectId(data?.fromStatusId);
  const toStatusObj = toObjectId(data?.toStatusId);
  if (!workflowObj || !fromStatusObj || !toStatusObj) {
    throw new Error('fromStatusId and toStatusId are required');
  }

  const created = await WorkflowTransition.create({
    workspaceId,
    workflowId: workflowObj,
    fromStatusId: fromStatusObj,
    toStatusId: toStatusObj,
  });

  const item = await WorkflowTransition.findById(
    created._id,
    { workflowId: 1, fromStatusId: 1, toStatusId: 1, updatedAt: 1 },
  ).lean();

  await appendActivity({
    workspaceId,
    module: 'workflow',
    action: 'transition_created',
    entity: 'workflow_transition',
    entityId: item._id,
    payload: item,
  });
  emitDomainEvent(io, { workspaceId, moduleName: 'workflow', entity: 'workflow_transition', action: 'created', data: item });
  emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: 'workflow_transition', action: 'created' } });
  return item;
}

async function removeTransition({ workspaceId, workflowId, transitionId, io }) {
  const workflowObj = toObjectId(workflowId);
  const transitionObj = toObjectId(transitionId);
  if (!workflowObj || !transitionObj) throw new Error('invalid workflow/transition id');

  const item = await WorkflowTransition.findOneAndUpdate(
    { workspaceId, workflowId: workflowObj, _id: transitionObj, isArchived: { $ne: true } },
    { $set: { isArchived: true } },
    { new: true, projection: { workflowId: 1, fromStatusId: 1, toStatusId: 1, updatedAt: 1 } },
  ).lean();
  if (!item) return null;

  await appendActivity({
    workspaceId,
    module: 'workflow',
    action: 'transition_deleted',
    entity: 'workflow_transition',
    entityId: item._id,
    payload: item,
  });
  emitDomainEvent(io, { workspaceId, moduleName: 'workflow', entity: 'workflow_transition', action: 'deleted', data: item });
  emitDomainEvent(io, { workspaceId, moduleName: 'activity', entity: 'activity', action: 'appended', data: { entity: 'workflow_transition', action: 'deleted' } });
  return item;
}

export const workflowService = {
  ensureDefaultTaskWorkflow: defaultTaskWorkflow,
  listWorkflows,
  createWorkflow,
  listStatuses,
  createStatus,
  updateStatus,
  listTransitions,
  createTransition,
  removeTransition,
  resolveTaskStatus,
  validateTransition,
};
