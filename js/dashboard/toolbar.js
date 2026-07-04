/*
 * dashboard/toolbar.js — The data-table command bar: one cohesive group of
 * actions (upload · search · filter · new-chart · export · reset), the
 * collapsible search/filter panels, the live status host, and the Export
 * popover menu (positioned by App.popover).
 *
 * It only relocates/wraps existing behaviour — search/filter/export/reset logic
 * is reused from App.filters / App.exporter / App.state. Exposed as App.toolbar.
 *
 * build(host, handlers) returns:
 *   { refs, statusHost, updateBadges }
 * where handlers = { onUpload, onNewChart, onReset } and refs carries the
 * elements the orchestrator needs for live refresh and reset.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML } = App.dom;
  const { fmtInt } = App.fmt;
  const S = App.state;
  const popover = App.popover;

  // Flat export list — no category headers, no dividers (per the redesign).
  const EXPORT_ITEMS = [
    ["pdf", "گزارش PDF", "pdf"],
    ["data-excel", "Excel", "download"],
    ["data-csv", "CSV", "table"],
    ["png", "PNG", "image"],
    ["svg", "SVG", "image"],
  ];

  function buildExportMenu() {
    const wrap = el("div", "toolbar-dropdown");
    const btn = el("button", "toolbar-btn",
      `${iconHTML("download", "text-lg")}<span>خروجی</span>${iconHTML("expand", "toolbar-caret")}`);
    btn.type = "button";
    btn.id = "exportMenuBtn";
    btn.title = "خروجی گرفتن";
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "exportMenu");

    const menu = el("div", "dropdown-menu");
    menu.id = "exportMenu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-labelledby", "exportMenuBtn");
    EXPORT_ITEMS.forEach(([kind, label, icon]) => {
      const mi = el("button", "dropdown-item", `${iconHTML(icon, "text-base")}<span>${label}</span>`);
      mi.type = "button";
      mi.tabIndex = -1; // roving focus: only one item is tabbable at a time
      mi.setAttribute("role", "menuitem");
      mi.onclick = () => { popover.closeAll(true); App.exporter.run(kind); };
      menu.appendChild(mi);
    });
    // Clicks inside the menu chrome (scrollbar/padding) must not bubble out and
    // trigger the outside-click close.
    menu.addEventListener("click", (e) => e.stopPropagation());
    menu.addEventListener("keydown", (e) => popover.onKeydown(menu, e));

    btn.onclick = (e) => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains("open");
      popover.closeAll();
      if (willOpen) popover.open(btn, menu);
    };
    // ArrowDown opens the menu and lands on the first item.
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" && !menu.classList.contains("open")) {
        e.preventDefault();
        popover.closeAll();
        popover.open(btn, menu);
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    // Refs used by the portal logic in popover.open / popover.closeAll.
    menu._wrap = wrap;
    menu._btn = btn;
    return wrap;
  }

  function build(host, handlers = {}) {
    popover.closeAll(); // re-home any menu portalled to <body> before we rebuild
    host.innerHTML = "";
    const toolbar = el("div", "data-toolbar");

    // Note: "بارگذاری فایل جدید" is no longer a toolbar button — it is now the
    // app's floating primary action (see #floatingUploadBtn in index.html,
    // wired in dashboard.js). Same trigger, same behaviour.

    // Search toggle.
    const searchBtn = el("button", "toolbar-btn",
      `${iconHTML("search", "text-lg")}<span>جستجو</span>` +
      `<span class="toolbar-badge toolbar-badge-dot" data-badge="search" hidden></span>`);
    searchBtn.type = "button";
    searchBtn.setAttribute("aria-expanded", "false");
    searchBtn.setAttribute("aria-controls", "searchPanel");

    // Filter toggle.
    const filterBtn = el("button", "toolbar-btn",
      `${iconHTML("filter", "text-lg")}<span>فیلتر</span>` +
      `<span class="toolbar-badge" data-badge="filter" hidden></span>`);
    filterBtn.type = "button";
    filterBtn.setAttribute("aria-expanded", "false");
    filterBtn.setAttribute("aria-controls", "filterPanel");

    // New chart — jumps to the chart-builder tab.
    const newChartBtn = el("button", "toolbar-btn",
      `${iconHTML("newChart", "text-lg")}<span>نمودار جدید</span>`);
    newChartBtn.type = "button";
    newChartBtn.title = "ساخت نمودار جدید";
    newChartBtn.onclick = () => handlers.onNewChart && handlers.onNewChart();

    // Reset all (disabled until search/filters are active — see updateBadges).
    const resetBtn = el("button", "toolbar-btn",
      `${iconHTML("reset", "text-lg")}<span>بازنشانی</span>`);
    resetBtn.type = "button";
    resetBtn.onclick = () => handlers.onReset && handlers.onReset();

    // Export popover (floating command-menu).
    const exportWrap = buildExportMenu();

    // One cohesive command bar — a single contiguous group, no separating
    // spacer. RTL reading order: search · filter · new-chart · export · reset.
    // Export sits beside its neighbours so its popover stays attached.
    [searchBtn, filterBtn, newChartBtn].forEach((b) => toolbar.appendChild(b));
    toolbar.appendChild(exportWrap);
    toolbar.appendChild(resetBtn);
    host.appendChild(toolbar);

    popover.ensureGlobalCloser();

    // Collapsible panels — each wraps a single inner div so the CSS grid-rows
    // animation can collapse arbitrary-height content smoothly.
    const searchPanel = el("div", "toolbar-panel");
    searchPanel.id = "searchPanel";
    searchPanel.setAttribute("role", "region");
    searchPanel.setAttribute("aria-label", "جست‌وجو");
    const searchInner = el("div", "toolbar-panel-inner");
    searchPanel.appendChild(searchInner);

    const filterPanel = el("div", "toolbar-panel");
    filterPanel.id = "filterPanel";
    filterPanel.setAttribute("role", "region");
    filterPanel.setAttribute("aria-label", "فیلتر");
    const filterInner = el("div", "toolbar-panel-inner");
    filterPanel.appendChild(filterInner);

    host.appendChild(searchPanel);
    host.appendChild(filterPanel);

    // Live status line, sitting directly above the table.
    const statusHost = el("div", "toolbar-status");
    statusHost.setAttribute("aria-live", "polite");
    host.appendChild(statusHost);

    const rendered = { search: false, filter: false };

    const open = (panel, btn) => {
      panel.classList.add("open");
      btn.classList.add("active-toggle");
      btn.setAttribute("aria-expanded", "true");
    };
    const close = (panel, btn) => {
      panel.classList.remove("open");
      btn.classList.remove("active-toggle");
      btn.setAttribute("aria-expanded", "false");
    };

    searchBtn.onclick = () => {
      if (searchPanel.classList.contains("open")) { close(searchPanel, searchBtn); return; }
      if (!rendered.search) { App.filters.renderSearch(searchInner); rendered.search = true; }
      open(searchPanel, searchBtn);
      const input = searchInner.querySelector("#globalSearch");
      if (input) { input.focus(); input.select(); }
    };

    filterBtn.onclick = () => {
      if (filterPanel.classList.contains("open")) { close(filterPanel, filterBtn); return; }
      if (!rendered.filter) { App.filters.renderFilters(filterInner); rendered.filter = true; }
      open(filterPanel, filterBtn);
    };

    // Escape closes the panel and returns focus to its toggle button.
    searchPanel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { close(searchPanel, searchBtn); searchBtn.focus(); }
    });
    filterPanel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { close(filterPanel, filterBtn); filterBtn.focus(); }
    });

    const refs = { searchBtn, filterBtn, resetBtn, searchInner, filterInner, rendered };
    const api = { refs, statusHost, updateBadges: () => updateBadges(refs) };
    api.updateBadges();
    return api;
  }

  // Reflect active search / filter state on the toolbar (highlight + badge +
  // tooltip), and enable the reset button only when there is something to reset.
  function updateBadges(refs) {
    if (!refs) return;
    const { searchBtn, filterBtn, resetBtn } = refs;

    const query = S.search().trim();
    const searchActive = !!query;
    searchBtn.classList.toggle("active", searchActive);
    const sBadge = searchBtn.querySelector('[data-badge="search"]');
    if (sBadge) sBadge.hidden = !searchActive;
    searchBtn.title = searchActive ? `جست‌وجوی فعال: «${query}»` : "جست‌وجو در همه ستون‌ها";

    const fCount = S.filters().length;
    filterBtn.classList.toggle("active", fCount > 0);
    const fBadge = filterBtn.querySelector('[data-badge="filter"]');
    if (fBadge) {
      fBadge.hidden = fCount === 0;
      fBadge.textContent = fCount > 0 ? fmtInt(fCount) : "";
    }
    filterBtn.title = fCount > 0 ? `${fmtInt(fCount)} فیلتر فعال است` : "افزودن فیلتر";

    if (resetBtn) {
      const active = searchActive || fCount > 0;
      resetBtn.disabled = !active;
      resetBtn.title = active
        ? "پاک کردن جست‌وجو و همه فیلترها"
        : "فیلتر یا جست‌وجوی فعالی وجود ندارد";
    }
  }

  App.toolbar = { build };
})(window.App);
