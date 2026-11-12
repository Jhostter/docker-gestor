#!/usr/bin/env bash
# Installs Docker Kong as a systemd user service (starts on its own, with bounded resources).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(readlink -f "$(command -v node)")"   # stable path (fnm uses temporary symlinks)
UNIT="$HOME/.config/systemd/user/docker-gestor.service"

cd "$DIR" && npm run build
mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNITEOF
[Unit]
Description=Docker Kong (local Docker dashboard)

[Service]
ExecStart=$NODE $DIR/server.mjs
WorkingDirectory=$DIR
Environment=NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=128
Restart=on-failure
RestartSec=5
# Lowest priority so it never affects the machine
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
echo "Done: http://localhost:4455  (logs: journalctl --user -u docker-gestor -f)"
loginctl show-user "$USER" -p Linger | grep -q yes || echo "To start it at boot without logging in: sudo loginctl enable-linger $USER"
