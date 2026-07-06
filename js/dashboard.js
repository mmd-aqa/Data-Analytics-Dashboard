/*
 * dashboard.js — Orchestrator. Owns the dashboard layout (header → KPI cards →
 * insights → data preview), the tab system, the preserved analysis sections
 * (overview / value-counts / group-by) and the theme toggle. The presentational
 * pieces live in single-responsibility modules under js/dashboard/:
 *   header.js · summary.js · toolbar.js · popover.js · preview.js
 * This file holds the shared layout state and wires those modules together; it
 * does not duplicate their builders.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { $, el, iconHTML, ICONS } = App.dom;
  const { fmtInt } = App.fmt;
  const { alertBox, buildTable } = App.ui;
  const S = App.state;
  const stats = App.statistics;
  const charts = App.charts;

  /* ------------------------------ Main render ---------------------------- */
  // Tab registry — order defines the tab bar. `render(panel)` fills the panel.
  function tabDefs() {
    return [
      { id: "overview", name: "نمای کلی", render: renderOverview },
      { id: "missing", name: "مقادیر گمشده", render: (p) => stats.renderMissing(p) },
      { id: "correlation", name: "همبستگی", render: (p) => App.correlation.renderCorrelation(p) },
      { id: "charts", name: "نمودارساز", render: (p) => charts.renderBuilder(p) },
      { id: "valuecounts", name: "شمارش مقادیر", render: renderValueCounts },
      { id: "groupby", name: "گروه‌بندی", render: renderGroupby },
      { id: "quality", name: "کیفیت داده", render: (p) => stats.renderQuality(p) },
    ];
  }

  // Shared layout state, owned here so the extracted modules can stay stateless.
  let headerHost = null;
  let kpiHost = null;
  let insightsHost = null;
  let previewHost = null;
  let toolbarApi = null; // { refs, statusHost, updateBadges } from App.toolbar.build
  let activateTabFn = null; // set in render(); lets the toolbar switch tabs
  let activeTabId = "overview";

  // Reset-all: clear search + every filter, restoring the original dataset. A
  // single S.refresh() re-renders KPIs, insights, preview and the live tabs.
  function resetAll() {
    S.setSearch("");
    S.setFilters([]);
    S.refresh();
    if (toolbarApi && toolbarApi.refs) {
      const r = toolbarApi.refs;
      if (r.rendered.search) App.filters.renderSearch(r.searchInner);
      if (r.rendered.filter) App.filters.renderFilters(r.filterInner);
    }
    App.ui.toast("ok", "نمایش به حالت اولیه بازنشانی شد");
  }

  function render() {
    const c = $("content");
    const results = $("resultsSection");
    results.classList.remove("hidden");
    // Landing → dashboard: hide the upload card and fade the dashboard in.
    const uploadSection = $("uploadSection");
    if (uploadSection) uploadSection.classList.add("hidden");
    // Reveal the header primary action ("بارگذاری فایل جدید") — the single
    // persistent way to load another file while a dataset is on screen.
    const headerUpload = $("headerUploadBtn");
    if (headerUpload) {
      headerUpload.hidden = false;
      headerUpload.onclick = showUpload;
    }
    results.classList.remove("fade-in");
    void results.offsetWidth; // reflow so the animation re-triggers each load
    results.classList.add("fade-in");
    c.innerHTML = "";
    c.classList.remove("hidden");
    charts.clearRegistry();
    // Drop subscribers from any previous render so they don't pile up.
    S.clearSubscribers();

    // Dashboard header — dataset identity strip above the KPI cards (24px gap).
    headerHost = el("div", "mb-6");
    headerHost.appendChild(App.dashHeader.build());
    c.appendChild(headerHost);

    // KPI cards — the single home for the metric breakdown (32px gap below).
    kpiHost = el("div", "mb-8");
    kpiHost.appendChild(App.dashSummary.buildKpiCards());
    c.appendChild(kpiHost);

    // Auto-insights — analytical findings only, full width (32px gap below).
    insightsHost = el("div", "mb-8");
    c.appendChild(insightsHost);
    App.insights.render(insightsHost);

    // Data preview: section title, the sticky search/filter toolbar (with its
    // live status line), then the paginated table — no repeated summary chips.
    c.appendChild(el("h2", "section-title mb-4", `${iconHTML("table")}<span>پیش‌نمایش داده</span>`));
    const toolbarHost = el("div");
    c.appendChild(toolbarHost);
    toolbarApi = App.toolbar.build(toolbarHost, {
      onNewChart: () => { if (activateTabFn) activateTabFn("charts"); },
      onReset: resetAll,
    });
    App.preview.updateStatusLine(toolbarApi.statusHost);
    previewHost = el("div", "mt-4"); // 16px: toolbar → table
    c.appendChild(previewHost);
    App.preview.draw(previewHost, resetAll);
    c.appendChild(el("hr", "border-gray-200 dark:border-gray-800 my-8"));

    // Tabs
    const defs = tabDefs();
    const tabBar = el("div", "flex gap-2 flex-wrap mb-4 border-b border-gray-200 dark:border-gray-800 pb-2");
    tabBar.setAttribute("role", "tablist");
    const panels = el("div");
    const panelMap = {};
    const tabBtns = {};
    const rendered = {}; // lazy render per tab
    // Tabs whose first render is heavy enough (chart drawing, correlation matrix,
    // outlier scan) to deserve a localized spinner instead of a brief freeze.
    const HEAVY = { charts: 1, correlation: 1, quality: 1 };

    defs.forEach((def) => {
      const isActive = def.id === activeTabId;
      const btn = el("button", "tab-btn" + (isActive ? " active" : ""), def.name);
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      const panel = el("div", isActive ? "" : "hidden");
      panel.setAttribute("role", "tabpanel");
      panelMap[def.id] = { panel, def };
      tabBtns[def.id] = btn;
      btn.onclick = () => {
        activeTabId = def.id;
        tabBar.querySelectorAll(".tab-btn").forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        Object.values(panelMap).forEach((x) => x.panel.classList.add("hidden"));
        panel.classList.remove("hidden");
        if (rendered[def.id]) return;
        rendered[def.id] = true;
        // Localized loading: paint a spinner inside the panel first, then render
        // on the next frame so the section (not the whole page) shows progress.
        if (HEAVY[def.id]) {
          panel.appendChild(App.ui.sectionSpinner("در حال آماده‌سازی..."));
          App.ui.deferAfterPaint(() => def.render(panel));
        } else {
          def.render(panel);
        }
      };
      tabBar.appendChild(btn);
      panels.appendChild(panel);
    });

    // Keyboard navigation across the tab bar (WAI-ARIA tablist pattern, RTL-aware):
    // Arrow keys move to the adjacent tab and activate it; Home/End jump to the
    // ends. Activation reuses each button's existing onclick — sorting/render
    // logic is untouched.
    const tabOrder = defs.map((d) => d.id);
    tabBar.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const cur = tabOrder.indexOf(activeTabId);
      let next;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabOrder.length - 1;
      // RTL reading order: ArrowLeft advances, ArrowRight goes back.
      else next = (cur + (e.key === "ArrowLeft" ? 1 : -1) + tabOrder.length) % tabOrder.length;
      const nextBtn = tabBtns[tabOrder[next]];
      if (nextBtn) { nextBtn.onclick(); nextBtn.focus(); }
    });

    c.appendChild(tabBar);
    c.appendChild(panels);

    // Let the toolbar (e.g. "نمودار جدید") switch tabs programmatically.
    activateTabFn = (id) => {
      const btn = tabBtns[id];
      if (!btn) return;
      btn.onclick();
      btn.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // Render the active tab now; others render lazily on first open.
    panelMap[activeTabId].def.render(panelMap[activeTabId].panel);
    rendered[activeTabId] = true;

    // Live refresh: when filters/search change, update the header, KPIs, insights,
    // the preview, the toolbar badges/status, and (only) the data-display tabs
    // that should react to the view. Tabs that hold their own control state
    // (chart builder, value counts, group-by) are NOT auto-re-rendered, so the
    // user's in-tab selections survive a filter change.
    const LIVE_TABS = { overview: 1, missing: 1, correlation: 1, quality: 1 };
    S.subscribe(() => {
      if (headerHost) { headerHost.innerHTML = ""; headerHost.appendChild(App.dashHeader.build()); }
      if (kpiHost) { kpiHost.innerHTML = ""; kpiHost.appendChild(App.dashSummary.buildKpiCards()); }
      if (insightsHost) App.insights.render(insightsHost);
      App.preview.draw(previewHost, resetAll);
      if (toolbarApi) {
        toolbarApi.updateBadges();
        App.preview.updateStatusLine(toolbarApi.statusHost);
      }
      const active = panelMap[activeTabId];
      if (active && LIVE_TABS[activeTabId] && rendered[activeTabId]) {
        active.def.render(active.panel);
      }
    });
  }

  /* --------------------------- Overview section -------------------------- */
  function renderOverview(root) {
    root.innerHTML = "";
    root.appendChild(el("h3", "text-base font-bold mb-3", "نمای کلی مجموعه‌داده"));

    const subNames = ["خلاصه", "ستون‌ها", "انواع داده", "سطرهای ابتدایی و انتهایی"];
    const bar = el("div", "flex gap-2 flex-wrap mb-4");
    const wrap = el("div");
    const sub = [];
    subNames.forEach((n, i) => {
      const b = el("button", "tab-btn" + (i === 0 ? " active" : ""), n);
      const p = el("div", i === 0 ? "" : "hidden");
      b.onclick = () => {
        bar.querySelectorAll(".tab-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        sub.forEach((x) => x.classList.add("hidden"));
        p.classList.remove("hidden");
      };
      bar.appendChild(b); wrap.appendChild(p); sub.push(p);
    });
    root.appendChild(bar); root.appendChild(wrap);

    const rows = S.getView();
    sub[0].appendChild(el("p", "mb-2", `تعداد <b>${fmtInt(rows.length)}</b> سطر و <b>${S.columns().length}</b> ستون در نمای فعلی وجود دارد`));
    sub[0].appendChild(el("h4", "font-bold mb-2", "خلاصه آماری مجموعه‌داده"));
    sub[0].appendChild(stats.buildDescribe());

    sub[1].appendChild(el("h4", "font-bold mb-2", "نام ستون‌ها"));
    sub[1].appendChild(buildTable(S.columns().map((c) => ({ "0": c })), ["0"]));

    sub[2].appendChild(el("h4", "font-bold mb-2", "انواع داده ستون‌ها"));
    sub[2].appendChild(buildTable(S.columns().map((c) => ({ "ستون": c, "نوع": S.dtypeOf(c) })), ["ستون", "نوع"]));

    buildHeadTail(sub[3]);
  }

  function buildHeadTail(root) {
    const rows = S.getView();
    const max = rows.length;
    if (max === 0) { root.appendChild(alertBox("warn", "ردیفی وجود ندارد.")); return; }

    root.appendChild(el("h4", "font-bold mb-1 mt-2", "سطرهای ابتدایی"));
    const topW = el("div", "widget mb-2");
    topW.innerHTML = `<label>تعداد سطرهای ابتدایی موردنظر: <span id="topVal">5</span></label>
      <input type="range" min="1" max="${Math.min(max, 100)}" value="5" id="topSlider" class="w-full">`;
    root.appendChild(topW);
    const topTbl = el("div"); root.appendChild(topTbl);
    const drawTop = (n) => { topTbl.innerHTML = ""; topTbl.appendChild(buildTable(rows.slice(0, n), S.columns())); };
    topW.querySelector("#topSlider").oninput = (e) => { topW.querySelector("#topVal").textContent = e.target.value; drawTop(+e.target.value); };
    drawTop(5);

    root.appendChild(el("h4", "font-bold mb-1 mt-4", "سطرهای انتهایی"));
    const botW = el("div", "widget mb-2");
    botW.innerHTML = `<label>تعداد سطرهای انتهایی موردنظر: <span id="botVal">5</span></label>
      <input type="range" min="1" max="${Math.min(max, 100)}" value="5" id="botSlider" class="w-full">`;
    root.appendChild(botW);
    const botTbl = el("div"); root.appendChild(botTbl);
    const drawBot = (n) => { botTbl.innerHTML = ""; botTbl.appendChild(buildTable(rows.slice(-n), S.columns())); };
    botW.querySelector("#botSlider").oninput = (e) => { botW.querySelector("#botVal").textContent = e.target.value; drawBot(+e.target.value); };
    drawBot(5);
  }

  /* ------------------------- Value-counts section ------------------------ */
  function renderValueCounts(root) {
    root.innerHTML = "";
    root.appendChild(el("h3", "text-base font-bold mb-3", "شمارش مقادیر ستون‌ها"));

    const det = el("details", "expander");
    det.open = true;
    det.appendChild(el("summary", null, "شمارش مقادیر"));
    const body = el("div", "py-3 flex flex-col gap-4");

    const grid = el("div", "grid grid-cols-1 sm:grid-cols-2 gap-4");
    const colW = el("div", "widget");
    colW.innerHTML = `<label>نام ستون را انتخاب کنید</label>
      <select id="vcCol">${S.columns().map((c) => `<option>${c}</option>`).join("")}</select>`;
    const topW = el("div", "widget");
    topW.innerHTML = `<label>سطرهای ابتدایی</label><input type="number" id="vcTop" min="1" value="10">`;
    grid.appendChild(colW); grid.appendChild(topW);
    body.appendChild(grid);

    const btn = el("button", "rounded-lg bg-[#217346] hover:bg-[#1a5c38] text-white font-semibold px-4 py-2 w-max", "شمارش");
    body.appendChild(btn);
    const out = el("div"); body.appendChild(out);

    btn.onclick = () => {
      out.innerHTML = "";
      const col = body.querySelector("#vcCol").value;
      const topN = +body.querySelector("#vcTop").value || 10;
      const counts = {};
      S.colValues(col).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
      let arr = Object.entries(counts).map(([k, v]) => ({ [col]: k, count: v }));
      arr.sort((a, b) => b.count - a.count);
      arr = arr.slice(0, topN);
      out.appendChild(buildTable(arr, [col, "count"]));
      out.appendChild(el("h4", "font-bold mt-4 mb-2", "مصورسازی"));
      if (!arr.length) { out.appendChild(alertBox("warn", "داده‌ای برای نمایش در نمودار وجود ندارد.")); return; }
      const x = arr.map((r) => String(r[col])), y = arr.map((r) => r.count);
      const d1 = el("div", "mb-4"); out.appendChild(d1);
      charts.plot(d1, [{ type: "bar", x, y, text: y, textposition: "auto", marker: { color: charts.GREEN } }], charts.layout("نمودار میله‌ای"));
      const d2 = el("div", "mb-4"); out.appendChild(d2);
      charts.plot(d2, [{ type: "scatter", mode: "lines+markers+text", x, y, text: y }], charts.layout("نمودار خطی"));
      const d3 = el("div", "mb-4"); out.appendChild(d3);
      charts.plot(d3, [{ type: "pie", labels: x, values: y }], charts.layout("نمودار دایره‌ای"));
    };

    det.appendChild(body);
    root.appendChild(det);
  }

  /* --------------------------- Group-by section -------------------------- */
  function renderGroupby(root) {
    root.innerHTML = "";
    root.appendChild(el("h3", "text-base font-bold mb-3", "گروه‌بندی"));
    root.appendChild(el("p", "mb-3 text-gray-500 dark:text-gray-400", "گروه‌بندی به شما امکان می‌دهد داده‌های خود را بر اساس دسته‌ها و گروه‌های خاص خلاصه کنید"));

    const det = el("details", "expander");
    det.open = true;
    det.appendChild(el("summary", null, "گروه‌بندی ستون‌های شما"));
    const body = el("div", "py-3 flex flex-col gap-4");

    const grid = el("div", "grid grid-cols-1 sm:grid-cols-3 gap-4");
    const gW = el("div", "widget");
    gW.innerHTML = `<label>ستون (ها) را برای گروه‌بندی انتخاب کنید</label>
      <select id="gbCols" multiple size="4">${S.columns().map((c) => `<option>${c}</option>`).join("")}</select>`;
    const opColW = el("div", "widget");
    opColW.innerHTML = `<label>ستون را برای عملیات انتخاب کنید</label>
      <select id="gbOpCol">${S.columns().map((c) => `<option>${c}</option>`).join("")}</select>`;
    const opW = el("div", "widget");
    opW.innerHTML = `<label>عملیات را انتخاب کنید</label>
      <select id="gbOp">${["sum", "max", "min", "mean", "median", "count"].map((o) => `<option>${o}</option>`).join("")}</select>`;
    grid.appendChild(gW); grid.appendChild(opColW); grid.appendChild(opW);
    body.appendChild(grid);

    const btn = el("button", "rounded-lg bg-[#217346] hover:bg-[#1a5c38] text-white font-semibold px-4 py-2 w-max", "اعمال گروه‌بندی");
    body.appendChild(btn);
    const out = el("div"); body.appendChild(out);

    btn.onclick = () => {
      out.innerHTML = "";
      const gbCols = Array.from(body.querySelector("#gbCols").selectedOptions).map((o) => o.value);
      if (!gbCols.length) { out.appendChild(alertBox("warn", "حداقل یک ستون برای گروه‌بندی انتخاب کنید.")); return; }
      const opCol = body.querySelector("#gbOpCol").value;
      const op = body.querySelector("#gbOp").value;
      const result = stats.groupby(gbCols, opCol, op);
      const cols = [...gbCols, "Result"];
      out.appendChild(buildTable(result, cols));
      out.appendChild(el("h4", "font-bold mt-4 mb-2", "مصورسازی داده"));

      const chartW = el("div", "widget mb-3 max-w-xs");
      chartW.innerHTML = `<label>نمودار خود را انتخاب کنید</label>
        <select id="gbChart">${["bar", "line", "scatter", "pie", "sunburst"].map((g) => `<option>${g}</option>`).join("")}</select>`;
      out.appendChild(chartW);
      const chartDiv = el("div"); out.appendChild(chartDiv);

      const draw = () => {
        const g = chartW.querySelector("#gbChart").value;
        chartDiv.innerHTML = "";
        const x = result.map((r) => gbCols.map((c) => r[c]).join(" / "));
        const yv = result.map((r) => r.Result);
        if (g === "bar") {
          charts.plot(chartDiv, [{ type: "bar", x, y: yv, marker: { color: charts.GREEN } }], charts.layout("نمودار میله‌ای"));
        } else if (g === "line") {
          charts.plot(chartDiv, [{ type: "scatter", mode: "lines+markers", x, y: yv }], charts.layout("نمودار خطی"));
        } else if (g === "scatter") {
          charts.plot(chartDiv, [{ type: "scatter", mode: "markers", x, y: yv, marker: { size: 12, color: charts.GREEN } }], charts.layout("نمودار پراکندگی"));
        } else if (g === "pie") {
          charts.plot(chartDiv, [{ type: "pie", labels: x, values: yv }], charts.layout("نمودار دایره‌ای"));
        } else if (g === "sunburst") {
          const labels = [], parents = [], values = [];
          const seen = new Set();
          result.forEach((r) => {
            let parent = "";
            gbCols.forEach((c, i) => {
              const label = gbCols.slice(0, i + 1).map((cc) => r[cc]).join(" / ");
              if (!seen.has(label)) {
                seen.add(label);
                labels.push(label); parents.push(parent);
                values.push(i === gbCols.length - 1 ? r.Result : 0);
              }
              parent = label;
            });
          });
          charts.plot(chartDiv, [{ type: "sunburst", labels, parents, values, branchvalues: "total" }], charts.layout("نمودار آفتاب‌پرتو"));
        }
      };
      chartW.querySelector("#gbChart").onchange = draw;
      draw();
    };

    det.appendChild(body);
    root.appendChild(det);
  }

  /* ------------------------------- Clear --------------------------------- */
  function clear() {
    S.setData([], []);
    const c = $("content");
    if (c) { c.innerHTML = ""; c.classList.add("hidden"); }
    $("resultsSection").classList.add("hidden");
    showUpload();
    headerHost = null;
    kpiHost = null;
    insightsHost = null;
    previewHost = null;
    toolbarApi = null;
    activateTabFn = null;
    charts.clearRegistry();
  }

  // Reveal the upload card again (via the toolbar "بارگذاری فایل جدید" button)
  // without a page reload. Existing state is untouched until a new file replaces
  // it. Returning to the dashboard happens automatically once a file loads.
  function showUpload() {
    const results = $("resultsSection");
    if (results) results.classList.add("hidden");
    // Upload screen already has the main upload area — hide the header action.
    const headerUpload = $("headerUploadBtn");
    if (headerUpload) headerUpload.hidden = true;
    const uploadSection = $("uploadSection");
    if (uploadSection) {
      uploadSection.classList.remove("hidden");
      const card = uploadSection.querySelector(".upload-card");
      if (card) {
        card.classList.remove("fade-in");
        void card.offsetWidth;
        card.classList.add("fade-in");
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    const label = document.querySelector('label[for="fileInput"]');
    if (label) label.focus();
  }

  /* ---------------------------- Theme toggle ----------------------------- */
  function applyThemeButton() {
    const dark = document.documentElement.classList.contains("dark");
    const icon = $("themeIcon"), btn = $("themeToggle");
    if (icon) icon.textContent = dark ? ICONS.themeLight : ICONS.themeDark;
    if (btn) btn.setAttribute("aria-label", dark ? "light mode" : "dark mode");
  }

  function setupThemeToggle() {
    const btn = $("themeToggle");
    if (!btn) return;
    applyThemeButton();
    btn.addEventListener("click", () => {
      const dark = document.documentElement.classList.toggle("dark");
      localStorage.setItem("theme", dark ? "dark" : "light");
      applyThemeButton();
      // Recolour charts in place instead of rebuilding the whole DOM.
      charts.retheme();
    });
  }

  App.dashboard = {
    render,
    clear,
    showUpload,
    buildKpiCards: (...a) => App.dashSummary.buildKpiCards(...a),
    setupThemeToggle,
  };
})(window.App);
