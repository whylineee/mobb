import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentService } from './service.js';
import { createApp } from './server.js';
import { normalizeHook } from './telemetry/providers.js';
import { loadConfig } from './config.js';
import type { AgentEvent } from '@agentwatch/shared';

const roots: string[] = [];
const services: AgentService[] = [];
const home = () => { const p = mkdtempSync(join(tmpdir(), 'agentwatch-test-')); roots.push(p); return p; };
const make = (path = ':memory:', now = () => Date.now()) => { const s = new AgentService({ dbPath: path, now }); services.push(s); return s; };
const event = (name: string, id: string, time: number, extra: Record<string, unknown> = {}): AgentEvent => normalizeHook('codex', { session_id: 's1', hook_event_name: name, cwd: '/work/project', ...extra }, { id, observedAt: time, occurredAt: time })[0]!;
afterEach(() => { for (const s of services.splice(0)) s.close(); for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });

describe('persistent service', () => {
  it('deduplicates calls from multiple sources and pages history without duplicates', () => {
    const s = make();
    s.ingest(event('SessionStart', 'start', 1000));
    const tool = event('PreToolUse', 'tool', 1100, { tool_name: 'Read', tool_use_id: 'call1' });
    s.ingest(tool); s.ingest({ ...tool, source: 'log' });
    s.ingest(event('Stop', 'stop', 1200));
    const first = s.events('codex:s1', undefined, 2);
    expect(first.events.map(e => e.kind)).toEqual(['turn.end', 'tool.start']);
    const second = s.events('codex:s1', first.nextCursor!, 2);
    expect(second.events.map(e => e.kind)).toEqual(['session.start']);
    expect(second.nextCursor).toBeNull();
    expect(s.snapshot().revision).toBe(3);
  });
  it('persists events and revalidates openness after restart', () => {
    const db = join(home(), 'state.sqlite');
    const s = make(db); s.ingest(event('SessionStart', 'start', Date.now())); s.close();
    const restored = make(db);
    expect(restored.get('codex:s1')?.lifecycle).toBe('unknown');
    expect(restored.get('codex:s1')?.freshness).toBe('stale');
    expect(restored.events('codex:s1').events).toHaveLength(1);
    expect(statSync(db).mode & 0o777).toBe(0o600);
  });
  it('purges old finished sessions but protects open sessions and their events', () => {
    const day = 86_400_000, now = 20 * day;
    const s = make(':memory:', () => now);
    s.ingest(event('SessionStart', 'open', day));
    s.ingest({ ...event('SessionEnd', 'ended', day), sessionId: 'old', sessionKey: 'codex:old' });
    s.cleanup();
    expect(s.get('codex:s1')?.lifecycle).toBe('open');
    expect(s.events('codex:s1').events).toHaveLength(1);
    expect(s.get('codex:old')).toBeUndefined();
  });
  it('subscribes atomically before sending the snapshot and unregisters on close', () => {
    const s = make(); const received: string[] = [];
    const off = s.subscribe(m => {
      received.push(m.type);
      if (m.type === 'snapshot') s.ingest(event('SessionStart', 'start', 1000));
    });
    expect(received).toEqual(['snapshot', 'delta']);
    off(); s.ingest(event('Stop', 'end', 1100));
    expect(received).toHaveLength(2);
  });
});

describe('private local API', () => {
  const setup = () => { const config = loadConfig(home()); const service = make(); return { config, service, app: createApp({ config, service }) }; };
  it('generates stable separate credentials with private filesystem permissions', () => {
    const path = home(), c = loadConfig(path);
    expect(c.uiToken).not.toBe(c.hookToken);
    expect(c.uiToken.length).toBeGreaterThanOrEqual(43);
    expect(loadConfig(path).uiToken).toBe(c.uiToken);
    expect(statSync(path).mode & 0o777).toBe(0o700);
    expect(statSync(join(path, 'config.json')).mode & 0o777).toBe(0o600);
  });
  it('rejects unauthorized, wrong-role, wrong-host and cross-origin requests', async () => {
    const { app, config } = setup();
    const url = 'http://127.0.0.1:4317/api/state';
    expect((await app.request(url)).status).toBe(401);
    expect((await app.request(url, { headers: { Authorization: `Bearer ${config.hookToken}` } })).status).toBe(401);
    expect((await app.request('http://evil.example/api/state', { headers: { Authorization: `Bearer ${config.uiToken}` } })).status).toBe(403);
    expect((await app.request(url, { headers: { Authorization: `Bearer ${config.uiToken}`, Origin: 'https://evil.example' } })).status).toBe(403);
    const good = await app.request(url, { headers: { Authorization: `Bearer ${config.uiToken}` } });
    expect(good.status).toBe(200);
    expect(good.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('ingests validated provider hooks and only returns that session events', async () => {
    const { app, config } = setup();
    const post = await app.request('http://127.0.0.1:4317/api/hooks/codex', { method: 'POST', headers: { Authorization: `Bearer ${config.hookToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: 'hook1', occurredAt: Date.now(), payload: { session_id: 's1', hook_event_name: 'SessionStart', cwd: '/work/test' } }) });
    expect(post.status).toBe(202);
    const r = await app.request('http://127.0.0.1:4317/api/sessions/codex%3As1/events', { headers: { Authorization: `Bearer ${config.uiToken}` } });
    expect((await r.json()).events).toHaveLength(1);
    expect((await app.request('http://127.0.0.1:4317/api/sessions/no-such-session', { headers: { Authorization: `Bearer ${config.uiToken}` } })).status).toBe(404);
  });
  it('rejects malformed ingestion and invalid pagination without server errors', async () => {
    const { app, config } = setup();
    expect((await app.request('http://127.0.0.1:4317/api/hooks/codex', { method: 'POST', headers: { Authorization: `Bearer ${config.hookToken}`, 'Content-Type': 'application/json' }, body: '{broken' })).status).toBe(400);
    expect((await app.request('http://127.0.0.1:4317/api/sessions/codex%3As1/events?cursor=NaN', { headers: { Authorization: `Bearer ${config.uiToken}` } })).status).toBe(400);
  });
  it('streams an authenticated snapshot and a later delta, and closes cleanly', async () => {
    const { app, config, service } = setup();
    const controller = new AbortController();
    const r = await app.request('http://127.0.0.1:4317/api/stream', { headers: { Authorization: `Bearer ${config.uiToken}` }, signal: controller.signal });
    expect(r.headers.get('content-type')).toContain('text/event-stream');
    const reader = r.body!.getReader(), decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain('event: snapshot');
    service.ingest(event('SessionStart', 'live', 1000));
    expect(decoder.decode((await reader.read()).value)).toContain('event: delta');
    await reader.cancel(); controller.abort();
  });
});
