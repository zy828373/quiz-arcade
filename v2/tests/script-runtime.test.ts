import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = 'C:\\Users\\AWSA\\Desktop\\codex无线号池';

test('start_team batch loop respects the Team Pool stop request marker', () => {
  const script = readFileSync(join(repoRoot, 'start_team.bat'), 'utf8');

  assert.equal(script.includes('team-pool-stop.requested'), true);
  assert.equal(script.includes('Team Pool stop requested, exiting loop'), true);
  assert.equal(script.includes('Team Pool stop requested after exit, not restarting'), true);
});

test('health check script honors local self-use mode and intentional Team Pool stops', () => {
  const script = readFileSync(join(repoRoot, 'health_check.ps1'), 'utf8');

  assert.equal(script.includes('V2_WORKSPACE_MODE'), true);
  assert.equal(script.includes('Proxy:SKIP(LOCAL)'), true);
  assert.equal(script.includes('NewAPI:SKIP(LOCAL)'), true);
  assert.equal(script.includes('Tunnel:SKIP(LOCAL)'), true);
  assert.equal(script.includes('Team:STOP_REQUESTED'), true);
});
