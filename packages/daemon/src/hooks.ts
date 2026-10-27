import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import Database from "better-sqlite3";
import { dirname, join } from "node:path";
import type { Provider, RuntimeConfig } from "@agentwatch/shared";
import { writePrivateJson } from "./config.js";

type Handler = Record<string, unknown>;
type Group = { matcher?: string; hooks: Handler[]; [key: string]: unknown };
type Settings = { hooks?: Record<string, Group[]>; [key: string]: unknown };
type Options = {
  provider: Provider;
  configPath: string;
  home: string;
  hookCliPath: string;
  nodePath: string;
  config: RuntimeConfig;
};
type Manifest = { signatures: string[] };
const signature = (h: Handler) =>
  JSON.stringify({ type: h.type, command: h.command, args: h.args });
const shellQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
const events = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
  "SubagentStart",
  "SubagentStop",
];

function readSettings(path: string): { raw: string; settings: Settings } {
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
  const settings: unknown = raw ? JSON.parse(raw) : {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    throw new Error(`Invalid configuration: ${path}`);
  const s = settings as Settings;
  if (
    s.hooks !== undefined &&
    (!s.hooks || typeof s.hooks !== "object" || Array.isArray(s.hooks))
  )
    throw new Error(`Invalid hooks: ${path}`);
  for (const groups of Object.values(s.hooks ?? {})) {
    if (
      !Array.isArray(groups) ||
      groups.some((g) => !g || !Array.isArray(g.hooks))
    )
      throw new Error(`Invalid hook groups: ${path}`);
  }
  return { raw, settings: s };
}

function removeOwned(settings: Settings, signatures: string[]): void {
  if (!settings.hooks) return;
  for (const [name, groups] of Object.entries(settings.hooks)) {
    const next = groups
      .map((g) => ({
        ...g,
        hooks: g.hooks.filter((h) => !signatures.includes(signature(h))),
      }))
      .filter((g) => g.hooks.length);
    if (next.length) settings.hooks[name] = next;
    else delete settings.hooks[name];
  }
}

function update(path: string, before: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.agentwatch-${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(settings, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (current !== before) {
    unlinkSync(temp);
    throw new Error(
      `Configuration changed during update: ${path}. Retry setup.`,
    );
  }
  renameSync(temp, path);
}

function manifestPath(o: Options): string {
  return join(o.home, `hooks-${o.provider}.json`);
}
function previousSignatures(o: Options): string[] {
  if (!existsSync(manifestPath(o))) return [];
  return (JSON.parse(readFileSync(manifestPath(o), "utf8")) as Manifest)
    .signatures;
}

function withConfigurationLock(o: Options, operation: () => void): void {
  mkdirSync(dirname(o.configPath), { recursive: true, mode: 0o700 });
  const lockPath = o.configPath + ".agentwatch-lock.sqlite";
  const db = new Database(lockPath);
  chmodSync(lockPath, 0o600);
  db.pragma("busy_timeout = 5000");
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      operation();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

export async function installHooks(o: Options): Promise<void> {
  withConfigurationLock(o, () => installUnderLock(o));
}
function installUnderLock(o: Options): void {
  const { raw, settings } = readSettings(o.configPath),
    old = previousSignatures(o);
  removeOwned(settings, old);
  settings.hooks ??= {};
  const args = [o.hookCliPath, "--provider", o.provider, "--home", o.home];
  const base: Handler =
    o.provider === "claude"
      ? { type: "command", command: o.nodePath, args, timeout: 1 }
      : {
          type: "command",
          command: [o.nodePath, ...args].map(shellQuote).join(" "),
          timeout: 1,
        };
  const signatures = new Set<string>();
  const names = [
    ...events,
    ...(o.provider === "claude"
      ? ["PostToolUseFailure", "Notification", "StopFailure"]
      : ["Interrupt"]),
  ];
  for (const name of names) {
    const h = { ...base, ...(name !== "SessionEnd" ? { async: true } : {}) };
    signatures.add(signature(h));
    (settings.hooks[name] ??= []).push({ matcher: ".*", hooks: [h] });
  }
  if (raw) {
    const digest = createHash("sha256").update(raw).digest("hex").slice(0, 12);
    const backup = join(o.home, "backups", `${o.provider}-${digest}.json`);
    if (!existsSync(backup)) writePrivateJson(backup, JSON.parse(raw));
  }
  // Persist ownership before changing the agent file: a crash cannot leave hooks
  // that a subsequent uninstall cannot recognize.
  writePrivateJson(manifestPath(o), {
    signatures: [...new Set([...old, ...signatures])],
    configPath: o.configPath,
  });
  update(o.configPath, raw, settings);
}

export async function uninstallHooks(o: Options): Promise<void> {
  withConfigurationLock(o, () => uninstallUnderLock(o));
}
function uninstallUnderLock(o: Options): void {
  const signatures = previousSignatures(o);
  if (!signatures.length || !existsSync(o.configPath)) return;
  const { raw, settings } = readSettings(o.configPath);
  removeOwned(settings, signatures);
  update(o.configPath, raw, settings);
  unlinkSync(manifestPath(o));
}
