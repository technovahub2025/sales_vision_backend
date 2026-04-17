import mongoose from 'mongoose';
import { Workspace } from '../models/workspace.model.js';

export async function resolveWorkspaceId(workspaceKey) {
  if (!workspaceKey) {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(workspaceKey)) {
    const byId = await Workspace.findById(workspaceKey).lean();
    if (byId) {
      return String(byId._id);
    }
  }

  const bySlug = await Workspace.findOne({ slug: workspaceKey }).lean();
  if (bySlug) {
    return String(bySlug._id);
  }

  return null;
}

export async function ensureWorkspace(workspaceKey) {
  const existingId = await resolveWorkspaceId(workspaceKey);
  if (existingId) {
    return existingId;
  }

  const slug = workspaceKey || 'enterprise-core';
  const workspace = await Workspace.create({
    name: 'Enterprise Core',
    slug,
    settings: {
      timezone: 'Asia/Kolkata',
      dateFormat: 'MMM DD, YYYY',
    },
  });

  return String(workspace._id);
}
