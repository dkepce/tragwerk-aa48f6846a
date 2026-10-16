/* Tragwerk — screens and editor controller.
   Three tabs: "System" (draw + tables + results), "Rechenweg" (step-by-step calculation), "Info" (signs and legend).
   The type-specific parts (beam / truss) live in beam_ui.js and truss_ui.js (APP.typeUI.beam / .truss).
   Pattern: change APP.D, call APP.save(), call refresh()/refreshAll(). Escape every user string with U.esc(). */
(function (APP) {
  const U = APP.U, $ = U.$, $$ = U.$$;
  const ed = (APP.ed = { tool: "select", sel: null, pending: null, drag: null });
  let res = null;

  const cur = () => APP.D.systems.find(s => s.id === APP.D.cur) || null;
  const TYPE_NAME = { beam: "Träger", truss: "Fachwerk", frame: "Rahmen" };
  const mod = sys => APP.moduleOf(sys.type);
  const tui = sys => APP.typeUI[sys.type];
  const recalc = () => { const s = cur(); res = s ? mod(s).solve(s) : null; };

  /* ---------- partial redraws ---------- */
  function drawSystem() {
    const sys = cur(), svg = $("#sysSvg"); if (!sys || !svg) return;
    svg.setAttribute("viewBox", tui(sys).viewBox(sys));
    svg.innerHTML = tui(sys).draw(sys, res, ed);
  }
  function drawResults() {
    const sys = cur(); if (!sys || !$("#resBox")) return;
    $("#resBox").innerHTML = tui(sys).results(sys, res);
    $("#cvDia").innerHTML = tui(sys).diagrams(sys, res);
  }
  function drawTables() { const sys = cur(); if (sys && $("#tabBox")) $("#tabBox").innerHTML = tui(sys).tables(sys, res, ed); }
  function drawTools() {
    const sys = cur(); if (!sys || !$("#tools")) return;
    $("#tools").innerHTML = tui(sys).tools.map(t => '<button class="tool' + (ed.tool === t[0] ? " on" : "") + '" data-tool="' + t[0] + '">' + t[1] + "</button>").join("");
    $("#hint").textContent = tui(sys).hints[ed.tool] || "";
  }
  function refresh() { recalc(); drawSystem(); drawResults(); }
  function refreshAll() { refresh(); drawTables(); }

  /* ---------- the "System" tab ---------- */
  function renderEdit() {
    const st = $("#stage"), sys = cur();
    if (!sys) {
      st.innerHTML = '<div class="card welcome"><h2>Willkommen bei Tragwerk</h2><p>Ein Statik-Löser für Träger, Fachwerke und Rahmen: Lager setzen, Lasten aufbringen, Auflagerkräfte und Schnittgrößen mit Rechenweg ansehen.</p>' +
        '<div class="row"><button class="primary" data-new="beam">Neuer Träger</button><button class="primary" data-new="truss">Neues Fachwerk</button><button class="primary" data-new="frame">Neuer Rahmen</button></div>' +
        '<p class="muted">Oder zuerst ein Beispiel ansehen:</p><div class="row"><button data-new="exbeam">Beispiel Einfeldträger</button><button data-new="extruss">Beispiel Fachwerk</button><button data-new="exframe">Beispiel Zweigelenkrahmen</button></div></div>';
      return;
    }
    const u = tui(sys);
    st.innerHTML =
      '<div class="ed"><div class="edTop">' +
      '<select id="sysSel" title="System wählen">' + APP.D.systems.map(s => '<option value="' + s.id + '"' + (s.id === sys.id ? " selected" : "") + ">" + TYPE_NAME[s.type] + ": " + U.esc(s.name) + "</option>").join("") + "</select>" +
      '<input id="sysName" type="text" data-p="name" value="' + U.esc(sys.name) + '" title="Name des Systems">' +
      '<select id="addSel" title="Neues System"><option value="">＋ Neu…</option><option value="beam">Träger (leer)</option><option value="truss">Fachwerk (leer)</option><option value="frame">Rahmen (leer)</option><option value="exbeam">Beispiel: Einfeldträger</option><option value="extruss">Beispiel: Fachwerk</option><option value="exframe">Beispiel: Zweigelenkrahmen</option></select>' +
      '<button data-sys="lib" title="Eine Kopie in der Bibliothek ablegen, um sie später wieder zu verwenden">★ In Bibliothek speichern</button><button data-sys="dup">Duplizieren</button><button data-sys="del">Löschen</button>' +
      '<span class="params">' + u.params(sys) + "</span></div>" +
      '<div class="edMain"><section class="edLeft"><div id="tools" class="tools"></div><div id="hint" class="hint"></div>' +
      '<div class="cv"><svg id="sysSvg" xmlns="http://www.w3.org/2000/svg"></svg></div><div id="cvDia"></div></section>' +
      '<aside class="edRight"><div id="resBox"></div><div id="tabBox"></div></aside></div></div>';
    drawTools(); refreshAll();
  }

  /* ---------- the "Rechenweg" tab ---------- */
  function renderSteps() {
    const st = $("#stage"), sys = cur();
    if (!sys) { st.innerHTML = '<div class="card"><p>Lege zuerst im Tab „System“ ein System an.</p></div>'; return; }
    const steps = mod(sys).steps(sys, res);
    st.innerHTML = '<div class="steps"><h2 class="stitle">' + U.esc(sys.name) + '</h2><p class="muted">Rechenweg von Hand nachvollziehbar. Einheiten: kN, m, kNm.</p>' +
      steps.map((s, i) => '<section class="card step"><h3><span class="num">' + (i + 1) + "</span> " + s.title + "</h3>" + s.html + "</section>").join("") + "</div>";
  }

  /* ---------- the "Info" tab ---------- */
  function renderInfo() {
    $("#stage").innerHTML = '<div class="steps">' +
      '<section class="card"><h3>Vorzeichen und Konventionen</h3><ul>' +
      "<li><b>Lasten:</b> Einzel- und Streckenlasten sind positiv, wenn sie nach <b>unten</b> (↓) wirken. Horizontale Lasten F→ sind positiv nach rechts.</li>" +
      "<li><b>Auflagerreaktionen:</b> A<sub>z</sub> positiv nach <b>oben</b> (↑), A<sub>x</sub> positiv nach rechts (→), Einspannmomente positiv im Uhrzeigersinn (↻). Ein negatives Ergebnis heißt: Die Reaktion zeigt in Gegenrichtung.</li>" +
      "<li><b>Querkraft Q:</b> Summe der Vertikalkräfte links vom Schnitt (↑ positiv). <b>Moment M:</b> positiv, wenn die Zugfaser unten liegt; das M-Diagramm wird auf der Zugseite (nach unten) gezeichnet. <b>Normalkraft N:</b> Zug positiv.</li>" +
      "<li><b>Fachwerk:</b> z zeigt nach oben. Stabkräfte: <b>Zug positiv</b> (blau), <b>Druck negativ</b> (rot), Nullstäbe grau.</li>" +
      "<li><b>Rahmen:</b> z zeigt nach oben, Knotenlasten F↓ und F→, Streckenlasten auf die Stablänge. Das Momentendiagramm liegt auf der Zugseite; M &gt; 0 heißt Zug auf der rechten Seite von Stabanfang → Stabende. Einheiten kN, m, kNm.</li></ul></section>" +
      '<section class="card"><h3>Bedienung</h3><ul>' +
      "<li>Werkzeug links wählen, dann auf den Träger bzw. Knoten klicken. Mit „Auswahl“ lassen sich Elemente anklicken und verschieben.</li>" +
      "<li>Alle Zahlen stehen rechts in der Tabelle und können dort getippt werden (Komma oder Punkt). Zeichnung und Tabelle sind immer gleich.</li>" +
      "<li><b>Entf</b> löscht das ausgewählte Element, <b>Esc</b> wechselt zurück zur Auswahl.</li>" +
      "<li>Das Raster (Fangabstand) steht oben rechts im System-Tab.</li>" +
      "<li><b>Träger-Modi:</b> „Gestrichelte Faser“ (unten/oben) und „x von“ (links/rechts) ändern die Vorzeichen von Q und M; N bleibt gleich. Das Werkzeug <b>Schnitt</b> zeigt im Rechenweg N, Q, M an beliebiger Stelle mit Skizze der positiven Schnittgrößen.</li>" +
      "<li><b>★ In Bibliothek speichern</b> legt eine Kopie des Systems als Karte im Tab Bibliothek ab.</li></ul></section>" +
      '<section class="card"><h3>Was Version 1 kann – und was nicht</h3><ul>' +
      "<li>Statisch <b>bestimmte</b> Träger (Einfeldträger, Kragarm, Gerberträger mit Gelenken) und Fachwerke (Abzählkriterium m + r = 2k).</li>" +
      "<li><b>Rahmen</b> (ebenes Stabwerk, Steifigkeitsverfahren) dürfen auch statisch unbestimmt sein; Theorie I. und II. Ordnung mit Imperfektionen, α<sub>cr</sub>, Querschnittsnachweis, Knicknachweis im Tab Stabilität. Nicht enthalten: räumliche Berechnung (Methode a), Biegedrillknicken, Durchbiegungsnachweis, Querschnittsklassen.</li>" +
      "<li>Statisch unbestimmte Systeme erkennt Tragwerk und meldet den Grad, löst sie aber noch nicht.</li></ul></section></div>";
  }

  /* ---------- systems ---------- */
  function addSystem(kind) {
    const sys = ({ beam: () => APP.beam.blank(), truss: () => APP.truss.blank(), frame: () => APP.frame.blank(), exbeam: () => APP.beam.example(), extruss: () => APP.truss.example(), exframe: () => APP.frame.example() })[kind]();
    APP.D.systems.push(sys); APP.D.cur = sys.id; ed.sel = null; ed.pending = null; ed.tool = "select";
    APP.save(); APP.render();
  }
  function cloneSys(sys) {    // deep copy with fresh ids everywhere (references between elements stay intact)
    let txt = JSON.stringify(sys); const ids = {};
    txt.replace(/"id":"([^"]+)"/g, (m, id) => { ids[id] = U.uid(); return m; });
    Object.keys(ids).forEach(id => { txt = txt.split('"' + id + '"').join('"' + ids[id] + '"'); });
    return JSON.parse(txt);
  }
  function duplicateSystem() {
    const sys = cur(); if (!sys) return;
    const copy = cloneSys(sys); copy.name = sys.name + " (Kopie)";
    APP.D.systems.push(copy); APP.D.cur = copy.id; ed.sel = null; APP.save(); APP.render();
  }
  function saveToLibrary() {
    const sys = cur(); if (!sys) return;
    APP.D.library.unshift({ id: U.uid(), name: sys.name, type: sys.type, saved: new Date().toISOString(), sys: cloneSys(sys) });
    APP.save(); APP.toast("„" + sys.name + "“ ist jetzt in der Bibliothek.");
  }

  /* ---------- the "Bibliothek" tab: saved systems as cards ---------- */
  function renderLib() {
    const st = $("#stage"), lib = APP.D.library;
    if (!lib.length) { st.innerHTML = '<div class="card welcome"><h2>Bibliothek</h2><p>Hier liegen gespeicherte Systeme als Karten. Im Tab „System“ auf <b>★ In Bibliothek speichern</b> klicken, um eine Kopie des aktuellen Systems abzulegen.</p></div>'; return; }
    st.innerHTML = '<h2 class="stitle">Bibliothek</h2><p class="muted">Gespeicherte Kopien. „Öffnen“ legt eine neue Kopie im Tab System an; die Karte bleibt unverändert.</p><div class="lib">' +
      lib.map(e => {
        const t = APP.typeUI[e.type], r = APP.moduleOf(e.type).solve(e.sys), n = e.type === "beam" ? e.sys.loads.length + " Lasten, " + e.sys.supports.length + " Lager" : e.sys.nodes.length + " Knoten, " + e.sys.members.length + " Stäbe";
        return '<div class="card libcard"><svg viewBox="' + t.viewBox(e.sys) + '" preserveAspectRatio="xMidYMid meet">' + t.draw(e.sys, r, { sel: null, pending: null }) + "</svg>" +
          '<input type="text" data-lib="name" data-id="' + e.id + '" value="' + U.esc(e.name) + '">' +
          '<div class="meta">' + TYPE_NAME[e.type] + " · " + n + " · " + new Date(e.saved).toLocaleDateString("de-AT") + "</div>" +
          '<div class="row"><button class="primary" data-lib-act="open" data-id="' + e.id + '">Öffnen</button><button data-lib-act="del" data-id="' + e.id + '">Löschen</button></div></div>';
      }).join("") + "</div>";
  }
  function libAction(act, id) {
    const e = APP.D.library.find(x => x.id === id); if (!e) return;
    if (act === "open") {
      const copy = cloneSys(e.sys); copy.name = e.name;
      APP.D.systems.push(copy); APP.D.cur = copy.id; ed.sel = null; ed.pending = null; ed.tool = "select"; APP.save(); APP.setView("edit"); APP.toast("Kopie von „" + e.name + "“ geöffnet.");
    } else if (act === "del") {
      if (!confirm("Karte „" + e.name + "“ aus der Bibliothek löschen?")) return;
      APP.D.library = APP.D.library.filter(x => x.id !== id); APP.save(); renderLib();
    }
  }
  function deleteSystem() {
    const sys = cur(); if (!sys || !confirm("System „" + sys.name + "“ wirklich löschen?")) return;
    APP.D.systems = APP.D.systems.filter(s => s.id !== sys.id); APP.fixData(); ed.sel = null; APP.save(); APP.render();
  }

  /* ---------- events (delegated on #stage so re-rendering is safe) ---------- */
  function handle(code) {
    if (!code) return;
    if (code === "move") refresh();
    else if (code === "sel") { drawSystem(); drawTables(); }
    else if (code === "struct") { APP.save(); refreshAll(); }
  }
  function removeSel() {
    const sys = cur(); if (!sys || !ed.sel) return;
    tui(sys).remove(sys, ed.sel.kind, ed.sel.id); ed.sel = null; APP.save(); refreshAll();
  }
  function bindStage() {
    const st = $("#stage");
    st.addEventListener("pointerdown", e => {
      const svg = $("#sysSvg"), sys = cur(); if (!svg || !sys || e.button !== 0 || !svg.contains(e.target)) return;
      try { svg.setPointerCapture(e.pointerId); } catch (x) { }
      e.preventDefault(); handle(tui(sys).down(e, APP.svg.point(svg, e), sys, res, ed));
    });
    st.addEventListener("pointermove", e => {
      const svg = $("#sysSvg"), sys = cur(); if (!svg || !sys || !ed.drag) return;
      handle(tui(sys).move(e, APP.svg.point(svg, e), sys, res, ed));
    });
    st.addEventListener("pointerup", e => {
      const svg = $("#sysSvg"), sys = cur(); if (!svg || !sys || !ed.drag) return;
      handle(tui(sys).up(e, APP.svg.point(svg, e), sys, res, ed));
    });
    st.addEventListener("click", e => {
      const t = e.target, sys = cur();
      const nw = t.closest("[data-new]"); if (nw) { addSystem(nw.dataset.new); return; }
      const sb = t.closest("[data-sys]"); if (sb) { if (sb.dataset.sys === "dup") duplicateSystem(); else if (sb.dataset.sys === "lib") saveToLibrary(); else deleteSystem(); return; }
      const la = t.closest("[data-lib-act]"); if (la) { libAction(la.dataset.libAct, la.dataset.id); return; }
      if (!sys) return;
      const tool = t.closest("[data-tool]"); if (tool) { ed.tool = tool.dataset.tool; ed.pending = null; drawTools(); drawSystem(); return; }
      const dl = t.closest("[data-del]");
      if (dl) { tui(sys).remove(sys, dl.dataset.k, dl.dataset.id); if (ed.sel && ed.sel.id === dl.dataset.id) ed.sel = null; APP.save(); refreshAll(); return; }
      const act = t.closest("[data-act]");
      if (act) { const r = tui(sys).action(sys, act.dataset.act); if (r) ed.sel = r; APP.save(); refreshAll(); return; }
      const row = t.closest("#tabBox [data-kind]");
      if (row && !/INPUT|SELECT|BUTTON/.test(t.tagName)) { ed.sel = { kind: row.dataset.kind, id: row.dataset.id }; drawSystem(); drawTables(); }
    });
    st.addEventListener("change", e => {
      const t = e.target, sys = cur();
      if (t.dataset.lib === "name") { const en = APP.D.library.find(x => x.id === t.dataset.id); if (en) { en.name = t.value.trim() || en.name; en.sys.name = en.name; APP.save(); } return; }
      if (!sys) return;
      if (t.id === "sysSel") { APP.D.cur = t.value; ed.sel = null; ed.pending = null; ed.tool = "select"; APP.save(); APP.render(); return; }
      if (t.id === "addSel") { if (t.value) addSystem(t.value); return; }
      if (t.dataset.p === "name") { sys.name = t.value.trim() || sys.name; APP.save(); const o = $("#sysSel option:checked"); if (o) o.textContent = TYPE_NAME[sys.type] + ": " + sys.name; return; }
      if (t.dataset.p) { tui(sys).setParam(sys, t.dataset.p, t.type === "checkbox" ? (t.checked ? "1" : "0") : t.value); APP.save(); renderEdit(); return; }
      if (t.dataset.k) {
        const u = tui(sys); u.setField(sys, t.dataset.k, t.dataset.id, t.dataset.f, t.type === "checkbox" ? (t.checked ? "1" : "0") : t.value); APP.save();
        if (t.tagName === "SELECT" || t.type === "checkbox" || t.dataset.f === "a" || t.dataset.f === "b" || t.dataset.f === "n") { refreshAll(); return; }
        refresh();
        const v = u.getField(sys, t.dataset.k, t.dataset.id, t.dataset.f), typed = U.parse(t.value);
        if (typeof v === "number") {
          if (!isNaN(typed) && Math.abs(typed - v) > 1e-9) APP.toast("Wert auf den erlaubten Bereich begrenzt: " + U.show(v) + " (Punkte müssen auf dem Träger bzw. in der Zeichenfläche liegen).");
          t.value = t.inputMode === "numeric" ? String(v) : U.show(v);
        }
      }
    });
    /* update the drawing while typing, so it is obvious that the number was taken */
    st.addEventListener("input", e => {
      const t = e.target, sys = cur();
      if (!sys || !t.dataset.k || t.tagName !== "INPUT" || t.inputMode === "numeric" || t.type === "checkbox") return;   // node numbers only apply on change
      tui(sys).setField(sys, t.dataset.k, t.dataset.id, t.dataset.f, t.value); APP.save(); refresh();
    });
    document.addEventListener("keydown", e => {
      if (APP.ui.view !== "edit" || !cur() || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName || "")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && ed.sel) { e.preventDefault(); removeSel(); }
      else if (e.key === "Escape") { ed.pending = null; ed.tool = "select"; drawTools(); drawSystem(); }
    });
  }

  APP.render = function () {
    $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.view === APP.ui.view));
    recalc();
    ({ edit: renderEdit, steps: renderSteps, lib: renderLib, tbl: () => APP.renderTables(), stab: () => APP.renderStab(), info: renderInfo }[APP.ui.view] || renderEdit)();
  };
  APP.setView = function (v) { APP.ui.view = v; APP.saveUI(); APP.render(); };

  /* top-bar pill that shows where the data is saved */
  APP.onFileState = function () {
    const b = $("#btnFile"), F = APP.file; if (!b) return;
    const map = {
      local: ["Saved in this browser", ""], none: ["Saved in this browser · choose a folder", "warn"],
      ok: ["Saved in " + F.name + "/", ""], saving: ["Saving…", ""],
      needs: ["Click to reconnect " + F.name + "/", "warn"], error: ["Could not save: " + (F.msg || "error"), "err"]
    };
    const m = map[F.state] || map.local; b.textContent = m[0]; b.className = "pill " + m[1];
    const info = $("#fileInfo"); if (info) info.textContent = F.dir ? "Every change is saved into " + F.name + "/Tragwerk.trw." : "Right now your data is only in this browser. Choose a folder (for example inside Google Drive) and Tragwerk saves into one file there, so you can back it up and use it on another computer.";
  };

  APP.start = function () {
    $$(".tab").forEach(t => t.addEventListener("click", () => APP.setView(t.dataset.view)));
    const dlg = $("#dlgFile");
    $("#btnFile").addEventListener("click", () => { APP.onFileState(); if (APP.file.state === "needs") APP.reconnect(); else dlg.showModal(); });
    $("#btnChoose").addEventListener("click", async () => { await APP.chooseFolder(); dlg.close(); });
    $("#btnReconnect").addEventListener("click", async () => { await APP.reconnect(); dlg.close(); });
    $("#btnBackup").addEventListener("click", APP.downloadBackup);
    $("#fileRestore").addEventListener("change", e => { if (e.target.files[0]) APP.restoreFrom(e.target.files[0]); e.target.value = ""; dlg.close(); });
    $("#btnUnlink").addEventListener("click", async () => { await APP.unlinkFolder(); dlg.close(); });
    $("#btnCloseFile").addEventListener("click", () => dlg.close());
    document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); APP.save(); APP.writeFileNow(); } });
    bindStage();
    APP.render();
  };
})(window.APP);
