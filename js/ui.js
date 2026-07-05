/*
 * ui.js — Reusable presentational table components shared across sections.
 *   - alertBox: coloured info/warn/ok banners
 *   - buildTable: simple static table (small result sets)
 *   - buildPagedTable: paginated table for large datasets (Phase 10)
 *   - buildSortableTable: client-side sortable table (Phase 3 / 8)
 *
 * Toasts and the loading system live in their own single-responsibility modules
 * (js/dashboard/toast.js, js/dashboard/loading.js) and augment App.ui there, so
 * the App.ui.* public surface is unchanged for callers.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML, escapeHTML } = App.dom;
  const { fmtInt, isBlank } = App.fmt;

  function alertBox(type, text) {
    const map = { info: "alert alert-info", warn: "alert alert-warn", ok: "alert alert-ok" };
    const iconKey = { info: "info", warn: "warn", ok: "ok" };
    return el("div", map[type], `${iconHTML(iconKey[type])}<span>${text}</span>`);
  }

  /* Static table — for small, fixed result sets (describe, value counts...). */
  function buildTable(rows, columns, opts = {}) {
    const { indexed = true } = opts;
    const wrap = el("div", "df-wrapper");
    const table = el("table", "df");
    const thead = el("thead");
    const trh = el("tr");
    if (indexed) trh.appendChild(el("th", null, ""));
    columns.forEach((c) => trh.appendChild(el("th", null, escapeHTML(c))));
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = el("tbody");
    rows.forEach((row, i) => {
      const tr = el("tr");
      if (indexed) tr.appendChild(el("td", null, `<b>${i}</b>`));
      columns.forEach((c) => {
        let v = row[c];
        if (isBlank(v)) v = "";
        tr.appendChild(el("td", null, escapeHTML(v)));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  /*
   * Paginated table — only renders one page of <tr> at a time, so it stays fast
   * on 50k-row datasets. Returns a container that re-renders the body on page
   * change instead of building tens of thousands of DOM nodes.
   */
  function buildPagedTable(rows, columns, opts = {}) {
    const { pageSize = 50, indexed = true, highlight = "" } = opts;
    const container = el("div");
    const wrap = el("div", "df-wrapper");
    const table = el("table", "df");

    const thead = el("thead");
    const trh = el("tr");
    if (indexed) trh.appendChild(el("th", null, ""));
    columns.forEach((c) => trh.appendChild(el("th", null, escapeHTML(c))));
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = el("tbody");
    table.appendChild(tbody);
    wrap.appendChild(table);

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    let page = 0;

    const q = highlight.trim().toLowerCase();
    const mark = (text) => {
      const s = escapeHTML(text);
      if (!q) return s;
      const idx = String(text).toLowerCase().indexOf(q);
      if (idx === -1) return s;
      // Re-escape around the match to keep injection-safe highlighting.
      const before = escapeHTML(String(text).slice(0, idx));
      const hit = escapeHTML(String(text).slice(idx, idx + q.length));
      const after = escapeHTML(String(text).slice(idx + q.length));
      return `${before}<mark class="search-hit">${hit}</mark>${after}`;
    };

    function renderBody() {
      tbody.innerHTML = "";
      const start = page * pageSize;
      const slice = rows.slice(start, start + pageSize);
      slice.forEach((row, i) => {
        const tr = el("tr");
        if (indexed) tr.appendChild(el("td", null, `<b>${start + i}</b>`));
        columns.forEach((c) => {
          let v = row[c];
          if (isBlank(v)) v = "";
          tr.appendChild(el("td", null, mark(v)));
        });
        tbody.appendChild(tr);
      });
      wrap.scrollTop = 0;
    }

    container.appendChild(wrap);

    if (pages > 1) {
      const nav = el("div", "pager");
      const info = el("span", "pager-info");
      const first = el("button", "pager-btn", "«");
      const prev = el("button", "pager-btn", "‹");
      const next = el("button", "pager-btn", "›");
      const last = el("button", "pager-btn", "»");
      const update = () => {
        const start = page * pageSize + 1;
        const end = Math.min(total, (page + 1) * pageSize);
        info.textContent = `صفحه ${fmtInt(page + 1)} از ${fmtInt(pages)}`;
        first.disabled = prev.disabled = page === 0;
        last.disabled = next.disabled = page === pages - 1;
      };
      const go = (p) => { page = Math.max(0, Math.min(pages - 1, p)); renderBody(); update(); };
      first.onclick = () => go(0);
      prev.onclick = () => go(page - 1);
      next.onclick = () => go(page + 1);
      last.onclick = () => go(pages - 1);
      // RTL reading order: first / prev / info / next / last
      nav.appendChild(first); nav.appendChild(prev);
      nav.appendChild(info);
      nav.appendChild(next); nav.appendChild(last);
      container.appendChild(nav);
      renderBody();
      update();
    } else {
      renderBody();
    }
    return container;
  }

  /*
   * Sortable table — click a header to sort by that column (asc/desc).
   * `rowClass(row)` lets callers flag rows (e.g. >30% missing → warning row).
   */
  function buildSortableTable(rows, columns, opts = {}) {
    const { numericCols = [], rowClass = null, indexed = false, pageSize = 0 } = opts;
    const container = el("div");
    let sortCol = null;
    let sortDir = 1;

    function sorted() {
      if (sortCol === null) return rows;
      const isNum = numericCols.includes(sortCol);
      return [...rows].sort((a, b) => {
        let x = a[sortCol], y = b[sortCol];
        if (isNum) { x = Number(x); y = Number(y); }
        if (x < y) return -1 * sortDir;
        if (x > y) return 1 * sortDir;
        return 0;
      });
    }

    function draw() {
      container.innerHTML = "";
      const wrap = el("div", "df-wrapper");
      const table = el("table", "df sortable");
      const thead = el("thead");
      const trh = el("tr");
      columns.forEach((c) => {
        const arrow = sortCol === c ? (sortDir === 1 ? " ▲" : " ▼") : "";
        const th = el("th", "th-sort", escapeHTML(c) + arrow);
        // Keyboard-accessible sorting: a focusable header activated by Enter or
        // Space (same action as a click). aria-sort exposes the current order to
        // assistive tech. The sort logic itself is unchanged.
        th.tabIndex = 0;
        th.setAttribute("role", "columnheader");
        th.setAttribute("aria-sort", sortCol === c ? (sortDir === 1 ? "ascending" : "descending") : "none");
        const applySort = () => {
          if (sortCol === c) sortDir *= -1;
          else { sortCol = c; sortDir = 1; }
          draw();
          // Keep focus on the rebuilt header the user just activated (no scroll jump).
          const cells = container.querySelectorAll("th.th-sort");
          const idx = columns.indexOf(c);
          if (cells[idx]) cells[idx].focus({ preventScroll: true });
        };
        th.onclick = applySort;
        th.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applySort(); }
        };
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      table.appendChild(thead);
      const tbody = el("tbody");
      const data = sorted();
      const view = pageSize ? data.slice(0, pageSize) : data;
      view.forEach((row) => {
        const tr = el("tr", rowClass ? rowClass(row) : null);
        columns.forEach((c) => {
          let v = row[c];
          if (isBlank(v)) v = "";
          tr.appendChild(el("td", null, escapeHTML(v)));
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      container.appendChild(wrap);
    }
    draw();
    return container;
  }

  // Base App.ui surface; toast.js and loading.js augment it with toast/withBusy/
  // showLoading/hideLoading/sectionSpinner/deferAfterPaint when they load.
  App.ui = Object.assign(App.ui || {}, {
    alertBox, buildTable, buildPagedTable, buildSortableTable,
  });
})(window.App);
