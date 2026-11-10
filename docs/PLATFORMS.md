# Platform support / Compatibilidad de plataformas

## Status

| | Linux | macOS | Windows |
|---|:---:|:---:|:---:|
| Developed and used daily | ✅ | – | – |
| CI: install, types, unit tests, build | ✅ | ✅ | ✅ |
| CI: server boots, serves the UI, rejects foreign origins, readable error without Docker | ✅ | ✅ | ✅ |
| Verified against a real Docker daemon | ✅ | ❌ not yet | ❌ not yet |
| Autostart | `scripts/install-service.sh` (systemd) | launchd — manual, **untested** | Task Scheduler — manual, **untested** |

**Honest summary:** the app is portable code (Node + `dockerode` + the built-in SQLite) and CI proves it builds and boots on all three systems. What CI cannot prove is the integration with Docker Desktop / Colima / etc. on macOS and Windows, because the runners have no usable Docker daemon for it. If you try it there, please open an issue or a pull request updating this table — reports from real machines are the missing piece.

Not supported: Windows containers (the terminal runs `/bin/sh` inside the container).

## How Docker is located

In this order (the startup line of the server prints which one was used):

1. `DOCKER_SOCKET` — a socket path or named pipe.
2. `DOCKER_HOST` — `unix://…`, `npipe://…` or `tcp://host:port`.
3. Windows: the Docker Desktop named pipe `//./pipe/docker_engine`.
4. macOS / Linux, the first that exists:
   `/var/run/docker.sock` · `~/.docker/run/docker.sock` (Docker Desktop) · `~/.colima/default/docker.sock` (Colima) · `~/.rd/docker.sock` (Rancher Desktop) · `~/.orbstack/run/docker.sock` (OrbStack) · `/run/user/<uid>/docker.sock` (rootless Docker).
5. The endpoint of the active `docker context`.

If it cannot connect, the API answers with an actionable message (permission denied → docker group, missing socket → is Docker running / set `DOCKER_SOCKET`).

```bash
# Examples
DOCKER_HOST=unix:///Users/me/.colima/default/docker.sock npm start        # macOS + Colima
```
```powershell
$env:DOCKER_SOCKET = "//./pipe/docker_engine"; npm start                  # Windows (PowerShell)
```

## Other settings

| Variable | Default | |
|---|---|---|
| `PORT` | `4455` | Port to listen on (always `127.0.0.1`) |
| `DATA_DIR` | Linux `~/.local/share/docker-gestor` (honors `XDG_DATA_HOME`) · macOS `~/Library/Application Support/docker-gestor` · Windows `%LOCALAPPDATA%\docker-gestor` | History database |

## Keeping it running

The systemd limits (`CPUQuota`, `MemoryMax`…) are Linux-only. On macOS and Windows the app relies on its own light design (no polling, no work while nobody looks at it) plus a low process priority.

### macOS (launchd) — untested

Save as `~/Library/LaunchAgents/com.docker-gestor.plist`, adjusting the three paths (`which node` for the first):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.docker-gestor</string>
  <key>ProgramArguments</key><array><string>/opt/homebrew/bin/node</string><string>server.mjs</string></array>
  <key>WorkingDirectory</key><string>/Users/YOU/docker-gestor</string>
  <key>EnvironmentVariables</key><dict><key>NODE_OPTIONS</key><string>--max-old-space-size=128</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>15</integer>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>/tmp/docker-gestor.log</string>
  <key>StandardErrorPath</key><string>/tmp/docker-gestor.log</string>
</dict></plist>
```

```bash
npm run build
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.docker-gestor.plist   # start + enable
launchctl kickstart -k gui/$(id -u)/com.docker-gestor                             # restart
launchctl bootout gui/$(id -u)/com.docker-gestor                                  # stop + disable
```

It starts at login, and Docker Desktop (or Colima) must be running too.

### Windows (Task Scheduler) — untested

In PowerShell, from the project folder after `npm run build`:

```powershell
$dir  = (Get-Location).Path
$node = (Get-Command node).Source
$action   = New-ScheduledTaskAction -Execute $node -Argument "server.mjs" -WorkingDirectory $dir
$trigger  = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -Priority 7 -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "Docker Gestor" -Action $action -Trigger $trigger -Settings $settings
Start-ScheduledTask -TaskName "Docker Gestor"
```

Stop / remove: `Stop-ScheduledTask "Docker Gestor"` · `Unregister-ScheduledTask "Docker Gestor" -Confirm:$false`. `Priority 7` is below-normal. A console window will be visible while it runs.

## Known limitations on Docker Desktop

- The mount point shown in **Volumes** is a path inside Docker's virtual machine, not on your disk.
- Compose actions use the project folder recorded in the stack's labels; they only work if that folder is reachable from where Docker Gestor runs (e.g. not if Docker Gestor runs on Windows and the stack was created inside WSL2).

---

# Español

## Estado

| | Linux | macOS | Windows |
|---|:---:|:---:|:---:|
| Desarrollado y usado a diario | ✅ | – | – |
| CI: instalación, tipos, pruebas unitarias, compilación | ✅ | ✅ | ✅ |
| CI: el servidor arranca, sirve la interfaz, rechaza orígenes ajenos y da un error legible sin Docker | ✅ | ✅ | ✅ |
| Verificado contra un Docker real | ✅ | ❌ aún no | ❌ aún no |
| Arranque automático | `scripts/install-service.sh` (systemd) | launchd, manual y **sin probar** | Programador de tareas, manual y **sin probar** |

**Resumen honesto:** el código es portable y el CI demuestra que compila y arranca en los tres sistemas. Lo que el CI no puede demostrar es la integración con Docker Desktop, Colima, etc. en macOS y Windows. Si lo pruebas ahí, abre un issue o un PR que actualice esta tabla: faltan informes de máquinas reales. No se admiten contenedores de Windows.

## Cómo se localiza Docker

En este orden (al arrancar, el servidor imprime cuál usó): `DOCKER_SOCKET` → `DOCKER_HOST` (`unix://`, `npipe://`, `tcp://`) → en Windows la tubería `//./pipe/docker_engine` → en macOS/Linux el primer socket que exista (`/var/run/docker.sock`, Docker Desktop, Colima, Rancher Desktop, OrbStack, Docker rootless) → el `docker context` activo. Si no puede conectar, la API devuelve un mensaje con la solución.

## Otras variables

`PORT` (4455) cambia el puerto. `DATA_DIR` cambia dónde se guarda el historial: por defecto `~/.local/share/docker-gestor` en Linux, `~/Library/Application Support/docker-gestor` en macOS y `%LOCALAPPDATA%\docker-gestor` en Windows.

## Dejarlo en marcha

Los límites de systemd solo existen en Linux. En macOS (launchd) y Windows (Programador de tareas) las instrucciones y los comandos están arriba, en inglés, y **no están probados**. Limitaciones en Docker Desktop: la ruta que muestra *Volúmenes* es la de la máquina virtual de Docker, y las acciones de Compose solo funcionan si la carpeta del proyecto es accesible desde donde corre Docker Gestor.
