/*
 * utils.js — Shared helpers, DOM utilities, formatting and statistics primitives.
 * Everything attaches to the global `App` namespace so the other classic-script
 * modules can share it without a bundler (keeps the project zero-build / file://).
 */
window.App = window.App || {};

(function (App) {
  "use strict";

  /* ----------------------------- DOM helpers ----------------------------- */
  const $ = (id) => document.getElementById(id);

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };

  // Centralised Material Symbols icon names.
  const ICONS = {
    upload: "upload_file",
    themeDark: "dark_mode",
    themeLight: "light_mode",
    analytics: "analytics",
    chart: "monitoring",
    table: "table_view",
    filter: "filter_alt",
    search: "search",
    download: "download",
    settings: "settings",
    info: "lightbulb",
    ok: "check_circle",
    warn: "warning",
    error: "error",
    rows: "table_rows",
    columns: "view_column",
    numeric: "tag",
    category: "category",
    missing: "report",
    duplicate: "content_copy",
    grid: "grid_on",
    pdf: "picture_as_pdf",
    image: "image",
    quality: "verified",
    print: "print",
    newChart: "add_chart",
    reset: "refresh",
    expand: "expand_more",
    empty: "inbox",
    upload2: "cloud_upload",
  };

  const iconHTML = (key, cls) =>
    `<span class="material-symbols-outlined${cls ? " " + cls : ""}" aria-hidden="true">${ICONS[key] || key}</span>`;

  /* Escape user/data values before injecting into innerHTML. */
  const escapeHTML = (v) =>
    String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /* --------------------------- Value formatting -------------------------- */
  // Thousands separator for counts (kept in latin digits for data fidelity).
  const fmtInt = (n) =>
    typeof n === "number" && isFinite(n) ? n.toLocaleString("en-US") : n;

  const round = (v, d = 3) =>
    typeof v === "number" && isFinite(v) ? Number(v.toFixed(d)) : v;

  const isBlank = (v) => v === null || v === undefined || v === "";

  /* --------------------------- Statistics core --------------------------- */
  // Sorted-array quantile (linear interpolation, pandas-style).
  function quantile(sortedAsc, p) {
    const n = sortedAsc.length;
    if (!n) return NaN;
    const idx = (n - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
  }

  function mean(arr) {
    if (!arr.length) return NaN;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function std(arr) {
    const n = arr.length;
    if (n < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
  }

  function median(arr) {
    const a = [...arr].sort((x, y) => x - y);
    return quantile(a, 0.5);
  }

  /* ------------------------------ Utilities ------------------------------ */
  // Trailing-edge debounce — used for live search / filter inputs.
  function debounce(fn, wait = 200) {
    let t;
    const wrapped = function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
  }

  // Trigger a browser download for a Blob.
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  App.dom = { $, el, ICONS, iconHTML, escapeHTML };
  App.fmt = { fmtInt, round, isBlank };
  App.stats = { quantile, mean, std, median };
  App.util = { debounce, downloadBlob };
})(window.App);
