export const es = {
  // Comunes
  loading: "Cargando…", close: "Cerrar", close_esc: "Cerrar (Esc)", close_toast: "Cerrar aviso", cancel: "Cancelar", accept: "Aceptar", delete: "Eliminar",
  // Navegación
  tab_containers: "Contenedores", tab_compose: "Compose", tab_images: "Imágenes", tab_volumes: "Volúmenes", tab_networks: "Redes", tab_events: "Eventos",
  nav_sections: "Secciones", conn_connecting: "Conectando…", conn_ok: "Docker conectado", conn_lost: "Sin conexión con el gestor",
  lost_banner: "Se perdió la conexión con el servidor. Reintentando automáticamente… Si persiste:",
  theme_light: "Tema claro", theme_dark: "Tema oscuro", theme_toggle: "Cambiar tema", help_label: "Ayuda y atajos (?)", lang_label: "Cambiar idioma",
  // Contenedores
  stat_running: "En marcha", stat_of: "de {n} contenedores", stat_cpu: "CPU total", stat_active: "contenedores activos", stat_mem: "Memoria", stat_in_use: "en uso", stat_stacks: "Stacks", stat_compose: "de Compose",
  search: "Buscar ( / )", f_all: "Todos", f_up: "Activos", f_down: "Detenidos", group_by: "Agrupar por stack", new_container: "Nuevo contenedor", no_stack: "Sin stack",
  empty_none: "Aún no hay contenedores", empty_nomatch: "Ningún contenedor coincide", empty_none_hint: "Crea el primero con «Nuevo contenedor» o con docker compose.", empty_nomatch_hint: "Prueba con otro filtro o búsqueda.",
  badge_running: "En marcha", badge_stopped: "Detenido", open_url: "Abrir http://localhost:{port}", cpu: "CPU", ram: "RAM", cpu_use: "Uso de CPU", mem_use: "Uso de memoria",
  act_stop: "Detener", act_start: "Iniciar", act_restart: "Reiniciar", act_logs: "Ver logs", act_term: "Abrir terminal", act_chart: "Gráfica de consumo",
  ok_stopped: "detenido", ok_started: "iniciado", ok_restarted: "reiniciado",
  del_title: "Eliminar {name}", del_body: "Se eliminará el contenedor (aunque esté en marcha). Los volúmenes con nombre se conservan.", del_done: "{name} eliminado", created_ok: "Contenedor creado e iniciado",
  // Compose
  cmp_empty: "No hay stacks de Compose", cmp_empty_hint: "Aparecerán aquí los proyectos levantados con docker compose.", cmp_active: "{running}/{total} activos",
  cmp_foreign: "Creado con otra herramienta (p. ej. Supabase CLI): solo se puede consultar", cmp_view: "Ver contenedores", cmp_pull: "Actualizar imágenes", cmp_down: "Bajar",
  cmp_down_title: "Bajar {name}", cmp_down_body: "Ejecuta «docker compose down»: detiene y elimina los contenedores y redes del stack. Los volúmenes se conservan.", cmp_down_confirm: "Bajar stack",
  cmp_ok_pull: "imágenes actualizadas", cmp_ok_down: "eliminado", cmp_active_aria: "Contenedores activos", no_output: "(sin salida)",
  // Imágenes
  img_pull_ph: "Descargar imagen, p. ej. nginx:latest", img_pull_aria: "Imagen a descargar", img_pull: "Descargar", img_pulling: "Descargando…", img_pulled: "Imagen {ref} descargada",
  i_all: "Todas", i_used: "En uso", i_unused: "Sin usar", img_count: "{n} imagen · {size}|{n} imágenes · {size}", img_empty: "Sin resultados", img_empty_hint: "Cambia el filtro o descarga una imagen.",
  untagged: "<sin etiqueta>", img_meta: "{id} · {size} · creada {ago}", img_del_title: "Eliminar imagen", img_del_body: "{name} ({size}). Docker rechazará la acción si algún contenedor la usa.", img_del_label: "Eliminar imagen", img_deleted: "Imagen eliminada",
  // Volúmenes
  vol_count: "{n} volumen|{n} volúmenes", vol_empty: "Sin volúmenes", vol_anon: "anónimo", vol_del_title: "Eliminar volumen",
  vol_del_body: "{name}: se perderán sus datos de forma permanente. Docker rechazará la acción si está en uso.", vol_del_confirm: "Eliminar para siempre", vol_del_label: "Eliminar volumen", vol_deleted: "Volumen eliminado",
  // Redes
  net_ph: "Nombre de la nueva red", net_aria: "Nombre de la red", net_pattern: "Letras, números, punto, guion y guion bajo", net_create: "Crear red", net_created: "Red {name} creada",
  net_system: "del sistema", net_nosubnet: "sin subred", net_none: "Sin contenedores conectados", net_del_title: "Eliminar red {name}", net_del_body: "Docker rechazará la acción si hay contenedores conectados.", net_del_label: "Eliminar red", net_deleted: "Red eliminada",
  // Eventos
  ev_all: "Todos", ev_count: "{n} evento · en vivo|{n} eventos · en vivo", ev_clear: "Limpiar", ev_empty: "Esperando eventos de Docker…", ev_empty_hint: "Inicia, detén o crea algo y aparecerá aquí al instante.",
  // Ayuda
  help_title: "Ayuda y atajos", k_tabs: "Cambiar de sección", k_search: "Ir al buscador", k_refresh: "Refrescar datos", k_help: "Esta ayuda", k_esc: "Cerrar ventanas",
  help_foot: "Guía completa en la carpeta docs/ del repositorio. Los atajos de una tecla no actúan mientras escribes en un campo o hay una ventana abierta.",
  // Logs
  logs_title: "Logs · {name}", logs_download: "Descargar lo visible", logs_clear: "Limpiar pantalla", logs_filter: "Filtrar líneas…", logs_follow: "Seguir al final", logs_wrap: "Ajustar líneas", logs_ts: "Marcas de tiempo",
  logs_live: "En vivo", logs_ended: "Finalizado (el contenedor no emite más logs)", logs_reconn: "Reconectando…", logs_count: "{n} línea|{n} líneas", logs_count_f: "{shown}/{total} líneas",
  logs_nomatch: "Ninguna línea coincide con el filtro.", logs_waiting: "Esperando logs…",
  // Terminal
  term_title: "Terminal · {name}", term_connecting: "conectando", term_connected: "conectado", term_closed: "cerrado", term_closed_msg: "[sesión cerrada]", term_note: "Esc se envía a la terminal (vim, etc.). Cierra la sesión con el botón ✕.",
  // Gráfica
  chart_title: "Consumo · {name}", r_1h: "1 h", r_24h: "24 h", r_7d: "7 días", chart_cpu: "CPU (%)", chart_now: "ahora", chart_max: "máx", chart_nodata: "Aún no hay suficientes datos. Se toma una muestra cada 15 s y se guardan 7 días.",
  // Crear contenedor
  cr_image: "Imagen", cr_image_hint: "Si no existe localmente, se descargará.", cr_name: "Nombre", cr_name_ph: "(automático)", cr_ports: "Puertos",
  cr_ports_hint: "anfitrión:contenedor, p. ej. 8080:80 (o 53:53/udp). Se publican solo en 127.0.0.1.", cr_env: "Variables de entorno", cr_env_hint: "CLAVE=valor", cr_ph_env: "POSTGRES_PASSWORD=secreto",
  cr_vols_hint: "origen:/ruta/en/contenedor — el origen puede ser un volumen con nombre o una ruta del anfitrión; añade :ro para solo lectura.", cr_ph_vol: "mis_datos:/var/lib/data",
  cr_restart: "Reinicio automático", cr_r_no: "No reiniciar", cr_r_unless: "Salvo que se detenga a mano", cr_r_always: "Siempre", cr_r_fail: "Solo si falla",
  cr_network: "Red", cr_net_default: "Por defecto (bridge)", cr_submit: "Crear e iniciar", cr_add: "Añadir", cr_remove: "Quitar",
  // Errores de conexión con Docker (el servidor envía un código)
  err_docker_denied: "Docker: permiso denegado en {where}. En Linux añade tu usuario al grupo docker y vuelve a iniciar sesión.",
  err_docker_unreachable: "No se puede conectar con Docker en {where}. ¿Está en marcha? Si usa otra ruta, define DOCKER_SOCKET o DOCKER_HOST.",
  // Alertas
  tab_alerts: "Alertas", al_enabled: "Alertas activadas", al_enabled_hint: "Vigila los eventos de Docker y el consumo, y avisa por los canales que actives. Telegram y webhook funcionan aunque cierres la pestaña.",
  al_watching: "Vigilando Docker", al_off: "Desactivadas", al_rules: "Qué avisar",
  al_r_died: "Un contenedor se cae", al_r_died_h: "Termina con un código distinto de 0 sin que lo hayas detenido tú.", al_r_oom: "Sin memoria (OOM)", al_r_oom_h: "El sistema lo detiene por falta de memoria.",
  al_r_unhealthy: "No saludable", al_r_unhealthy_h: "Falla su comprobación de salud; avisa también cuando se recupera.", al_r_loop: "Reinicios en bucle", al_r_loop_h: "Se cae varias veces seguidas en poco tiempo.",
  al_r_cpu: "CPU alta", al_r_cpu_h: "Se mantiene por encima del porcentaje durante todo el periodo.", al_r_mem: "Memoria alta", al_r_mem_h: "Porcentaje de su límite de memoria (o de la RAM del equipo si no tiene límite).",
  al_f_count: "Caídas", al_f_minutes: "Minutos", al_f_percent: "Porcentaje", al_cooldown: "No repetir la misma alerta durante (min)",
  al_channels: "Dónde avisar", al_browser: "Notificaciones del navegador", al_browser_h: "Solo mientras haya una pestaña de Docker Gestor abierta.",
  al_perm_granted: "Permiso concedido", al_perm_denied: "Bloqueadas en el navegador", al_perm_default: "Aún sin permiso", al_perm_unsupported: "Tu navegador no las admite", al_perm_ask: "Permitir notificaciones",
  al_telegram: "Telegram", al_tg_hint: "Crea un bot con @BotFather, escríbele un mensaje y usa su token y tu ID de chat.", al_tg_token: "Token del bot", al_tg_chat: "ID de chat",
  al_secret_saved: "Guardado (vacío = conservar)", al_remove_secret: "Quitar",
  al_webhook: "Webhook", al_wh_hint: "Envía un POST con JSON (compatible con Discord y Slack) o con texto plano (ntfy).", al_wh_url: "URL", al_wh_format: "Formato", al_fmt_json: "JSON", al_fmt_text: "Texto plano", al_wh_auth: "Cabecera Authorization (opcional)",
  al_test: "Enviar prueba", al_test_ok: "Prueba enviada", al_save: "Guardar cambios", al_saved: "Alertas guardadas", al_save_first: "Guarda los cambios antes de probar", al_incomplete: "Completa los datos para probar",
  al_last_error: "Último error: {error}", al_last_ok: "Último envío correcto {ago}", al_history: "Historial", al_history_empty: "Todavía no ha saltado ninguna alerta.",
  al_security: "El token y la URL se guardan en un archivo local que solo puede leer tu usuario.",
  al_b_died: "Caída", al_b_oom: "OOM", al_b_unhealthy: "Salud", al_b_recovered: "Recuperado", al_b_restartLoop: "Bucle", al_b_cpu: "CPU", al_b_memory: "Memoria", al_b_test: "Prueba",
  err_invalid_telegram_token: "El token de Telegram no tiene el formato correcto (123456:ABC…).", err_invalid_telegram_chat: "El ID de chat debe ser un número (o @canal).",
  err_telegram_incomplete: "Telegram necesita token e ID de chat.", err_invalid_webhook_url: "La URL del webhook debe empezar por http:// o https://.", err_webhook_incomplete: "El webhook necesita una URL.",
  err_invalid_authorization: "La cabecera Authorization no es válida.", err_alert_test_failed: "Falló la prueba: {reason}",
} as const;
