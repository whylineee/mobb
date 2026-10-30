import { build } from "esbuild";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = (entry: string, outfile: string, external = false) =>
  build({
    entryPoints: [resolve(root, entry)],
    outfile: resolve(root, outfile),
    bundle: true,
    platform: "node",
    target: "node26",
    format: "esm",
    sourcemap: true,
    ...(external ? { packages: "external" as const } : {}),
    logLevel: "warning",
  });
await bundle(
  "packages/shared/src/index.ts",
  "packages/shared/dist/index.js",
  true,
);
await bundle("packages/hook-cli/src/cli.ts", "packages/hook-cli/dist/cli.js");
await bundle("packages/daemon/src/cli.ts", "packages/daemon/dist/cli.js", true);
await bundle("packages/tui/src/index.tsx", "packages/tui/dist/index.js", true);
if (!process.argv.includes("--server-only")) {
  await new Promise<void>((ok, fail) => {
    const p = spawn("pnpm", ["--filter", "@agentwatch/web", "build"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
    p.on("error", fail);
    p.on("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`Web build failed (${code})`)),
    );
  });
}
console.log("AgentWatch build complete.");
