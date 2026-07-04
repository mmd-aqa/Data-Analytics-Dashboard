/*
 * export.js — Phase 9: export of data, charts and a PDF report.
 *   - Data    → Excel (SheetJS) & CSV  (no new deps)
 *   - Charts     → PNG / SVG (Plotly.toImage)
 *   - Report     → PDF via a print-optimised window (window.print → "Save as PDF")
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, escapeHTML } = App.dom;
  const { fmtInt, isBlank } = App.fmt;
  const { downloadBlob } = App.util;
  const stats = App.statistics;
  const correlation = App.correlation;
  const S = App.state;

  const baseName = () => (S.fileName() || "dataset").replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "_") || "dataset";

  /* ----------------------------- Excel / CSV ----------------------------- */
  function rowsToAOA(rows, columns) {
    const aoa = [columns.slice()];
    rows.forEach((r) => aoa.push(columns.map((c) => (isBlank(r[c]) ? "" : r[c]))));
    return aoa;
  }

  function exportExcel(rows, columns, sheetName, fname) {
    const ws = XLSX.utils.aoa_to_sheet(rowsToAOA(rows, columns));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, fname);
  }

  function exportCSV(rows, columns, fname) {
    const esc = (v) => {
      const s = isBlank(v) ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map(esc).join(",")];
    rows.forEach((r) => lines.push(columns.map((c) => esc(r[c])).join(",")));
    // BOM so Excel reads UTF-8 (Persian) correctly.
    downloadBlob(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), fname);
  }

  function exportDataExcel() {
    exportExcel(S.getView(), S.columns(), "Data", `${baseName()}_data.xlsx`);
  }
  function exportDataCSV() {
    exportCSV(S.getView(), S.columns(), `${baseName()}_data.csv`);
  }

  /* ------------------------------ Chart images --------------------------- */
  // Export every live Plotly chart currently on the page.
  async function exportCharts(format) {
    const nodes = Array.from(document.querySelectorAll(".js-plotly-plot"));
    if (!nodes.length) return false;
    let i = 0;
    for (const node of nodes) {
      try {
        const url = await Plotly.toImage(node, { format, width: 1000, height: 600, scale: 2 });
        const a = el("a");
        a.href = url;
        a.download = `${baseName()}_chart_${++i}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        await new Promise((r) => setTimeout(r, 150)); // stagger downloads
      } catch (e) {
        console.error("chart export failed", e);
      }
    }
    return true;
  }

  /* -------------------------------- PDF report --------------------------- */
  // Builds a standalone, print-styled HTML document and triggers print.
  // The browser's "Save as PDF" produces the report — fully offline, no deps.
  async function exportPDF() {
    const summary = stats.computeSummary();
    const win = window.open("", "_blank");
    if (!win) {
      App.ui.toast("warn", "برای ساخت گزارش PDF، اجازه‌ی باز شدن پنجره‌ی جدید را بدهید.", 5000);
      return false;
    }

    // 1) KPI cards
    const kpis = [
      ["تعداد ردیف‌ها", fmtInt(summary.rows)],
      ["تعداد ستون‌ها", fmtInt(summary.columns)],
      ["ستون‌های عددی", fmtInt(summary.numeric)],
      ["ستون‌های دسته‌ای", fmtInt(summary.categorical)],
      ["مقادیر گمشده", fmtInt(summary.missing)],
      ["ردیف‌های تکراری", fmtInt(summary.duplicates)],
    ];
    const kpiHTML = kpis.map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");

    // 2) Statistics
    const statRows = stats.describeRows();
    const statHTML = statRows
      ? htmlTable(statRows, ["آماره", ...S.numericColumns()])
      : "<p>ستون عددی وجود ندارد.</p>";

    // 3) Missing values
    const miss = stats.missingByColumn().filter((r) => r["تعداد گمشده"] > 0);
    const missHTML = miss.length
      ? htmlTable(miss, ["ستون", "تعداد گمشده", "درصد گمشده"])
      : "<p>مقدار گمشده‌ای وجود ندارد.</p>";

    // 4) Correlation summary (top pairs)
    let corrHTML = "<p>برای همبستگی حداقل دو ستون عددی لازم است.</p>";
    if (S.numericColumns().length >= 2) {
      const { pairs } = correlation.computeMatrix();
      const sorted = [...pairs].sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 10);
      corrHTML = htmlTable(
        sorted.map((p) => ({ "جفت ستون": `${p.a} ↔ ${p.b}`, "همبستگی": p.r })),
        ["جفت ستون", "همبستگی"],
      );
    }

    // 5) Charts → embed as PNG snapshots
    const chartNodes = Array.from(document.querySelectorAll(".js-plotly-plot"));
    const chartImgs = [];
    for (const node of chartNodes) {
      try {
        const url = await Plotly.toImage(node, { format: "png", width: 900, height: 500, scale: 1.5 });
        chartImgs.push(`<img src="${url}" />`);
      } catch (e) { /* skip */ }
    }
    const chartsHTML = chartImgs.length ? chartImgs.join("") : "<p>نموداری برای نمایش وجود ندارد.</p>";

    const today = new Date().toLocaleDateString("fa-IR");
    win.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
      <title>گزارش تحلیل داده — ${escapeHTML(S.fileName() || "")}</title>
      <style>
        body{font-family:Tahoma,sans-serif;color:#111;margin:24px;direction:rtl;}
        h1{font-size:22px;border-bottom:3px solid #217346;padding-bottom:8px;color:#185c37;}
        h2{font-size:16px;color:#185c37;margin-top:28px;border-right:4px solid #217346;padding-right:8px;}
        .meta{color:#666;font-size:12px;margin-bottom:8px;}
        .kpis{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0;}
        .kpi{flex:1 1 140px;border:1px solid #ddd;border-radius:10px;padding:12px;text-align:center;}
        .kpi .v{font-size:22px;font-weight:bold;color:#185c37;}
        .kpi .l{font-size:12px;color:#555;margin-top:4px;}
        table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px;direction:ltr;}
        th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;}
        th{background:#f0f7f2;}
        img{max-width:100%;border:1px solid #eee;border-radius:8px;margin:10px 0;page-break-inside:avoid;}
        @media print{ h2{page-break-after:avoid;} }
      </style></head><body>
      <h1>گزارش تحلیل داده</h1>
      <div class="meta">فایل: ${escapeHTML(S.fileName() || "—")} · تاریخ: ${today}</div>
      <h2>شاخص‌های کلیدی</h2><div class="kpis">${kpiHTML}</div>
      <h2>خلاصه آماری</h2>${statHTML}
      <h2>مقادیر گمشده</h2>${missHTML}
      <h2>خلاصه همبستگی</h2>${corrHTML}
      <h2>نمودارها</h2>${chartsHTML}
      </body></html>`);
    win.document.close();
    win.focus();
    // Give images a tick to load before invoking print.
    setTimeout(() => win.print(), 500);
  }

  function htmlTable(rows, columns) {
    const head = columns.map((c) => `<th>${escapeHTML(c)}</th>`).join("");
    const body = rows
      .map((r) => `<tr>${columns.map((c) => `<td>${escapeHTML(isBlank(r[c]) ? "" : r[c])}</td>`).join("")}</tr>`)
      .join("");
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  /* ------------------------- UX wrapper (run) ---------------------------- */
  // Single entry point for every export action — adds a loading overlay for the
  // slow async jobs, success/empty/error toasts, and prevents duplicate clicks
  // while running. The raw export functions above stay UI-agnostic.
  async function run(kind) {
    const T = App.ui;
    try {
      switch (kind) {
        case "data-excel":
          exportDataExcel();
          T.toast("ok", "فایل اکسل (داده) ذخیره شد");
          break;
        case "data-csv":
          exportDataCSV();
          T.toast("ok", "فایل CSV (داده) ذخیره شد");
          break;
        case "png":
        case "svg": {
          T.showLoading("در حال آماده‌سازی تصاویر نمودار...");
          const ok = await exportCharts(kind);
          T.hideLoading();
          if (ok === false) T.toast("warn", "نموداری برای خروجی وجود ندارد. ابتدا یک نمودار بسازید.");
          else T.toast("ok", "نمودارها ذخیره شدند");
          break;
        }
        case "pdf": {
          T.showLoading("در حال ساخت گزارش PDF...");
          const ok = await exportPDF();
          T.hideLoading();
          if (ok !== false) T.toast("ok", "گزارش PDF آماده شد");
          break;
        }
      }
    } catch (e) {
      App.ui.hideLoading();
      App.ui.toast("error", "خطا در خروجی گرفتن. لطفاً دوباره تلاش کنید.");
    }
  }

  App.exporter = {
    exportExcel, exportCSV, exportDataExcel, exportDataCSV,
    exportCharts, exportPDF, run,
  };
})(window.App);
