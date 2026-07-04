/*
 * insights.js — Phase 8: Automatic, programmatic dataset insights (no AI).
 * Produces a short list of natural-language Persian findings from the loaded
 * dataset and renders them as an always-visible card above the tabs.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML } = App.dom;
  const { fmtInt } = App.fmt;
  const S = App.state;
  const stats = App.statistics;
  const correlation = App.correlation;

  // Build a list of insight strings (+ a tone for icon colour).
  function compute() {
    const out = [];
    const summary = stats.computeSummary();

    out.push({
      tone: "info",
      text: `این مجموعه‌داده شامل <b>${fmtInt(summary.columns)}</b> ستون و <b>${fmtInt(summary.rows)}</b> ردیف است ` +
        `(<b>${fmtInt(summary.numeric)}</b> عددی، <b>${fmtInt(summary.categorical)}</b> دسته‌ای).`,
    });

    // Missing values — count of affected columns + worst offender.
    const miss = stats.missingByColumn().filter((m) => m["تعداد گمشده"] > 0);
    if (miss.length) {
      const worst = miss.reduce((a, b) => (b._pct > a._pct ? b : a));
      out.push({
        tone: "warn",
        text: `<b>${fmtInt(miss.length)}</b> ستون دارای مقادیر گمشده است. ` +
          `بیشترین گمشدگی مربوط به «<b>${worst["ستون"]}</b>» با <b>${worst["درصد گمشده"]}٪</b> است.`,
      });
    } else {
      out.push({ tone: "ok", text: "هیچ مقدار گمشده‌ای در مجموعه‌داده وجود ندارد." });
    }

    // Correlations — strongest + and − pair (needs ≥2 numeric columns).
    if (S.numericColumns().length >= 2) {
      const { pairs } = correlation.computeMatrix();
      if (pairs.length) {
        const sortedDesc = [...pairs].sort((a, b) => b.r - a.r);
        const pos = sortedDesc[0];
        const neg = sortedDesc[sortedDesc.length - 1];
        if (pos && pos.r > 0) {
          out.push({ tone: "info", text: `قوی‌ترین همبستگی مثبت: «<b>${pos.a}</b> ↔ <b>${pos.b}</b>» با ضریب <b>${pos.r}</b>.` });
        }
        if (neg && neg.r < 0) {
          out.push({ tone: "info", text: `قوی‌ترین همبستگی منفی: «<b>${neg.a}</b> ↔ <b>${neg.b}</b>» با ضریب <b>${neg.r}</b>.` });
        }
      }
    }

    // Outliers — total across numeric columns.
    const totalOutliers = S.numericColumns().reduce((s, c) => s + stats.outlierCount(c).count, 0);
    if (totalOutliers > 0) {
      out.push({ tone: "warn", text: `در مجموع <b>${fmtInt(totalOutliers)}</b> داده پرت (روش IQR) در ستون‌های عددی شناسایی شد.` });
    } else if (S.numericColumns().length) {
      out.push({ tone: "ok", text: "هیچ داده پرتی در ستون‌های عددی یافت نشد." });
    }

    // Duplicates.
    if (summary.duplicates > 0) {
      out.push({ tone: "warn", text: `<b>${fmtInt(summary.duplicates)}</b> ردیف تکراری یافت شد.` });
    } else {
      out.push({ tone: "ok", text: "هیچ ردیف تکراری یافت نشد." });
    }

    return out;
  }

  const ICON_FOR = { info: "info", warn: "warn", ok: "ok" };

  // Render insights into a host element (rebuilt on data/filter change).
  function render(host) {
    host.innerHTML = "";
    const card = el("div", "insight-card");
    const head = el("div", "insight-head", `${iconHTML("info")}<span>بینش‌های خودکار مجموعه‌داده</span>`);
    card.appendChild(head);
    const list = el("ul", "insight-list");
    compute().forEach((ins) => {
      const li = el("li", `insight-item insight-${ins.tone}`);
      li.innerHTML = `${iconHTML(ICON_FOR[ins.tone], "insight-icon")}<span>${ins.text}</span>`;
      list.appendChild(li);
    });
    card.appendChild(list);
    host.appendChild(card);
  }

  App.insights = { compute, render };
})(window.App);
