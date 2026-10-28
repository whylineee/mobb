import { MAX_HOOK_BYTES, ProviderSchema } from "@agentwatch/shared";
import { forwardHook, recordFailure } from "./forward.js";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const provider = ProviderSchema.safeParse(arg("--provider")),
  home = arg("--home");
let replied = false;
const finish = () => {
  if (!replied) {
    replied = true;
    process.stdout.write("{}\n");
  }
};
const deadline = setTimeout(() => {
  finish();
  process.exit(0);
}, 850);
deadline.unref();

try {
  if (provider.success && home) {
    const chunks: Buffer[] = [];
    let length = 0,
      oversized = false;
    for await (const chunk of process.stdin) {
      length += Buffer.byteLength(chunk);
      if (length > MAX_HOOK_BYTES) {
        oversized = true;
        chunks.length = 0;
      } else if (!oversized) chunks.push(Buffer.from(chunk));
    }
    if (oversized) recordFailure(home, provider.data, "payload_too_large");
    else {
      try {
        const payload: unknown = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        );
        if (payload && typeof payload === "object" && !Array.isArray(payload))
          await forwardHook({
            provider: provider.data,
            home,
            payload: payload as Record<string, unknown>,
          });
        else recordFailure(home, provider.data, "invalid_payload");
      } catch {
        recordFailure(home, provider.data, "invalid_payload");
      }
    }
  }
} catch {
  /* always fail open */
} finally {
  clearTimeout(deadline);
  finish();
  process.exitCode = 0;
}
