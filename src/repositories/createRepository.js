import { getPagination, getSort } from '../utils/pagination.js';

export function createRepository(model) {
  return {
    async list({ workspaceId, query = {}, filter = {}, projection = null }) {
      const { page, limit, skip } = getPagination(query);
      const sort = getSort(query);
      const where = { workspaceId, ...filter };

      const [items, total] = await Promise.all([
        model.find(where, projection).sort(sort).skip(skip).limit(limit).lean(),
        model.countDocuments(where),
      ]);

      return { items, meta: { page, limit, total } };
    },

    async getById({ workspaceId, id, projection = null }) {
      return model.findOne({ _id: id, workspaceId }, projection).lean();
    },

    async create({ workspaceId, data }) {
      const doc = await model.create({ ...data, workspaceId });
      return model.findById(doc._id).lean();
    },

    async update({ workspaceId, id, data }) {
      return model.findOneAndUpdate({ _id: id, workspaceId }, { $set: data }, { new: true }).lean();
    },

    async remove({ workspaceId, id }) {
      return model.findOneAndDelete({ _id: id, workspaceId }).lean();
    },
  };
}
