# bram-processing-ide

A minimal XMLUI app for writing and running p5.js sketches with Bram.
Open it from Bram's server in a browser: the sketch runs on the left, its
`sketch.js` is editable on the right, and errors show below the code.

- `index.html` loads XMLUI from Bram's `/__vendor/` route, and holds the
  page-side helpers (sync with the sketch helper, line numbers, the
  sketch frame with its error capture).
- `Main.xmlui` is the IDE: header, sketch frame, editor, error list.
- `vendor/p5.js` is p5.js 2.4.0, unminified so the Friendly Error System
  is active. Its checksum is in `vendor/p5.js.sha256`.
- `sketches/<name>/` holds one sketch: `sketch.js`, plus an `index.html`
  that runs it on its own.

## The sketch helper

`sketches/<name>/sketch.js` is the single copy of each sketch. Start the
helper from the repo root so editor edits save to it and outside changes
(the agent's) appear in the editor:

```
python3 tools/sketch_server.py
```

It uses only the Python standard library, listens on
`http://127.0.0.1:55399` (`PORT=` to change), and accepts requests only
from loopback pages. Without it, edits still run but aren't saved; the
header says so.
