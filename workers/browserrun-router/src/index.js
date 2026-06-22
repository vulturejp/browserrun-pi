const QUICK_ACTIONS = new Set(['screenshot', 'content', 'pdf', 'snapshot', 'links', 'scrape']);

export default {
  async fetch(request, env) {
    const started = Date.now();
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\/+/, '') || 'screenshot';

    if (!QUICK_ACTIONS.has(action)) {
      return json({ error: 'unsupported action' }, 501);
    }

    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const rule = findDomainRule(body.url, env.DOMAIN_RULES);
    const engine = body.engine || rule?.engine || env.DEFAULT_ENGINE || 'pi';

    if (engine === 'disabled') {
      return json({ error: 'domain disabled by rule' }, 403);
    }

    if (engine === 'cloudflare') {
      return json({ error: 'cloudflare engine is explicit-only and not wired in this scaffold' }, 501);
    }

    if (engine !== 'pi' && engine !== 'auto') {
      return json({ error: 'engine must be pi, auto, or cloudflare' }, 400);
    }

    const piResponse = await fetch(`${env.PI_BASE_URL}/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${env.PI_API_TOKEN}`,
        'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET
      },
      body: JSON.stringify({
        ...body,
        engine: undefined,
        fingerprintProfile: body.fingerprintProfile || rule?.fingerprintProfile || 'standard'
      })
    }).catch((error) => ({ error }));

    if (piResponse.error) {
      if (body.allowCloudflareFallback === true) {
        return json({ error: 'cloudflare fallback is not wired in this scaffold', piError: piResponse.error.message }, 502);
      }
      return json({ error: 'pi endpoint unavailable', detail: piResponse.error.message }, 502);
    }

    const response = new Response(piResponse.body, piResponse);
    response.headers.set('X-Browserrun-Engine', 'pi');
    response.headers.set('X-Browserrun-Pi-Ms-Used', String(Date.now() - started));
    return response;
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function findDomainRule(rawUrl, rawRules) {
  if (!rawUrl || !rawRules) return null;
  let hostname;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  let rules;
  try {
    rules = JSON.parse(rawRules);
  } catch {
    return null;
  }
  return rules.find((rule) => hostname === rule.domain || hostname.endsWith(`.${rule.domain}`)) || null;
}
