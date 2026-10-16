/* Tragwerk — tiny SVG drawing helpers. Every function returns a markup string.
   Colours come from CSS classes (col-*) so the look is set in style.css. */
(function (APP) {
  const S = (APP.svg = {});
  const n = v => Math.round(v * 100) / 100;

  S.line = (x1, y1, x2, y2, cls, extra) => '<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '" class="' + (cls || "") + '" ' + (extra || "") + "/>";
  S.text = (x, y, s, cls, anchor) => '<text x="' + n(x) + '" y="' + n(y) + '" class="' + (cls || "lbl") + '" text-anchor="' + (anchor || "middle") + '">' + s + "</text>";
  S.circle = (x, y, r, cls, extra) => '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + r + '" class="' + (cls || "") + '" ' + (extra || "") + "/>";
  S.poly = (pts, cls, extra) => '<polygon points="' + pts.map(p => n(p[0]) + "," + n(p[1])).join(" ") + '" class="' + (cls || "") + '" ' + (extra || "") + "/>";

  /* straight arrow from (x1,y1) to the tip (x2,y2); cls is a col-* class */
  S.arrow = function (x1, y1, x2, y2, cls, w) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, h = Math.min(12, L * 0.5), hw = h * 0.42;
    const bx = x2 - ux * h, by = y2 - uy * h;
    return '<g class="' + cls + '"><line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(bx) + '" y2="' + n(by) + '" stroke-width="' + (w || 2.5) + '"/>' +
      '<polygon stroke-width="1" points="' + n(x2) + "," + n(y2) + " " + n(bx - uy * hw) + "," + n(by + ux * hw) + " " + n(bx + uy * hw) + "," + n(by - ux * hw) + '"/></g>';
  };

  /* moment arrow: arc of 240° around (cx,cy), clockwise (screen) if cw */
  S.moment = function (cx, cy, r, cw, cls) {
    const rad = d => d * Math.PI / 180, a0 = cw ? 150 : 30, a1 = cw ? 390 : -210;
    const P = a => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))], s = P(a0), e = P(a1);
    const tx = (cw ? -1 : 1) * Math.sin(rad(a1)), ty = (cw ? 1 : -1) * Math.cos(rad(a1));
    const h = 10, hw = 4.5, bx = e[0] - tx * h, by = e[1] - ty * h;
    return '<g class="' + cls + '"><path d="M' + n(s[0]) + " " + n(s[1]) + " A" + r + " " + r + " 0 1 " + (cw ? 1 : 0) + " " + n(e[0]) + " " + n(e[1]) + '" fill="none" stroke-width="2.5"/>' +
      '<polygon stroke-width="1" points="' + n(e[0]) + "," + n(e[1]) + " " + n(bx - ty * hw) + "," + n(by + tx * hw) + " " + n(bx + ty * hw) + "," + n(by - tx * hw) + '"/></g>';
  };

  /* diagonal hatch below/next to a ground line: x from x1 to x2 at height y */
  S.hatch = function (x1, x2, y, dir) {
    let s = "";
    for (let x = x1; x <= x2 + 0.1; x += 8) s += S.line(x, y, x - 7 * (dir || 1), y + 8, "hatch");
    return s;
  };

  /* nice ruler step so labels are at least ~60px apart */
  S.niceStep = function (pxPerUnit) {
    const c = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
    for (let i = 0; i < c.length; i++) if (c[i] * pxPerUnit >= 60) return c[i];
    return 100;
  };

  /* convert a mouse event to coordinates of the <svg> viewBox */
  S.point = function (svg, e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: q.x, y: q.y };
  };
})(window.APP);
