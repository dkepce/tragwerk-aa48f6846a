/* Tragwerk — "Stabilität" tab: Knicknachweis am Ersatzstab, compression members of the current frame, and a guide to the
   three design methods (a), (b), (c) for frame stability (EN 1993-1-1, 5.2 / 5.3). */
(function (APP) {
  const U = APP.U, $ = U.$, $$ = U.$$, f = U.fmt, F = APP.frame, S = APP.stab;
  const DEF = { prof: "HEB200", grade: "S355", N: "", Ly: "", Lz: "", cy: "auto", cz: "auto", gM1: "1,0", by: "frame", betaY: "1,0", betaZ: "1,0" };
  const state = () => { const t = APP.ui.stab = APP.ui.stab || {}; Object.keys(DEF).forEach(k => { if (t[k] == null) t[k] = DEF[k]; }); return t; };
  const opt = (v, cur, txt) => '<option value="' + v + '"' + (String(cur) === String(v) ? " selected" : "") + ">" + txt + "</option>";
  const inp = (key, label, unit, tip) => '<label title="' + (tip || "") + '">' + label + ' <input type="text" inputmode="decimal" data-sb="' + key + '" value="' + U.esc(state()[key]) + '"> ' + unit + "</label>";
  const sel = (key, label, opts) => "<label>" + label + ' <select data-sb="' + key + '">' + opts.map(o => opt(o[0], state()[key], o[1])).join("") + "</select></label>";
  const profOptions = cur => { const g = {}; F.profileNames().forEach(n => { const k = n.replace(/\d+$/, ""); (g[k] = g[k] || []).push(n); }); return Object.keys(g).map(k => '<optgroup label="' + k + '">' + g[k].map(n => opt(n, cur, n)).join("") + "</optgroup>").join(""); };
  const curSys = () => APP.D.systems.find(x => x.id === APP.D.cur);

  function frameResult() {
    const sys = curSys(); if (!sys || sys.type !== "frame") return null;
    const res = F.analyse(sys); return res.ok ? { sys, res } : { sys, res: null, msg: res.msg };
  }

  /* ---------- the single-member check ---------- */
  function checkCard() {
    const s = state(), p = F.prof(s.prof), gr = F.grade(s.grade), N = U.parse(s.N), Ly = U.parse(s.Ly), Lz = U.parse(s.Lz), g = U.parse(s.gM1) || 1;
    let h = '<div class="card"><h3>Knicknachweis am Ersatzstab (Biegeknicken)</h3><div class="row filters"><label>Profil <select data-sb="prof">' + profOptions(s.prof) + "</select></label>" +
      sel("grade", "Stahl", T3()) + inp("N", "N<sub>Ed</sub>", "kN", "Druckkraft (positiv eingeben), Bemessungswert") + inp("Ly", "L<sub>cr,y</sub>", "m", "Knicklänge in der Rahmenebene (starke Achse)") + inp("Lz", "L<sub>cr,z</sub>", "m", "Knicklänge aus der Rahmenebene (schwache Achse)") + "</div>" +
      '<div class="row filters">' + sel("cy", "Knicklinie y", [["auto", "automatisch (" + S.curveFor(p, "y") + ")"]].concat(S.curves.map(c => [c, c]))) + sel("cz", "Knicklinie z", [["auto", "automatisch (" + S.curveFor(p, "z") + ")"]].concat(S.curves.map(c => [c, c]))) + inp("gM1", "γ<sub>M1</sub>", "", "Teilsicherheitsbeiwert Stabilität (EN 1993-1-1 empfohlen 1,0)") + "</div>";
    if (isNaN(N) || isNaN(Ly) || isNaN(Lz) || N <= 0 || Ly <= 0 || Lz <= 0) return h + '<p class="muted">N<sub>Ed</sub> &gt; 0 und beide Knicklängen eingeben, oder unten einen Stab aus dem Rahmen übernehmen.</p></div>';
    const input = { prof: p, fy: p.tf <= 40 ? gr[1] : gr[2], N, Ly, Lz, cy: s.cy === "auto" ? S.curveFor(p, "y") : s.cy, cz: s.cz === "auto" ? S.curveFor(p, "z") : s.cz, gM1: g };
    const r = S.check(input);
    h += '<p class="status ' + (r.util <= 1 ? "ok" : "warn") + '">N<sub>Ed</sub>/N<sub>b,Rd</sub> = <b>' + f(r.util * 100, 0) + " %</b> – " + (r.util <= 1 ? "Knicknachweis erfüllt" : "Knicknachweis nicht erfüllt") + " (N<sub>b,Rd</sub> = " + f(r.Nb, 1) + " kN, maßgebend Achse " + r.governing + "–" + r.governing + ").</p>";
    h += '<table class="tbl"><tr><th></th><th>L<sub>cr</sub> [m]</th><th>N<sub>cr</sub> [kN]</th><th>λ̄</th><th>Linie</th><th>χ</th><th>N<sub>b,Rd</sub> [kN]</th></tr>' +
      [["y–y", Ly, r.y, r.NbY], ["z–z", Lz, r.z, r.NbZ]].map(a => "<tr><td><b>" + a[0] + "</b></td><td>" + f(a[1], 2) + "</td><td>" + f(a[2].Ncr, 0) + "</td><td>" + f(a[2].lam, 3) + "</td><td>" + a[2].curve + "</td><td>" + f(a[2].chi, 3) + "</td><td><b>" + f(a[3], 1) + "</b></td></tr>").join("") + "</table>";
    h += "<details><summary>Rechenweg anzeigen</summary>" + S.steps(input, r).map(st => "<h4>" + st.title + "</h4>" + st.html).join("") + "</details>";
    h += '<p class="muted">Klasse 1 bis 3 vorausgesetzt. Nicht enthalten: Interaktion von Druck und Biegung (EN 1993-1-1, 6.3.3) und Biegedrillknicken; bei Stäben mit Biegemoment dafür die Norm bzw. die Methoden unten beachten.</p></div>';
    return h;
  }
  const T3 = () => APP.tables.steel.grades.map(g => [g[0], g[0]]);

  /* ---------- compression members of the current frame ---------- */
  function frameCard() {
    const fr = frameResult(), s = state();
    let h = '<div class="card"><h3>Gedrückte Stäbe des aktuellen Rahmens</h3>';
    if (!fr) return h + '<p class="muted">Das aktuelle System ist kein Rahmen. Lege im Tab System einen Rahmen an (z. B. das Beispiel Zweigelenkrahmen), dann erscheinen hier die gedrückten Stäbe mit ihren Knicklängen.</p></div>';
    if (!fr.res) return h + '<p class="muted">Der Rahmen ist nicht lösbar: ' + U.esc(fr.msg) + "</p></div>";
    const { sys, res } = fr, ac = res.alphaCr;
    h += '<div class="row filters">' + sel("by", "Knicklänge in der Ebene aus", [["frame", "α_cr des Rahmens (Ersatzstab im System)"], ["L", "Stablänge (gelenkig)"], ["beta", "β · L (manuell)"]]) + (s.by === "beta" ? inp("betaY", "β<sub>y</sub>", "") : "") + inp("betaZ", "β<sub>z</sub> (aus der Ebene)", "", "Knicklänge aus der Ebene = β<sub>z</sub> · Stablänge; z. B. 0,5 bei seitlicher Halterung in Stabmitte") + "</div>";
    const rows = res.mem.filter(mr => mr.N0 < -1e-6);
    if (!rows.length) return h + '<p class="muted">Im Rahmen gibt es keine gedrückten Stäbe.</p></div>';
    const Nn = res.NII || res.N1;
    h += '<div class="tscroll"><table class="tbl wide"><tr><th>Stab</th><th>Profil</th><th>N<sub>Ed</sub> [kN]</th><th>L [m]</th><th>L<sub>cr,y</sub> [m]</th><th>L<sub>cr,z</sub> [m]</th><th>N<sub>b,Rd</sub> [kN]</th><th>N<sub>Ed</sub>/N<sub>b,Rd</sub></th><th></th></tr>';
    rows.forEach(mr => {
      const m = mr.m, p = m.prof, Ned = -Nn[mr.j], gr = F.grade(sys.grade), fy = p.tf <= 40 ? gr[1] : gr[2], L = m.L;
      let Ly = L;
      if (s.by === "frame" && F.isColumn(m)) { const EI = 210000 * p.Iy * 1e4 / 1e9; Ly = isFinite(ac) ? Math.PI * Math.sqrt(EI / (ac * Ned)) : L; }
      else if (s.by === "beta") Ly = (U.parse(s.betaY) || 1) * L;
      const Lz = (U.parse(s.betaZ) || 1) * L, r = S.check({ prof: p, fy, N: Ned, Ly, Lz, cy: S.curveFor(p, "y"), cz: S.curveFor(p, "z"), gM1: U.parse(s.gM1) || 1 });
      h += "<tr><td><b>S" + (mr.j + 1) + "</b></td><td>" + m.name + "</td><td>" + f(Ned, 1) + "</td><td>" + f(L, 2) + "</td><td>" + f(Ly, 2) + "</td><td>" + f(Lz, 2) + "</td><td>" + f(r.Nb, 0) + '</td><td class="' + (r.util > 1 ? "bad" : r.util > 0.85 ? "warnc" : "okc") + '"><b>' + f(r.util * 100, 0) + ' %</b></td><td><button data-sb-take="' + mr.j + '">übernehmen</button></td></tr>';
    });
    h += "</table></div>";
    h += '<p class="muted">N<sub>Ed</sub> aus der gewählten Berechnung (' + (sys.order === "II" ? "Theorie II. Ordnung" : "Theorie I. Ordnung") + "). L<sub>cr,y</sub> aus α<sub>cr</sub> = " + (isFinite(ac) ? f(ac, 2) : "∞") + ": L<sub>cr</sub> = π·√(E·I / (α<sub>cr</sub>·N<sub>Ed</sub>)). Dies ist eine Näherung für Stäbe, bei denen die Eigenform des Rahmens durch diesen Stab bestimmt wird. In Methode (b) sind Biegeknicken in der Ebene und Querschnittsnachweis bereits in der Berechnung nach Theorie II. Ordnung enthalten; der Ersatzstab ist dort vor allem für das Knicken aus der Ebene nötig.</p></div>";
    return h;
  }

  /* ---------- method guide ---------- */
  function methodCard() {
    const fr = frameResult(), s = state();
    let h = '<div class="card"><h3>Methodenwahl für die Stabilität von Rahmen (a), (b), (c)</h3>' +
      "<p>Bei Rahmen müssen Stabilitätseffekte (Knicken der Stützen, seitliches Ausweichen des ganzen Rahmens, Biegedrillknicken) nachgewiesen werden. Es gibt drei Wege; sie unterscheiden sich darin, <b>wie viel in der Berechnung</b> und <b>wie viel in den Nachweisen</b> steckt:</p>" +
      '<div class="tscroll"><table class="tbl methods"><tr><th></th><th>Tragwerksberechnung, Imperfektionen</th><th>Querschnitts- und Bauteilnachweise</th><th>In Tragwerk</th></tr>' +
      "<tr><td><b>(a)</b></td><td>Räumliche Berechnung nach Theorie II. Ordnung mit globalen und lokalen Imperfektionen in und aus der Rahmenebene, mit Wölbkrafttorsion.</td><td>Nur Querschnittsnachweise mit den Schnittgrößen nach Theorie II. Ordnung. Keine Ersatzstabnachweise, weil alle Stabilitätseffekte in der Berechnung stecken.</td><td>Nicht berechenbar (3D). Hier nur zur Orientierung.</td></tr>" +
      "<tr><td><b>(b)</b></td><td>Ebene Berechnung nach Theorie II. Ordnung mit globalen und lokalen Imperfektionen <b>in</b> der Rahmenebene. Lokale Imperfektion nur bei λ̄ &gt; 0,5·√(A·f<sub>y</sub>/N<sub>Ed</sub>).</td><td>Querschnittsnachweise mit Schnittgrößen nach Theorie II. Ordnung (Biegeknicken in der Ebene ist damit erfasst). Zusätzlich Bauteilnachweis am Ersatzstab für Biegeknicken <b>aus</b> der Ebene und Biegedrillknicken, mit den Momenten nach Theorie II. Ordnung.</td><td>Ja: Berechnung „Theorie II. Ordnung“ im Rahmen, Knicken aus der Ebene im Knicknachweis oben.</td></tr>" +
      "<tr><td><b>(c)</b></td><td>Ebene Berechnung nach Theorie I. Ordnung am idealen Tragwerk, ohne Imperfektionen.</td><td>Bauteilnachweis am Ersatzstab für Biegeknicken in der Ebene mit der Knicklänge L<sub>cr,y</sub> (z. B. β·h aus dem Rahmen) und Momenten nach Theorie I. Ordnung; ebenso für Knicken aus der Ebene (L<sub>cr,z</sub>, z. B. h/2 bei Halterung in Stabmitte). Annahme: keine Biegedrillknickgefahr.</td><td>Ja: Berechnung „Theorie I. Ordnung“, Knicklängen aus α<sub>cr</sub> oder β·L, Knicknachweis oben.</td></tr></table></div>";
    h += "<h4>Welche Methode passt?</h4><ul><li><b>α<sub>cr</sub> ≥ 10:</b> Verformungseffekte dürfen bei elastischer Berechnung vernachlässigt werden (EN 1993-1-1, 5.2.1). Methode (c) reicht, wenn der Ersatzstab mit passender Knicklänge nachgewiesen wird.</li><li><b>3 ≤ α<sub>cr</sub> &lt; 10:</b> Theorie II. Ordnung mit Imperfektionen nötig, also Methode (b) (oder (a), wenn räumlich gerechnet wird).</li><li><b>α<sub>cr</sub> &lt; 3:</b> sehr verformungsempfindlich: genaue Berechnung nach Theorie II. Ordnung, Aussteifung prüfen.</li><li>Biegedrillknicken ist bei (b) und (c) ein eigener Nachweis (in Tragwerk noch nicht enthalten). Bei (c) wird es im Beispiel ausgeschlossen.</li></ul>";
    if (fr && fr.res) {
      const ac = fr.res.alphaCr, rec = ac >= 10 ? "(c) Theorie I. Ordnung mit Ersatzstab (oder (b))" : ac > 1 ? "(b) Theorie II. Ordnung mit Imperfektionen" : "keine, das System ist instabil";
      h += '<p class="status ' + (ac > 1 ? "ok" : "warn") + '">Für „' + U.esc(fr.sys.name) + "“ mit α<sub>cr</sub> = <b>" + (isFinite(ac) ? f(ac, 2) : "∞") + "</b> passt: <b>" + rec + "</b>. Aktuell eingestellt: <b>" + (fr.sys.order === "II" ? "Theorie II. Ordnung" + (fr.sys.sway || fr.sys.bow ? " mit Imperfektionen (≈ Methode b)" : " ohne Imperfektionen") : "Theorie I. Ordnung (≈ Methode c)") + "</b>.</p>" +
        '<div class="row"><button data-sb-method="b">Rahmen auf Methode (b) stellen</button><button data-sb-method="c">Rahmen auf Methode (c) stellen</button></div>';
    } else h += '<p class="muted">Mit einem Rahmen im Tab System zeigt dieser Abschnitt hier die Empfehlung für dein System.</p>';
    return h + "</div>";
  }

  APP.renderStab = function () {
    const st = $("#stage");
    st.innerHTML = '<div class="steps wide"><h2 class="stitle">Stabilität</h2><p class="muted">Knicknachweis am Ersatzstab, gedrückte Stäbe des Rahmens und die Wahl der Nachweismethode. Die Ergebnisse sind Orientierung, nicht Bemessung (siehe Hinweise in den Karten).</p>' + checkCard() + frameCard() + methodCard() + "</div>";
    $$("[data-sb]", st).forEach(el => el.addEventListener(el.tagName === "SELECT" ? "change" : "change", () => { state()[el.dataset.sb] = el.value; APP.saveUI(); APP.renderStab(); }));
    $$("[data-sb-take]", st).forEach(b => b.addEventListener("click", () => {
      const fr = frameResult(); if (!fr || !fr.res) return; const mr = fr.res.mem[+b.dataset.sbTake], s = state(), Nn = fr.res.NII || fr.res.N1, p = mr.m.prof;
      const EI = 210000 * p.Iy * 1e4 / 1e9, ac = fr.res.alphaCr, Ned = -Nn[mr.j];
      s.prof = mr.m.name; s.grade = fr.sys.grade; s.N = U.show(+Ned.toFixed(2));
      s.Ly = U.show(+(s.by === "frame" && isFinite(ac) && F.isColumn(mr.m) ?Math.PI * Math.sqrt(EI / (ac * Ned)) : s.by === "beta" ? (U.parse(s.betaY) || 1) * mr.m.L : mr.m.L).toFixed(3));
      s.Lz = U.show(+((U.parse(s.betaZ) || 1) * mr.m.L).toFixed(3)); APP.saveUI(); APP.renderStab(); window.scrollTo(0, 0); const stg = $("#stage"); if (stg) stg.scrollTo(0, 0);
    }));
    $$("[data-sb-method]", st).forEach(b => b.addEventListener("click", () => {
      const sys = curSys(); if (!sys || sys.type !== "frame") return;
      if (b.dataset.sbMethod === "b") { sys.order = "II"; sys.sway = true; sys.bow = true; } else { sys.order = "I"; }
      APP.save(); APP.renderStab(); APP.toast("Rahmen „" + sys.name + "“ steht jetzt auf Methode (" + b.dataset.sbMethod + ").");
    }));
  };
})(window.APP);
