// Fictional demo data shared by the mock Docker API and the history seeder.
import { createHash } from "node:crypto";

const id = (name) => createHash("sha256").update(`demo:${name}`).digest("hex");
const SHOP = { "com.docker.compose.project": "shop", "com.docker.compose.project.config_files": "/srv/demo/shop/docker-compose.yml", "com.docker.compose.project.working_dir": "/srv/demo/shop" };
const MON = { "com.docker.compose.project": "monitoring", "com.docker.compose.project.config_files": "/srv/demo/monitoring/docker-compose.yml", "com.docker.compose.project.working_dir": "/srv/demo/monitoring" };

// cpu: average %, mem: MB, kind: log flavour
export const CONTAINERS = [
  { name: "shop-web", image: "nginx:1.27-alpine", ports: [[8080, 80]], labels: SHOP, status: "Up 3 days", cpu: 1.4, mem: 18, kind: "nginx" },
  { name: "shop-api", image: "ghcr.io/acme/shop-api:2.4.1", ports: [[3000, 3000]], labels: SHOP, status: "Up 3 days (healthy)", cpu: 6.8, mem: 212, kind: "api" },
  { name: "shop-db", image: "postgres:16-alpine", ports: [[5432, 5432]], labels: SHOP, status: "Up 3 days (healthy)", cpu: 3.1, mem: 164, kind: "postgres" },
  { name: "shop-cache", image: "redis:7-alpine", ports: [], labels: SHOP, status: "Up 3 days", cpu: 0.6, mem: 9, kind: "redis" },
  { name: "shop-worker", image: "ghcr.io/acme/shop-api:2.4.1", ports: [], labels: SHOP, status: "Up 3 days", cpu: 2.2, mem: 148, kind: "worker" },
  { name: "grafana", image: "grafana/grafana:11.3.0", ports: [[3001, 3000]], labels: MON, status: "Up 2 days", cpu: 1.1, mem: 96, kind: "api" },
  { name: "prometheus", image: "prom/prometheus:v2.55.0", ports: [[9090, 9090]], labels: MON, status: "Up 2 days", cpu: 2.7, mem: 231, kind: "api" },
  { name: "node-exporter", image: "prom/node-exporter:v1.8.2", ports: [], labels: MON, status: "Up 2 days", cpu: 0.3, mem: 12, kind: "redis" },
  { name: "mailpit", image: "axllent/mailpit:v1.21", ports: [[8025, 8025], [1025, 1025]], labels: {}, status: "Up 5 hours", cpu: 0.2, mem: 21, kind: "api" },
  { name: "old-experiment", image: "alpine:3.20", ports: [], labels: {}, status: "Exited (0) 6 hours ago", cpu: 0, mem: 0, kind: "api", state: "exited" },
].map((c) => ({ ...c, id: id(c.name), state: c.state ?? "running" }));

const now = Math.floor(Date.now() / 1000);
export const IMAGES = [
  ["nginx:1.27-alpine", 52e6, 12], ["ghcr.io/acme/shop-api:2.4.1", 318e6, 3], ["postgres:16-alpine", 274e6, 40], ["redis:7-alpine", 41e6, 25],
  ["grafana/grafana:11.3.0", 468e6, 15], ["prom/prometheus:v2.55.0", 292e6, 21], ["prom/node-exporter:v1.8.2", 43e6, 60], ["axllent/mailpit:v1.21", 25e6, 8],
  ["alpine:3.20", 8e6, 90], ["node:22-alpine", 164e6, 5], ["ubuntu:24.04", 78e6, 33],
].map(([tag, size, days]) => ({ Id: `sha256:${id(tag)}`, RepoTags: [tag], Size: size, Created: now - days * 86400 }));

export const VOLUMES = ["shop_pgdata", "shop_redis", "grafana_data", "prometheus_data", "mailpit_data", id("anon-1")]
  .map((n) => ({ Name: n, Driver: "local", Mountpoint: `/var/lib/docker/volumes/${n}/_data`, CreatedAt: "2026-10-02T09:12:44Z" }));

export const NETWORKS = [
  { Id: id("net-bridge"), Name: "bridge", Driver: "bridge", Scope: "local", IPAM: { Config: [{ Subnet: "172.17.0.0/16" }] }, members: ["mailpit"] },
  { Id: id("net-host"), Name: "host", Driver: "host", Scope: "local", IPAM: { Config: [] }, members: [] },
  { Id: id("net-none"), Name: "none", Driver: "null", Scope: "local", IPAM: { Config: [] }, members: [] },
  { Id: id("net-shop"), Name: "shop_default", Driver: "bridge", Scope: "local", IPAM: { Config: [{ Subnet: "172.20.0.0/16" }] }, members: ["shop-web", "shop-api", "shop-db", "shop-cache", "shop-worker"] },
  { Id: id("net-mon"), Name: "monitoring_default", Driver: "bridge", Scope: "local", IPAM: { Config: [{ Subnet: "172.21.0.0/16" }] }, members: ["grafana", "prometheus", "node-exporter"] },
];

/** Deterministic pseudo-random in [0,1) so screenshots are reproducible. */
export const rnd = (seed) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
