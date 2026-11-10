import type { es } from "./es";

export const en: Record<keyof typeof es, string> = {
  // Common
  loading: "Loading…", close: "Close", close_esc: "Close (Esc)", close_toast: "Dismiss", cancel: "Cancel", accept: "OK", delete: "Delete",
  // Navigation
  tab_containers: "Containers", tab_compose: "Compose", tab_images: "Images", tab_volumes: "Volumes", tab_networks: "Networks", tab_events: "Events",
  nav_sections: "Sections", conn_connecting: "Connecting…", conn_ok: "Docker connected", conn_lost: "Lost connection to the server",
  lost_banner: "The connection to the server was lost. Retrying automatically… If it persists:",
  theme_light: "Light theme", theme_dark: "Dark theme", theme_toggle: "Toggle theme", help_label: "Help and shortcuts (?)", lang_label: "Change language",
  // Containers
  stat_running: "Running", stat_of: "of {n} containers", stat_cpu: "Total CPU", stat_active: "active containers", stat_mem: "Memory", stat_in_use: "in use", stat_stacks: "Stacks", stat_compose: "from Compose",
  search: "Search ( / )", f_all: "All", f_up: "Running", f_down: "Stopped", group_by: "Group by stack", new_container: "New container", no_stack: "No stack",
  empty_none: "No containers yet", empty_nomatch: "No container matches", empty_none_hint: "Create the first one with “New container” or with docker compose.", empty_nomatch_hint: "Try another filter or search.",
  badge_running: "Running", badge_stopped: "Stopped", open_url: "Open http://localhost:{port}", cpu: "CPU", ram: "RAM", cpu_use: "CPU usage", mem_use: "Memory usage",
  act_stop: "Stop", act_start: "Start", act_restart: "Restart", act_logs: "View logs", act_term: "Open terminal", act_chart: "Usage chart",
  ok_stopped: "stopped", ok_started: "started", ok_restarted: "restarted",
  del_title: "Delete {name}", del_body: "The container will be removed (even if it is running). Named volumes are kept.", del_done: "{name} deleted", created_ok: "Container created and started",
  // Compose
  cmp_empty: "No Compose stacks", cmp_empty_hint: "Projects started with docker compose will show up here.", cmp_active: "{running}/{total} running",
  cmp_foreign: "Created with another tool (e.g. Supabase CLI): read-only", cmp_view: "View containers", cmp_pull: "Update images", cmp_down: "Take down",
  cmp_down_title: "Take down {name}", cmp_down_body: "Runs “docker compose down”: stops and removes the stack's containers and networks. Volumes are kept.", cmp_down_confirm: "Take down stack",
  cmp_ok_pull: "images updated", cmp_ok_down: "removed", cmp_active_aria: "Running containers", no_output: "(no output)",
  // Images
  img_pull_ph: "Pull an image, e.g. nginx:latest", img_pull_aria: "Image to pull", img_pull: "Pull", img_pulling: "Pulling…", img_pulled: "Image {ref} pulled",
  i_all: "All", i_used: "In use", i_unused: "Unused", img_count: "{n} image · {size}|{n} images · {size}", img_empty: "No results", img_empty_hint: "Change the filter or pull an image.",
  untagged: "<untagged>", img_meta: "{id} · {size} · created {ago}", img_del_title: "Delete image", img_del_body: "{name} ({size}). Docker will refuse if a container uses it.", img_del_label: "Delete image", img_deleted: "Image deleted",
  // Volumes
  vol_count: "{n} volume|{n} volumes", vol_empty: "No volumes", vol_anon: "anonymous", vol_del_title: "Delete volume",
  vol_del_body: "{name}: its data will be lost permanently. Docker will refuse if it is in use.", vol_del_confirm: "Delete forever", vol_del_label: "Delete volume", vol_deleted: "Volume deleted",
  // Networks
  net_ph: "New network name", net_aria: "Network name", net_pattern: "Letters, numbers, dot, hyphen and underscore", net_create: "Create network", net_created: "Network {name} created",
  net_system: "system", net_nosubnet: "no subnet", net_none: "No connected containers", net_del_title: "Delete network {name}", net_del_body: "Docker will refuse if containers are connected.", net_del_label: "Delete network", net_deleted: "Network deleted",
  // Events
  ev_all: "All", ev_count: "{n} event · live|{n} events · live", ev_clear: "Clear", ev_empty: "Waiting for Docker events…", ev_empty_hint: "Start, stop or create something and it will appear here instantly.",
  // Help
  help_title: "Help and shortcuts", k_tabs: "Switch section", k_search: "Go to search", k_refresh: "Refresh data", k_help: "This help", k_esc: "Close windows",
  help_foot: "Full guide in the docs/ folder of the repository. Single-key shortcuts are ignored while you type in a field or a window is open.",
  // Logs
  logs_title: "Logs · {name}", logs_download: "Download what is shown", logs_clear: "Clear screen", logs_filter: "Filter lines…", logs_follow: "Follow tail", logs_wrap: "Wrap lines", logs_ts: "Timestamps",
  logs_live: "Live", logs_ended: "Finished (the container emits no more logs)", logs_reconn: "Reconnecting…", logs_count: "{n} line|{n} lines", logs_count_f: "{shown}/{total} lines",
  logs_nomatch: "No line matches the filter.", logs_waiting: "Waiting for logs…",
  // Terminal
  term_title: "Terminal · {name}", term_connecting: "connecting", term_connected: "connected", term_closed: "closed", term_closed_msg: "[session closed]", term_note: "Esc is sent to the terminal (vim, etc.). Close the session with the ✕ button.",
  // Chart
  chart_title: "Usage · {name}", r_1h: "1 h", r_24h: "24 h", r_7d: "7 days", chart_cpu: "CPU (%)", chart_now: "now", chart_max: "max", chart_nodata: "Not enough data yet. One sample is taken every 15 s and kept for 7 days.",
  // Create container
  cr_image: "Image", cr_image_hint: "It will be pulled if it is not available locally.", cr_name: "Name", cr_name_ph: "(automatic)", cr_ports: "Ports",
  cr_ports_hint: "host:container, e.g. 8080:80 (or 53:53/udp). Published on 127.0.0.1 only.", cr_env: "Environment variables", cr_env_hint: "KEY=value", cr_ph_env: "POSTGRES_PASSWORD=secret",
  cr_vols_hint: "source:/path/in/container — the source can be a named volume or a host path; add :ro for read-only.", cr_ph_vol: "my_data:/var/lib/data",
  cr_restart: "Restart policy", cr_r_no: "Do not restart", cr_r_unless: "Unless stopped manually", cr_r_always: "Always", cr_r_fail: "Only on failure",
  cr_network: "Network", cr_net_default: "Default (bridge)", cr_submit: "Create and start", cr_add: "Add", cr_remove: "Remove",
  // Docker connection errors (the server sends a code)
  err_docker_denied: "Docker: permission denied at {where}. On Linux, add your user to the docker group and log in again.",
  err_docker_unreachable: "Cannot connect to Docker at {where}. Is it running? If it uses another path, set DOCKER_SOCKET or DOCKER_HOST.",
  // Alerts
  tab_alerts: "Alerts", al_enabled: "Alerts enabled", al_enabled_hint: "Watches Docker events and resource usage and notifies you through the channels you enable. Telegram and webhook keep working with the tab closed.",
  al_watching: "Watching Docker", al_off: "Off", al_rules: "What to alert on",
  al_r_died: "A container crashes", al_r_died_h: "Exits with a non-zero code without you stopping it.", al_r_oom: "Out of memory (OOM)", al_r_oom_h: "The system kills it for lack of memory.",
  al_r_unhealthy: "Unhealthy", al_r_unhealthy_h: "Fails its health check; also tells you when it recovers.", al_r_loop: "Restart loop", al_r_loop_h: "Crashes several times in a short time.",
  al_r_cpu: "High CPU", al_r_cpu_h: "Stays above the percentage for the whole period.", al_r_mem: "High memory", al_r_mem_h: "Percentage of its memory limit (or of the machine's RAM when it has no limit).",
  al_f_count: "Crashes", al_f_minutes: "Minutes", al_f_percent: "Percent", al_cooldown: "Do not repeat the same alert for (min)",
  al_channels: "Where to notify", al_browser: "Browser notifications", al_browser_h: "Only while a Docker Gestor tab is open.",
  al_perm_granted: "Permission granted", al_perm_denied: "Blocked in the browser", al_perm_default: "No permission yet", al_perm_unsupported: "Your browser does not support them", al_perm_ask: "Allow notifications",
  al_telegram: "Telegram", al_tg_hint: "Create a bot with @BotFather, send it a message and use its token and your chat ID.", al_tg_token: "Bot token", al_tg_chat: "Chat ID",
  al_secret_saved: "Saved (empty = keep)", al_remove_secret: "Remove",
  al_webhook: "Webhook", al_wh_hint: "Sends a POST with JSON (works with Discord and Slack) or plain text (ntfy).", al_wh_url: "URL", al_wh_format: "Format", al_fmt_json: "JSON", al_fmt_text: "Plain text", al_wh_auth: "Authorization header (optional)",
  al_test: "Send test", al_test_ok: "Test sent", al_save: "Save changes", al_saved: "Alerts saved", al_save_first: "Save your changes before testing", al_incomplete: "Fill in the details to test",
  al_last_error: "Last error: {error}", al_last_ok: "Last successful delivery {ago}", al_history: "History", al_history_empty: "No alert has fired yet.",
  al_security: "The token and URL are stored in a local file that only your user can read.",
  al_b_died: "Crash", al_b_oom: "OOM", al_b_unhealthy: "Health", al_b_recovered: "Recovered", al_b_restartLoop: "Loop", al_b_cpu: "CPU", al_b_memory: "Memory", al_b_test: "Test",
  err_invalid_telegram_token: "The Telegram token has the wrong format (123456:ABC…).", err_invalid_telegram_chat: "The chat ID must be a number (or @channel).",
  err_telegram_incomplete: "Telegram needs a token and a chat ID.", err_invalid_webhook_url: "The webhook URL must start with http:// or https://.", err_webhook_incomplete: "The webhook needs a URL.",
  err_invalid_authorization: "The Authorization header is not valid.", err_alert_test_failed: "Test failed: {reason}",
};
