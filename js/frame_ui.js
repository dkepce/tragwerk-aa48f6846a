/* Tragwerk — Rahmen screen: drawing, tables, results, mouse handling (APP.typeUI.frame).
   Pattern as in truss_ui.js: app.js owns the toolbar, selection (APP.ed) and saving. */
(function (APP) {
  const U = APP.U, S = APP.svg, F = APP.frame, f = U.fmt;
  const W = 1000, PX = 100, PT = 80, PB = 150;
  const ui = ((APP.typeUI = APP.typeUI || {}).frame = {});

  ui.tools = [["select", "Auswahl"], ["node", "Knoten"], ["member", "Stab"], ["fest", "Festlager"], ["los", "Loslager"], ["einsp", "Einspannung"], ["hinge", "Gelenk"], ["F", "Last (Knoten)"], ["q", "Streckenlast (Stab)"]];
  ui.hints = {
    select: "Auswahl: Knoten, Stäbe, Lager oder Lasten anklicken; Knoten lassen sich verschieben. Entf löscht.",
    node: "Knoten: in die Zeichenfläche klicken (rastet am Raster ein).", member: "Stab: erst Knoten A, dann Knoten B anklicken. Das Profil wählst du rechts in der Tabelle.",
    fest: "Festlager: auf einen Knoten klicken (zwei Lager unten = Zweigelenkrahmen).", los: "Loslager: auf einen Knoten klicken (Richtung rechts in der Tabelle).", einsp: "Einspannung: auf einen Knoten klicken.",
    hinge: "Gelenk: auf einen Stab nahe an dem Ende klicken, das gelenkig angeschlossen sein soll (nochmal klicken entfernt es).",
    F: "Last: auf einen Knoten klicken, Größe danach rechts in der Tabelle.", q: "Streckenlast: auf einen Stab klicken (pro Stab ein Wert für senkrecht und waagrecht)."
  };
  const geom = sys => { const sc = (W - 2 * PX) / sys.W; const Hs = Math.round(PT + PB + sys.H * sc); return { sc, Hs, X: x => PX + x * sc, Y: z => Hs - PB - z * sc }; };
  ui.viewBox = sys => "0 0 " + W + " " + geom(sys).Hs;
  const plain = s => String(s).replace(/<sub>(.*?)<\/sub>/g, "$1");
  const opt = (v, cur, txt) => '<option value="' + v + '"' + (String(cur) === String(v) ? " selected" : "") + ">" + txt + "</option>";
  const chk = (key, label, on, tip) => '<label title="' + (tip || "") + '"><input type="checkbox" data-p="' + key + '"' + (on ? " checked" : "") + "> " + label + "</label>";

  /* ---------- header parameters ---------- */
  ui.params = sys => '<label>Anzeige <select data-p="view">' + opt("M", sys.view, "Moment M") + opt("N", sys.view, "Normalkraft N") + opt("Q", sys.view, "Querkraft Q") + opt("def", sys.view, "Verformung") + opt("util", sys.view, "Ausnutzung") + "</select></label>" +
    '<label>Stahl <select data-p="grade">' + ["S235", "S275", "S355"].map(g => opt(g, sys.grade, g)).join("") + "</select></label>" +
    '<label title="Theorie I. Ordnung am unverformten System oder Theorie II. Ordnung am verformten System mit Imperfektionen">Berechnung <select data-p="order">' + opt("I", sys.order, "Theorie I. Ordnung") + opt("II", sys.order, "Theorie II. Ordnung") + "</select></label>" +
    '<label title="Teilsicherheitsbeiwert auf alle Lasten (pauschal)">γ<sub>F</sub> <input type="text" inputmode="decimal" data-p="gF" value="' + U.show(sys.gF) + '"></label>' +
    chk("selfWeight", "Eigengewicht", sys.selfWeight, "Eigengewicht der Profile als Streckenlast ansetzen") +
    (sys.order === "II" ? chk("sway", "Schiefstellung φ", sys.sway, "Globale Imperfektion nach EN 1993-1-1, 5.3.2") + chk("bow", "Vorkrümmung e₀", sys.bow, "Lokale Imperfektion, nur wenn nach EN 1993-1-1 erforderlich") +
      '<label>Richtung <select data-p="swayDir">' + opt("1", sys.swayDir, "nach +x") + opt("-1", sys.swayDir, "nach −x") + "</select></label>" +
      '<label>Knicklinie <select data-p="curve">' + ["a0", "a", "b", "c", "d"].map(c => opt(c, sys.curve, c)).join("") + "</select></label>" : "") +
    '<label>Breite <input type="text" inputmode="decimal" data-p="W" value="' + U.show(sys.W) + '"> m</label><label>Höhe <input type="text" inputmode="decimal" data-p="H" value="' + U.show(sys.H) + '"> m</label>' +
    '<label>Raster <select data-p="snap">' + [0.1, 0.25, 0.5, 1].map(v => opt(v, sys.snap, U.show(v) + " m")).join("") + "</select></label>";
  ui.setParam = function (sys, name, raw) {
    if (name === "view") { sys.view = raw; return; }
    if (name === "grade") { sys.grade = raw; return; }
    if (name === "order") { sys.order = raw === "II" ? "II" : "I"; return; }
    if (name === "curve") { sys.curve = raw; return; }
    if (name === "swayDir") { sys.swayDir = raw === "-1" ? -1 : 1; return; }
    if (name === "selfWeight" || name === "sway" || name === "bow") { sys[name] = raw === "1"; return; }
    const v = U.parse(raw); if (isNaN(v) || v <= 0) return;
    if (name === "W") sys.W = v; else if (name === "H") sys.H = v; else if (name === "snap") sys.snap = v; else if (name === "gF") sys.gF = v;
  };

  /* ---------- diagram scale ---------- */
  function maxValue(res, key) {
    let m = 0; res.mem.forEach(mr => mr.pts.forEach(p => { m = Math.max(m, Math.abs(p[key])); })); return m;
  }
  const utilClass = u => (u > 1 ? "m-bad" : u > 0.85 ? "m-warn" : "m-ok");

  /* ---------- drawing ---------- */
  ui.draw = function (sys, res, ed) {
    const g = geom(sys), X = g.X, Y = g.Y, sel = ed.sel || {};
    const cls = (kind, id) => "el" + (sel.kind === kind && sel.id === id ? " sel" : "");
    const ok = res && res.ok, view = sys.view;
    let s = "";
    if (sys.snap * g.sc >= 12) for (let x = 0; x <= sys.W + 1e-9; x += sys.snap) for (let z = 0; z <= sys.H + 1e-9; z += sys.snap) s += S.circle(X(x), Y(z), 1.2, "gdot");
    s += S.line(X(0), Y(0), X(sys.W), Y(0), "ruler") + S.line(X(0), Y(0), X(0), Y(sys.H), "ruler");
    const nodeAt = id => sys.nodes[F.nodeIndex(sys, id)];

    /* member diagrams (underneath the members) */
    let defScale = 0;
    if (ok && (view === "M" || view === "N" || view === "Q")) {
      const kmax = maxValue(res, view), k = kmax > 1e-9 ? 55 / kmax : 0;
      res.mem.forEach(mr => {
        const m = mr.m, a = sys.nodes[m.ia], A = [X(a.x), Y(a.z)], dir = [m.c, -m.s], off = [m.s, m.c];   // screen direction of the member and of "−local y"
        const pts = mr.pts.map(p => [A[0] + dir[0] * p.x * g.sc + off[0] * p[view] * k, A[1] + dir[1] * p.x * g.sc + off[1] * p[view] * k]);
        const base = mr.pts.map(p => [A[0] + dir[0] * p.x * g.sc, A[1] + dir[1] * p.x * g.sc]);
        s += S.poly(base.slice(0, 1).concat(pts, base.slice(-1)).concat(base.slice().reverse().slice(1)), "dfill dfill-" + (view === "Q" ? "V" : view));
        const lab = (i, anchor) => { const v = mr.pts[i][view]; if (Math.abs(v) < 1e-6) return ""; return S.text(pts[i][0] + off[0] * (v >= 0 ? 12 : -12) * Math.sign(k || 1), pts[i][1] + off[1] * (v >= 0 ? 12 : -12) + 4, f(v), "lbl small dval", anchor || "middle"); };
        let imax = 0; mr.pts.forEach((p, i) => { if (Math.abs(p[view]) > Math.abs(mr.pts[imax][view])) imax = i; });
        s += lab(0) + lab(mr.pts.length - 1) + ((imax > 1 && imax < mr.pts.length - 2) ? lab(imax) : "");
      });
    }
    /* members */
    sys.members.forEach((m, j) => {
      const a = nodeAt(m.a), b = nodeAt(m.b); if (!a || !b) return;
      let c = "m-none";
      if (ok && view === "util") c = utilClass(Math.max(res.checks[j].uMN, res.checks[j].uV));
      const mx = (X(a.x) + X(b.x)) / 2, my = (Y(a.z) + Y(b.z)) / 2, ang = Math.atan2(Y(b.z) - Y(a.z), X(b.x) - X(a.x));
      let t = S.line(X(a.x), Y(a.z), X(b.x), Y(b.z), "member frame " + c) + S.line(X(a.x), Y(a.z), X(b.x), Y(b.z), "hitline");
      const label = "S" + (j + 1) + " " + m.prof + (ok && view === "util" ? " · " + f(Math.max(res.checks[j].uMN, res.checks[j].uV) * 100, 0) + " %" : "");
      t += S.text(mx + Math.sin(ang) * 16, my - Math.cos(ang) * 16 + 4, label, "lbl small mlabel");
      [["ha", a, b], ["hb", b, a]].forEach(h => { if (m[h[0]]) { const d = Math.hypot(X(h[2].x) - X(h[1].x), Y(h[2].z) - Y(h[1].z)) || 1, px = X(h[1].x) + (X(h[2].x) - X(h[1].x)) / d * 16, py = Y(h[1].z) + (Y(h[2].z) - Y(h[1].z)) / d * 16; t += S.circle(px, py, 5.5, "hingec"); } });
      s += "<g data-kind=\"mem\" data-id=\"" + m.id + '" class="' + cls("mem", m.id) + '">' + t + "</g>";
    });
    /* deformed shape */
    if (ok && view === "def") {
      let mx = 0; for (let i = 0; i < res.u.length; i++) mx = Math.max(mx, Math.abs(res.u[i]) * (i % 3 === 2 ? 0 : 1));
      defScale = mx > 1e-9 ? 45 / (mx * g.sc) : 0;
      res.mem.forEach(mr => {
        const m = mr.m, d = res.fin.ends[mr.j].d, L = m.L, a = sys.nodes[m.ia];
        const pts = []; for (let i = 0; i <= 20; i++) {
          const xi = i / 20, x = xi * L, N1 = 1 - xi, N2 = xi, H1 = 1 - 3 * xi * xi + 2 * xi ** 3, H2 = x * (1 - xi) ** 2, H3 = 3 * xi * xi - 2 * xi ** 3, H4 = x * (xi * xi - xi);
          const ul = N1 * d[0] + N2 * d[3], wl = H1 * d[1] + H2 * d[2] + H3 * d[4] + H4 * d[5];
          const gx = a.x + m.c * x + (ul * m.c - wl * m.s) * defScale, gz = a.z + m.s * x + (ul * m.s + wl * m.c) * defScale;
          pts.push(X(gx) + "," + Y(gz));
        }
        s += '<polyline class="deform" points="' + pts.join(" ") + '"/>';
      });
      s += S.text(X(sys.W), 20, "Verformung ×" + f(defScale, 0) + " überhöht", "lbl small", "end");
    }
    /* supports */
    sys.supports.forEach(o => {
      const n = nodeAt(o.n); if (!n) return;
      const x = X(n.x), y = Y(n.z), d = 'data-kind="sup" data-id="' + o.id + '"'; let t = "";
      if (o.t === "fest") t = S.poly([[x, y + 4], [x - 15, y + 34], [x + 15, y + 34]], "sym") + S.line(x - 22, y + 34, x + 22, y + 34, "ground") + S.hatch(x - 20, x + 22, y + 34);
      else if (o.t === "einsp") { t = S.line(x - 26, y + 6, x + 26, y + 6, "ground wall"); for (let hx = x - 24; hx < x + 26; hx += 8) t += S.line(hx, y + 14, hx + 8, y + 6, "hatch"); }
      else if (o.dir === "x") t = S.poly([[x - 4, y], [x - 34, y - 14], [x - 34, y + 14]], "sym") + S.circle(x - 39, y - 8, 4, "sym") + S.circle(x - 39, y + 8, 4, "sym") + S.line(x - 47, y - 22, x - 47, y + 22, "ground");
      else t = S.poly([[x, y + 4], [x - 14, y + 26], [x + 14, y + 26]], "sym") + S.circle(x - 8, y + 31, 4, "sym") + S.circle(x + 8, y + 31, 4, "sym") + S.line(x - 22, y + 39, x + 22, y + 39, "ground") + S.hatch(x - 20, x + 22, y + 39);
      s += "<g " + d + ' class="' + cls("sup", o.id) + '">' + t + '<rect class="hit" x="' + (x - 40) + '" y="' + (y - 20) + '" width="80" height="64"/></g>';
    });
    /* loads */
    sys.loads.forEach(l => {
      const d = 'data-kind="load" data-id="' + l.id + '"'; let t = "";
      if (l.t === "F") {
        const n = nodeAt(l.n); if (!n) return; const x = X(n.x), y = Y(n.z);
        if (Math.abs(l.fz) > 1e-9) { t += l.fz > 0 ? S.arrow(x, y - 70, x, y - 9, "col-load") + S.text(x + 6, y - 66, f(Math.abs(l.fz)) + " kN", "lbl load", "start") : S.arrow(x, y + 70, x, y + 9, "col-load") + S.text(x + 6, y + 80, f(Math.abs(l.fz)) + " kN", "lbl load", "start"); t += '<rect class="hit" x="' + (x - 10) + '" y="' + (l.fz > 0 ? y - 72 : y + 8) + '" width="20" height="64"/>'; }
        if (Math.abs(l.fx) > 1e-9) { t += l.fx > 0 ? S.arrow(x - 70, y, x - 9, y, "col-load") + S.text(x - 66, y - 6, f(Math.abs(l.fx)) + " kN", "lbl load", "start") : S.arrow(x + 70, y, x + 9, y, "col-load") + S.text(x + 66, y - 6, f(Math.abs(l.fx)) + " kN", "lbl load", "end"); t += '<rect class="hit" x="' + (l.fx > 0 ? x - 72 : x + 8) + '" y="' + (y - 10) + '" width="64" height="20"/>'; }
        if (Math.abs(l.m) > 1e-9) t += S.moment(x, y - 38, 20, l.m > 0, "col-load") + S.text(x, y - 66, f(Math.abs(l.m)) + " kNm", "lbl load");
        if (!t) t = S.circle(x, y - 14, 5, "col-load");
      } else {
        const m = sys.members.find(o => o.id === l.mem); if (!m) return; const a = nodeAt(m.a), b = nodeAt(m.b); if (!a || !b) return;
        const ax = X(a.x), ay = Y(a.z), bx = X(b.x), by = Y(b.z), n = 5;
        [["qv", 0, 1, "↓"], ["qh", 1, 0, "→"]].forEach(c => {
          const v = l[c[0]]; if (Math.abs(v) < 1e-9) return;
                    for (let i = 0; i <= n; i++) { const px = ax + (bx - ax) * i / n, py = ay + (by - ay) * i / n; t += c[0] === "qv" ? (v > 0 ? S.arrow(px, py - 34, px, py - 4, "col-load", 1.6) : S.arrow(px, py + 34, px, py + 4, "col-load", 1.6)) : (v > 0 ? S.arrow(px - 34, py, px - 4, py, "col-load", 1.6) : S.arrow(px + 34, py, px + 4, py, "col-load", 1.6)); }
          const lx = (ax + bx) / 2, ly = (ay + by) / 2; t += S.text(lx + (c[0] === "qh" ? (v > 0 ? -40 : 40) : 0), ly + (c[0] === "qv" ? (v > 0 ? -40 : 52) : -10), "q = " + f(Math.abs(v)) + " kN/m", "lbl load");
          t += '<line class="hitline" x1="' + ax + '" y1="' + ay + '" x2="' + bx + '" y2="' + by + '"/>';
        });
      }
      s += "<g " + d + ' class="' + cls("load", l.id) + '">' + t + "</g>";
    });
    /* reactions */
    if (ok) res.rea.forEach(r => {
      const n = sys.nodes[r.ni], x = X(n.x), y = Y(n.z), txt = [];
      if (Math.abs(r.Rz) > 1e-6) { s += r.Rz > 0 ? S.arrow(x, y + 112, x, y + 70, "col-react") : S.arrow(x, y + 70, x, y + 112, "col-react"); txt.push("Rz = " + f(r.Rz)); }
      if (Math.abs(r.Rx) > 1e-6) { s += r.Rx > 0 ? S.arrow(x - 100, y + 18, x - 56, y + 18, "col-react") : S.arrow(x - 56, y + 18, x - 100, y + 18, "col-react"); txt.push("Rx = " + f(r.Rx)); }
      if (r.s.t === "einsp" && Math.abs(r.M) > 1e-6) txt.push("M = " + f(r.M) + " kNm");
      if (txt.length) s += S.text(x, y + 128, txt.join(" · ") + (txt.some(t => t.startsWith("M")) ? "" : " kN"), "lbl react");
    });
    /* nodes on top */
    sys.nodes.forEach((n, i) => {
      const d = 'data-kind="node" data-id="' + n.id + '"', pend = ed.pending && ed.pending.id === n.id;
      s += "<g " + d + ' class="' + cls("node", n.id) + (pend ? " pend" : "") + '">' + S.circle(X(n.x), Y(n.z), 7, "nodec") + S.circle(X(n.x), Y(n.z), 16, "hit") + S.text(X(n.x) - 11, Y(n.z) - 11, String(i + 1), "lbl nlabel", "end") + "</g>";
    });
    return s;
  };
  ui.diagrams = () => "";

  /* ---------- result card ---------- */
  ui.results = function (sys, res) {
    let h = '<div class="card"><h3>Ergebnis</h3><p class="status ' + (res.ok ? "ok" : "warn") + '">' + U.esc(res.msg) + "</p>";
    if (res.ok) {
      const ac = res.alphaCr;
      h += '<p class="muted">α<sub>cr</sub> = <b>' + (isFinite(ac) ? f(ac, 2) : "∞") + "</b> – " + (ac >= 10 ? "Theorie I. Ordnung genügt (α<sub>cr</sub> ≥ 10)" : ac > 1 ? "Theorie II. Ordnung nötig (α<sub>cr</sub> &lt; 10)" : "instabil") + ".</p>";
      h += '<table class="tbl"><tr><th colspan="4">Auflager</th></tr>';
      res.rea.forEach(r => { h += "<tr><td><b>" + r.label + "</b></td><td>R<sub>x</sub> " + f(r.Rx) + "</td><td>R<sub>z</sub> " + f(r.Rz) + "</td><td>" + (r.s.t === "einsp" ? "M " + f(r.M) : "") + "</td></tr>"; });
      h += '<tr><th colspan="4">Stäbe (Auslastung Querschnitt)</th></tr>';
      res.mem.forEach((mr, j) => { const c = res.checks[j], u = Math.max(c.uMN, c.uV); h += "<tr><td><b>S" + (j + 1) + "</b></td><td>" + mr.m.name + "</td><td>max M " + f(mr.maxM) + "</td><td class='" + (u > 1 ? "bad" : u > 0.85 ? "warnc" : "okc") + "'><b>" + f(u * 100, 0) + " %</b></td></tr>"; });
      h += "</table><p class='muted'>Kräfte kN, Momente kNm. Knicken und Biegedrillknicken siehe Tab Stabilität.</p>";
    }
    return h + "</div>";
  };

  /* ---------- tables ---------- */
  const numIn = (k, id, fld, v) => '<input type="text" inputmode="decimal" data-k="' + k + '" data-id="' + id + '" data-f="' + fld + '" value="' + U.show(v) + '">';
  const intIn = (k, id, fld, v) => '<input type="text" inputmode="numeric" data-k="' + k + '" data-id="' + id + '" data-f="' + fld + '" value="' + v + '">';
  const lbl = (txt, inp) => "<label><span>" + txt + "</span>" + inp + "</label>";
  const del = (k, id) => '<button class="x" data-del data-k="' + k + '" data-id="' + id + '" title="Löschen">✕</button>';
  const profSelect = (id, cur) => {
    const groups = {}; F.profileNames().forEach(n => { const g = n.replace(/\d+$/, ""); (groups[g] = groups[g] || []).push(n); });
    return '<select data-k="mem" data-id="' + id + '" data-f="prof">' + Object.keys(groups).map(g => '<optgroup label="' + g + '">' + groups[g].map(n => opt(n, cur, n)).join("") + "</optgroup>").join("") + "</select>";
  };
  ui.tables = function (sys, res, ed) {
    const sel = (k, id) => (ed.sel && ed.sel.kind === k && ed.sel.id === id ? " sel" : "");
    let h = '<div class="card"><h3>Knoten</h3>';
    sys.nodes.forEach((o, i) => { h += '<div class="rowel' + sel("node", o.id) + '" data-kind="node" data-id="' + o.id + '"><b>' + (i + 1) + "</b>" + lbl("x", numIn("node", o.id, "x", o.x)) + lbl("z", numIn("node", o.id, "z", o.z)) + del("node", o.id) + "</div>"; });
    if (!sys.nodes.length) h += '<p class="muted">Noch keine Knoten.</p>';
    h += '</div><div class="card"><h3>Stäbe</h3>';
    sys.members.forEach((o, j) => {
      const a = F.nodeIndex(sys, o.a) + 1, b = F.nodeIndex(sys, o.b) + 1, mm = res.model && res.model.mem[j];
      h += '<div class="rowel wrap' + sel("mem", o.id) + '" data-kind="mem" data-id="' + o.id + '"><b>S' + (j + 1) + "</b>" + lbl("von", intIn("mem", o.id, "a", a)) + lbl("bis", intIn("mem", o.id, "b", b)) + profSelect(o.id, o.prof) +
        '<label><input type="checkbox" data-k="mem" data-id="' + o.id + '" data-f="ha"' + (o.ha ? " checked" : "") + '> Gelenk am Anfang</label><label><input type="checkbox" data-k="mem" data-id="' + o.id + '" data-f="hb"' + (o.hb ? " checked" : "") + "> Gelenk am Ende</label>" +
        (mm ? '<span class="muted">L = ' + f(mm.L) + " m</span>" : "") + del("mem", o.id) + "</div>";
    });
    if (!sys.members.length) h += '<p class="muted">Noch keine Stäbe.</p>';
    h += '</div><div class="card"><h3>Lager</h3>';
    sys.supports.forEach(o => {
      h += '<div class="rowel' + sel("sup", o.id) + '" data-kind="sup" data-id="' + o.id + '"><b>' + F.supLabel(sys, o.id) + "</b>" +
        '<select data-k="sup" data-id="' + o.id + '" data-f="t">' + [["fest", "Festlager"], ["los", "Loslager"], ["einsp", "Einspannung"]].map(t => opt(t[0], o.t, t[1])).join("") + "</select>" + lbl("Knoten", intIn("sup", o.id, "n", F.nodeIndex(sys, o.n) + 1)) +
        (o.t === "los" ? '<select data-k="sup" data-id="' + o.id + '" data-f="dir">' + opt("z", o.dir, "Reaktion ↑ (rollt waagrecht)") + opt("x", o.dir, "Reaktion → (rollt senkrecht)") + "</select>" : "") + del("sup", o.id) + "</div>";
    });
    if (!sys.supports.length) h += '<p class="muted">Noch kein Lager.</p>';
    h += '</div><div class="card"><h3>Lasten</h3>';
    sys.loads.forEach(o => {
      if (o.t === "F") h += '<div class="rowel wrap' + sel("load", o.id) + '" data-kind="load" data-id="' + o.id + '"><b>Knotenlast</b>' + lbl("Knoten", intIn("load", o.id, "n", F.nodeIndex(sys, o.n) + 1)) + lbl("F↓ kN", numIn("load", o.id, "fz", o.fz)) + lbl("F→ kN", numIn("load", o.id, "fx", o.fx)) + lbl("M↻ kNm", numIn("load", o.id, "m", o.m)) + del("load", o.id) + "</div>";
      else h += '<div class="rowel wrap' + sel("load", o.id) + '" data-kind="load" data-id="' + o.id + '"><b>Streckenlast</b>' + lbl("Stab", intIn("load", o.id, "mem", sys.members.findIndex(m => m.id === o.mem) + 1)) + lbl("q↓ kN/m", numIn("load", o.id, "qv", o.qv)) + lbl("q→ kN/m", numIn("load", o.id, "qh", o.qh)) + del("load", o.id) + "</div>";
    });
    if (!sys.loads.length) h += '<p class="muted">Keine Lasten.</p>';
    return h + '<p class="muted">Streckenlasten beziehen sich auf die Stablänge (z. B. Eigengewicht).</p></div>';
  };

  /* ---------- editing from tables ---------- */
  const coll = (sys, k) => ({ node: sys.nodes, mem: sys.members, sup: sys.supports, load: sys.loads }[k]);
  const find = (sys, k, id) => coll(sys, k).find(o => o.id === id);
  const nodeFields = (k, fld) => (k === "mem" && (fld === "a" || fld === "b")) || ((k === "sup" || (k === "load")) && fld === "n");
  ui.getField = function (sys, k, id, fld) {
    const o = find(sys, k, id); if (!o) return null;
    if (nodeFields(k, fld)) return F.nodeIndex(sys, o[fld]) + 1;
    if (k === "load" && fld === "mem") return sys.members.findIndex(m => m.id === o.mem) + 1;
    return o[fld];
  };
  ui.setField = function (sys, k, id, fld, raw) {
    const o = find(sys, k, id); if (!o) return;
    if (fld === "t" || fld === "dir" || fld === "prof") { o[fld] = raw; return; }
    if (fld === "ha" || fld === "hb") { o[fld] = raw === "1"; return; }
    const v = U.parse(raw); if (isNaN(v)) return;
    if (nodeFields(k, fld)) { const nd = sys.nodes[Math.round(v) - 1]; if (nd && !(k === "mem" && nd.id === o[fld === "a" ? "b" : "a"])) o[fld] = nd.id; return; }
    if (k === "load" && fld === "mem") { const m = sys.members[Math.round(v) - 1]; if (m) o.mem = m.id; return; }
    if (k === "node") o[fld] = fld === "x" ? U.clamp(v, 0, sys.W) : U.clamp(v, 0, sys.H); else o[fld] = v;
  };
  ui.remove = function (sys, k, id) {
    if (k === "node") {
      const gone = sys.members.filter(m => m.a === id || m.b === id).map(m => m.id);
      sys.nodes = sys.nodes.filter(o => o.id !== id); sys.members = sys.members.filter(o => !gone.includes(o.id));
      sys.supports = sys.supports.filter(o => o.n !== id); sys.loads = sys.loads.filter(o => (o.t === "q" ? !gone.includes(o.mem) : o.n !== id)); return;
    }
    if (k === "mem") { sys.members = sys.members.filter(o => o.id !== id); sys.loads = sys.loads.filter(o => !(o.t === "q" && o.mem === id)); return; }
    const key = { sup: "supports", load: "loads" }[k]; if (key) sys[key] = sys[key].filter(o => o.id !== id);
  };
  ui.action = () => null;

  /* ---------- mouse ---------- */
  const toModel = (sys, p) => { const g = geom(sys); return { x: (p.x - PX) / g.sc, z: (g.Hs - PB - p.y) / g.sc }; };
  const snap = (sys, p) => { const m = toModel(sys, p), r = v => +(Math.round(v / sys.snap) * sys.snap).toFixed(6); return { x: U.clamp(r(m.x), 0, sys.W), z: U.clamp(r(m.z), 0, sys.H) }; };
  ui.down = function (e, p, sys, res, ed) {
    const tgt = e.target.closest ? e.target.closest("[data-kind]") : null, tool = ed.tool, kind = tgt && tgt.dataset.kind, id = tgt && tgt.dataset.id;
    if (tool === "select") {
      if (!tgt) { ed.sel = null; return "sel"; }
      ed.sel = { kind, id }; if (kind === "node") ed.drag = { id };
      return "sel";
    }
    if (tool === "node") {
      const q = snap(sys, p);
      if (sys.nodes.some(n => Math.abs(n.x - q.x) < 1e-6 && Math.abs(n.z - q.z) < 1e-6)) return null;
      const n = { id: U.uid(), x: q.x, z: q.z }; sys.nodes.push(n); ed.sel = { kind: "node", id: n.id }; return "struct";
    }
    if (tool === "member") {
      if (kind !== "node") { ed.pending = null; return "move"; }
      if (!ed.pending) { ed.pending = { id }; return "move"; }
      const a = ed.pending.id; ed.pending = null;
      if (a === id || sys.members.some(m => (m.a === a && m.b === id) || (m.a === id && m.b === a))) return "move";
      const prev = sys.members[sys.members.length - 1], m = { id: U.uid(), a, b: id, prof: prev ? prev.prof : "IPE200", ha: false, hb: false }; sys.members.push(m); ed.sel = { kind: "mem", id: m.id }; return "struct";
    }
    if (tool === "fest" || tool === "los" || tool === "einsp") {
      if (kind !== "node") return null;
      const ex = sys.supports.find(o => o.n === id);
      if (ex) { ex.t = tool; ed.sel = { kind: "sup", id: ex.id }; } else { const o = { id: U.uid(), n: id, t: tool, dir: "z" }; sys.supports.push(o); ed.sel = { kind: "sup", id: o.id }; }
      return "struct";
    }
    if (tool === "F") {
      if (kind !== "node") return null;
      let ex = sys.loads.find(o => o.t === "F" && o.n === id);
      if (!ex) { ex = { id: U.uid(), t: "F", n: id, fx: 0, fz: 10, m: 0 }; sys.loads.push(ex); }
      ed.sel = { kind: "load", id: ex.id }; return "struct";
    }
    if (tool === "q") {
      if (kind !== "mem") return null;
      let ex = sys.loads.find(o => o.t === "q" && o.mem === id);
      if (!ex) { ex = { id: U.uid(), t: "q", mem: id, qv: 10, qh: 0 }; sys.loads.push(ex); }
      ed.sel = { kind: "load", id: ex.id }; return "struct";
    }
    if (tool === "hinge") {
      if (kind !== "mem") return null;
      const m = sys.members.find(o => o.id === id), a = sys.nodes[F.nodeIndex(sys, m.a)], b = sys.nodes[F.nodeIndex(sys, m.b)], g = geom(sys);
      const da = Math.hypot(p.x - g.X(a.x), p.y - g.Y(a.z)), db = Math.hypot(p.x - g.X(b.x), p.y - g.Y(b.z));
      if (da <= db) m.ha = !m.ha; else m.hb = !m.hb;
      ed.sel = { kind: "mem", id }; return "struct";
    }
    return null;
  };
  ui.move = function (e, p, sys, res, ed) {
    if (!ed.drag) return null;
    const n = sys.nodes.find(o => o.id === ed.drag.id); if (!n) return null;
    const q = snap(sys, p); n.x = q.x; n.z = q.z; return "move";
  };
  ui.up = function (e, p, sys, res, ed) { if (ed.drag) { ed.drag = null; return "struct"; } return null; };
})(window.APP);
