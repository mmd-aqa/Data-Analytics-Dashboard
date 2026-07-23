/*
 * dashboard/summary.js — The dataset metric breakdown as two hairline-divided
 * groups of the unified summary panel: the structural counts (rows · columns ·
 * numeric · categorical) and, separated by a divider, the data-quality flags
 * (missing · duplicates). This is the Cloudflare information-panel treatment of
 * the six figures that were once large KPI cards — each figure is a compact cell
 * with a bold value and a muted label, grouped so the panel scans top-to-bottom.
 *
 * No business logic / no calculation change — reads App.statistics. The public
 * method is still named buildKpiCards() to preserve the App.dashSummary contract
 * (dashboard.js exposes it); it now returns a fragment of the two `.dash-group`
 * rows. Exposed as App.dashSummary.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el } = App.dom;
  const { fmtInt } = App.fmt;
  const stats = App.statistics;

  // One `.dash-group` row of metric cells: bold value (+ optional sub) and a muted
  // label, tone applied only to figures that carry a real signal.
  function buildGroup(items) {
    const group = el("div", "dash-group dash-group--stat");
    items.forEach((c) => {
      const cell = el("span", `dash-cell dash-cell--stat is-${c.tone}`);
      cell.innerHTML =
        `<span class="dash-cell__num">${c.value}` +
        `${c.sub ? `<small class="dash-cell__sub">${c.sub}</small>` : ""}</span>` +
        `<span class="dash-cell__label">${c.label}</span>`;
      group.appendChild(cell);
    });
    return group;
  }

  function buildKpiCards() {
    const s = stats.computeSummary();
    // Structural counts — always neutral: hierarchy comes from the bold figure,
    // not decorative colour.
    const counts = [
      { label: "ردیف", value: fmtInt(s.rows), tone: "neutral" },
      { label: "ستون", value: fmtInt(s.columns), tone: "neutral" },
      { label: "ستون عددی", value: fmtInt(s.numeric), tone: "neutral" },
      { label: "ستون دسته‌ای", value: fmtInt(s.categorical), tone: "neutral" },
    ];
    // Quality flags — coloured only when they carry a signal (missing → amber,
    // duplicates → red); a clean zero reads green (success).
    const flags = [
      { label: "مقادیر گمشده", value: fmtInt(s.missing), tone: s.missing ? "amber" : "green",
        sub: s.missing ? `${s.missingPct.toFixed(1)}%` : "" },
      { label: "ردیف تکراری", value: fmtInt(s.duplicates), tone: s.duplicates ? "red" : "green" },
    ];
    // Two divided rows, returned together so dashboard.js drops them into the
    // panel body as sibling groups (the panel CSS draws the hairline between).
    const frag = document.createDocumentFragment();
    frag.appendChild(buildGroup(counts));
    frag.appendChild(buildGroup(flags));
    return frag;
  }

  App.dashSummary = { buildKpiCards };
})(window.App);
