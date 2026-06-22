const tokenInput = document.querySelector('#token');
const saveTokenButton = document.querySelector('#save-token');
const statusEl = document.querySelector('#status');
const jobsEl = document.querySelector('#jobs');
const configEl = document.querySelector('#config');
const tunnelGuideEl = document.querySelector('#tunnel-guide');
const runButton = document.querySelector('#run');
const runResultEl = document.querySelector('#run-result');
const domainsJsonEl = document.querySelector('#domains-json');
const saveDomainsButton = document.querySelector('#save-domains');

tokenInput.value = sessionStorage.getItem('browserrun-token') || '';

saveTokenButton.addEventListener('click', () => {
  sessionStorage.setItem('browserrun-token', tokenInput.value);
  refresh();
});

runButton.addEventListener('click', async () => {
  const action = document.querySelector('#action').value;
  const body = {
    url: document.querySelector('#url').value,
    selector: document.querySelector('#selector').value || undefined,
    fingerprintProfile: document.querySelector('#fingerprint').value
  };
  const response = await api(`/${action}`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  runResultEl.textContent = JSON.stringify(response, null, 2);
  await refresh();
});

saveDomainsButton.addEventListener('click', async () => {
  const domains = JSON.parse(domainsJsonEl.value || '[]');
  await api('/api/admin/domains', {
    method: 'PUT',
    body: JSON.stringify({ domains })
  });
  await refresh();
});

jobsEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-artifact]');
  if (!button) return;
  const response = await fetch(`/jobs/${button.dataset.job}/artifacts/${encodeURIComponent(button.dataset.artifact)}`, {
    headers: { authorization: `Bearer ${token()}` }
  });
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = button.dataset.artifact;
  link.click();
  URL.revokeObjectURL(href);
});

async function refresh() {
  if (!token()) {
    statusEl.textContent = 'Enter the API token to load admin data.';
    return;
  }
  const [status, jobs, config, tunnel, domains] = await Promise.all([
    api('/api/admin/status'),
    api('/api/admin/jobs'),
    api('/api/admin/config'),
    api('/api/admin/tunnel-guide'),
    api('/api/admin/domains')
  ]);
  statusEl.innerHTML = `<strong>Status:</strong> ${status.ok ? 'ready' : 'error'} &nbsp; <strong>Active job:</strong> ${status.activeJobId || 'none'} &nbsp; <strong>Preset:</strong> ${status.runner.preset}`;
  configEl.textContent = JSON.stringify(config, null, 2);
  tunnelGuideEl.textContent = JSON.stringify(tunnel, null, 2);
  domainsJsonEl.value = JSON.stringify(domains.domains.length ? domains.domains : [{
    domain: 'example.com',
    engine: 'pi',
    fingerprintProfile: 'standard',
    minIntervalHours: domains.defaultMinIntervalHours
  }], null, 2);
  jobsEl.innerHTML = jobs.jobs.map((job) => `
    <tr>
      <td>${escapeHtml(job.createdAt)}</td>
      <td>${escapeHtml(job.status)}</td>
      <td>${escapeHtml(job.request.url || '')}</td>
      <td>${escapeHtml(job.request.fingerprintProfile || '')}</td>
      <td>${job.artifacts.map((name) => `<button type="button" data-job="${job.id}" data-artifact="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('<br>')}</td>
    </tr>
  `).join('');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'authorization': `Bearer ${token()}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(parsed?.error || response.statusText);
  }
  return parsed;
}

function token() {
  return sessionStorage.getItem('browserrun-token') || tokenInput.value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

refresh().catch((error) => {
  statusEl.textContent = error.message;
});
