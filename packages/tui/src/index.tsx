import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, render, useApp, useInput, useWindowSize } from "ink";
import { TuiClient, type ConnectionOptions } from "./client.js";
import { applyPage, initialState, reduceUi } from "./state.js";
import { renderDashboard } from "./view.js";

type Options = ConnectionOptions & { ascii?: boolean; monochrome?: boolean };
function Dashboard({ options }: { options: Options }) {
  const { exit } = useApp(),
    { columns, rows } = useWindowSize();
  const [state, setState] = useState(() => ({
    ...initialState(),
    ascii: options.ascii ?? false,
    monochrome: options.monochrome ?? false,
  }));
  const client = useMemo(() => new TuiClient(options), [options]);
  useInput((input, key) => {
    const action =
      key.ctrl && input === "c"
        ? "interrupt"
        : key.escape
          ? "escape"
          : key.upArrow
            ? "up"
            : key.downArrow
              ? "down"
              : key.leftArrow
                ? "left"
                : key.rightArrow
                  ? "right"
                  : key.pageDown
                    ? "pagedown"
                    : key.pageUp
                      ? "pageup"
                      : key.return
                        ? "enter"
                        : key.tab
                          ? "tab"
                          : key.backspace || key.delete
                            ? "backspace"
                            : undefined;
    setState((current) => {
      const textAction = current.searching
        ? `text:${input}`
        : input.length === 1 || input.startsWith("/")
          ? input
          : "";
      return reduceUi({ ...current, columns, rows }, action ?? textAction);
    });
  });
  useEffect(() => {
    if (state.exit) exit();
  }, [state.exit, exit]);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false,
      lastRefresh = 0,
      scheduled: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (busy || controller.signal.aborted || Date.now() - lastRefresh < 2000)
        return;
      busy = true;
      lastRefresh = Date.now();
      try {
        const result = await client.load(
          {
            range: state.range,
            provider: state.provider,
            project: state.project,
            status: state.status,
            search: state.search,
          },
          state.pageCount,
          controller.signal,
        );
        if (!controller.signal.aborted)
          setState((current) => ({
            ...applyPage(current, result.page),
            statistics: result.statistics,
            codexLimits: result.codexLimits,
            online: true,
            error: undefined,
            loading: false,
          }));
      } catch (error) {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            online: false,
            loading: false,
            error:
              error instanceof Error ? error.message : "З’єднання втрачено",
          }));
      } finally {
        busy = false;
      }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 2000);
    void client.watch(controller.signal, () => {
      if (!scheduled)
        scheduled = setTimeout(() => {
          scheduled = undefined;
          void refresh();
        }, 250);
    });
    return () => {
      controller.abort();
      clearInterval(poll);
      if (scheduled) clearTimeout(scheduled);
    };
  }, [
    client,
    state.range,
    state.provider,
    state.project,
    state.status,
    state.search,
    state.pageCount,
  ]);
  useEffect(() => {
    const key = state.detailKey ?? state.selectedKey;
    const selected = state.agents.find((r) => r.key === key);
    if (!selected?.sessionKey) return;
    setState((current) => ({ ...current, detailError: undefined }));
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await client.details(
          selected.sessionKey!,
          controller.signal,
        );
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            detail: result.session,
            events: result.events,
            detailError: undefined,
          }));
      } catch (error) {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            detailError:
              error instanceof Error ? error.message : "Деталі недоступні",
          }));
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [
    client,
    state.detailKey,
    state.selectedKey,
    state.agents.find((r) => r.key === (state.detailKey ?? state.selectedKey))
      ?.sessionKey,
  ]);
  const frame = renderDashboard({ ...state, columns, rows });
  return (
    <Box flexDirection="column" height={rows} width={columns}>
      {frame.map((line, index) => (
        <Text
          key={index}
          wrap="truncate"
          color={state.monochrome ? undefined : line.color}
          bold={line.bold}
          inverse={line.inverse}
        >
          {line.segments
            ? line.segments.map((segment, i) => (
                <Text
                  key={i}
                  color={state.monochrome ? undefined : segment.color}
                  bold={segment.bold}
                  inverse={segment.inverse}
                >
                  {segment.text}
                </Text>
              ))
            : line.text}
        </Text>
      ))}
    </Box>
  );
}

export async function startTui(options: Options): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("TUI requires an interactive terminal");
  const app = render(<Dashboard options={options} />, {
    // stdin/stdout were checked above, so CI environment variables must not disable the TUI.
    interactive: true,
    alternateScreen: true,
    exitOnCtrlC: false,
    patchConsole: false,
    maxFps: 10,
  });
  const stop = () => app.unmount();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    await app.waitUntilExit();
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    app.unmount();
  }
}
