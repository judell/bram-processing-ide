// Freeze: click a moving ball to stop it; click it again to let it go.
const sketch = function (p) {
  const balls = [];   // where each ball is this frame: { x, y, d }
  const frozen = {};  // ball index -> { x, y } where it was frozen

  p.setup = function () {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.noStroke();
  };

  p.draw = function () {
    p.background(245);
    for (let i = 0; i < 5; i++) {
      const a = p.frameCount * 0.01 + i;
      const d = 40 + i * 10;
      const pos = frozen[i] || { x: p.width / 2 + p.cos(a) * 150, y: p.height / 2 + p.sin(a * 1.3) * 150 };
      balls[i] = { x: pos.x, y: pos.y, d: d };
      p.fill(i * 30, 150, 255 - i * 25, 90);
      p.circle(pos.x, pos.y, d);
    }
    p.fill(30);
    p.textSize(14);
    p.text(hint, 20, 30);
  };

  p.mousePressed = function () {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b && p.dist(p.mouseX, p.mouseY, b.x, b.y) < b.d / 2) {
        if (frozen[i]) delete frozen[i];
        else frozen[i] = { x: b.x, y: b.y };
        return;
      }
    }
  };

  p.windowResized = function () { p.resizeCanvas(p.windowWidth, p.windowHeight); };

  const hint = "Click a ball to freeze it; click it again to let it go.";
};

new p5(sketch);
