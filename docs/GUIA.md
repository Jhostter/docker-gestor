# Docker Gestor — Guía de uso

Panel web local para gestionar Docker desde el navegador: contenedores, logs, terminal, Compose, imágenes, volúmenes, redes, eventos y gráficas de consumo. Está pensado para uso personal en tu máquina y consume muy pocos recursos.

## Índice

1. [Inicio rápido](#1-inicio-rápido)
2. [Instalación y servicio systemd](#2-instalación-y-servicio-systemd)
3. [Recorrido por la interfaz](#3-recorrido-por-la-interfaz)
4. [Contenedores](#4-contenedores)
5. [Compose](#5-compose)
6. [Imágenes](#6-imágenes)
7. [Volúmenes](#7-volúmenes)
8. [Redes](#8-redes)
9. [Eventos](#9-eventos)
10. [Alertas](#10-alertas)
11. [Disco](#11-disco)
12. [Atajos de teclado](#12-atajos-de-teclado)
13. [Tema e idioma](#13-tema-e-idioma)
14. [Historial de consumo y datos guardados](#14-historial-de-consumo-y-datos-guardados)
15. [Configuración](#15-configuración)
16. [Consumo de recursos](#16-consumo-de-recursos)
17. [Seguridad](#17-seguridad)
18. [Solución de problemas](#18-solución-de-problemas)
19. [Desinstalar](#19-desinstalar)
20. [Para desarrolladores](#20-para-desarrolladores)

---

## 1. Inicio rápido

Si ya instalaste el servicio (ver [sección 2](#2-instalación-y-servicio-systemd)), abre:

**http://localhost:4455**

Nada más. El servicio arranca solo con la máquina. Para comprobarlo:

```bash
systemctl --user status docker-gestor
```

## 2. Instalación y servicio systemd

### Requisitos

| Requisito | Detalle |
|---|---|
| Docker | Motor funcionando (el socket se detecta solo; ver [PLATFORMS](PLATFORMS.md)) |
| Permisos | Tu usuario debe pertenecer al grupo `docker` (`id -nG`) |
| Node.js | Versión reciente (usa el SQLite integrado `node:sqlite`; probado con Node 26) |
| systemd | Con sesión de usuario (`systemctl --user`) |

### Instalar como servicio

```bash
git clone https://github.com/Jhostter/docker-gestor.git
cd docker-gestor
npm install            # solo la primera vez
./scripts/install-service.sh
```

El script hace cuatro cosas: compila la aplicación (`npm run build`), crea `~/.config/systemd/user/docker-gestor.service`, recarga systemd y lo habilita e inicia.

### Que arranque con el equipo sin iniciar sesión

Los servicios de usuario solo arrancan sin sesión si está activado el «linger»:

```bash
loginctl show-user $USER -p Linger      # Linger=yes → ya está activo
sudo loginctl enable-linger $USER       # si dice Linger=no
```

### Comandos útiles del servicio

| Acción | Comando |
|---|---|
| Ver estado | `systemctl --user status docker-gestor` |
| Reiniciar | `systemctl --user restart docker-gestor` |
| Detener | `systemctl --user stop docker-gestor` |
| Ver logs del servicio | `journalctl --user -u docker-gestor -f` |
| Desactivar el arranque automático | `systemctl --user disable docker-gestor` |

> **Tras actualizar el código** hay que recompilar: `git pull && npm install && npm run build && systemctl --user restart docker-gestor` (desde la carpeta del proyecto).

## 3. Recorrido por la interfaz

- **Barra lateral** (arriba en móvil): las ocho secciones. En la parte inferior verás el estado de la conexión (🟢 *Docker conectado*), el cambio de tema, el selector de idioma y la ayuda.
- **Zona principal**: el contenido de la sección activa.
- **Avisos**: aparecen abajo a la derecha. Los de éxito desaparecen solos; los de error permanecen unos segundos más y puedes cerrarlos con ✕.
- **Confirmaciones**: toda acción destructiva (eliminar, bajar un stack…) pide confirmación explícita y te explica qué ocurrirá.
- **Ventanas**: se cierran con `Esc`, con ✕ o haciendo clic fuera (la terminal es la excepción, ver más abajo).

El título de la pestaña del navegador muestra cuántos contenedores están en marcha: `(12) Docker Gestor`.

## 4. Contenedores

La sección principal. Arriba hay cuatro tarjetas de resumen: contenedores en marcha, CPU total, memoria en uso y número de stacks.

### Buscar, filtrar y agrupar

- **Buscar** (`/`): filtra por nombre, imagen o stack.
- **Todos / Activos / Detenidos**: con el número de contenedores de cada grupo.
- **Agrupar por stack**: reúne los contenedores por proyecto de Compose. Los que no pertenecen a ninguno van en «Sin stack».

### Cada fila

| Elemento | Qué significa |
|---|---|
| Nombre e imagen | Pasa el ratón para ver el texto completo |
| Enlaces `:8080:80 ↗` | Puertos publicados. Los TCP son clicables y abren `http://localhost:<puerto>` en otra pestaña |
| Insignia de estado | 🟢 En marcha · 🟡 Arrancando / pausado · 🔴 *unhealthy* (falla su comprobación de salud) · ⚪ Detenido |
| CPU y RAM | Uso actual, con barra. Se actualiza cada 10 s y solo mientras estás en esta sección |

### Botones de acción

| Icono | Acción |
|---|---|
| ▶ / ■ | Iniciar o detener |
| ⟳ | Reiniciar |
| 📄 | **Ver logs** |
| ›_ | **Abrir terminal** (solo si está en marcha) |
| 📊 | **Gráfica de consumo** |
| 🗑 | Eliminar (pide confirmación) |

Mientras una acción se ejecuta, el botón muestra un indicador y se desactiva para evitar dobles clics.

### Ver logs

Se abre una ventana a pantalla completa con los logs en directo (últimas 200 líneas al abrir y luego en tiempo real).

- **Filtrar líneas**: escribe para ver solo las que contienen ese texto.
- **Seguir al final**: desplaza automáticamente. Se desactiva solo si haces scroll con la rueda.
- **Ajustar líneas**: activa/desactiva el salto de línea.
- **Marcas de tiempo**: muestra u oculta la fecha de cada línea.
- Las líneas con *error/fatal/exception* se pintan en rojo y las de *warning* en ámbar.
- 💾 descarga lo que estás viendo como `.log`; 🗑 limpia la pantalla (no borra los logs de Docker).
- Se conservan las últimas 2000 líneas en pantalla.
- El indicador muestra **En vivo**, **Reconectando…** o **Finalizado** (cuando el contenedor está detenido y ya no emite más).

### Terminal

Abre una shell interactiva dentro del contenedor (`bash` si existe, si no `sh`), con soporte de colores, redimensionado y programas como `vim` o `top`.

- Solo disponible en contenedores **en marcha**.
- `Esc` **no** cierra esta ventana, porque lo necesitan programas como vim. Ciérrala con ✕.
- Al cerrarla se termina la sesión.
- Las imágenes mínimas sin shell (p. ej. *distroless*) no funcionarán.

### Gráfica de consumo

Muestra CPU (%) y memoria con rangos de **1 h**, **24 h** y **7 días**. Pasa el ratón (o el dedo) sobre la gráfica para ver el valor exacto y la hora de cada punto. Si acabas de arrancar el servicio o el contenedor, verás «Aún no hay suficientes datos»: se toma una muestra cada 15 s.

### Crear un contenedor

Botón **+ Nuevo contenedor** (o tecla `n`):

| Campo | Notas |
|---|---|
| **Imagen** (obligatoria) | Sugiere las que ya tienes. Si no existe localmente, se descarga |
| **Nombre** | Opcional; Docker genera uno si lo dejas vacío |
| **Puertos** | `anfitrión:contenedor`, p. ej. `8080:80` o `53:53/udp`. Se publican **solo en 127.0.0.1** |
| **Variables de entorno** | `CLAVE=valor` |
| **Volúmenes** | `origen:/ruta/destino`. El origen puede ser un volumen con nombre o una ruta del equipo. Añade `:ro` para solo lectura |
| **Reinicio automático** | No reiniciar · Salvo que se detenga a mano · Siempre · Solo si falla |
| **Red** | Por defecto (bridge) o una de tus redes |

Cada línea se valida mientras escribes (borde rojo si el formato no es correcto) y el botón **Crear e iniciar** se activa cuando todo es válido. Si Docker rechaza la operación (nombre duplicado, puerto ocupado…), el error aparece dentro del formulario sin perder lo que escribiste. Al terminar, el contenedor queda **creado e iniciado**.

## 5. Compose

Lista los proyectos de Docker Compose que Docker conoce (por las etiquetas de sus contenedores), con cuántos servicios están activos.

| Botón | Equivale a | Efecto |
|---|---|---|
| **Ver contenedores** | — | Salta a Contenedores filtrando por ese stack |
| **Iniciar** | `docker compose up -d` | Crea e inicia los servicios |
| **Reiniciar** | `docker compose restart` | Reinicia los servicios |
| **Detener** | `docker compose stop` | Detiene sin eliminar |
| **Actualizar imágenes** | `docker compose pull` | Descarga versiones nuevas (no reinicia nada) |
| **Bajar** | `docker compose down` | Detiene y **elimina** contenedores y redes del stack. Los volúmenes se conservan |

Tras cada acción se abre una ventana con la salida del comando.

**Limitaciones**

- Solo se pueden gestionar stacks cuyo archivo `docker-compose.yml` sigue en su ubicación original. Los creados por otras herramientas (por ejemplo **Supabase CLI**) aparecen en la lista pero solo se pueden consultar; en su tarjeta se indica el motivo.
- Los comandos tienen un límite de 5 minutos.
- Solo se opera sobre stacks que Docker ya conoce; el navegador nunca puede indicar rutas arbitrarias del disco.

## 6. Imágenes

- **Descargar**: escribe una referencia (`nginx:latest`, `postgres:16-alpine`) y pulsa *Descargar*. El botón muestra «Descargando…» mientras dura.
- **Filtros**: Todas / **En uso** / **Sin usar**, y búsqueda por etiqueta o identificador.
- Cada imagen muestra etiqueta, identificador corto, tamaño y antigüedad. El número `+N` indica etiquetas adicionales.
- **En uso** significa que algún contenedor (incluso detenido) se creó con ella.
- Arriba a la derecha verás el total: nº de imágenes y espacio ocupado.
- Eliminar pide confirmación. Docker rechaza borrar una imagen que usa un contenedor.

## 7. Volúmenes

Lista los volúmenes con su driver y su ruta física. Los de nombre generado (64 caracteres hexadecimales) se muestran abreviados con la insignia **anónimo**; suelen venir de imágenes que declaran `VOLUME`.

> ⚠️ **Eliminar un volumen borra sus datos de forma permanente.** Docker se niega si está en uso por algún contenedor. Antes de borrar uno con nombre reconocible (p. ej. una base de datos), asegúrate de tener copia.

## 8. Redes

- **Crear red**: escribe un nombre (letras, números, `.`, `-`, `_`) y pulsa *Crear red*. Se crea de tipo *bridge*.
- Cada red muestra su subred y los contenedores conectados (chips).
- `bridge`, `host` y `none` se marcan **del sistema** y no se pueden eliminar.
- Docker rechaza eliminar una red con contenedores conectados.

## 9. Eventos

Flujo en vivo de lo que ocurre en Docker: creación, arranque, parada, destrucción de contenedores, descarga de imágenes, redes y volúmenes.

- Al abrir la página se cargan los eventos de los **últimos 10 minutos** y después llegan en directo (máx. 300 en pantalla).
- Filtra por tipo: Todos / Contenedores / Imágenes / Redes / Volúmenes.
- Colores: 🟢 creación o arranque · 🔴 parada o eliminación · 🟡 otros.
- Se omiten `exec_*` y `health_status` porque se disparan constantemente y ocultarían lo importante.
- **Limpiar** vacía la lista de la pantalla.

Estos eventos también son lo que mantiene la interfaz actualizada sin necesidad de consultar a Docker cada pocos segundos.

## 10. Alertas

Las alertas te avisan cuando algo va mal, para que no tengas que dejar la página abierta. Vienen **desactivadas**: no se ejecuta nada hasta que las actives en la sección **Alertas**.

### Qué vigila

| Regla | Salta cuando |
|---|---|
| **Un contenedor se cae** | Termina con un código distinto de 0 **sin que lo hayas detenido tú** |
| **Sin memoria (OOM)** | El sistema lo detiene por falta de memoria |
| **No saludable** | Falla su comprobación de salud (y llega un aviso de «vuelve a estar saludable» al recuperarse) |
| **Reinicios en bucle** | Se cae N veces en M minutos (por defecto 3 en 10) |
| **CPU alta** *(desactivada por defecto)* | Se mantiene por encima de X % durante M minutos (por defecto 90 % durante 5) |
| **Memoria alta** *(desactivada por defecto)* | Se mantiene por encima de X % de su límite de memoria durante M minutos (por defecto 90 % durante 2). Sin límite, el porcentaje es sobre la RAM del equipo |

**Sin ruido:** un `stop`, `restart` o eliminación que hagas tú (desde esta interfaz o desde la línea de comandos) se reconoce y se ignora. La misma alerta para el mismo contenedor no se repite durante el tiempo de **espera** (10 minutos por defecto; 0 lo desactiva).

### Canales

- **Notificaciones del navegador** — siempre aparece un aviso en la página abierta, y una notificación del sistema si la pestaña está en segundo plano. Concede el permiso con el botón de la sección. Solo funciona con una pestaña de Docker Gestor abierta.
- **Telegram** — funciona con la pestaña cerrada. Crea un bot con [@BotFather](https://t.me/BotFather), escríbele cualquier mensaje y pon su **token** y tu **ID de chat** (un número, o `@tucanal`).
- **Webhook** — funciona con la pestaña cerrada. Docker Gestor envía un `POST` a tu URL, con una cabecera `Authorization` opcional. El formato **JSON** sirve tal cual para webhooks de Discord y Slack (incluye `text` y `content`); el **texto plano** encaja con ntfy y servicios parecidos.

```json
{
  "text": "[mipc] 🔴 shop-api terminó con código 1",
  "content": "[mipc] 🔴 shop-api terminó con código 1",
  "event": "died",
  "container": "shop-api",
  "host": "mipc",
  "timestamp": "2026-11-10T15:04:05.000Z",
  "vars": { "code": "1" }
}
```

`event` es uno de `died`, `oom`, `unhealthy`, `recovered`, `restartLoop`, `cpu`, `memory`, `test`. Usa **Enviar prueba** (tras guardar) para comprobar un canal; la sección muestra el último error o el último envío correcto de cada uno.

Los mensajes usan el idioma elegido en la interfaz y empiezan por el nombre del equipo, para distinguir varios ordenadores. Cambia esa etiqueta con `ALERT_HOST`.

### Dónde se guarda

- La configuración, incluidos el token de Telegram y el `Authorization` del webhook, está en `alerts.json` dentro de la carpeta de datos, legible solo por tu usuario (permisos `600`). Nunca se devuelve al navegador.
- El **historial** de alertas (30 días) está en la misma base SQLite que el historial de consumo.

### Coste y límites

- Con las alertas **apagadas** no hay trabajo extra. Con las alertas **encendidas** el servicio mantiene una conexión inactiva con los eventos de Docker y revisa las muestras de consumo que ya toma (medido: sin diferencia visible en CPU ni memoria).
- Las alertas las evalúa el servicio, así que solo funcionan mientras esté en marcha. Si Docker se reinicia, la vigilancia se reconecta sola.
- Las llamadas a Telegram y al webhook caducan a los 8 segundos; un canal que falle nunca bloquea a los demás.


## 11. Disco

Docker puede llenar el disco sin que te des cuenta. La sección **Disco** muestra adónde va el espacio y te deja liberarlo **con seguridad**.

### Qué ves

- El total que usa Docker, dividido en **imágenes**, **contenedores** (sus capas de escritura), **volúmenes** y **caché de compilación**, con lo que se puede recuperar de cada uno. Las cifras coinciden con `docker system df`.
- La primera carga puede tardar unos segundos si hay mucho contenido. El resultado se reutiliza durante 15 segundos; **Analizar de nuevo** lo recalcula.

### Qué se puede limpiar

| Grupo | Qué es | Marcado por defecto |
|---|---|---|
| **Caché de compilación sin usar** | Caché de compilaciones anteriores | ✅ sí — inofensivo, solo hace más lenta la próxima compilación |
| **Imágenes sin etiqueta** | Restos de compilaciones antiguas sin nombre | ✅ sí — lo más seguro de borrar |
| **Contenedores detenidos** | Terminados o creados y nunca iniciados | ❌ no — pueden ser intencionados; pierdes su capa de escritura, **no** sus volúmenes |
| **Imágenes sin usar con etiqueta** | Imágenes con nombre que ningún contenedor usa | ❌ no — quizá quieras conservarlas; se pueden volver a descargar |
| **Volúmenes sin usar** | Volúmenes que ningún contenedor monta | ❌ no — **contienen datos**; borrarlos es permanente |

### Cómo se mantiene seguro

- **No se borra nada hasta que eliges elementos y confirmas.** Puedes elegir por elemento o por grupo.
- Los elementos se eliminan **uno a uno por el identificador exacto que viste**, nunca con un `docker system prune` global, así que no se toca nada creado después de la vista previa.
- Nunca usa `force`: Docker se niega a borrar lo que está en uso, y además Docker Gestor rechaza por su cuenta los contenedores en marcha.
- Una imagen que use cualquier contenedor (incluso detenido) y un volumen que monte cualquier contenedor **nunca se ofrecen**.
- Borrar **volúmenes** exige reconocer expresamente que los datos se perderán.
- Si algo no se puede eliminar, recibes la lista con el motivo que da Docker; nada se da por eliminado si no lo está.
- Orden: contenedores → imágenes → volúmenes → caché. Borrar un contenedor detenido puede liberar su imagen y su volumen, así que tras una limpieza la lista puede mostrar candidatos nuevos.

### Los tamaños son estimaciones

Igual que en `docker system df`, una capa compartida por varias imágenes solo se libera cuando se borran todas las que la usan, así que el espacio realmente recuperado puede diferir de la estimación.


## 12. Atajos de teclado

Pulsa `?` en cualquier momento para verlos. No actúan mientras escribes en un campo ni con una ventana abierta.

| Tecla | Acción |
|---|---|
| `1` – `8` | Cambiar de sección |
| `/` | Ir al buscador |
| `n` | Nuevo contenedor |
| `r` | Refrescar datos |
| `?` | Ayuda |
| `Esc` | Cerrar la ventana abierta |

La interfaz es totalmente navegable con teclado (`Tab`/`Shift+Tab`, `Enter`) y respeta la preferencia del sistema de «reducir animaciones».

## 13. Tema e idioma

- **Tema**: por defecto sigue el de tu sistema. Cambia con el icono ☀/🌙 de la barra lateral (en móvil, el botón flotante abajo a la izquierda); se recuerda en el navegador.
- **Idioma**: español o inglés. La primera vez se usa el idioma del navegador; cambia con el botón **ES / EN** junto al tema. También se recuerda.

> Versión en inglés de esta guía: [GUIDE.md](GUIDE.md).

## 14. Historial de consumo y datos guardados

- Cada **15 segundos** se registra CPU y memoria de los contenedores en marcha en una base SQLite.
- Se conservan **7 días**; una vez por hora se borran las muestras más antiguas.
- Se guarda por **nombre de contenedor**, así que el historial continúa si lo recreas con el mismo nombre (algo habitual con Compose).
- Ubicación: `~/.local/share/docker-gestor/history.db` (más los archivos auxiliares `-wal` y `-shm`).
- Sobrevive a reinicios del servicio y del equipo.
- Mientras el servicio esté detenido no se registra nada.
- Tamaño aproximado: unos pocos MB por semana con una docena de contenedores.

Para consultar o respaldar los datos: es un archivo SQLite estándar con la tabla `samples(ts, name, cpu, mem)` (`ts` en milisegundos).

## 15. Configuración

Variables de entorno (todas opcionales):

| Variable | Por defecto | Efecto |
|---|---|---|
| `DOCKER_SOCKET` / `DOCKER_HOST` | autodetectado | Socket, tubería o `tcp://` de Docker (ver [PLATFORMS](PLATFORMS.md)) |
| `PORT` | `4455` | Puerto (siempre en `127.0.0.1`) |
| `DATA_DIR` | según el sistema (Linux: `~/.local/share/docker-gestor`) | Dónde se guarda el historial |
| `ALERT_HOST` | nombre del equipo | Etiqueta que encabeza los mensajes de alerta |
| `SAMPLE_SECONDS` | `15` | Intervalo de muestreo |
| `RETENTION_DAYS` | `7` | Días de historial |

Para cambiarlas en el servicio:

```bash
systemctl --user edit docker-gestor
```

y añade, por ejemplo:

```ini
[Service]
Environment=SAMPLE_SECONDS=30
Environment=RETENTION_DAYS=14
```

Guarda y reinicia: `systemctl --user restart docker-gestor`.

> Muestrear con menos frecuencia (`SAMPLE_SECONDS` mayor) reduce aún más el consumo; con más frecuencia aumenta la precisión de las gráficas y el coste.

Para cambiar el puerto basta con `PORT` (la lista de hosts permitidos lo sigue automáticamente). La dirección `127.0.0.1` es fija a propósito.

**macOS y Windows:** ver [PLATFORMS.md](PLATFORMS.md) para la compatibilidad (probado a diario solo en Linux), la detección de Docker y cómo dejarlo en marcha.

## 16. Consumo de recursos

El diseño prioriza no molestar a tu máquina:

- **Sin sondeo constante**: la interfaz se refresca cuando Docker emite un evento, no con un temporizador agresivo. Hay un refresco de respaldo cada 60 s.
- **Solo lo necesario**: cada sección pide únicamente sus datos; las estadísticas en vivo solo se piden en *Contenedores*; si la pestaña del navegador está oculta, no se hace ninguna petición.
- **Sin pestañas abiertas**: no hay conexión de eventos ni de logs; solo queda el muestreo de 15 s.
- **Registro eficiente**: una única transacción por muestra, SQLite en modo WAL y consultas agregadas en la base de datos.
- **Límites del servicio** (systemd):

| Límite | Valor |
|---|---|
| `CPUQuota` | 15 % de un núcleo |
| `CPUWeight` / `Nice` / `IOWeight` | 20 / 15 / 20 (prioridad mínima frente a tus aplicaciones) |
| `MemoryHigh` / `MemoryMax` | 160 MB / 256 MB |
| `TasksMax` | 64 |

Medido con 12 contenedores y una pestaña abierta: **≈ 0,2–0,5 % de un núcleo** y **≈ 55 MB** de memoria (cgroup). Puedes comprobarlo tú:

```bash
systemctl --user status docker-gestor      # muestra Memory y CPU
systemd-cgtop                              # vista en vivo
```

## 17. Seguridad

Controlar Docker equivale a tener acceso de administrador a la máquina. Por eso:

- El servidor escucha **solo en `127.0.0.1`**: no es accesible desde otros equipos de la red.
- Toda petición se rechaza si su cabecera `Host` u `Origin` no es `localhost:4455` / `127.0.0.1:4455`. Esto protege contra páginas web maliciosas que intenten manejar tu Docker desde el navegador (CSRF y *DNS rebinding*). Lo mismo aplica a la terminal por WebSocket.
- Los puertos de los contenedores creados desde el panel se publican solo en `127.0.0.1`.
- Todas las entradas (nombres, puertos, variables, volúmenes, imágenes) se validan en el servidor.
- Compose solo actúa sobre stacks que Docker ya conoce.
- Las alertas solo hacen peticiones salientes a la API de Telegram y a la URL de webhook que configures; sus secretos viven en un archivo `600` y nunca se devuelven al navegador.
- **No hay autenticación**: cualquier proceso o usuario con acceso a `localhost:4455` en tu máquina puede usar el panel.

**No expongas este panel a internet ni a tu red** (túneles, proxys inversos, `0.0.0.0`) sin antes añadir autenticación. La terminal da acceso de administrador dentro del contenedor, y un volumen con ruta del equipo da acceso a tus archivos.

## 18. Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| No abre `localhost:4455` | `systemctl --user status docker-gestor`. Si está caído: `journalctl --user -u docker-gestor -n 50` |
| «Sin conexión con el gestor» (banner rojo) | El servicio se detuvo o se está reiniciando. La interfaz reintenta sola |
| `permission denied` sobre el socket | Tu usuario no está en el grupo `docker`: `sudo usermod -aG docker $USER` y cierra/abre sesión |
| `EADDRINUSE` / puerto 4455 ocupado | Otro proceso lo usa (p. ej. un `npm run dev` olvidado): `ss -ltnp \| grep 4455` y detenlo |
| La interfaz sigue igual tras actualizar el código | Falta recompilar: `npm run build` y reiniciar el servicio |
| Las gráficas dicen «Aún no hay suficientes datos» | Espera 30–45 s tras arrancar. El contenedor debe estar en marcha |
| Un stack de Compose no tiene botones | Se creó con otra herramienta o movieron su `docker-compose.yml`; solo es consultable |
| Terminal: se cierra enseguida o error | La imagen no tiene shell, o el contenedor no está en marcha |
| «Host no permitido» (403) | Accedes con otro nombre o puerto (IP de la red, proxy…). Usa `http://localhost:4455` |
| Eliminar imagen/volumen/red falla | Está en uso por algún contenedor. El mensaje de Docker lo indica |
| No llegan alertas por Telegram / webhook | Abre **Alertas** y usa *Enviar prueba*: la sección muestra el último error de cada canal. Revisa el token, el ID de chat y que hayas escrito antes a tu bot |
| Salta una alerta por algo que hice yo | Solo se reconocen como intencionados los stop, restart y eliminaciones; un `docker kill` cuenta como caída |
| La sección Disco tarda la primera vez | Docker calcula los tamaños bajo demanda; con muchas imágenes o volúmenes pueden ser varios segundos. El resultado se guarda 15 s |
| Algo no se pudo limpiar | Está en uso: la lista muestra el motivo de Docker. Detén y elimina antes el contenedor que lo usa |
| No arranca al encender el equipo | Falta el *linger*: `sudo loginctl enable-linger $USER` |
| El servicio se reinicia solo | Puede haber llegado al límite de memoria (256 MB): mira `journalctl --user -u docker-gestor` |

## 19. Desinstalar

```bash
systemctl --user disable --now docker-gestor
rm ~/.config/systemd/user/docker-gestor.service
systemctl --user daemon-reload

# Opcional: borrar el historial (y luego la carpeta del proyecto, si quieres)
rm -rf ~/.local/share/docker-gestor
```

Esto no toca tus contenedores, imágenes, volúmenes ni redes.

## 20. Para desarrolladores

### Estructura

```
server.mjs                    Servidor: Next.js + WebSocket de la terminal
scripts/install-service.sh    Instalador del servicio systemd
src/instrumentation.ts        Arranca el muestreo de consumo
src/lib/docker.ts             Cliente de Docker, validación de Host/Origin, utilidades
src/lib/history.ts            Muestreo y consultas SQLite
src/lib/alerts-core.mjs       Reglas de alertas y validación (puro, con pruebas)
src/lib/alerts.ts             E/S de alertas: vigilancia de Docker, Telegram, webhook, almacenamiento
src/lib/disk-core.mjs         Análisis de uso de disco y validación de limpieza (puro, con pruebas)
src/lib/disk.ts               Informe de disco y limpieza elemento a elemento
src/app/page.tsx              Interfaz (secciones)
src/app/ui.tsx                Componentes comunes: botones, modal, avisos, confirmaciones, iconos
src/app/i18n.ts + locales/    Traducciones (un archivo por idioma)
src/app/{Logs,Terminal,HistoryChart,CreateForm}.tsx   Ventanas
src/app/globals.css           Tokens de tema claro/oscuro
src/app/api/**                API REST y flujos SSE
```

### API (todas bajo `/api`)

| Ruta | Métodos | Descripción |
|---|---|---|
| `/containers` | GET, POST | Listar / crear e iniciar |
| `/containers/:id/:action` | POST | `start`, `stop`, `restart`, `remove` |
| `/containers/:id/logs` | GET (SSE) | Logs en vivo |
| `/stats` | GET | CPU/RAM de los contenedores en marcha |
| `/history?name=&range=` | GET | Serie del historial (`1h`, `24h`, `7d`) |
| `/events` | GET (SSE) | Eventos de Docker |
| `/alerts/config` | GET, PUT | Configuración de alertas (los secretos nunca se devuelven) |
| `/alerts/test` | POST | Envía una prueba por `telegram` o `webhook` |
| `/alerts/history` | GET | Alertas recientes |
| `/alerts/stream` | GET (SSE) | Alertas nuevas para el canal del navegador |
| `/disk` | GET | Informe de uso de disco y candidatos a limpiar (`?fresh=1` omite la caché de 15 s) |
| `/disk/clean` | POST | Elimina los contenedores, imágenes, volúmenes y caché de compilación elegidos |
| `/compose` | GET, POST | Listar stacks / `up`, `down`, `restart`, `stop`, `pull` |
| `/images` | GET, POST, DELETE | Listar / descargar / eliminar |
| `/volumes` | GET, DELETE | Listar / eliminar |
| `/networks` | GET, POST, DELETE | Listar / crear / eliminar |
| `ws://…/ws/exec?id=` | WebSocket | Terminal interactiva |

### Desarrollo

```bash
systemctl --user stop docker-gestor     # libera el puerto 4455
npm run dev                             # recarga en caliente
npm run typecheck                       # comprobar tipos
npm test                                # pruebas unitarias
npm run smoke                           # arranca el servidor compilado sin Docker y lo comprueba
```

Cuando termines: `npm run build && systemctl --user start docker-gestor`.

### Stack

Next.js (App Router) · React · Tailwind CSS 4 · dockerode · `node:sqlite` · ws · xterm.js. Sin dependencias nativas que compilar.
