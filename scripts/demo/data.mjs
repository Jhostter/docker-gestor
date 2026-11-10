// Fictional demo data shared by the mock Docker API and the history seeder.
import { createHash } from "node:crypto";

const id = (name) => createHash("sha256").update(`demo:${name}`).digest("hex");
const SHOP = { "com.docker.compose.project": "shop", "com.docker.compose.project.config_files": "/srv/demo/shop/docker-compose.yml", "com.docker.compose.project.working_dir": "/srv/demo/shop" };
const MON = { "com.docker.compose.project": "monitoring", "com.docker.compose.project.config_files": "/srv/demo/monitoring/docker-compose.yml", "com.docker.compose.project.working_dir": "/srv/demo/monitoring" };
/** Compose service name + dependencies, like `docker compose` records them in labels. */
const SVC = (project, service, dependsOn) => ({ ...(project === "shop" ? SHOP : MON), "com.docker.compose.service": service, ...(dependsOn ? { "com.docker.compose.depends_on": dependsOn } : {}) });

// cpu: average %, mem: MB, kind: log flavour
export const CONTAINERS = [
  { name: "shop-web", image: "nginx:1.27-alpine", ports: [[8080, 80]], labels: SVC("shop", "web", "api:service_started:false"), status: "Up 3 days", cpu: 1.4, mem: 18, kind: "nginx" },
  { name: "shop-api", image: "ghcr.io/acme/shop-api:2.4.1", ports: [[3000, 3000]], labels: SVC("shop", "api", "db:service_healthy:false,cache:service_started:false"), status: "Up 3 days (healthy)", cpu: 6.8, mem: 212, kind: "api" },
  { name: "shop-db", image: "postgres:16-alpine", ports: [[5432, 5432]], labels: SVC("shop", "db"), status: "Up 3 days (healthy)", cpu: 3.1, mem: 164, kind: "postgres" },
  { name: "shop-cache", image: "redis:7-alpine", ports: [], labels: SVC("shop", "cache"), status: "Up 3 days", cpu: 0.6, mem: 9, kind: "redis" },
  { name: "shop-worker", image: "ghcr.io/acme/shop-api:2.4.1", ports: [], labels: SVC("shop", "worker", "db:service_healthy:false,cache:service_started:false"), status: "Up 3 days", cpu: 2.2, mem: 148, kind: "worker" },
  { name: "grafana", image: "grafana/grafana:11.3.0", ports: [[3001, 3000]], labels: SVC("monitoring", "grafana", "prometheus:service_started:false"), status: "Up 2 days", cpu: 1.1, mem: 96, kind: "api" },
  { name: "prometheus", image: "prom/prometheus:v2.55.0", ports: [[9090, 9090]], labels: SVC("monitoring", "prometheus"), status: "Up 2 days", cpu: 2.7, mem: 231, kind: "api" },
  { name: "node-exporter", image: "prom/node-exporter:v1.8.2", ports: [], labels: SVC("monitoring", "node-exporter"), status: "Up 2 days", cpu: 0.3, mem: 12, kind: "redis" },
  { name: "mailpit", image: "axllent/mailpit:v1.21", ports: [[8025, 8025], [1025, 1025]], labels: {}, status: "Up 5 hours (unhealthy)", cpu: 0.2, mem: 21, kind: "api" },
  { name: "old-experiment", image: "alpine:3.20", ports: [], labels: {}, status: "Exited (0) 6 hours ago", cpu: 0, mem: 0, kind: "api", state: "exited" },
].map((c) => ({ ...c, id: id(c.name), state: c.state ?? "running" }));

