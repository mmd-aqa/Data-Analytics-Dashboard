/*
 * correlation.js — Phase 4: Pearson correlation matrix + heatmap and the
 * strongest positive/negative correlation lists.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el } = App.dom;
  const { round } = App.fmt;
  const { alertBox, buildTable } = App.ui;
  const charts = App.charts;
  const S = App.state;

  // Pearson correlation over rows where BOTH columns have a present numeric value.
  // Blank cells (null/undefined/"") are skipped — NOT coerced (Number(null)===0
  // would silently bias the result toward zero).
  function pearson(colA, colB) {
    const rows = S.getView();
    const isBlank = App.fmt.isBlank;
    const xs = [], ys = [];
    for (const r of rows) {
      if (isBlank(r[colA]) || isBlank(r[colB])) continue;
      const x = Number(r[colA]), y = Number(r[colB]);
      if (isNaN(x) || isNaN(y)) continue;
      xs.push(x); ys.push(y);
    }
    const n = xs.length;
    if (n < 2) return NaN;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx, b = ys[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    const den = Math.sqrt(dx * dy);
    return den === 0 ? NaN : num / den;
  }

  // Full matrix as { cols, matrix:number[][], pairs:[{a,b,r}] }.
  function computeMatrix() {
    const cols = S.numericColumns();
    const matrix = cols.map(() => cols.map(() => 0));
    const pairs = [];
    for (let i = 0; i < cols.length; i++) {
      for (let j = 0; j < cols.length; j++) {
        if (i === j) { matrix[i][j] = 1; continue; }
        if (j < i) { matrix[i][j] = matrix[j][i]; continue; } // symmetric
        const r = pearson(cols[i], cols[j]);
        matrix[i][j] = isNaN(r) ? 0 : round(r, 4);
        if (!isNaN(r)) pairs.push({ a: cols[i], b: cols[j], r: round(r, 4) });
      }
    }
    return { cols, matrix, pairs };
  }

  function renderCorrelation(root) {
    root.innerHTML = "";
    root.appendChild(el("h3", "text-base font-bold mb-1", "ماتریس همبستگی"));
    root.appendChild(
      el("p", "mb-4 text-gray-500 dark:text-gray-400",
        "همبستگی پیرسون بین ستون‌های عددی. مقیاس رنگ از ۱- (همبستگی منفی) تا ۱+ (همبستگی مثبت) است."),
    );

    const cols = S.numericColumns();
    if (cols.length < 2) {
      root.appendChild(alertBox("warn", "برای محاسبه همبستگی حداقل به دو ستون عددی نیاز است."));
      return;
    }

    const { matrix, pairs } = computeMatrix();

    // Heatmap. Plotly's z[0] is the bottom row, so reverse y for a natural read.
    const div = el("div", "min-h-[460px] mb-5");
    root.appendChild(div);
    charts.plot(
      div,
      [{
        type: "heatmap",
        z: matrix,
        x: cols,
        y: cols,
        zmin: -1, zmax: 1,
        colorscale: [
          [0, "#b91c1c"], [0.5, "#f3f4f6"], [1, "#217346"],
        ],
        reversescale: false,
        hovertemplate: "%{y} ↔ %{x}<br>همبستگی: %{z}<extra></extra>",
        colorbar: { title: "r" },
      }],
      charts.layout("ماتریس همبستگی پیرسون", {
        xaxis: { automargin: true },
        yaxis: { automargin: true, autorange: "reversed" },
        margin: { t: 50, r: 20, b: 100, l: 100 },
      }),
    );

    // Strongest positive / negative lists.
    const sorted = [...pairs].sort((a, b) => b.r - a.r);
    const positives = sorted.filter((p) => p.r > 0).slice(0, 5);
    const negatives = sorted.filter((p) => p.r < 0).slice(-5).reverse();

    const grid = el("div", "grid grid-cols-1 md:grid-cols-2 gap-5");
    grid.appendChild(corrList("قوی‌ترین همبستگی‌های مثبت", positives, "pos"));
    grid.appendChild(corrList("قوی‌ترین همبستگی‌های منفی", negatives, "neg"));
    root.appendChild(grid);
  }

  function corrList(title, items, kind) {
    const box = el("div");
    box.appendChild(el("h4", "font-bold mb-2", title));
    if (!items.length) {
      box.appendChild(alertBox("info", "موردی برای نمایش وجود ندارد."));
      return box;
    }
    const list = el("div", "corr-list");
    items.forEach((p) => {
      const row = el("div", "corr-item");
      const arrow = kind === "pos" ? "↗" : "↘";
      row.innerHTML = `<span class="corr-pair">${escape(p.a)} ↔ ${escape(p.b)}</span>
        <span class="corr-val corr-${kind}">${arrow} ${p.r}</span>`;
      list.appendChild(row);
    });
    box.appendChild(list);
    return box;
  }

  const escape = (v) => App.dom.escapeHTML(v);

  App.correlation = { pearson, computeMatrix, renderCorrelation };
})(window.App);
