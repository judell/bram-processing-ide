#!/usr/bin/env python3
"""Save-and-push helper for the Processing IDE editor.

Makes sketches/<name>/sketch.js the single copy of each sketch:

  POST /save    {"name": "...", "code": "..."}  writes sketches/<name>/sketch.js
  GET  /events  Server-Sent Events: {"name", "code"} whenever a sketch.js
                changes on disk from outside this server (e.g. the agent)
  GET  /health  "ok"

Standard library only. Binds 127.0.0.1. Accepts browser requests only from
loopback origins (http://127.0.0.1:* or http://localhost:*).

Run from the repo root:  python3 tools/sketch_server.py   (PORT=55399 default)
"""

import json
import os
import queue
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKETCHES = ROOT / "sketches"
PORT = int(os.environ.get("PORT", "55399"))
POLL_SECONDS = 0.25
NAME_RE = re.compile(r"^[a-z0-9_-]+$")
ORIGIN_RE = re.compile(r"^http://(127\.0\.0\.1|localhost)(:\d+)?$")

lock = threading.Lock()
mtimes = {}        # name -> last seen mtime_ns of sketch.js
last_written = {}  # name -> code this server last wrote (not echoed back)
clients = set()    # one queue.Queue per open /events stream


def log(event, **fields):
    parts = " ".join(f"{k}={v}" for k, v in fields.items())
    print(f"[sketch-server] event={event} {parts}".rstrip(), file=sys.stderr, flush=True)


def sketch_file(name):
    return SKETCHES / name / "sketch.js"


def scan():
    """Return {name: mtime_ns} for every sketches/*/sketch.js."""
    found = {}
    for path in SKETCHES.glob("*/sketch.js"):
        try:
            found[path.parent.name] = path.stat().st_mtime_ns
        except FileNotFoundError:
            pass
    return found


def broadcast(payload):
    data = json.dumps(payload)
    with lock:
        targets = list(clients)
    for q in targets:
        q.put(data)


def watch():
    with lock:
        mtimes.update(scan())
    while True:
        time.sleep(POLL_SECONDS)
        for name, mtime in scan().items():
            with lock:
                if mtimes.get(name) == mtime:
                    continue
                mtimes[name] = mtime
            try:
                code = sketch_file(name).read_text(encoding="utf-8")
            except OSError as e:
                log("read-failed", name=name, error=repr(e))
                continue
            with lock:
                own = last_written.get(name) == code
            if own:
                continue
            log("push", name=name, bytes=len(code.encode("utf-8")), clients=len(clients))
            broadcast({"name": name, "code": code})


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quiet default access log
        pass

    def cors(self):
        origin = self.headers.get("Origin", "")
        if ORIGIN_RE.match(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def reply(self, status, body, ctype="application/json"):
        data = body.encode("utf-8")
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def origin_ok(self):
        origin = self.headers.get("Origin")
        return origin is None or bool(ORIGIN_RE.match(origin))

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if not self.origin_ok():
            return self.reply(403, '{"error":"origin"}')
        if self.path == "/health":
            return self.reply(200, "ok", "text/plain")
        if self.path == "/events":
            return self.events()
        self.reply(404, '{"error":"not found"}')

    def events(self):
        self.send_response(200)
        self.cors()
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        q = queue.Queue()
        with lock:
            clients.add(q)
        log("subscribe", clients=len(clients))
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while True:
                try:
                    data = q.get(timeout=15)
                    self.wfile.write(f"data: {data}\n\n".encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            with lock:
                clients.discard(q)
            log("unsubscribe", clients=len(clients))

    def do_POST(self):
        if not self.origin_ok():
            return self.reply(403, '{"error":"origin"}')
        if self.path != "/save":
            return self.reply(404, '{"error":"not found"}')
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            name, code = body.get("name"), body.get("code")
        except (ValueError, AttributeError):
            return self.reply(400, '{"error":"bad json"}')
        if not isinstance(name, str) or not NAME_RE.match(name) or not (SKETCHES / name).is_dir():
            return self.reply(400, '{"error":"bad name"}')
        if not isinstance(code, str):
            return self.reply(400, '{"error":"bad code"}')
        path = sketch_file(name)
        tmp = path.with_suffix(".js.tmp")
        with lock:
            last_written[name] = code
            tmp.write_text(code, encoding="utf-8")
            os.replace(tmp, path)
        log("save", name=name, bytes=len(code.encode("utf-8")))
        self.reply(200, '{"ok":true}')


def main():
    threading.Thread(target=watch, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    log("listening", url=f"http://127.0.0.1:{PORT}", sketches=SKETCHES)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
