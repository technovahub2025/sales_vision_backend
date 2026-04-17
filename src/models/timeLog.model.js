import mongoose from 'mongoose';

const timeLogSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    description: { type: String, default: '' },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    durationMins: { type: Number, default: 0 },
    loggedAt: { type: Date, default: Date.now, index: true },
    isManual: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false, index: true },
    isPaused: { type: Boolean, default: false },
    pausedIntervals: [{
      pausedAt: { type: Date },
      resumedAt: { type: Date },
      durationMins: { type: Number, default: 0 },
    }],
  },
  { timestamps: true },
);

timeLogSchema.index({ workspaceId: 1, taskId: 1 });
timeLogSchema.index({ workspaceId: 1, employeeId: 1, loggedAt: -1 });
timeLogSchema.index({ workspaceId: 1, employeeId: 1, taskId: 1, endTime: 1 });

export const TimeLog = mongoose.model('TimeLog', timeLogSchema, 'sv_time_logs');
