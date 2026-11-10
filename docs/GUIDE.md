# Docker Gestor — Usage guide

A local web dashboard to manage Docker from your browser: containers, logs, terminal, Compose, images, volumes, networks, events and usage charts. It is meant for personal use on your own machine and uses very few resources.

> 🇪🇸 Spanish version: [GUIA.md](GUIA.md) · Platform notes (macOS / Windows): [PLATFORMS.md](PLATFORMS.md)

## Contents

1. [Quick start](#1-quick-start)
2. [Installation and the systemd service](#2-installation-and-the-systemd-service)
3. [Interface tour](#3-interface-tour)
4. [Containers](#4-containers)
5. [Compose](#5-compose)
6. [Images](#6-images)
7. [Volumes](#7-volumes)
8. [Networks](#8-networks)
9. [Events](#9-events)
10. [Keyboard shortcuts](#10-keyboard-shortcuts)
11. [Theme and language](#11-theme-and-language)
12. [Usage history and stored data](#12-usage-history-and-stored-data)
13. [Configuration](#13-configuration)
14. [Resource usage](#14-resource-usage)
15. [Security](#15-security)
16. [Troubleshooting](#16-troubleshooting)
17. [Uninstall](#17-uninstall)
18. [For developers](#18-for-developers)

---

## 1. Quick start

```bash
git clone https://github.com/Jhostter/docker-gestor.git
cd docker-gestor
npm install
npm run build
npm start
```

Open **http://localhost:4455**. If you installed the service ([section 2](#2-installation-and-the-systemd-service)) it is already running.

## 2. Installation and the systemd service

### Requirements

| Requirement | Detail |
|---|---|
| Docker | Engine running; the socket / named pipe is auto-detected (see [PLATFORMS.md](PLATFORMS.md)) |
| Permissions | Linux: your user must be in the `docker` group (`id -nG`) |
| Node.js | 22.13+ (uses the built-in `node:sqlite`) |
| systemd | Only for the service installer (`systemctl --user`) |

### Install as a service (Linux)

```bash
./scripts/install-service.sh
```

The script builds the app, writes `~/.config/systemd/user/docker-gestor.service`, reloads systemd and enables + starts it.

To start it at boot without logging in, enable *linger*:

```bash
loginctl show-user $USER -p Linger      # Linger=yes → already on
sudo loginctl enable-linger $USER       # if it says Linger=no
```

| Action | Command |
|---|---|
| Status | `systemctl --user status docker-gestor` |
| Restart | `systemctl --user restart docker-gestor` |
| Stop | `systemctl --user stop docker-gestor` |
| Service logs | `journalctl --user -u docker-gestor -f` |
| Disable autostart | `systemctl --user disable docker-gestor` |

> **After updating the code** rebuild: `git pull && npm install && npm run build && systemctl --user restart docker-gestor` (from the project folder).

## 3. Interface tour

- **Sidebar** (on top on mobile): the six sections. At the bottom: connection status (🟢 *Docker connected*), theme, language and help.
- **Main area**: the active section.
- **Toasts**: bottom right. Success toasts fade on their own; errors stay a bit longer and can be dismissed with ✕.
- **Confirmations**: every destructive action asks first and explains what will happen.
- **Windows**: close with `Esc`, ✕, or by clicking outside (the terminal is the exception).

The browser tab title shows how many containers are running: `(12) Docker Gestor`.

## 4. Containers

Four summary cards on top: running containers, total CPU, memory in use and number of stacks.

### Search, filter and group

- **Search** (`/`): by name, image or stack.
- **All / Running / Stopped**, with counts.
- **Group by stack**: groups containers by Compose project; the rest go under “No stack”.

### Each row

| Element | Meaning |
|---|---|
| Name and image | Hover for the full text |
| Links `:8080:80 ↗` | Published ports. TCP ones open `http://localhost:<port>` in a new tab |
| Status badge | 🟢 Running · 🟡 Starting / other · 🔴 unhealthy · ⚪ Stopped |
| CPU and RAM | Current usage with a bar; refreshed every 10 s, only while you are on this section |

### Action buttons

| Icon | Action |
|---|---|
| ▶ / ■ | Start or stop |
| ⟳ | Restart |
| 📄 | **View logs** |
| ›_ | **Open terminal** (running containers only) |
| 📊 | **Usage chart** |
| 🗑 | Delete (asks first) |

While an action runs, its button shows a spinner and is disabled.

### Logs

A full-screen window with live logs (the last 200 lines, then real time).

- **Filter lines**: type to keep only lines containing the text.
- **Follow tail**: auto-scroll; switches off if you scroll with the wheel.
- **Wrap lines** and **Timestamps** toggles.
- Lines containing *error / fatal / exception* are red; *warning* lines are amber.
- 💾 downloads what you see as a `.log` file; 🗑 clears the screen (it does not delete Docker's logs).
- The last 2000 lines are kept on screen.
- The indicator shows **Live**, **Reconnecting…** or **Finished** (a stopped container emits nothing more).

### Terminal

An interactive shell inside the container (`bash` if present, otherwise `sh`), with colors, resizing and programs like `vim` or `top`.

- Running containers only.
- `Esc` does **not** close this window (programs like vim need it). Close it with ✕; that ends the session.
- Minimal images without a shell (e.g. *distroless*) will not work.

### Usage chart

CPU (%) and memory over **1 h**, **24 h** or **7 days**. Hover (or touch) the chart to read the exact value and time. Right after the service or the container starts you will see “Not enough data yet”: one sample is taken every 15 s.

### Create a container

**New container** button (or key `n`):

| Field | Notes |
|---|---|
| **Image** (required) | Suggests images you already have. Pulled if not available locally |
| **Name** | Optional; Docker generates one |
| **Ports** | `host:container`, e.g. `8080:80` or `53:53/udp`. Published on **127.0.0.1 only** |
| **Environment variables** | `KEY=value` |
| **Volumes** | `source:/path/in/container`. The source is a named volume or a host path; add `:ro` for read-only |
| **Restart policy** | Do not restart · Unless stopped manually · Always · Only on failure |
| **Network** | Default (bridge) or one of yours |

Each line is validated as you type (red border when malformed) and **Create and start** enables when everything is valid. If Docker refuses (duplicate name, port in use…) the error appears inside the form without losing what you typed.

## 5. Compose

Lists the Compose projects Docker knows about (from container labels) and how many services are running.

| Button | Equivalent | Effect |
|---|---|---|
| **View containers** | — | Jumps to Containers filtered by that stack |
| **Start** | `docker compose up -d` | Creates and starts services |
| **Restart** | `docker compose restart` | Restarts services |
| **Stop** | `docker compose stop` | Stops without removing |
| **Update images** | `docker compose pull` | Pulls newer versions (restarts nothing) |
| **Take down** | `docker compose down` | Stops and **removes** the stack's containers and networks. Volumes are kept |

After each action a window shows the command output.

**Limitations**

- Only stacks whose `docker-compose.yml` is still at its original location can be managed. Stacks created by other tools (e.g. **Supabase CLI**) are listed read-only, with the reason shown.
- Commands time out after 5 minutes.
- Only stacks Docker already knows are acted on; the browser can never supply arbitrary disk paths.

## 6. Images

- **Pull**: enter a reference (`nginx:latest`, `postgres:16-alpine`) and press *Pull*.
- **Filters**: All / **In use** / **Unused**, plus search by tag or id.
- Each image shows tag, short id, size and age; `+N` means extra tags.
- **In use** means some container (even a stopped one) was created from it.
- The total number of images and disk space is shown at the top right.
- Deleting asks first; Docker refuses to delete an image a container uses.

## 7. Volumes

Lists volumes with their driver and path. Auto-named volumes (64 hex characters) are shortened and tagged **anonymous**; they usually come from images that declare `VOLUME`.

> ⚠️ **Deleting a volume permanently deletes its data.** Docker refuses if a container uses it. Back up before deleting a recognizable one (e.g. a database).

On Docker Desktop the path shown is inside Docker's virtual machine, not on your disk.

## 8. Networks

- **Create network**: letters, numbers, `.`, `-`, `_`. Created as *bridge*.
- Each network shows its subnet and connected containers (chips).
- `bridge`, `host` and `none` are marked **system** and cannot be deleted.
- Docker refuses to delete a network with connected containers.

## 9. Events

A live stream of what happens in Docker: creating, starting, stopping and destroying containers, pulling images, networks and volumes.

- On load you get the events of the **last 10 minutes**, then live ones (up to 300 on screen).
- Filter by type: All / Containers / Images / Networks / Volumes.
- Colors: 🟢 create/start · 🔴 stop/remove · 🟡 other.
- `exec_*` and `health_status` are omitted: they fire constantly and would bury the useful ones.

These events are also what keeps the UI up to date without polling Docker every few seconds.

## 10. Keyboard shortcuts

Press `?` anytime. They are ignored while you type in a field or a window is open.

| Key | Action |
|---|---|
| `1` – `6` | Switch section |
| `/` | Go to search |
| `n` | New container |
| `r` | Refresh data |
| `?` | Help |
| `Esc` | Close the open window |

The UI is fully keyboard-navigable and respects the system “reduce motion” preference.

## 11. Theme and language

- **Theme**: follows your system by default; switch with ☀/🌙 in the sidebar (on mobile, the floating button bottom left). Remembered in the browser.
- **Language**: English or Spanish. The first visit uses your browser language; switch with the **ES / EN** button next to the theme. Remembered in the browser.

## 12. Usage history and stored data

- Every **15 seconds** CPU and memory of running containers are recorded in a SQLite database.
- Kept for **7 days**; old samples are pruned once an hour.
- Stored by **container name**, so history continues if you recreate a container with the same name (common with Compose).
- Location: Linux `~/.local/share/docker-gestor/history.db` (honors `XDG_DATA_HOME`) · macOS `~/Library/Application Support/docker-gestor` · Windows `%LOCALAPPDATA%\docker-gestor` (plus the `-wal` / `-shm` helper files).
- Survives service and machine restarts. Nothing is recorded while the service is stopped.
- Roughly a few MB per week for a dozen containers.

It is a standard SQLite file with a table `samples(ts, name, cpu, mem)` (`ts` in milliseconds), easy to query or back up.

## 13. Configuration

Optional environment variables:

| Variable | Default | Effect |
|---|---|---|
| `DOCKER_SOCKET` / `DOCKER_HOST` | auto-detected | Docker socket, named pipe or `tcp://` endpoint (see [PLATFORMS.md](PLATFORMS.md)) |
| `PORT` | `4455` | Port (the allowed-hosts list follows it) |
| `DATA_DIR` | per OS | Where the history is stored |
| `SAMPLE_SECONDS` | `15` | Sampling interval |
| `RETENTION_DAYS` | `7` | Days of history |

For the systemd service:

```bash
systemctl --user edit docker-gestor
```

```ini
[Service]
Environment=SAMPLE_SECONDS=30
Environment=RETENTION_DAYS=14
```

Then `systemctl --user restart docker-gestor`. The bind address `127.0.0.1` is fixed on purpose.

## 14. Resource usage

- **No constant polling**: the UI refreshes when Docker emits an event; there is a 60 s fallback refresh.
- **Only what is needed**: each section requests only its own data; live stats only on *Containers*; nothing is requested while the browser tab is hidden.
- **No tabs open**: no event or log connections; only the 15 s sampling remains.
- **Efficient recording**: one transaction per sample, SQLite in WAL mode, aggregation done in the database.
- **systemd limits** (Linux only): `CPUQuota=15%`, `CPUWeight=20`, `Nice=15`, `IOWeight=20`, `MemoryHigh=160M`, `MemoryMax=256M`, `TasksMax=64`.

Measured with 12 containers and one open tab: **≈ 0.2–0.5 % of a core** and **≈ 55 MB** (cgroup memory). Check yourself with `systemctl --user status docker-gestor` or `systemd-cgtop`.

## 15. Security

Controlling Docker is equivalent to having admin rights on the machine. Therefore:

- The server listens **only on `127.0.0.1`**.
- Every request is rejected unless its `Host` / `Origin` is `localhost:<port>` / `127.0.0.1:<port>`, which protects against malicious web pages trying to drive your Docker from the browser (CSRF and *DNS rebinding*). The terminal WebSocket is covered too.
- Ports of containers created from the panel are published on `127.0.0.1` only.
- Names, ports, variables, volumes and images are validated server-side.
- Compose only acts on stacks Docker already knows.
- **There is no authentication**: any process or user able to reach `localhost:<port>` on your machine can use the panel.

**Do not expose it to the internet or your network** (tunnels, reverse proxies, `0.0.0.0`) without adding authentication first. The terminal gives root inside the container, and a host-path volume gives access to your files.

## 16. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `localhost:4455` does not open | `systemctl --user status docker-gestor`; if down: `journalctl --user -u docker-gestor -n 50` |
| “Lost connection to the server” banner | The service stopped or is restarting; the UI retries by itself |
| `permission denied` on the socket | Your user is not in the `docker` group: `sudo usermod -aG docker $USER`, then log out and in |
| `EADDRINUSE` / port 4455 busy | Another process uses it (e.g. a forgotten `npm run dev`): `ss -ltnp \| grep 4455` |
| UI unchanged after updating | Rebuild: `npm run build` and restart the service |
| Charts say “Not enough data yet” | Wait 30–45 s after start; the container must be running |
| A Compose stack has no buttons | Created by another tool or its `docker-compose.yml` moved; read-only |
| Terminal closes at once / errors | The image has no shell, or the container is not running |
| “Host not allowed” (403) | You use another name or port (LAN IP, proxy…). Use `http://localhost:4455` |
| Deleting an image / volume / network fails | In use by a container; Docker's message says so |
| Does not start at boot | Missing linger: `sudo loginctl enable-linger $USER` |
| Service restarts itself | May have hit the 256 MB memory limit: check `journalctl --user -u docker-gestor` |

## 17. Uninstall

```bash
systemctl --user disable --now docker-gestor
rm ~/.config/systemd/user/docker-gestor.service
systemctl --user daemon-reload

# Optional: delete the history (then the project folder, if you like)
rm -rf ~/.local/share/docker-gestor
```

This does not touch your containers, images, volumes or networks.

## 18. For developers

### Layout

```
server.mjs                    Server: Next.js + terminal WebSocket
scripts/install-service.sh    systemd service installer
scripts/smoke.mjs             Boot smoke test (no Docker needed)
scripts/demo/                 Mock Docker API, demo data, screenshot generator
src/instrumentation.ts        Starts usage sampling
src/lib/docker.ts             Docker client, Host/Origin guard, helpers
src/lib/socket.mjs            Docker endpoint detection (Linux / macOS / Windows)
src/lib/history.ts            Sampling and SQLite queries
src/app/page.tsx              The UI (sections)
src/app/ui.tsx                Shared components: buttons, modal, toasts, confirmations, icons
src/app/i18n.ts + locales/    Translations (one file per language)
src/app/{Logs,Terminal,HistoryChart,CreateForm}.tsx   Windows
src/app/api/**                REST API and SSE streams
```

### API (all under `/api`)

| Route | Methods | Description |
|---|---|---|
| `/containers` | GET, POST | List / create and start |
| `/containers/:id/:action` | POST | `start`, `stop`, `restart`, `remove` |
| `/containers/:id/logs` | GET (SSE) | Live logs |
| `/stats` | GET | CPU/RAM of running containers |
| `/history?name=&range=` | GET | History series (`1h`, `24h`, `7d`) |
| `/events` | GET (SSE) | Docker events |
| `/compose` | GET, POST | List stacks / `up`, `down`, `restart`, `stop`, `pull` |
| `/images` | GET, POST, DELETE | List / pull / delete |
| `/volumes` | GET, DELETE | List / delete |
| `/networks` | GET, POST, DELETE | List / create / delete |
| `ws://…/ws/exec?id=` | WebSocket | Interactive terminal |

Connection errors answer `503` with a `code` (`docker_unreachable`, `docker_denied`) that the UI translates; other errors carry an English `error` message.

### Development

```bash
systemctl --user stop docker-gestor     # frees port 4455
npm run dev                             # hot reload
npm run typecheck && npm test && npm run smoke
```

No Docker at hand? Run the fake API: `node scripts/demo/mock-docker.mjs /tmp/docker-mock.sock &` then `DOCKER_SOCKET=/tmp/docker-mock.sock npm run dev`.

### Adding a language

Copy `src/app/locales/en.ts`, translate the values, then register it in `src/app/i18n.ts` (`Lang`, `LANGS`, `dicts`). TypeScript reports any missing key. Strings support `{placeholders}` and `"singular|plural"` forms.

### Stack

Next.js (App Router) · React · Tailwind CSS 4 · dockerode · `node:sqlite` · ws · xterm.js. No native dependencies to compile.
