// Pure builders for the "start with my session" files of each OS. install.mjs writes them; tests check them.

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// In a .desktop Exec line an argument with spaces or special characters goes in double quotes, with \ " ` $ escaped.
const desktopArg = (s) => `"${String(s).replace(/(["`$\\])/g, "\\$1")}"`;

export const LABEL = "com.docker-gestor.tray";

/** Linux: ~/.config/autostart/docker-gestor-tray.desktop */
export function desktopEntry({ node, script }) {
  return `[Desktop Entry]
Type=Application
Name=Docker Kong tray icon
Comment=Status icon for the Docker Kong service
Exec=${desktopArg(node)} ${desktopArg(script)}
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
`;
}

/** macOS: ~/Library/LaunchAgents/com.docker-gestor.tray.plist */
export function launchAgent({ node, script }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(node)}</string><string>${xml(script)}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
</dict>
</plist>
`;
}

/** Windows: a .vbs in the Startup folder that starts the tray with no console window. */
export function windowsLauncher({ node, script }) {
  const q = (s) => `""${String(s).replace(/"/g, '""')}""`; // inside a VBScript string a quote is written twice
  return `CreateObject("Wscript.Shell").Run "${q(node)} ${q(script)}", 0, False\r\n`;
}
