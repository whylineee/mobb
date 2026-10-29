"""Real PTY acceptance: synthetic homes, two clients, resize, keys and terminal restore."""
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time
import urllib.request

node, cli, home = sys.argv[1:]
with open(os.path.join(home, "config.json")) as file:
    config = json.load(file)
base = f"http://127.0.0.1:{config['port']}"
clients = []


def resize(client, columns, rows):
    fcntl.ioctl(client[2], termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
    os.kill(client[0].pid, signal.SIGWINCH)


def launch(columns, rows):
    master, slave = pty.openpty()
    original = termios.tcgetattr(slave)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
    process = subprocess.Popen([node, cli, "tui", "--ascii", "--mono"], stdin=slave, stdout=slave, stderr=slave,
                               start_new_session=True, env={**os.environ, "AGENTWATCH_HOME": home, "TERM": "xterm-256color", "CI": "true"})
    client = [process, master, slave, original, b""]
    clients.append(client)
    return client


def wait_text(client, text, timeout=12):
    until = time.monotonic() + timeout
    needle = text.encode("utf-8")
    while time.monotonic() < until:
        if needle in client[4]:
            return
        if select.select([client[1]], [], [], 0.1)[0]:
            try:
                data = os.read(client[1], 65536)
            except OSError:
                data = b""
            client[4] += data
        if client[0].poll() is not None:
            raise AssertionError(f"TUI exited {client[0].returncode}: {client[4][-1000:]!r}")
    raise AssertionError(f"Missing {text!r}: {client[4][-1000:]!r}")


def key(client, value):
    client[4] = b""
    os.write(client[1], value)


def api(path, payload=None, hook=False):
    request = urllib.request.Request(base + path, data=json.dumps(payload).encode() if payload is not None else None,
                                     headers={"Authorization": "Bearer " + config["hookToken" if hook else "uiToken"], "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=3) as response:
        return json.load(response)


try:
    a, b = launch(120, 36), launch(80, 24)
    try:
        wait_text(a, "LIVE", timeout=30)
        wait_text(b, "LIVE", timeout=30)
    except AssertionError as error:
        log_path = os.path.join(home, "daemon.log")
        if os.path.exists(log_path):
            with open(log_path, encoding="utf-8", errors="replace") as file:
                log = file.read()[-2000:]
            log = log.replace(config["uiToken"], "[REDACTED]").replace(config["hookToken"], "[REDACTED]")
        else:
            log = "<no daemon.log>"
        raise AssertionError(f"{error}\ndaemon.log:\n{log}") from error
    for event, extra in [("UserPromptSubmit", {"prompt": "Synthetic PTY task"}),
                         ("SubagentStart", {"agent_id": "designer", "agent_type": "Designer"})]:
        api("/api/hooks/codex", {"eventId": event, "occurredAt": int(time.time()*1000),
                               "payload": {"session_id": "pty-parent", "hook_event_name": event, "cwd": "/fixtures/mobb", **extra}}, hook=True)
    key(a, b"r")
    wait_text(a, "pty-parent")
    key(a, b"?")
    wait_text(a, "Довідка")
    key(a, b"\x1b")
    wait_text(a, "Огляд")
    key(a, b"/q")
    wait_text(a, "ПОШУК > q")
    assert a[0].poll() is None, "q during search must not exit"
    key(a, b"\x1b")
    wait_text(a, "[/] Пошук:")
    key(a, b"r")
    wait_text(a, "pty-parent")
    key(a, b"\r")
    wait_text(a, "ДЕТАЛІ")
    wait_text(a, "Synthetic PTY task")
    key(a, b"\x1b")
    wait_text(a, "Огляд")
    a[4] = b""
    resize(a, 160, 36)
    wait_text(a, "ДЕТАЛІ · ВИБРАНИЙ АГЕНТ")
    wait_text(a, "ГРАФІКИ")
    wait_text(a, "Synthetic PTY task")
    a[4] = b""
    resize(a, 60, 18)
    wait_text(a, "80×24")
    a[4] = b""
    resize(a, 80, 24)
    wait_text(a, "AgentWatch / Огляд")
    key(b, b"3")
    wait_text(b, "3 Токени:")
    old_pid = int(open(os.path.join(home, "daemon.lock")).read())
    api("/api/daemon/stop", {})
    a[4] = b""
    wait_text(a, "OFFLINE")
    until = time.monotonic() + 3
    while os.path.exists(os.path.join(home, "daemon.lock")) and time.monotonic() < until:
        time.sleep(0.03)
    replacement = subprocess.Popen([node, cli, "start", "--background"], stdin=subprocess.DEVNULL,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   start_new_session=True, env={**os.environ, "AGENTWATCH_HOME": home})
    a[4] = b""
    wait_text(a, "LIVE")
    assert int(open(os.path.join(home, "daemon.lock")).read()) != old_pid
    for event, extra in [("UserPromptSubmit", {"prompt": "Resumed synthetic task"}),
                         ("SubagentStart", {"agent_id": "designer", "agent_type": "Designer"})]:
        api("/api/hooks/codex", {"eventId": "resumed-" + event, "occurredAt": int(time.time()*1000),
                               "payload": {"session_id": "pty-parent", "hook_event_name": event, "cwd": "/fixtures/mobb", **extra}}, hook=True)
    for client in [a, b]:
        key(client, b"q")
        until = time.monotonic() + 8
        # A real terminal consumes output continuously; don't deadlock on a full PTY buffer.
        while client[0].poll() is None and time.monotonic() < until:
            ready, _, _ = select.select([c[1] for c in clients], [], [], 0.1)
            for other in clients:
                if other[1] in ready:
                    other[4] += os.read(other[1], 65536)
        assert client[0].poll() is not None, f"q did not exit: {client[4][-300:]!r}"
        assert client[0].returncode == 0
        # Drain teardown: alternate screen and original line discipline must be restored.
        while select.select([client[1]], [], [], 0.1)[0]:
            client[4] += os.read(client[1], 65536)
        assert b"\x1b[?1049l" in client[4], "alternate screen not restored"
        flags = termios.ICANON | termios.ECHO
        assert termios.tcgetattr(client[2])[3] & flags == client[3][3] & flags, "raw mode not restored"
    assert api("/api/statistics")["counts"]["total"] == 2, "q stopped daemon or lost child"
    print("PTY PASS: two clients, 120x36, 80x24, resize, search, details, charts, reconnect, terminal restoration; daemon survives q")
finally:
    for process, master, slave, *_ in clients:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        os.close(master)
        os.close(slave)
    try:
        api("/api/daemon/stop", {})
    except Exception:
        pass
    if "replacement" in globals():
        try:
            replacement.wait(timeout=3)
        except subprocess.TimeoutExpired:
            replacement.terminate()
            replacement.wait(timeout=3)
