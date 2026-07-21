# Glance

**A self-hosted smart display you can actually hand to a non-technical friend.**

Flash one image to a Raspberry Pi, connect it to a screen, and walk through a
guided setup from your phone — no terminal, no SSH, no subscription required.
The same device runs a fullscreen ambient dashboard and a friendly local web app
to configure it, all on your LAN.

---

## Features

- **Calendar** — ICS subscription (Google, Apple, Outlook, any webcal link) + Google Calendar OAuth
- **Weather** — Powered by [Open-Meteo](https://open-meteo.com/) (no API key required)
- **Photos** — Local photo slideshow with upload via the config app
- **Tasks** — Built-in task lists, no third-party account needed
- **News** — RSS/Atom feed headlines with a scrolling ticker
- **Home Assistant** — Live entity tiles with tap-to-toggle support
- **Spotify** — Now Playing tile showing current track, artist, album art, and progress
- **Countdown** — Custom event countdowns
- **Today's Agenda** — At-a-glance view of today's events
- **Message of the Day** — A custom message shown prominently on the display
- **Light & dark themes** — Warm light theme for bright rooms; auto-switch at sunrise/sunset
- **Customisable layout** — Classic, Minimal, and Photo Focus templates; drag-and-drop sidebar ordering; per-widget style overrides
- **Screen sleep / dim schedule** — Configurable on/off or dim mode on a time schedule
- **Automatic updates** — In-UI check and apply; atomic swap with rollback
- **Guided onboarding** — Step-by-step wizard; WiFi, PIN, timezone, calendar, layout — done

## Hardware

| Tier | Device | Notes |
|---|---|---|
| Recommended | Raspberry Pi 4 (2 GB+) | Comfortable for all features |
| Supported | Raspberry Pi 5 | Full headroom |

**OS:** Raspberry Pi OS Lite 64-bit. USB-SSD or A2-rated SD card recommended.

---

## Getting started (development)

### Prerequisites

- **Node.js 20+** (22 LTS recommended — see [`.nvmrc`](./.nvmrc))
- **pnpm** — `corepack enable && corepack prepare pnpm@latest --activate`

### Run locally

```sh
git clone https://github.com/thequarkyone/smart-calendar.git smart-calendar
cd smart-calendar
pnpm install
pnpm dev
```

| Service | URL |
|---|---|
| Config app | http://localhost:5173 |
| Display | http://localhost:5174 |
| API | http://localhost:3000 |

### Other commands

```sh
pnpm build        # build all packages
pnpm test         # run all tests (server: Vitest)
pnpm typecheck    # type-check all packages
pnpm lint         # ESLint across the monorepo
```

---

## Deploying to a Raspberry Pi

> A pre-built flashable image is available on the [Releases](https://github.com/thequarkyone/smart-calendar/releases) page — this is the recommended path for non-developers.

Flash the `.img.xz` file with [Raspberry Pi Imager](https://www.raspberrypi.com/software/), boot, and visit `smartdisplay.local` from any browser on your network. The onboarding wizard handles the rest.

**Manual deployment** (advanced): see [`deploy/bootstrap.sh`](./deploy/bootstrap.sh) and the systemd units in [`deploy/systemd/`](./deploy/systemd/).

---

## Architecture

```
packages/
  shared/       Shared TypeScript types (no runtime deps)
  server/       Fastify + SQLite backend — scheduler, REST, WebSocket/SSE, event bus
  web-config/   React + Vite config app (Tailwind v4, mobile-first)
  web-display/  React + Vite fullscreen display (pure function of server state)
build/          pi-gen stage for building the flashable image
deploy/         systemd units, Avahi mDNS, dnsmasq, NetworkManager config
```

**Discovery:** the device advertises itself as `smartdisplay.local` via Avahi mDNS. No need to find an IP address.

**Security:** device PIN auth, brute-force lockout, secrets encrypted at rest (AES-256-GCM), SSRF protection, CSP headers, rate limiting.

---

## Contributing

PRs welcome — please open an issue first for anything non-trivial.

## License

[MIT](./LICENSE)
