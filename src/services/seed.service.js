import { Workspace } from '../models/workspace.model.js';
import { User } from '../models/user.model.js';
import { Project } from '../models/project.model.js';
import { Task } from '../models/task.model.js';
import { TaskComment } from '../models/taskComment.model.js';
import { Campaign } from '../models/campaign.model.js';
import { Lead } from '../models/lead.model.js';
import { Contact } from '../models/contact.model.js';
import { Employee } from '../models/employee.model.js';
import { SettingProfile } from '../models/settingProfile.model.js';
import { SettingPreference } from '../models/settingPreference.model.js';
import { SecuritySession } from '../models/securitySession.model.js';
import { SecurityApiKey } from '../models/securityApiKey.model.js';
import { AnalyticsSnapshot } from '../models/analyticsSnapshot.model.js';
import { Activity } from '../models/activity.model.js';
import { workflowService } from '../modules/workflow/workflow.service.js';
import bcrypt from 'bcryptjs';
import { WorkspaceMember } from '../models/workspaceMember.model.js';

const avatars = {
  sarah:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBRfX1IYgXrRY8sMBl-A5_RT5j8ELDGUMhHNBM_Hg8Y2ykm8Z_9JKPe-RKky4vcu64Z50d-nUpCg77sDZJvcyQIl_A7HFm8flq37crcXwz2y8xn96HK4BcY83gvJWl8TabEKXbALGxI7sDdeMhsJuYmbE6R7BN0vXXGblFeND2ow6xHgHQ5edUHuRBrbMMeCG4W-jXTXgEw5H2LvdWh2DAX-XK-84iIDjN_mIbnqPRTxTfeba5b6SN_DEuz89e9RsdaNhLbPgrGXoI',
  alex:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuA5V1d1j6AE1P8Tu4VzB4ElyaJWuBUnbZYDRvU9j2c7BdyEdVeD-zACCWnnqc6ZlphoZqyyIzLSeXwT9BJfksd14Ajk8Wgo095N9bW_1yt7Nu6Re0BJ89ftwKse-WUNJIKYqSLGPGw2MuohRolEu1Mn-xLGLyNn_j2lRuBRr_KipLKdrr2-vCHdiKmoAcewcP0LoEYIz1O9XsNUStDX4w3-RMdnpTrmJ5D_Nl4y2bPmE_-TFHk2Cq-qFNDtaNi_RO5H68qQ2vuvqAE',
  marcus:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCAZHbVg2tfHuFT6pyVQLCi7EjWXD_sehIf91lX8ceZHw9czYBgE3iV2pC4c7e25-erV0reZ06xNW4JQZoyWLyrEAEvSPFScN7Txs8ZdKwO_-0cYRffskViVn782Mvj8UB7PhwCACXYBl8Hivx5ZR6nCGrZbuBy4cLOZ-CEAHNCVdMml3KeOEmhf9HSQpEIVkOkWhjo0VOU9oeO_sI7cUV-JM6xUaWrUOO4cc0bvsPSV2RlnltcXTOi7yQW3NkdEfX8ZnAS4gceiu8',
};

async function ensureOne(model, filter, data) {
  const existing = await model.findOne(filter).lean();
  if (existing) return existing;
  const created = await model.create(data);
  return created.toObject();
}

