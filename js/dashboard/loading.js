/*
 * dashboard/loading.js — The single loading system for the whole app:
 *   - spinner (one animation, three sizes via CSS modifier classes)
 *   - withBusy: per-button busy state for inline async actions
 *   - showLoading / hideLoading: one full-screen blocking overlay
 *   - sectionSpinner: one localized (non-blocking) in-section indicator
 *
 * Loaded right after ui.js; augments App.ui so callers keep using
 * App.ui.showLoading(...) etc. unchanged (stable public API).
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, escapeHTML } = App.dom;

  const spinnerHTML = (cls) => `<span class="spinner${cls ? " " + cls : ""}" aria-hidden="true"></span>`;

  // Run an async action with a button locked into a busy state — disables the
  // button (preventing duplicate clicks) and swaps its label for a spinner until
  // the promise settles. Returns the action's result.
  async function withBusy(button, label, action) {
    if (!button || button.disabled) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.classList.add("is-busy");
    button.innerHTML = `${spinnerHTML("spinner-sm")}<span>${escapeHTML(label || "در حال پردازش...")}</span>`;
    try {
      return await action();
    } finally {
      button.disabled = false;
      button.classList.remove("is-busy");
      button.innerHTML = original;
    }
  }

  // Full-screen blocking overlay for heavy, page-wide operations (parse/export).
  function showLoading(text) {
    let o = document.getElementById("loadingOverlay");
    if (!o) {
      o = el("div", "loading-overlay");
      o.id = "loadingOverlay";
      o.innerHTML = `${spinnerHTML("spinner-lg")}<div class="loading-text"></div>`;
      document.body.appendChild(o);
    }
    o.querySelector(".loading-text").textContent = text || "در حال پردازش...";
    // The ".show" class is added on the next frame so the CSS enter transition
    // plays. Record the INTENT first: if hideLoading() runs before that frame
    // (e.g. a fully-synchronous parse like the bundled sample dataset, where
    // show→parse→hide all happen on one call stack), the deferred callback must
    // NOT re-show the overlay — otherwise it would be stuck visible forever.
    o.dataset.wantShown = "1";
    requestAnimationFrame(() => {
      if (o.dataset.wantShown === "1") o.classList.add("show");
    });
    return o;
  }
  function hideLoading() {
    const o = document.getElementById("loadingOverlay");
    if (o) {
      o.dataset.wantShown = "0";
      o.classList.remove("show");
    }
  }

  // Localized, non-blocking loading indicator placed INSIDE a section while it
  // builds (heavy tab render), instead of the full-page overlay. The caller's
  // own render() typically clears the host, replacing this spinner.
  function sectionSpinner(text) {
    const d = el("div", "section-loading");
    d.setAttribute("role", "status");
    d.innerHTML =
      `<span class="spinner spinner-section" aria-hidden="true"></span>` +
      `<span class="section-loading-text">${escapeHTML(text || "در حال بارگذاری...")}</span>`;
    return d;
  }

  // Run `fn` only after the browser has painted the current DOM — so a spinner
  // appended just before is actually shown before the heavy work runs.
  function deferAfterPaint(fn) {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  }

  App.loading = { spinnerHTML, withBusy, showLoading, hideLoading, sectionSpinner, deferAfterPaint };
  // Preserve the established public API.
  App.ui = App.ui || {};
  Object.assign(App.ui, { withBusy, showLoading, hideLoading, sectionSpinner, deferAfterPaint });
})(window.App);
