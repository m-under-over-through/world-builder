/*
 * The page's one more try when the app's script did not start (ADR 0028; learning note 16).
 * Plain script, no module and no build step, so every browser the app supports runs it as it is.
 * Once the window has loaded, every file has arrived or failed. If the page's own first screen
 * (class "boot", src/lib/boot.ts) is still in #app, the app never took over: the page is loaded
 * once more. A mark in the tab's session storage makes it once only, and the app removes the mark
 * when it starts. Where the storage is refused there is no reload at all. It asks the network
 * for nothing, and keeps and logs nothing else.
 */
(function () {
  var MARK = 'wb:reloaded';

  function check() {
    var app = document.getElementById('app');
    if (!app || !app.querySelector('.boot')) return;
    try {
      if (sessionStorage.getItem(MARK)) return;
      sessionStorage.setItem(MARK, '1');
    } catch (e) {
      return;
    }
    // The same address, what follows # included, so a link's value is kept (ADR 0018).
    location.reload();
  }

  if (document.readyState === 'complete') check();
  else window.addEventListener('load', check);
})();
