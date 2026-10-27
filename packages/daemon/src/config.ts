import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DEFAULT_PORT, type RuntimeConfig } from '@agentwatch/shared';

export function agentwatchHome(): string { return resolve(process.env.AGENTWATCH_HOME ?? join(homedir(), '.agentwatch')); }
export function writePrivateJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
  chmodSync(path, 0o600);
}

export function loadConfig(home = agentwatchHome()): RuntimeConfig {
  mkdirSync(home, { recursive: true, mode: 0o700 }); chmodSync(home, 0o700);
  const file = join(home, 'config.json');
  if (existsSync(file)) {
    const c = JSON.parse(readFileSync(file, 'utf8')) as RuntimeConfig;
    if (c.version !== 1 || !Number.isInteger(c.port) || c.port < 1024 || c.port > 65535 || typeof c.uiToken !== 'string' || c.uiToken.length < 43 || typeof c.hookToken !== 'string' || c.hookToken.length < 43 || c.uiToken === c.hookToken || typeof c.codexHome !== 'string' || typeof c.claudeHome !== 'string') throw new Error(`Invalid AgentWatch configuration: ${file}`);
    chmodSync(file, 0o600); return c;
  }
  const c: RuntimeConfig = { version: 1, port: DEFAULT_PORT, uiToken: randomBytes(32).toString('base64url'), hookToken: randomBytes(32).toString('base64url'), codexHome: resolve(process.env.CODEX_HOME ?? join(homedir(), '.codex')), claudeHome: resolve(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')) };
  writePrivateJson(file, c); return c;
}
