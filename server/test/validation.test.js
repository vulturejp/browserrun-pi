import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeArtifactName, validateJob } from '../dist/validation.js';

const config = {
  defaultTimeoutMs: 60000,
  maxTimeoutMs: 120000
};

test('validates a minimal job with default screenshot action', () => {
  const job = validateJob({ url: 'https://example.com' }, config);
  assert.equal(job.url, 'https://example.com/');
  assert.deepEqual(job.viewport, { width: 1280, height: 720 });
  assert.equal(job.actions[0].type, 'screenshot');
});

test('rejects non-http URLs', () => {
  assert.throws(() => validateJob({ url: 'file:///etc/passwd' }, config), /http or https/);
});

test('rejects artifact traversal names', () => {
  assert.throws(() => sanitizeArtifactName('../x'), /path separators|traversal/);
  assert.throws(() => sanitizeArtifactName('nested/x'), /path separators|traversal/);
});

test('validates supported actions', () => {
  const job = validateJob({
    url: 'https://example.com',
    actions: [
      { type: 'wait', ms: 1 },
      { type: 'click', selector: '#ok' },
      { type: 'type', selector: 'input', text: 'hello' },
      { type: 'evaluate', expression: 'document.title', name: 'title.json' },
      { type: 'pdf', name: 'page.pdf' },
      { type: 'html', name: 'page.html' }
    ]
  }, config);

  assert.equal(job.actions.length, 6);
});
