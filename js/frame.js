/* Tragwerk — Rahmen (2D frame): stiffness method, hinges, member loads, second-order analysis with imperfections,
   critical load factor alpha_cr and cross-section checks. Pure maths, no DOM.
   Units: kN, m, kNm. Coordinates: x right, z UP. Node dofs: ux, uz, theta (counter-clockwise positive).
   Loads: Fz positive DOWN, Fx positive RIGHT, nodal moment positive clockwise (like in Träger/Fachwerk).
   Member local axes: x along the member (node a → node b), y = x rotated 90° counter-clockwise.
   M(x) > 0 means tension on the right-hand side of a → b (the −y side), the moment diagram is drawn on the tension side. */
(function (APP) {
  const U = APP.U, T = APP.tables, EPS = 1e-9, f = U.fmt;
  const F = (APP.frame = {});
  const E_N = 210000;   // N/mm2 (steel)

  /* ---------- profile data from the tables ---------- */
  const col = {}; T.steel.cols.forEach((c, i) => { col[c] = i; });
  F.prof = function (name) {
    const p = T.steel.profiles.find(x => x[col.name] === name);
    if (!p) return null;
    const o = {}; Object.keys(col).forEach(k => { o[k] = p[col[k]]; }); return o;
  };
  F.profileNames = () => T.steel.profiles.map(p => p[col.name]);
  F.grade = (name) => T.steel.grades.find(g => g[0] === name) || T.steel.grades[2];
  F.fy = (sys, p) => (p.tf <= 40 ? F.grade(sys.grade)[1] : F.grade(sys.grade)[2]);

  /* ---------- data ---------- */
  F.blank = function () {
    return { id: U.uid(), type: "frame", name: "Rahmen", W: 12, H: 8, snap: 0.5, nodes: [], members: [], supports: [], loads: [],
      grade: "S355", gM0: 1, gF: 1, order: "I", sway: true, bow: true, swayDir: 1, curve: "b", selfWeight: false, view: "M" };
  };
  F.example = function () {
    const s = F.blank(); s.name = "Zweigelenkrahmen"; s.W = 12; s.H = 8; s.order = "II";
    const xy = [[2, 0], [2, 5], [10, 5], [10, 0]];
    s.nodes = xy.map(p => ({ id: U.uid(), x: p[0], z: p[1] }));
    const N = s.nodes;
    s.members = [
      { id: U.uid(), a: N[0].id, b: N[1].id, prof: "HEA200", ha: false, hb: false },
      { id: U.uid(), a: N[1].id, b: N[2].id, prof: "IPE300", ha: false, hb: false },
      { id: U.uid(), a: N[2].id, b: N[3].id, prof: "HEA200", ha: false, hb: false }];
    s.supports = [{ id: U.uid(), n: N[0].id, t: "fest", dir: "z" }, { id: U.uid(), n: N[3].id, t: "fest", dir: "z" }];
    s.loads = [{ id: U.uid(), t: "q", mem: s.members[1].id, qv: 20, qh: 0 }, { id: U.uid(), t: "F", n: N[1].id, fx: 15, fz: 0, m: 0 }];
    return s;
  };
  F.fix = function (s) {
    s.W = U.num(s.W, 12); if (s.W <= 0) s.W = 12;
    s.H = U.num(s.H, 8); if (s.H <= 0) s.H = 8;
    s.snap = U.num(s.snap, 0.5); if (s.snap <= 0) s.snap = 0.5;
    s.name = s.name || "Rahmen";
    s.grade = T.steel.grades.some(g => g[0] === s.grade) ? s.grade : "S355";
    s.gM0 = U.num(s.gM0, 1); if (s.gM0 <= 0) s.gM0 = 1;
    s.gF = U.num(s.gF, 1); if (s.gF <= 0) s.gF = 1;
    s.order = s.order === "II" ? "II" : "I";
    s.sway = s.sway !== false; s.bow = s.bow !== false; s.swayDir = s.swayDir === -1 ? -1 : 1;
    s.curve = ["a0", "a", "b", "c", "d"].includes(s.curve) ? s.curve : "b";
    s.selfWeight = !!s.selfWeight;
    s.view = ["M", "N", "Q", "def", "util"].includes(s.view) ? s.view : "M";
    ["nodes", "members", "supports", "loads"].forEach(k => { s[k] = Array.isArray(s[k]) ? s[k] : []; });
    s.nodes = s.nodes.map(o => ({ id: o.id || U.uid(), x: U.num(o.x, 0), z: U.num(o.z, 0) }));
    const has = {}; s.nodes.forEach(n => { has[n.id] = true; });
    s.members = s.members.filter(o => has[o.a] && has[o.b] && o.a !== o.b).map(o => ({ id: o.id || U.uid(), a: o.a, b: o.b, prof: F.prof(o.prof) ? o.prof : "IPE200", ha: !!o.ha, hb: !!o.hb }));
    const hm = {}; s.members.forEach(m => { hm[m.id] = true; });
    s.supports = s.supports.filter(o => has[o.n] && ["fest", "los", "einsp"].includes(o.t)).map(o => ({ id: o.id || U.uid(), n: o.n, t: o.t, dir: o.dir === "x" ? "x" : "z" }));
    s.loads = s.loads.filter(o => (o.t === "q" ? hm[o.mem] : has[o.n])).map(o => o.t === "q"
      ? { id: o.id || U.uid(), t: "q", mem: o.mem, qv: U.num(o.qv, 0), qh: U.num(o.qh, 0) }
      : { id: o.id || U.uid(), t: "F", n: o.n, fx: U.num(o.fx, 0), fz: U.num(o.fz, 0), m: U.num(o.m, 0) });
  };
  F.nodeIndex = (sys, id) => sys.nodes.findIndex(n => n.id === id);
  F.supLabel = (sys, id) => { const i = sys.supports.findIndex(s => s.id === id); return "ABCDEFGH"[i] || "S" + (i + 1); };

  /* ---------- element matrices (local) ---------- */
  function kLocal(EA, EI, L) {
    const a = EA / L, b = 12 * EI / L ** 3, c = 6 * EI / L ** 2, d = 4 * EI / L, e = 2 * EI / L;
    return [[a, 0, 0, -a, 0, 0], [0, b, c, 0, -b, c], [0, c, d, 0, -c, e], [-a, 0, 0, a, 0, 0], [0, -b, -c, 0, b, -c], [0, c, e, 0, -c, d]];
  }
  function kGeo(N, L) {   // geometric stiffness for axial force N (tension positive)
    const q = N / (30 * L);
    return [[0, 0, 0, 0, 0, 0], [0, 36 * q, 3 * L * q, 0, -36 * q, 3 * L * q], [0, 3 * L * q, 4 * L * L * q, 0, -3 * L * q, -L * L * q],
      [0, 0, 0, 0, 0, 0], [0, -36 * q, -3 * L * q, 0, 36 * q, -3 * L * q], [0, 3 * L * q, -L * L * q, 0, -3 * L * q, 4 * L * L * q]];
  }
  const zeros = (n, m) => Array.from({ length: n }, () => new Array(m).fill(0));
  const mulMV = (A, v) => A.map(r => r.reduce((s, a, j) => s + a * v[j], 0));
  function trans(c, s) {   // T: global dofs → local dofs
    const T6 = zeros(6, 6);
    [0, 3].forEach(o => { T6[o][o] = c; T6[o][o + 1] = s; T6[o + 1][o] = -s; T6[o + 1][o + 1] = c; T6[o + 2][o + 2] = 1; });
    return T6;
  }
  function mulTKT(T6, k) {   // T^T k T
    const kt = zeros(6, 6), tmp = zeros(6, 6);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let s = 0; for (let m = 0; m < 6; m++) s += k[i][m] * T6[m][j]; tmp[i][j] = s; }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let s = 0; for (let m = 0; m < 6; m++) s += T6[m][i] * tmp[m][j]; kt[i][j] = s; }
    return kt;
  }
  function condense(k, p, rel) {   // static condensation of released dofs (hinges)
    if (!rel.length) return { k, p };
    const keep = [0, 1, 2, 3, 4, 5].filter(i => !rel.includes(i));
    const Krr = rel.map(i => rel.map(j => k[i][j]));
    const out = zeros(6, 6), po = new Array(6).fill(0);
    const solveCols = (rhsCols) => rhsCols.map(v => U.solve(Krr, v).x);   // Krr^-1 * each column
    const KrrInvKrn = solveCols(keep.map(j => rel.map(i => k[i][j])));    // for each kept j: Krr^-1 k[r][j]
    const KrrInvFr = U.solve(Krr, rel.map(i => p[i])).x;
    keep.forEach((i, ii) => {
      keep.forEach((j, jj) => { let s = k[i][j]; rel.forEach((r, rr) => { s -= k[i][r] * KrrInvKrn[jj][rr]; }); out[i][j] = s; });
      let s = p[i]; rel.forEach((r, rr) => { s -= k[i][r] * KrrInvFr[rr]; }); po[i] = s;
    });
    return { k: out, p: po };
  }

  /* ---------- model: geometry, sections, supports, loads ---------- */
  F.model = function (sys) {
    const nodes = sys.nodes, idx = {}; nodes.forEach((n, i) => { idx[n.id] = i; });
    const warn = [], mem = sys.members.map((m, j) => {
      const ia = idx[m.a], ib = idx[m.b], dx = nodes[ib].x - nodes[ia].x, dz = nodes[ib].z - nodes[ia].z, L = Math.hypot(dx, dz), p = F.prof(m.prof);
      if (L <= EPS) warn.push("Stab " + (j + 1) + " hat die Länge 0.");
      return { j, id: m.id, ia, ib, L, c: dx / (L || 1), s: dz / (L || 1), prof: p, name: m.prof, ha: !!m.ha, hb: !!m.hb, EA: E_N * p.A / 10, EI: E_N * p.Iy / 1e5 };
      // EA [kN] = E[N/mm2] * A[cm2]*100 mm2 / 1000 ; EI [kNm2] = E * Iy[cm4]*1e4 mm4 / 1e9
    });
    const fixed = new Array(3 * nodes.length).fill(false);
    sys.supports.forEach(s => {
      const i = idx[s.n]; if (i == null) return;
      if (s.t === "fest") { fixed[3 * i] = true; fixed[3 * i + 1] = true; }
      else if (s.t === "einsp") { fixed[3 * i] = true; fixed[3 * i + 1] = true; fixed[3 * i + 2] = true; }
      else if (s.dir === "x") fixed[3 * i] = true; else fixed[3 * i + 1] = true;
    });
    return { sys, nodes, idx, mem, fixed, warn, nd: 3 * nodes.length };
  };

  /* uniform member loads (global per length) → local components, summed per member; self weight optional */
  function memberLoads(sys, model) {
    const w = model.mem.map(() => ({ wx: 0, wz: 0 }));   // global per length: wx right, wz up
    const byId = {}; model.mem.forEach(m => { byId[m.id] = m; });
    sys.loads.forEach(l => { if (l.t === "q" && byId[l.mem]) { const m = byId[l.mem]; w[m.j].wx += l.qh * sys.gF; w[m.j].wz -= l.qv * sys.gF; } });
    if (sys.selfWeight) model.mem.forEach(m => { w[m.j].wz -= m.prof.m * 9.81 / 1000 * sys.gF; });
    return model.mem.map((m, j) => ({ qx: w[j].wx * m.c + w[j].wz * m.s, qy: -w[j].wx * m.s + w[j].wz * m.c }));
  }

  /* ---------- linear / geometrically nonlinear solve ---------- */
  /* N: optional array of axial forces per member (tension +) → geometric stiffness; extra: array of {n (index), fx, fz(up), m(ccw)} extra nodal loads; extraQ: per member {qx,qy} extra local loads */
  F.solveWith = function (model, N, extra, extraQ) {
    const sys = model.sys, nd = model.nd, K = zeros(nd, nd), P = new Array(nd).fill(0), ML = memberLoads(sys, model);
    const elem = [];
    sys.loads.forEach(l => {
      if (l.t === "F") { const i = model.idx[l.n]; P[3 * i] += l.fx * sys.gF; P[3 * i + 1] -= l.fz * sys.gF; P[3 * i + 2] -= l.m * sys.gF; }
    });
    (extra || []).forEach(e => { P[3 * e.n] += e.fx || 0; P[3 * e.n + 1] += e.fz || 0; P[3 * e.n + 2] += e.m || 0; });
    model.mem.forEach((m, j) => {
      const q = { qx: ML[j].qx + ((extraQ && extraQ[j]) ? extraQ[j].qx : 0), qy: ML[j].qy + ((extraQ && extraQ[j]) ? extraQ[j].qy : 0) };
      let k = kLocal(m.EA, m.EI, m.L);
      if (N) { const g = kGeo(N[j], m.L); k = k.map((r, a) => r.map((v, b) => v + g[a][b])); }
      const L = m.L, peq = [q.qx * L / 2, q.qy * L / 2, q.qy * L * L / 12, q.qx * L / 2, q.qy * L / 2, -q.qy * L * L / 12];
      const rel = []; if (m.ha) rel.push(2); if (m.hb) rel.push(5);
      const cd = condense(k, peq, rel), T6 = trans(m.c, m.s), kg = mulTKT(T6, cd.k);
      const pg = new Array(6).fill(0); for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) pg[a] += T6[b][a] * cd.p[b];   // T^T p
      const dofs = [3 * m.ia, 3 * m.ia + 1, 3 * m.ia + 2, 3 * m.ib, 3 * m.ib + 1, 3 * m.ib + 2];
      dofs.forEach((da, a) => { P[da] += pg[a]; dofs.forEach((db, b) => { K[da][db] += kg[a][b]; }); });
      elem.push({ kc: cd.k, pc: cd.p, T6, dofs, q });
    });
    /* rotations of nodes where every member is hinged have no stiffness: they do not matter, leave them out */
    const maxd = Math.max(...K.map((r, i) => Math.abs(r[i])), 1), free = [];
    for (let i = 0; i < nd; i++) {
      if (model.fixed[i]) continue;
      if (Math.abs(K[i][i]) < 1e-9 * maxd) { if (Math.abs(P[i]) > 1e-9) return { ok: false, msg: "Labil: Ein Knoten, an dem alle Stäbe gelenkig angeschlossen sind, trägt ein Moment oder eine Last." }; continue; }
      free.push(i);
    }
    const u = new Array(nd).fill(0);
    if (free.length) {
      const g = U.solve(free.map(i => free.map(j => K[i][j])), free.map(i => P[i]));
      if (!g.full || !g.consistent) return { ok: false, msg: "Labil: Das System ist nicht ausreichend gelagert oder hat einen Mechanismus (Determinante = 0)." };
      free.forEach((d, i) => { u[d] = g.x[i]; });
    }
    /* reactions and end forces */
    const Ku = mulMV(K, u), R = u.map((_, i) => (model.fixed[i] ? Ku[i] - P[i] : 0));
    const ends = elem.map((e, j) => {
      const m = model.mem[j], dg = e.dofs.map(d => u[d]), dl = mulMV(e.T6, dg), S = mulMV(e.kc, dl).map((v, i) => v - e.pc[i]);
      return { S, q: e.q, d: dl };
    });
    return { ok: true, u, R, ends, K, P, free, elem };
  };

  /* internal forces at x along a member (local, S = forces by the nodes on the member). Q positive like for beams, M > 0: tension on the right side */
  F.sect = function (m, e, x) {
    const S = e.S, q = e.q;
    return { N: -S[0] - q.qx * x, Q: S[1] + q.qy * x, M: -S[2] + x * S[1] + q.qy * x * x / 2 };
  };
  F.points = (m, n) => { const a = []; for (let i = 0; i <= (n || 20); i++) a.push(m.L * i / (n || 20)); return a; };

  /* ---------- critical load factor (sway/buckling) ---------- */
  function negCount(A) {   // number of negative pivots of a symmetric matrix (Sturm count)
    const n = A.length, a = A.map(r => r.slice()); let neg = 0;
    for (let k = 0; k < n; k++) {
      let p = a[k][k]; if (Math.abs(p) < 1e-12) p = 1e-12;
      if (p < 0) neg++;
      for (let i = k + 1; i < n; i++) { const fct = a[i][k] / p; if (fct) for (let j = k; j < n; j++) a[i][j] -= fct * a[k][j]; }
    }
    return neg;
  }
  F.alphaCr = function (model, N) {
    const nd = model.nd, K0 = zeros(nd, nd), G0 = zeros(nd, nd);
    model.mem.forEach((m, j) => {
      const rel = []; if (m.ha) rel.push(2); if (m.hb) rel.push(5);
      const z6 = new Array(6).fill(0), T6 = trans(m.c, m.s);
      const ke = mulTKT(T6, condense(kLocal(m.EA, m.EI, m.L), z6, rel).k), ge = mulTKT(T6, condense(kGeo(N[j], m.L), z6, rel).k);
      const dofs = [3 * m.ia, 3 * m.ia + 1, 3 * m.ia + 2, 3 * m.ib, 3 * m.ib + 1, 3 * m.ib + 2];
      dofs.forEach((da, a) => dofs.forEach((db, b) => { K0[da][db] += ke[a][b]; G0[da][db] += ge[a][b]; }));
    });
    const maxd = Math.max(...K0.map((r, i) => Math.abs(r[i])), 1), free = [];
    for (let i = 0; i < nd; i++) if (!model.fixed[i] && Math.abs(K0[i][i]) >= 1e-9 * maxd) free.push(i);
    if (!free.length) return Infinity;
    const Kf = free.map(i => free.map(j => K0[i][j])), Gf = free.map(i => free.map(j => G0[i][j]));
    const count = lam => negCount(Kf.map((r, i) => r.map((v, j) => v + lam * Gf[i][j])));
    let hi = 0.5, tries = 0; while (count(hi) === 0 && tries < 30) { hi *= 2; tries++; }
    if (count(hi) === 0) return Infinity;
    let lo = 0; for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (count(mid) === 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };

  /* ---------- imperfections (EN 1993-1-1, 5.3.2) ---------- */
  const E0 = { a0: 1 / 350, a: 1 / 300, b: 1 / 250, c: 1 / 200, d: 1 / 150 };
  F.isColumn = m => Math.abs(m.s) > 0.85;
  F.swayPhi = function (sys, model, N) {
    const cols = model.mem.filter(F.isColumn), zs = sys.nodes.map(n => n.z);
    const h = Math.max(...zs) - Math.min(...zs), avg = cols.length ? cols.reduce((s, m) => s - N[m.j], 0) / cols.length : 0;
    const mCnt = Math.max(1, cols.filter(m => -N[m.j] >= 0.5 * avg).length);
    const ah = U.clamp(2 / Math.sqrt(Math.max(h, 1e-6)), 2 / 3, 1), am = Math.sqrt(0.5 * (1 + 1 / mCnt));
    return { phi0: 1 / 200, h, ah, m: mCnt, am, phi: 1 / 200 * ah * am };
  };

  /* ---------- full analysis ---------- */
  F.analyse = function (sys) {
    const model = F.model(sys), res = { ok: false, msg: "", kind: "", model, warn: model.warn.slice() };
    if (!sys.nodes.length || !sys.members.length) { res.kind = "leer"; res.msg = "Setze Knoten, verbinde sie mit Stäben und lege Lager fest."; return res; }
    if (model.warn.length) { res.kind = "labil"; res.msg = model.warn[0]; return res; }
    if (!sys.supports.length) { res.kind = "labil"; res.msg = "Es ist noch kein Lager gesetzt."; return res; }
    const one = F.solveWith(model, null, null, null);
    if (!one.ok) { res.kind = "labil"; res.msg = one.msg; return res; }
    const N1 = model.mem.map((m, j) => F.sect(m, one.ends[j], 0).N);   // axial force (constant for loads without qx; use start value)
    const Nmean = model.mem.map((m, j) => (F.sect(m, one.ends[j], 0).N + F.sect(m, one.ends[j], m.L).N) / 2);
    res.first = one; res.N1 = Nmean;
    res.alphaCr = F.alphaCr(model, Nmean);
    let fin = one, imp = null;
    if (sys.order === "II") {
      /* imperfection loads from first-order axial forces */
      const extra = [], extraQ = model.mem.map(() => ({ qx: 0, qy: 0 }));
      const ph = F.swayPhi(sys, model, Nmean); imp = { sway: ph, bow: [], applied: { sway: false, bow: false } };
      if (sys.sway) {
        model.mem.filter(F.isColumn).forEach(m => {
          const Nc = -Nmean[m.j]; if (Nc <= 0) return;
          const top = sys.nodes[m.ia].z >= sys.nodes[m.ib].z ? m.ia : m.ib;
          extra.push({ n: top, fx: sys.swayDir * ph.phi * Nc }); imp.applied.sway = true;
        });
      }
      if (sys.bow) {
        model.mem.filter(F.isColumn).forEach(m => {
          const Nc = -Nmean[m.j]; if (Nc <= 0) return;
          const A = m.prof.A * 100, fy = F.fy(sys, m.prof), Ncr = Math.PI ** 2 * E_N * m.prof.Iy * 1e4 / (m.L * 1000) ** 2 / 1000;   // kN, hinged member of length L
          const lam = Math.sqrt(A * fy / 1000 / Ncr), lim = 0.5 * Math.sqrt(A * fy / 1000 / Nc);
          const need = lam > lim, e0 = E0[sys.curve] * m.L, q = 8 * Nc * e0 / (m.L * m.L);
          imp.bow.push({ j: m.j, lam, lim, need, e0, q });
          if (need) {   // bow in the sway direction; local y component of a global horizontal load q
            extraQ[m.j].qy += sys.swayDir * q * (-m.s); extraQ[m.j].qx += sys.swayDir * q * m.c; imp.applied.bow = true;
          }
        });
      }
      /* iterate with geometric stiffness (axial forces from the previous iteration) */
      let Ncur = Nmean, prev = null, sol = null, conv = false;
      for (let it = 0; it < 40; it++) {
        sol = F.solveWith(model, Ncur, extra, extraQ);
        if (!sol.ok) { res.kind = "labil"; res.msg = "Zweite Ordnung: " + sol.msg + " Möglicherweise ist die Stabilitätsgrenze (α_cr ≤ 1) überschritten."; res.alphaCr = res.alphaCr; return res; }
        const Nnew = model.mem.map((m, j) => (F.sect(m, sol.ends[j], 0).N + F.sect(m, sol.ends[j], m.L).N) / 2);
        const diff = Math.max(...Nnew.map((v, j) => Math.abs(v - Ncur[j]))) + (prev ? Math.max(...sol.u.map((v, i) => Math.abs(v - prev[i]))) : 1);
        prev = sol.u; Ncur = Nnew; if (diff < 1e-8) { conv = true; break; }
      }
      if (res.alphaCr <= 1) { res.kind = "labil"; res.msg = "Instabil: α_cr = " + f(res.alphaCr, 2) + " ≤ 1. Das System knickt/kippt unter diesen Lasten."; return res; }
      fin = sol; res.imp = imp; res.converged = conv; res.NII = Ncur;
    }
    res.fin = fin; res.ok = true; res.kind = "ok";
    res.msg = (sys.order === "II" ? "Berechnung nach Theorie II. Ordnung mit Imperfektionen" : "Berechnung nach Theorie I. Ordnung") + " · α_cr = " + (isFinite(res.alphaCr) ? f(res.alphaCr, 2) : "∞ (kein Stabilitätsproblem)");
    /* per member results at 21 points */
    res.mem = model.mem.map((m, j) => {
      const pts = F.points(m, 20).map(x => Object.assign({ x }, F.sect(m, fin.ends[j], x)));
      return { j, m, pts, S: fin.ends[j].S, maxM: Math.max(...pts.map(p => Math.abs(p.M))), maxV: Math.max(...pts.map(p => Math.abs(p.Q))), N0: pts.reduce((s, p) => s + p.N, 0) / pts.length };
    });
    /* reactions per support (global): Rx, Rz (up), M (ccw) */
    res.rea = [];
    sys.supports.forEach((s, i) => {
      const n = model.idx[s.n], r = { s, label: "ABCDEFGH"[i] || "S" + (i + 1), ni: n, Rx: fin.R[3 * n], Rz: fin.R[3 * n + 1], M: fin.R[3 * n + 2] };
      res.rea.push(r);
    });
    /* deformation */
    res.u = fin.u;
    res.checks = F.checks(sys, model, res);
    return res;
  };

  F.solve = F.analyse;

  /* ---------- cross-section checks (class 1/2, EN 1993-1-1 6.2.9) ---------- */
  F.checks = function (sys, model, res) {
    return res.mem.map(mr => {
      const p = mr.m.prof, fy = F.fy(sys, p), g0 = sys.gM0;
      const Npl = p.A * 100 * fy / 1000 / g0, Mpl = p.Wply * fy / 1000 / g0;
      const A = p.A * 100, a = Math.min((A - 2 * p.b * p.tf) / A, 0.5);
      const hw = p.h - 2 * p.tf, Av = Math.max(A - 2 * p.b * p.tf + (p.tw + (p.series === "UPN" ? 1 : 2) * p.r) * p.tf, hw * p.tw), Vpl = Av * fy / Math.sqrt(3) / g0 / 1000;
      let worst = { u: 0, x: 0 }, uV = 0;
      mr.pts.forEach(pt => {
        const n = Math.abs(pt.N) / Npl, MNy = n >= 1 ? 0 : Math.min(Mpl, Mpl * (1 - n) / (1 - 0.5 * a)), u = MNy > 0 ? Math.abs(pt.M) / MNy : Infinity;
        if (u > worst.u || (worst.u === 0 && pt.x === 0)) worst = { u, x: pt.x, N: pt.N, M: pt.M, n, MNy };
        uV = Math.max(uV, Math.abs(pt.Q) / Vpl);
      });
      return { j: mr.j, Npl, Mpl, Vpl, a, uMN: worst.u, at: worst, uV, fy };
    });
  };

  /* ---------- Rechenweg ---------- */
  const p = h => "<p>" + h + "</p>", eqDiv = h => '<div class="eq">' + h + "</div>";
  F.steps = function (sys, res) {
    const st = [], gr = F.grade(sys.grade);
    let h = p("Ebenes Rahmentragwerk aus <b>" + sys.nodes.length + " Knoten</b> und <b>" + sys.members.length + " Stäben</b>, Stahl <b>" + sys.grade + "</b> (f<sub>y</sub> = " + gr[1] + " N/mm² für t ≤ 40 mm, E = 210 000 N/mm²).") + "<ul>";
    sys.members.forEach((m, j) => { const a = F.nodeIndex(sys, m.a) + 1, b = F.nodeIndex(sys, m.b) + 1, pr = F.prof(m.prof); h += "<li>Stab " + (j + 1) + " (Knoten " + a + "–" + b + "): " + m.prof + " – A = " + f(pr.A, 2) + " cm², I<sub>y</sub> = " + f(pr.Iy, 0) + " cm⁴" + (m.ha || m.hb ? ", Gelenk am " + [m.ha ? "Anfang" : "", m.hb ? "Ende" : ""].filter(Boolean).join(" und ") : "") + "</li>"; });
    h += "</ul>" + p("Einwirkungen werden mit γ<sub>F</sub> = " + f(sys.gF, 2) + " multipliziert" + (sys.selfWeight ? " (inklusive Eigengewicht der Profile)." : "."));
    st.push({ title: "System und Querschnitte", html: h });
    if (!res.ok) { st.push({ title: "Ergebnis", html: p("<b>" + U.esc(res.msg) + "</b>") }); return st; }

    /* method / stability */
    const ac = res.alphaCr;
    h = p("Die Verzweigungslast der Konstruktion wird als <b>Vergrößerungsfaktor α<sub>cr</sub></b> der Lasten bestimmt, bei dem das System nach Theorie I. Ordnung elastisch seitlich oder durch Knicken versagt (Eigenwertproblem der Steifigkeitsmatrix mit Normalkraft-Anteil):");
    h += eqDiv("α<sub>cr</sub> = <b>" + (isFinite(ac) ? f(ac, 2) : "∞") + "</b>");
    h += p(ac >= 10 ? "α<sub>cr</sub> ≥ 10: Nach EN 1993-1-1 (5.2.1) dürfen die Auswirkungen der Verformungen (Theorie II. Ordnung) bei elastischer Berechnung <b>vernachlässigt</b> werden. Eine Berechnung nach Theorie I. Ordnung reicht, die Bauteile werden mit Knicklängen nachgewiesen (Methode c)." :
      ac >= 3 ? "3 ≤ α<sub>cr</sub> &lt; 10: Die Effekte nach Theorie II. Ordnung sind <b>nicht vernachlässigbar</b>. Eine Berechnung nach Theorie II. Ordnung mit Imperfektionen ist erforderlich (Näherungen mit Vergrößerungsfaktor sind in diesem Bereich erlaubt)." :
        ac > 1 ? "α<sub>cr</sub> &lt; 3: Das System ist sehr verformungsempfindlich. Eine <b>genaue Berechnung nach Theorie II. Ordnung</b> mit Imperfektionen ist zwingend; das System sollte ausgesteift werden." : "α<sub>cr</sub> ≤ 1: Das System ist unter diesen Lasten instabil.");
    st.push({ title: "Stabilität: kritischer Lastfaktor α_cr", html: h });

    if (sys.order === "II" && res.imp) {
      const im = res.imp, ph = im.sway;
      h = p("Berechnung nach <b>Theorie II. Ordnung</b>: Die Gleichgewichtsbedingungen werden am verformten System aufgestellt (geometrische Steifigkeit mit den Normalkräften, iteriert" + (res.converged ? ", konvergiert" : ", nicht vollständig konvergiert") + ").");
      if (sys.sway) {
        h += p("<b>Globale Imperfektion</b> (Schiefstellung) nach EN 1993-1-1, 5.3.2: φ = φ<sub>0</sub> · α<sub>h</sub> · α<sub>m</sub>");
        h += eqDiv("φ<sub>0</sub> = 1/200 &nbsp; α<sub>h</sub> = 2/√h = 2/√" + f(ph.h, 2) + " = " + f(ph.ah, 3) + " (2/3 ≤ α<sub>h</sub> ≤ 1) &nbsp; α<sub>m</sub> = √(0,5·(1 + 1/m)) = √(0,5·(1 + 1/" + ph.m + ")) = " + f(ph.am, 3)) + eqDiv("φ = " + f(ph.phi, 5) + " = 1/" + f(1 / ph.phi, 0));
        h += p("Ersatzlasten: H = φ · N<sub>Ed</sub> am Kopf jeder gedrückten Stütze (Richtung " + (sys.swayDir > 0 ? "+x" : "−x") + ").");
      } else h += p("Globale Imperfektion: <b>nicht</b> angesetzt.");
      if (sys.bow) {
        h += p("<b>Lokale Imperfektion</b> (Vorkrümmung) e<sub>0</sub>/L = 1/" + f(1 / E0[sys.curve], 0) + " (Knicklinie " + sys.curve + ", elastische Berechnung). Sie ist nur nötig, wenn λ̄ &gt; 0,5·√(A·f<sub>y</sub>/N<sub>Ed</sub>) gilt (Stütze als gelenkig gelagerter Stab mit der Länge L):");
        if (!im.bow.length) h += p("Keine gedrückten Stützen.");
        im.bow.forEach(b => { h += eqDiv("Stab " + (b.j + 1) + ": λ̄ = " + f(b.lam, 2) + (b.need ? " &gt; " : " ≤ ") + f(b.lim, 2) + " ⇒ " + (b.need ? "Ersatzlast q = 8·N·e<sub>0</sub>/L² = <b>" + f(b.q, 2) + " kN/m</b> (e<sub>0</sub> = " + f(b.e0 * 1000, 0) + " mm)" : "nicht erforderlich")); });
      } else h += p("Lokale Imperfektion: <b>nicht</b> angesetzt.");
      st.push({ title: "Theorie II. Ordnung und Imperfektionen", html: h });
    }

    /* reactions */
    h = p("Auflagerreaktionen (R<sub>x</sub> → positiv, R<sub>z</sub> ↑ positiv, Einspannmoment ↺ positiv):") + '<table class="tbl"><tr><th>Lager</th><th>R<sub>x</sub> [kN]</th><th>R<sub>z</sub> [kN]</th><th>M [kNm]</th></tr>';
    res.rea.forEach(r => { h += "<tr><td><b>" + r.label + "</b> (Knoten " + (r.ni + 1) + ")</td><td>" + f(r.Rx) + "</td><td>" + f(r.Rz) + "</td><td>" + (r.s.t === "einsp" ? f(r.M) : "–") + "</td></tr>"; });
    h += "</table>";
    let sx = 0, sz = 0; res.model.sys.loads.forEach(l => { if (l.t === "F") { sx += l.fx * sys.gF; sz -= l.fz * sys.gF; } });
    st.push({ title: "Auflagerkräfte", html: h });

    /* member forces */
    h = p("Schnittgrößen an den Stabenden (N Zug +, Q und M wie im Diagramm; M &gt; 0: Zug auf der rechten Seite von Anfang → Ende). Maximalwerte entlang des Stabes:") +
      '<table class="tbl"><tr><th>Stab</th><th>Profil</th><th>N<sub>Anfang</sub></th><th>N<sub>Ende</sub></th><th>max |Q|</th><th>max |M|</th></tr>';
    res.mem.forEach(mr => { h += "<tr><td><b>" + (mr.j + 1) + "</b></td><td>" + mr.m.name + "</td><td>" + f(mr.pts[0].N) + "</td><td>" + f(mr.pts[mr.pts.length - 1].N) + "</td><td>" + f(mr.maxV) + "</td><td>" + f(mr.maxM) + "</td></tr>"; });
    st.push({ title: "Schnittgrößen", html: h + "</table>" + p("Einheiten kN, kNm.") });

    /* checks */
    h = p("<b>Querschnittsnachweis</b> mit den Schnittgrößen " + (sys.order === "II" ? "nach Theorie II. Ordnung" : "nach Theorie I. Ordnung") + " (Querschnittsklasse 1 oder 2 vorausgesetzt, EN 1993-1-1 6.2.9): M<sub>N,y,Rd</sub> = M<sub>pl,y,Rd</sub> · (1 − n)/(1 − 0,5·a) ≤ M<sub>pl,y,Rd</sub>, n = N<sub>Ed</sub>/N<sub>pl,Rd</sub>, a = (A − 2·b·t<sub>f</sub>)/A ≤ 0,5.");
    h += '<table class="tbl"><tr><th>Stab</th><th>Profil</th><th>N<sub>pl,Rd</sub></th><th>M<sub>pl,y,Rd</sub></th><th>V<sub>pl,Rd</sub></th><th>M/M<sub>N,Rd</sub></th><th>V/V<sub>pl,Rd</sub></th></tr>';
    res.checks.forEach(c => { const u = v => '<td class="' + (v > 1 ? "bad" : v > 0.85 ? "warnc" : "okc") + '"><b>' + f(v * 100, 0) + " %</b></td>"; h += "<tr><td><b>" + (c.j + 1) + "</b></td><td>" + res.mem[c.j].m.name + "</td><td>" + f(c.Npl, 0) + " kN</td><td>" + f(c.Mpl, 1) + " kNm</td><td>" + f(c.Vpl, 0) + " kN</td>" + u(c.uMN) + u(c.uV) + "</tr>"; });
    h += "</table>" + p("Nicht enthalten: Biegeknicken und Biegedrillknicken (siehe Tab Stabilität), Querschnittsklasse, Abminderung bei V &gt; 0,5·V<sub>pl,Rd</sub>, Durchbiegung.");
    st.push({ title: "Nachweise", html: h });
    return st;
  };
})(window.APP);
