# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **The interface no longer gets stuck on an old state after stopping or starting containers.** Several causes, each with its own test:
  - The events stream gave up for good when Docker briefly failed (a browser `EventSource` never reconnects after an HTTP error). The server now always answers 200 and tells the browser when to retry; the page also reconnects by itself with growing waits, and refreshes the moment it is back.
  - An old, slow response could arrive last and overwrite newer data; only the newest response per resource is applied now.
  - A burst of events (stopping a whole stack) postponed the refresh until the burst ended; it now refreshes at a bounded rate.
  - After an action it refreshes immediately and again about 1.5 s later, in case Docker is slow to show the new state. An open *Details* window updates itself every few seconds.
  - A failing poll raised an error notice each time; there is now one until something works again.
- When Docker (not the server) is unreachable the page says so with an amber *Docker is not responding* notice, instead of the misleading red "connection lost".
- The log stream of a container that is gone ends cleanly instead of failing with an HTTP error.

### Changed
- **Redesigned interface.** Each row keeps *Start/Stop* and *Logs* and moves the rest into a **⋯ menu** (Details, Restart, Terminal, Usage chart, Delete), fully keyboard-accessible; a coloured stripe shows the state at a glance; ports are chips.
- **Command palette** (`Ctrl`/`⌘`+`K`): jump to any section, container or action with a forgiving search (every word, any order, accent-insensitive, abbreviations).
- Sidebar organised in **Manage** and **Observe**, with a search button; every page has a title; loading skeletons replace the "Loading…" text.
- **Compact view** (one line per container), remembered; the toolbar is tidier and the mobile checkbox is aligned.
- `npm run e2e:ui` and `npm run e2e:resilience`: browser tests with negative controls (they fail when the fixes are removed); both run in CI on Linux.

## [0.7.0] - 2026-11-10

### Added
- **Live progress for group actions.** A panel lists each container with its state (queued, working, done, skipped, failed) and the current layer, and while a start waits for a dependency it says what for and how long (`Waiting for "db" to be ready… 12 s / 90 s`). It appears only when an action takes more than ~0.6 s, so quick actions do not flash it.
- **Cancel.** Closing the connection stops the rest: what is already running finishes (nothing is interrupted halfway), no further layer or container is started and the server stops polling.
- `POST /api/containers/batch?stream=1` answers with newline-delimited JSON events (`plan`, `item`, `done`); without it the response is the same `{ results }` as before.
- `npm run e2e:progress` (negative-control tested: the polling check fails when disconnects are ignored; runs in CI on Linux).

## [0.6.0] - 2026-11-10

### Added
- **Group start and restart now wait for healthy dependencies.** When Compose declares `service_healthy` (or `service_completed_successfully`), dependents start only after the dependency is ready, like `docker compose up`. If it never gets ready, the dependents (and whatever depends on them) are **not started** and the failure window explains why (timed out, became unhealthy, stopped), translated into your language.
- Dependencies are also waited for when they are **outside the selection** (e.g. *Start all* on only the stopped containers), and a stopped dependency makes the dependent be refused rather than started without it.
- `HEALTH_WAIT_SECONDS` (default 90, 1-600). Unhealthy or stopped dependencies fail immediately instead of waiting out the timeout. A dependency with no health check is not waited for; stopping and deleting never wait.
- `npm run e2e:health`, with real timings and a negative control (10 checks fail when the waiting is disabled); runs in CI on Linux.

### Fixed
- **Dependencies were matched by service name only, across projects.** Selecting two Compose stacks that both have a `db` could order one stack's API after the other stack's database. They are now resolved inside the same Compose project.

## [0.5.0] - 2026-11-10

### Added
- **Drag and drop between custom groups.** Every row in *My groups* has a ⠿ handle; drag it onto a group to move the container. Dragging a selected row moves the whole selection. While dragging, two extra zones appear: take containers out of their group, and create a new group (asks for a name). The screen updates instantly and rolls back with an error message if the server refuses. *Move to group…* remains the keyboard and touch alternative.
- `npm run e2e:dnd`: a drag test with a **real** mouse drag replayed through Chrome's DevTools drag interception (negative-control tested for the rollback and for dragging a selection).

### Changed
- The drag handle is larger and easier to find.

## [0.4.0] - 2026-11-10

### Added
- **Custom groups.** A new *Group by* selector (**Stack** / **My groups** / **None**, remembered). In *My groups* you create groups from a selection (*Move to group…*), rename them (renaming into an existing group merges), remove containers from them and dissolve them; **dissolving never touches the containers**. Custom groups get the same start all / stop all / restart all, dependency-aware ordering, selection and collapsing as stacks.
- Groups are stored on the server by **container name** (they survive recreating a container and are shared by every browser). Names are case-insensitive, up to 50 groups of 1-40 characters, with strict validation.
- `GET`/`PUT /api/groups`, unit tests, and `npm run e2e:custom-groups` (negative-control tested for case-insensitivity and the group limit; runs in CI on Linux).
- A reusable prompt dialog.

