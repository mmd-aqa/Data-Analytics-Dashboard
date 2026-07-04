/*
 * charts.js — Plotly helpers: themed layout factory, a chart registry for
 * re-theming on dark-mode toggle, and the Phase 5 advanced chart builder.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML } = App.dom;
  const { alertBox } = App.ui;
  const S = App.state;

  const FONT = "Vazirmatn, Tahoma, sans-serif";
  const GREEN = "#217346";

  // Track live charts so we can recolour them when the theme flips.
  const registry = new Set();

  function isDark() {
    return document.documentElement.classList.contains("dark");
  }

  function layout(title, extra = {}) {
    const dark = isDark();
    return Object.assign(
      {
        title: { text: title, font: { family: FONT } },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: dark ? "#e5e7eb" : "#111827", family: FONT },
        margin: { t: 50, r: 20, b: 70, l: 60 },
        xaxis: { gridcolor: dark ? "#26282c" : "#e5e7eb", automargin: true },
        yaxis: { gridcolor: dark ? "#26282c" : "#e5e7eb", automargin: true },
      },
      extra,
    );
  }

  const config = { responsive: true, displaylogo: false };

  // Plot + register, so theme toggles can refresh colours.
  function plot(node, traces, lay) {
    Plotly.newPlot(node, traces, lay, config);
    registry.add(node);
  }

  // Efficient update of an existing chart (Phase 10 — avoids full re-render).
  function react(node, traces, lay) {
    Plotly.react(node, traces, lay, config);
    registry.add(node);
  }

  // Recolour all live charts after dark-mode toggle without rebuilding the DOM.
  function retheme() {
    registry.forEach((node) => {
      if (!node || !node.isConnected || !node.layout) {
        registry.delete(node);
        return;
      }
      const dark = isDark();
      Plotly.relayout(node, {
        "font.color": dark ? "#e5e7eb" : "#111827",
        "xaxis.gridcolor": dark ? "#26282c" : "#e5e7eb",
        "yaxis.gridcolor": dark ? "#26282c" : "#e5e7eb",
      });
    });
  }

  function clearRegistry() {
    registry.clear();
  }

  /* ----------------------- Aggregation for builder ----------------------- */
  function aggregate(groups, method) {
    const agg = (vals) => {
      const nums = vals.map(Number).filter((v) => !isNaN(v));
      switch (method) {
        case "count": return vals.length;
        case "sum": return Number(nums.reduce((s, v) => s + v, 0).toFixed(4));
        case "average": return nums.length ? Number((nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(4)) : 0;
        case "min": return nums.length ? Math.min(...nums) : 0;
        case "max": return nums.length ? Math.max(...nums) : 0;
        default: return vals.length;
      }
    };
    return Object.entries(groups).map(([k, vals]) => ({ key: k, value: agg(vals) }));
  }

  /* ----------------------- Phase 5: Chart builder ------------------------ */
  const CHART_TYPES = [
    { id: "bar", fa: "میله‌ای" },
    { id: "line", fa: "خطی" },
    { id: "scatter", fa: "پراکندگی" },
    { id: "pie", fa: "دایره‌ای" },
    { id: "histogram", fa: "هیستوگرام" },
    { id: "box", fa: "جعبه‌ای" },
  ];
  const AGG_METHODS = [
    { id: "sum", fa: "مجموع" },
    { id: "average", fa: "میانگین" },
    { id: "count", fa: "تعداد" },
    { id: "min", fa: "کمینه" },
    { id: "max", fa: "بیشینه" },
  ];

  function renderBuilder(root) {
    root.innerHTML = "";
    root.appendChild(el("h3", "text-base font-bold mb-1", "نمودارساز پیشرفته"));
    root.appendChild(
      el("p", "mb-4 text-gray-500 dark:text-gray-400",
        "نوع نمودار، محورها و روش تجمیع را انتخاب کنید تا نمودار به‌صورت زنده ساخته شود."),
    );

    const cols = S.columns();
    const numCols = S.numericColumns();
    const opt = (c) => `<option value="${c}">${c}</option>`;
    const typeOpts = CHART_TYPES.map((t) => `<option value="${t.id}">${t.fa}</option>`).join("");
    const aggOpts = AGG_METHODS.map((a) => `<option value="${a.id}">${a.fa}</option>`).join("");

    const grid = el("div", "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4");
    grid.innerHTML = `
      <div class="widget"><label>نوع نمودار</label><select id="cbType">${typeOpts}</select></div>
      <div class="widget"><label>محور X</label><select id="cbX">${cols.map(opt).join("")}</select></div>
      <div class="widget"><label>محور Y</label><select id="cbY">${numCols.map(opt).join("")}</select></div>
      <div class="widget"><label>روش تجمیع</label><select id="cbAgg">${aggOpts}</select></div>`;
    root.appendChild(grid);

    const chartDiv = el("div", "min-h-[420px]");
    root.appendChild(chartDiv);

    const get = (id) => grid.querySelector(id);
    const typeEl = get("#cbType"), xEl = get("#cbX"), yEl = get("#cbY"), aggEl = get("#cbAgg");

    // Y axis + aggregation are irrelevant for pie/histogram/box single-var charts.
    function syncDisabled() {
      const t = typeEl.value;
      const yNeeded = t === "bar" || t === "line" || t === "scatter";
      yEl.disabled = !yNeeded && t !== "box";
      aggEl.disabled = !(t === "bar" || t === "line" || t === "pie");
      yEl.closest(".widget").style.opacity = yEl.disabled ? 0.5 : 1;
      aggEl.closest(".widget").style.opacity = aggEl.disabled ? 0.5 : 1;
    }

    function draw() {
      syncDisabled();
      const type = typeEl.value;
      const xc = xEl.value;
      const yc = yEl.value;
      const method = aggEl.value;
      const rows = S.getView();
      if (!rows.length) {
        chartDiv.innerHTML = "";
        chartDiv.appendChild(alertBox("warn", "داده‌ای برای نمایش وجود ندارد."));
        return;
      }

      // Show a friendly message in place of an empty/blank canvas.
      const warn = (msg) => { chartDiv.innerHTML = ""; chartDiv.appendChild(alertBox("warn", msg)); };

      let traces, lay;
      if (type === "histogram") {
        const x = rows.map((r) => Number(r[xc])).filter((v) => !isNaN(v));
        if (!x.length) return warn(`ستون «${xc}» مقدار عددی برای رسم هیستوگرام ندارد. یک ستون عددی انتخاب کنید.`);
        traces = [{ type: "histogram", x, marker: { color: GREEN } }];
        lay = layout(`هیستوگرام ${xc}`);
      } else if (type === "box") {
        const yvals = rows.map((r) => Number(r[yc])).filter((v) => !isNaN(v));
        if (!yvals.length) return warn(`ستون «${yc}» مقدار عددی برای نمودار جعبه‌ای ندارد.`);
        traces = [{ type: "box", y: yvals, name: yc, marker: { color: GREEN } }];
        lay = layout(`نمودار جعبه‌ای ${yc}`);
      } else if (type === "scatter") {
        const xs = [], ys = [];
        rows.forEach((r) => {
          const xv = Number(r[xc]), yv = Number(r[yc]);
          if (!isNaN(xv) && !isNaN(yv)) { xs.push(xv); ys.push(yv); }
        });
        if (!xs.length) return warn(`برای نمودار پراکندگی، هر دو محور «${xc}» و «${yc}» باید مقدار عددی داشته باشند.`);
        traces = [{ type: "scatter", mode: "markers", x: xs, y: ys, marker: { size: 8, color: GREEN, opacity: 0.7 } }];
        lay = layout(`${yc} بر حسب ${xc}`);
      } else {
        // bar / line / pie → group X, aggregate Y
        const groups = {};
        rows.forEach((r) => {
          const k = r[xc] == null ? "" : String(r[xc]);
          (groups[k] = groups[k] || []).push(method === "count" ? 1 : r[yc]);
        });
        let agg = aggregate(groups, method);
        // For non-count aggregations the Y column must be numeric; otherwise every
        // group aggregates to 0 → a meaningless chart. Warn instead.
        if (method !== "count" && agg.every((d) => d.value === 0) && !S.isNumericCol(yc)) {
          return warn(`برای تجمیع «${method}»، ستون محور Y باید عددی باشد. ستون «${yc}» عددی نیست.`);
        }
        agg.sort((a, b) => b.value - a.value);
        if (!agg.length) return warn("داده‌ای برای نمایش وجود ندارد.");
        if (type !== "pie" && agg.length > 50) agg = agg.slice(0, 50); // keep charts readable
        const labels = agg.map((d) => d.key);
        const values = agg.map((d) => d.value);
        const yLabel = method === "count" ? "تعداد" : `${method} ${yc}`;
        if (type === "bar") {
          traces = [{ type: "bar", x: labels, y: values, marker: { color: GREEN } }];
          lay = layout(`${yLabel} بر حسب ${xc}`);
        } else if (type === "line") {
          traces = [{ type: "scatter", mode: "lines+markers", x: labels, y: values, line: { color: GREEN } }];
          lay = layout(`${yLabel} بر حسب ${xc}`);
        } else {
          traces = [{ type: "pie", labels, values }];
          lay = layout(`${yLabel} بر حسب ${xc}`);
        }
      }
      react(chartDiv, traces, lay);
    }

    [typeEl, xEl, yEl, aggEl].forEach((e) => e.addEventListener("change", draw));
    draw();
  }

  App.charts = {
    layout, plot, react, retheme, clearRegistry, config,
    GREEN, FONT, renderBuilder, aggregate,
  };
})(window.App);
