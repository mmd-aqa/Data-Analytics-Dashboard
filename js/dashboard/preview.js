/*
 * dashboard/preview.js — The data-preview table block: the paginated table, the
 * live "showing X of Y rows" status line, and the friendly empty state shown
 * when filters/search exclude every row.
 *
 * No business logic — reads App.state and reuses App.ui.buildPagedTable. Hosts
 * are passed in by the orchestrator (no shared closure state). Exposed as
 * App.preview.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML } = App.dom;
  const { fmtInt } = App.fmt;
  const S = App.state;

  // Paginated preview of the current view. `onReset` wires the empty-state
  // escape hatch back to the full dataset.
  function draw(host, onReset) {
    if (!host) return;
    host.innerHTML = "";
    const rows = S.getView();
    if (!rows.length) {
      host.appendChild(buildEmptyState(onReset));
      return;
    }
    host.appendChild(
      App.ui.buildPagedTable(rows, S.columns(), { pageSize: 50, highlight: S.search() })
    );
  }

  function buildEmptyState(onReset) {
    const empty = el("div", "empty-state");
    empty.innerHTML =
      `${iconHTML("empty", "empty-icon")}` +
      `<div class="empty-title">هیچ داده‌ای مطابق فیلترهای انتخاب‌شده پیدا نشد.</div>` +
      `<div class="empty-text">شرط‌های جست‌وجو یا فیلتر را تغییر دهید، یا همه را پاک کنید.</div>`;
    const btn = el("button", "btn-secondary mt-3", "پاک کردن فیلترها");
    btn.type = "button";
    if (typeof onReset === "function") btn.onclick = onReset;
    empty.appendChild(btn);
    return empty;
  }

  // Compact "showing X of Y rows" line; flags when the view is filtered.
  function updateStatusLine(host) {
    if (!host) return;
    const total = S.raw().length;
    if (!total) { host.innerHTML = ""; return; }
    const shown = S.getView().length;
    const filtered = shown !== total;
    const text = filtered
      ? `نمایش <b>${fmtInt(shown)}</b> از <b>${fmtInt(total)}</b> ردیف`
      : `نمایش همه‌ی <b>${fmtInt(total)}</b> ردیف`;
    host.innerHTML =
      `${iconHTML(filtered ? "filter" : "rows", "status-icon")}<span>${text}</span>` +
      (filtered ? `<span class="status-badge">فیلتر شده</span>` : "");
  }

  App.preview = { draw, updateStatusLine, buildEmptyState };
})(window.App);
