import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import { JobStore } from './job-store.js';
import { ContainerRunner } from './runner.js';
import { sanitizeArtifactName, validateJob } from './validation.js';
import { quickActionNames, quickActionToJob } from './quick-actions.js';

const config = loadConfig();
const store = new JobStore(config.artifactRoot);
const runner = new ContainerRunner(config);
let activeJobId = null;

await store.init();

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.statusCode ? error.message : 'internal server error'
    });
    if (!error.statusCode) {
      console.error(error);
    }
  }
});

server.listen(config.port, config.host, () => {
  console.log(`browserrun-pi listening on http://${config.host}:${config.port}`);
});

async function route(req, res) {
  if (req.url === '/healthz' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, activeJobId });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin')) {
    await serveStatic(res, 'index.html');
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/admin/')) {
    await serveStatic(res, url.pathname.slice('/admin/'.length));
    return;
  }

  requireAuth(req);

  if (req.method === 'POST' && url.pathname === '/run') {
    await handleRun(req, res);
    return;
  }

  const quickMatch = url.pathname.match(/^\/(screenshot|content|pdf|snapshot|links|scrape|json|crawl)$/);
  if (req.method === 'POST' && quickMatch) {
    await handleQuickAction(req, res, quickMatch[1]);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/status') {
    handleAdminStatus(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/jobs') {
    await handleAdminJobs(res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/run') {
    await handleRun(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/config') {
    handleAdminConfig(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/tunnel-guide') {
    handleTunnelGuide(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/domains') {
    await handleGetDomains(res);
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/admin/domains') {
    await handlePutDomains(req, res);
    return;
  }

  const jobMatch = url.pathname.match(/^\/jobs\/([^/]+)$/);
  if (req.method === 'GET' && jobMatch) {
    await handleGetJob(res, jobMatch[1]);
    return;
  }

  const artifactMatch = url.pathname.match(/^\/jobs\/([^/]+)\/artifacts\/([^/]+)$/);
  if (req.method === 'GET' && artifactMatch) {
    await handleArtifact(res, artifactMatch[1], artifactMatch[2]);
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

async function handleRun(req, res) {
  const body = await readJson(req);
  const payload = validateJob(body, config);
  const job = await enqueueJob(payload, res);
  if (job) sendJson(res, 202, store.serialize(job));
}

async function handleQuickAction(req, res, actionName) {
  if (!quickActionNames.has(actionName)) {
    sendJson(res, 501, { error: `${actionName} is not implemented in browserrun-pi v1` });
    return;
  }

  const body = await readJson(req);
  const payload = validateJob(quickActionToJob(actionName, body), config);
  const job = await enqueueJob(payload, res);
  if (job) sendJson(res, 202, store.serialize(job));
}

async function enqueueJob(payload, res) {
  if (activeJobId !== null) {
    sendJson(res, 409, { error: 'busy', activeJobId });
    return null;
  }

  const job = await store.create(payload);

  activeJobId = job.id;
  runner.run(job)
    .catch((error) => {
      job.status = 'failed';
      job.error = error.message;
      job.finishedAt = job.finishedAt || new Date().toISOString();
    })
    .finally(async () => {
      await store.listArtifacts(job).catch(() => {});
      await store.save(job).catch(() => {});
      activeJobId = null;
    });

  await store.save(job).catch(() => {});
  return job;
}

async function handleGetJob(res, id) {
  const job = store.get(id);
  if (!job) {
    sendJson(res, 404, { error: 'job not found' });
    return;
  }
  await store.listArtifacts(job);
  sendJson(res, 200, store.serialize(job));
}

async function handleAdminJobs(res) {
  for (const job of store.list()) {
    await store.listArtifacts(job).catch(() => {});
  }
  sendJson(res, 200, { jobs: store.list().map((job) => store.serialize(job)) });
}

function handleAdminStatus(res) {
  sendJson(res, 200, {
    ok: true,
    activeJobId,
    runner: {
      image: config.runnerImage,
      runtime: config.containerRuntime,
      preset: config.runnerPreset,
      network: config.network
    }
  });
}

function handleAdminConfig(res) {
  sendJson(res, 200, {
    host: config.host,
    port: config.port,
    artifactRoot: config.artifactRoot,
    runnerImage: config.runnerImage,
    containerRuntime: config.containerRuntime,
    runnerPreset: config.runnerPreset,
    defaultTimeoutMs: config.defaultTimeoutMs,
    maxTimeoutMs: config.maxTimeoutMs,
    defaultFingerprintProfile: config.defaultFingerprintProfile,
    defaultMinIntervalHours: config.defaultMinIntervalHours,
    tunnelEndpoint: config.tunnelEndpoint || null,
    memoryLimit: config.memoryLimit,
    cpus: config.cpus,
    network: config.network,
    apiToken: config.apiToken ? '***' : null
  });
}

function handleTunnelGuide(res) {
  sendJson(res, 200, {
    defaultEngine: 'pi',
    tunnelTarget: `http://${config.host}:${config.port}`,
    requiredHeaders: ['CF-Access-Client-Id', 'CF-Access-Client-Secret', 'Authorization'],
    workerSecrets: ['PI_BASE_URL', 'PI_API_TOKEN', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET'],
    fetchExample: [
      'await fetch(`${PI_BASE_URL}/screenshot`, {',
      '  method: "POST",',
      '  headers: {',
      '    "content-type": "application/json",',
      '    "authorization": `Bearer ${PI_API_TOKEN}`,',
      '    "CF-Access-Client-Id": CF_ACCESS_CLIENT_ID,',
      '    "CF-Access-Client-Secret": CF_ACCESS_CLIENT_SECRET',
      '  },',
      '  body: JSON.stringify({ url, fingerprintProfile: "standard" })',
      '})'
    ].join('\n')
  });
}

async function handleGetDomains(res) {
  sendJson(res, 200, {
    defaultMinIntervalHours: config.defaultMinIntervalHours,
    domains: await readDomainRules()
  });
}

async function handlePutDomains(req, res) {
  const body = await readJson(req);
  if (!Array.isArray(body.domains)) {
    sendJson(res, 400, { error: 'domains must be an array' });
    return;
  }
  const domains = body.domains.map(validateDomainRule);
  await fsp.writeFile(domainRulesPath(), JSON.stringify(domains, null, 2), 'utf8');
  sendJson(res, 200, { domains });
}

async function readDomainRules() {
  try {
    return JSON.parse(await fsp.readFile(domainRulesPath(), 'utf8'));
  } catch {
    return [];
  }
}

function validateDomainRule(rule) {
  if (!rule || typeof rule !== 'object') {
    const error = new Error('domain rule must be an object');
    error.statusCode = 400;
    throw error;
  }
  const domain = String(rule.domain || '').toLowerCase().trim();
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.length > 253) {
    const error = new Error('domain must be a hostname');
    error.statusCode = 400;
    throw error;
  }
  const engine = ['pi', 'cloudflare', 'auto', 'disabled'].includes(rule.engine) ? rule.engine : 'pi';
  const fingerprintProfile = ['none', 'standard', 'mobile'].includes(rule.fingerprintProfile) ? rule.fingerprintProfile : config.defaultFingerprintProfile;
  const minIntervalHours = Number.isInteger(rule.minIntervalHours) && rule.minIntervalHours >= 1 && rule.minIntervalHours <= 8760
    ? rule.minIntervalHours
    : config.defaultMinIntervalHours;
  return { domain, engine, fingerprintProfile, minIntervalHours };
}

function domainRulesPath() {
  return path.join(config.artifactRoot, 'domain-rules.json');
}

async function handleArtifact(res, id, rawName) {
  const job = store.get(id);
  if (!job) {
    sendJson(res, 404, { error: 'job not found' });
    return;
  }
  const name = sanitizeArtifactName(decodeURIComponent(rawName));
  const artifactPath = path.join(job.artifactDir, name);
  if (!artifactPath.startsWith(job.artifactDir + path.sep)) {
    sendJson(res, 400, { error: 'invalid artifact path' });
    return;
  }
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    sendJson(res, 404, { error: 'artifact not found' });
    return;
  }

  res.writeHead(200, {
    'content-type': contentType(name),
    'content-disposition': `attachment; filename="${name.replaceAll('"', '')}"`
  });
  fs.createReadStream(artifactPath).pipe(res);
}

function requireAuth(req) {
  if (config.allowNoAuth) return;
  const header = req.headers.authorization || '';
  if (header !== `Bearer ${config.apiToken}`) {
    const error = new Error('unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    const error = new Error('invalid JSON');
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function contentType(name) {
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.html')) return 'text/html; charset=utf-8';
  if (name.endsWith('.css')) return 'text/css; charset=utf-8';
  if (name.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (name.endsWith('.json')) return 'application/json; charset=utf-8';
  if (name.endsWith('.log') || name.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

async function serveStatic(res, requestedPath) {
  const publicRoot = path.resolve(new URL('../public', import.meta.url).pathname);
  const safePath = requestedPath === '' ? 'index.html' : requestedPath;
  const filePath = path.resolve(publicRoot, safePath);
  if (!filePath.startsWith(publicRoot + path.sep)) {
    sendJson(res, 400, { error: 'invalid path' });
    return;
  }
  try {
    const body = await fsp.readFile(filePath);
    res.writeHead(200, { 'content-type': contentType(filePath) });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}
