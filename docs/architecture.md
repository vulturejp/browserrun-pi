# Architecture

`browserrun-pi` recreates the useful part of Cloudflare Browser Rendering for a home Raspberry Pi 5: a clean browser environment per request, simple automation inputs, and explicit artifacts.

## Components

- **API server**: a small Node.js HTTP server in `server/`.
- **Runner image**: a Playwright Chromium container in `runner/`.
- **Artifacts directory**: host-side storage for job outputs.
- **systemd unit**: an example service definition in `systemd/`.

## Job Lifecycle

1. The client sends `POST /run` with a URL and optional actions.
2. The API validates the request and requires bearer-token authentication.
3. The API creates a job ID and artifact directory.
4. A process-wide single-job lock is acquired.
5. The API starts `docker run --rm` or `podman run --rm`.
6. The container receives the job as `/work/job.json` and writes outputs to `/artifacts`.
7. The API records status, artifacts, exit code, and errors.
8. The container is removed and temporary job input is deleted.
9. The single-job lock is released.

## Isolation Model

The container is intentionally not reused. This is slower than a warm browser pool, but it keeps browser profile data, local storage, cookies, and process state disposable.

The server launches containers with:

- `--rm`
- non-root user inherited from the Playwright image
- `--read-only`
- tmpfs for `/tmp`, `/run`, and `/home/pwuser`
- memory and CPU limits
- one bind mount for artifacts
- one read-only bind mount for the job JSON

The host home directory and Docker socket are never mounted into the runner.

## API Shape

The API is purpose-compatible rather than Cloudflare-compatible. It accepts JSON actions that map to Playwright operations:

- `wait`
- `click`
- `type`
- `evaluate`
- `screenshot`
- `pdf`
- `html`

`evaluate` executes JavaScript in the page context, so the service must remain token-protected even on LAN/VPN.

## Operational Defaults

- Listen address: `127.0.0.1`
- Port: `8787`
- Max concurrent jobs: `1`
- Default timeout: `60000ms`
- Default image: `browserrun-pi-runner:latest`
- Default artifact root: `./artifacts`

Use Tailscale or WireGuard for remote access. Avoid direct public exposure.

