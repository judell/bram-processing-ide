// Hose: a garden hose on an outdoor faucet. Turn the faucet's handle to set
// the flow, and drag the nozzle to move and aim the stream.
//
// How it works:
//   - The faucet handle's rotation sets the flow, 0 (shut) to 1 (fully open).
//   - The water pressure in the hose follows the flow with a lag, so opening
//     the faucet builds up the stream and shutting it lets the last water
//     dribble out. Pressure sets how many droplets leave the nozzle each
//     second and how fast they leave.
//   - Each droplet is a particle: gravity bends it into a parabola, air
//     drag slows it a little, and it splashes when it hits the ground.
//   - Water that lands collects in a puddle, which dries when the water
//     stops.
// Units are pixels scaled by `s`, so the scene looks the same at any
// window size. Angles are radians (p5's default), y pointing down.
const sketch = function (p) {
  const MAX_OPEN = 3 * Math.PI;   // the handle opens fully at 1.5 turns
  const MAX_DROPS = 3000;         // particle cap, to keep the frame rate up
  let s;                          // scale: 1 at an 800-pixel-tall window
  let groundY, wallW;             // the ground line and the wall's width
  let spout, handle, handleR;     // faucet geometry (set in layout())
  let bg;                         // the static scenery, drawn once per size
  let open = 0;                   // handle rotation, 0..MAX_OPEN radians
  let pressure = 0;               // water pressure at the nozzle, 0..1
  let nozzle, aim;                // nozzle tip position and pointing angle
  let drops = [];                 // live particles: { x, y, vx, vy, splash, life }
  let emitDebt = 0;               // fractional droplets owed to the next frame
  let puddle = [], binW;          // puddle depth (0..1) per strip of ground
  let dragging = null, lastA = 0, grabDx = 0, grabDy = 0;

  p.setup = function () {
    p.createCanvas(p.windowWidth, p.windowHeight);
    layout();
  };

  // layout(): everything that depends on the window size. Runs at setup
  // and on resize; puts the nozzle back at its starting spot and clears
  // the water, since the old positions no longer fit.
  function layout() {
    s = Math.max(0.5, p.height / 800);
    groundY = p.height * 0.86;
    wallW = 70 * s;
    // The spout's outlet, where the hose screws on, and the handle above.
    spout = { x: wallW + 39 * s, y: groundY - 190 * s };
    handle = { x: wallW + 30 * s, y: groundY - 268 * s };
    handleR = 26 * s;
    nozzle = { x: p.width * 0.42, y: groundY - 130 * s };
    aim = -0.35;                  // up and to the right (negative = up)
    drops = [];
    binW = 8 * s;
    puddle = new Array(Math.ceil(p.width / binW) + 1).fill(0);
    makeBackground();
  }

  // makeBackground(): sky gradient, brick wall and lawn, drawn once into an
  // offscreen buffer, so each frame copies one image instead of redrawing
  // hundreds of shapes.
  function makeBackground() {
    if (bg) bg.remove();
    bg = p.createGraphics(p.width, p.height);
    const top = p.color(150, 200, 245), low = p.color(225, 240, 250);
    for (let y = 0; y < groundY; y++) {   // sky: one line per pixel row
      bg.stroke(p.lerpColor(top, low, y / groundY));
      bg.line(0, y, p.width, y);
    }
    bg.noStroke();
    bg.fill(95, 160, 70);                 // lawn
    bg.rect(0, groundY, p.width, p.height - groundY);
    bg.fill(80, 140, 60);                 // a darker edge where it meets the sky
    bg.rect(0, groundY, p.width, 6 * s);
    // The wall: rows of bricks, every other row offset by half a brick.
    const bh = 18 * s, bw = 40 * s;
    bg.fill(170, 85, 60);
    bg.rect(0, 0, wallW, groundY);
    bg.stroke(205, 190, 170);
    bg.strokeWeight(2 * s);
    for (let y = 0, row = 0; y < groundY; y += bh, row++) {
      bg.line(0, y, wallW, y);
      for (let x = (row % 2) * bw / 2; x < wallW; x += bw) bg.line(x, y, x, y + bh);
    }
  }

  // draw(): per frame, update the water, then paint back to front.
  p.draw = function () {
    // Seconds since the last frame, capped so a stall doesn't fling
    // droplets through the ground in one giant step.
    const dt = Math.min(p.deltaTime, 50) / 1000;
    updateWater(dt);

    p.image(bg, 0, 0);
    drawPuddle();
    drawHose();
    drawFaucet();
    drawDrops();
    drawNozzle();
    drawGauge();

    p.noStroke();
    p.fill(30, 140);
    p.textSize(13);
    p.textAlign(p.LEFT, p.BASELINE);
    p.text("Turn the red handle counterclockwise to open (or scroll on it).  " +
      "Drag the nozzle to move it; drag anywhere else to aim.", 16, p.height - 16);
  };

  // updateWater(dt): pressure, emission, motion, splashes and puddles.
  function updateWater(dt) {
    const flow = open / MAX_OPEN;
    // Pressure chases the flow exponentially: quickly as the faucet opens
    // (the hose fills), more slowly as it shuts (the hose drains).
    const rate = flow > pressure ? 6 : 2.5;
    pressure += (flow - pressure) * (1 - Math.exp(-rate * dt));
    if (pressure < 0.003) pressure = 0;

    // Emit droplets: up to 1,500 a second at full pressure. emitDebt carries
    // the fraction over, so low flows still emit an occasional drop.
    emitDebt += 1500 * pressure * dt;
    const g = p.cos(aim), h = p.sin(aim);      // unit vector along the nozzle
    // Exit speed: a weak dribble near zero, a hard jet at full pressure.
    // (Tuned so that at full flow and the starting aim, the jet still lands
    // on screen in a typical window, where the puddle can be seen.)
    const speed = (80 + 950 * pressure) * s;
    // Spread: a weak stream wobbles more than a strong one.
    const spread = 0.02 + 0.08 * (1 - pressure);
    while (emitDebt >= 1 && drops.length < MAX_DROPS) {
      emitDebt -= 1;
      const a = aim + p.random(-spread, spread);
      const v = speed * p.random(0.95, 1.05);
      // Start each drop a random fraction of this frame's travel out of the
      // tip, so drops emitted in one frame don't stack in one spot.
      const k = p.random(dt);
      drops.push({
        x: nozzle.x + g * 4 * s + p.cos(a) * v * k,
        y: nozzle.y + h * 4 * s + p.sin(a) * v * k,
        vx: p.cos(a) * v, vy: p.sin(a) * v, splash: false, life: 1,
      });
    }
    if (emitDebt > 1) emitDebt = 1;            // don't bank drops we couldn't emit

    const grav = 1400 * s;                     // pixels per second squared
    const drag = 1 - 0.15 * dt;                // a little air resistance
    const next = [];
    for (const d of drops) {
      d.vy += grav * dt;
      d.vx *= drag; d.vy *= drag;
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.splash) d.life -= dt / 0.45;       // splash spray fades in ~0.45 s
      if (d.y >= groundY) {
        // A main droplet hitting the ground throws up a little spray (two
        // or three bits, sent up and outward at a fraction of the impact
        // speed) and adds a little water to the puddle there.
        if (!d.splash) {
          const n = drops.length + next.length < MAX_DROPS ? 2 + (p.random() < 0.5) : 0;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + p.random(-1.1, 1.1);
            const v = Math.hypot(d.vx, d.vy) * p.random(0.08, 0.22);
            next.push({ x: d.x, y: groundY - 1, vx: p.cos(a) * v + d.vx * 0.2,
              vy: p.sin(a) * v, splash: true, life: 1 });
          }
          const bin = Math.floor(d.x / binW);
          if (bin >= 0 && bin < puddle.length) puddle[bin] = Math.min(1, puddle[bin] + 0.004);
        }
        continue;                              // the droplet itself is gone
      }
      // Drop anything that hits the wall, leaves the window or fades out.
      if (d.x < wallW || d.x > p.width + 20 || d.y < -p.height || d.life <= 0) continue;
      next.push(d);
    }
    drops = next;

    // The puddle spreads (each strip shares a little with its neighbors)
    // and evaporates at a steady rate.
    for (let i = 1; i < puddle.length - 1; i++) {
      const avg = (puddle[i - 1] + puddle[i + 1]) / 2;
      puddle[i] += (avg - puddle[i]) * 0.5 * dt;
    }
    for (let i = 0; i < puddle.length; i++) puddle[i] = Math.max(0, puddle[i] - 0.06 * dt);
  }

  // drawDrops(): each droplet as a short streak along its velocity, so a
  // dense stream reads as a continuous jet and fast drops look fast.
  function drawDrops() {
    for (const d of drops) {
      p.stroke(110, 170, 255, d.splash ? 160 * d.life : 150);
      p.strokeWeight(d.splash ? 1.5 * s : 2.6 * s);
      p.line(d.x, d.y, d.x - d.vx * 0.012, d.y - d.vy * 0.012);
    }
  }

  // drawPuddle(): a flat, translucent ellipse on each wet strip of ground,
  // wider and deeper where more water has collected.
  function drawPuddle() {
    p.noStroke();
    for (let i = 0; i < puddle.length; i++) {
      const lv = puddle[i];
      if (lv < 0.01) continue;
      p.fill(90, 150, 230, 140 * lv);
      p.ellipse((i + 0.5) * binW, groundY + 3 * s, binW * 3, (3 + 9 * lv) * s);
    }
  }

  // drawHose(): one cubic Bézier from the spout down to the lawn and up to
  // the nozzle's back end. The second control point sits behind the nozzle,
  // so the hose leaves it in line with the aim, but is kept above the
  // ground so the curve never dips underground. (A Bézier stays inside the
  // hull of its four points, all of which are at or above the ground.)
  function drawHose() {
    const bx = nozzle.x - p.cos(aim) * 50 * s, by = nozzle.y - p.sin(aim) * 50 * s;
    const c2x = bx - p.cos(aim) * 200 * s, c2y = Math.min(groundY - 4 * s, by - p.sin(aim) * 200 * s);
    // The hose swells a little with pressure.
    const w = (16 + 5 * pressure) * s;
    p.noFill();
    p.stroke(30, 110, 45);                     // the tube
    p.strokeWeight(w);
    p.bezier(spout.x, spout.y, spout.x, groundY, c2x, c2y, bx, by);
    p.stroke(80, 170, 90);                     // a highlight down its middle
    p.strokeWeight(w * 0.35);
    p.bezier(spout.x, spout.y, spout.x, groundY, c2x, c2y, bx, by);
  }

  // drawFaucet(): the pipe from the wall, the downturned spout, and the
  // handle on its stem. The handle's spokes turn as it opens (counter-
  // clockwise, which is a negative rotation with y pointing down).
  function drawFaucet() {
    p.noStroke();
    p.fill(150, 150, 160);
    p.rect(wallW, spout.y - 52 * s, 48 * s, 20 * s, 4 * s);        // pipe from the wall
    p.rect(spout.x - 10 * s, spout.y - 40 * s, 20 * s, 42 * s, 3 * s); // spout
    p.fill(120, 120, 130);
    p.rect(spout.x - 13 * s, spout.y - 6 * s, 26 * s, 10 * s, 2 * s);  // hose coupling
    p.stroke(120, 120, 130);
    p.strokeWeight(8 * s);
    p.line(handle.x, handle.y, handle.x, spout.y - 52 * s);          // valve stem
    p.push();
    p.translate(handle.x, handle.y);
    p.rotate(-open);
    p.stroke(175, 35, 35);
    p.strokeWeight(7 * s);
    p.noFill();
    p.circle(0, 0, handleR * 2);
    for (let i = 0; i < 4; i++) {              // four spokes
      const a = (i * Math.PI) / 2;
      p.line(0, 0, handleR * p.cos(a), handleR * p.sin(a));
    }
    p.noStroke();
    p.fill(175, 35, 35);
    p.circle(0, 0, 12 * s);
    p.pop();
  }

  // drawNozzle(): a pistol-style nozzle body and a brass tip, pointing
  // along `aim` with its tip at `nozzle`.
  function drawNozzle() {
    p.push();
    p.translate(nozzle.x, nozzle.y);
    p.rotate(aim);
    p.noStroke();
    p.fill(50, 55, 60);
    p.rect(-52 * s, -9 * s, 42 * s, 18 * s, 5 * s);
    p.fill(200, 160, 60);
    p.rect(-12 * s, -6 * s, 14 * s, 12 * s, 2 * s);
    p.pop();
  }

  // drawGauge(): the faucet's opening as a bar and a percentage, beside
  // the handle.
  function drawGauge() {
    const x = handle.x + handleR + 18 * s, y = handle.y - 6 * s, w = 90 * s, h = 10 * s;
    p.noStroke();
    p.fill(255, 200);
    p.rect(x, y, w, h, h / 2);
    p.fill(70, 140, 230);
    p.rect(x, y, w * (open / MAX_OPEN), h, h / 2);
    p.fill(30);
    p.textSize(12 * s);
    p.textAlign(p.LEFT, p.TOP);
    p.text("flow " + Math.round((100 * open) / MAX_OPEN) + "%", x, y + h + 4 * s);
  }

  // Pressing decides what a drag will do: turn the handle, move the
  // nozzle, or (anywhere else) aim the nozzle at the pointer.
  p.mousePressed = function () {
    if (p.dist(p.mouseX, p.mouseY, handle.x, handle.y) < handleR * 1.5) {
      dragging = "handle";
      lastA = Math.atan2(p.mouseY - handle.y, p.mouseX - handle.x);
    } else if (p.dist(p.mouseX, p.mouseY, nozzle.x, nozzle.y) < 50 * s) {
      dragging = "nozzle";
      grabDx = nozzle.x - p.mouseX; grabDy = nozzle.y - p.mouseY;
    } else {
      dragging = "aim";
      aimAtMouse();
    }
  };

  p.mouseDragged = function () {
    if (dragging === "handle") {
      // How far the pointer swept around the handle's center since the last
      // event, wrapped into -PI..PI so crossing the +/-PI seam doesn't jump
      // a whole turn. Counterclockwise sweeps (negative with y down) open.
      const a = Math.atan2(p.mouseY - handle.y, p.mouseX - handle.x);
      let d = a - lastA;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      open = p.constrain(open - d, 0, MAX_OPEN);
      lastA = a;
    } else if (dragging === "nozzle") {
      // Keep the nozzle clear of the wall and above the ground.
      nozzle.x = p.constrain(p.mouseX + grabDx, wallW + 60 * s, p.width - 10 * s);
      nozzle.y = p.constrain(p.mouseY + grabDy, 20 * s, groundY - 12 * s);
    } else if (dragging === "aim") {
      aimAtMouse();
    }
    return false;
  };

  p.mouseReleased = function () { dragging = null; };

  function aimAtMouse() {
    // Ignore the pointer when it's right on the tip: the angle there is noise.
    if (p.dist(p.mouseX, p.mouseY, nozzle.x, nozzle.y) > 10 * s) {
      aim = Math.atan2(p.mouseY - nozzle.y, p.mouseX - nozzle.x);
    }
  }

  // Scrolling over the handle turns it: scroll up to open, down to close.
  p.mouseWheel = function (e) {
    if (p.dist(p.mouseX, p.mouseY, handle.x, handle.y) < handleR * 2) {
      open = p.constrain(open - e.deltaY * 0.01, 0, MAX_OPEN);
      return false;
    }
  };

  p.windowResized = function () {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    layout();
  };
};

new p5(sketch);
