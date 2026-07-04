/*
 * dashboard/toast.js — The single toast component for the whole app.
 * Small, auto-hiding notifications stacked in one fixed corner container.
 * type: "ok" | "info" | "warn" | "error".
 *
 * Loaded right after ui.js; augments the existing App.ui surface so every
 * caller keeps using App.ui.toast(...) unchanged (stable public API).
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML, escapeHTML } = App.dom;

  // One shared, lazily-created container (aria-live so SR users hear updates).
  function toastContainer() {
    let c = document.getElementById("toastContainer");
    if (!c) {
      c = el("div", "toast-container");
      c.id = "toastContainer";
      c.setAttribute("aria-live", "polite");
      c.setAttribute("aria-atomic", "false");
      document.body.appendChild(c);
    }
    return c;
  }

  function toast(type, text, timeout = 3500) {
    const iconKey = { ok: "ok", info: "info", warn: "warn", error: "error" };
    const t = el("div", `toast toast-${type}`,
      `${iconHTML(iconKey[type] || "info")}<span>${escapeHTML(text)}</span>`);
    t.setAttribute("role", "status");
    toastContainer().appendChild(t);
    // Trigger the enter transition on the next frame.
    requestAnimationFrame(() => t.classList.add("show"));
    const dismiss = () => {
      t.classList.remove("show");
      t.addEventListener("transitionend", () => t.remove(), { once: true });
      setTimeout(() => t.remove(), 400); // fallback if transitionend doesn't fire
    };
    const timer = setTimeout(dismiss, timeout);
    t.addEventListener("click", () => { clearTimeout(timer); dismiss(); });
    return t;
  }

  App.toast = { toast };
  // Preserve the established public API.
  App.ui = App.ui || {};
  App.ui.toast = toast;
})(window.App);
