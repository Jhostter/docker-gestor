#!/usr/bin/env bash
# Instala Docker Gestor como servicio de usuario de systemd (arranca solo y con recursos acotados).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(readlink -f "$(command -v node)")"   # ruta estable (fnm usa enlaces temporales)
UNIT="$HOME/.config/systemd/user/docker-gestor.service"

cd "$DIR" && npm run build
mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNITEOF
[Unit]
Description=Docker Gestor (panel local de Docker)

[Service]
ExecStart=$NODE $DIR/server.mjs
WorkingDirectory=$DIR
Environment=NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=128
Restart=on-failure
RestartSec=5
# Prioridad mínima para no afectar a la máquina
Nice=15
CPUWeight=20
CPUQuota=15%
IOWeight=20
MemoryHigh=160M
MemoryMax=256M
TasksMax=64

[Install]
WantedBy=default.target
UNITEOF
systemctl --user daemon-reload
systemctl --user enable --now docker-gestor.service
echo "Listo: http://localhost:4455  (logs: journalctl --user -u docker-gestor -f)"
loginctl show-user "$USER" -p Linger | grep -q yes || echo "Para que arranque sin iniciar sesión: sudo loginctl enable-linger $USER"
