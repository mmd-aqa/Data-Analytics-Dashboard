/*
 * dashboard/summary.js — The six KPI cards (Phase 2), rendered from
 * computeSummary(). This is the single home for the dataset's metric breakdown
 * (rows · columns · numeric · categorical · missing · duplicates).
 *
 * No business logic — reads App.statistics. Exposed as App.dashSummary.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML } = App.dom;
  const { fmtInt } = App.fmt;
  const stats = App.statistics;

  function buildKpiCards() {
    const s = stats.computeSummary();
    const cards = [
      { icon: "rows", label: "تعداد ردیف‌ها", value: fmtInt(s.rows), tone: "green" },
      { icon: "columns", label: "تعداد ستون‌ها", value: fmtInt(s.columns), tone: "green" },
      { icon: "numeric", label: "ستون‌های عددی", value: fmtInt(s.numeric), tone: "blue" },
      { icon: "category", label: "ستون‌های دسته‌ای", value: fmtInt(s.categorical), tone: "blue" },
      { icon: "missing", label: "مقادیر گمشده", value: fmtInt(s.missing), tone: s.missing ? "amber" : "green",
        sub: s.missing ? `${s.missingPct.toFixed(1)}%` : "" },
      { icon: "duplicate", label: "ردیف‌های تکراری", value: fmtInt(s.duplicates), tone: s.duplicates ? "red" : "green" },
    ];
    const grid = el("div", "kpi-grid");
    cards.forEach((c) => {
      const card = el("div", `kpi-card kpi-${c.tone}`);
      card.innerHTML = `
        <div class="kpi-icon">${iconHTML(c.icon)}</div>
        <div class="kpi-body">
          <div class="kpi-value">${c.value}${c.sub ? `<span class="kpi-sub">${c.sub}</span>` : ""}</div>
          <div class="kpi-label">${c.label}</div>
        </div>`;
      grid.appendChild(card);
    });
    return grid;
  }

  App.dashSummary = { buildKpiCards };
})(window.App);
