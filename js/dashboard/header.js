/*
 * dashboard/header.js — The identity HEAD and file-metadata GROUP of the unified
 * dataset-summary panel (Cloudflare information-panel style): the dataset name as
 * the panel hero, then the provenance facts as their own hairline-divided row.
 *
 * Single source of truth (Req 1): this is the ONLY place file-level metadata
 * lives — file type, file size, memory footprint, load time. Row/column counts
 * and the numeric/categorical/missing/duplicate breakdown live only in the metric
 * groups (dashboard/summary.js). No business logic — reads
 * App.state / App.statistics. Exposed as App.dashHeader.
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

  // The identity HEAD of the summary panel (Cloudflare information-panel style):
  // a small neutral mark, the dataset name as the panel's hero (bold, largest
  // type), over a quiet subtitle. It carries no metadata itself — the file facts
  // render as their own hairline-divided group via buildMeta(), so the panel reads
  // as clearly grouped sections rather than one continuous line.
  function build() {
    const meta = S.meta() || {};
    const isSample = S.isExample();
    const title = isSample
      ? "مجموعه داده نمونه"
      : (meta.name || S.fileName() || "مجموعه داده");

    const head = el("div", "dash-panel__head");
    head.innerHTML = `
      <span class="dash-panel__mark">${iconHTML("analytics")}</span>
      <div class="dash-panel__id">
        <h2 class="dash-panel__title" title="${escapeHTML(title)}"><bdi>${escapeHTML(title)}</bdi></h2>
        <div class="dash-panel__sub">نمای کلی داشبورد تحلیل داده</div>
      </div>`;
    return head;
  }

  // The four file-metadata facts (type · size · memory · load time) as one
  // hairline-divided `.dash-group` of `.dash-cell` items, so dashboard.js can drop
  // it straight into the panel body as its own scannable row. Single source of
  // truth for file-level metadata — all four facts preserved; the value in each
  // cell is emphasised (bold) while its label stays muted.
  function buildMeta() {
    const meta = S.meta() || {};
    const isSample = S.isExample();
    const items = [
      `${iconHTML("table", "dash-cell__icon")}<span class="dash-cell__meta"><bdi>${escapeHTML(fileTypeLabel())}</bdi></span>`,
      `${iconHTML("download", "dash-cell__icon")}<span class="dash-cell__meta">حجم <bdi>${isSample ? "—" : formatBytes(meta.size)}</bdi></span>`,
      `${iconHTML("grid", "dash-cell__icon")}<span class="dash-cell__meta">حافظه <bdi>${formatBytes(meta.memoryBytes)}</bdi></span>`,
      `${iconHTML("settings", "dash-cell__icon")}<span class="dash-cell__meta">بارگذاری <bdi>${formatTime(meta.uploadedAt)}</bdi></span>`,
    ];
    const group = el("div", "dash-group dash-group--meta");
    items.forEach((html) => group.appendChild(el("span", "dash-cell dash-cell--meta", html)));
    return group;
  }

  App.dashHeader = { build, buildMeta, fileTypeLabel, formatBytes, formatTime };
})(window.App);