### Changed
- The *Group by stack* checkbox became the *Group by* selector.

## [0.3.0] - 2026-11-10

### Added
- **Manage containers by stack or by selection.** Each group header shows `running/total` with combined CPU and memory and offers start all / stop all / restart all; rows have checkboxes and a bar offers start / stop / restart / delete for any selection, even across groups. Groups can be collapsed (remembered).
- Group actions work on the containers themselves, so they cover stacks Compose cannot manage (e.g. created by Supabase CLI) and containers outside any stack.
- **Dependency-aware ordering:** when Compose records `depends_on`, containers start dependencies-first and stop in reverse, in layers that run in parallel. Idempotent (already-running containers are skipped) and failures are isolated and listed.
- Stop, restart and delete of several containers always ask first and list the names.
- `POST /api/containers/batch`, unit tests for the ordering and `npm run e2e:groups` (negative-control tested; runs in CI on Linux).
- **Container details** (click a name or the ⓘ button): overview with why it stopped (exit code explained, OOM, restart count), environment, mounts, ports, networks, health history, labels and the full `inspect`, plus **notable settings** (privileged, Docker socket or host root mounted, host network/PID, extra capabilities).
- Secret-looking environment values and command arguments are **never sent** unless you press *Show* on one variable. Detection covers names (including any `*KEY*`), credentials inside URLs and the look of the value (JWTs, token prefixes, long key-like strings). A check against a real Docker found `*_KEY` variables that an earlier rule missed; the rule was widened and re-verified (0 leaks across 276 variables).
- `npm run e2e:detail`, a negative-control-tested end-to-end check that no secret leaks (runs in CI on Linux).
- **Disk** section: how much space Docker uses (images, containers, volumes, build cache) and how much is reclaimable, with figures that match `docker system df`.
- **Safe cleanup** with a preview: unused build cache, untagged images, stopped containers, unused tagged images and unused volumes. Only the build cache and untagged images are pre-selected; volumes need an explicit data-loss acknowledgement.
- Items are removed one by one by id (never a global prune) and without `force`; Docker Gestor also refuses running containers itself, and failures are listed with Docker's reason.
- Unit tests for the analysis and validation, and `npm run e2e:disk` (runs in CI on Linux).

## [0.2.0] - 2026-11-10

### Added
- **Alerts** (off by default): notifications through the browser, **Telegram** and a **webhook** when a container crashes, runs out of memory, becomes unhealthy, restarts in a loop, or stays at high CPU/memory. Stops, restarts and removals you do yourself are ignored; repeats are rate-limited by a cooldown.
- Alerts section with per-rule switches and thresholds, per-channel test buttons, delivery status and a 30-day history.
- Secrets (Telegram token, webhook `Authorization`) are stored in a `600` file and never returned to the browser.
- `ALERT_HOST` to label messages; alert messages follow the UI language.
- Unit tests for the alert engine and `npm run e2e:alerts`, an end-to-end test against a fake Docker, Telegram and webhook receiver.

## [0.1.0] - 2026-11-10

First public release.

### Added
- Containers: list, search, filter, group by Compose stack, start / stop / restart / remove, clickable ports, live CPU and memory.
- Live logs (filter, timestamps, highlighting, download) and an interactive terminal (xterm.js over WebSocket).
- Create containers with live-validated ports, environment variables, volumes, restart policy and network.
- Compose stacks: `up`, `restart`, `stop`, `pull`, `down`.
- Images, volumes and networks management.
- Live Docker events; the UI refreshes from events instead of polling.
- CPU/RAM usage history in SQLite (1 h / 24 h / 7 days charts), kept for 7 days by default.
- English and Spanish UI with a language switch; light and dark themes; responsive and keyboard-accessible.
- Docker endpoint auto-detection (Docker Desktop, Colima, Rancher Desktop, OrbStack, rootless Docker, Windows named pipe, `docker context`).
- systemd user service installer with CPU/memory limits.
- Localhost-only server with Host/Origin validation (including the terminal WebSocket).
- Unit tests, a boot smoke test and CI on Linux, macOS and Windows.
- A mock Docker API with fictional data (`scripts/demo/`) for trying the UI and regenerating screenshots.

### Known limitations
- Only verified against a real Docker on Linux; macOS and Windows are untested with a real daemon (see `docs/PLATFORMS.md`).
- No authentication: local, single-user use only.
- Windows containers are not supported.
