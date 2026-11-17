#!/bin/sh
# Start the sketch helper (tools/sketch_server.py), detached, logging to
# sketch_server.log. Bram runs this script at each launch, through
# .bram.json "launch": {"run": "./start.sh"} (once you allow it on this
# computer). It isn't a "server" entry: the editor page comes from Bram's own
# server, and the helper is only a side channel for saving and watching
# sketches. Running this again is harmless: it reuses a running helper.
#
#   ./start.sh            start it, or say it's running (and whether it's
#                         running code older than the file on disk)
#   ./start.sh --restart  stop it and start it again
#
# The port is fixed at 55399 because index.html has it hardcoded. Only this
# checkout's sketch_server.py is ever stopped. Modeled on bram-studio's
# start.sh.
cd "$(dirname "$0")" || exit 1
DIR=$(pwd)
SCRIPT=tools/sketch_server.py
PORT=55399
URL=http://127.0.0.1:$PORT

# Without Apple's Command Line Tools, /usr/bin/python3 is a stub that opens a
# macOS install dialog instead of running, so say so plainly first.
if [ "$(uname)" = Darwin ] && ! xcode-select -p >/dev/null 2>&1; then
  echo "The sketch helper needs Apple's Command Line Tools (for python3)." >&2
  echo "Install them with: xcode-select --install" >&2
  exit 1
fi

listener() { lsof -nP -t -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | head -1; }

ours() {
  # This checkout's sketch_server.py: by absolute path, or by relative path
  # when run from this folder.
  cmd=$(ps -o command= -p "$1")
  case "$cmd" in
    *"$DIR/$SCRIPT"*) return 0 ;;
    *sketch_server.py*)
      cwd=$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
      [ "$cwd" = "$DIR" ] && return 0 ;;
  esac
  return 1
}

lstart() { ps -o lstart= -p "$1" | sed 's/ *$//'; }
started() { date -j -f "%a %b %d %T %Y" "$(lstart "$1")" +%s; }

start() {
  nohup python3 "$SCRIPT" >> sketch_server.log 2>&1 < /dev/null &
  i=0
  while [ $i -lt 30 ]; do
    if curl -s -o /dev/null "$URL/health"; then
      echo "The sketch helper is running on port $PORT (PID $(listener)), logging to sketch_server.log."
      return 0
    fi
    sleep 0.5; i=$((i + 1))
  done
  echo "The sketch helper didn't answer within 15 s; see the end of sketch_server.log." >&2
  return 1
}

pid=$(listener)
if [ -z "$pid" ]; then
  start; exit $?
fi

if ! ours "$pid"; then
  echo "Port $PORT is held by something else (PID $pid):" >&2
  ps -o command= -p "$pid" >&2
  echo "The editor expects the helper there; stop that process and run ./start.sh again." >&2
  exit 1
fi

if [ "$1" != "--restart" ]; then
  echo "The sketch helper is already running on port $PORT (PID $pid, since $(lstart "$pid"))."
  if [ "$(stat -f %m "$SCRIPT")" -gt "$(started "$pid")" ]; then
    echo "$SCRIPT changed after it started, so it's running older code: ./start.sh --restart"
  fi
  exit 0
fi

kill "$pid"
i=0
while [ -n "$(listener)" ] && [ $i -lt 40 ]; do sleep 0.25; i=$((i + 1)); done
if [ -n "$(listener)" ]; then
  echo "The old helper (PID $pid) didn't stop; not starting another." >&2
  exit 1
fi
start