/** Extra `docker inspect` detail per container (all fictional; the "secrets" are obviously fake). */
export const DETAILS = {
  "shop-web": { env: ["NGINX_HOST=shop.local", "NGINX_PORT=80"], mounts: [["bind", "", "/srv/demo/shop/nginx.conf", "/etc/nginx/nginx.conf", false]], network: "shop_default", started: 3 },
  "shop-api": { env: ["NODE_ENV=production", "PORT=3000", "LOG_LEVEL=info", "JWT_SECRET=demo-jwt-secret-value", "STRIPE_API_KEY=sk_test_demo_not_a_real_key", "DATABASE_URL=postgres://shop:demo-pass@shop-db:5432/shop", "REDIS_URL=redis://shop-cache:6379", "ANON_KEY=eyJhbGciOiJub25lIn0.eyJkZW1vIjp0cnVlfQ.ZGVtby1zaWduYXR1cmU", "CLIENT_CONFIG=eyJhbGciOiJub25lIn0.eyJkZW1vIjp0cnVlfQ.ZGVtby1zaWduYXR1cmU", "DB_ENC_KEY=demo-enc-key-value"],
    mounts: [["bind", "", "/srv/demo/shop/uploads", "/app/uploads", true]], network: "shop_default", started: 3, memory: 512 * 1048576, restart: "unless-stopped", cmd: ["node", "server.js", "--port=3000"],
    health: { status: "healthy", streak: 0, log: [[1, "wget: can't connect to remote host"], [0, "OK"], [0, "OK"], [0, "OK"], [0, "OK"]] } },
  "shop-db": { env: ["POSTGRES_USER=shop", "POSTGRES_PASSWORD=demo-db-password", "POSTGRES_DB=shop", "PGDATA=/var/lib/postgresql/data"], mounts: [["volume", "shop_pgdata", "/var/lib/docker/volumes/shop_pgdata/_data", "/var/lib/postgresql/data", true]], network: "shop_default", started: 3, memory: 1024 * 1048576, restart: "unless-stopped",
    health: { status: "healthy", streak: 0, log: [[0, "/var/run/postgresql:5432 - accepting connections"], [0, "/var/run/postgresql:5432 - accepting connections"], [0, "/var/run/postgresql:5432 - accepting connections"]] } },
  "shop-cache": { env: [], mounts: [["volume", "shop_redis", "/var/lib/docker/volumes/shop_redis/_data", "/data", true]], network: "shop_default", started: 3 },
  "shop-worker": { env: ["NODE_ENV=production", "QUEUE=default", "API_TOKEN=demo-worker-token"], mounts: [], network: "shop_default", started: 3, restartCount: 2, restart: "on-failure" },
  grafana: { env: ["GF_SECURITY_ADMIN_PASSWORD=demo-grafana-admin", "GF_USERS_ALLOW_SIGN_UP=false"], mounts: [["volume", "grafana_data", "/var/lib/docker/volumes/grafana_data/_data", "/var/lib/grafana", true]], network: "monitoring_default", started: 2 },
  prometheus: { env: [], mounts: [["volume", "prometheus_data", "/var/lib/docker/volumes/prometheus_data/_data", "/prometheus", true], ["bind", "", "/srv/demo/monitoring/prometheus.yml", "/etc/prometheus/prometheus.yml", false]], network: "monitoring_default", started: 2 },
  "node-exporter": { env: [], mounts: [["bind", "", "/", "/host", false]], network: "host", started: 2, hostNetwork: true, hostPid: true },
  mailpit: { env: ["MP_SMTP_AUTH_ACCEPT_ANY=1"], mounts: [["volume", "mailpit_data", "/var/lib/docker/volumes/mailpit_data/_data", "/data", true]], network: "bridge", started: 0.2, restart: "always", restartCount: 4,
    health: { status: "unhealthy", streak: 4, log: [[0, "OK"], [1, "wget: can't connect to remote host: Connection refused"], [1, "wget: can't connect to remote host: Connection refused"], [1, "wget: can't connect to remote host: Connection refused"], [1, "wget: can't connect to remote host: Connection refused"]] } },
  "old-experiment": { env: ["EXPERIMENT=1"], mounts: [["volume", "old_experiment_data", "/var/lib/docker/volumes/old_experiment_data/_data", "/data", true]], network: "bridge", started: 1, exited: { code: 137, oom: true }, restartCount: 3 },
};

