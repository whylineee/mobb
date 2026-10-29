import { expect, it } from "vitest";
import type { Session } from "@agentwatch/shared";
import { officeLayout } from "./office-layout";

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
