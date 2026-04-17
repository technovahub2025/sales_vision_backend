export function normalizeRole(role) {
  const safe = String(role || '').toLowerCase();
  if (safe === 'owner' || safe === 'admin' || safe === 'member' || safe === 'viewer') {
    return safe;
  }
  return 'member';
}
