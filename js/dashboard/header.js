/*
 * dashboard/header.js — The dataset identity strip above the KPI cards
 * (Power BI / Looker style): dataset name, then provenance chips.
 *
 * Single source of truth (Req 1): this is the ONLY place file-level metadata
 * lives — file type, file size, memory footprint, load time. Row/column counts
 * and the numeric/categorical/missing/duplicate breakdown live only in the KPI
 * cards. No business logic — reads App.state / App.statistics. Exposed as
 * App.dashHeader.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML, escapeHTML } = App.dom;
  const S = App.state;

  // Human-readable file-type label, derived from the file name / MIME type.
  function fileTypeLabel() {
    const meta = S.meta() || {};
    const src = String(meta.name || S.fileName() || "");
    const ext = (src.toLowerCase().match(/\.(csv|xlsx|xls)(?!.*\.)/) || [])[1];
    if (ext === "csv") return "فایل CSV";
    if (ext === "xlsx" || ext === "xls") return "فایل Excel";
    const type = String(meta.type || "");
    if (/csv/i.test(type)) return "فایل CSV";
    if (/sheet|excel|xls/i.test(type)) return "فایل Excel";
    return "فایل داده";
  }

  function formatBytes(n) {
    if (n == null || isNaN(n)) return "—";
    if (n < 1024) return `${n} بایت`;
    const units = ["KB", "MB", "GB"];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${units[i]}`;
  }

  function formatTime(ts) {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString("fa-IR");
    } catch (e) {
      return "—";
    }
  }

  // A clean identity strip: dataset name (or "sample dataset") + provenance chips.
  function build() {
    const meta = S.meta() || {};
    const isSample = S.isExample();
    const title = isSample
      ? "مجموعه داده نمونه"
      : (meta.name || S.fileName() || "مجموعه داده");

    const chips = [
      `${iconHTML("table")}<bdi>${escapeHTML(fileTypeLabel())}</bdi>`,
      `${iconHTML("download")}حجم: <bdi>${isSample ? "—" : formatBytes(meta.size)}</bdi>`,
      `${iconHTML("grid")}حافظه: <bdi>${formatBytes(meta.memoryBytes)}</bdi>`,
      `${iconHTML("settings")}بارگذاری: <bdi>${formatTime(meta.uploadedAt)}</bdi>`,
    ];

    const card = el("div", "dash-header");
    card.innerHTML = `
      <div class="dash-header-main">
        <span class="dash-header-icon">${iconHTML("analytics")}</span>
        <div class="dash-header-titles">
          <h2 class="dash-header-title"><bdi>${escapeHTML(title)}</bdi></h2>
          <div class="dash-header-sub">نمای کلی داشبورد تحلیل داده</div>
        </div>
      </div>
      <div class="dash-header-meta">
        ${chips.map((c) => `<span class="dash-chip">${c}</span>`).join("")}
      </div>`;
    return card;
  }

  App.dashHeader = { build, fileTypeLabel, formatBytes, formatTime };
})(window.App);
