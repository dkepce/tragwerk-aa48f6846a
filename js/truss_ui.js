/* Tragwerk — Fachwerk screen: drawing, tables, mouse handling (APP.typeUI.truss). */
(function (APP) {
  const U = APP.U, S = APP.svg, T = APP.truss, f = U.fmt;
  const W = 1000, PX = 100, PT = 80, PB = 150;   // side, top and bottom margins (room for loads and reactions)
  const ui = ((APP.typeUI = APP.typeUI || {}).truss = {});

  ui.tools = [["select", "Auswahl"], ["node", "Knoten"], ["member", "Stab"], ["fest", "Festlager"], ["los", "Loslager"], ["load", "Last"]];
  ui.hints = {
    select: "Auswahl: Knoten, Stäbe, Lager oder Lasten anklicken; Knoten lassen sich verschieben. Entf löscht.",
    node: "Knoten: in die Zeichenfläche klicken (rastet am Raster ein).", member: "Stab: erst Knoten A, dann Knoten B anklicken.",
    fest: "Festlager: auf einen Knoten klicken.", los: "Loslager: auf einen Knoten klicken (Richtung rechts in der Tabelle).",
    load: "Last: auf einen Knoten klicken, Größe danach rechts in der Tabelle."
  };
  const geom = sys => { const sc = (W - 2 * PX) / sys.W; const Hs = Math.round(PT + PB + sys.H * sc); return { sc, Hs, X: x => PX + x * sc, Y: z => Hs - PB - z * sc }; };
  ui.viewBox = sys => "0 0 " + W + " " + geom(sys).Hs;
  const plain = s => String(s).replace(/<sub>(.*?)<\/sub>/g, "$1");

  ui.params = sys => '<label>Breite <input type="text" inputmode="decimal" data-p="W" value="' + U.show(sys.W) + '"> m</label>' +
    '<label>Höhe <input type="text" inputmode="decimal" data-p="H" value="' + U.show(sys.H) + '"> m</label>' +
    '<label>Raster <select data-p="snap">' + [0.1, 0.25, 0.5, 1].map(v => '<option value="' + v + '"' + (sys.snap === v ? " selected" : "") + ">" + U.show(v) + " m</option>").join("") + "</select></label>";
  ui.setParam = function (sys, name, raw) {
    const v = U.parse(raw); if (isNaN(v) || v <= 0) return;
    if (name === "W") sys.W = v; else if (name === "H") sys.H = v; else if (name === "snap") sys.snap = v;
  };

  /* ---------- drawing ---------- */
  ui.draw = function (sys, res, ed) {
    const g = geom(sys), X = g.X, Y = g.Y, sel = ed.sel || {};
    const cls = (kind, id) => "el" + (sel.kind === kind && sel.id === id ? " sel" : "");
    let s = "";
    if (sys.snap * g.sc >= 12) {   // grid dots
      for (let x = 0; x <= sys.W + 1e-9; x += sys.snap) for (let z = 0; z <= sys.H + 1e-9; z += sys.snap) s += S.circle(X(x), Y(z), 1.2, "gdot");
    }
    s += S.line(X(0), Y(0), X(sys.W), Y(0), "ruler") + S.line(X(0), Y(0), X(0), Y(sys.H), "ruler");
    /* members */
    sys.members.forEach((m, j) => {
      const a = sys.nodes[T.nodeIndex(sys, m.a)], b = sys.nodes[T.nodeIndex(sys, m.b)]; if (!a || !b) return;
      const mm = res.mem && res.ok ? res.mem[j] : null, col = mm ? "m-" + mm.state : "m-none";
      const mx = (X(a.x) + X(b.x)) / 2, my = (Y(a.z) + Y(b.z)) / 2, d = 'data-kind="mem" data-id="' + m.id + '"';
      let t = S.line(X(a.x), Y(a.z), X(b.x), Y(b.z), "member " + col) + S.line(X(a.x), Y(a.z), X(b.x), Y(b.z), "hitline");
      let label = "S" + (j + 1);
      if (mm) label += mm.state === "null" ? " = 0" : " = " + f(mm.S);
      const ang = Math.atan2(Y(b.z) - Y(a.z), X(b.x) - X(a.x)), nx = -Math.sin(ang) * 13, ny = Math.cos(ang) * 13;
      t += S.text(mx + nx, my + ny + 4, label, "lbl small mlabel");
      s += "<g " + d + ' class="' + cls("mem", m.id) + '">' + t + "</g>";
    });
    /* supports */
    sys.supports.forEach((o, i) => {
      const n = sys.nodes[T.nodeIndex(sys, o.n)]; if (!n) return;
      const x = X(n.x), y = Y(n.z), d = 'data-kind="tsup" data-id="' + o.id + '"';
      let t = "";
      if (o.t === "fest") t = S.poly([[x, y + 4], [x - 15, y + 34], [x + 15, y + 34]], "sym") + S.line(x - 22, y + 34, x + 22, y + 34, "ground") + S.hatch(x - 20, x + 22, y + 34);
      else if (o.dir === "x") t = S.poly([[x - 4, y], [x - 34, y - 14], [x - 34, y + 14]], "sym") + S.circle(x - 39, y - 8, 4, "sym") + S.circle(x - 39, y + 8, 4, "sym") + S.line(x - 47, y - 22, x - 47, y + 22, "ground");
      else t = S.poly([[x, y + 4], [x - 14, y + 26], [x + 14, y + 26]], "sym") + S.circle(x - 8, y + 31, 4, "sym") + S.circle(x + 8, y + 31, 4, "sym") + S.line(x - 22, y + 39, x + 22, y + 39, "ground") + S.hatch(x - 20, x + 22, y + 39);
      s += "<g " + d + ' class="' + cls("tsup", o.id) + '">' + t + '<rect class="hit" x="' + (x - 40) + '" y="' + (y - 20) + '" width="80" height="64"/></g>';
    });
    /* loads */
    sys.loads.forEach(l => {
      const n = sys.nodes[T.nodeIndex(sys, l.n)]; if (!n) return;
      const x = X(n.x), y = Y(n.z), d = 'data-kind="tload" data-id="' + l.id + '"'; let t = "";
      if (Math.abs(l.fz) > 1e-9) {
        t += l.fz > 0 ? S.arrow(x, y - 70, x, y - 9, "col-load") + S.text(x + 6, y - 66, f(Math.abs(l.fz)) + " kN", "lbl load", "start")
          : S.arrow(x, y + 70, x, y + 9, "col-load") + S.text(x + 6, y + 80, f(Math.abs(l.fz)) + " kN", "lbl load", "start");
        t += '<rect class="hit" x="' + (x - 10) + '" y="' + (l.fz > 0 ? y - 72 : y + 8) + '" width="20" height="64"/>';
      }
      if (Math.abs(l.fx) > 1e-9) {
        t += l.fx > 0 ? S.arrow(x - 70, y, x - 9, y, "col-load") + S.text(x - 66, y - 6, f(Math.abs(l.fx)) + " kN", "lbl load", "start")
          : S.arrow(x + 70, y, x + 9, y, "col-load") + S.text(x + 66, y - 6, f(Math.abs(l.fx)) + " kN", "lbl load", "end");
        t += '<rect class="hit" x="' + (l.fx > 0 ? x - 72 : x + 8) + '" y="' + (y - 10) + '" width="64" height="20"/>';
      }
      if (!t) t = S.circle(x, y - 14, 5, "col-load");
      s += "<g " + d + ' class="' + cls("tload", l.id) + '">' + t + "</g>";
    });
    /* reactions */
    if (res.ok) {
      const by = {};
      res.rea.forEach(q => { (by[q.ni] = by[q.ni] || []).push(q); });
      Object.keys(by).forEach(ni => {
        const n = sys.nodes[ni], qs = by[ni], x = X(n.x), y = Y(n.z), txt = [];
        qs.forEach(q => {
          const v = q.value;
          if (Math.abs(v) < 1e-9) { txt.push(plain(q.name) + " = 0"); return; }
          if (q.c === "z") s += v > 0 ? S.arrow(x, y + 108, x, y + 66, "col-react") : S.arrow(x, y + 66, x, y + 108, "col-react");
          else s += v > 0 ? S.arrow(x - 96, y + 18, x - 54, y + 18, "col-react") : S.arrow(x - 54, y + 18, x - 96, y + 18, "col-react");
          txt.push(plain(q.name) + " = " + f(v));
        });
        s += S.text(x, y + 124, txt.join(" · ") + " kN", "lbl react");
      });
    }
    /* nodes on top */
    sys.nodes.forEach((n, i) => {
      const d = 'data-kind="node" data-id="' + n.id + '"', pend = ed.pending && ed.pending.id === n.id;
      s += "<g " + d + ' class="' + cls("node", n.id) + (pend ? " pend" : "") + '">' + S.circle(X(n.x), Y(n.z), 7, "nodec") + S.circle(X(n.x), Y(n.z), 16, "hit") + S.text(X(n.x) - 11, Y(n.z) - 11, String(i + 1), "lbl nlabel", "end") + "</g>";
    });
    return s;
  };

  ui.diagrams = () => "";

  ui.results = function (sys, res) {
    let h = '<div class="card"><h3>Ergebnis</h3><p class="status ' + (res.ok ? "ok" : "warn") + '">' + U.esc(res.msg) + "</p>";
    h += '<p class="muted">k = ' + res.abz.k + ' Knoten · m = ' + res.abz.m + ' Stäbe · r = ' + res.abz.r + ' Reaktionen · m + r ' + (res.abz.lhs === res.abz.rhs ? "=" : res.abz.lhs > res.abz.rhs ? ">" : "<") + " 2k</p>";
    if (res.ok) {
      h += '<table class="tbl"><tr><th colspan="3">Auflager</th></tr>';
      res.rea.forEach(q => { h += "<tr><td>" + q.name + "</td><td><b>" + f(q.value) + "</b> kN</td><td>" + (q.c === "x" ? (q.value >= 0 ? "→" : "←") : (q.value >= 0 ? "↑" : "↓")) + "</td></tr>"; });
      h += '<tr><th colspan="3">Stabkräfte</th></tr>';
      res.mem.forEach(m => { h += "<tr><td>S<sub>" + (m.j + 1) + "</sub> <span class='muted'>(" + (m.ia + 1) + "–" + (m.ib + 1) + ")</span></td><td><b>" + f(m.S) + "</b> kN</td><td class='st-" + m.state + "'>" + (m.state === "zug" ? "Zug" : m.state === "druck" ? "Druck" : "Nullstab") + "</td></tr>"; });
      h += "</table>";
    }
    return h + "</div>";
  };

  /* ---------- tables ---------- */
  const numIn = (k, id, fld, v) => '<input type="text" inputmode="decimal" data-k="' + k + '" data-id="' + id + '" data-f="' + fld + '" value="' + U.show(v) + '">';
  const intIn = (k, id, fld, v) => '<input type="text" inputmode="numeric" data-k="' + k + '" data-id="' + id + '" data-f="' + fld + '" value="' + v + '">';
  const lbl = (txt, inp) => "<label><span>" + txt + "</span>" + inp + "</label>";
  const del = (k, id) => '<button class="x" data-del data-k="' + k + '" data-id="' + id + '" title="Löschen">✕</button>';
  ui.tables = function (sys, res, ed) {
    const sel = (k, id) => (ed.sel && ed.sel.kind === k && ed.sel.id === id ? " sel" : "");
    let h = '<div class="card"><h3>Knoten</h3>';
    sys.nodes.forEach((o, i) => { h += '<div class="rowel' + sel("node", o.id) + '" data-kind="node" data-id="' + o.id + '"><b>' + (i + 1) + "</b>" + lbl("x", numIn("node", o.id, "x", o.x)) + lbl("z", numIn("node", o.id, "z", o.z)) + del("node", o.id) + "</div>"; });
    if (!sys.nodes.length) h += '<p class="muted">Noch keine Knoten – Werkzeug „Knoten“ wählen und in die Fläche klicken.</p>';
    h += "</div>";
    h += '<div class="card"><h3>Stäbe</h3>';
    sys.members.forEach((o, j) => {
      const a = T.nodeIndex(sys, o.a) + 1, b = T.nodeIndex(sys, o.b) + 1, mm = res.mem && res.mem[j];
      h += '<div class="rowel' + sel("mem", o.id) + '" data-kind="mem" data-id="' + o.id + '"><b>S' + (j + 1) + "</b>" + lbl("von", intIn("mem", o.id, "a", a)) + lbl("bis", intIn("mem", o.id, "b", b)) + (mm ? '<span class="muted">' + f(mm.len) + " m</span>" : "") + del("mem", o.id) + "</div>";
    });
    if (!sys.members.length) h += '<p class="muted">Noch keine Stäbe.</p>';
    h += "</div>";
    h += '<div class="card"><h3>Lager</h3>';
    sys.supports.forEach(o => {
      h += '<div class="rowel' + sel("tsup", o.id) + '" data-kind="tsup" data-id="' + o.id + '"><b>' + T.supLabel(sys, o.id) + "</b>" +
        '<select data-k="tsup" data-id="' + o.id + '" data-f="t">' + ["fest", "los"].map(t => '<option value="' + t + '"' + (o.t === t ? " selected" : "") + ">" + T.typeName(t) + "</option>").join("") + "</select>" +
        lbl("Knoten", intIn("tsup", o.id, "n", T.nodeIndex(sys, o.n) + 1)) +
        (o.t === "los" ? '<select data-k="tsup" data-id="' + o.id + '" data-f="dir"><option value="z"' + (o.dir === "z" ? " selected" : "") + '>Reaktion ↑ (rollt waagrecht)</option><option value="x"' + (o.dir === "x" ? " selected" : "") + ">Reaktion → (rollt senkrecht)</option></select>" : "") +
        del("tsup", o.id) + "</div>";
    });
    if (!sys.supports.length) h += '<p class="muted">Noch kein Lager.</p>';
    h += "</div>";
    h += '<div class="card"><h3>Lasten (an Knoten)</h3>';
    sys.loads.forEach(o => { h += '<div class="rowel' + sel("tload", o.id) + '" data-kind="tload" data-id="' + o.id + '">' + lbl("Knoten", intIn("tload", o.id, "n", T.nodeIndex(sys, o.n) + 1)) + lbl("F↓ kN", numIn("tload", o.id, "fz", o.fz)) + lbl("F→ kN", numIn("tload", o.id, "fx", o.fx)) + del("tload", o.id) + "</div>"; });
    if (!sys.loads.length) h += '<p class="muted">Keine Lasten.</p>';
    return h + "</div>";
  };

  /* ---------- editing from tables ---------- */
  const coll = (sys, k) => ({ node: sys.nodes, mem: sys.members, tsup: sys.supports, tload: sys.loads }[k]);
  const find = (sys, k, id) => coll(sys, k).find(o => o.id === id);
  ui.getField = function (sys, k, id, fld) {
    const o = find(sys, k, id); if (!o) return null;
    if ((k === "mem" && (fld === "a" || fld === "b")) || ((k === "tsup" || k === "tload") && fld === "n")) return T.nodeIndex(sys, o[fld]) + 1;
    return o[fld];
  };
  ui.setField = function (sys, k, id, fld, raw) {
    const o = find(sys, k, id); if (!o) return;
    if (fld === "t" || fld === "dir") { o[fld] = raw; return; }
    const v = U.parse(raw); if (isNaN(v)) return;
    if ((k === "mem" && (fld === "a" || fld === "b")) || ((k === "tsup" || k === "tload") && fld === "n")) {
      const nd = sys.nodes[Math.round(v) - 1]; if (nd && !(k === "mem" && nd.id === o[fld === "a" ? "b" : "a"])) o[fld] = nd.id; return;
    }
    if (k === "node") o[fld] = fld === "x" ? U.clamp(v, 0, sys.W) : U.clamp(v, 0, sys.H); else o[fld] = v;
  };
  ui.remove = function (sys, k, id) {
    if (k === "node") {
      sys.nodes = sys.nodes.filter(o => o.id !== id); sys.members = sys.members.filter(o => o.a !== id && o.b !== id);
      sys.supports = sys.supports.filter(o => o.n !== id); sys.loads = sys.loads.filter(o => o.n !== id); return;
    }
    const key = { mem: "members", tsup: "supports", tload: "loads" }[k]; if (key) sys[key] = sys[key].filter(o => o.id !== id);
  };
  ui.action = () => null;

  /* ---------- mouse ---------- */
  const toModel = (sys, p) => { const g = geom(sys); return { x: (p.x - PX) / g.sc, z: (g.Hs - PB - p.y) / g.sc }; };
  const snap = (sys, p) => {
    const m = toModel(sys, p), r = v => +(Math.round(v / sys.snap) * sys.snap).toFixed(6);
    return { x: U.clamp(r(m.x), 0, sys.W), z: U.clamp(r(m.z), 0, sys.H) };
  };
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
      const m = { id: U.uid(), a, b: id }; sys.members.push(m); ed.sel = { kind: "mem", id: m.id }; return "struct";
    }
    if (tool === "fest" || tool === "los") {
      if (kind !== "node") return null;
      const ex = sys.supports.find(o => o.n === id);
      if (ex) { ex.t = tool; ed.sel = { kind: "tsup", id: ex.id }; } else { const o = { id: U.uid(), n: id, t: tool, dir: "z" }; sys.supports.push(o); ed.sel = { kind: "tsup", id: o.id }; }
      return "struct";
    }
    if (tool === "load") {
      if (kind !== "node") return null;
      let ex = sys.loads.find(o => o.n === id);
      if (!ex) { ex = { id: U.uid(), n: id, fx: 0, fz: 10 }; sys.loads.push(ex); }
      ed.sel = { kind: "tload", id: ex.id }; return "struct";
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
