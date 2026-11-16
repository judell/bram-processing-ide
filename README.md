# bram-processing-ide

A minimal XMLUI app for writing and running p5.js sketches inside Bram,
with the target app pane as the live canvas.

- `index.html` loads XMLUI from Bram's `/__vendor/` route.
- `Main.xmlui` shows `sketches/hello/` in an IFrame.
- `vendor/p5.js` is p5.js 2.4.0, unminified so the Friendly Error System
  is active. Its checksum is in `vendor/p5.js.sha256`.
- `sketches/hello/` is the test preview from the p5.js repo
  (`preview/index.html`), using the vendored build.
