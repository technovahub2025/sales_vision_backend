export function getPagination(query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function getSort(query = {}, fallback = '-updatedAt') {
  return query.sort || fallback;
}
