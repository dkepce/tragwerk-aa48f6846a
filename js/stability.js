/* Tragwerk — Knicknachweis am Ersatzstab (EN 1993-1-1, 6.3.1): pure maths + worked steps, no DOM.
   Compression member, buckling about y-y (strong axis, in the frame plane) and z-z (weak axis, out of plane).
   Class 1 to 3 cross-section assumed. Not included: bending + compression interaction (6.3.3), lateral-torsional buckling. */
(function (APP) {
  const U = APP.U, f = U.fmt;
  const S = (APP.stab = {});
  const ALPHA = { a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76 };
  const E = 210000;
  S.curves = Object.keys(ALPHA);

  /* buckling curve for rolled sections (EN 1993-1-1 Table 6.2, steel up to S420) */
  S.curveFor = function (p, axis) {
    if (p.series === "UPN") return "c";
    const hb = p.h / p.b;
    if (hb > 1.2) return p.tf <= 40 ? (axis === "y" ? "a" : "b") : (axis === "y" ? "b" : "c");
    return p.tf <= 100 ? (axis === "y" ? "b" : "c") : "d";
  };

  /* one axis: returns lambda-bar, phi, chi, Ncr */
  S.axis = function (A, fy, I, Lcr, curve) {   // A mm2, fy N/mm2, I mm4, Lcr mm
    const Ncr = Math.PI ** 2 * E * I / (Lcr * Lcr), lam = Math.sqrt(A * fy / Ncr), al = ALPHA[curve];
    const phi = 0.5 * (1 + al * (lam - 0.2) + lam * lam), chi = lam <= 0.2 ? 1 : Math.min(1, 1 / (phi + Math.sqrt(Math.max(phi * phi - lam * lam, 0))));
    return { Ncr: Ncr / 1000, lam, phi, chi, alpha: al, curve };
  };

  /* inp: {prof (object from APP.frame.prof), fy, N (kN, compression positive), Ly, Lz (m), cy, cz (curve names), gM1} */
  S.check = function (inp) {
    const p = inp.prof, A = p.A * 100, fy = inp.fy, gM1 = inp.gM1 || 1;
    const y = S.axis(A, fy, p.Iy * 1e4, inp.Ly * 1000, inp.cy), z = S.axis(A, fy, p.Iz * 1e4, inp.Lz * 1000, inp.cz);
    const NbY = y.chi * A * fy / gM1 / 1000, NbZ = z.chi * A * fy / gM1 / 1000, Nb = Math.min(NbY, NbZ);
    return { y, z, A, fy, gM1, NbY, NbZ, Nb, governing: NbY <= NbZ ? "y" : "z", util: inp.N / Nb, Npl: A * fy / gM1 / 1000, eps: Math.sqrt(235 / fy), lam1: 93.9 * Math.sqrt(235 / fy) };
  };

  const eqDiv = h => '<div class="eq">' + h + "</div>";
  S.steps = function (inp, r) {
    const p = inp.prof, st = [];
    let h = "<p><b>" + p.name + "</b>, Stahl mit f<sub>y</sub> = " + f(r.fy, 0) + " N/mm², A = " + f(p.A, 2) + " cm² = " + f(r.A, 0) + " mm², E = 210 000 N/mm². Gesucht: Biegeknicken des gedrückten Stabes mit N<sub>Ed</sub> = <b>" + f(inp.N) + " kN</b>.</p>" +
      eqDiv("N<sub>pl,Rd</sub> = A · f<sub>y</sub> / γ<sub>M1</sub> = " + f(r.A, 0) + " · " + f(r.fy, 0) + " / " + f(r.gM1, 2) + " = " + f(r.Npl, 1) + " kN") +
      eqDiv("ε = √(235/f<sub>y</sub>) = " + f(r.eps, 3) + " &nbsp; λ<sub>1</sub> = 93,9·ε = " + f(r.lam1, 1));
    st.push({ title: "Querschnitt", html: h });
    [["y", r.y, inp.Ly, p.Iy, "y–y (starke Achse, in der Rahmenebene)"], ["z", r.z, inp.Lz, p.Iz, "z–z (schwache Achse, aus der Rahmenebene)"]].forEach(a => {
      const k = a[1];
      st.push({ title: "Biegeknicken um " + a[4], html:
        eqDiv("L<sub>cr," + a[0] + "</sub> = " + f(a[2], 2) + " m") +
        eqDiv("N<sub>cr," + a[0] + "</sub> = π²·E·I<sub>" + a[0] + "</sub> / L<sub>cr</sub>² = π² · 210 000 · " + f(a[3], 0) + "·10⁴ / (" + f(a[2] * 1000, 0) + ")² = <b>" + f(k.Ncr, 1) + " kN</b>") +
        eqDiv("λ̄<sub>" + a[0] + "</sub> = √(A·f<sub>y</sub> / N<sub>cr</sub>) = √(" + f(r.A, 0) + " · " + f(r.fy, 0) + " / " + f(k.Ncr * 1000, 0) + ") = <b>" + f(k.lam, 3) + "</b>") +
        eqDiv("Knicklinie " + k.curve + " ⇒ α = " + f(k.alpha, 2) + " &nbsp; Φ = 0,5·(1 + α·(λ̄ − 0,2) + λ̄²) = " + f(k.phi, 3)) +
        eqDiv("χ<sub>" + a[0] + "</sub> = 1 / (Φ + √(Φ² − λ̄²)) = <b>" + f(k.chi, 3) + "</b>" + (k.lam <= 0.2 ? " (λ̄ ≤ 0,2: Knicken darf vernachlässigt werden, χ = 1)" : "")) +
        eqDiv("N<sub>b,Rd," + a[0] + "</sub> = χ · A · f<sub>y</sub> / γ<sub>M1</sub> = " + f(k.chi, 3) + " · " + f(r.A, 0) + " · " + f(r.fy, 0) + " / " + f(r.gM1, 2) + " = <b>" + f(a[0] === "y" ? r.NbY : r.NbZ, 1) + " kN</b>") });
    });
    st.push({ title: "Nachweis", html: eqDiv("N<sub>b,Rd</sub> = min(" + f(r.NbY, 1) + "; " + f(r.NbZ, 1) + ") = <b>" + f(r.Nb, 1) + " kN</b> (maßgebend: Achse " + r.governing + "–" + r.governing + ")") +
      eqDiv("N<sub>Ed</sub> / N<sub>b,Rd</sub> = " + f(inp.N, 1) + " / " + f(r.Nb, 1) + " = <b>" + f(r.util * 100, 0) + " %</b> " + (r.util <= 1 ? "✓" : "✗ nicht erfüllt")) });
    return st;
  };
})(window.APP);
