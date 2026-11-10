# 🐳 Docker Gestor

A lightweight, local web dashboard to manage Docker from your browser — containers, live logs, an interactive terminal, Compose stacks, images, volumes, networks, live events and resource-usage charts with history.

Built to stay out of your way: **~0.2–0.5 % of one CPU core and ~55 MB of RAM** while idle with a tab open.

[🇪🇸 Leer en español](#-español)

## Features

- **Containers** — list, search, filter, group by Compose stack; start / stop / restart / remove; clickable published ports; live CPU and memory per container.
- **Live logs** — streaming, filtering, timestamps toggle, download.
- **Terminal** — interactive shell inside a running container (xterm.js over WebSocket).
- **Create containers** — image, ports, env vars, volumes, restart policy and network, with live validation. Pulls the image if missing.
- **Compose** — `up`, `restart`, `stop`, `pull` and `down` for the stacks Docker already knows about.
- **Images, volumes, networks** — browse, create/pull, remove; images show whether they are in use.
- **Events** — live Docker event stream (also keeps the UI in sync without polling).
- **Usage history** — CPU/RAM sampled into SQLite and charted over 1 h / 24 h / 7 days; survives restarts.
- **Light & dark theme**, responsive layout, keyboard shortcuts, keyboard-accessible.
- **Runs as a systemd user service** with strict CPU/memory limits.

> The interface is currently in **Spanish** only. Translations are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Requirements

| | |
|---|---|
| Docker | Engine running, socket at `/var/run/docker.sock` |
| Permissions | Your user must be in the `docker` group |
| Node.js | **22.13+** (uses the built-in `node:sqlite`) |
| Linux + systemd | Only needed for the optional service installer |

## Quick start

```bash
git clone https://github.com/Jhostter/docker-gestor.git
cd docker-gestor
npm install
npm run build
npm start            # http://localhost:4455
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

## Configuration

Optional environment variables:

| Variable | Default | Description |
|---|---|---|
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |
| `DATA_DIR` | `~/.local/share/docker-gestor` | Where the history database is stored |
| `SAMPLE_SECONDS` | `15` | Usage sampling interval |
| `RETENTION_DAYS` | `7` | Days of history to keep |

## ⚠️ Security

Controlling Docker is equivalent to having root on the machine. Docker Gestor is designed for **local, single-user use**:

- It listens on `127.0.0.1` only and rejects requests whose `Host`/`Origin` is not `localhost:4455` (CSRF / DNS-rebinding protection, including the terminal WebSocket).
- Container ports created from the UI are published on `127.0.0.1` only.
- All inputs are validated server-side; Compose only acts on stacks Docker already knows.
- **There is no authentication.** Do **not** expose it to a network or the internet (reverse proxies, tunnels, `0.0.0.0`) without adding your own authentication layer.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Documentation

📖 Full usage guide (Spanish): [docs/GUIA.md](docs/GUIA.md) — every section, shortcuts, data, configuration, troubleshooting and API.

## Development

```bash
npm run dev          # hot reload (stop the service first: it uses port 4455)
npm run typecheck
npm run build
```

Stack: Next.js (App Router) · React · Tailwind CSS 4 · dockerode · `node:sqlite` · ws · xterm.js.

## Contributing

Issues and pull requests are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)

---

# 🇪🇸 Español

Panel web local y ligero para gestionar Docker desde el navegador: contenedores, logs en vivo, terminal interactiva, Compose, imágenes, volúmenes, redes, eventos y gráficas de consumo con historial. En reposo usa **~0,2–0,5 % de un núcleo y ~55 MB de RAM**.

**Inicio rápido**

```bash
git clone https://github.com/Jhostter/docker-gestor.git
cd docker-gestor
npm install && npm run build && npm start     # http://localhost:4455
```

Para instalarlo como servicio que arranca con el equipo: `./scripts/install-service.sh`.

**Seguridad:** solo escucha en `127.0.0.1` y **no tiene autenticación**; no lo expongas a la red ni a internet.

📖 Guía completa: [docs/GUIA.md](docs/GUIA.md) · Licencia: [MIT](LICENSE)
