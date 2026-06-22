# Explicit Dependencies

This project intentionally keeps dependencies small and explicit.

## Server Runtime

- Node.js `>=20`
- npm
- Docker or Podman CLI
- systemd for Raspberry Pi service operation

## `server/package.json`

- `dependencies`: none
- `devDependencies`: none
- Tests use Node.js built-in `node --test`.

## Runner Runtime

- Node.js `>=20`
- Playwright
- Chromium
- Linux font packages
- GNU coreutils `timeout`
- Docker or Podman container runtime

## `runner/package.json`

- `playwright`

No stealth package is allowed. Browser consistency adjustments are implemented through explicit Chromium/context options and a small project-owned init script in `runner/run-job.js`.

## Pi Runner Image Packages

`runner/Dockerfile.pi` installs:

- `chromium`
- `fonts-liberation`
- `fonts-noto-core`
- `fonts-noto-cjk`
- `fonts-noto-color-emoji`
- `ca-certificates`
- `coreutils`
- `dumb-init`
- `tzdata`

## Worker Router

- Cloudflare Workers runtime
- Wrangler CLI for deployment
- No browser automation package in the Worker

## Cloudflare Services

- Cloudflare Tunnel through `cloudflared`
- Cloudflare Access Service Token
- Optional Cloudflare Browser Run binding only for explicit `engine: "cloudflare"`

