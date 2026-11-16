const sketch = function (p) {
  p.setup = function () {
    p.createCanvas(400, 400);
    p.noLoop();
  };

  p.draw = function () {
    p.background(220);
    p.fill(false);
    p.line(0);
    p.ellipse(200, 200, 100, 100);
  };
};

new p5(sketch);
