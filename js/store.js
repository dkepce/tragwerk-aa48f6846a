/* Tragwerk — data and saving.
   Same pattern as Phoenix / LabGorilla / Hedgehog / Taupunkt:
   1. the data always lives in the browser (localStorage; big files would go to IndexedDB),
   2. optionally the user picks a folder once and every change is also written into ONE file there
      (Tragwerk.trw, plain JSON) through the File System Access API (Chrome / Edge / Brave),
   3. the folder handle is remembered in IndexedDB; after a browser restart the user presses "Reconnect".
   The file is `{ app, version, saved, settings, data }`. `saved` decides which copy is newer. */
(function (APP) {
  const U = APP.U, KEY = "tragwerk", FILE = "Tragwerk.trw";
  APP.moduleOf = type => ({ beam: APP.beam, truss: APP.truss, frame: APP.frame }[type]);   // maths module of a system type

  /* ---------- the data model: add your own fields here ---------- */
  const DEFAULT_S = { theme: "light" };          // settings (look, switches)
  APP.DEFAULT_UI = { view: "edit" };             // where he was (not part of the file)

  function load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  APP.S = Object.assign({}, DEFAULT_S, load(KEY + ".settings", null) || {});
  APP.D = load(KEY + ".data", null) || {};
  APP.ui = Object.assign({}, APP.DEFAULT_UI, load(KEY + ".ui", null) || {});

  /* fixData runs after every load/restore: give every collection a default so old files still work.
     This is what makes adding a feature later safe. Never rename a field without migrating it here. */
  APP.fixData = function () {
    const D = APP.D;
    D.systems = (Array.isArray(D.systems) ? D.systems : []).filter(s => s && ["beam", "truss", "frame"].includes(s.type));
    D.systems.forEach(s => { s.id = s.id || U.uid(); APP.moduleOf(s.type).fix(s); });
    if (!D.systems.some(s => s.id === D.cur)) D.cur = D.systems.length ? D.systems[0].id : "";
    /* library: saved copies of systems for later use, shown as cards */
    D.library = (Array.isArray(D.library) ? D.library : []).filter(e => e && e.sys && ["beam", "truss", "frame"].includes(e.sys.type));
    D.library.forEach(e => { e.id = e.id || U.uid(); e.type = e.sys.type; e.name = e.name || e.sys.name || "System"; e.saved = e.saved || new Date().toISOString(); APP.moduleOf(e.type).fix(e.sys); });
  };
  APP.fixData();

  /* ---------- saving ---------- */
  let savedAt = 0; try { savedAt = +localStorage.getItem(KEY + ".savedAt") || 0; } catch (e) { }
  let lastSer = JSON.stringify({ S: APP.S, D: APP.D });
  APP.payload = () => ({ app: KEY, version: 1, saved: new Date(savedAt || Date.now()).toISOString(), settings: APP.S, data: APP.D });
  function persistLocal() {
    try {
      localStorage.setItem(KEY + ".settings", JSON.stringify(APP.S));
      localStorage.setItem(KEY + ".data", JSON.stringify(APP.D));
      localStorage.setItem(KEY + ".savedAt", String(savedAt));
    } catch (e) { APP.toast("Browser storage is full. Please choose a folder or make a backup."); }
  }
  APP.save = function () {                       // call after ANY change to APP.D / APP.S
    const ser = JSON.stringify({ S: APP.S, D: APP.D });
    if (ser === lastSer) return;
    lastSer = ser; savedAt = Date.now(); persistLocal(); APP.scheduleFileWrite();
  };
  APP.saveSoon = U.debounce(() => APP.save(), 500);
  APP.saveUI = U.debounce(() => { try { localStorage.setItem(KEY + ".ui", JSON.stringify(APP.ui)); } catch (e) { } }, 300);

  /* ---------- IndexedDB: only remembers the chosen folder ---------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(KEY, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(k) { try { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }
  async function idbSet(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; } catch (e) { return false; } }
  async function idbDel(k) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { } }

  /* ---------- the file in the folder the user picks ---------- */
  const FS_OK = !!window.showDirectoryPicker;
  const F = (APP.file = { ok: FS_OK, dir: null, state: FS_OK ? "none" : "local", name: "", timer: null, lastWrite: 0, msg: "" });
  APP.onFileState = () => { };                   // app.js replaces this to repaint the top-bar pill
  function setState(s) { F.state = s; APP.onFileState(); }
  async function perm(h, ask) {
    if (!h.queryPermission) return true;
    const o = { mode: "readwrite" };
    if ((await h.queryPermission(o)) === "granted") return true;
    return !!ask && (await h.requestPermission(o)) === "granted";
  }
  APP.hasContent = () => Object.values(APP.D).some(v => Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : !!v);
  APP.scheduleFileWrite = function () { if (!F.dir) return; clearTimeout(F.timer); F.timer = setTimeout(() => writeFile(false), 700); };
  async function writeFile(ask) {
    if (!F.dir) return; clearTimeout(F.timer); F.timer = null;
    try {
      if (!(await perm(F.dir, ask))) { setState("needs"); return false; }
      setState("saving");
      const fh = await F.dir.getFileHandle(FILE, { create: true });
      const w = await fh.createWritable(); await w.write(JSON.stringify(APP.payload())); await w.close();
      F.lastWrite = Date.now(); setState("ok"); return true;
    } catch (e) { F.msg = e.message; setState("error"); return false; }
  }
  APP.writeFileNow = () => writeFile(true);
  async function readFileIn(dir) { const fh = await dir.getFileHandle(FILE); return JSON.parse(await (await fh.getFile()).text()); }
  function checkPayload(j) { if (!j || j.app !== KEY || !j.data) throw new Error("not a Tragwerk file"); return j; }
  APP.applyPayload = function (j) {
    checkPayload(j);
    APP.S = Object.assign({}, DEFAULT_S, j.settings); APP.D = j.data; APP.fixData();
    savedAt = j.saved ? Date.parse(j.saved) || Date.now() : Date.now();
    lastSer = JSON.stringify({ S: APP.S, D: APP.D }); persistLocal();
    APP.render();
  };
  /* newer copy wins: the file (edited on the other PC, or by Claude) or the browser */
  async function syncFromFile() {
    try {
      const j = checkPayload(await readFileIn(F.dir)), fsaved = Date.parse(j.saved) || 0;
      if (fsaved > savedAt + 1000) APP.applyPayload(j);
      else if (savedAt > fsaved + 1000) await writeFile(false);
      setState("ok");
    } catch (e) {
      if (e.name === "NotFoundError") await writeFile(false); else setState("error");
    }
  }
  APP.chooseFolder = async function () {
    try {
      const dir = await showDirectoryPicker({ id: KEY, mode: "readwrite" });
      let existing = null;
      try { existing = checkPayload(await readFileIn(dir)); } catch (e) { }
      if (existing && APP.hasContent() && !confirm("This folder already contains " + FILE + ".\n\nOpen it? What is on screen now will be replaced.\n(Press Cancel to keep what you have and choose another folder.)")) return;
      F.dir = dir; F.name = dir.name; await idbSet("dir", dir);
      if (existing) APP.applyPayload(existing); else await writeFile(true);
      setState("ok");
      APP.toast("Done: Tragwerk now saves itself into " + dir.name + "/" + FILE);
    } catch (e) { if (e.name !== "AbortError") APP.toast("That did not work: " + e.message); }
  };
  APP.reconnect = async function () {
    if (!F.dir) return false;
    try { if (await perm(F.dir, true)) { await syncFromFile(); return F.state === "ok"; } } catch (e) { }
    setState("needs"); return false;
  };
  APP.unlinkFolder = async function () { F.dir = null; F.name = ""; await idbDel("dir"); setState(FS_OK ? "none" : "local"); };

  /* double-clicking a .trw file in Explorer/Finder (installed app only) arrives here */
  APP.openLaunched = async function (handle) {
    try {
      const file = await handle.getFile(), j = checkPayload(JSON.parse(await file.text())), when = Date.parse(j.saved) || 0;
      if (Math.abs(when - savedAt) < 1500) { APP.toast("“" + file.name + "” is already what Tragwerk shows."); return; }
      if (APP.hasContent()) {
        const older = when < savedAt;
        const msg = older
          ? "“" + file.name + "” is OLDER than what is in Tragwerk now (saved " + new Date(when).toLocaleString() + " vs " + new Date(savedAt).toLocaleString() + ").\n\nOpen it anyway? This replaces everything on screen" + (F.dir ? " and in the linked folder" : "") + "."
          : "Open “" + file.name + "”?\n\nThis replaces everything on screen" + (F.dir ? " and in the linked folder" : "") + " with the contents of this file.";
        if (!confirm(msg)) return;
      }
      APP.applyPayload(j); if (F.dir) await writeFile(false);
      APP.toast("Opened " + file.name + ".");
    } catch (e) { APP.toast("That file could not be opened: " + e.message); }
  };
  APP.initFile = async function () {
    if (window.launchQueue) launchQueue.setConsumer(p => { if (p.files && p.files.length) APP.openLaunched(p.files[0]); });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    APP.onFileState();
    if (!FS_OK) return;
    const dir = await idbGet("dir"); if (!dir) return;
    F.dir = dir; F.name = dir.name;
    if (!(await perm(dir, false))) { setState("needs"); return; }
    await syncFromFile();
  };
  /* pick up changes written elsewhere (other PC, Claude) when you come back to the window */
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !F.dir || F.state === "needs") return;
    try { if (await perm(F.dir, false)) { const f = await (await F.dir.getFileHandle(FILE)).getFile(); if (f.lastModified > F.lastWrite + 2000 && (JSON.parse(await f.text()).saved || "") > new Date(savedAt + 1000).toISOString()) await syncFromFile(); } } catch (e) { }
  });
  window.addEventListener("beforeunload", () => { if (F.timer) writeFile(false); });

  APP.downloadBackup = function () {
    const blob = new Blob([JSON.stringify(APP.payload())], { type: "application/x-" + KEY });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Tragwerk-" + U.today() + ".trw";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    APP.toast("Backup saved: Tragwerk-" + U.today() + ".trw (see your Downloads folder).");
  };
  APP.restoreFrom = async function (file) {
    try {
      const j = checkPayload(JSON.parse(await file.text()));
      if (!confirm("Replace everything in Tragwerk with the backup from " + (j.saved || "").slice(0, 10) + "?")) return;
      APP.applyPayload(j); APP.save(); if (F.dir) await writeFile(false); APP.toast("Backup restored.");
    } catch (e) { APP.toast("That file is not a Tragwerk backup."); }
  };
})(window.APP);
