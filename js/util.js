/* Tragwerk — small helpers. Plain JS, no build step. Every file adds to window.APP. */
window.APP = window.APP || {};
(function (APP) {
  const U = (APP.U = {});
  U.uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  U.today = () => new Date().toISOString().slice(0, 10);
  U.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.safeName = s => String(s || "file").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 60) || "file";
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  /* numbers: shown German style (1.234,56), typed with comma or dot */
  U.fmt = (n, d) => {
    d = d == null ? 2 : d;
    if (n == null || !isFinite(n)) return "–";
    if (Math.abs(n) < 0.5 * Math.pow(10, -d)) n = 0;
    return n.toLocaleString("de-AT", { minimumFractionDigits: d, maximumFractionDigits: d }).replace("-", "−");
  };
  U.show = n => (Math.round(n * 10000) / 10000).toString().replace(".", ",");   // for input fields
  U.parse = s => { const v = parseFloat(String(s).trim().replace(",", ".")); return isFinite(v) ? v : NaN; };
  U.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  U.num = (v, d) => (isFinite(+v) && v !== "" && v !== null ? +v : d);
  /* Gauss–Jordan with pivoting for A·x = b (A is m×n). rank < n means the system is not uniquely solvable. */
  U.solve = (A, b) => {
    const m = A.length, n = m ? A[0].length : 0, M = A.map((row, i) => row.concat([b[i]]));
    let scale = 1; M.forEach(r => r.forEach(v => { scale = Math.max(scale, Math.abs(v)); }));
    const tol = 1e-9 * scale, piv = []; let r = 0;
    for (let c = 0; c < n && r < m; c++) {
      let p = r; for (let i = r + 1; i < m; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
      if (Math.abs(M[p][c]) < tol) continue;
      const t = M[r]; M[r] = M[p]; M[p] = t;
      const d = M[r][c]; for (let j = c; j <= n; j++) M[r][j] /= d;
      for (let i = 0; i < m; i++) if (i !== r) { const k = M[i][c]; if (k) for (let j = c; j <= n; j++) M[i][j] -= k * M[r][j]; }
      piv.push(c); r++;
    }
    let consistent = true; for (let i = r; i < m; i++) if (Math.abs(M[i][n]) > tol) consistent = false;
    const x = new Array(n).fill(0); piv.forEach((c, i) => { x[c] = M[i][n]; });
    return { rank: r, x, consistent, full: r === n };
  };
  APP.toast = function (msg) {
    const t = document.getElementById("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(APP.toast.t); APP.toast.t = setTimeout(() => t.classList.remove("show"), 3500);
  };
})(window.APP);
