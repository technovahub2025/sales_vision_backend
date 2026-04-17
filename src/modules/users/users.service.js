import { User } from '../../models/user.model.js';

export const usersService = {
  async list({ workspaceId, query = {} }) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const skip = (page - 1) * limit;

    const where = { workspaceId };
    if (query.search) {
      where.displayName = { $regex: String(query.search).trim(), $options: 'i' };
    }

    const [items, total] = await Promise.all([
      User.find(where)
        .select('displayName role avatarUrl')
        .sort({ displayName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(where),
    ]);

    return { items, meta: { page, limit, total } };
  },
};
