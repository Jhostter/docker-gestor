import type { NextConfig } from "next";
const config: NextConfig = { serverExternalPackages: ["dockerode", "ssh2", "docker-modem"] };
export default config;
