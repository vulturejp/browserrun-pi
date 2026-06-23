# browserrun-pi

Raspberry Pi 5 friendly, disposable browser runner inspired by Cloudflare Browser Rendering.

The service exposes a small HTTP API and runs each browser job in a fresh Docker/Podman container. The container is removed after every job, and only explicit artifacts such as screenshots, PDFs, HTML, traces, and JSON results are kept.

## License

`browserrun-pi` is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). This is intentional for a network-accessible browser service: modified versions offered over a network must also provide corresponding source under the AGPL terms.

## Quick Start

Build the runner image:

```sh
docker build -t browserrun-pi-runner:latest ./runner
```

Start the API server:

```sh
cd server
npm install
npm run build
BROWSERRUN_API_TOKEN=change-me npm start
```

Open the local management UI:

```text
http://127.0.0.1:8787/admin
```

Run a job:

```sh
curl -sS \
  -H 'authorization: Bearer change-me' \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://example.com",
    "actions": [
      { "type": "screenshot", "name": "example.png", "fullPage": true },
      { "type": "html", "name": "page.html" }
    ]
  }' \
  http://127.0.0.1:8787/run
```

Fetch job status:

```sh
curl -H 'authorization: Bearer change-me' http://127.0.0.1:8787/jobs/JOB_ID
```

Fetch an artifact:

```sh
curl -H 'authorization: Bearer change-me' \
  -o example.png \
  http://127.0.0.1:8787/jobs/JOB_ID/artifacts/example.png
```

## API

The Raspberry Pi engine is the primary engine. Cloudflare Workers should normally call this API through Cloudflare Tunnel and Access so the target site sees the home connection IP, not Cloudflare browser infrastructure.

### `POST /run`

Starts one browser job. Only one job may run at a time. A second request while a job is running returns `409 busy`.

Request body:

```json
{
  "url": "https://example.com",
  "timeoutMs": 60000,
  "viewport": { "width": 1280, "height": 720 },
  "userAgent": "optional user agent",
  "headers": { "x-example": "value" },
  "actions": [
    { "type": "wait", "ms": 500 },
    { "type": "click", "selector": "button" },
    { "type": "type", "selector": "input[name=q]", "text": "hello" },
    { "type": "evaluate", "expression": "document.title", "name": "title.json" },
    { "type": "screenshot", "name": "screen.png", "fullPage": true },
    { "type": "pdf", "name": "page.pdf" },
    { "type": "html", "name": "page.html" }
  ]
}
```

### Quick Actions

Cloudflare-style quick actions are available as Pi-first endpoints:

- `POST /screenshot`
- `POST /content`
- `POST /pdf`
- `POST /snapshot`
- `POST /links`
- `POST /scrape`

`/json` and `/crawl` intentionally return `501` in v1.

All quick actions accept common fields:

```json
{
  "url": "https://example.com",
  "fingerprintProfile": "standard",
  "timeoutMs": 60000,
  "viewport": { "width": 1280, "height": 720 }
}
```

`fingerprintProfile` may be `none`, `standard`, or `mobile`. The default is `standard`; it uses explicit Chromium/context settings and a small project-owned init script. Stealth plugins are not used.

### `GET /jobs/:id`

Returns job state, timestamps, exit status, errors, and artifact names.

### `GET /jobs/:id/artifacts/:name`

Downloads an artifact created by the job.

## Runtime Notes

- Bind the service to LAN or VPN only. Do not expose it directly to the public internet.
- Set `BROWSERRUN_API_TOKEN`; the server refuses to start without a token unless `BROWSERRUN_ALLOW_NO_AUTH=1` is set.
- The runner container is launched with `--rm`, a read-only root filesystem, tmpfs mounts, CPU/memory limits, and a single artifact bind mount.
- Browser state is not reused. Every job starts a new browser profile and a new container.
- `BROWSERRUN_RUNNER_PRESET` may be `low-memory`, `balanced`, or `quality`; `balanced` is the default for Raspberry Pi 5.
- The Pi image is available at `runner/Dockerfile.pi` and uses system Chromium plus explicitly listed font/runtime packages.
- Server and runner source are TypeScript. Run `npm run build` before starting the server outside Docker.
- See `docs/dependencies.md` for the full dependency list.
