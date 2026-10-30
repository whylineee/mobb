import { expect, it } from "vitest";
import type { Session } from "@agentwatch/shared";
import { officeLayout } from "./office-layout";
import { OFFICE_SEATS } from "./office-space";

function session(
  key: string,
  project: string,
  extra: Partial<Session> = {},
): Session {
  return {
    key,
    sessionId: key,
    provider: "codex",
    project,
    origin: "cli",
    lifecycle: "open",
    activity: "working",
    freshness: "fresh",
    requiresAttention: false,
    stateAt: 1,
    lastActivityAt: 1,
    lastObservedAt: 1,
    activeTools: [],
    subagents: [],
    sources: [],
    ...extra,
  };
}
it("groups project seats deterministically and links only visible confirmed parents", () => {
  const data = [
    session("b", "Beta"),
    session("a2", "Alpha", { parentSessionKey: "a1" }),
    session("a1", "Alpha"),
    session("a3", "Alpha", { parentSessionKey: "missing" }),
  ];
  const layout = officeLayout(data);
  expect(layout.zones.map((zone) => zone.project)).toEqual(["Alpha", "Beta"]);
  expect([...layout.seats.keys()]).toEqual(["a1", "a2", "a3", "b"]);
  expect(layout.links).toEqual([
    {
      key: "a2",
      parent: layout.seats.get("a1"),
      child: layout.seats.get("a2"),
    },
  ]);
  expect([...officeLayout([...data].reverse()).seats]).toEqual([
    ...layout.seats,
  ]);
  expect(officeLayout(data.filter((s) => s.key !== "a1")).links).toEqual([]);
});
it("separates projects with matching names and different known directories", () => {
  expect(
    officeLayout([
      session("a", "app", { cwd: "/one/app" }),
      session("b", "app", { cwd: "/two/app" }),
    ]).zones,
  ).toHaveLength(2);
});

it("uses explicit live child-session links and ignores ambiguous or ended links", () => {
  const child = session("child", "Alpha");
  const parent = session("parent", "Alpha", {
    subagents: [
      {
        id: "one",
        sessionKey: "child",
        lifecycle: "open",
        activity: "working",
      },
    ],
  });
  expect(officeLayout([parent, child]).links.map((link) => link.key)).toEqual([
    "child",
  ]);
  const other = session("other", "Alpha", { subagents: parent.subagents });
  expect(officeLayout([parent, other, child]).links).toEqual([]);
  expect(
    officeLayout([
      {
        ...parent,
        subagents: [{ ...parent.subagents[0]!, lifecycle: "ended" }],
      },
      child,
    ]).links,
  ).toEqual([]);
});

it.each([0, 1, 7, 14, 20])(
  "keeps fourteen fixed desks with %s sessions",
  (count) => {
    const data = Array.from({ length: count }, (_, i) =>
      session(`agent-${i}`, "Alpha"),
    );
    const layout = officeLayout(data);
    expect(OFFICE_SEATS).toHaveLength(14);
    expect(layout.seats.size).toBe(Math.min(count, 14));
    expect(layout.overflow).toBe(Math.max(0, count - 14));
    expect(new Set(layout.seats.values()).size).toBe(layout.seats.size);
    for (const seat of layout.seats.values())
      expect(OFFICE_SEATS).toContain(seat);
  },
);

it("preserves occupied seats across arrivals, departures and project changes", () => {
  const original = [session("b", "Beta"), session("c", "Gamma")];
  const first = officeLayout(original);
  const next = officeLayout([session("a", "Alpha"), ...original], first.seats);
  expect(next.seats.get("b")).toBe(first.seats.get("b"));
  expect(next.seats.get("c")).toBe(first.seats.get("c"));
  const afterDeparture = officeLayout(
    [session("c", "Renamed"), session("a", "Alpha"), session("d", "Delta")],
    next.seats,
  );
  expect(afterDeparture.seats.get("c")).toBe(first.seats.get("c"));
  expect(afterDeparture.seats.get("a")).toBe(next.seats.get("a"));
  expect(afterDeparture.seats.get("d")).toBe(first.seats.get("b"));
});

it("fills a released seat from overflow without displacing existing agents", () => {
  const data = Array.from({ length: 15 }, (_, i) =>
    session(`agent-${String(i).padStart(2, "0")}`, "Alpha"),
  );
  const full = officeLayout(data);
  expect(full.seats.has("agent-14")).toBe(false);
  const next = officeLayout(data.slice(1), full.seats);
  expect(next.overflow).toBe(0);
  expect(next.seats.get("agent-14")).toBe(full.seats.get("agent-00"));
  for (const s of data.slice(1, 14))
    expect(next.seats.get(s.key)).toBe(full.seats.get(s.key));
});
