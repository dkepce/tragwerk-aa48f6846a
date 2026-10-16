/* Tragwerk — start-up. Keep this file last in index.html and in sw.js. */
(function (APP) {
  APP.start();
  APP.initFile();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => { });
})(window.APP);
