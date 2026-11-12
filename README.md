<div align="center">

# <img src="docs/img/logo.svg" alt="" width="40" align="absmiddle"> Docker Kong

**A lightweight, local web dashboard for Docker — in about 55 MB of RAM.**

[![CI](https://github.com/Jhostter/docker-kong/actions/workflows/ci.yml/badge.svg)](https://github.com/Jhostter/docker-kong/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 22.13+](https://img.shields.io/badge/node-%E2%89%A522.13-339933)
![UI: English · Español](https://img.shields.io/badge/UI-English%20%C2%B7%20Espa%C3%B1ol-informational)

<img src="docs/img/demo.gif" alt="Docker Kong demo: start/stop, live logs, usage chart, Compose, events, light theme and language switch" width="900">

[Español](#-español) · [Usage guide](docs/GUIDE.md) · [Guía de uso](docs/GUIA.md) · [Platforms](docs/PLATFORMS.md)

</div>

Containers, live logs, an interactive terminal, Compose stacks, images, volumes, networks, live events, **alerts**, **disk cleanup** and **usage charts with history** — in one small local app that stays out of your way: **~0.2–0.5 % of one CPU core and ~55 MB of RAM** while idle with a tab open (measured on Linux with 12 containers).

## Why another Docker UI?

Docker Kong is built for **one person, one machine**: no database server, no agent, no accounts. It listens on `127.0.0.1`, keeps CPU/RAM history in a single SQLite file, and does no work while nobody is looking at the page (updates are driven by Docker events, not by polling).

It is **not** a replacement for the bigger tools. Use something else if you need:

- multi-user access, roles or SSO, or managing several hosts / Kubernetes → Portainer and similar;
- only log viewing across many containers → a dedicated log viewer such as Dozzle;
- a terminal UI → lazydocker.

## Features

- **Fast to drive** — a **command palette** (`Ctrl`/`⌘`+`K`) to jump to any container, section or action, a **⋯ menu** per row (Start/Stop and Logs stay one click away), a **compact view** that fits a whole stack on screen, a grouped sidebar and loading skeletons. Fully keyboard-accessible.
- **Stays current by itself** — follows Docker's events, so changes made anywhere show up without reloading the page; it reconnects after Docker or the network drops, catches up during event bursts and never lets a slow, outdated response overwrite newer data.
- **Containers** — list, search, filter, group by Compose stack; start / stop / restart / remove; clickable published ports; live CPU and memory per container.
- **Manage by stack or selection** — start, stop or restart a whole group (or any selection) in one click, **in dependency order** when Compose declares it (database before API, reverse to stop) **waiting for a service to be healthy** before starting what depends on it, with a **live progress panel** (what it is waiting for, how long) and a **Cancel** button. Works for any group, including stacks Compose cannot manage, and for **your own groups** (create them from a selection or by **drag and drop**, rename, merge, dissolve — containers are never touched).
- **Live logs** — streaming, filtering, timestamps toggle, error/warning highlighting, download.
- **Terminal** — interactive shell inside a running container (xterm.js over WebSocket).
- **Create containers** — image, ports, env vars, volumes, restart policy and network, with live validation. Pulls the image if missing.
- **Compose** — `up`, `restart`, `stop`, `pull` and `down` for the stacks Docker already knows about.
- **Images, volumes, networks** — browse, create/pull, remove; images show whether they are in use.
- **Events** — live Docker event stream (it also keeps the UI in sync without polling).
- **Container details** — an `inspect` you can read: why it stopped (exit code explained, OOM, restarts), environment, mounts, ports, networks, health history and notable settings (privileged, Docker socket mounted…). Secret-looking values are never sent unless you press *Show*.
- **Disk usage & safe cleanup** — see where Docker's space goes and free it with a preview: unused build cache, untagged images, stopped containers, unused images and volumes. Nothing is deleted until you confirm, items are removed one by one without `force`, and volumes need an explicit acknowledgement.
- **Alerts** — get told (browser, **Telegram**, **webhook**) when a container crashes, runs out of memory, turns unhealthy, restarts in a loop or stays at high CPU/RAM, **and when it is over**. **Silence** a container or a whole stack for an hour, a day or until you lift it; ignore containers per rule; set a cooldown per rule. Ignores stops you do yourself; off by default, no measurable cost.
- **Tray icon** (optional, `npm run tray:install`) — a green / amber / grey icon with *Open*, *silence all alerts for 1 hour* and, on Linux, *start / stop / restart the service*. Verified on Linux; macOS and Windows untested. Costs ~110 MB of RAM, and its only dependency ships a prebuilt binary, so it is a separate extra, not part of the app.
- **Usage at a glance** — CPU and RAM with meters and **trend lines**, summary cards with the **top consumer**, and **sorting by CPU or RAM**.
- **Usage history** — CPU/RAM sampled into SQLite and charted over 1 h / 24 h / 7 days; survives restarts.
- **English and Spanish** (switch in the sidebar), **light and dark theme**, responsive layout, keyboard shortcuts, keyboard-accessible.
- **Runs as a systemd user service** with strict CPU/memory limits (Linux).

## Screenshots

| | |
|---|---|
| ![Containers, dark](docs/img/containers-dark.png) **Containers** (dark) | ![Containers, light](docs/img/containers-light.png) **Containers** (light) |
| ![Command palette](docs/img/palette.png) **Command palette** (`Ctrl`/`⌘` + `K`) | ![Row menu](docs/img/row-menu.png) **Row actions menu** |
| ![Compact view](docs/img/containers-compact.png) **Compact view** | |
| ![Live logs](docs/img/logs.png) **Live logs** | ![Usage chart](docs/img/chart.png) **Usage history** |
| ![Create container](docs/img/create.png) **Create a container** | ![Compose](docs/img/compose.png) **Compose stacks** |
| ![Events](docs/img/events.png) **Live events** | ![Alerts](docs/img/alerts.png) **Alerts** (Telegram, webhook, browser) |
| ![Disk usage](docs/img/disk.png) **Disk usage and safe cleanup** | ![Container details](docs/img/detail.png) **Container details** |
| ![Environment, secrets hidden](docs/img/detail-env.png) **Secrets stay hidden until you ask** | ![Images](docs/img/images.png) **Images** |
| ![Groups and bulk actions](docs/img/groups.png) **Stack actions and selection** | ![Custom groups](docs/img/custom-groups.png) **Your own groups** |
| ![Drag and drop](docs/img/drag-drop.png) **Drag and drop between groups** | ![Live progress](docs/img/progress.png) **Live progress with Cancel** |
| ![Spanish UI](docs/img/containers-es.png) **Spanish UI** | |

<p align="center"><img src="docs/img/mobile.png" alt="Mobile layout" width="260"></p>

All screenshots use fictional demo data (see [Try it without Docker](#try-it-without-touching-your-containers)).

## Requirements

| | |
|---|---|
| Docker | Engine running (the socket / named pipe is auto-detected — see [platforms](docs/PLATFORMS.md)) |
| Permissions | Linux: your user must be in the `docker` group |
| Node.js | **22.13+** (uses the built-in `node:sqlite`) |
| Linux + systemd | Only for the optional service installer |

### Platform support

| | Linux | macOS | Windows |
|---|:---:|:---:|:---:|
| Used daily / verified with real Docker | ✅ | ❌ not yet | ❌ not yet |
| CI (build, tests, boot) | ✅ | ✅ | ✅ |
| Autostart | systemd script | launchd (manual) | Task Scheduler (manual) |

macOS and Windows should work (Docker Desktop, Colima, Rancher Desktop and OrbStack are detected) but **have not been tested with a real Docker yet** — feedback is very welcome. Details and autostart recipes: [docs/PLATFORMS.md](docs/PLATFORMS.md).

## Quick start

```bash
git clone https://github.com/Jhostter/docker-kong.git
cd docker-kong
npm install
npm run build
npm start            # http://localhost:4455 (same commands on Linux, macOS and Windows)
```

### Install as a service (starts with your machine)

```bash
./scripts/install-service.sh
```

This builds the app and installs a **systemd user unit** with low priority (`CPUQuota=15%`, `Nice=15`, `MemoryMax=256M`). To start it at boot without logging in: `sudo loginctl enable-linger $USER`.

```bash
systemctl --user status docker-gestor
journalctl --user -u docker-gestor -f
```

## Try it without touching your containers

A fake Docker Engine API with fictional data ships with the repo — handy to explore the UI, test on a machine without Docker, or regenerate the screenshots:

```bash
node scripts/demo/mock-docker.mjs /tmp/docker-mock.sock &
DOCKER_SOCKET=/tmp/docker-mock.sock npm start
```

`npm run demo:shots` regenerates everything in `docs/img/` (needs Chrome/Chromium and, for the GIF, ffmpeg).

## Configuration

Optional environment variables:

| Variable | Default | Description |
|---|---|---|
| `DOCKER_SOCKET` / `DOCKER_HOST` | auto-detected | Docker socket, named pipe or `tcp://` endpoint |
| `PORT` | `4455` | Port (always bound to `127.0.0.1`) |
| `DATA_DIR` | per OS (Linux: `~/.local/share/docker-gestor`) | Where the history database is stored |
| `ALERT_HOST` | hostname | Label that prefixes alert messages |
| `HEALTH_WAIT_SECONDS` | `90` | How long a group start waits for a healthy dependency |
| `SAMPLE_SECONDS` | `15` | Usage sampling interval |
| `RETENTION_DAYS` | `7` | Days of history to keep |

## ⚠️ Security

Controlling Docker is equivalent to having root on the machine. Docker Kong is designed for **local, single-user use**:

- It listens on `127.0.0.1` only and rejects requests whose `Host`/`Origin` is not `localhost:<port>` (CSRF / DNS-rebinding protection, including the terminal WebSocket).
- Container ports created from the UI are published on `127.0.0.1` only.
- All inputs are validated server-side; Compose only acts on stacks Docker already knows.
- **There is no authentication.** Do **not** expose it to a network or the internet (reverse proxies, tunnels, `0.0.0.0`) without adding your own authentication layer.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Documentation

- 📖 [Usage guide (English)](docs/GUIDE.md) · [Guía de uso (español)](docs/GUIA.md) — every section, shortcuts, data, configuration, troubleshooting and API.
- [Platform support and autostart recipes](docs/PLATFORMS.md)
- [Changelog](CHANGELOG.md)

## Development

```bash
npm run dev          # hot reload (stop the service first: it uses port 4455)
npm run typecheck
npm test             # unit tests (Docker endpoint detection)
npm run build
npm run smoke        # boots the built server without Docker and checks it
npm run e2e:alerts   # alerts end-to-end against a fake Docker, Telegram and webhook
npm run e2e:disk     # disk cleanup end-to-end (incl. refusing to delete things in use)
npm run e2e:detail   # container details end-to-end (secrets must never leak)
npm run e2e:groups   # stack actions end-to-end (dependency ordering, partial failures)
npm run e2e:custom-groups   # custom groups end-to-end (persistence, rename/merge, limits)
npm run e2e:dnd      # drag and drop with a real mouse drag (needs Chrome/Chromium)
npm run e2e:health   # group start waits for healthy dependencies (real timings)
npm run e2e:progress # live progress stream and cancelling a group action
npm run e2e:ui       # interface structure, row menu, command palette, density, skeleton (needs Chrome/Chromium)
npm run e2e:resilience # stays current: Docker outage, event bursts, late responses (needs Chrome/Chromium)
npm run e2e:tray     # tray icon over D-Bus, with a throw-away systemd unit (Linux desktop only; not in CI)
```

Stack: Next.js (App Router) · React · Tailwind CSS 4 · dockerode · `node:sqlite` · ws · xterm.js. UI strings live in `src/app/locales/` (adding a language is one file).

## Contributing

Issues and pull requests are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)

---

# 🇪🇸 Español

Panel web local y ligero para gestionar Docker desde el navegador: contenedores, logs en vivo, terminal interactiva, Compose, imágenes, volúmenes, redes, eventos, alertas (Telegram, webhook y navegador; con **silencios** por contenedor o stack y aviso de **recuperación**), consumo con tendencias y ordenación por CPU o RAM, icono de bandeja opcional, limpieza segura de disco, detalle de contenedor (con secretos ocultos), acciones por stack o selección, grupos propios (también arrastrando y soltando) y gráficas de consumo con historial. En reposo usa **~0,2–0,5 % de un núcleo y ~55 MB de RAM**. La interfaz está en **español e inglés** (selector en la barra lateral).

**Pensado para una persona y una máquina:** sin servidor de base de datos, sin agente y sin cuentas; solo escucha en `127.0.0.1` y no hace trabajo mientras nadie mira la página. Si necesitas varios usuarios, varios hosts o Kubernetes, usa una herramienta más grande (Portainer y similares).

**Plataformas:** probado a diario solo en Linux. macOS y Windows compilan y arrancan en el CI, pero **no se han probado con un Docker real**; ver [docs/PLATFORMS.md](docs/PLATFORMS.md).

**Inicio rápido**

```bash
git clone https://github.com/Jhostter/docker-kong.git
cd docker-kong
npm install && npm run build && npm start     # http://localhost:4455
```

Para instalarlo como servicio que arranca con el equipo: `./scripts/install-service.sh`. Para probarlo sin tocar tus contenedores hay un Docker simulado con datos ficticios (ver *Try it without touching your containers*).

**Seguridad:** solo escucha en `127.0.0.1` y **no tiene autenticación**; no lo expongas a la red ni a internet.

📖 Guía completa: [docs/GUIA.md](docs/GUIA.md) · Licencia: [MIT](LICENSE)
