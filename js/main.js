/*
 * main.js — Bootstrap. Wires the upload handlers and theme toggle once the DOM
 * is ready. All feature logic lives in the App.* modules loaded before this file.
 */
(function () {
  "use strict";
  function init() {
    window.App.upload.setup();
    window.App.dashboard.setupThemeToggle();
    window.App.dashboard.setupHeaderScroll();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
