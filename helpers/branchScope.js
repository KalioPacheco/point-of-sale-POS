/**
 * While migration 002 is pending, historical operational documents have no
 * branch. An unassigned user may read only that legacy subset in its tenant;
 * after migration every active operator receives MATRIZ and gets an explicit
 * branch scope. This avoids treating an empty assignment list as company-wide.
 */
function applyBranchScope(query, field, branchIds) {
  if (!Array.isArray(branchIds)) return query;
  query[field] = branchIds.length > 0 ? { $in: branchIds } : null;
  return query;
}

module.exports = { applyBranchScope };
