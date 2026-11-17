// Gear clock: a pendulum and escapement drive a real gear train.
// The system clock is read once, in setup(), to set the hands. After that,
// each swing of the pendulum lets the escape wheel advance one step, and the
// tooth counts alone turn the hands: 15:30 to seconds, then 10:100 and 12:72
// to minutes, then 12:36 and 12:48 to hours.
// Mouse wheel: zoom toward the cursor. Space: run the train 100x fast.
//
// How the pieces fit:
//   - An "arbor" is an axle. Every gear on an arbor turns with it, so a big
//     wheel and a small pinion on one arbor share one angle.
//   - A pinion on one arbor meshes with a wheel on the next. Meshed gears
//     turn in opposite directions, and the driven gear turns slower by the
//     ratio of their teeth (pinion teeth / wheel teeth).
//   - Only the escape wheel is moved directly (by the pendulum's beats).
//     turn() derives every other arbor's angle from it, mesh by mesh.
//   - All drawing happens in "world" units (the gears' own size, set by M),
//     and draw() scales the whole world to fit the window.
//   - Angles are in degrees (angleMode(DEGREES)) and, because the y axis
//     points down on screen, a positive angle turns clockwise.
const sketch = function (p) {
  const M = 4;                       // gear module: pitch radius = M * teeth / 2
  // Pitch radius: where two meshed gears touch. Using one module for every
  // gear means any two gears mesh when their centers are r1 + r2 apart.
  const radius = (n) => (M * n) / 2;
  let A, B, C, D, E, F;              // arbors (axles), each { x, y, angle }
  // gears: what to draw. meshes: which pinion drives which wheel.
  // dials: the three faces and their hands. pivot: the pendulum's hinge.
  // bounds: the world-space box around everything, for fitting the window.
  let gears, meshes, dials, pivot, bounds;
  // simT: simulated seconds since setup (runs 100x faster when sped up).
  // speed: 1 or 100. escape: the escape wheel's angle in degrees.
  let simT = 0, speed = 1, escape = 0;
  // fit: world-to-screen scale that fits the clock in the window.
  // zoom: the user's extra magnification (1 to 6).
  // offX, offY: screen-pixel pan, so zooming stays centered on the cursor.
  let fit = 1, zoom = 1, offX = 0, offY = 0;

  // setup(): runs once. Builds the mechanism, reads the clock to set the
  // hands, and computes the scale that fits the window. angleMode comes
  // first because build() calls p.cos() and p.sin(), which must use degrees.
  p.setup = function () {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.angleMode(p.DEGREES);
    build();
    setHands();
    fitView();
  };

  // A point d away from `from`, in direction phi (degrees, y down).
  // Used to place each arbor relative to the one that drives it, so meshed
  // gears end up exactly r1 + r2 apart. Returns a fresh arbor with angle 0.
  function at(from, phi, d) {
    return { x: from.x + d * p.cos(phi), y: from.y + d * p.sin(phi), angle: 0 };
  }

  // build(): lays out the mechanism in world units, once.
  // The seconds arbor B sits at the origin. Each other arbor is placed from
  // its neighbor along a chosen direction, at the distance that makes the
  // pinion and wheel mesh. The directions (90, -30, -150, 180, 120) are
  // only a matter of layout: they fold the train into a compact cluster.
  // Also computes `bounds`, the box that fitView() scales to the window.
  function build() {
    B = { x: 0, y: 0, angle: 0 };                       // seconds wheel
    // A sits straight below B (90 = down). Its 15-tooth pinion meshes with
    // B's 30-tooth wheel.
    A = at(B, 90, radius(15) + radius(30));             // escape wheel
    // B's 10-tooth pinion meshes with C's 100-tooth wheel, up and right.
    C = at(B, -30, radius(10) + radius(100));           // intermediate
    // C's 12-tooth pinion meshes with D's 72-tooth wheel, up and left.
    D = at(C, -150, radius(12) + radius(72));           // minute wheel
    // D's 12-tooth pinion meshes with E's 36-tooth wheel, to the left.
    E = at(D, 180, radius(12) + radius(36));            // intermediate
    // E's 12-tooth pinion meshes with F's 48-tooth wheel, down and left.
    F = at(E, 120, radius(12) + radius(48));            // hour wheel
    // The pendulum hangs from a hinge just below the escape wheel's rim.
    pivot = { x: A.x, y: A.y + radius(30) + 46 };

    // Every gear, by arbor. A "pinion" is the small driving gear on an arbor;
    // it's drawn brighter and without a tooth-count label.
    gears = [
      { arbor: A, n: 30 }, { arbor: A, n: 15, pinion: true },
      { arbor: B, n: 30 }, { arbor: B, n: 10, pinion: true },
      { arbor: C, n: 100 }, { arbor: C, n: 12, pinion: true },
      { arbor: D, n: 72 }, { arbor: D, n: 12, pinion: true },
      { arbor: E, n: 36 }, { arbor: E, n: 12, pinion: true },
      { arbor: F, n: 48 },
    ];
    // Driver pinion -> driven wheel, with phi the direction between centers.
    // The reductions multiply along the chain:
    //   A -> B: 15/30             = 1/2   (escape wheel to seconds)
    //   B -> D: 10/100 * 12/72    = 1/60  (seconds to minutes)
    //   D -> F: 12/36  * 12/48    = 1/12  (minutes to hours)
    // phi must match the direction used to place `to` in the layout above.
    meshes = [
      { from: A, nFrom: 15, to: B, nTo: 30, phi: -90 },
      { from: B, nFrom: 10, to: C, nTo: 100, phi: -30 },
      { from: C, nFrom: 12, to: D, nTo: 72, phi: -150 },
      { from: D, nFrom: 12, to: E, nTo: 36, phi: 180 },
      { from: E, nFrom: 12, to: F, nTo: 48, phi: 120 },
    ];
    // One dial per hand-carrying arbor. r: dial radius in world units.
    // marks: tick count around the rim. step: every step-th tick is long.
    // w: hand thickness. offset (set in setHands) fixes the hand to its arbor.
    dials = [
      { arbor: B, r: 52, marks: 60, step: 5, label: "seconds", color: [220, 70, 60], w: 2 },
      { arbor: D, r: 100, marks: 60, step: 5, label: "minutes", color: [218, 165, 32], w: 4 },
      { arbor: F, r: 80, marks: 12, step: 1, label: "hours", color: [218, 165, 32], w: 6 },
    ];

    // The bounding box of every gear's outer (tip) circle...
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of gears) {
      const r = radius(g.n) + M;
      x0 = Math.min(x0, g.arbor.x - r); x1 = Math.max(x1, g.arbor.x + r);
      y0 = Math.min(y0, g.arbor.y - r); y1 = Math.max(y1, g.arbor.y + r);
    }
    // ...extended down to the bottom of the pendulum bob (rod 230, bob radius 24).
    y1 = Math.max(y1, pivot.y + 230 + 24);
    bounds = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }

  // Each arbor's angle follows from the escape wheel through the meshes.
  // The phase term keeps a tooth of each driver in a gap of what it drives.
  //
  // A gear's tooth 0 points along its arbor's angle, and its other teeth
  // follow every 360/n degrees. For a driver at angle a1 and a driven gear
  // at angle a2, touching along direction phi:
  //   a2 = phi + 180 + 180/nTo - (a1 - phi) * nFrom/nTo
  //   - phi + 180: the contact point, seen from the driven gear's center.
  //   - + 180/nTo: half a tooth pitch, so the driven gear presents a gap
  //     where the driver presents a tooth (when a1 = phi).
  //   - (a1 - phi) * nFrom/nTo: how far the driver has rolled, scaled by
  //     the tooth ratio. The minus sign turns the driven gear the other way.
  // Because this holds for every a1, the teeth stay meshed at every angle.
  // The meshes are listed in drive order, so each `from` is already set.
  function turn() {
    A.angle = -escape;  // the escape wheel turns counterclockwise
    for (const m of meshes) {
      m.to.angle = m.phi + 180 + 180 / m.nTo - (m.from.angle - m.phi) * (m.nFrom / m.nTo);
    }
  }

  // Read the clock once: fix each hand to its arbor at the right offset.
  // The gear train starts in a fixed pose (escape = 0), not one derived
  // from the time. Instead each hand is clamped to its arbor at whatever
  // offset makes it read the current time, the way you set a real clock's
  // hands by turning them on their friction fit. From then on a hand's
  // angle is its arbor's angle plus that constant offset, so it keeps time
  // exactly as long as the arbor turns at the right rate.
  function setHands() {
    const h = p.hour() % 12, m = p.minute(), s = p.second();
    // Hand angles, clockwise from 12 o'clock:
    //   seconds: 6 degrees per second (360 / 60).
    //   minutes: 6 per minute, plus 6/60 per second.
    //   hours:   30 per hour (360 / 12), plus 30/60 per minute and
    //            30/3600 per second.
    const want = [6 * s, 6 * m + s / 10, 30 * h + m / 2 + s / 120];
    turn();  // arbor angles for escape = 0
    dials.forEach((d, i) => { d.offset = want[i] - d.arbor.angle; });
  }

  // fitView(): the world-to-screen scale that fits `bounds` into 94% of the
  // window, limited by whichever of width or height is tighter.
  function fitView() {
    fit = 0.94 * Math.min(p.width / bounds.w, p.height / bounds.h);
  }

  // draw(): runs every frame. Advances simulated time, steps the escape
  // wheel to match, turns the train, then draws gears, pendulum and dials
  // under the zoom/pan transform, and finally the hint in screen space.
  p.draw = function () {
    // deltaTime is milliseconds since the last frame. Clamping it to 100 ms
    // keeps a long pause (a hidden tab, say) from jumping the clock ahead.
    simT += (Math.min(p.deltaTime, 100) / 1000) * speed;
    // The pendulum beats twice a second (see drawPendulum's sin(360 * simT)),
    // and each beat releases the escape wheel by 6 degrees. Counting beats
    // from simT, not adding 6 per frame, means a dropped frame can't lose
    // or double a beat: the wheel's target is always exact.
    const target = Math.floor(simT * 2) * 6;          // 6 degrees per half-second beat
    // Ease toward the target for a visible snap at each beat. At 100x there
    // are several beats per frame, so jump straight there instead.
    escape = speed > 1 ? target : p.lerp(escape, target, 0.35);
    turn();

    p.background(18);
    p.push();
    // The view transform, read bottom-up: move the clock's center to the
    // origin, scale world units to pixels (fit, times the user's zoom), then
    // move the origin to the window's center plus the zoom pan.
    p.translate(p.width / 2 + offX, p.height / 2 + offY);
    p.scale(fit * zoom);
    p.translate(-bounds.cx, -bounds.cy);
    gears.forEach(drawGear);
    // At 100x the pendulum would swing 50 times a second and just flicker,
    // so it hangs still while the train runs fast.
    drawPendulum(speed > 1 ? 0 : 12 * p.sin(360 * simT));
    dials.forEach(drawDial);  // last, so dials and hands sit over the gears
    p.pop();

    // The hint is drawn after pop(), in plain screen pixels.
    p.noStroke();
    p.fill(200);
    p.textSize(13);
    p.textAlign(p.LEFT, p.BASELINE);
    p.text(speed > 1 ? "Space: back to normal speed (the clock now runs ahead)" :
      "Mouse wheel: zoom    Space: run 100x fast", 16, p.height - 16);
  };

  // A 1-pixel line at any zoom: the view scale would otherwise thicken
  // strokes as you zoom in, so divide it back out.
  function hairline() { p.strokeWeight(1 / (fit * zoom)); }

  // drawGear(g): one gear as an outlined toothed wheel, rotated to its
  // arbor's angle, with a hub ring and (for wheels) its tooth count.
  function drawGear(g) {
    // Standard proportions: teeth reach one module past the pitch circle
    // (the addendum) and are cut 1.25 modules below it (the dedendum), so a
    // tooth tip clears the bottom of the gap it enters. pitch is the angle
    // from one tooth to the next.
    const r = radius(g.n), outer = r + M, inner = r - 1.25 * M, pitch = 360 / g.n;
    p.push();
    p.translate(g.arbor.x, g.arbor.y);
    p.rotate(g.arbor.angle);
    p.stroke(255, g.pinion ? 130 : 80);
    hairline();
    p.fill(255, g.pinion ? 30 : 12);
    // One closed outline, four vertices per tooth: a trapezoid centered on
    // the tooth's angle a, 0.64 of a pitch wide at the root and 0.34 wide
    // at the tip. The straight runs between trapezoids are the gaps' floors.
    p.beginShape();
    for (let i = 0; i < g.n; i++) {
      const a = i * pitch;
      p.vertex(inner * p.cos(a - 0.32 * pitch), inner * p.sin(a - 0.32 * pitch));
      p.vertex(outer * p.cos(a - 0.17 * pitch), outer * p.sin(a - 0.17 * pitch));
      p.vertex(outer * p.cos(a + 0.17 * pitch), outer * p.sin(a + 0.17 * pitch));
      p.vertex(inner * p.cos(a + 0.32 * pitch), inner * p.sin(a + 0.32 * pitch));
    }
    p.endShape(p.CLOSE);
    p.noFill();
    p.circle(0, 0, M * 3);  // the hub
    // The tooth count, just inside the teeth. It rotates with the wheel.
    // Pinions are too small to label legibly.
    if (!g.pinion) {
      p.noStroke();
      p.fill(255, 70);
      p.textSize(M * 2.2);
      p.textAlign(p.CENTER, p.CENTER);
      p.text(g.n, 0, -(inner - M * 3));
    }
    p.pop();
  }

  // drawPendulum(swing): the pendulum, rotated `swing` degrees about its
  // pivot. It's drawn for show: the beat timing comes from simT in draw(),
  // and the same sin(360 * simT) makes the swing line up with the beats
  // (it crosses zero every half-second, once per beat).
  function drawPendulum(swing) {
    p.push();
    p.translate(pivot.x, pivot.y);
    p.rotate(swing);
    p.stroke(255, 110);
    hairline();
    p.fill(255, 20);
    // The anchor: two arms reaching up to the escape wheel's rim.
    // reach is the escape wheel's tip radius, and ay is the wheel's center
    // relative to the pivot (negative: above it). The arms end at the rim
    // points 60 and 120 degrees round, either side of the wheel's bottom,
    // and they rock with the pendulum the way a real anchor's pallets do.
    const reach = radius(30) + M, ay = A.y - pivot.y;
    p.line(0, 0, reach * p.cos(60), ay + reach * p.sin(60));
    p.line(0, 0, reach * p.cos(120), ay + reach * p.sin(120));
    p.line(0, 0, 0, 230);      // the rod
    p.circle(0, 230, 48);      // the bob
    p.circle(0, 0, M * 2);     // the pivot
    p.pop();
  }

  // drawDial(d): one dial centered on a hand-carrying arbor: a dark,
  // translucent face, tick marks, numbers, a label, then the hand.
  function drawDial(d) {
    p.push();
    p.translate(d.arbor.x, d.arbor.y);
    // The face dims the gears behind it so the hand reads clearly.
    p.noStroke();
    p.fill(18, 150);
    p.circle(0, 0, d.r * 2.1);
    p.stroke(255, 170);
    hairline();
    // Tick marks run clockwise from 12 o'clock: (sin a, -cos a) is the unit
    // vector at angle a measured that way. Major ticks are longer.
    for (let i = 0; i < d.marks; i++) {
      const a = (360 * i) / d.marks, major = i % d.step === 0;
      const r0 = d.r * (major ? 0.86 : 0.93);
      p.line(r0 * p.sin(a), -r0 * p.cos(a), d.r * p.sin(a), -d.r * p.cos(a));
    }
    // Twelve numbers at 30-degree steps: 1-12 on the hours dial,
    // 5-60 on the seconds and minutes dials.
    p.noStroke();
    p.fill(255, 200);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(d.r * 0.13);
    for (let k = 1; k <= 12; k++) {
      const a = k * 30, rr = d.r * 0.72;
      p.text(d.step === 1 ? k : k * 5, rr * p.sin(a), -rr * p.cos(a));
    }
    p.fill(255, 90);
    p.textSize(d.r * 0.1);
    p.text(d.label, 0, d.r * 0.4);
    // The hand: the arbor's angle plus the offset setHands() fixed. Drawn
    // pointing up (negative y) before rotation, so angle 0 is 12 o'clock.
    // It overhangs the center slightly (0.15 r) like a real hand's tail.
    p.rotate(d.arbor.angle + d.offset);
    p.stroke(d.color[0], d.color[1], d.color[2]);
    p.strokeWeight(d.w);
    p.line(0, d.r * 0.15, 0, -d.r * 0.85);
    p.noStroke();
    p.fill(d.color[0], d.color[1], d.color[2]);
    p.circle(0, 0, d.w * 2.5);  // the hand's center cap
    p.pop();
  }

  // Zoom toward the cursor: the point under the mouse stays put.
  // Measured from the window's center, the mouse sits at (mx, my), and the
  // world point under it is (mx - offX) / (fit * zoom) (plus the bounds
  // center). Keeping that world point under the mouse at the new zoom z
  // requires mx - offX' = (mx - offX) * z / zoom, which gives the pan below.
  p.mouseWheel = function (e) {
    // Exponential steps make zooming feel even at every level. Scrolling
    // down (positive deltaY) zooms out; 1 is the fitted view, 6 the closest.
    const z = p.constrain(zoom * Math.exp(-e.deltaY * 0.0015), 1, 6);
    const mx = p.mouseX - p.width / 2, my = p.mouseY - p.height / 2;
    offX = mx - ((mx - offX) * z) / zoom;
    offY = my - ((my - offY) * z) / zoom;
    zoom = z;
    // Fully zoomed out, recenter: otherwise leftover pan could push the
    // clock partly off screen.
    if (zoom === 1) { offX = 0; offY = 0; }
    return false;  // keep the page from scrolling too
  };

  // Space toggles 1x and 100x. The simulated time keeps what it gained, so
  // after a fast run the clock reads ahead of real time (the hint says so).
  // Returning false keeps Space from scrolling the page.
  p.keyPressed = function () {
    if (p.key === " ") { speed = speed === 1 ? 100 : 1; return false; }
  };

  // Resize the canvas with the window and refit the clock to it.
  p.windowResized = function () {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    fitView();
  };
};

new p5(sketch);
