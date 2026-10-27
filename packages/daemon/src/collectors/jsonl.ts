import { open, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

type Cursor = {
  inode: string;
  offset: number;
  pending: Buffer;
  pendingOffset: number;
  skipping: boolean;
  checkpoint: Buffer;
};
export type LineInfo = {
  path: string;
  id: string;
  live: boolean;
  offset: number;
};

export class JsonlTailer {
  private cursors = new Map<string, Cursor>();
  private running = new Map<string, Promise<void>>();
  constructor(
    private onLine: (raw: unknown, info: LineInfo) => void,
    private onError: (message: string) => void = () => {},
    private options: { maxLineBytes?: number; bootstrapBytes?: number } = {},
  ) {}

  read(path: string, live: boolean): Promise<void> {
    const run = (this.running.get(path) ?? Promise.resolve()).then(() =>
      this.consume(path, live),
    );
    this.running.set(path, run);
    return run.finally(() => {
      if (this.running.get(path) === run) this.running.delete(path);
    });
  }
  forget(path: string): void {
    this.cursors.delete(path);
  }
  private async consume(path: string, live: boolean): Promise<void> {
    let handle;
    try {
      const st = await stat(path);
      if (!st.isFile()) return;
      const inode = `${st.dev}:${st.ino}:${st.birthtimeMs}`;
      let c = this.cursors.get(path);
      if (!c || c.inode !== inode || st.size < c.offset) {
        const start = !live
          ? Math.max(
              0,
              st.size - (this.options.bootstrapBytes ?? 2 * 1024 * 1024),
            )
          : 0;
        c = {
          inode,
          offset: start,
          pending: Buffer.alloc(0),
          pendingOffset: start,
          skipping: start > 0,
          checkpoint: Buffer.alloc(0),
        };
        this.cursors.set(path, c);
      }
      handle = await open(path, "r");
      if (c.checkpoint.length) {
        const previousTail = Buffer.alloc(c.checkpoint.length);
        await handle.read(
          previousTail,
          0,
          previousTail.length,
          c.offset - previousTail.length,
        );
        if (!previousTail.equals(c.checkpoint)) {
          c.offset = 0;
          c.pending = Buffer.alloc(0);
          c.pendingOffset = 0;
          c.skipping = false;
        }
      }
      const max = this.options.maxLineBytes ?? 2 * 1024 * 1024;
      while (c.offset < st.size) {
        const chunk = Buffer.alloc(Math.min(64 * 1024, st.size - c.offset));
        const { bytesRead } = await handle.read(
          chunk,
          0,
          chunk.length,
          c.offset,
        );
        if (!bytesRead) break;
        c.offset += bytesRead;
        let bytes = Buffer.concat([c.pending, chunk.subarray(0, bytesRead)]);
        let start = 0,
          end: number;
        while ((end = bytes.indexOf(10, start)) !== -1) {
          const line = bytes.subarray(start, end),
            offset = c.pendingOffset + start;
          if (c.skipping) c.skipping = false;
          else if (line.length > max) this.onError("JSONL line exceeds limit");
          else if (line.length) {
            try {
              const raw: unknown = JSON.parse(line.toString("utf8"));
              const hash = createHash("sha256")
                .update(path)
                .update(inode)
                .update(line)
                .digest("hex")
                .slice(0, 24);
              this.onLine(raw, {
                path,
                id: `log:${hash}:${offset}`,
                live,
                offset,
              });
            } catch {
              this.onError("Malformed JSONL line");
            }
          }
          start = end + 1;
        }
        c.pendingOffset += start;
        bytes = bytes.subarray(start);
        if (bytes.length > max) {
          c.skipping = true;
          c.pending = Buffer.alloc(0);
          c.pendingOffset = c.offset;
          this.onError("JSONL line exceeds limit");
        } else c.pending = Buffer.from(bytes);
      }
      c.checkpoint = Buffer.alloc(Math.min(64, c.offset));
      if (c.checkpoint.length)
        await handle.read(
          c.checkpoint,
          0,
          c.checkpoint.length,
          c.offset - c.checkpoint.length,
        );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        this.onError("Transcript unavailable");
    } finally {
      await handle?.close();
    }
  }
}
