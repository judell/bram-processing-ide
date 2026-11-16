// Welcome sketch. Click the canvas to hide or show the message.
const sketch = function (p) {
  let showText = true;
  const message =
    "Edit the code on the right; the canvas re-runs as you type. " +
    "Try it: in the for loop, change i < 5 to i < 15. " +
    "You'll get 15 circles instead of 5, each one bigger than the last " +
    "and shifting from blue toward orange.\n\n" +
    "Pick a sketch from the menu above.\n\n" +
    "To make a new one, ask in Bram (\"make a sketch of falling snow\"). " +
    "Approve the Worklist item and it appears in the menu.\n\n" +
    "Click to hide this.";

  p.setup = function () {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.noStroke();
  };

  p.draw = function () {
    p.background(245);
    for (let i = 0; i < 5; i++) {
      const a = p.frameCount * 0.01 + i;
      p.fill(i * 30, 150, 255 - i * 25, 90);
      p.circle(p.width / 2 + p.cos(a) * 150, p.height / 2 + p.sin(a * 1.3) * 150, 40 + i * 10);
    }
    if (showText) {
      p.fill(255, 230);
      p.rect(0, 0, p.width, 200);
      p.fill(30);
      p.textSize(14);
      p.text(message, 20, 20, p.width - 40, 170);
    }
  };

  p.mousePressed = function () { showText = !showText; };
  p.windowResized = function () { p.resizeCanvas(p.windowWidth, p.windowHeight); };
};

new p5(sketch);
