/*
 * sidebar.js — Minimal analysis-navigation rail (UI/UX only).
 *
 * A compact, right-side vertical nav layered over the EXISTING dashboard without
 * changing its architecture, data flow or render logic. The dashboard is
 * tab-based: dashboard.js renders seven tabs (overview, missing, correlation,
 * charts, valuecounts, groupby, quality) in a fixed order. The rail lists those
 * seven sections as flat icon+label items — no trees, no sub-items — and a click
 * simply activates the matching tab button that already exists, reusing its own
 * onclick (lazy render + active-state handling). Nothing here re-renders the
 * dashboard or duplicates any analysis code.
 *
 * Integration points (all read-only against the rest of the app):
 *   • Visibility follows #resultsSection (dashboard.js toggles its `hidden`
 *     class on load / clear / show-upload) via a MutationObserver.
 *   • A click calls App.dashboard.showSection(id) with the section's STABLE id
 *     (matching dashboard.js tabDefs) — never a tab index or DOM position. The
 *     dashboard lazy-renders that section on first open, so the initial view
 *     stays summary + preview only until the user picks something.
 *   • The active highlight mirrors whichever tab reports aria-selected="true",
 *     read from its stable `data-section` attribute; when no section is open
 *     (the initial state) nothing is highlighted.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { $, el, iconHTML } = App.dom;

  /* --------------------------- Navigation model -------------------------- */
  // `id` is the section's STABLE identifier — it matches dashboard.js tabDefs
  // ids, so navigation binds by identity (App.dashboard.showSection(id)) rather
  // than by tab order or DOM position. One rail item ↔ one dashboard section.
  const NAV = [
    { id: "overview",    name: "نمای کلی",     icon: "home" },
    { id: "missing",     name: "مقادیر گمشده", icon: "missing" },
    { id: "correlation", name: "همبستگی",      icon: "grid" },
    { id: "charts",      name: "نمودارساز",    icon: "chart" },
    { id: "valuecounts", name: "شمارش مقادیر", icon: "rows" },
    { id: "groupby",     name: "گروه‌بندی",    icon: "category" },
    { id: "quality",     name: "کیفیت داده",   icon: "quality" },
  ];

  const NAV_IDS = new Set(NAV.map((n) => n.id));

  /* ------------------------------ Elements ------------------------------- */
  let aside = null;
  let backdrop = null;
  let toggleBtn = null;
  let shell = null; // the app's top-level flex wrapper (gains right padding)
  let nav = null;

  /* ------------------------------- Build --------------------------------- */
  function buildNav() {
    const frag = document.createDocumentFragment();
    NAV.forEach((item) => {
      const b = el("button", "sb-item");
      b.type = "button";
      b.dataset.nav = item.id;
      b.setAttribute("aria-label", item.name);
      b.innerHTML =
        iconHTML(item.icon, "sb-item__icon") +
        `<span class="sb-item__label">${item.name}</span>`;
      frag.appendChild(b);
    });
    nav.innerHTML = "";
    nav.appendChild(frag);
  }

  function build() {
    if (aside) return;
    shell = document.body.firstElementChild; // the app's flex wrapper

    aside = el("aside", "app-sidebar");
    aside.id = "dashSidebar";
    aside.setAttribute("aria-label", "ناوبری بخش‌های تحلیل");

    const head = el("div", "app-sidebar__head");
    const close = el("button", "app-sidebar__close");
    close.type = "button";
    close.setAttribute("aria-label", "بستن منو");
    close.addEventListener("click", closeDrawer);
    head.appendChild(close);
    aside.appendChild(head);

    nav = el("nav", "app-sidebar__nav");
    nav.setAttribute("aria-label", "بخش‌های تحلیل داده");
    aside.appendChild(nav);
    buildNav();

    backdrop = el("div", "app-sidebar__backdrop");
    backdrop.addEventListener("click", closeDrawer);

    document.body.appendChild(aside);
    document.body.appendChild(backdrop);

    injectToggle();

    // One delegated click handler for the whole rail.
    nav.addEventListener("click", onNavClick);
    nav.addEventListener("keydown", onNavKeydown);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
    window.addEventListener("resize", () => { if (!isMobile()) closeDrawer(); }, { passive: true });
  }

  // Add the mobile drawer toggle into the existing header action group so it
  // matches the upload/theme buttons exactly (same .header-btn system). The
  // group is #headerActions (the primary-action cluster at the RTL start).
  function injectToggle() {
    const group = $("headerActions");
    if (!group) return;
    toggleBtn = el("button", "header-btn header-btn--ghost header-btn--icon sb-toggle");
    toggleBtn.id = "sbToggle";
    toggleBtn.type = "button";
    toggleBtn.hidden = true;
    toggleBtn.setAttribute("aria-label", "نمایش بخش‌های تحلیل");
    toggleBtn.setAttribute("aria-controls", "dashSidebar");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.innerHTML = `<span class="sb-toggle__bars" aria-hidden="true"></span>`;
    toggleBtn.addEventListener("click", () =>
      aside.classList.contains("is-open") ? closeDrawer() : openDrawer());
    group.insertBefore(toggleBtn, group.firstChild);
  }

  /* ------------------------------ Drawer --------------------------------- */
  const isMobile = () => window.matchMedia("(max-width: 1023px)").matches;

  function openDrawer() {
    if (!aside) return;
    aside.classList.add("is-open");
    backdrop.classList.add("is-open");
    if (toggleBtn) { toggleBtn.classList.add("is-open"); toggleBtn.setAttribute("aria-expanded", "true"); }
    const first = nav.querySelector(".sb-item");
    if (first) first.focus();
  }
  function closeDrawer() {
    if (!aside) return;
    aside.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    if (toggleBtn) { toggleBtn.classList.remove("is-open"); toggleBtn.setAttribute("aria-expanded", "false"); }
  }

  /* --------------------------- Show / hide ------------------------------- */
  function isDashboardVisible() {
    const results = $("resultsSection");
    return !!results && !results.classList.contains("hidden");
  }

  function show() {
    aside.classList.add("is-visible");
    if (shell) shell.classList.add("dash-has-sidebar");
    if (toggleBtn) toggleBtn.hidden = false;
    refreshActive();
  }
  function hide() {
    aside.classList.remove("is-visible");
    if (shell) shell.classList.remove("dash-has-sidebar");
    if (toggleBtn) toggleBtn.hidden = true;
    closeDrawer();
  }
  function sync() {
    if (isDashboardVisible()) show(); else hide();
  }

  /* --------------------------- Navigation -------------------------------- */
  function onNavClick(e) {
    const item = e.target.closest(".sb-item");
    if (!item) return;
    navigate(item.dataset.nav);
  }

  // Activate a section by its STABLE id — the dashboard owns the render (lazy on
  // first open), active-state and scroll. No tab index, no DOM-position clicks.
  function navigate(id) {
    if (!NAV_IDS.has(id)) return;
    setActive(id);
    if (isMobile()) closeDrawer();
    if (App.dashboard && typeof App.dashboard.showSection === "function") {
      App.dashboard.showSection(id);
    }
  }

  /* --------------------------- Active state ------------------------------ */
  function setActive(id) {
    nav.querySelectorAll(".sb-item.is-active").forEach((n) => {
      n.classList.remove("is-active");
      n.removeAttribute("aria-current");
    });
    if (!id) return;
    const item = nav.querySelector(`.sb-item[data-nav="${id}"]`);
    if (item) { item.classList.add("is-active"); item.setAttribute("aria-current", "true"); }
  }

  // Mirror whichever section the dashboard reports as selected, read from the
  // active tab's stable `data-section` attribute (not its position). None
  // selected → no rail highlight (the initial summary-only state).
  function refreshActive() {
    if (!isDashboardVisible()) return;
    const active = document.querySelector('#content [role="tab"][aria-selected="true"]');
    const id = active && active.dataset ? active.dataset.section : null;
    setActive(NAV_IDS.has(id) ? id : null);
  }

  /* --------------------------- Keyboard nav ------------------------------ */
  // Roving focus with Up/Down across the rail items; Home/End jump to the ends.
  // Enter/Space are handled natively by the buttons.
  function onNavKeydown(e) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(nav.querySelectorAll(".sb-item"));
    if (!items.length) return;
    e.preventDefault();
    const cur = items.indexOf(document.activeElement);
    let next;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "ArrowDown") next = cur < 0 ? 0 : (cur + 1) % items.length;
    else next = cur <= 0 ? items.length - 1 : cur - 1;
    items[next].focus();
  }

  /* --------------------------- Observation ------------------------------- */
  function observe() {
    const results = $("resultsSection");
    if (results) {
      new MutationObserver(sync).observe(results, {
        attributes: true, attributeFilter: ["class"],
      });
    }
    const content = $("content");
    if (content) {
      // A re-render replaces #content; a tab switch flips aria-selected. Either
      // way, re-sync the active highlight (cheap).
      const obs = new MutationObserver(() => refreshActive());
      obs.observe(content, { childList: true }); // top-level re-render
      obs.observe(content, {
        attributes: true, attributeFilter: ["aria-selected"], subtree: true,
      });
    }
  }

  /* ------------------------------- Init ---------------------------------- */
  function init() {
    build();
    observe();
    sync(); // reflect whatever state the page is already in
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  App.sidebar = { refresh: sync };
})(window.App);
