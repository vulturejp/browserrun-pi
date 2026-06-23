import test from 'node:test';
import assert from 'node:assert/strict';
import { quickActionToJob } from '../dist/quick-actions.js';
import { validateJob } from '../dist/validation.js';

const config = {
  defaultTimeoutMs: 60000,
  maxTimeoutMs: 120000,
  defaultFingerprintProfile: 'standard'
};

test('screenshot quick action maps to a validated raw job', () => {
  const raw = quickActionToJob('screenshot', {
    url: 'https://example.com',
    fingerprintProfile: 'standard'
  });
  const job = validateJob(raw, config);
  assert.equal(job.actions[0].type, 'screenshot');
  assert.equal(job.fingerprintProfile, 'standard');
});

test('links quick action maps to a links artifact action', () => {
  const job = validateJob(quickActionToJob('links', {
    url: 'https://example.com'
  }), config);
  assert.equal(job.actions[0].type, 'links');
  assert.equal(job.actions[0].name, 'links.json');
});

test('scrape quick action validates selector input', () => {
  const job = validateJob(quickActionToJob('scrape', {
    url: 'https://example.com',
    selector: 'main article'
  }), config);
  assert.equal(job.actions[0].type, 'scrape');
  assert.equal(job.actions[0].selector, 'main article');
});
