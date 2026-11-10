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

- **Barra lateral** (arriba en móvil): las ocho secciones en dos grupos, **Gestionar** (Contenedores, Compose, Imágenes, Volúmenes, Redes) y **Observar** (Eventos, Alertas, Disco), con un botón de búsqueda arriba. En la parte inferior verás el estado de la conexión (🟢 *Docker conectado*), el cambio de tema, el selector de idioma y la ayuda.
- **Zona principal**: la sección activa, con su título.
- **Avisos**: aparecen abajo a la derecha. Los de éxito desaparecen solos; los de error permanecen unos segundos más y puedes cerrarlos con ✕.
- **Confirmaciones**: toda acción destructiva (eliminar, bajar un stack…) pide confirmación explícita y te explica qué ocurrirá.
- **Ventanas**: se cierran con `Esc`, con ✕ o haciendo clic fuera (la terminal es la excepción, ver más abajo).
- **Carga**: mientras llegan los datos ves filas de relleno (un esqueleto), así el diseño no da saltos.

El título de la pestaña del navegador muestra cuántos contenedores están en marcha: `(12) Docker Gestor`.

### Paleta de comandos

Pulsa **`Ctrl`+`K`** (**`⌘`+`K`** en Mac) en cualquier momento, incluso escribiendo en un campo, o usa el botón de búsqueda de la parte superior de la barra lateral. Escribe lo que quieras y pulsa `Enter`:

- **Secciones**: `imágenes`, `disco`, `alertas`…
- **Contenedores**: `logs api` encuentra *Logs · shop-api*; cada contenedor ofrece *Detalles*, *Logs*, *Terminal* (si está en marcha) e *Iniciar/Detener*.
- **Acciones**: nuevo contenedor, refrescar, cambiar tema, cambiar idioma, ayuda.

Cada palabra que escribas tiene que coincidir (en cualquier orden), se ignoran mayúsculas y acentos, y también vale una abreviatura suficientemente larga (`shwb` encuentra *shop-web*). `↑` `↓` se mueven, `Enter` ejecuta, `Esc` cierra y `Ctrl`+`K` otra vez también la cierra.

### Se mantiene actualizada sola

La interfaz sigue a Docker mediante su flujo de eventos, así que un contenedor que inicies, detengas o elimines desde la línea de comandos, Compose u otra herramienta aparece en menos de un segundo **sin recargar la página**. También se pone al día sola cuando:

- **Docker deja de responder un rato** (se reinicia, el equipo despierta…): un aviso ámbar dice *Docker no responde* y la página reconecta por sí misma, refrescando en cuanto Docker vuelve. Un aviso rojo significa que se perdió el **servicio de Docker Gestor** en sí, que es otra cosa.
- **Llegan muchos eventos a la vez** (detener un stack entero): refresca a un ritmo constante en lugar de esperar a que acabe la tormenta.
- **Llega tarde una respuesta lenta y ya antigua**: nunca pisa datos más nuevos.
- **Vuelves a la pestaña** pasado un tiempo.

Tras una acción refresca al instante y una vez más poco después, por si Docker tarda un momento en mostrar el nuevo estado. Una ventana de *Detalles* abierta también se actualiza sola.

## 4. Contenedores

La sección principal. Arriba hay cuatro tarjetas de resumen: contenedores en marcha, CPU total, memoria en uso y número de stacks.

### Buscar, filtrar y agrupar

- **Buscar** (`/`): filtra por nombre, imagen o stack.
- **Todos / Activos / Detenidos**: con el número de contenedores de cada grupo.
- **Agrupar por**: **Stack** (proyectos de Compose; los demás van en «Sin stack»), **Mis grupos** (los tuyos, ver más abajo) o **Nada**.

### Cada fila

