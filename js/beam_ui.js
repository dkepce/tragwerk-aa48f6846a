/* Tragwerk — Träger screen: drawing, diagrams, tables, mouse handling.
   app.js calls these functions (APP.typeUI.beam) and owns the toolbar, selection (APP.ed) and saving. */
(function (APP) {
  const U = APP.U, S = APP.svg, B = APP.beam, f = U.fmt;
  const W = 1000, PAD = 70, YB = 120, H = 275, RULER = 262 - 0;
  const ui = ((APP.typeUI = APP.typeUI || {}).beam = {});

  ui.tools = [["select", "Auswahl"], ["fest", "Festlager"], ["los", "Loslager"], ["einsp", "Einspannung"], ["hinge", "Gelenk"], ["F", "Einzellast"], ["q", "Streckenlast"], ["M", "Moment"], ["cut", "Schnitt"]];
  ui.hints = {
    select: "Auswahl: Elemente anklicken und mit der Maus verschieben (Zahlen kannst du rechts in der Tabelle eingeben). Entf löscht.",
    fest: "Festlager: auf den Träger klicken, wo es stehen soll.", los: "Loslager: auf den Träger klicken.", einsp: "Einspannung: auf den Träger klicken (meist am Trägerende).",
    hinge: "Gelenk: auf den Träger klicken (für Gerberträger).", F: "Einzellast: auf den Träger klicken. Größe danach rechts in der Tabelle.",
    q: "Streckenlast: erst den Anfang, dann das Ende anklicken.", M: "Moment: auf den Träger klicken.",
    cut: "Schnitt: auf den Träger klicken. Im Tab Rechenweg werden N, Q und M an dieser Stelle mit Skizze und Rechnung gezeigt."
  };
  ui.viewBox = () => "0 0 " + W + " " + H;
  const geom = sys => { const sc = (W - 2 * PAD) / sys.L; return { sc, X: x => PAD + x * sc }; };
  const plain = s => String(s).replace(/<sub>(.*?)<\/sub>/g, "$1");

  /* ---------- header parameters ---------- */
  const opt = (v, cur, txt) => '<option value="' + v + '"' + (cur === v ? " selected" : "") + ">" + txt + "</option>";
  ui.params = sys => '<label>Gestrichelte Faser <select data-p="fibre" title="Auf dieser Seite liegt die gestrichelte Faser; M ist positiv bei Zug dort">' + opt("unten", sys.fibre, "unten") + opt("oben", sys.fibre, "oben") + "</select></label>" +
    '<label>x von <select data-p="xdir" title="Von welchem Trägerende x gemessen wird">' + opt("links", sys.xdir, "links") + opt("rechts", sys.xdir, "rechts") + "</select></label>" +
    '<label>Länge L <input type="text" inputmode="decimal" data-p="L" value="' + U.show(sys.L) + '"> m</label>' +
    '<label>Raster <select data-p="snap">' + [0.1, 0.25, 0.5, 1].map(v => '<option value="' + v + '"' + (sys.snap === v ? " selected" : "") + ">" + U.show(v) + " m</option>").join("") + "</select></label>";
  ui.setParam = function (sys, name, raw) {
    if (name === "fibre") { sys.fibre = raw === "oben" ? "oben" : "unten"; return; }
    if (name === "xdir") { sys.xdir = raw === "rechts" ? "rechts" : "links"; return; }
    const v = U.parse(raw); if (isNaN(v) || v <= 0) return;
    if (name === "L") {
      sys.L = v;
      const cl = x => Math.min(x, v);
      sys.cuts.forEach(o => { o.x = cl(o.x); });
      sys.supports.forEach(o => { o.x = cl(o.x); }); sys.hinges.forEach(o => { o.x = cl(o.x); });
      sys.loads.forEach(o => { if (o.t === "q") { o.a = cl(o.a); o.b = cl(o.b); } else o.x = cl(o.x); });
    } else if (name === "snap") sys.snap = v;
  };

  /* ---------- drawing of the system ---------- */
  ui.draw = function (sys, res, ed) {
    const g = geom(sys), X = g.X, sel = ed.sel || {};
    const cls = (kind, id) => "el" + (sel.kind === kind && sel.id === id ? " sel" : "");
    let s = "";
    /* ruler */
    const step = S.niceStep(g.sc), xl = sys.xdir === "links";
    const tick = v => { const x = xl ? v : sys.L - v; return S.line(X(x), RULER - 25, X(x), RULER - 15, "ruler") + S.text(X(x), RULER - 3, f(v, step < 1 ? 2 : 0).replace(/,00$/, ""), "lbl small"); };
    s += S.line(X(0), RULER - 20, X(sys.L), RULER - 20, "ruler");
    for (let v = 0; v <= sys.L + 1e-9; v += step) s += tick(v);
    if (Math.abs(sys.L / step - Math.round(sys.L / step)) > 1e-6) s += tick(sys.L);
    s += xl ? S.text(X(sys.L) + 8, RULER - 16, "x →", "lbl small", "start") : S.text(X(0) - 8, RULER - 16, "← x", "lbl small", "end");
    /* beam and dashed fibre */
    s += S.line(X(0), YB, X(sys.L), YB, "beam");
    const yf = YB + (sys.fibre === "unten" ? 10 : -10);
    s += S.line(X(0), yf, X(sys.L), yf, "fibre");
    /* loads */
    const maxq = Math.max(1e-9, ...sys.loads.filter(l => l.t === "q").map(l => Math.max(Math.abs(l.q1), Math.abs(l.q2))));
    sys.loads.forEach(l => {
      const c = cls("load", l.id), d = 'data-kind="load" data-id="' + l.id + '"';
      if (l.t === "F") {
        let t = "";
        if (Math.abs(l.fz) > 1e-9) {
          const down = l.fz > 0;
          t += down ? S.arrow(X(l.x), YB - 72, X(l.x), YB - 6, "col-load") + S.text(X(l.x), YB - 78, f(Math.abs(l.fz)) + " kN", "lbl load")
            : S.arrow(X(l.x), YB + 72, X(l.x), YB + 6, "col-load") + S.text(X(l.x), YB + 86, f(Math.abs(l.fz)) + " kN", "lbl load");
          t += '<rect class="hit" x="' + (X(l.x) - 12) + '" y="' + (down ? YB - 76 : YB + 6) + '" width="24" height="70"/>';
        }
        if (Math.abs(l.fx) > 1e-9) {
          const r = l.fx > 0;
          t += r ? S.arrow(X(l.x) - 58, YB - 18, X(l.x) - 4, YB - 18, "col-load") + S.text(X(l.x) - 31, YB - 25, f(Math.abs(l.fx)) + " kN", "lbl load")
            : S.arrow(X(l.x) + 58, YB - 18, X(l.x) + 4, YB - 18, "col-load") + S.text(X(l.x) + 31, YB - 25, f(Math.abs(l.fx)) + " kN", "lbl load");
          t += '<rect class="hit" x="' + (r ? X(l.x) - 60 : X(l.x) + 2) + '" y="' + (YB - 30) + '" width="58" height="22"/>';
        }
        if (!t) t = S.circle(X(l.x), YB - 10, 5, "col-load");
        s += "<g " + d + ' class="' + c + '">' + t + "</g>";
      } else if (l.t === "q") {
        const len = l.b - l.a; if (len <= 1e-9) return;
        const hq = q => (Math.abs(q) < 1e-9 ? 0 : Math.max(8, Math.abs(q) / maxq * 46)), h1 = hq(l.q1), h2 = hq(l.q2);
        const sg = (l.q1 + l.q2) >= 0 ? -1 : 1, y0 = YB + sg * 6;
        const pts = [[X(l.a), y0], [X(l.a), y0 + sg * h1], [X(l.b), y0 + sg * h2], [X(l.b), y0]];
        let t = S.poly(pts, "qfill") ;
        const nArr = Math.max(2, Math.round(len * g.sc / 34));
        for (let i = 0; i <= nArr; i++) {
          const u = i / nArr, hh = h1 + (h2 - h1) * u;
          if (hh > 3) t += S.arrow(X(l.a) + (X(l.b) - X(l.a)) * u, y0 + sg * hh, X(l.a) + (X(l.b) - X(l.a)) * u, y0, "col-load", 1.5);
        }
        const same = Math.abs(l.q1 - l.q2) < 1e-9, ty = y0 + sg * Math.max(h1, h2) + sg * 6 + (sg > 0 ? 8 : 0);
        t += same ? S.text((X(l.a) + X(l.b)) / 2, ty, "q = " + f(l.q1) + " kN/m", "lbl load")
          : S.text(X(l.a), y0 + sg * h1 + sg * 6 + (sg > 0 ? 8 : 0), f(l.q1), "lbl load", "start") + S.text(X(l.b), y0 + sg * h2 + sg * 6 + (sg > 0 ? 8 : 0), f(l.q2) + " kN/m", "lbl load", "end");
        s += "<g " + d + ' class="' + c + '">' + t + '<polygon class="hit" points="' + pts.map(p => p.join(",")).join(" ") + '"/>' +
          S.circle(X(l.a), y0 + sg * h1, 7, "handle", d + ' data-h="a"') + S.circle(X(l.b), y0 + sg * h2, 7, "handle", d + ' data-h="b"') + "</g>";
      } else {
        const cw = l.m >= 0;
        s += "<g " + d + ' class="' + c + '">' + S.moment(X(l.x), YB - 40, 22, cw, "col-load") + S.text(X(l.x), YB - 72, f(Math.abs(l.m)) + " kNm", "lbl load") +
          '<rect class="hit" x="' + (X(l.x) - 26) + '" y="' + (YB - 68) + '" width="52" height="56"/></g>';
      }
    });
    /* supports */
    sys.supports.forEach(o => {
      const x = X(o.x), c = cls("sup", o.id), d = 'data-kind="sup" data-id="' + o.id + '"';
      let t = "";
      if (o.t === "fest") {
        const base = YB + 36;
        t = S.poly([[x, YB + 5], [x - 15, base], [x + 15, base]], "sym") + S.line(x - 24, base, x + 24, base, "ground") + S.hatch(x - 22, x + 24, base);
      } else if (o.t === "los") {
        t = S.poly([[x, YB + 5], [x - 14, YB + 26], [x + 14, YB + 26]], "sym") + S.circle(x - 8, YB + 31, 4, "sym") + S.circle(x + 8, YB + 31, 4, "sym") +
          S.line(x - 24, YB + 39, x + 24, YB + 39, "ground") + S.hatch(x - 22, x + 24, YB + 39);
      } else {
        const side = o.x < sys.L / 2 ? -1 : 1;
        t = S.line(x, YB - 30, x, YB + 30, "ground wall");
        for (let y = YB - 30; y < YB + 30; y += 8) t += S.line(x, y + 8, x + side * 9, y, "hatch");
      }
      s += "<g " + d + ' class="' + c + '">' + t + '<rect class="hit" x="' + (x - 26) + '" y="' + (YB - 6) + '" width="52" height="48"/></g>';
    });
    sys.hinges.forEach(o => {
      s += '<g data-kind="hinge" data-id="' + o.id + '" class="' + cls("hinge", o.id) + '">' + S.circle(X(o.x), YB, 7, "hingec") + '<rect class="hit" x="' + (X(o.x) - 12) + '" y="' + (YB - 12) + '" width="24" height="24"/></g>';
    });
    sys.cuts.forEach(c => {
      const x = X(c.x);
      s += '<g data-kind="cut" data-id="' + c.id + '" class="' + cls("cut", c.id) + '">' + S.line(x, YB - 50, x, YB + 50, "cutline") + S.text(x, YB + 66, "x = " + f(B.xd(sys, c.x)), "lbl blue") +
        '<rect class="hit" x="' + (x - 10) + '" y="' + (YB - 50) + '" width="20" height="100"/></g>';
    });
    /* reactions */
    if (res.ok) {
      const bySup = {};
      res.unknowns.forEach(u => { (bySup[u.s.id] = bySup[u.s.id] || []).push(u); });
      Object.keys(bySup).forEach(id => {
        const us = bySup[id], x = X(us[0].s.x), txt = [];
        us.forEach(u => {
          const v = u.value;
          if (Math.abs(v) < 1e-9) return;
          if (u.c === "z") s += v > 0 ? S.arrow(x, YB + 102, x, YB + 62, "col-react") : S.arrow(x, YB + 62, x, YB + 102, "col-react");
          else if (u.c === "x") s += v > 0 ? S.arrow(x - 50, YB - 6, x - 6, YB - 6, "col-react") : S.arrow(x + 50, YB - 6, x + 6, YB - 6, "col-react");
          else s += S.moment(x, YB, 16, v > 0, "col-react");
          txt.push(plain(u.name) + " = " + f(v) + (u.c === "m" ? " kNm" : " kN"));
        });
        if (txt.length) s += S.text(x, YB + 118, txt.join(" · "), "lbl react", x < W * 0.3 ? "start" : x > W * 0.7 ? "end" : "middle");
      });
    }
    if (ed.pending) s += S.line(X(ed.pending.x), YB - 70, X(ed.pending.x), YB + 20, "pend");
    return s;
  };

  /* ---------- Q / M / N diagrams ---------- */
  function diagram(sys, res, key, title, posDown) {
    const g = geom(sys), X = g.X, sg = B.signs(sys), mul = key === "V" ? sg.q : key === "M" ? sg.m : 1;
    const curve = B.curve(sys, res, key).map(p => ({ x: p.x, v: p.v * mul })), pts = B.points(sys);
    const maxv = Math.max(1e-9, ...curve.map(p => Math.abs(p.v)));
    if (maxv <= 1e-9 && key === "N") return "";
    const base = 70, k = 44 / maxv, Y = v => base + (posDown ? v : -v) * k;
    const poly = [[X(curve[0].x), base]].concat(curve.map(p => [X(p.x), Y(p.v)]), [[X(curve[curve.length - 1].x), base]]);
    let s = S.line(X(0), base, X(sys.L), base, "ruler") + S.poly(poly, "dfill dfill-" + key) + S.text(PAD - 55, 14, title, "lbl small", "start");
    const lab = (x, v, anchor) => {
      if (Math.abs(v) < 1e-9) return "";
      const above = posDown ? v < 0 : v > 0;
      return S.text(X(x) + (anchor === "end" ? -4 : anchor === "start" ? 4 : 0), above ? Y(v) - 5 : Y(v) + 13, f(v), "lbl small dval", anchor);
    };
    pts.forEach((x, i) => {
      const l = B.internal(sys, res, x, -1)[key] * mul, r = B.internal(sys, res, x, 1)[key] * mul;
      if (i === 0) s += lab(x, r, "start");
      else if (i === pts.length - 1) s += lab(x, l, "end");
      else if (Math.abs(l - r) < 1e-9) s += lab(x, l, "middle");
      else s += lab(x, l, "end") + lab(x, r, "start");
    });
    if (key === "M") { const ex = B.extremesDisp(sys, res); [ex.Mmax, ex.Mmin].forEach(e => { if (e.zero) s += lab(e.x, e.m, "middle") + S.circle(X(e.x), Y(e.m), 3, "dpt"); }); }
    sys.cuts.forEach(c => { s += S.line(X(c.x), 22, X(c.x), 130, "cutline"); });
    return '<svg class="dia" viewBox="0 0 ' + W + " 140" + '">' + s + "</svg>";
  }
  ui.diagrams = function (sys, res) {
    if (!res.ok) return "";
    const fib = sys.fibre;
    return diagram(sys, res, "N", "Normalkraft N [kN] (Zug +)", false) + diagram(sys, res, "V", "Querkraft Q [kN] (Konvention: Faser " + fib + ", x von " + sys.xdir + ")", false) +
      diagram(sys, res, "M", "Moment M [kNm] (Zug an der gestrichelten Faser " + fib + " ist +, auf der Zugseite gezeichnet)", fib === "unten");
  };

  /* ---------- result card ---------- */
  ui.results = function (sys, res) {
    let h = '<div class="card"><h3>Ergebnis</h3><p class="status ' + (res.ok ? "ok" : "warn") + '">' + U.esc(res.msg) + "</p>";
    if (res.ok) {
      h += '<table class="tbl">';
      res.unknowns.forEach(u => { h += "<tr><td>" + u.name + "</td><td><b>" + f(u.value) + "</b> " + (u.c === "m" ? "kNm" : "kN") + "</td><td>" + (u.c === "x" ? (u.value >= 0 ? "→" : "←") : u.c === "z" ? (u.value >= 0 ? "↑" : "↓") : (u.value >= 0 ? "↻" : "↺")) + "</td></tr>"; });
      const ex = B.extremesDisp(sys, res), xd = x => B.xd(sys, x);
      h += "<tr><td>max M</td><td><b>" + f(ex.Mmax.m) + "</b> kNm</td><td>x = " + f(xd(ex.Mmax.x)) + "</td></tr><tr><td>min M</td><td><b>" + f(ex.Mmin.m) + "</b> kNm</td><td>x = " + f(xd(ex.Mmin.x)) + "</td></tr>" +
        "<tr><td>max |Q|</td><td><b>" + f(Math.abs(ex.Vmax.v)) + "</b> kN</td><td>x = " + f(xd(ex.Vmax.x)) + "</td></tr></table>";
    }
    return h + "</div>";
  };

  /* ---------- tables ---------- */
  const numIn = (k, id, fld, v) => '<input type="text" inputmode="decimal" data-k="' + k + '" data-id="' + id + '" data-f="' + fld + '" value="' + U.show(v) + '">';
  const lbl = (txt, inp) => "<label><span>" + txt + "</span>" + inp + "</label>";
  const del = (k, id) => '<button class="x" data-del data-k="' + k + '" data-id="' + id + '" title="Löschen">✕</button>';
  ui.tables = function (sys, res, ed) {
    const sel = (k, id) => (ed.sel && ed.sel.kind === k && ed.sel.id === id ? " sel" : "");
    let h = '<div class="card"><h3>Lager</h3>';
    B.supports(sys).forEach(o => {
      h += '<div class="rowel' + sel("sup", o.id) + '" data-kind="sup" data-id="' + o.id + '"><b>' + o.label + "</b>" +
        '<select data-k="sup" data-id="' + o.id + '" data-f="t">' + ["fest", "los", "einsp"].map(t => '<option value="' + t + '"' + (o.t === t ? " selected" : "") + ">" + B.typeName(t) + "</option>").join("") + "</select>" +
        lbl("x", numIn("sup", o.id, "x", o.x)) + del("sup", o.id) + "</div>";
    });
    if (!sys.supports.length) h += '<p class="muted">Noch kein Lager.</p>';
    h += "</div>";
    h += '<div class="card"><h3>Gelenke</h3>';
    sys.hinges.forEach((o, i) => { h += '<div class="rowel' + sel("hinge", o.id) + '" data-kind="hinge" data-id="' + o.id + '"><b>G' + (i + 1) + "</b>" + lbl("x", numIn("hinge", o.id, "x", o.x)) + del("hinge", o.id) + "</div>"; });
    if (!sys.hinges.length) h += '<p class="muted">Keine Gelenke.</p>';
    h += "</div>";
    h += '<div class="card"><h3>Lasten</h3>';
    sys.loads.forEach(o => {
      let body;
      if (o.t === "F") body = "<b>Einzellast</b>" + lbl("x", numIn("load", o.id, "x", o.x)) + lbl("F↓ kN", numIn("load", o.id, "fz", o.fz)) + lbl("F→ kN", numIn("load", o.id, "fx", o.fx));
      else if (o.t === "q") body = "<b>Streckenlast</b>" + lbl("von", numIn("load", o.id, "a", o.a)) + lbl("bis", numIn("load", o.id, "b", o.b)) + lbl("q links kN/m", numIn("load", o.id, "q1", o.q1)) + lbl("q rechts kN/m", numIn("load", o.id, "q2", o.q2));
      else body = "<b>Moment ↻</b>" + lbl("x", numIn("load", o.id, "x", o.x)) + lbl("M kNm", numIn("load", o.id, "m", o.m));
      h += '<div class="rowel wrap' + sel("load", o.id) + '" data-kind="load" data-id="' + o.id + '">' + body + del("load", o.id) + "</div>";
    });
    if (!sys.loads.length) h += '<p class="muted">Keine Lasten.</p>';
    h += '<p><button data-act="eg">＋ Streckenlast über ganze Länge</button></p></div>';
    h += '<div class="card"><h3>Schnitte</h3><p class="muted">Position x von ' + sys.xdir + ' gemessen. Rechnung und Skizze im Tab Rechenweg.</p>';
    sys.cuts.forEach((o, i) => { h += '<div class="rowel' + sel("cut", o.id) + '" data-kind="cut" data-id="' + o.id + '"><b>Schnitt ' + (i + 1) + "</b>" + lbl("x", numIn("cut", o.id, "x", B.xd(sys, o.x))) + del("cut", o.id) + "</div>"; });
    if (!sys.cuts.length) h += '<p class="muted">Kein Schnitt.</p>';
    h += '<p><button data-act="cut">＋ Schnitt in Feldmitte</button></p></div>';
    return h;
  };

  /* ---------- editing from tables ---------- */
  const coll = (sys, k) => (k === "sup" ? sys.supports : k === "hinge" ? sys.hinges : k === "cut" ? sys.cuts : sys.loads);
  const find = (sys, k, id) => coll(sys, k).find(o => o.id === id);
  ui.getField = (sys, k, id, fld) => { const o = find(sys, k, id); return o ? (k === "cut" ? B.xd(sys, o.x) : o[fld]) : null; };
  ui.setField = function (sys, k, id, fld, raw) {
    const o = find(sys, k, id); if (!o) return;
    if (fld === "t") { o.t = raw; return; }
    const v = U.parse(raw); if (isNaN(v)) return;
    if (k === "cut") { o.x = B.xd(sys, U.clamp(v, 0, sys.L)); return; }   // typed in the user's x direction, stored from the left
    o[fld] = ["x", "a", "b"].includes(fld) ? U.clamp(v, 0, sys.L) : v;
    if (k === "load" && o.t === "q" && o.a > o.b) { const t = o.a; o.a = o.b; o.b = t; }
  };
  ui.remove = function (sys, k, id) { const a = coll(sys, k), i = a.findIndex(o => o.id === id); if (i >= 0) a.splice(i, 1); };
  ui.action = function (sys, name) {
    if (name === "cut") { const o = { id: U.uid(), x: sys.L / 2 }; sys.cuts.push(o); return { kind: "cut", id: o.id }; }
    if (name === "eg") { const o = { id: U.uid(), t: "q", a: 0, b: sys.L, q1: 5, q2: 5 }; sys.loads.push(o); return { kind: "load", id: o.id }; }
  };

  /* ---------- sketch of the cut with the positive N, Q, M (used in the Rechenweg) ----------
     Left piece: its cut face has the outward normal pointing right. It is the positive Schnittufer when x runs from the left.
     N always pulls away from the piece. Q points to +z at the positive face (reversed at the negative face), M gives tension at the dashed fibre. */
  B.sketch = function (sys) {
    const sg = B.signs(sys), xl = sys.xdir === "links", below = sys.fibre === "unten", Y0 = 102, dy = below ? 1 : -1;
    const piece = (x0, x1, left) => {
      const xf = left ? x1 : x0, outer = left ? x0 : x1;
      const qDown = left ? sg.q > 0 : sg.q < 0, mCw = left ? !below : below;
      let t = S.line(x0, Y0, x1, Y0, "beam") + S.line(x0, Y0 + 9 * dy, x1, Y0 + 9 * dy, "fibre");
      t += S.poly([[outer, Y0 + 5], [outer - 14, Y0 + 30], [outer + 14, Y0 + 30]], "sym") + S.line(outer - 20, Y0 + 30, outer + 20, Y0 + 30, "ground");
      t += S.line(xf, Y0 - 52, xf, Y0 + 52, "cutline");
      const nx = left ? xf + 60 : xf - 60;
      t += S.arrow(xf, Y0, nx, Y0, "col-cut") + S.text((xf + nx) / 2, Y0 - 8, "N(x)", "lbl cut");
      const qy = qDown ? Y0 + 56 : Y0 - 56;
      t += S.arrow(xf, Y0, xf, qy, "col-cut") + S.text(xf + (left ? -8 : 8), qy + (qDown ? 14 : -6), "Q(x)", "lbl cut", left ? "end" : "start");
      const cy = qDown ? Y0 - 40 : Y0 + 40;
      t += S.moment(xf + (left ? -30 : 30), cy, 20, mCw, "col-cut") + S.text(xf + (left ? -30 : 30), cy + (qDown ? -28 : 36), "M(x)", "lbl cut");
      const positive = left ? xl : !xl;
      t += S.text(xf, 14, positive ? "positives Schnittufer" : "negatives Schnittufer", "lbl blue");
      if (left === xl) {   // the piece that starts at the origin of x
        const a = left ? x0 : x1, b = left ? x1 - 70 : x0 + 70;
        t += S.arrow(a, 176, b, 176, "col-react", 2) + S.text((a + b) / 2, 168, "x", "lbl react");
      }
      return t;
    };
    return '<svg class="cutsketch" viewBox="0 0 760 188">' + piece(50, 290, true) + piece(470, 710, false) + "</svg>";
  };

  /* ---------- mouse ---------- */
  const snapX = (sys, p) => { const g = geom(sys); return U.clamp(+(Math.round(((p.x - PAD) / g.sc) / sys.snap) * sys.snap).toFixed(6), 0, sys.L); };
  ui.down = function (e, p, sys, res, ed) {
    const tgt = e.target.closest ? e.target.closest("[data-kind]") : null, tool = ed.tool;
    if (tool === "select") {
      if (!tgt) { ed.sel = null; return "sel"; }
      ed.sel = { kind: tgt.dataset.kind, id: tgt.dataset.id };
      ed.drag = { kind: tgt.dataset.kind, id: tgt.dataset.id, h: e.target.dataset ? e.target.dataset.h : null };
      return "sel";
    }
    const x = snapX(sys, p);
    if (["fest", "los", "einsp"].includes(tool)) {
      const ex = sys.supports.find(o => Math.abs(o.x - x) < 1e-6);
      if (ex) { ex.t = tool; ed.sel = { kind: "sup", id: ex.id }; }
      else { const o = { id: U.uid(), t: tool, x }; sys.supports.push(o); ed.sel = { kind: "sup", id: o.id }; }
      return "struct";
    }
    if (tool === "hinge") {
      if (!sys.hinges.some(o => Math.abs(o.x - x) < 1e-6)) { const o = { id: U.uid(), x }; sys.hinges.push(o); ed.sel = { kind: "hinge", id: o.id }; }
      return "struct";
    }
    if (tool === "F") { const o = { id: U.uid(), t: "F", x, fz: 10, fx: 0 }; sys.loads.push(o); ed.sel = { kind: "load", id: o.id }; return "struct"; }
    if (tool === "cut") { const o = { id: U.uid(), x }; sys.cuts.push(o); ed.sel = { kind: "cut", id: o.id }; return "struct"; }
    if (tool === "M") { const o = { id: U.uid(), t: "M", x, m: 10 }; sys.loads.push(o); ed.sel = { kind: "load", id: o.id }; return "struct"; }
    if (tool === "q") {
      if (!ed.pending) { ed.pending = { x }; return "move"; }
      const a = Math.min(ed.pending.x, x), b = Math.max(ed.pending.x, x); ed.pending = null;
      if (b - a < 1e-6) return "move";
      const o = { id: U.uid(), t: "q", a, b, q1: 5, q2: 5 }; sys.loads.push(o); ed.sel = { kind: "load", id: o.id }; return "struct";
    }
    return null;
  };
  ui.move = function (e, p, sys, res, ed) {
    if (!ed.drag) return null;
    const x = snapX(sys, p), d = ed.drag, o = find(sys, d.kind, d.id); if (!o) return null;
    if (d.kind === "load" && o.t === "q") {
      if (d.h === "a") o.a = Math.min(x, o.b - 1e-6); else if (d.h === "b") o.b = Math.max(x, o.a + 1e-6); else return null;
    } else o.x = x;
    return "move";
  };
  ui.up = function (e, p, sys, res, ed) { if (ed.drag) { ed.drag = null; return "struct"; } return null; };
})(window.APP);
