import type { Session } from "@agentwatch/shared";

export function mergeDetails(summary: Session, full: Session | null): Session {
  const current =
    full &&
    full.key === summary.key &&
    (full.detailsRevision !== undefined && summary.detailsRevision !== undefined
      ? full.detailsRevision >= summary.detailsRevision
      : full.revision !== undefined && summary.revision !== undefined
        ? full.revision >= summary.revision
        : full.stateAt >= summary.stateAt &&
          full.lastObservedAt >= summary.lastObservedAt);
  const sameTask =
    full?.key === summary.key &&
    full.task &&
    full.task.updatedAt === summary.task?.updatedAt &&
    full.task.text.startsWith(summary.task.text.replace(/…$/, ""));
  return {
    ...summary,
    ...(current ? full : {}),
    revision: summary.revision,
    process: summary.process,
    task: current ? full!.task : sameTask ? full!.task : summary.task,
  };
}