| Elemento | Qué significa |
|---|---|
| Franja de color | El estado de un vistazo: verde en marcha, rojo *unhealthy*, ámbar arrancando u otro, gris detenido |
| Nombre e imagen | Haz clic en el nombre para ver los detalles; pasa el ratón para ver el texto completo |
| Puertos `:8080:80 ↗` | Puertos publicados como etiquetas. Los TCP son clicables y abren `http://localhost:<puerto>` en otra pestaña |
| Insignia de estado | 🟢 En marcha · 🟡 Arrancando / pausado · 🔴 *unhealthy* (falla su comprobación de salud) · ⚪ Detenido |
| CPU y RAM | Uso actual, con barra y una **mini-gráfica de los últimos minutos** (la cifra se pone ámbar por encima del 60 % y roja por encima del 85 %). Se actualiza cada 10 s y solo mientras estás en esta sección. En vista compacta solo ves las cifras |
| 🔕 | Aparece junto al nombre cuando sus alertas están silenciadas (ver [Alertas](#10-alertas)) |

### Consumo de un vistazo

![Contenedores ordenados por CPU](img/metrics.png)

- **Las tarjetas de arriba** resumen el conjunto: contenedores en marcha (con barra), **CPU total** con su tendencia y el contenedor que más gasta, y **memoria** usada frente a la RAM del equipo, también con el que más consume. Hasta que carga la lista no muestran nada a medias.
- **Ordenar por consumo:** pulsa los títulos **Contenedor**, **CPU** o **RAM** de la tabla. Los que más gastan van primero y los detenidos al final; pulsa de nuevo el título activo para volver al orden de Docker. Se recuerda entre visitas y funciona dentro de cada grupo.
- **Las tendencias empiezan al abrir la página:** se dibujan con las muestras que toma la propia página (una cada 10 s, hasta unos 5 minutos), así que tardan unos 20 s en aparecer. Para ver más historia usa la [gráfica de consumo](#gráfica-de-consumo).

### Acciones de la fila

Las dos que más usas están en la fila; el resto, en el menú **⋯**.

| Control | Acción |
|---|---|
| ▶ / ■ | Iniciar o detener |
| 📄 | **Ver logs** |
| **⋯** → Detalles | Los [detalles](#detalles-del-contenedor) del contenedor |
| **⋯** → Reiniciar | Reiniciar |
| **⋯** → Abrir terminal | **Terminal** (solo si está en marcha) |
| **⋯** → Gráfica de consumo | **Gráfica de consumo** |
| **⋯** → Eliminar | Eliminar (pide confirmación), en rojo y separado |

El menú se maneja por completo con el teclado: `Enter` o `↓` sobre el botón **⋯** lo abre, `↑` `↓` `Inicio` `Fin` se mueven, `Enter` elige, `Esc` lo cierra y devuelve el foco al botón. Se abre hacia arriba si no hay sitio debajo.

Mientras una acción se ejecuta, el botón muestra un indicador y se desactiva para evitar dobles clics.

**Densidad.** El botón junto a *Agrupar por* alterna entre una vista **cómoda** y otra **compacta** (una línea por contenedor, así cabe un stack entero en pantalla). Se recuerda.

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

### Grupos (stacks) y selección

Los contenedores se agrupan por stack de Compose (se desactiva con *Agrupar por stack*). La cabecera de cada grupo te da:

- **Cómo va el grupo:** `5/5 en marcha` y su CPU y memoria combinadas.
- **▶ ■ ⟳ para todo el grupo:** iniciar todos, detener todos, reiniciar todos. Actúan sobre los **contenedores mismos**, así que también sirven para grupos que Compose no puede gestionar (stacks creados con otras herramientas como Supabase CLI, o contenedores que no pertenecen a ningún stack).
- **Una casilla** para seleccionar todo el grupo y una **flecha ▾** para plegarlo (se recuerda entre visitas).

**El orden importa.** Cuando Compose declara dependencias (`depends_on`), Docker Gestor las respeta: **inicia** primero la base de datos y la caché, luego la API y luego el servidor web, y **detiene** en el orden inverso. Los contenedores de una misma capa se ejecutan en paralelo, así que un stack grande sigue siendo rápido. Sin información de dependencias (o fuera de Compose) todo se ejecuta a la vez. Reiniciar sigue el orden de inicio.

**Esperar a que un servicio esté listo.** Si Compose declara una dependencia como `service_healthy` (o `service_completed_successfully`, típico de contenedores de preparación que se ejecutan una vez), iniciar o reiniciar un grupo **espera** a que esté lista antes de arrancar lo que depende de ella, igual que hace `docker compose up`. Si la dependencia nunca llega a estar lista, lo que depende de ella **no se arranca** (ni lo que depende de eso), y la ventana de errores explica por qué: se agotó el tiempo, pasó a no saludable o se detuvo. Una dependencia sin comprobación de salud no se espera, `service_started` nunca espera, y parar o eliminar tampoco esperan.

![Un inicio de grupo que rechazó servicios cuya base de datos nunca llegó a estar saludable](img/health-failure.png)

- La dependencia se busca **dentro del mismo proyecto de Compose**, aunque no esté en tu selección: pulsar *Iniciar todos* solo sobre los contenedores detenidos de un stack sigue esperando a una base de datos que está en marcha pero aún no saludable. Si esa dependencia está detenida, el dependiente se rechaza en lugar de arrancar sin ella.
- La espera es de hasta **90 segundos** por dependencia; se cambia con `HEALTH_WAIT_SECONDS` (de 1 a 600). Un fallo por dependencia no saludable o detenida se comunica enseguida, no al final del tiempo.

**Progreso en vivo y Cancelar.** Cuando una acción de grupo tarda más de un momento, un panel lista cada contenedor con su estado (en cola, en curso, hecho, fallido) y la capa actual, y mientras espera dice **a qué está esperando**: `Esperando a que «db» esté listo… 12 s / 90 s`. **Cancelar** detiene el resto: lo que ya está en curso termina (nada se interrumpe a medias), pero no se lanza ninguna capa ni contenedor más y la espera se corta. Las acciones rápidas nunca muestran el panel.

![Panel de progreso: dos servicios esperando a la base de datos y uno en cola](img/progress.png)

**Selecciona los contenedores que quieras** con la casilla de cada fila (o la que está junto al buscador, para todo lo visible). Aparece una barra con **Iniciar**, **Detener**, **Reiniciar** y **Eliminar** para la selección, aunque sea de grupos distintos.

**Seguridad:** detener, reiniciar y eliminar varios contenedores siempre pregunta antes y lista sus nombres; eliminar también quita los que están en marcha pero nunca sus volúmenes con nombre. Iniciar no pide confirmación. Actuar sobre algo que ya está en el estado deseado no es un error (un contenedor en marcha simplemente se omite), y si uno falla los demás siguen adelante; los fallos se listan con el motivo de Docker. Las acciones de grupo se aplican a los contenedores visibles en ese grupo, así que un filtro (p. ej. *Detenidos*) acota lo que hace *Iniciar todos*.

> La sección **Compose** sigue siendo el lugar para `up`, `down` y `pull`, que necesitan el `docker-compose.yml` del stack.

### Tus propios grupos

Junto al buscador, **Agrupar por** alterna entre **Stack** (proyectos de Compose, el valor por defecto), **Mis grupos** y **Nada**. La elección se recuerda.

En **Mis grupos** organizas los contenedores como quieras, con independencia de Compose: por ejemplo *Frontend*, *Datos* o *Experimentos*.

- **Crear o llenar un grupo:** selecciona contenedores y pulsa **Mover a grupo…**. Escribe un nombre nuevo o elige uno existente (los nombres no distinguen mayúsculas: escribir `frontend` entra en `Frontend`). Un contenedor pertenece a un solo grupo a la vez.
- **Arrastrar y soltar:** en *Mis grupos* cada fila tiene un **asa ⠿**. Arrástrala sobre cualquier grupo para mover el contenedor allí. Si la fila que agarras está seleccionada, **se mueve toda la selección** a la vez. Mientras arrastras aparecen dos zonas extra: una para **sacar los contenedores de su grupo** y otra para **crear un grupo nuevo** (pide el nombre). La pantalla se actualiza al instante y, si el servidor lo rechaza, vuelve a como estaba y muestra el error.
- **Sacarlos de un grupo:** selecciona los contenedores, pulsa **Mover a grupo…** y elige **Quitar del grupo**.
- **Renombrar:** el lápiz de la cabecera del grupo. Renombrar a un grupo que ya existe **los fusiona**.
- **Disolver:** la ✕ de la cabecera del grupo. **Los contenedores nunca se tocan**: solo dejan de pertenecer al grupo.
- Un grupo personalizado funciona igual que un stack: **iniciar todos / detener todos / reiniciar todos** (con el mismo orden por dependencias cuando los contenedores vienen de Compose), selección y plegado.

El arrastre usa el de serie del navegador, que **no funciona en pantallas táctiles**; allí, y con teclado, **Mover a grupo…** hace lo mismo. Arrastrar solo está disponible en *Mis grupos* (los stacks de Compose los define Compose).

Los grupos se guardan en el servidor, **por nombre de contenedor**, así que sobreviven a recrear un contenedor (lo habitual con Compose) y son los mismos desde cualquier navegador. Puede haber hasta 50 grupos con nombres de 1 a 40 caracteres. Se conservan las asignaciones de contenedores que ya no existen, de modo que un stack que bajas con `down` y vuelves a levantar regresa a su grupo.

### Detalles del contenedor

Haz clic en el nombre de un contenedor, o en el botón ⓘ, para abrir sus detalles. Sustituye a ejecutar `docker inspect` a mano:

| Pestaña | Qué muestra |
|---|---|
| **Resumen** | Estado, **por qué se detuvo** (código de salida explicado: `137` = detenido a la fuerza, `143` = parada normal, `1` = error de la aplicación…, más el indicador de *sin memoria*), reinicios y política, imagen, comando, usuario, límites y **ajustes a tener en cuenta** |
| **Variables** | Variables, con buscador. Los valores que parecen sensibles están **ocultos**; pulsa **Mostrar** para pedir uno y **Copiar** para copiarlo |
| **Montajes** | Carpetas del equipo y volúmenes, con su ruta y el modo solo lectura / lectura y escritura |
| **Red** | Puertos publicados (con enlace), puertos expuestos pero no publicados, y cada red con su IP, puerta de enlace y alias |
| **Salud** | Estado de salud, fallos seguidos y las últimas comprobaciones con su salida |
| **Etiquetas** | Todas las etiquetas (proyecto de Compose, metadatos de la imagen…) |
| **JSON** | El `docker inspect` completo, con los valores sensibles ocultos |

Los **ajustes a tener en cuenta** señalan lo que conviene saber de un contenedor: el modo *privilegiado*, el **socket de Docker** montado (control equivalente a root sobre el equipo), el **sistema de archivos raíz** del equipo montado, el espacio de **red** o de **procesos** del equipo y las **capacidades** de Linux extra.

**Cómo se tratan los secretos:** el servidor nunca envía el valor de una variable que parezca sensible (ni de un argumento de comando que lo parezca) salvo que pulses **Mostrar** en esa variable concreta; esa petición no se guarda en caché. La detección es una heurística aproximada sobre el **nombre** (`*PASSWORD*`, `*TOKEN*`, `*KEY*`, `*SECRET*`…), sobre las **credenciales dentro de una URL** (`postgres://usuario:clave@host`) y sobre el **aspecto del valor** (JWT, prefijos conocidos de tokens, cadenas largas tipo clave). Prefiere ocultar de más: un falso positivo solo cuesta un clic, pero no es una barrera de seguridad frente a quien ya controla Docker.

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
| **No saludable** | Falla su comprobación de salud |
| **Reinicios en bucle** | Se cae N veces en M minutos (por defecto 3 en 10) |
| **CPU alta** *(desactivada por defecto)* | Se mantiene por encima de X % durante M minutos (por defecto 90 % durante 5) |
| **Memoria alta** *(desactivada por defecto)* | Se mantiene por encima de X % de su límite de memoria durante M minutos (por defecto 90 % durante 2). Sin límite, el porcentaje es sobre la RAM del equipo |

**Sin ruido:** un `stop`, `restart` o eliminación que hagas tú (desde esta interfaz o desde la línea de comandos) se reconoce y se ignora. La misma alerta para el mismo contenedor no se repite durante el tiempo de **espera** (10 minutos por defecto; 0 lo desactiva).

![Alertas con reglas, silencios y canales](img/alerts.png)

#### Cuando el problema termina

Con **Avisar cuando se resuelve** (activado por defecto) llega un mensaje «🟢 …» al acabar un problema **del que ya te avisamos**:

| Aviso | Cuándo llega |
|---|---|
| `recovered` — «vuelve a estar saludable» | Su comprobación de salud pasa de *unhealthy* a *healthy* |
| `back_up` — «vuelve a estar en marcha» | Tras una caída o un OOM, el contenedor lleva **30 s seguidos** en marcha. Si se cae otra vez antes, no hay aviso: un bucle de reinicios nunca «se recupera» |
| `cpu_ok` / `memory_ok` — «CPU de nuevo al 12 %» | Dos muestras seguidas por debajo del umbral después de un aviso de CPU o memoria altas |

Nunca llega un «todo bien» sin un aviso previo: si el aviso estaba silenciado, excluido o desactivado, tampoco se avisa de que terminó. Los avisos de recuperación ignoran la espera (no los frena un aviso reciente).

#### Silenciar

Para un mantenimiento no hace falta apagar las alertas: **silencia solo lo que toca**.

- Desde la fila: menú **⋯ → Silenciar alertas…**. Elige si es **solo ese contenedor** o **todo su stack**, y **1 hora, 8 horas, 24 horas o hasta que lo reactives**. Los contenedores silenciados llevan una campana tachada (🔕), y el mismo menú ofrece **Reactivar alertas**.
- Desde **Alertas → Silenciadas**: lista todo lo que está en silencio, con cuándo termina y un botón **Reactivar**; también puedes silenciar por nombre (un contenedor o un stack). En el **Historial**, cada fila tiene una campana para silenciar ese contenedor 1 hora.
- Un silencio vale para **todas las reglas y todos los canales**, empieza y termina al instante (no hay que pulsar *Guardar cambios*) y caduca solo. Silenciar un stack cubre todos sus contenedores, incluso los detenidos.
- Se guardan en `alerts.json`; guardar las reglas desde el formulario nunca los quita.

#### Ignorar contenedores y espera por regla

Cada regla activada tiene dos opciones extra:

- **Ignorar contenedores:** nombres separados por comas que esa regla no vigila (por ejemplo, un contenedor de pruebas que se cae a propósito, sin dejar de vigilar su consumo).
- **Repetir cada (min):** su propio tiempo de espera. Vacío = el general; `0` = nunca suprimir. La espera ya era independiente para cada regla y contenedor; ahora además puedes darle un valor distinto a cada regla.

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

`event` es uno de `died`, `oom`, `unhealthy`, `recovered`, `back_up`, `restartLoop`, `cpu`, `cpu_ok`, `memory`, `memory_ok`, `test`. Usa **Enviar prueba** (tras guardar) para comprobar un canal; la sección muestra el último error o el último envío correcto de cada uno.

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
| `Ctrl`/`⌘` + `K` | **Paleta de comandos** (funciona en cualquier sitio, incluso escribiendo) |
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
| `HEALTH_WAIT_SECONDS` | `90` | Cuánto espera un inicio de grupo a una dependencia `service_healthy` (1–600) |
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
- Los detalles del contenedor nunca incluyen el valor de variables que parezcan sensibles salvo que pulses *Mostrar* en esa variable.
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
| Una variable aparece oculta pero no es un secreto | La detección es deliberadamente prudente (cualquier nombre con `key`, `token`, `pass`…): pulsa *Mostrar* para verla |
| Un inicio de grupo dice que un servicio no se arrancó | Depende de un servicio que nunca llegó a estar saludable (mira la ventana de errores). Revisa la pestaña *Salud* de ese servicio, arréglalo y vuelve a iniciar el grupo |
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
src/lib/groups-core.mjs        Acciones de grupo: validación y orden por dependencias (puro, con pruebas)
src/lib/groups.ts             Almacenamiento de grupos personalizados (SQLite, por nombre de contenedor)
src/lib/inspect-core.mjs       Detalles del contenedor y enmascarado de secretos (puro, con pruebas)
src/lib/disk-core.mjs         Análisis de uso de disco y validación de limpieza (puro, con pruebas)
src/lib/disk.ts               Informe de disco y limpieza elemento a elemento
src/app/page.tsx              Interfaz (secciones)
src/app/ui.tsx                Componentes comunes: botones, modal, avisos, confirmaciones, iconos, menú de acciones, esqueletos
src/app/Palette.tsx           Paleta de comandos (Ctrl/⌘+K)
src/lib/palette-core.mjs      Búsqueda y ordenación de la paleta (puro, con pruebas)
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
| `/groups` | GET, PUT | Grupos personalizados: leerlos; asignar / quitar contenedores, renombrar o disolver un grupo (una operación por petición) |
| `/containers/batch` | POST | Inicia / detiene / reinicia / elimina varios contenedores, en orden de dependencias cuando Compose lo indica. Con `?stream=1` responde con eventos de progreso en JSON por líneas y se puede cancelar cerrando la conexión |
| `/containers/:id/logs` | GET (SSE) | Logs en vivo |
| `/containers/:id/inspect` | GET | Detalles del contenedor; se omiten los valores que parecen sensibles |
| `/containers/:id/env?name=` | GET | El valor real de UNA variable de entorno (acción explícita «Mostrar»; no se guarda en caché) |
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