const now = Math.floor(Date.now() / 1000);
export const IMAGES = [
  ["nginx:1.27-alpine", 52e6, 12], ["ghcr.io/acme/shop-api:2.4.1", 318e6, 3], ["postgres:16-alpine", 274e6, 40], ["redis:7-alpine", 41e6, 25],
  ["grafana/grafana:11.3.0", 468e6, 15], ["prom/prometheus:v2.55.0", 292e6, 21], ["prom/node-exporter:v1.8.2", 43e6, 60], ["axllent/mailpit:v1.21", 25e6, 8],
  ["alpine:3.20", 8e6, 90], ["node:22-alpine", 164e6, 5], ["ubuntu:24.04", 78e6, 33],
].map(([tag, size, days]) => ({ Id: `sha256:${id(tag)}`, RepoTags: [tag], Size: size, Created: now - days * 86400 }))
  // untagged leftovers from old builds
  .concat([["old-build-1", 182e6, 12], ["old-build-2", 96e6, 20]].map(([n, size, days]) => ({ Id: `sha256:${id(n)}`, RepoTags: null, Size: size, Created: now - days * 86400 })));

/** Layers shared between images (bytes), by tag: shop-api is built FROM node:22-alpine. */
export const SHARED = { "ghcr.io/acme/shop-api:2.4.1": 100e6, "node:22-alpine": 100e6 };
/** Writable-layer size of each container (bytes). */
export const SIZE_RW = { "shop-web": 2e6, "shop-api": 38e6, "shop-db": 120e6, "shop-cache": 1e6, "shop-worker": 24e6, grafana: 31e6, prometheus: 66e6, "node-exporter": 0.4e6, mailpit: 9e6, "old-experiment": 38e6 };

/** name -> { size in bytes, containers that mount it } (RefCount is derived from the containers that still exist). */
export const VOLUME_META = {
  shop_pgdata: { size: 640e6, users: ["shop-db"] }, shop_redis: { size: 12e6, users: ["shop-cache"] }, grafana_data: { size: 88e6, users: ["grafana"] },
  prometheus_data: { size: 1.1e9, users: ["prometheus"] }, mailpit_data: { size: 4e6, users: ["mailpit"] },
  old_experiment_data: { size: 220e6, users: ["old-experiment"] }, legacy_uploads: { size: 410e6, users: [] }, [id("anon-1")]: { size: 310e6, users: [] },
};
export const VOLUMES = Object.keys(VOLUME_META)
  .map((n) => ({ Name: n, Driver: "local", Mountpoint: `/var/lib/docker/volumes/${n}/_data`, CreatedAt: "2026-10-02T09:12:44Z" }));

export const BUILD_CACHE = [[310e6, false], [180e6, false], [96e6, false], [64e6, false], [42e6, false], [35e6, true], [18e6, false]]
  .map(([Size, InUse], i) => ({ ID: id(`cache-${i}`), Type: "regular", Description: `RUN step ${i + 1}`, Size, InUse, Shared: false }));

export const NETWORKS = [
  { Id: id("net-bridge"), Name: "bridge", Driver: "bridge", Scope: "local", IPAM: { Config: [{ Subnet: "172.17.0.0/16" }] }, members: ["mailpit"] },
  { Id: id("net-host"), Name: "host", Driver: "host", Scope: "local", IPAM: { Config: [] }, members: [] },
  { Id: id("net-none"), Name: "none", Driver: "null", Scope: "local", IPAM: { Config: [] }, members: [] },
  { Id: id("net-shop"), Name: "shop_default", Driver: "bridge", Scope: "local", IPAM: { Config: [{ Subnet: "172.20.0.0/16" }] }, members: ["shop-web", "shop-api", "shop-db", "shop-cache", "shop-worker"] },
  { Id: id("net-mon"), Name: "monitoring_default", Driver: "bridge", Scope: "local", IPAM: { Config: [{ Subnet: "172.21.0.0/16" }] }, members: ["grafana", "prometheus", "node-exporter"] },
];

/** Deterministic pseudo-random in [0,1) so screenshots are reproducible. */
export const rnd = (seed) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
