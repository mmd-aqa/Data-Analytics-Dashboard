/*
 * statistics.js — Numeric computations and their renderers:
 *   - describe (count/mean/std/min/quartiles/max)
 *   - dataset summary (KPI source)
 *   - missing-values report
 *   - IQR outlier primitive (feeds the auto-insights card)
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, cardHead } = App.dom;
  const { round, isBlank } = App.fmt;
  const { quantile, mean, std } = App.stats;
  const { alertBox, buildTable, buildSortableTable } = App.ui;
  const charts = App.charts;
  const S = App.state;

  function computeStat(arr, stat) {
    if (!arr.length) return "";
    const a = [...arr].sort((x, y) => x - y);
    switch (stat) {
      case "count": return a.length;
      case "mean": return round(mean(a));
      case "std": return round(std(a));
      case "min": return round(a[0]);
      case "25%": return round(quantile(a, 0.25));
      case "50%": return round(quantile(a, 0.5));
      case "75%": return round(quantile(a, 0.75));
      case "max": return round(a[a.length - 1]);
      default: return "";
    }
  }

  // Display labels for the describe rows. The Persian UI shows Persian names
  // while computation keeps the stable English keys (count/mean/std/...).
  const STAT_FA = {
    count: "تعداد",
    mean: "میانگین",
    std: "انحراف معیار",
    min: "کمینه",
    "25%": "چارک اول",
    "50%": "میانه",
    "75%": "چارک سوم",
    max: "بیشینه",
  };

  function describeRows() {
    const numCols = S.numericColumns();
    if (!numCols.length) return null;
    const stats = ["count", "mean", "std", "min", "25%", "50%", "75%", "max"];
    return stats.map((s) => {
      const row = { "آماره": STAT_FA[s] };
      numCols.forEach((col) => { row[col] = computeStat(S.colValues(col, { numeric: true }), s); });
      return row;
    });
  }

  function buildDescribe() {
    const rows = describeRows();
    if (!rows) return alertBox("warn", "ستون عددی برای خلاصه آماری وجود ندارد.");
    return buildTable(rows, ["آماره", ...S.numericColumns()]);
  }

  // Counts that feed the KPI cards. Computed over the current view.
  function computeSummary() {
    const rows = S.getView();
    const cols = S.columns();
    const numeric = S.numericColumns();
    const totalCells = rows.length * cols.length;

    let missing = 0;
    for (const r of rows) for (const c of cols) if (isBlank(r[c])) missing++;

    // Duplicate rows = rows whose full serialised signature was seen before.
    const seen = new Set();
    let duplicates = 0;
    for (const r of rows) {
      const sig = cols.map((c) => (isBlank(r[c]) ? "" : String(r[c]))).join("");
      if (seen.has(sig)) duplicates++;
      else seen.add(sig);
    }

    return {
      rows: rows.length,
      columns: cols.length,
      numeric: numeric.length,
      categorical: cols.length - numeric.length,
      missing,
      missingPct: totalCells ? (missing / totalCells) * 100 : 0,
      duplicates,
    };
  }

  function missingByColumn() {
    const rows = S.getView();
    const n = rows.length || 1;
    return S.columns().map((c) => {
      let m = 0;
      for (const r of rows) if (isBlank(r[c])) m++;
      return { "ستون": c, "تعداد گمشده": m, "درصد گمشده": round((m / n) * 100, 2), _pct: (m / n) * 100 };
    });
  }

  function renderMissing(root) {
    root.innerHTML = "";
    root.appendChild(cardHead("گزارش مقادیر گمشده"));
    root.appendChild(
      el("p", "section-desc",
        "تعداد و درصد مقادیر گمشده برای هر ستون. ستون‌های با بیش از ۳۰٪ داده گمشده برجسته شده‌اند. برای مرتب‌سازی روی سرستون‌ها کلیک کنید."),
    );

    const data = missingByColumn();
    const totalMissing = data.reduce((s, r) => s + r["تعداد گمشده"], 0);
    if (totalMissing === 0) {
      root.appendChild(alertBox("ok", "هیچ مقدار گمشده‌ای در مجموعه‌داده یافت نشد."));
    }

    const table = buildSortableTable(
      data,
      ["ستون", "تعداد گمشده", "درصد گمشده"],
      {
        numericCols: ["تعداد گمشده", "درصد گمشده"],
        rowClass: (r) => (r._pct > 30 ? "row-warn" : null),
      },
    );
    root.appendChild(table);

    // Optional bar chart of missing percentage (only columns that have any).
    const withMissing = data.filter((r) => r._pct > 0).sort((a, b) => b._pct - a._pct);
    if (withMissing.length) {
      root.appendChild(el("h4", "subsection-title", "نمودار درصد مقادیر گمشده"));
      const div = el("div", "min-h-[360px]");
      root.appendChild(div);
      charts.plot(
        div,
        [{
          type: "bar",
          x: withMissing.map((r) => r["ستون"]),
          y: withMissing.map((r) => r._pct),
          marker: { color: withMissing.map((r) => (r._pct > 30 ? "#dc2626" : charts.GREEN)) },
          text: withMissing.map((r) => r["درصد گمشده"] + "%"),
          textposition: "auto",
        }],
        charts.layout("درصد مقادیر گمشده به تفکیک ستون", { yaxis: { title: "%", gridcolor: undefined } }),
      );
    }
  }

  // IQR outliers: values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]. A shared
  // primitive — the auto-insights card sums it across numeric columns.
  function outlierCount(col) {
    const a = S.colValues(col, { numeric: true }).sort((x, y) => x - y);
    if (a.length < 4) return { count: 0, lower: NaN, upper: NaN };
    const q1 = quantile(a, 0.25), q3 = quantile(a, 0.75), iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr, upper = q3 + 1.5 * iqr;
    let count = 0;
    for (const v of a) if (v < lower || v > upper) count++;
    return { count, lower: round(lower), upper: round(upper) };
  }

  App.statistics = {
    computeStat, describeRows, buildDescribe,
    computeSummary, missingByColumn, renderMissing,
    outlierCount,
  };
})(window.App);
