import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ContainerRunner } from '../dist/runner.js';

test('quality preset changes container resource args', async () => {
  const artifactDir = await mkdtemp(path.join(tmpdir(), 'browserrun-pi-'));
  const runner = new ContainerRunner({
    containerRuntime: 'docker',
    network: 'bridge',
    memoryLimit: '1g',
    cpus: '2',
    runnerPreset: 'quality',
    runnerImage: 'browserrun-pi-runner:pi'
  });
  const args = runner.buildArgs({
    artifactDir,
    payload: { timeoutMs: 60000 }
  }, path.join(artifactDir, 'job.json'));

  assert.equal(args[args.indexOf('--memory') + 1], '1536m');
  assert.equal(args[args.indexOf('--cpus') + 1], '2');
  assert.ok(args.includes('/dev/shm:rw,nosuid,nodev,size=512m'));
});
