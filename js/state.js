/*
 * state.js — Central data store.
 *
 * Holds the raw dataset and the derived "view" (raw data after filters + search).
 * Column types and dataset meta are detected ONCE per load and cached; the view is
 * memoised and only recomputed when filters/search/data change. Sections subscribe
 * to refresh() so a single state change updates KPIs, tables, stats and charts.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { isBlank } = App.fmt;

  const state = {
    raw: [],
    columns: [],
    isExample: false,
    fileName: "",

    filters: [], // [{ col, kind:'numeric'|'categorical', op, value, value2 }]
    search: "",

    meta: {}, // file metadata: { name, size, type, uploadedAt, memoryBytes }

    _viewCache: null,
    _colType: {}, // col -> 'numeric' | 'object'
    _subscribers: [],
  };

  /* ----------------------------- Loading data ---------------------------- */
  function setData(rows, columns, opts = {}) {
    state.raw = rows;
    state.columns = columns;
    state.isExample = !!opts.isExample;
    state.fileName = opts.fileName || "";
    state.filters = [];
    state.search = "";
    state._viewCache = null;
    state._colType = {};
    // Each load wires its own subscribers in render(); drop the previous set so
    // they don't accumulate across uploads (which would re-fire stale closures).
    state._subscribers = [];
    // Pre-compute column types once (cached) so later calls are O(1).
    columns.forEach((c) => (state._colType[c] = detectType(c)));
    // Build file metadata (Phase 9). Memory is a rough estimate of the parsed JS.
    state.meta = {
      name: opts.fileName || "",
      size: opts.fileSize != null ? opts.fileSize : null,
      type: opts.fileType || "",
      uploadedAt: opts.uploadedAt || null,
      memoryBytes: estimateMemory(rows, columns),
    };
  }

  // Rough in-memory size of the parsed dataset: ~per-cell overhead + string bytes.
  function estimateMemory(rows, columns) {
    if (!rows.length || !columns.length) return 0;
    const sampleN = Math.min(rows.length, 200);
    let sampleBytes = 0;
    for (let i = 0; i < sampleN; i++) {
      for (const c of columns) {
        const v = rows[i][c];
        if (v == null) sampleBytes += 4;
        else if (typeof v === "number") sampleBytes += 8;
        else sampleBytes += String(v).length * 2 + 8; // UTF-16 + overhead
      }
    }
    return Math.round((sampleBytes / sampleN) * rows.length);
  }

  /* --------------------------- Type detection ---------------------------- */
  // Sample-based numeric detection (first 50 non-blank values), matching the
  // original behaviour but computed once and cached.
  function detectType(col) {
    let seen = 0;
    for (const r of state.raw) {
      const v = r[col];
      if (isBlank(v)) continue;
      seen++;
      if (typeof v !== "number" && isNaN(Number(v))) return "object";
      if (seen > 50) break;
    }
    return seen > 0 ? "numeric" : "object";
  }

  const isNumericCol = (col) => state._colType[col] === "numeric";

  function dtypeOf(col) {
    if (!isNumericCol(col)) return "object";
    const vals = colValues(col, { numeric: true, fromView: false });
    return vals.every((v) => Number.isInteger(v)) ? "int64" : "float64";
  }

  const numericColumns = () => state.columns.filter(isNumericCol);
  const categoricalColumns = () => state.columns.filter((c) => !isNumericCol(c));

  /* ------------------------------ The view ------------------------------- */
  // Raw data after applying active filters and the global search query.
  function getView() {
    if (state._viewCache) return state._viewCache;
    let rows = state.raw;

    if (state.filters.length) {
      rows = rows.filter((r) => state.filters.every((f) => matchFilter(r, f)));
    }

    const q = state.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        state.columns.some((c) => {
          const v = r[c];
          return !isBlank(v) && String(v).toLowerCase().includes(q);
        }),
      );
    }

    state._viewCache = rows;
    return rows;
  }

  function matchFilter(row, f) {
    const v = row[f.col];
    if (f.kind === "numeric") {
      if (isBlank(v)) return false;
      const n = Number(v);
      if (isNaN(n)) return false;
      const a = Number(f.value);
      const b = Number(f.value2);
      switch (f.op) {
        case ">": return n > a;
        case ">=": return n >= a;
        case "<": return n < a;
        case "<=": return n <= a;
        case "=": return n === a;
        case "!=": return n !== a;
        case "between": return n >= Math.min(a, b) && n <= Math.max(a, b);
        default: return true;
      }
    }
    // categorical: value is an array of selected categories ("in" semantics)
    const set = f.value;
    const sv = isBlank(v) ? "" : String(v);
    if (f.op === "!=") return !set.includes(sv);
    return set.includes(sv);
  }

  /* --------------------------- Column extraction ------------------------- */
  // Pull a column's values; optionally numeric-coerced and/or from the view.
  function colValues(col, { numeric = false, fromView = true } = {}) {
    const src = fromView ? getView() : state.raw;
    const out = [];
    for (const r of src) {
      let v = r[col];
      if (isBlank(v)) continue;
      if (numeric) {
        v = Number(v);
        if (isNaN(v)) continue;
      }
      out.push(v);
    }
    return out;
  }

  /* ----------------------- Mutators + subscriptions ---------------------- */
  function setFilters(filters) {
    state.filters = filters || [];
    invalidate();
  }
  function setSearch(q) {
    state.search = q || "";
    invalidate();
  }
  function invalidate() {
    state._viewCache = null;
  }

  function subscribe(fn) {
    state._subscribers.push(fn);
  }
  function clearSubscribers() {
    state._subscribers = [];
  }
  // Notify all sections that the active dataset (view) changed.
  function refresh() {
    invalidate();
    const view = getView();
    state._subscribers.forEach((fn) => {
      try {
        fn(view);
      } catch (e) {
        console.error("subscriber error", e);
      }
    });
  }

  App.state = {
    raw: () => state.raw,
    columns: () => state.columns,
    isExample: () => state.isExample,
    fileName: () => state.fileName,
    meta: () => state.meta,
    hasData: () => state.raw.length > 0,
    filters: () => state.filters,
    search: () => state.search,

    setData,
    getView,
    colValues,
    isNumericCol,
    dtypeOf,
    numericColumns,
    categoricalColumns,

    setFilters,
    setSearch,
    subscribe,
    clearSubscribers,
    refresh,
    invalidate,
  };
})(window.App);
