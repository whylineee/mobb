import type { Session } from "@agentwatch/shared";
import type { Seat } from "../components/office/primitives";
import { OFFICE_SEATS } from "./office-space";

// Group by the known project location; sessions without one share their named project.
export function officeLayout(
  sessions: Session[],
  previousSeats: ReadonlyMap<string, Seat> = new Map(),
) {
  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = session.cwd || session.project;
    const group = groups.get(key) ?? [];
    group.push(session);
    groups.set(key, group);
  }
  const seats = new Map<string, Seat>();
  const zones: { key: string; project: string; seat: Seat }[] = [];
  const currentKeys = new Set(sessions.map((session) => session.key));
  const occupied = new Set<Seat>();
  for (const [key, seat] of previousSeats) {
    if (
      currentKeys.has(key) &&
      OFFICE_SEATS.includes(seat) &&
      !occupied.has(seat)
    ) {
      seats.set(key, seat);
      occupied.add(seat);
    }
  }
  const available = OFFICE_SEATS.filter((seat) => !occupied.has(seat));
  for (const [key, group] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    group.sort((a, b) => a.key.localeCompare(b.key));
    for (const session of group) {
      if (seats.has(session.key)) continue;
      const seat = available.shift();
      if (!seat) break;
      seats.set(session.key, seat);
    }
    const seat = group.map((session) => seats.get(session.key)).find(Boolean);
    if (seat) zones.push({ key, project: group[0]!.project, seat });
  }
  const byKey = new Map(sessions.map((session) => [session.key, session]));
  const parents = new Map<string, string>();
  for (const child of sessions) {
    if (
      child.parentSessionKey &&
      seats.has(child.parentSessionKey) &&
      child.parentSessionKey !== child.key
    )
      parents.set(child.key, child.parentSessionKey);
  }
  for (const parent of sessions) {
    for (const child of parent.subagents) {
      const key = child.sessionKey;
      if (
        child.lifecycle !== "open" ||
        !key ||
        key === parent.key ||
        !byKey.has(key)
      )
        continue;
      const declaredParent = byKey.get(key)?.parentSessionKey;
      if (declaredParent && declaredParent !== parent.key) continue;
      // Do not choose arbitrarily if two parents claim the same child.
      if (parents.has(key) && parents.get(key) !== parent.key) {
        parents.set(key, "");
      } else if (!parents.has(key)) {
        parents.set(key, parent.key);
      }
    }
  }
  const links = [...parents].flatMap(([key, parentKey]) => {
    const parent = seats.get(parentKey),
      child = seats.get(key);
    return parent && child ? [{ key, parent, child }] : [];
  });
  return { seats, zones, links, overflow: sessions.length - seats.size };
}
