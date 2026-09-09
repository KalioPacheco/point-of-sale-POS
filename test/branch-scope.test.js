const test = require('node:test');
const assert = require('node:assert/strict');
const { applyBranchScope } = require('../helpers/branchScope');

test('empty branch assignments expose only pre-migration branchless documents', () => {
  assert.deepEqual(applyBranchScope({ company: 'company' }, 'branch', []), {
    company: 'company', branch: null,
  });
  assert.deepEqual(applyBranchScope({ company: 'company' }, 'branch', ['branch-a']), {
    company: 'company', branch: { $in: ['branch-a'] },
  });
});
