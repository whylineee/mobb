export type ProcessRow = {
  pid: number;
  ppid: number;
  startedAt: number;
  cpuPercent: number;
  memoryBytes: number;
  command: string;
};

export function parseProcessTable(output: string): Map<number, ProcessRow> {
  const result = new Map<number, ProcessRow>();
  for (const line of output.split("\n")) {
    const m = line.match(
      /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+([\d.]+)\s+(\d+)\s+(.+)$/,
    );
    if (!m) continue;
    const startedAt = Date.parse(m[3]!);
    if (!Number.isFinite(startedAt)) continue;
    result.set(Number(m[1]), {
      pid: Number(m[1]),
      ppid: Number(m[2]),
      startedAt,
      cpuPercent: Number(m[4]),
      memoryBytes: Number(m[5]) * 1024,
      command: m[6]!,
    });
  }
  return result;
}

export function exclusiveBindings(
  claims: Map<string, number>,
  table: Map<number, ProcessRow>,
): Map<string, ProcessRow> {
  const counts = new Map<number, number>();
  for (const pid of claims.values())
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  const result = new Map<string, ProcessRow>();
  for (const [key, pid] of claims) {
    const row = table.get(pid);
    if (row && counts.get(pid) === 1) result.set(key, row);
  }
  return result;
}
