# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

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
