/* Tragwerk — Träger (beam): Auflagerkräfte, Schnittgrößen N/Q/M, Rechenweg. Pure maths, no DOM.
   Conventions (German statics):
   - x to the right along the beam, loads F and q positive DOWN (↓), Fx positive to the right (→)
   - reactions: Az positive UP (↑), Ax positive to the right (→), moments positive clockwise (↻)
   - Q(x) = sum of vertical forces left of the cut (up positive), M(x) positive = sagging (Zugfaser unten), N positive = tension */
(function (APP) {
  const U = APP.U, EPS = 1e-9, f = U.fmt;
  const B = (APP.beam = {});
  const LETTERS = "ABCDEFGH";

  /* ---------- data ---------- */
  B.blank = function () {
    return { id: U.uid(), type: "beam", name: "Einfeldträger", L: 6, snap: 0.5,
      fibre: "unten", xdir: "links", cuts: [],
      supports: [{ id: U.uid(), t: "fest", x: 0 }, { id: U.uid(), t: "los", x: 6 }], hinges: [], loads: [] };
  };
  B.example = function () {
    const s = B.blank(); s.name = "Einfeldträger mit Last";
    s.loads = [{ id: U.uid(), t: "q", a: 0, b: 6, q1: 10, q2: 10 }, { id: U.uid(), t: "F", x: 2, fz: 20, fx: 0 }];
    return s;
  };
  B.fix = function (s) {
    s.L = U.num(s.L, 6); if (s.L <= 0) s.L = 6;
    s.snap = U.num(s.snap, 0.5); if (s.snap <= 0) s.snap = 0.5;
    s.name = s.name || "Träger";
    s.fibre = s.fibre === "oben" ? "oben" : "unten";     // side of the dashed fibre (gestrichelte Faser)
    s.xdir = s.xdir === "rechts" ? "rechts" : "links";   // x measured from the left or the right support
    ["supports", "hinges", "loads", "cuts"].forEach(k => { s[k] = Array.isArray(s[k]) ? s[k] : []; });
    s.cuts = s.cuts.map(o => ({ id: o.id || U.uid(), x: U.clamp(U.num(o.x, 0), 0, s.L) }));
    s.supports = s.supports.filter(o => ["fest", "los", "einsp"].includes(o.t)).map(o => ({ id: o.id || U.uid(), t: o.t, x: U.num(o.x, 0) }));
    s.hinges = s.hinges.map(o => ({ id: o.id || U.uid(), x: U.num(o.x, 0) }));
    s.loads = s.loads.map(o => {
      if (o.t === "q") return { id: o.id || U.uid(), t: "q", a: U.num(o.a, 0), b: U.num(o.b, s.L), q1: U.num(o.q1, 0), q2: U.num(o.q2, 0) };
      if (o.t === "M") return { id: o.id || U.uid(), t: "M", x: U.num(o.x, 0), m: U.num(o.m, 0) };
      return { id: o.id || U.uid(), t: "F", x: U.num(o.x, 0), fz: U.num(o.fz, 0), fx: U.num(o.fx, 0) };
    });
  };

  B.typeName = t => ({ fest: "Festlager", los: "Loslager", einsp: "Einspannung" }[t] || t);

  /* supports sorted by x and labelled A, B, C… */
  B.supports = sys => sys.supports.slice().sort((a, b) => a.x - b.x).map((s, i) => Object.assign({}, s, { label: LETTERS[i] || "S" + (i + 1) }));
  B.labelOf = (sys, id) => { const s = B.supports(sys).find(o => o.id === id); return s ? s.label : "?"; };

  /* loads → point forces (resultants). Distributed loads are split at hinges and into rectangle + triangle. */
  B.pieces = function (sys) {
    const hs = sys.hinges.map(h => h.x), out = [];
    sys.loads.forEach(l => {
      if (l.t === "F") out.push({ src: l.id, kind: "F", x: l.x, fz: l.fz, fx: l.fx, m: 0 });
      else if (l.t === "M") out.push({ src: l.id, kind: "M", x: l.x, fz: 0, fx: 0, m: l.m });
      else if (l.t === "q" && l.b - l.a > EPS) {
        const cuts = [l.a].concat(hs.filter(h => h > l.a + EPS && h < l.b - EPS).sort((p, q) => p - q), [l.b]);
        const qAt = x => l.q1 + (l.q2 - l.q1) * (x - l.a) / (l.b - l.a);
        for (let i = 0; i < cuts.length - 1; i++) {
          const a = cuts[i], b = cuts[i + 1], len = b - a, qa = qAt(a), qb = qAt(b);
          if (Math.abs(qa) > EPS) out.push({ src: l.id, kind: "R", x: a + len / 2, fz: qa * len, fx: 0, m: 0, a, b, q: qa, len });
          if (Math.abs(qb - qa) > EPS) out.push({ src: l.id, kind: "T", x: a + 2 * len / 3, fz: (qb - qa) * len / 2, fx: 0, m: 0, a, b, dq: qb - qa, len });
        }
      }
    });
    return out;
  };

  B.warnings = function (sys) {
    const w = [], sup = sys.supports;
    sup.forEach((s, i) => sup.forEach((t, j) => { if (j > i && Math.abs(s.x - t.x) < EPS) w.push("Zwei Lager liegen bei x = " + f(s.x) + " m übereinander."); }));
    sys.hinges.forEach(h => sup.forEach(s => { if (Math.abs(s.x - h.x) < EPS) w.push("Ein Lager liegt genau im Gelenk bei x = " + f(h.x) + " m – bitte leicht verschieben."); }));
    return w;
  };

  /* ---------- solve: reactions ---------- */
  function unk(name, s, c) { return { s, c, name, value: 0 }; }
  B.solve = function (sys) {
    const sup = B.supports(sys), P = B.pieces(sys), res = { sup, pieces: P, unknowns: [], eqs: [], ok: false, kind: "", msg: "", warn: B.warnings(sys) };
    if (!sup.length) { res.kind = "labil"; res.msg = "Es ist noch kein Lager gesetzt."; return res; }
    if (res.warn.length) { res.kind = "labil"; res.msg = res.warn[0]; return res; }
    sup.forEach(s => {
      if (s.t === "fest") res.unknowns.push(unk(s.label + "<sub>x</sub>", s, "x"), unk(s.label + "<sub>z</sub>", s, "z"));
      else if (s.t === "los") res.unknowns.push(unk(s.label + "<sub>z</sub>", s, "z"));
      else res.unknowns.push(unk(s.label + "<sub>x</sub>", s, "x"), unk(s.label + "<sub>z</sub>", s, "z"), unk("M<sub>" + s.label + "</sub>", s, "m"));
    });
    const U_ = res.unknowns, n = U_.length, P0 = sup[0].x;

    /* moment equation about point xp (clockwise +); if `left` only things left of xp count (hinge condition) */
    function momentEq(xp, left, label) {
      const eq = { label, kind: "M", xp, left, coef: [], loadTerms: [], rhs: 0 };
      U_.forEach(u => {
        let c = 0;
        if (!(left && u.s.x > xp + EPS)) c = u.c === "z" ? -(u.s.x - xp) : u.c === "m" ? 1 : 0;
        eq.coef.push(c);
      });
      P.forEach(p => {
        if (left && p.x > xp + EPS) return;
        const v = p.fz * (p.x - xp) + p.m;
        if (Math.abs(v) < EPS) return;
        eq.loadTerms.push({ v, text: Math.abs(p.m) > EPS && Math.abs(p.fz) < EPS ? f(Math.abs(p.m)) : f(Math.abs(p.fz)) + "·" + f(Math.abs(p.x - xp)) });
        eq.rhs -= v;
      });
      return eq;
    }
    res.eqs.push(momentEq(P0, false, "ΣM um " + sup[0].label));
    sys.hinges.slice().sort((a, b) => a.x - b.x).forEach((h, i) => res.eqs.push(momentEq(h.x, true, "M<sub>G" + (i + 1) + "</sub> = 0 (Gelenk bei x = " + f(h.x) + " m, linke Seite)")));
    const eqV = { label: "ΣV = 0 (↑ +)", kind: "V", coef: U_.map(u => (u.c === "z" ? 1 : 0)), loadTerms: [], rhs: 0 };
    P.forEach(p => { if (Math.abs(p.fz) > EPS) { eqV.loadTerms.push({ v: -p.fz, text: f(Math.abs(p.fz)) }); eqV.rhs += p.fz; } });
    const eqH = { label: "ΣH = 0 (→ +)", kind: "H", coef: U_.map(u => (u.c === "x" ? 1 : 0)), loadTerms: [], rhs: 0 };
    P.forEach(p => { if (Math.abs(p.fx) > EPS) { eqH.loadTerms.push({ v: p.fx, text: f(Math.abs(p.fx)) }); eqH.rhs -= p.fx; } });
    res.eqs.push(eqV, eqH);

    const m = res.eqs.length; res.n = n; res.m = m;
    const g = U.solve(res.eqs.map(e => e.coef), res.eqs.map(e => e.rhs));
    if (n > m || (g.rank < n && n >= m)) {
      if (n > m) { res.kind = "unbestimmt"; res.msg = (n - m) + "-fach statisch unbestimmt (" + n + " Unbekannte, " + m + " Gleichungen). Das kann Version 1 noch nicht lösen."; }
      else { res.kind = "labil"; res.msg = "Labil / verschieblich: Die Lagerung reicht nicht aus."; }
      return res;
    }
    if (n < m) { res.kind = "labil"; res.msg = "Labil: Es gibt mehr Gleichungen (" + m + ") als Lagerreaktionen (" + n + ") – zu viele Gelenke oder zu wenig Lager."; return res; }
    if (!g.consistent) { res.kind = "labil"; res.msg = "Kein Gleichgewicht möglich – z. B. Horizontallast ohne horizontales Auflager."; return res; }
    U_.forEach((u, i) => { u.value = g.x[i]; });
    res.ok = true; res.kind = "ok"; res.msg = "Statisch bestimmt (" + n + " Unbekannte, " + m + " Gleichungen).";
    return res;
  };

  /* ---------- internal forces ---------- */
  /* side −1: just left of x, +1: just right of x (matters at point loads and supports) */
  B.internal = function (sys, res, x, side) {
    const inc = pos => (side < 0 ? pos < x - EPS : pos <= x + EPS);
    let N = 0, V = 0, M = 0;
    res.unknowns.forEach(u => {
      if (!inc(u.s.x)) return;
      if (u.c === "x") N -= u.value;
      else if (u.c === "z") { V += u.value; M += u.value * (x - u.s.x); }
      else M += u.value;
    });
    sys.loads.forEach(l => {
      if (l.t === "F") { if (inc(l.x)) { V -= l.fz; N -= l.fx; M -= l.fz * (x - l.x); } }
      else if (l.t === "M") { if (inc(l.x)) M += l.m; }
      else if (l.t === "q") {
        const len = l.b - l.a, d = x - l.a; if (len <= EPS || d <= 0) return;
        const t = Math.min(d, len), k = (l.q2 - l.q1) / len;
        V -= l.q1 * t + k * t * t / 2;
        M -= l.q1 * (d * t - t * t / 2) + k * (d * t * t / 2 - t * t * t / 3);
      }
    });
    return { N, V, M };
  };

  B.points = function (sys) {
    const a = [0, sys.L];
    sys.supports.forEach(s => a.push(s.x)); sys.hinges.forEach(h => a.push(h.x));
    sys.loads.forEach(l => { if (l.t === "q") a.push(l.a, l.b); else a.push(l.x); });
    a.sort((p, q) => p - q);
    return a.filter(v => v >= -EPS && v <= sys.L + EPS).filter((v, i, arr) => !i || v - arr[i - 1] > EPS);
  };

  /* polyline for a diagram: jumps appear as two points with the same x */
  B.curve = function (sys, res, key) {
    const pts = B.points(sys), out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.max(2, Math.ceil((b - a) / sys.L * 80));
      out.push({ x: a, v: B.internal(sys, res, a, 1)[key] });
      for (let j = 1; j < n; j++) { const x = a + (b - a) * j / n; out.push({ x, v: B.internal(sys, res, x, 1)[key] }); }
      out.push({ x: b, v: B.internal(sys, res, b, -1)[key] });
    }
    return out;
  };

  /* max/min of M (also where Q = 0) and of Q */
  B.extremes = function (sys, res) {
    const pts = B.points(sys), cand = [];
    pts.forEach(x => { cand.push({ x, m: B.internal(sys, res, x, -1).M }, { x, m: B.internal(sys, res, x, 1).M }); });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = 60; let prevX = a, prevV = B.internal(sys, res, a, 1).V;
      for (let j = 1; j <= n; j++) {
        const x = j === n ? b : a + (b - a) * j / n, v = B.internal(sys, res, x, j === n ? -1 : 1).V;
        if (Math.abs(v) < 1e-9 && j < n) cand.push({ x, m: B.internal(sys, res, x, 1).M, zero: true });   // sample hit Q = 0 exactly
        else if (prevV * v < 0 && Math.abs(prevV) >= 1e-9) {
          let lo = prevX, hi = x, vlo = prevV;
          for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2, vm = B.internal(sys, res, mid, 1).V; if (vlo * vm <= 0) hi = mid; else { lo = mid; vlo = vm; } }
          const xz = (lo + hi) / 2; cand.push({ x: xz, m: B.internal(sys, res, xz, 1).M, zero: true });
        }
        prevX = x; prevV = v;
      }
    }
    let mx = cand[0], mn = cand[0];
    cand.forEach(c => { if (c.m > mx.m) mx = c; if (c.m < mn.m) mn = c; });
    let vmax = { x: 0, v: 0 };
    pts.forEach(x => [-1, 1].forEach(s => { const v = B.internal(sys, res, x, s).V; if (Math.abs(v) > Math.abs(vmax.v)) vmax = { x, v }; }));
    return { Mmax: mx, Mmin: mn, Vmax: vmax };
  };

  /* ---------- modes (Vorzeichenkonvention) ----------
     Raw values from B.internal are for "Faser unten, x von links". Other modes only change signs:
     M × (+1 unten / −1 oben), Q × same × (+1 x von links / −1 x von rechts), N never changes. */
  B.signs = s => ({ q: (s.fibre === "unten" ? 1 : -1) * (s.xdir === "links" ? 1 : -1), m: s.fibre === "unten" ? 1 : -1 });
  B.xd = (s, x) => (s.xdir === "links" ? x : s.L - x);     // position as the user reads it (also converts back)
  B.extremesDisp = function (sys, res) {
    const ex = B.extremes(sys, res), sg = B.signs(sys);
    let Mmax = ex.Mmax, Mmin = ex.Mmin;
    if (sg.m < 0) { Mmax = { x: ex.Mmin.x, m: -ex.Mmin.m, zero: ex.Mmin.zero }; Mmin = { x: ex.Mmax.x, m: -ex.Mmax.m, zero: ex.Mmax.zero }; }
    return { Mmax, Mmin, Vmax: { x: ex.Vmax.x, v: ex.Vmax.v * sg.q } };
  };

  /* free cut at x: forces on the left or right piece and the N/Q/M they give (raw convention).
     side −1 = just left of x, +1 = just right of x (matters at point loads and supports). */
  B.cut = function (sys, res, x, side, right) {
    const inc = pos => (right ? (side < 0 ? pos >= x - EPS : pos > x + EPS) : (side < 0 ? pos < x - EPS : pos <= x + EPS));
    const terms = [];
    res.unknowns.forEach(u => {
      if (!inc(u.s.x)) return;
      if (u.c === "z") terms.push({ label: u.name, fup: u.value, xp: u.s.x });
      else if (u.c === "x") terms.push({ label: u.name, fx: u.value });
      else terms.push({ label: u.name, mc: u.value });
    });
    sys.loads.forEach(l => {
      if (l.t === "F") { if (inc(l.x)) { if (Math.abs(l.fz) > EPS) terms.push({ label: "F", fup: -l.fz, xp: l.x }); if (Math.abs(l.fx) > EPS) terms.push({ label: "F<sub>x</sub>", fx: l.fx }); } }
      else if (l.t === "M") { if (inc(l.x)) terms.push({ label: "M", mc: l.m }); }
      else if (l.t === "q") {
        const len0 = l.b - l.a; if (len0 <= EPS) return;
        const s = right ? Math.max(l.a, x) : l.a, e = right ? l.b : Math.min(l.b, x), len = e - s; if (len <= EPS) return;
        const qAt = v => l.q1 + (l.q2 - l.q1) * (v - l.a) / len0, qs = qAt(s), qe = qAt(e);
        if (Math.abs(qs) > EPS) terms.push({ label: "q-Rechteck", fup: -qs * len, xp: s + len / 2 });
        if (Math.abs(qe - qs) > EPS) terms.push({ label: "q-Dreieck", fup: -(qe - qs) * len / 2, xp: s + 2 * len / 3 });
      }
    });
    let Q = 0, M = 0, N = 0;
    terms.forEach(t => {
      const fu = t.fup || 0, fx = t.fx || 0, mc = t.mc || 0;
      t.dq = right ? -fu : fu;
      t.arm = t.fup != null ? (right ? t.xp - x : x - t.xp) : null;
      t.dm = t.fup != null ? fu * t.arm : (right ? -mc : mc);
      t.dn = right ? fx : -fx;
      Q += t.dq; M += t.dm; N += t.dn;
    });
    return { terms: terms.filter(t => Math.abs(t.dq) + Math.abs(t.dm) + Math.abs(t.dn) > EPS), N, Q, M, right, side };
  };

  /* ---------- Rechenweg (HTML) ---------- */
  function joinTerms(parts) {   // parts: [{v, body}] → "a + b − c"
    let s = "";
    parts.forEach((p, i) => { const neg = p.v < 0; s += i === 0 ? (neg ? "−" : "") : (neg ? " − " : " + "); s += p.body; });
    return s || "0";
  }
  function eqHtml(eq, unknowns) {
    const parts = [];
    eq.coef.forEach((c, i) => { if (Math.abs(c) > EPS) parts.push({ v: c, body: (Math.abs(Math.abs(c) - 1) < EPS ? "" : f(Math.abs(c)) + "·") + unknowns[i].name }); });
    eq.loadTerms.forEach(t => parts.push({ v: t.v, body: t.text }));
    return eq.label + ":&nbsp; " + joinTerms(parts) + " = 0";
  }
  const p = (h) => "<p>" + h + "</p>";
  const eqDiv = (h) => '<div class="eq">' + h + "</div>";

  B.steps = function (sys, res) {
    const steps = [];
    /* 1 system */
    let h = p("Träger mit der Länge <b>L = " + f(sys.L) + " m</b>.") + "<ul>";
    res.sup.forEach(s => { h += "<li>Lager " + s.label + ": " + B.typeName(s.t) + " bei x = " + f(s.x) + " m</li>"; });
    sys.hinges.forEach(g => { h += "<li>Gelenk bei x = " + f(g.x) + " m</li>"; });
    sys.loads.forEach(l => {
      if (l.t === "F") h += "<li>Einzellast F = " + f(l.fz) + " kN (↓)" + (Math.abs(l.fx) > EPS ? ", F<sub>x</sub> = " + f(l.fx) + " kN (→)" : "") + " bei x = " + f(l.x) + " m</li>";
      else if (l.t === "M") h += "<li>Moment M = " + f(l.m) + " kNm (↻) bei x = " + f(l.x) + " m</li>";
      else h += "<li>Streckenlast q = " + (Math.abs(l.q1 - l.q2) < EPS ? f(l.q1) : f(l.q1) + " → " + f(l.q2)) + " kN/m von x = " + f(l.a) + " bis " + f(l.b) + " m</li>";
    });
    h += "</ul>";
    steps.push({ title: "System und Lasten", html: h });
    if (!res.ok) { steps.push({ title: "Ergebnis", html: p("<b>" + U.esc(res.msg) + "</b>") }); return steps; }

    /* 2 resultants */
    const dist = res.pieces.filter(q => q.kind === "R" || q.kind === "T");
    if (dist.length) {
      h = p("Streckenlasten werden durch Ersatzkräfte (Resultierende) ersetzt, die im Schwerpunkt wirken:");
      dist.forEach(q => {
        if (q.kind === "R") h += eqDiv("Q = q · l = " + f(q.q) + " · " + f(q.len) + " = <b>" + f(q.fz) + " kN</b> &nbsp;bei x = " + f(q.a) + " + l/2 = " + f(q.x) + " m");
        else h += eqDiv("Q = ½ · Δq · l = ½ · " + f(q.dq) + " · " + f(q.len) + " = <b>" + f(q.fz) + " kN</b> &nbsp;bei x = " + f(q.a) + " + ⅔·l = " + f(q.x) + " m");
      });
      steps.push({ title: "Ersatzlasten", html: h });
    }

    /* 3 equations */
    h = p("Die Lagerreaktionen folgen aus dem Gleichgewicht. Positiv: A<sub>z</sub> nach oben (↑), A<sub>x</sub> nach rechts (→), Momente im Uhrzeigersinn (↻). Lasten nach unten (↓) sind positiv.");
    res.eqs.forEach(e => { h += eqDiv(eqHtml(e, res.unknowns)); });
    steps.push({ title: "Gleichgewichtsbedingungen", html: h });

    /* 4 solution */
    h = p("Auflösen des Gleichungssystems (" + res.n + " Gleichungen, " + res.n + " Unbekannte) ergibt:");
    res.unknowns.forEach(u => {
      const unit = u.c === "m" ? "kNm" : "kN", dir = u.c === "x" ? (u.value >= 0 ? "→" : "←") : u.c === "z" ? (u.value >= 0 ? "↑" : "↓") : (u.value >= 0 ? "↻" : "↺");
      h += eqDiv(u.name + " = <b>" + f(u.value) + " " + unit + "</b> &nbsp;(" + dir + ")");
    });
    h += p("Ein negatives Vorzeichen heißt: Die Reaktion zeigt in die Gegenrichtung der Annahme.");
    steps.push({ title: "Auflagerkräfte", html: h });

    /* 5 check */
    const xr = sys.L;
    let sm = 0, sv = 0, sh = 0;
    res.pieces.forEach(q => { sm += q.fz * (q.x - xr) + q.m; sv -= q.fz; sh += q.fx; });
    res.unknowns.forEach(u => { if (u.c === "z") { sm -= u.value * (u.s.x - xr); sv += u.value; } else if (u.c === "m") sm += u.value; else sh += u.value; });
    const ok = v => (Math.abs(v) < 1e-6 ? " ✓" : " ✗");
    steps.push({ title: "Probe", html: p("Kontrolle mit einer Gleichung, die nicht zum Lösen verwendet wurde:") +
      eqDiv("ΣM um das rechte Trägerende (x = " + f(xr) + " m) = " + f(sm) + " kNm" + ok(sm)) +
      eqDiv("ΣV = " + f(sv) + " kN" + ok(sv)) + eqDiv("ΣH = " + f(sh) + " kN" + ok(sh)) });

    /* 6 sign convention */
    const sg = B.signs(sys), xl = sys.xdir === "links", fib = sys.fibre;
    h = p("Gewählt: <b>gestrichelte Faser " + fib + "</b>, <b>x von " + (xl ? "links" : "rechts") + "</b>. Die z-Achse zeigt zur gestrichelten Faser (" + (fib === "unten" ? "nach unten" : "nach oben") + ").");
    h += B.sketch ? B.sketch(sys) : "";
    h += "<ul><li>Das <b>positive Schnittufer</b> ist die Schnittfläche, deren nach außen zeigende Normale in +x zeigt (bei x von " + (xl ? "links" : "rechts") + ": die Fläche des " + (xl ? "linken" : "rechten") + " Teilstücks). Dort wirken positives N in +x und positives Q in +z; am negativen Schnittufer ist alles umgekehrt.</li>" +
      "<li><b>M</b> ist positiv, wenn die gestrichelte Faser gezogen wird. <b>N</b> ist positiv bei Zug.</li>" +
      "<li>Gegenüber dem Standardfall (Faser unten, x von links) ändert sich: Q × (" + (sg.q > 0 ? "+1" : "−1") + "), M × (" + (sg.m > 0 ? "+1" : "−1") + "), N unverändert.</li></ul>";
    steps.push({ title: "Vorzeichenkonvention", html: h });

    /* 7 internal forces */
    const pts = B.points(sys), ex = B.extremesDisp(sys, res), xd = x => B.xd(sys, x);
    h = p("Schnittgrößen an den maßgebenden Stellen (Lasten, Lager, Gelenke). Positionen x von " + (xl ? "links" : "rechts") + " gemessen.");
    h += '<table class="tbl"><tr><th>x [m]</th><th>N [kN]</th><th>Q davor</th><th>Q danach</th><th>M [kNm]</th></tr>';
    const rows = pts.slice(); if (!xl) rows.reverse();
    rows.forEach(x => {
      const l = B.internal(sys, res, x, -1), r = B.internal(sys, res, x, 1);
      const a = xl ? l : r, b = xl ? r : l, aNone = xl ? x < EPS : x > sys.L - EPS, bNone = xl ? x > sys.L - EPS : x < EPS;
      h += "<tr><td>" + f(xd(x)) + "</td><td>" + f(r.N) + "</td><td>" + (aNone ? "–" : f(a.V * sg.q)) + "</td><td>" + (bNone ? "–" : f(b.V * sg.q)) + "</td><td>" + f(r.M * sg.m) + "</td></tr>";
    });
    h += "</table>";
    h += eqDiv("max M = <b>" + f(ex.Mmax.m) + " kNm</b> bei x = " + f(xd(ex.Mmax.x)) + " m" + (ex.Mmax.zero ? " (dort ist Q = 0)" : "")) +
      eqDiv("min M = <b>" + f(ex.Mmin.m) + " kNm</b> bei x = " + f(xd(ex.Mmin.x)) + " m" + (ex.Mmin.zero ? " (dort ist Q = 0)" : "")) +
      eqDiv("größte Querkraft |Q| = <b>" + f(Math.abs(ex.Vmax.v)) + " kN</b> bei x = " + f(xd(ex.Vmax.x)) + " m");
    steps.push({ title: "Schnittgrößen", html: h });

    /* 8 free cuts */
    sys.cuts.forEach((c, i) => {
      const jump = res.unknowns.some(u => Math.abs(u.s.x - c.x) < EPS && u.c === "z") || sys.loads.some(l => (l.t === "F" || l.t === "M") && Math.abs(l.x - c.x) < EPS);
      h = p("Schnitt bei <b>x = " + f(xd(c.x)) + " m</b> (von " + (xl ? "links" : "rechts") + " gemessen). Betrachtet wird das " + (xl ? "linke" : "rechte") + " Teilstück zwischen dem Trägerende und dem Schnitt; die Probe nutzt das andere Teilstück.");
      (jump ? [-1, 1] : [1]).forEach(side => {
        if (jump) h += "<h4>" + (side < 0 ? "Unmittelbar links" : "Unmittelbar rechts") + " von x = " + f(xd(c.x)) + " m</h4>";
        const main = B.cut(sys, res, c.x, side, !xl), other = B.cut(sys, res, c.x, side, xl);
        const qT = [], mT = [], nT = [];
        main.terms.forEach(t => {
          if (Math.abs(t.dq) > EPS) qT.push({ v: t.dq * sg.q, body: f(Math.abs(t.dq)) + " (" + t.label + ")" });
          if (Math.abs(t.dm) > EPS) mT.push({ v: t.dm * sg.m, body: (t.arm != null ? f(Math.abs(t.fup)) + "·" + f(Math.abs(t.arm)) : f(Math.abs(t.dm))) + " (" + t.label + ")" });
          if (Math.abs(t.dn) > EPS) nT.push({ v: t.dn, body: f(Math.abs(t.dn)) + " (" + t.label + ")" });
        });
        const Q = main.Q * sg.q, M = main.M * sg.m, N = main.N, Q2 = other.Q * sg.q, M2 = other.M * sg.m;
        const lhs = a => (a.length ? joinTerms(a) + " = " : "");
        h += eqDiv("N(x) = " + lhs(nT) + "<b>" + f(N) + " kN</b>") + eqDiv("Q(x) = " + lhs(qT) + "<b>" + f(Q) + " kN</b>") + eqDiv("M(x) = " + lhs(mT) + "<b>" + f(M) + " kNm</b>");
        h += p("Probe am anderen Teilstück: N = " + f(other.N) + ", Q = " + f(Q2) + ", M = " + f(M2) + (Math.abs(N - other.N) + Math.abs(Q - Q2) + Math.abs(M - M2) < 1e-6 ? " ✓" : " ✗"));
      });
      steps.push({ title: "Schnitt " + (i + 1) + " bei x = " + f(xd(c.x)) + " m", html: h });
    });
    return steps;
  };
})(window.APP);
