/* Tragwerk — Fachwerk (truss): Abzählkriterium, Auflagerkräfte, Stabkräfte (Knotenpunktverfahren). Pure maths, no DOM.
   Conventions: x to the right, z UP (like the drawing). Loads: Fx positive →, Fz positive DOWN (↓).
   Reactions: Rx positive →, Rz positive UP (↑). Member force S: positive = Zug (tension), negative = Druck (compression). */
(function (APP) {
  const U = APP.U, EPS = 1e-9, f = U.fmt;
  const T = (APP.truss = {});
  const LETTERS = "ABCDEFGH";

  /* ---------- data ---------- */
  T.blank = function () {
    return { id: U.uid(), type: "truss", name: "Fachwerk", W: 12, H: 6, snap: 0.5, nodes: [], members: [], supports: [], loads: [] };
  };
  T.example = function () {
    const s = T.blank(); s.name = "Fachwerkträger"; s.W = 10; s.H = 4;
    const xy = [[0, 0], [4, 0], [8, 0], [2, 2], [6, 2]];
    s.nodes = xy.map(p => ({ id: U.uid(), x: p[0], z: p[1] }));
    const N = s.nodes, link = [[0, 1], [1, 2], [3, 4], [0, 3], [3, 1], [1, 4], [4, 2]];
    s.members = link.map(p => ({ id: U.uid(), a: N[p[0]].id, b: N[p[1]].id }));
    s.supports = [{ id: U.uid(), n: N[0].id, t: "fest", dir: "z" }, { id: U.uid(), n: N[2].id, t: "los", dir: "z" }];
    s.loads = [{ id: U.uid(), n: N[1].id, fx: 0, fz: 20 }, { id: U.uid(), n: N[3].id, fx: 5, fz: 0 }];
    return s;
  };
  T.fix = function (s) {
    s.W = U.num(s.W, 12); if (s.W <= 0) s.W = 12;
    s.H = U.num(s.H, 6); if (s.H <= 0) s.H = 6;
    s.snap = U.num(s.snap, 0.5); if (s.snap <= 0) s.snap = 0.5;
    s.name = s.name || "Fachwerk";
    ["nodes", "members", "supports", "loads"].forEach(k => { s[k] = Array.isArray(s[k]) ? s[k] : []; });
    s.nodes = s.nodes.map(o => ({ id: o.id || U.uid(), x: U.num(o.x, 0), z: U.num(o.z, 0) }));
    const has = {}; s.nodes.forEach(n => { has[n.id] = true; });
    s.members = s.members.filter(o => has[o.a] && has[o.b] && o.a !== o.b).map(o => ({ id: o.id || U.uid(), a: o.a, b: o.b }));
    s.supports = s.supports.filter(o => has[o.n] && ["fest", "los"].includes(o.t)).map(o => ({ id: o.id || U.uid(), n: o.n, t: o.t, dir: o.dir === "x" ? "x" : "z" }));
    s.loads = s.loads.filter(o => has[o.n]).map(o => ({ id: o.id || U.uid(), n: o.n, fx: U.num(o.fx, 0), fz: U.num(o.fz, 0) }));
  };
  T.nodeIndex = (sys, id) => sys.nodes.findIndex(n => n.id === id);
  T.supLabel = (sys, id) => { const i = sys.supports.findIndex(s => s.id === id); return LETTERS[i] || "S" + (i + 1); };
  T.typeName = t => ({ fest: "Festlager", los: "Loslager" }[t] || t);

  /* ---------- solve ---------- */
  T.solve = function (sys) {
    const res = { ok: false, kind: "", msg: "", warn: [], mem: [], rea: [], abz: null };
    const nodes = sys.nodes, k = nodes.length, idx = {};
    nodes.forEach((n, i) => { idx[n.id] = i; });
    sys.members.forEach((m, j) => {
      const ia = idx[m.a], ib = idx[m.b], dx = nodes[ib].x - nodes[ia].x, dz = nodes[ib].z - nodes[ia].z, len = Math.hypot(dx, dz);
      res.mem.push({ j, id: m.id, ia, ib, len, c: len > EPS ? dx / len : 0, s: len > EPS ? dz / len : 0, S: 0, state: "" });
      if (len <= EPS) res.warn.push("Stab S" + (j + 1) + " hat die Länge 0.");
    });
    const seen = {};
    sys.members.forEach((m, j) => { const key = [m.a, m.b].sort().join("|"); if (seen[key] != null) res.warn.push("Stab S" + (j + 1) + " liegt doppelt (wie S" + (seen[key] + 1) + ")."); seen[key] = j; });
    nodes.forEach((n, i) => { if (!res.mem.some(mm => mm.ia === i || mm.ib === i)) res.warn.push("Knoten " + (i + 1) + " hat keinen Stab."); });
    sys.supports.forEach((s, i) => {
      const ni = idx[s.n], label = LETTERS[i] || "S" + (i + 1);
      if (s.t === "fest") res.rea.push({ s, label, ni, c: "x", name: label + "<sub>x</sub>", value: 0 }, { s, label, ni, c: "z", name: label + "<sub>z</sub>", value: 0 });
      else if (s.dir === "x") res.rea.push({ s, label, ni, c: "x", name: label + "<sub>x</sub>", value: 0 });
      else res.rea.push({ s, label, ni, c: "z", name: label + "<sub>z</sub>", value: 0 });
    });
    const m = res.mem.length, r = res.rea.length;
    res.abz = { m, r, k, lhs: m + r, rhs: 2 * k };
    if (!k || !m) { res.kind = "labil"; res.msg = "Setze Knoten und verbinde sie mit Stäben."; return res; }
    if (res.warn.length) { res.kind = "labil"; res.msg = res.warn[0]; return res; }
    if (!r) { res.kind = "labil"; res.msg = "Es ist noch kein Lager gesetzt."; return res; }
    if (m + r > 2 * k) { res.kind = "unbestimmt"; res.msg = (m + r - 2 * k) + "-fach statisch unbestimmt (m + r = " + (m + r) + " > 2k = " + 2 * k + "). Das kann Version 1 noch nicht lösen."; return res; }
    if (m + r < 2 * k) { res.kind = "labil"; res.msg = "Labil (Mechanismus): m + r = " + (m + r) + " ist kleiner als 2k = " + 2 * k + "."; return res; }

    const A = [], b = [];
    for (let i = 0; i < 2 * k; i++) { A.push(new Array(m + r).fill(0)); b.push(0); }
    res.mem.forEach((mm, j) => {
      A[2 * mm.ia][j] += mm.c; A[2 * mm.ia + 1][j] += mm.s;
      A[2 * mm.ib][j] -= mm.c; A[2 * mm.ib + 1][j] -= mm.s;
    });
    res.rea.forEach((q, j) => { A[2 * q.ni + (q.c === "x" ? 0 : 1)][m + j] = 1; });
    sys.loads.forEach(l => { const i = idx[l.n]; b[2 * i] -= l.fx; b[2 * i + 1] += l.fz; });
    const g = U.solve(A, b);
    if (!g.full || !g.consistent) { res.kind = "labil"; res.msg = "Labil: Das System ist nicht stabil gelagert oder Teile sind nicht ausgesteift (Determinante = 0)."; return res; }
    let big = 0; g.x.slice(0, m).forEach(v => { big = Math.max(big, Math.abs(v)); });
    res.mem.forEach((mm, j) => {
      mm.S = g.x[j];
      mm.state = Math.abs(mm.S) < 1e-7 * Math.max(1, big) ? "null" : mm.S > 0 ? "zug" : "druck";
      if (mm.state === "null") mm.S = 0;
    });
    res.rea.forEach((q, j) => { q.value = g.x[m + j]; });
    res.ok = true; res.kind = "ok"; res.msg = "Statisch bestimmt (m + r = 2k: " + m + " + " + r + " = " + 2 * k + ").";
    return res;
  };

  /* ---------- Rechenweg (HTML) ---------- */
  const p = h => "<p>" + h + "</p>", eqDiv = h => '<div class="eq">' + h + "</div>";
  function lin(parts) {   // parts: [{v, body}]
    let s = "";
    parts.forEach((q, i) => { const neg = q.v < 0; s += i === 0 ? (neg ? "−" : "") : (neg ? " − " : " + "); s += q.body; });
    return s || "0";
  }
  const sName = j => "S<sub>" + (j + 1) + "</sub>";
  const stateText = mm => (mm.state === "zug" ? "Zug" : mm.state === "druck" ? "Druck" : "Nullstab");

  T.steps = function (sys, res) {
    const steps = [], a = res.abz;
    let h = p("Das Fachwerk hat <b>" + a.k + " Knoten</b> (k), <b>" + a.m + " Stäbe</b> (m) und <b>" + a.r + " Auflagerreaktionen</b> (r).");
    h += eqDiv("Abzählkriterium: &nbsp; m + r = 2·k &nbsp;⇒&nbsp; " + a.m + " + " + a.r + " &nbsp;" + (a.lhs === a.rhs ? "=" : a.lhs > a.rhs ? ">" : "<") + "&nbsp; 2·" + a.k + " = " + a.rhs);
    h += p(a.lhs === a.rhs ? "Gleich viele Gleichungen wie Unbekannte: das Fachwerk ist (äußerlich und innerlich zusammen) <b>statisch bestimmt</b>, sofern es nicht verschieblich ist." : "<b>" + U.esc(res.msg) + "</b>");
    steps.push({ title: "Abzählkriterium", html: h });
    if (!res.ok) { steps.push({ title: "Ergebnis", html: p("<b>" + U.esc(res.msg) + "</b>") }); return steps; }

    /* global equilibrium (textbook route) when there are exactly 3 reaction components */
    const nodes = sys.nodes;
    if (res.rea.length === 3) {
      const ref = nodes[res.rea[0].ni], R = res.rea;
      const eqH = [], eqV = [], eqM = [];
      R.forEach(q => {
        if (q.c === "x") { eqH.push({ v: 1, body: q.name }); const arm = nodes[q.ni].z - ref.z; if (Math.abs(arm) > EPS) eqM.push({ v: arm, body: f(Math.abs(arm)) + "·" + q.name }); }
        else { eqV.push({ v: 1, body: q.name }); const arm = nodes[q.ni].x - ref.x; if (Math.abs(arm) > EPS) eqM.push({ v: -arm, body: f(Math.abs(arm)) + "·" + q.name }); }
      });
      sys.loads.forEach(l => {
        const n = nodes[T.nodeIndex(sys, l.n)];
        if (Math.abs(l.fx) > EPS) { eqH.push({ v: l.fx, body: f(Math.abs(l.fx)) }); const arm = n.z - ref.z; if (Math.abs(arm * l.fx) > EPS) eqM.push({ v: l.fx * arm, body: f(Math.abs(l.fx)) + "·" + f(Math.abs(arm)) }); }
        if (Math.abs(l.fz) > EPS) { eqV.push({ v: -l.fz, body: f(Math.abs(l.fz)) }); const arm = n.x - ref.x; if (Math.abs(arm * l.fz) > EPS) eqM.push({ v: l.fz * arm, body: f(Math.abs(l.fz)) + "·" + f(Math.abs(arm)) }); }
      });
      h = p("Zuerst das Gleichgewicht am <b>Gesamtsystem</b> (alle äußeren Kräfte). Positiv: Rx → , Rz ↑ , Lasten Fz ↓ , Momente ↻ um Knoten " + (T.nodeIndex(sys, R[0].s.n) + 1) + ".");
      h += eqDiv("ΣM um Knoten " + (T.nodeIndex(sys, R[0].s.n) + 1) + " = 0:&nbsp; " + lin(eqM) + " = 0") + eqDiv("ΣV = 0 (↑ +):&nbsp; " + lin(eqV) + " = 0") + eqDiv("ΣH = 0 (→ +):&nbsp; " + lin(eqH) + " = 0");
      R.forEach(q => { h += eqDiv(q.name + " = <b>" + f(q.value) + " kN</b> &nbsp;(" + (q.c === "x" ? (q.value >= 0 ? "→" : "←") : (q.value >= 0 ? "↑" : "↓")) + ")"); });
      steps.push({ title: "Auflagerkräfte (Gesamtgleichgewicht)", html: h });
    } else {
      h = p("Bei " + res.rea.length + " Reaktionskomponenten reicht das Gesamtgleichgewicht nicht; die Reaktionen kommen aus dem Gleichungssystem aller Knoten:");
      res.rea.forEach(q => { h += eqDiv(q.name + " = <b>" + f(q.value) + " kN</b>"); });
      steps.push({ title: "Auflagerkräfte", html: h });
    }

    /* Knotenpunktverfahren */
    const known = {};
    h = p("An jedem Knoten gilt ΣH = 0 und ΣV = 0. Stabkräfte werden als <b>Zug</b> (vom Knoten weg) angenommen; ein negatives Ergebnis bedeutet <b>Druck</b>. Es wird bei einem Knoten mit höchstens zwei unbekannten Stabkräften begonnen.");
    let progress = true, nodeSteps = 0;
    const done = {};
    while (progress) {
      progress = false;
      for (let i = 0; i < nodes.length; i++) {
        if (done[i]) continue;
        const att = res.mem.filter(mm => mm.ia === i || mm.ib === i);
        const unk = att.filter(mm => !(mm.j in known));
        if (unk.length === 0 || unk.length > 2) continue;
        const dir = mm => (i === mm.ia ? [mm.c, mm.s] : [-mm.c, -mm.s]);
        let Kx = 0, Kz = 0; const knownTxt = [];
        sys.loads.forEach(l => { if (T.nodeIndex(sys, l.n) === i) { Kx += l.fx; Kz -= l.fz; } });
        res.rea.forEach(q => { if (q.ni === i) { if (q.c === "x") Kx += q.value; else Kz += q.value; } });
        att.forEach(mm => { if (mm.j in known) { const d = dir(mm); Kx += d[0] * known[mm.j]; Kz += d[1] * known[mm.j]; } });
        const d1 = dir(unk[0]);
        let vals;
        if (unk.length === 2) {
          const d2 = dir(unk[1]), det = d1[0] * d2[1] - d2[0] * d1[1];
          if (Math.abs(det) < 1e-9) continue;
          vals = [(-Kx * d2[1] + Kz * d2[0]) / det, (-Kz * d1[0] + Kx * d1[1]) / det];
        } else {
          vals = [Math.abs(d1[0]) >= Math.abs(d1[1]) ? -Kx / d1[0] : -Kz / d1[1]];
        }
        const eqPart = (axis) => {
          const parts = unk.map((mm, q) => { const d = dir(mm)[axis]; return Math.abs(d) < 1e-9 ? null : { v: d, body: (Math.abs(Math.abs(d) - 1) < 1e-9 ? "" : f(Math.abs(d), 3) + "·") + sName(mm.j) }; }).filter(Boolean);
          const K = axis === 0 ? Kx : Kz; if (Math.abs(K) > 1e-9) parts.push({ v: K, body: f(Math.abs(K)) });
          return lin(parts);
        };
        h += "<h4>Knoten " + (i + 1) + "</h4>" + eqDiv("ΣH = 0:&nbsp; " + eqPart(0) + " = 0") + eqDiv("ΣV = 0:&nbsp; " + eqPart(1) + " = 0");
        unk.forEach((mm, q) => { known[mm.j] = vals[q]; h += eqDiv("⇒ " + sName(mm.j) + " = <b>" + f(vals[q]) + " kN</b> &nbsp;(" + (Math.abs(vals[q]) < 1e-7 ? "Nullstab" : vals[q] > 0 ? "Zug" : "Druck") + ")"); });
        done[i] = true; progress = true; nodeSteps++;
      }
    }
    const left = res.mem.filter(mm => !(mm.j in known));
    if (left.length) h += p("Für " + left.map(mm => sName(mm.j)).join(", ") + " reicht ein einzelner Knoten nicht aus (mehr als zwei Unbekannte oder parallele Stäbe). Dort hilft ein <b>Ritter-Schnitt</b>; hier wurden die Werte aus dem Gleichungssystem aller Knoten übernommen.");
    steps.push({ title: "Knotenpunktverfahren", html: h });

    /* result table */
    h = '<table class="tbl"><tr><th>Stab</th><th>Knoten</th><th>Länge [m]</th><th>Kraft [kN]</th><th></th></tr>';
    res.mem.forEach(mm => { h += "<tr><td>" + sName(mm.j) + "</td><td>" + (mm.ia + 1) + " – " + (mm.ib + 1) + "</td><td>" + f(mm.len) + "</td><td><b>" + f(mm.S) + "</b></td><td>" + stateText(mm) + "</td></tr>"; });
    h += "</table>";
    let sm = 0, sv = 0, sh = 0; const ref = nodes[res.rea[0].ni];
    sys.loads.forEach(l => { const n = nodes[T.nodeIndex(sys, l.n)]; sh += l.fx; sv -= l.fz; sm += l.fz * (n.x - ref.x) + l.fx * (n.z - ref.z); });
    res.rea.forEach(q => { const n = nodes[q.ni]; if (q.c === "x") { sh += q.value; sm += q.value * (n.z - ref.z); } else { sv += q.value; sm -= q.value * (n.x - ref.x); } });
    const ok = v => (Math.abs(v) < 1e-6 ? " ✓" : " ✗");
    h += p("<b>Probe</b> am Gesamtsystem mit den berechneten Auflagerkräften:") + eqDiv("ΣH = " + f(sh) + " kN" + ok(sh)) + eqDiv("ΣV = " + f(sv) + " kN" + ok(sv)) + eqDiv("ΣM = " + f(sm) + " kNm" + ok(sm));
    steps.push({ title: "Ergebnis und Probe", html: h });
    return steps;
  };
})(window.APP);
