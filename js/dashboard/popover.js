/*
 * dashboard/popover.js — The floating command-menu popover engine (used by the
 * toolbar's Export menu). A professional, accessible popover: portalled to
 * <body>, position:fixed, auto-flips up/down, clamps inside the viewport, and
 * recomputes on scroll/resize instead of closing. Roving-focus keyboard model.
 *
 * Pure presentation/positioning — no business logic. Exposed as App.popover.
 */
window.App = window.App || {};

(function (App) {
  "use strict";

  let globalCloserAttached = false;

  function menuItems(menu) {
    return Array.from(menu.querySelectorAll('[role="menuitem"]:not([disabled])'));
  }

  function closeAll(focusTrigger) {
    document.querySelectorAll(".dropdown-menu.open").forEach((m) => {
      m.classList.remove("open");
      const btn = m._btn;
      if (btn) btn.setAttribute("aria-expanded", "false");
      // _cleanup detaches listeners and re-homes the portalled menu.
      if (typeof m._cleanup === "function") { m._cleanup(); m._cleanup = null; }
      if (focusTrigger && btn) btn.focus();
    });
  }

  // Anchor the popover to its trigger: aligned to the button's inline-end (right,
  // in RTL), opening downward by default and flipping upward when there isn't
  // room below. Capped to ~320px tall with internal scroll, always fully inside
  // the viewport. Cheap enough to run on every scroll/resize frame.
  function position(btn, menu) {
    const GAP = 6, PAD = 8, MAX_H = 320;
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const spaceBelow = vh - r.bottom - GAP - PAD;
    const spaceAbove = r.top - GAP - PAD;
    const wanted = Math.min(menu.scrollHeight, MAX_H);
    const openUp = spaceBelow < wanted && spaceAbove > spaceBelow;

    const avail = Math.max(120, openUp ? spaceAbove : spaceBelow);
    menu.style.maxHeight = Math.min(MAX_H, avail) + "px";

    // Measure after constraining the height.
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;

    let left = r.right - mw; // align right edges (RTL)
    left = Math.max(PAD, Math.min(left, vw - mw - PAD));

    let top = openUp ? r.top - GAP - mh : r.bottom + GAP;
    top = Math.max(PAD, Math.min(top, vh - mh - PAD));

    menu.style.left = Math.round(left) + "px";
    menu.style.top = Math.round(top) + "px";
    menu.dataset.placement = openUp ? "top" : "bottom";
  }

  function open(btn, menu) {
    // Portal to <body> so NO transformed ancestor (the section entrance
    // animation), sticky bar, or overflow:hidden/auto container can clip or
    // offset a position:fixed popover.
    document.body.appendChild(menu);
    menu.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    position(btn, menu);

    // Recalculate — never close — on resize and ANY scroll (capture:true catches
    // the table/card/window scrolls alike), so the menu stays glued to the button.
    const reposition = () => position(btn, menu);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    menu._cleanup = () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      if (menu._wrap) menu._wrap.appendChild(menu); // re-home into the toolbar
    };

    // Move focus into the menu for keyboard users (roving focus across items).
    const items = menuItems(menu);
    if (items.length) items[0].focus();
  }

  // Roving-focus keyboard model for role="menu": Up/Down/Home/End move between
  // items, Escape closes (focus back to trigger), Tab closes and moves on.
  function onKeydown(menu, e) {
    const items = menuItems(menu);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); items[(i + 1) % items.length].focus(); break;
      case "ArrowUp": e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); break;
      case "Home": e.preventDefault(); items[0].focus(); break;
      case "End": e.preventDefault(); items[items.length - 1].focus(); break;
      case "Escape": e.preventDefault(); closeAll(true); break;
      case "Tab": closeAll(false); break; // let focus leave naturally
    }
  }

  // Close the popover on outside-click or Escape — attached once globally (the
  // menu is portalled to <body>, so a wrapper-scoped handler wouldn't catch
  // events fired from inside it). Escape returns focus to the trigger.
  function ensureGlobalCloser() {
    if (globalCloserAttached) return;
    document.addEventListener("click", () => closeAll());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll(true);
    });
    globalCloserAttached = true;
  }

  App.popover = { menuItems, closeAll, position, open, onKeydown, ensureGlobalCloser };
})(window.App);
