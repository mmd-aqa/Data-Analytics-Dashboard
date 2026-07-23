/*
 * statistics.js — All numeric/quality computations and their renderers:
 *   - describe (count/mean/std/min/quartiles/max)
 *   - value counts, group-by
 *   - dataset summary (KPI source)         [Phase 2]
 *   - missing-values report                 [Phase 3]
 *   - data-quality report incl. IQR outliers [Phase 8]
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML } = App.dom;
  const { fmtInt, round, isBlank } = App.fmt;
  const { quantile, mean, std, median } = App.stats;
  const { alertBox, buildTable, buildSortableTable } = App.ui;
  const charts = App.charts;
  const S = App.state;

  /* --------------------------- describe() table -------------------------- */
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

  function describeRows() {
    const numCols = S.numericColumns();
    if (!numCols.length) return null;
    const stats = ["count", "mean", "std", "min", "25%", "50%", "75%", "max"];
    return stats.map((s) => {
      const row = { "آماره": s };
      numCols.forEach((col) => { row[col] = computeStat(S.colValues(col, { numeric: true }), s); });
      return row;
    });
  }

  function buildDescribe() {
    const rows = describeRows();
    if (!rows) return alertBox("warn", "ستون عددی برای خلاصه آماری وجود ندارد.");
    return buildTable(rows, ["آماره", ...S.numericColumns()]);
  }

  /* ------------------------------ group-by ------------------------------- */
  function groupby(gbCols, opCol, op) {
    const groups = {};
    for (const r of S.getView()) {
      const key = gbCols.map((c) => r[c]).join("");
      if (!groups[key]) groups[key] = { keyVals: gbCols.map((c) => r[c]), vals: [] };
      let v = r[opCol];
      if (op !== "count") { v = Number(v); if (isNaN(v)) continue; }
      groups[key].vals.push(r[opCol]);
    }
    const agg = (vals) => {
      const nums = vals.map(Number).filter((v) => !isNaN(v));
      switch (op) {
        case "count": return vals.length;
        case "sum": return Number(nums.reduce((s, v) => s + v, 0).toFixed(4));
        case "max": return nums.length ? Math.max(...nums) : 0;
        case "min": return nums.length ? Math.min(...nums) : 0;
        case "mean": return nums.length ? Number((nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(4)) : 0;
        case "median": return nums.length ? round(median(nums), 4) : 0;
        default: return vals.length;
      }
    };
    return Object.values(groups).map((g) => {
      const row = {};
      gbCols.forEach((c, i) => { row[c] = g.keyVals[i]; });
      row.Result = agg(g.vals);
      return row;
    });
  }

  /* ----------------------- Phase 2: dataset summary ---------------------- */
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

  /* --------------------- Phase 3: missing-values report ------------------ */
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
    root.appendChild(el("h3", "section-title", `${iconHTML("missing")}<span>گزارش مقادیر گمشده</span>`));
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

  /* ------------------- Phase 8: data-quality + outliers ------------------ */
  // IQR outliers: values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR].
  function outlierCount(col) {
    const a = S.colValues(col, { numeric: true }).sort((x, y) => x - y);
    if (a.length < 4) return { count: 0, lower: NaN, upper: NaN };
    const q1 = quantile(a, 0.25), q3 = quantile(a, 0.75), iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr, upper = q3 + 1.5 * iqr;
    let count = 0;
    for (const v of a) if (v < lower || v > upper) count++;
    return { count, lower: round(lower), upper: round(upper) };
  }

  /* ------------------ Phase 7: per-column quality + score ---------------- */
  // One pass over the view producing per-column metrics used by the quality
  // report and the overall score.
  function computeColumnQuality() {
    const rows = S.getView();
    const n = rows.length || 1;
    return S.columns().map((c) => {
      let missing = 0;
      const uniq = new Set();
      for (const r of rows) {
        if (isBlank(r[c])) missing++;
        else uniq.add(String(r[c]));
      }
      const isNum = S.isNumericCol(c);
      const ol = isNum ? outlierCount(c) : { count: 0 };
      const valid = rows.length - missing;
      return {
        col: c,
        dtype: S.dtypeOf(c),
        unique: uniq.size,
        missing,
        missingPct: round((missing / n) * 100, 2),
        validPct: round((valid / n) * 100, 2),
        outliers: isNum ? ol.count : null,
        isNumeric: isNum,
        isEmpty: uniq.size === 0, // every value blank
        isConstant: uniq.size === 1 && missing === 0, // single repeated value
      };
    });
  }

  // Overall 0–100 data-quality score = weighted blend of completeness,
  // row-uniqueness, outlier-cleanliness and structural soundness.
  function computeQualityScore() {
    const rows = S.getView();
    const cols = S.columns();
    const summary = computeSummary();
    const colq = computeColumnQuality();
    const totalCells = rows.length * cols.length || 1;

    const completeness = 1 - summary.missing / totalCells; // 0..1
    const uniqueness = rows.length ? 1 - summary.duplicates / rows.length : 1;

    // Outlier cleanliness over numeric cells only.
    const numericCellCount = S.numericColumns().length * rows.length || 1;
    const totalOutliers = colq.reduce((s, q) => s + (q.outliers || 0), 0);
    const cleanliness = 1 - Math.min(1, totalOutliers / numericCellCount);

    // Structural: penalise empty / constant columns.
    const badCols = colq.filter((q) => q.isEmpty || q.isConstant).length;
    const structural = cols.length ? 1 - badCols / cols.length : 1;

    const score = Math.round(
      100 * (0.5 * completeness + 0.25 * uniqueness + 0.15 * cleanliness + 0.1 * structural),
    );
    const clamped = Math.max(0, Math.min(100, score));

    let rating, tone;
    if (clamped >= 90) { rating = "عالی"; tone = "green"; }
    else if (clamped >= 75) { rating = "خوب"; tone = "blue"; }
    else if (clamped >= 50) { rating = "متوسط"; tone = "amber"; }
    else { rating = "ضعیف"; tone = "red"; }

    return {
      score: clamped, rating, tone,
      completeness: round(completeness * 100, 1),
      uniqueness: round(uniqueness * 100, 1),
      cleanliness: round(cleanliness * 100, 1),
      structural: round(structural * 100, 1),
      emptyColumns: colq.filter((q) => q.isEmpty).map((q) => q.col),
      constantColumns: colq.filter((q) => q.isConstant).map((q) => q.col),
      totalOutliers,
      colq,
    };
  }

  function renderQuality(root) {
    root.innerHTML = "";
    root.appendChild(el("h3", "section-title", `${iconHTML("quality")}<span>گزارش کیفیت داده</span>`));
    root.appendChild(
      el("p", "section-desc",
        "نمای کلی از سلامت داده‌ها: امتیاز کیفیت، مقادیر گمشده، ردیف‌های تکراری، ستون‌های ثابت/خالی، مقادیر یکتا و داده‌های پرت."),
    );

    const summary = computeSummary();
    const q = computeQualityScore();

    // ---- Quality score gauge card ----
    const scoreCard = el("div", `quality-score quality-score-${q.tone} mb-5`);
    scoreCard.innerHTML = `
      <div class="qs-ring" style="--pct:${q.score}">
        <div class="qs-ring-inner"><span class="qs-num">${q.score}</span><span class="qs-unit">٪</span></div>
      </div>
      <div class="qs-body">
        <div class="qs-title">کیفیت کلی داده</div>
        <div class="qs-rating">${q.rating}</div>
        <div class="qs-breakdown">
          <span>کامل بودن: <b>${q.completeness}٪</b></span>
          <span>یکتایی ردیف‌ها: <b>${q.uniqueness}٪</b></span>
          <span>بدون پرت: <b>${q.cleanliness}٪</b></span>
          <span>ساختار: <b>${q.structural}٪</b></span>
        </div>
      </div>`;
    root.appendChild(scoreCard);

    // Overview stats — the same borderless `.dash-group` of `.dash-cell--stat`
    // figures used by the dataset-summary panel (one metric component app-wide):
    // bold value + muted label, hairline-separated, tone applied only for signals
    // (any duplicate/missing/empty/constant column reads amber; a clean zero green).
    root.appendChild(qualityStatGroup([
      { label: "ردیف‌های تکراری", value: fmtInt(summary.duplicates), tone: summary.duplicates ? "amber" : "green" },
      { label: "کل مقادیر گمشده", value: fmtInt(summary.missing), tone: summary.missing ? "amber" : "green" },
      { label: "ستون‌های ثابت", value: fmtInt(q.constantColumns.length), tone: q.constantColumns.length ? "amber" : "green" },
      { label: "ستون‌های خالی", value: fmtInt(q.emptyColumns.length), tone: q.emptyColumns.length ? "amber" : "green" },
    ]));

    if (q.constantColumns.length || q.emptyColumns.length) {
      const notes = [];
      if (q.constantColumns.length) notes.push(`ستون‌های ثابت (تک‌مقدار): ${q.constantColumns.join("، ")}`);
      if (q.emptyColumns.length) notes.push(`ستون‌های کاملاً خالی: ${q.emptyColumns.join("، ")}`);
      root.appendChild(alertBox("warn", notes.join(" — ")));
    }

    // Per-column quality table (now includes % valid).
    const data = q.colq.map((c) => ({
      "ستون": c.col,
      "نوع داده": c.dtype,
      "مقادیر یکتا": c.unique,
      "گمشده": c.missing,
      "درصد معتبر": c.validPct,
      "داده پرت": c.isNumeric ? c.outliers : "—",
    }));

    root.appendChild(el("h4", "subsection-title", "جزئیات ستون‌ها"));
    root.appendChild(
      buildSortableTable(
        data,
        ["ستون", "نوع داده", "مقادیر یکتا", "گمشده", "درصد معتبر", "داده پرت"],
        { numericCols: ["مقادیر یکتا", "گمشده", "درصد معتبر", "داده پرت"] },
      ),
    );

    // Outlier-only summary table (numeric columns with at least one outlier).
    const outRows = S.numericColumns()
      .map((c) => ({ "ستون": c, ...outlierCount(c) }))
      .filter((r) => r.count > 0)
      .map((r) => ({ "ستون": r["ستون"], "تعداد داده پرت": r.count, "حد پایین": r.lower, "حد بالا": r.upper }));

    root.appendChild(el("h4", "subsection-title", "داده‌های پرت (روش IQR)"));
    if (!outRows.length) {
      root.appendChild(alertBox("ok", "هیچ داده پرتی در ستون‌های عددی یافت نشد."));
    } else {
      root.appendChild(
        buildSortableTable(outRows, ["ستون", "تعداد داده پرت", "حد پایین", "حد بالا"], {
          numericCols: ["تعداد داده پرت", "حد پایین", "حد بالا"],
        }),
      );
    }
  }

  // One `.dash-group` row of stat cells — identical markup to the dataset-summary
  // panel's metric groups, so the quality overview and the summary read as one
  // component. Wrapped in `.dash-panel` so it sits as the single framed surface at
  // the top of the report (mirroring the summary panel), not four separate cards.
  function qualityStatGroup(items) {
    const panel = el("div", "dash-panel mb-5");
    const group = el("div", "dash-group dash-group--stat");
    items.forEach((c) => {
      const cell = el("span", `dash-cell dash-cell--stat is-${c.tone}`);
      cell.innerHTML =
        `<span class="dash-cell__num">${c.value}</span>` +
        `<span class="dash-cell__label">${c.label}</span>`;
      group.appendChild(cell);
    });
    panel.appendChild(group);
    return panel;
  }

  App.statistics = {
    computeStat, describeRows, buildDescribe, groupby,
    computeSummary, missingByColumn, renderMissing,
    outlierCount, computeColumnQuality, computeQualityScore, renderQuality,
  };
})(window.App);