export async function seedWorkspaceData(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) {
    throw new Error('Workspace not found');
  }

  await workflowService.ensureDefaultTaskWorkflow(workspaceId);

  const seedPasswordHash = await bcrypt.hash('SeedUser@123', 12);

  const sarah = await ensureOne(User, { workspaceId, email: 'sarah.jenkins@salevision.local' }, {
    workspaceId,
    displayName: 'Sarah Jenkins',
    email: 'sarah.jenkins@salevision.local',
    passwordHash: seedPasswordHash,
    role: 'admin',
    avatarUrl: avatars.sarah,
  });
  const alex = await ensureOne(User, { workspaceId, email: 'alex.rivera@salevision.local' }, {
    workspaceId,
    displayName: 'Alex Rivera',
    email: 'alex.rivera@salevision.local',
    passwordHash: seedPasswordHash,
    role: 'member',
    avatarUrl: avatars.alex,
  });
  const marcus = await ensureOne(User, { workspaceId, email: 'marcus.thorne@salevision.local' }, {
    workspaceId,
    displayName: 'Marcus Thorne',
    email: 'marcus.thorne@salevision.local',
    passwordHash: seedPasswordHash,
    role: 'member',
    avatarUrl: avatars.marcus,
  });

  await ensureOne(WorkspaceMember, { workspaceId, userId: sarah._id }, { workspaceId, userId: sarah._id, role: 'owner', status: 'active' });
  await ensureOne(WorkspaceMember, { workspaceId, userId: alex._id }, { workspaceId, userId: alex._id, role: 'member', status: 'active', invitedBy: sarah._id });
  await ensureOne(WorkspaceMember, { workspaceId, userId: marcus._id }, { workspaceId, userId: marcus._id, role: 'member', status: 'active', invitedBy: sarah._id });

  const project = await ensureOne(Project, { workspaceId, name: 'Q4 Engineering Roadmap' }, {
    workspaceId,
    name: 'Q4 Engineering Roadmap',
    status: 'active',
    progress: 65,
    ownerId: sarah._id,
    metadata: { department: 'Product Development', quarter: 'Q4' },
  });

  const task = await ensureOne(Task, { workspaceId, title: 'Refactor Authentication Microservice' }, {
    workspaceId,
    projectId: project._id,
    title: 'Refactor Authentication Microservice',
    description: 'Implement multi-tenant OAuth flow compatibility.',
    priority: 'high',
    status: 'in_progress',
    dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    points: 8,
    estimateHours: 16,
    assigneeIds: [alex._id, sarah._id],
    tags: ['backend', 'oauth'],
    commentsCount: 1,
    activityCount: 3,
  });

  await ensureOne(TaskComment, { workspaceId, taskId: task._id, body: 'Initial seed comment for task discussion.' }, {
    workspaceId,
    taskId: task._id,
    authorId: sarah._id,
    type: 'comment',
    body: 'Initial seed comment for task discussion.',
  });

  await ensureOne(Campaign, { workspaceId, name: 'Q3 Global Expansion' }, { workspaceId, name: 'Q3 Global Expansion', subtitle: 'Multi-channel Strategy', status: 'active', lead: 'S. Miller', progress: 75, performance: 4.2, spend: 142800, roi: 3.5 });
  await ensureOne(Lead, { workspaceId, title: 'Enterprise Contract - North Zone' }, { workspaceId, title: 'Enterprise Contract - North Zone', stage: 'negotiation', value: 120000, owner: 'Sarah Jenkins', health: 'watch', dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000) });
  await ensureOne(Contact, { workspaceId, email: 'alex.strathmore@taskstream.io' }, { workspaceId, name: 'Alex Strathmore', role: 'Principal Project Manager', department: 'Operations', email: 'alex.strathmore@taskstream.io', project: 'Aura Mobile V4', avatarUrl: avatars.alex });
  await ensureOne(Employee, { workspaceId, name: 'Juliette Rose' }, { workspaceId, name: 'Juliette Rose', role: 'Senior Product Designer', team: 'Design', velocity: 94, status: 'ready', task: 'Aura Mobile V4 Redesign', avatarUrl: avatars.sarah });

  await ensureOne(SettingProfile, { workspaceId }, { workspaceId, name: 'Alex Strathmore', title: 'Principal Project Manager', email: 'alex.strathmore@taskstream.io', avatarUrl: avatars.alex });
  await ensureOne(SettingPreference, { workspaceId }, { workspaceId, theme: 'light', timezone: 'Asia/Kolkata', language: 'en', notifications: { product: true, updates: true, reminders: true } });

  await ensureOne(SecuritySession, { workspaceId, device: 'Chrome on Windows' }, { workspaceId, device: 'Chrome on Windows', location: 'Chennai, IN', ipAddress: '127.0.0.1', isCurrent: true, revoked: false });
  await ensureOne(SecurityApiKey, { workspaceId, name: 'Primary Integration Key' }, { workspaceId, name: 'Primary Integration Key', tokenMasked: 'svk_****_prod', revoked: false });

  await ensureOne(AnalyticsSnapshot, { workspaceId, periodKey: 'current-month' }, { workspaceId, periodKey: 'current-month', metrics: { velocity: 82, utilization: 76, conversion: 48 }, aggregates: { tasks: 24, campaigns: 4, activeRisks: 3 } });

  await ensureOne(Activity, { workspaceId, module: 'seed', action: 'completed', entity: 'workspace' }, { workspaceId, actor: 'workspace-actor', module: 'seed', action: 'completed', entity: 'workspace', entityId: String(workspaceId), message: 'Workspace seeded with baseline data', payload: {} });

  const totalCounts = await Promise.all([
    Task.countDocuments({ workspaceId }),
    Campaign.countDocuments({ workspaceId }),
    Lead.countDocuments({ workspaceId }),
    Contact.countDocuments({ workspaceId }),
    Employee.countDocuments({ workspaceId }),
  ]);

  return {
    workspaceId,
    projectId: project._id,
    totals: {
      tasks: totalCounts[0],
      campaigns: totalCounts[1],
      leads: totalCounts[2],
      contacts: totalCounts[3],
      employees: totalCounts[4],
    },
  };
}
