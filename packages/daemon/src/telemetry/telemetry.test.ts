import { describe, expect, it } from 'vitest';
import { normalizeHook, normalizeCodexRecord, normalizeClaudeRecord } from './providers.js';
import { reduceSession, visibleInOffice } from './reducer.js';
import { redact } from '@agentwatch/shared';

const meta = (id: string, time = 1000) => ({ id, observedAt: time, occurredAt: time });
const hook = (event: string, extra: Record<string, unknown> = {}, time = 1000) =>
  normalizeHook('codex', { session_id: 's1', hook_event_name: event, cwd: '/work/same', ...extra }, meta(event + time, time))[0]!;

describe('session truth', () => {
  it('keeps separate sessions in the same project and idles after a turn, not ends', () => {
    let a = reduceSession(undefined, hook('SessionStart'));
    const b = reduceSession(undefined, normalizeHook('codex', { session_id: 's2', hook_event_name: 'SessionStart', cwd: '/work/same' }, meta('b'))[0]!);
    a = reduceSession(a, hook('UserPromptSubmit', { prompt: 'Fix parser', turn_id: 't1' }, 1100));
    a = reduceSession(a, hook('Stop', { turn_id: 't1' }, 1200));
    expect(a.key).toBe('codex:s1');
    expect(b.key).toBe('codex:s2');
    expect(a.lifecycle).toBe('open');
    expect(a.activity).toBe('idle');
    expect(a.task?.text).toBe('Fix parser');
  });
  it('removes a confirmed ended robot after 60 seconds while preserving its session', () => {
    const s = reduceSession(reduceSession(undefined, hook('SessionStart')), hook('SessionEnd', {}, 2000));
    expect(s.lifecycle).toBe('ended');
    expect(visibleInOffice(s, 61999)).toBe(true);
    expect(visibleInOffice(s, 62000)).toBe(false);
  });
  it('does not regress a newer turn or resurrect an ended session with a late tool event', () => {
    let s = reduceSession(undefined, hook('UserPromptSubmit', { prompt: 'New task', turn_id: 'new' }, 5000));
    s = reduceSession(s, hook('Stop', { turn_id: 'old' }, 3000));
    expect(s.activity).toBe('working');
    s = reduceSession(s, hook('SessionEnd', {}, 6000));
    s = reduceSession(s, hook('PreToolUse', { tool_name: 'Read', tool_use_id: 'late' }, 5500));
    expect(s.lifecycle).toBe('ended');
  });
  it('tracks parallel calls and does not treat a permission policy check as human attention', () => {
    let s = reduceSession(undefined, hook('SessionStart'));
    s = reduceSession(s, hook('PreToolUse', { tool_name: 'Read', tool_use_id: 'a' }, 1100));
    s = reduceSession(s, hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'b' }, 1200));
    s = reduceSession(s, hook('PermissionRequest', { tool_name: 'Bash' }, 1300));
    expect(s.requiresAttention).toBe(false);
    expect(s.activeTools.map(t => t.id)).toEqual(['a', 'b']);
    s = reduceSession(s, hook('PostToolUse', { tool_name: 'Read', tool_use_id: 'a', tool_response: 'ok' }, 1400));
    expect(s.activeTools.map(t => t.id)).toEqual(['b']);
    expect(s.activity).toBe('working');
  });
  it('resume keeps identity; a historical log alone does not prove openness', () => {
    const record = { type: 'session_meta', timestamp: '2026-10-27T10:00:00Z', payload: { id: 's1', cwd: '/work/same', originator: 'Codex Desktop', source: 'vscode', git: { branch: 'main' } } };
    let s = reduceSession(undefined, normalizeCodexRecord(record, meta('file:0'))[0]!);
    expect(s.lifecycle).toBe('unknown');
    expect(s.origin).toBe('desktop');
    s = reduceSession(s, hook('SessionStart', { source: 'resume' }, Date.parse('2026-10-27T10:01:00Z')));
    expect(s.key).toBe('codex:s1');
    expect(s.lifecycle).toBe('open');
    expect(s.gitBranch).toBe('main');
  });
  it('represents subagents inside their parent when no separate session is provided', () => {
    const e = hook('SubagentStart', { agent_id: 'child1', agent_type: 'Explore' });
    const s = reduceSession(undefined, e);
    expect(s.key).toBe('codex:s1');
    expect(s.subagents[0]).toMatchObject({ id: 'child1', type: 'Explore', activity: 'working' });
    expect(s.subagents[0]?.sessionKey).toBeUndefined();
  });
  it('ignores process exit without an exact binding and emits finite snapshot fields', () => {
    const start = hook('SessionStart');
    const s = reduceSession(reduceSession(undefined, start), { ...start, kind: 'process.exit', id: 'exit', data: {} });
    expect(s.lifecycle).toBe('open');
    const recovered = reduceSession(undefined, normalizeCodexRecord({ type: 'session_meta', payload: { id: 's1' } }, meta('meta'))[0]!);
    expect(Number.isFinite(recovered.stateAt)).toBe(true);
  });
});

describe('provider adapters and privacy', () => {
  it('correlates hook and rollout tool calls by source identifiers', () => {
    const a = hook('PreToolUse', { tool_name: 'Bash', tool_use_id: 'call1', tool_input: { command: 'ls' } });
    const b = normalizeCodexRecord({ type: 'response_item', timestamp: '2026-10-27T10:00:00Z', payload: { type: 'function_call', call_id: 'call1', name: 'exec_command', arguments: '{"cmd":"ls"}' } }, { ...meta('file:200'), sessionId: 's1' })[0]!;
    expect(a.id).toBe(b.id);
    expect(b.data.command).toBe('ls');
  });
  it('does not import system/developer instructions or reasoning', () => {
    for (const payload of [{ type: 'reasoning', summary: [{ text: 'private reasoning' }] }, { type: 'message', role: 'developer', content: [{ text: 'private instruction' }] }]) {
      expect(normalizeCodexRecord({ type: 'response_item', payload }, { ...meta('private'), sessionId: 's1' })).toEqual([]);
    }
    expect(normalizeClaudeRecord({ type: 'system', sessionId: 's1', message: { content: 'secret' } }, meta('private'))).toEqual([]);
  });
  it('masks known credentials before persistence and bounds long output', () => {
    const e = hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'a', tool_response: 'Authorization: Bearer abcdefghijklmnop\nAPI_KEY=super-secret-value\n' + 'x'.repeat(80000) });
    expect(e.data.result).not.toContain('abcdefghijklmnop');
    expect(e.data.result).not.toContain('super-secret-value');
    expect(e.data.result!.length).toBeLessThan(66000);
    expect(e.data.truncated).toBe(true);
    expect(redact('https://alice:password@example.com/repo')).not.toContain('password');
  });
  it('ignores malformed and unknown events without inventing sessions', () => {
    expect(normalizeHook('codex', { hook_event_name: 'SessionStart' }, meta('bad'))).toEqual([]);
    expect(normalizeHook('claude', { session_id: 's1', hook_event_name: 'FutureEvent' }, meta('future'))).toEqual([]);
    expect(normalizeCodexRecord({ type: 'future_record' }, meta('future'))).toEqual([]);
  });
});
