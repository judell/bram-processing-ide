// Gear clock: a pendulum and escapement drive a real gear train.
// The system clock is read once, in setup(), to set the hands. After that,
// each swing of the pendulum lets the escape wheel advance one step, and the
// tooth counts alone turn the hands: 15:30 to seconds, then 10:100 and 12:72
// to minutes, then 12:36 and 12:48 to hours.
// Mouse wheel: zoom toward the cursor. Space: run the train 100x fast.
const sketch = function (p) {
  const M = 4;                       // gear module: pitch radius = M * teeth / 2
  const radius = (n) => (M * n) / 2;
  let A, B, C, D, E, F;              // arbors (axles), each { x, y, angle }
  let gears, meshes, dials, pivot, bounds;
  let simT = 0, speed = 1, escape = 0;
  let fit = 1, zoom = 1, offX = 0, offY = 0;

  p.setup = function () {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.angleMode(p.DEGREES);
    build();
    setHands();
    fitView();
  };

  // A point d away from `from`, in direction phi (degrees, y down).
  function at(from, phi, d) {
    return { x: from.x + d * p.cos(phi), y: from.y + d * p.sin(phi), angle: 0 };
  }

  function build() {
    B = { x: 0, y: 0, angle: 0 };                       // seconds wheel
    A = at(B, 90, radius(15) + radius(30));             // escape wheel
    C = at(B, -30, radius(10) + radius(100));           // intermediate
    D = at(C, -150, radius(12) + radius(72));           // minute wheel
    E = at(D, 180, radius(12) + radius(36));            // intermediate
    F = at(E, 120, radius(12) + radius(48));            // hour wheel
    pivot = { x: A.x, y: A.y + radius(30) + 46 };

    gears = [
      { arbor: A, n: 30 }, { arbor: A, n: 15, pinion: true },
      { arbor: B, n: 30 }, { arbor: B, n: 10, pinion: true },
      { arbor: C, n: 100 }, { arbor: C, n: 12, pinion: true },
      { arbor: D, n: 72 }, { arbor: D, n: 12, pinion: true },
      { arbor: E, n: 36 }, { arbor: E, n: 12, pinion: true },
      { arbor: F, n: 48 },
    ];
    // Driver pinion -> driven wheel, with phi the direction between centers.
    meshes = [
      { from: A, nFrom: 15, to: B, nTo: 30, phi: -90 },
      { from: B, nFrom: 10, to: C, nTo: 100, phi: -30 },
      { from: C, nFrom: 12, to: D, nTo: 72, phi: -150 },
      { from: D, nFrom: 12, to: E, nTo: 36, phi: 180 },
      { from: E, nFrom: 12, to: F, nTo: 48, phi: 120 },
    ];
    dials = [
      { arbor: B, r: 52, marks: 60, step: 5, label: "seconds", color: [220, 70, 60], w: 2 },
      { arbor: D, r: 100, marks: 60, step: 5, label: "minutes", color: [218, 165, 32], w: 4 },
      { arbor: F, r: 80, marks: 12, step: 1, label: "hours", color: [218, 165, 32], w: 6 },
    ];

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of gears) {
      const r = radius(g.n) + M;
      x0 = Math.min(x0, g.arbor.x - r); x1 = Math.max(x1, g.arbor.x + r);
      y0 = Math.min(y0, g.arbor.y - r); y1 = Math.max(y1, g.arbor.y + r);
    }
    y1 = Math.max(y1, pivot.y + 230 + 24);
    bounds = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }

  // Each arbor's angle follows from the escape wheel through the meshes.
  // The phase term keeps a tooth of each driver in a gap of what it drives.
  function turn() {
    A.angle = -escape;
    for (const m of meshes) {
      m.to.angle = m.phi + 180 + 180 / m.nTo - (m.from.angle - m.phi) * (m.nFrom / m.nTo);
    }
  }

  // Read the clock once: fix each hand to its arbor at the right offset.
  function setHands() {
    const h = p.hour() % 12, m = p.minute(), s = p.second();
    const want = [6 * s, 6 * m + s / 10, 30 * h + m / 2 + s / 120];
    turn();
    dials.forEach((d, i) => { d.offset = want[i] - d.arbor.angle; });
  }

  function fitView() {
    fit = 0.94 * Math.min(p.width / bounds.w, p.height / bounds.h);
  }

  p.draw = function () {
    simT += (Math.min(p.deltaTime, 100) / 1000) * speed;
    const target = Math.floor(simT * 2) * 6;          // 6 degrees per half-second beat
    escape = speed > 1 ? target : p.lerp(escape, target, 0.35);
    turn();

    p.background(18);
    p.push();
    p.translate(p.width / 2 + offX, p.height / 2 + offY);
    p.scale(fit * zoom);
    p.translate(-bounds.cx, -bounds.cy);
    gears.forEach(drawGear);
    drawPendulum(speed > 1 ? 0 : 12 * p.sin(360 * simT));
    dials.forEach(drawDial);
    p.pop();

    p.noStroke();
    p.fill(200);
    p.textSize(13);
    p.textAlign(p.LEFT, p.BASELINE);
    p.text(speed > 1 ? "Space: back to normal speed (the clock now runs ahead)" :
      "Mouse wheel: zoom    Space: run 100x fast", 16, p.height - 16);
  };

  function hairline() { p.strokeWeight(1 / (fit * zoom)); }

  function drawGear(g) {
    const r = radius(g.n), outer = r + M, inner = r - 1.25 * M, pitch = 360 / g.n;
    p.push();
    p.translate(g.arbor.x, g.arbor.y);
    p.rotate(g.arbor.angle);
    p.stroke(255, g.pinion ? 130 : 80);
    hairline();
    p.fill(255, g.pinion ? 30 : 12);
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
    p.circle(0, 0, M * 3);
    if (!g.pinion) {
      p.noStroke();
      p.fill(255, 70);
      p.textSize(M * 2.2);
      p.textAlign(p.CENTER, p.CENTER);
      p.text(g.n, 0, -(inner - M * 3));
    }
    p.pop();
  }

  function drawPendulum(swing) {
    p.push();
    p.translate(pivot.x, pivot.y);
    p.rotate(swing);
    p.stroke(255, 110);
    hairline();
    p.fill(255, 20);
    // The anchor: two arms reaching up to the escape wheel's rim.
    const reach = radius(30) + M, ay = A.y - pivot.y;
    p.line(0, 0, reach * p.cos(60), ay + reach * p.sin(60));
    p.line(0, 0, reach * p.cos(120), ay + reach * p.sin(120));
    p.line(0, 0, 0, 230);
    p.circle(0, 230, 48);
    p.circle(0, 0, M * 2);
    p.pop();
  }

  function drawDial(d) {
    p.push();
    p.translate(d.arbor.x, d.arbor.y);
    p.noStroke();
    p.fill(18, 150);
    p.circle(0, 0, d.r * 2.1);
    p.stroke(255, 170);
    hairline();
    for (let i = 0; i < d.marks; i++) {
      const a = (360 * i) / d.marks, major = i % d.step === 0;
      const r0 = d.r * (major ? 0.86 : 0.93);
      p.line(r0 * p.sin(a), -r0 * p.cos(a), d.r * p.sin(a), -d.r * p.cos(a));
    }
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
    p.rotate(d.arbor.angle + d.offset);
    p.stroke(d.color[0], d.color[1], d.color[2]);
    p.strokeWeight(d.w);
    p.line(0, d.r * 0.15, 0, -d.r * 0.85);
    p.noStroke();
    p.fill(d.color[0], d.color[1], d.color[2]);
    p.circle(0, 0, d.w * 2.5);
    p.pop();
  }

  // Zoom toward the cursor: the point under the mouse stays put.
  p.mouseWheel = function (e) {
    const z = p.constrain(zoom * Math.exp(-e.deltaY * 0.0015), 1, 6);
    const mx = p.mouseX - p.width / 2, my = p.mouseY - p.height / 2;
    offX = mx - ((mx - offX) * z) / zoom;
    offY = my - ((my - offY) * z) / zoom;
    zoom = z;
    if (zoom === 1) { offX = 0; offY = 0; }
    return false;
  };

  p.keyPressed = function () {
    if (p.key === " ") { speed = speed === 1 ? 100 : 1; return false; }
  };

  p.windowResized = function () {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    fitView();
  };
};

new p5(sketch);
