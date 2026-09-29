import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const host = process.env.HOST?.trim() || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "8787", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const required = ["DATA_ENCRYPTION_KEY", "BOOTSTRAP_ADMIN_PASSWORD"];
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required`);
}

const persistenceRoot = resolve(process.env.DATA_DIR || "./data");
await mkdir(persistenceRoot, { recursive: true });
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const runtimeRoot = resolve(process.env.RUNTIME_DIR || persistenceRoot, "runtime");
const wranglerHome = resolve(runtimeRoot, "wrangler");
const miniflareHome = resolve(runtimeRoot, "miniflare");
await mkdir(wranglerHome, { recursive: true });
await mkdir(miniflareHome, { recursive: true });

const executable = process.execPath;
const args = [
  resolve("node_modules/wrangler/bin/wrangler.js"),
  "dev",
  "--local",
  "--host",
  host,
  "--port",
  String(port),
  "--persist-to",
  persistenceRoot,
  "--var",
  `ENVIRONMENT:${process.env.ENVIRONMENT || "production"}`,
  "--var",
  `TENANT_NAME:${process.env.TENANT_NAME || "default"}`,
  "--var",
  `MAX_ACCOUNTS:${process.env.MAX_ACCOUNTS || "40"}`,
  "--var",
  "MIGRATION_ENABLED:false",
  "--var",
  `DIRECT_NATIVE_TOOL_MODE:${process.env.DIRECT_NATIVE_TOOL_MODE || "true"}`,
  "--var",
  `ADMIN_PASSWORD_RESET_VERSION:${process.env.ADMIN_PASSWORD_RESET_VERSION || ""}`,
];

const child = spawn(executable, args, {
  cwd: projectRoot,
  env: {
    ...process.env,
    WRANGLER_HOME: wranglerHome,
    MINIFLARE_HOME: miniflareHome,
    TMPDIR: runtimeRoot,
  },
  stdio: "inherit",
  shell: false,
});

child.once("error", (error) => {
  console.error(JSON.stringify({ event: "server_start_failed", code: error.code || "SPAWN_FAILED" }));
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) console.log(JSON.stringify({ event: "server_stopped", signal }));
  process.exitCode = code ?? (signal ? 1 : 0);
});

function shutdown(signal) {
  console.log(JSON.stringify({ event: "server_shutdown", signal }));
  if (!child.killed) child.kill(signal);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
