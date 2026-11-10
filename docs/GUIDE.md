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
10. [Alerts](#10-alerts)
11. [Disk](#11-disk)
12. [Keyboard shortcuts](#12-keyboard-shortcuts)
13. [Theme and language](#13-theme-and-language)
14. [Usage history and stored data](#14-usage-history-and-stored-data)
15. [Configuration](#15-configuration)
16. [Resource usage](#16-resource-usage)
17. [Security](#17-security)
18. [Troubleshooting](#18-troubleshooting)
19. [Uninstall](#19-uninstall)
20. [For developers](#20-for-developers)

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

- **Sidebar** (on top on mobile): the eight sections in two groups, **Manage** (Containers, Compose, Images, Volumes, Networks) and **Observe** (Events, Alerts, Disk), with a search button at the top. At the bottom: connection status (🟢 *Docker connected*), theme, language and help.
- **Main area**: the active section, with its title.
- **Toasts**: bottom right. Success toasts fade on their own; errors stay a bit longer and can be dismissed with ✕.
- **Confirmations**: every destructive action asks first and explains what will happen.
- **Windows**: close with `Esc`, ✕, or by clicking outside (the terminal is the exception).
- **Loading**: while data arrives you see placeholder rows (a skeleton), so the layout does not jump.

The browser tab title shows how many containers are running: `(12) Docker Gestor`.

### Command palette

Press **`Ctrl`+`K`** (**`⌘`+`K`** on a Mac) anywhere, even while typing in a field, or use the search button at the top of the sidebar. Type what you want and press `Enter`:

- **Sections**: `images`, `disk`, `alerts`…
- **Containers**: `logs api` finds *Logs · shop-api*; every container offers *Details*, *Logs*, *Terminal* (if running) and *Start/Stop*.
- **Actions**: new container, refresh, toggle theme, change language, help.

Every word you type has to match (in any order), accents and case are ignored, and a long enough abbreviation works too (`shwb` finds *shop-web*). `↑` `↓` move, `Enter` runs, `Esc` closes, and `Ctrl`+`K` again closes it.

### It keeps itself up to date

The interface follows Docker through its event stream, so a container you start, stop or remove from the command line, Compose or another tool shows up within a second **without reloading the page**. It also catches up by itself when:

- **Docker stops answering for a while** (it restarts, the machine wakes up…): an amber notice says *Docker is not responding* and the page reconnects on its own, refreshing as soon as Docker is back. A red notice means the **Docker Gestor service** itself was lost, which is a different thing.
- **Many events arrive at once** (stopping a whole stack): it refreshes at a steady pace instead of waiting for the storm to end.
- **A slow, outdated answer arrives late**: it never overwrites newer data.
- **You come back to the tab** after a while.

After an action it refreshes immediately and once more a moment later, in case Docker takes a beat to show the new state. An open *Details* window updates itself too.

## 4. Containers

Four summary cards on top: running containers, total CPU, memory in use and number of stacks.

### Search, filter and group

- **Search** (`/`): by name, image or stack.
- **All / Running / Stopped**, with counts.
- **Group by**: **Stack** (Compose projects; the rest go under “No stack”), **My groups** (your own, see below) or **None**.

### Each row

| Element | Meaning |
|---|---|
| Coloured stripe | The state at a glance: green running, red unhealthy, amber starting or other, grey stopped |
| Name and image | Click the name for the details; hover for the full text |
| Ports `:8080:80 ↗` | Published ports as chips. TCP ones open `http://localhost:<port>` in a new tab |
| Status badge | 🟢 Running · 🟡 Starting / other · 🔴 unhealthy · ⚪ Stopped |
| CPU and RAM | Current usage with a bar; refreshed every 10 s, only while you are on this section |

### Row actions

The two you use most are on the row; everything else is in the **⋯** menu.

| Control | Action |
|---|---|
| ▶ / ■ | Start or stop |
| 📄 | **View logs** |
| **⋯** → Details | The container's [details](#container-details) |
| **⋯** → Restart | Restart |
| **⋯** → Open terminal | **Terminal** (running containers only) |
| **⋯** → Usage chart | **Usage chart** |
| **⋯** → Delete | Delete (asks first), in red and set apart |

The menu is fully keyboard-driven: `Enter` or `↓` on the **⋯** button opens it, `↑` `↓` `Home` `End` move, `Enter` chooses, `Esc` closes it and puts the focus back on the button. It opens upwards when there is no room below.

While an action runs, its button shows a spinner and is disabled.

**Density.** The button next to *Group by* switches between a **comfortable** view and a **compact** one (one line per container, so a whole stack fits on screen). It is remembered.

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

### Groups (stacks) and selection

Containers are grouped by Compose stack (switch it off with *Group by stack*). Each group header gives you:

- **How the group is doing:** `5/5 running` and its combined CPU and memory.
- **▶ ■ ⟳ for the whole group:** start all, stop all, restart all. They work on the **containers themselves**, so they also work for groups Compose cannot manage (stacks created by other tools such as Supabase CLI, or containers that belong to no stack).
- **A checkbox** to select the whole group, and a **▾ chevron** to collapse it (remembered between visits).

**Order matters.** When Compose declares dependencies (`depends_on`), Docker Gestor follows them: it **starts** the database and cache first, then the API, then the web server, and **stops** in the reverse order. Containers in the same layer run in parallel, so a big stack is still fast. Without dependency information (or for containers outside Compose) everything runs at once. Restart follows the start order.

**Waiting for a service to be ready.** If Compose declares a dependency as `service_healthy` (or `service_completed_successfully`, typical for one-off setup containers), starting or restarting a group **waits** for it before starting what depends on it, exactly like `docker compose up` does. If the dependency never gets ready, whatever depends on it is **not started** (and neither is whatever depends on that), and the failure window says why: it timed out, it became unhealthy, or it stopped. A dependency with no health check is not waited for, `service_started` never waits, and stopping or deleting never waits either.

![A group start that refused services whose database never became healthy](img/health-failure.png)

- The dependency is looked up **inside the same Compose project**, even if it is not part of your selection: pressing *Start all* on only the stopped containers of a stack still waits for a database that is running but not yet healthy. If that dependency is stopped, the dependent is refused rather than started without it.
- The wait is up to **90 seconds** per dependency; change it with `HEALTH_WAIT_SECONDS` (1 to 600). A failure caused by an unhealthy or stopped dependency is reported immediately, not after the timeout.

**Live progress, and Cancel.** When a group action takes more than a moment, a panel lists every container with its state (queued, working, done, failed) and the current layer, and while it waits it says **what it is waiting for**: `Waiting for “db” to be ready… 12 s / 90 s`. **Cancel** stops the rest: what is already running finishes (nothing is interrupted halfway), but no further layer or container is started and the waiting stops. Quick actions never flash the panel.

![Progress panel: two services waiting for the database, one queued](img/progress.png)

**Select any containers** with the checkboxes on each row (or the one next to the search box for everything visible). A bar appears with **Start**, **Stop**, **Restart** and **Delete** for the selection, even across different groups.

**Safety:** stopping, restarting and deleting several containers always asks first and lists their names; deleting also removes running containers but never their named volumes. Starting needs no confirmation. Acting on something already in the wanted state is not an error (a running container is simply skipped), and if one container fails the others still go ahead; failures are listed with Docker's reason. Group actions apply to the containers currently visible in that group, so a filter (e.g. *Stopped*) narrows what *Start all* does.

> The **Compose** section is still the place for `up`, `down` and `pull`, which need the stack's `docker-compose.yml`.

### Your own groups

Next to the search box, **Group by** switches between **Stack** (Compose projects, the default), **My groups** and **None**. The choice is remembered.

In **My groups** you decide how containers are organised, independently of Compose: for example *Frontend*, *Data* or *Experiments*.

- **Create or fill a group:** select containers and press **Move to group…**. Type a new name or pick an existing one (names are case-insensitive: typing `frontend` joins `Frontend`). A container belongs to one group at a time.
- **Drag and drop:** in *My groups* every row has a **⠿ handle**. Drag it onto any group to move the container there. If the row you grab is selected, **the whole selection** moves together. While you drag, two extra drop zones appear: one to **take containers out of their group** and one to **create a new group** (it asks for a name). The screen updates at once and goes back to how it was, with an error message, if the server refuses.
- **Remove from a group:** select the containers, press **Move to group…** and choose **Remove from group**.
- **Rename:** the pencil in the group header. Renaming to an existing group **merges** the two.
- **Dissolve:** the ✕ in the group header. **The containers are never touched**: they just stop belonging to the group.
- A custom group works exactly like a stack: **start all / stop all / restart all** (with the same dependency-aware ordering when the containers come from Compose), selection and collapsing.

Drag and drop uses the browser's native drag, which **does not work on touch screens**; there, and for keyboard use, **Move to group…** does the same. Dragging is only available in *My groups* (Compose stacks come from Compose).

Groups are stored on the server, **by container name**, so they survive recreating a container (typical with Compose) and are the same from any browser. There can be up to 50 groups with names of 1 to 40 characters. Assignments of containers that no longer exist are kept, so a stack you bring `down` and back `up` returns to its group.

### Container details

Click a container's name, or the ⓘ button, to open its details. It replaces having to run `docker inspect` by hand:

| Tab | What it shows |
|---|---|
| **Overview** | State, **why it stopped** (exit code explained: `137` = killed, `143` = stopped, `1` = application error…, plus the *out of memory* flag), restart count and policy, image, command, user, limits and **notable settings** |
| **Environment** | Variables, searchable. Sensitive-looking values are **hidden**; press **Show** to fetch one, **Copy** to copy it |
| **Mounts** | Host folders and volumes, with their path and read-only / read-write mode |
| **Network** | Published ports (clickable), ports that are exposed but not published, and each network with its IP, gateway and aliases |
| **Health** | Health status, consecutive failures and the latest checks with their output |
| **Labels** | All labels (Compose project, image metadata…) |
| **Raw** | The complete `docker inspect` JSON, with sensitive values hidden |

**Notable settings** calls out things worth knowing about a container: *privileged* mode, the **Docker socket** mounted (root-equivalent control of the machine), the host's **root filesystem** mounted, the host's **network** or **process** namespace, and extra Linux **capabilities**.

**How secrets are handled:** the server never sends the value of a sensitive-looking variable (or of a secret-looking command argument) unless you press **Show** on that single variable; that request is not cacheable. The detection is a best-effort heuristic on the **name** (`*PASSWORD*`, `*TOKEN*`, `*KEY*`, `*SECRET*`…), on **credentials inside URLs** (`postgres://user:pass@host`) and on **how the value looks** (JWTs, well-known token prefixes, long key-like strings). It errs on the side of hiding too much: a false positive only costs a click, but it is not a security boundary against someone who already controls Docker.

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

## 10. Alerts

Alerts tell you when something goes wrong, so you do not have to keep the page open. They are **off by default**: nothing runs until you switch them on in the **Alerts** section.

### What it watches

| Rule | Fires when |
|---|---|
| **A container crashes** | It exits with a non-zero code **without you stopping it** |
| **Out of memory (OOM)** | The system kills it for lack of memory |
| **Unhealthy** | Its health check fails (and a “healthy again” message follows when it recovers) |
| **Restart loop** | It crashes N times within M minutes (default 3 in 10) |
| **High CPU** *(off by default)* | It stays above X % for M minutes (default 90 % for 5) |
| **High memory** *(off by default)* | It stays above X % of its memory limit for M minutes (default 90 % for 2). Without a limit the percentage is of the machine's RAM |

**No noise:** a `stop`, `restart` or removal you do yourself (from this UI or from the command line) is recognised and ignored. The same alert for the same container is not repeated for the **cooldown** period (10 minutes by default; 0 disables it).

### Channels

- **Browser notifications** — a toast always appears in the open page, and a system notification when the tab is in the background. Grant permission with the button in the section. It only works while a Docker Gestor tab is open.
- **Telegram** — works with the tab closed. Create a bot with [@BotFather](https://t.me/BotFather), send it any message, then enter its **token** and your **chat ID** (a number, or `@yourchannel`).
- **Webhook** — works with the tab closed. Docker Gestor sends a `POST` to your URL, with an optional `Authorization` header. Format **JSON** works with Discord and Slack webhooks as is (it includes both `text` and `content`); **plain text** suits ntfy and similar services.

```json
{
  "text": "[myhost] 🔴 shop-api exited with code 1",
  "content": "[myhost] 🔴 shop-api exited with code 1",
  "event": "died",
  "container": "shop-api",
  "host": "myhost",
  "timestamp": "2026-11-10T15:04:05.000Z",
  "vars": { "code": "1" }
}
```

`event` is one of `died`, `oom`, `unhealthy`, `recovered`, `restartLoop`, `cpu`, `memory`, `test`. Use **Send test** (after saving) to check a channel; the section shows the last error or the last successful delivery of each one.

The messages use the language selected in the UI, and start with the machine name so you can tell several computers apart. Change that label with `ALERT_HOST`.

### Where things are stored

- Settings, including the Telegram token and the webhook `Authorization`, are in `alerts.json` inside the data folder, readable only by your user (permissions `600`). They are never sent back to the browser.
- The alert **history** (30 days) is in the same SQLite database as the usage history.

### Cost and limits

- With alerts **off** there is no extra work. With alerts **on** the service keeps one idle connection to Docker's event stream and checks the usage samples it already takes (measured: no visible difference in CPU or memory).
- Alerts are evaluated by the service, so they only work while it is running. If Docker restarts, the watcher reconnects by itself.
- Telegram and webhook calls time out after 8 seconds; a failing channel never blocks the others.


## 11. Disk

Docker can quietly fill your disk. The **Disk** section shows where the space goes and lets you free it **safely**.

### What you see

- The total Docker is using, split into **images**, **containers** (their writable layers), **volumes** and **build cache**, with how much of each is reclaimable. The figures match `docker system df`.
- The first load can take a few seconds on hosts with a lot of data. The result is reused for 15 seconds; **Analyze again** recomputes it.

### What can be cleaned

| Group | What it is | Selected by default |
|---|---|---|
| **Unused build cache** | Cache of previous image builds | ✅ yes — harmless, the next build is just slower |
| **Untagged images** | Leftovers of old builds that have no name | ✅ yes — the safest to delete |
| **Stopped containers** | Exited or created but never started | ❌ no — they may be intentional; you lose their writable layer, **not** their volumes |
| **Unused tagged images** | Named images no container uses | ❌ no — you may want to keep them; they can be pulled again |
| **Unused volumes** | Volumes no container mounts | ❌ no — **they hold data**; deleting is permanent |

### How it stays safe

- **Nothing is deleted until you pick items and confirm.** Pick per item or per group.
- Items are removed **one by one by the exact id you saw**, never with a global `docker system prune`, so nothing created after the preview is touched.
- It never uses `force`: Docker refuses to delete anything in use, and Docker Gestor additionally refuses running containers on its own.
- An image that any container uses (even a stopped one) and a volume that any container mounts are **never offered**.
- Deleting **volumes** needs an explicit acknowledgement that the data will be lost.
- If something cannot be removed you get the list with Docker's reason; nothing is reported as removed unless it was.
- Order: containers → images → volumes → cache. Removing a stopped container can free its image and volume, so after a cleanup the list may show new candidates.

### Sizes are estimates

Like `docker system df`, a layer shared by several images is only freed when every image using it is deleted, so the real space recovered can differ from the estimate.


## 12. Keyboard shortcuts

Press `?` anytime. They are ignored while you type in a field or a window is open.

| Key | Action |
|---|---|
| `Ctrl`/`⌘` + `K` | **Command palette** (works everywhere, even while typing) |
| `1` – `8` | Switch section |
| `/` | Go to search |
| `n` | New container |
| `r` | Refresh data |
| `?` | Help |
| `Esc` | Close the open window |

The UI is fully keyboard-navigable and respects the system “reduce motion” preference.

## 13. Theme and language

- **Theme**: follows your system by default; switch with ☀/🌙 in the sidebar (on mobile, the floating button bottom left). Remembered in the browser.
- **Language**: English or Spanish. The first visit uses your browser language; switch with the **ES / EN** button next to the theme. Remembered in the browser.

## 14. Usage history and stored data

- Every **15 seconds** CPU and memory of running containers are recorded in a SQLite database.
- Kept for **7 days**; old samples are pruned once an hour.
- Stored by **container name**, so history continues if you recreate a container with the same name (common with Compose).
- Location: Linux `~/.local/share/docker-gestor/history.db` (honors `XDG_DATA_HOME`) · macOS `~/Library/Application Support/docker-gestor` · Windows `%LOCALAPPDATA%\docker-gestor` (plus the `-wal` / `-shm` helper files).
- Survives service and machine restarts. Nothing is recorded while the service is stopped.
- Roughly a few MB per week for a dozen containers.

It is a standard SQLite file with a table `samples(ts, name, cpu, mem)` (`ts` in milliseconds), easy to query or back up.

## 15. Configuration

Optional environment variables:

| Variable | Default | Effect |
|---|---|---|
| `DOCKER_SOCKET` / `DOCKER_HOST` | auto-detected | Docker socket, named pipe or `tcp://` endpoint (see [PLATFORMS.md](PLATFORMS.md)) |
| `PORT` | `4455` | Port (the allowed-hosts list follows it) |
| `DATA_DIR` | per OS | Where the history is stored |
| `ALERT_HOST` | hostname | Label that prefixes alert messages |
| `HEALTH_WAIT_SECONDS` | `90` | How long a group start waits for a `service_healthy` dependency (1–600) |
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

## 16. Resource usage

- **No constant polling**: the UI refreshes when Docker emits an event; there is a 60 s fallback refresh.
- **Only what is needed**: each section requests only its own data; live stats only on *Containers*; nothing is requested while the browser tab is hidden.
- **No tabs open**: no event or log connections; only the 15 s sampling remains.
- **Efficient recording**: one transaction per sample, SQLite in WAL mode, aggregation done in the database.
- **systemd limits** (Linux only): `CPUQuota=15%`, `CPUWeight=20`, `Nice=15`, `IOWeight=20`, `MemoryHigh=160M`, `MemoryMax=256M`, `TasksMax=64`.

Measured with 12 containers and one open tab: **≈ 0.2–0.5 % of a core** and **≈ 55 MB** (cgroup memory). Check yourself with `systemctl --user status docker-gestor` or `systemd-cgtop`.

## 17. Security

Controlling Docker is equivalent to having admin rights on the machine. Therefore:

- The server listens **only on `127.0.0.1`**.
- Every request is rejected unless its `Host` / `Origin` is `localhost:<port>` / `127.0.0.1:<port>`, which protects against malicious web pages trying to drive your Docker from the browser (CSRF and *DNS rebinding*). The terminal WebSocket is covered too.
- Ports of containers created from the panel are published on `127.0.0.1` only.
- Names, ports, variables, volumes and images are validated server-side.
- Compose only acts on stacks Docker already knows.
- Container details never include sensitive-looking variable values unless you press *Show* on that variable.
- Alerts make outbound requests only to the Telegram API and to the webhook URL you configure; their secrets live in a `600` file and are never returned to the browser.
- **There is no authentication**: any process or user able to reach `localhost:<port>` on your machine can use the panel.

**Do not expose it to the internet or your network** (tunnels, reverse proxies, `0.0.0.0`) without adding authentication first. The terminal gives root inside the container, and a host-path volume gives access to your files.

## 18. Troubleshooting

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
| No Telegram / webhook alerts | Open **Alerts** and use *Send test*: the section shows the last error of each channel. Check the token, chat ID and that you sent your bot a message first |
| An alert fires for something I did | Only stops/restarts/removals are recognised as intentional; a `docker kill` is treated as a crash |
| The Disk section is slow the first time | Docker computes sizes on demand; it can take several seconds with many images or volumes. Results are cached for 15 s |
| Something could not be cleaned | It is in use: the list shows Docker's reason. Stop and remove the container that uses it first |
| A variable is hidden but is not a secret | The detection is deliberately cautious (any name containing `key`, `token`, `pass`…): press *Show* to see it |
| A group start says a service was not started | It depends on a service that never became healthy (see the failure window). Check that service's *Health* tab, fix it, and start the group again |
| Does not start at boot | Missing linger: `sudo loginctl enable-linger $USER` |
| Service restarts itself | May have hit the 256 MB memory limit: check `journalctl --user -u docker-gestor` |

## 19. Uninstall

```bash
systemctl --user disable --now docker-gestor
rm ~/.config/systemd/user/docker-gestor.service
systemctl --user daemon-reload

# Optional: delete the history (then the project folder, if you like)
rm -rf ~/.local/share/docker-gestor
```

This does not touch your containers, images, volumes or networks.

## 20. For developers

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
src/lib/alerts-core.mjs       Alert rules and config validation (pure, unit-tested)
src/lib/alerts.ts             Alert I/O: Docker watcher, Telegram, webhook, storage
src/lib/groups-core.mjs        Group actions: validation and dependency ordering (pure, unit-tested)
src/lib/groups.ts             Custom groups storage (SQLite, by container name)
src/lib/inspect-core.mjs       Container details shaping and secret masking (pure, unit-tested)
src/lib/disk-core.mjs         Disk usage analysis and cleanup validation (pure, unit-tested)
src/lib/disk.ts               Disk report and per-item cleanup
src/app/page.tsx              The UI (sections)
src/app/ui.tsx                Shared components: buttons, modal, toasts, confirmations, icons, actions menu, skeletons
src/app/Palette.tsx           Command palette (Ctrl/⌘+K)
src/lib/palette-core.mjs      Palette search and ranking (pure, unit-tested)
src/app/i18n.ts + locales/    Translations (one file per language)
src/app/{Logs,Terminal,HistoryChart,CreateForm}.tsx   Windows
src/app/api/**                REST API and SSE streams
```

### API (all under `/api`)

| Route | Methods | Description |
|---|---|---|
| `/containers` | GET, POST | List / create and start |
| `/containers/:id/:action` | POST | `start`, `stop`, `restart`, `remove` |
| `/groups` | GET, PUT | Custom groups: read them; assign / unassign containers, rename or dissolve a group (one operation per request) |
| `/containers/batch` | POST | Start / stop / restart / remove several containers, in dependency order when Compose provides it. With `?stream=1` it answers with newline-delimited JSON progress events and can be cancelled by closing the connection |
| `/containers/:id/logs` | GET (SSE) | Live logs |
| `/containers/:id/inspect` | GET | Container details; sensitive-looking values are omitted |
| `/containers/:id/env?name=` | GET | The real value of ONE environment variable (explicit "show"; not cacheable) |
| `/stats` | GET | CPU/RAM of running containers |
| `/history?name=&range=` | GET | History series (`1h`, `24h`, `7d`) |
| `/events` | GET (SSE) | Docker events |
| `/alerts/config` | GET, PUT | Alert settings (secrets are never returned) |
| `/alerts/test` | POST | Send a test through `telegram` or `webhook` |
| `/alerts/history` | GET | Recent alerts |
| `/alerts/stream` | GET (SSE) | New alerts for the browser channel |
| `/disk` | GET | Disk usage report and cleanup candidates (`?fresh=1` skips the 15 s cache) |
| `/disk/clean` | POST | Remove the selected containers, images, volumes and build cache |
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
npm run typecheck && npm test && npm run smoke && npm run e2e:alerts && npm run e2e:disk && npm run e2e:detail && npm run e2e:groups && npm run e2e:custom-groups && npm run e2e:dnd && npm run e2e:health && npm run e2e:progress && npm run e2e:ui && npm run e2e:resilience
```

No Docker at hand? Run the fake API: `node scripts/demo/mock-docker.mjs /tmp/docker-mock.sock &` then `DOCKER_SOCKET=/tmp/docker-mock.sock npm run dev`.

### Adding a language

Copy `src/app/locales/en.ts`, translate the values, then register it in `src/app/i18n.ts` (`Lang`, `LANGS`, `dicts`). TypeScript reports any missing key. Strings support `{placeholders}` and `"singular|plural"` forms.

### Stack

Next.js (App Router) · React · Tailwind CSS 4 · dockerode · `node:sqlite` · ws · xterm.js. No native dependencies to compile.
