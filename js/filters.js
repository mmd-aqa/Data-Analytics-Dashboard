/*
 * filters.js — Phase 6 (filter panel) + Phase 7 (global search).
 *
 * Filters and search mutate App.state and call S.refresh(), which notifies every
 * subscribed section so tables, KPIs and charts update live.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { el, iconHTML, escapeHTML } = App.dom;
  const { fmtInt, isBlank } = App.fmt;
  const { debounce } = App.util;
  const S = App.state;

  const NUM_OPS = [
    { id: ">", fa: "بزرگ‌تر از (>)" },
    { id: ">=", fa: "بزرگ‌تر یا مساوی (≥)" },
    { id: "<", fa: "کوچک‌تر از (<)" },
    { id: "<=", fa: "کوچک‌تر یا مساوی (≤)" },
    { id: "=", fa: "مساوی (=)" },
    { id: "!=", fa: "نامساوی (≠)" },
    { id: "between", fa: "بین دو مقدار" },
  ];

  // Working set of filter rows (mirrored into state on apply).
  let draft = [];

  /*
   * Global search panel — only the search input + a clear action. Search logic is
   * unchanged: it still drives S.setSearch() + S.refresh() (debounced on input,
   * immediate on Enter). Relocated out of the old combined panel into the toolbar.
   */
  function renderSearch(root) {
    root.innerHTML = "";

    const panel = el("div", "search-panel");
    panel.innerHTML = `<div class="search-wrap">
        ${iconHTML("search", "search-icon")}
        <input id="globalSearch" type="text" aria-label="جست‌وجو در همه ستون‌ها"
          placeholder="جست‌وجو در همه ستون‌ها..." value="${escapeHTML(S.search())}" />
      </div>`;
    const clearBtn = el("button", "btn-ghost", "پاک کردن جستجو");
    clearBtn.type = "button";
    panel.appendChild(clearBtn);
    root.appendChild(panel);

    const input = panel.querySelector("#globalSearch");
    const apply = (v) => {
      S.setSearch(v);
      S.refresh();
    };
    input.addEventListener("input", debounce((e) => apply(e.target.value), 250));
    // Enter applies immediately (search is otherwise live/debounced).
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        apply(input.value);
      }
    });
    clearBtn.onclick = () => {
      input.value = "";
      apply("");
      input.focus();
    };
  }

  function renderFilters(root) {
    root.innerHTML = "";
    draft = S.filters().map((f) => ({ ...f }));

    root.appendChild(el("h3", "text-base font-bold mb-1", "فیلتر داده‌ها"));
    root.appendChild(
      el("p", "mb-4 text-gray-500 dark:text-gray-400",
        "چند فیلتر را هم‌زمان اعمال کنید. جدول‌ها، نمودارها و شاخص‌ها به‌صورت زنده به‌روزرسانی می‌شوند."),
    );

    /* --------------------------- Filter rows ----------------------------- */
    const rowsBox = el("div", "flex flex-col gap-3 mb-3");
    root.appendChild(rowsBox);

    const controls = el("div", "flex flex-wrap gap-2 items-center");
    const addBtn = el("button", "btn-secondary", `${iconHTML("filter", "text-base")}<span>افزودن فیلتر</span>`);
    const clearBtn = el("button", "btn-ghost", "پاک کردن همه فیلترها");
    controls.appendChild(addBtn);
    controls.appendChild(clearBtn);
    root.appendChild(controls);

    const status = el("div", "mt-4 text-sm text-gray-500 dark:text-gray-400");
    root.appendChild(status);

    function updateStatus() {
      const total = S.raw().length;
      const shown = S.getView().length;
      status.innerHTML = `نمایش <b>${fmtInt(shown)}</b> از <b>${fmtInt(total)}</b> ردیف`;
    }

    function apply() {
      // Keep only complete filter rows.
      const valid = draft.filter((f) => {
        if (f.kind === "numeric") return f.value !== "" && f.value != null && !(f.op === "between" && (f.value2 === "" || f.value2 == null));
        return Array.isArray(f.value) && f.value.length > 0;
      });
      S.setFilters(valid);
      S.refresh();
      updateStatus();
    }

    function drawRows() {
      rowsBox.innerHTML = "";
      draft.forEach((f, idx) => rowsBox.appendChild(filterRow(f, idx, drawRows, apply)));
      if (!draft.length) {
        rowsBox.appendChild(el("div", "text-sm text-gray-400 dark:text-gray-500", "فیلتری اضافه نشده است."));
      }
    }

    addBtn.onclick = () => {
      const firstCol = S.columns()[0];
      const numeric = S.isNumericCol(firstCol);
      draft.push(
        numeric
          ? { col: firstCol, kind: "numeric", op: ">", value: "", value2: "" }
          : { col: firstCol, kind: "categorical", op: "=", value: [] },
      );
      drawRows();
    };
    clearBtn.onclick = () => {
      draft = [];
      drawRows();
      apply();
    };

    drawRows();
    updateStatus();
  }

  // Build one filter row: [column] [operator] [value(s)] [remove]
  function filterRow(f, idx, redraw, apply) {
    const row = el("div", "filter-row");
    const cols = S.columns();

    const colSel = el("select", "filter-col");
    colSel.innerHTML = cols.map((c) => `<option value="${escapeHTML(c)}"${c === f.col ? " selected" : ""}>${escapeHTML(c)}</option>`).join("");
    colSel.onchange = () => {
      f.col = colSel.value;
      const numeric = S.isNumericCol(f.col);
      if (numeric) { f.kind = "numeric"; f.op = ">"; f.value = ""; f.value2 = ""; }
      else { f.kind = "categorical"; f.op = "="; f.value = []; }
      redraw();
    };
    row.appendChild(colSel);

    if (f.kind === "numeric") {
      const opSel = el("select", "filter-op");
      opSel.innerHTML = NUM_OPS.map((o) => `<option value="${o.id}"${o.id === f.op ? " selected" : ""}>${o.fa}</option>`).join("");
      opSel.onchange = () => { f.op = opSel.value; redraw(); apply(); };
      row.appendChild(opSel);

      const v1 = el("input", "filter-val");
      v1.type = "number";
      v1.placeholder = "مقدار";
      v1.value = f.value ?? "";
      v1.oninput = () => { f.value = v1.value; apply(); };
      row.appendChild(v1);

      if (f.op === "between") {
        const v2 = el("input", "filter-val");
        v2.type = "number";
        v2.placeholder = "تا";
        v2.value = f.value2 ?? "";
        v2.oninput = () => { f.value2 = v2.value; apply(); };
        row.appendChild(v2);
      }
    } else {
      // Categorical: multi-select of distinct values.
      const opSel = el("select", "filter-op");
      opSel.innerHTML = [
        `<option value="="${f.op === "=" ? " selected" : ""}>یکی از (=)</option>`,
        `<option value="!="${f.op === "!=" ? " selected" : ""}>هیچ‌یک از (≠)</option>`,
      ].join("");
      opSel.onchange = () => { f.op = opSel.value; apply(); };
      row.appendChild(opSel);

      const distinct = distinctValues(f.col);
      const valSel = el("select", "filter-val filter-multi");
      valSel.multiple = true;
      valSel.size = Math.min(4, Math.max(2, distinct.length));
      valSel.innerHTML = distinct
        .map((v) => `<option value="${escapeHTML(v)}"${f.value.includes(v) ? " selected" : ""}>${escapeHTML(v === "" ? "(خالی)" : v)}</option>`)
        .join("");
      valSel.onchange = () => {
        f.value = Array.from(valSel.selectedOptions).map((o) => o.value);
        apply();
      };
      row.appendChild(valSel);
    }

    const rm = el("button", "filter-remove", iconHTML("error", "text-base"));
    rm.title = "حذف فیلتر";
    rm.onclick = () => {
      draft.splice(idx, 1);
      redraw();
      apply();
    };
    row.appendChild(rm);
    return row;
  }

  // Distinct values for a categorical column (capped to keep the UI usable).
  function distinctValues(col) {
    const set = new Set();
    for (const r of S.raw()) {
      set.add(isBlank(r[col]) ? "" : String(r[col]));
      if (set.size > 500) break;
    }
    return Array.from(set).sort();
  }

  App.filters = { renderSearch, renderFilters };
})(window.App);
