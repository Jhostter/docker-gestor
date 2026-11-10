# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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
