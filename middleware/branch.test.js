const test = require('node:test');
const assert = require('node:assert/strict');
const { assignedBranchIds, canAccessBranch } = require('./branch');

test('branch assignments only grant access to active assigned branches', () => {
  const user = {
    role: 'manager',
    branchAssignments: [
      { branch: { _id: 'branch-a' }, active: true },
      { branch: 'branch-b', active: false },
      { branch: null, active: true },
    ],
  };

  assert.deepEqual(assignedBranchIds(user), ['branch-a']);
  assert.equal(canAccessBranch(user, 'branch-a'), true);
  assert.equal(canAccessBranch(user, 'branch-b'), false);
});

test('an admin retains company-wide branch access', () => {
  assert.equal(canAccessBranch({ role: 'admin', branchAssignments: [] }, 'any-branch'), true);
});
