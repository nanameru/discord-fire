const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const { parse } = require('yaml');

const workflow = readFileSync('.github/workflows/keepalive.yml', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/hoge.yml', 'utf8');

test('GitHub Actions Workflowとして解析できる', () => {
  const parsed = parse(workflow);
  assert.equal(parsed.name, 'Keep Scheduled Workflows Active');
  assert.ok(parsed.on.schedule);
  assert.ok(parsed.on.workflow_dispatch !== undefined);
});

test('CIがWorkflowテストを実行する', () => {
  const parsed = parse(ciWorkflow);
  assert.equal(parsed.name, 'CI');
  assert.match(ciWorkflow, /run: npm test/);
});

test('月次スケジュールと手動実行を提供する', () => {
  assert.match(workflow, /cron: "17 18 1 \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('維持記録に必要な最小権限だけを付与する', () => {
  assert.match(workflow, /permissions:\n  contents: write/);
  assert.doesNotMatch(workflow, /actions: write|issues: write|pull-requests: write/);
});

test('維持記録ファイルだけをコミット対象にする', () => {
  assert.match(workflow, /git add \.github\/keepalive/);
  assert.doesNotMatch(workflow, /^\s*git add (?:--all|-A|\.)\s*$/m);
  assert.doesNotMatch(workflow, /DISCORD_BOT_TOKEN|npm run trending/);
});
