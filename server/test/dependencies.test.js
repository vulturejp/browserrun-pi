import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../../', import.meta.url).pathname);

test('server package has no external dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server/package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies || {}, {});
  assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), ['@types/node', 'typescript']);
});

test('runner package depends only on Playwright', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'runner/package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['playwright']);
  assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), ['@types/node', 'typescript']);
});

test('runtime manifests do not include prohibited stealth dependencies', () => {
  const prohibited = [
    ['puppeteer', 'extra'].join('-'),
    ['puppeteer', 'extra', 'plugin', 'stealth'].join('-'),
    ['playwright', 'extra'].join('-'),
    ['playwright', 'stealth'].join('-')
  ];
  const files = [
    'server/package.json',
    'runner/package.json',
    'runner/Dockerfile',
    'runner/Dockerfile.pi',
    'workers/browserrun-router/wrangler.jsonc',
    'workers/browserrun-router/src/index.ts'
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    for (const name of prohibited) {
      assert.equal(content.includes(name), false, `${file} must not include ${name}`);
    }
  }
});
