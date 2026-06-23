// ===== وضعیت سراسری برنامه =====
let DATA = [];          // آرایه‌ای از ردیف‌ها (هر ردیف یک شیء)
let COLUMNS = [];       // نام ستون‌ها
let isExample = false;  // آیا از مجموعه‌داده نمونه استفاده می‌شود؟

// پسوندهای مجاز برای بارگذاری
const ALLOWED_EXT = ["csv", "xlsx", "xls"];

// ===== ابزارهای کمکی =====
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// تشخیص عددی بودن یک ستون
function isNumericCol(col) {
  let seen = 0;
  for (const r of DATA) {
    const v = r[col];
    if (v === null || v === undefined || v === "") continue;
    seen++;
    if (typeof v !== "number" && isNaN(Number(v))) return false;
    if (seen > 50) break;
  }
  return seen > 0;
}

function colValues(col, numeric = false) {
  const out = [];
  for (const r of DATA) {
    let v = r[col];
    if (v === null || v === undefined || v === "") continue;
    if (numeric) { v = Number(v); if (isNaN(v)) continue; }
    out.push(v);
  }
  return out;
}

// نوع داده ستون به سبک pandas
function dtypeOf(col) {
  if (isNumericCol(col)) {
    const vals = colValues(col, true);
    return vals.every((v) => Number.isInteger(v)) ? "int64" : "float64";
  }
  return "object";
}

// ===== ساخت جدول HTML =====
function buildTable(rows, columns) {
  const wrap = el("div", "df-wrapper");
  const table = el("table", "df");
  const thead = el("thead");
  const trh = el("tr");
  trh.appendChild(el("th", null, ""));            // ستون اندیس
  columns.forEach((c) => trh.appendChild(el("th", null, String(c))));
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = el("tbody");
  rows.forEach((row, i) => {
    const tr = el("tr");
    tr.appendChild(el("td", null, `<b>${i}</b>`));
    columns.forEach((c) => {
      let v = row[c];
      if (v === null || v === undefined) v = "";
      tr.appendChild(el("td", null, String(v)));
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function alertBox(type, text) {
  const map = { info: "alert alert-info", warn: "alert alert-warn", ok: "alert alert-ok" };
  return el("div", map[type], text);
}

// ===== خواندن فایل =====
// پاک‌کردن محتوا و نمایش پیام خطا (هیچ جدولی نمایش داده نمی‌شود)
function clearContent() {
  DATA = [];
  COLUMNS = [];
  const c = $("content");
  c.innerHTML = "";
  c.classList.add("hidden");
}

function showFileError(text) {
  clearContent();
  $("fileStatus").innerHTML =
    `<span class="text-red-600 dark:text-red-400 font-semibold">${text}</span>`;
}

function getExt(name) {
  const parts = String(name).toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

// پردازش فایل انتخاب‌شده پس از اعتبارسنجی پسوند
function handleFile(file) {
  if (!file) return;
  isExample = false;
  const ext = getExt(file.name);

  // اعتبارسنجی پسوند: در صورت نامعتبر بودن، خطا نمایش داده و هیچ جدولی رندر نمی‌شود
  if (!ALLOWED_EXT.includes(ext)) {
    showFileError(
      `❌ فرمت فایل پشتیبانی نمی‌شود. تنها فرمت‌های ${ALLOWED_EXT.join("، ")} مجاز هستند.`,
    );
    return;
  }

  if (ext === "csv") {
    Papa.parse(file, {
      header: true, dynamicTyping: true, skipEmptyLines: true,
      complete: (res) => loadData(res.data, file.name),
      error: () => showFileError("❌ خطا در خواندن فایل CSV."),
    });
  } else {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        loadData(json, file.name);
      } catch (err) {
        showFileError("❌ خطا در خواندن فایل اکسل.");
      }
    };
    reader.onerror = () => showFileError("❌ خطا در خواندن فایل.");
    reader.readAsArrayBuffer(file);
  }
}

$("fileInput").addEventListener("change", (e) => {
  handleFile(e.target.files[0]);
  e.target.value = ""; // اجازه انتخاب مجدد همان فایل
});

// پشتیبانی از کشیدن و رها کردن فایل روی ناحیه آپلود
(function setupDragDrop() {
  const dz = document.querySelector('label[for="fileInput"]');
  if (!dz) return;
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("border-[#217346]", "bg-[#217346]/5");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove("border-[#217346]", "bg-[#217346]/5");
    }),
  );
  dz.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files[0];
    handleFile(file);
  });
})();

$("exampleBtn").addEventListener("click", () => {
  $("fileStatus").textContent = "در حال بارگذاری مجموعه‌داده نمونه...";
  // مجموعه‌داده نمونه به‌صورت آفلاین درون assets/sample-data.js جاسازی شده است
  Papa.parse(window.SAMPLE_CSV, {
    header: true, dynamicTyping: true, skipEmptyLines: true,
    complete: (res) => { isExample = true; loadData(res.data, "titanic.csv (نمونه)"); },
    error: () => { $("fileStatus").textContent = "خطا در بارگذاری مجموعه‌داده نمونه."; },
  });
});

function loadData(rows, fname) {
  DATA = rows.filter((r) => Object.keys(r).length > 0);
  COLUMNS = DATA.length ? Object.keys(DATA[0]) : [];
  // استفاده از <bdi> برای ایزوله‌کردن نام فایل و اعداد لاتین در متن راست‌به‌چپ
  $("fileStatus").innerHTML =
    `فایل <bdi>«${fname}»</bdi> بارگذاری شد — ` +
    `<bdi>${DATA.length}</bdi> ردیف، <bdi>${COLUMNS.length}</bdi> ستون`;
  render();
}

// ===== رندر اصلی =====
function render() {
  const c = $("content");
  c.innerHTML = "";
  c.classList.remove("hidden");

  // دیتافریم ورودی
  c.appendChild(alertBox("info", "💡 فایل با موفقیت بارگذاری شد"));
  c.appendChild(el("h2", "text-lg font-bold mb-2", "دیتافریم ورودی"));
  c.appendChild(buildTable(DATA.slice(0, 100), COLUMNS));
  c.appendChild(el("hr", "border-gray-200 dark:border-gray-800 my-5"));

  // تب‌های اصلی
  const tabsNames = ["نمای کلی مجموعه‌داده", "شمارش مقادیر ستون‌ها", "گروه‌بندی: تحلیل داده خود را ساده کنید"];
  const tabBar = el("div", "flex gap-2 flex-wrap mb-4 border-b border-gray-200 dark:border-gray-800 pb-2");
  const panels = el("div");
  const panelEls = [];
  tabsNames.forEach((name, idx) => {
    const btn = el("button", "tab-btn" + (idx === 0 ? " active" : ""), name);
    const panel = el("div", idx === 0 ? "" : "hidden");
    btn.onclick = () => {
      tabBar.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      panelEls.forEach((p) => p.classList.add("hidden"));
      panel.classList.remove("hidden");
    };
    tabBar.appendChild(btn);
    panels.appendChild(panel);
    panelEls.push(panel);
  });
  c.appendChild(tabBar);
  c.appendChild(panels);

  renderOverview(panelEls[0]);
  renderValueCounts(panelEls[1]);
  renderGroupby(panelEls[2]);
}

// ===== تب ۱: نمای کلی =====
function renderOverview(root) {
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

  // خلاصه
  sub[0].appendChild(el("p", "mb-2", `تعداد <b>${DATA.length}</b> سطر و <b>${COLUMNS.length}</b> ستون در مجموعه‌داده وجود دارد`));
  sub[0].appendChild(el("h4", "font-bold mb-2", "خلاصه آماری مجموعه‌داده"));
  sub[0].appendChild(buildDescribe());

  // ستون‌ها
  sub[1].appendChild(el("h4", "font-bold mb-2", "نام ستون‌ها"));
  sub[1].appendChild(buildTable(COLUMNS.map((c, i) => ({ "0": c })), ["0"]));

  // انواع داده
  sub[2].appendChild(el("h4", "font-bold mb-2", "انواع داده ستون‌ها"));
  sub[2].appendChild(buildTable(COLUMNS.map((c) => ({ "ستون": c, "نوع": dtypeOf(c) })), ["ستون", "نوع"]));

  // سطرهای ابتدایی و انتهایی
  buildHeadTail(sub[3]);
}

function buildDescribe() {
  const numCols = COLUMNS.filter(isNumericCol);
  if (!numCols.length) return alertBox("warn", "ستون عددی برای خلاصه آماری وجود ندارد.");
  const stats = ["count", "mean", "std", "min", "25%", "50%", "75%", "max"];
  const rows = stats.map((s) => {
    const row = { "آماره": s };
    numCols.forEach((col) => { row[col] = computeStat(colValues(col, true), s); });
    return row;
  });
  return buildTable(rows, ["آماره", ...numCols]);
}

function computeStat(arr, stat) {
  if (!arr.length) return "";
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  const mean = a.reduce((s, v) => s + v, 0) / n;
  const q = (p) => {
    const idx = (n - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
  };
  const round = (v) => Number(v.toFixed(3));
  switch (stat) {
    case "count": return n;
    case "mean": return round(mean);
    case "std": return n > 1 ? round(Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))) : 0;
    case "min": return round(a[0]);
    case "25%": return round(q(0.25));
    case "50%": return round(q(0.5));
    case "75%": return round(q(0.75));
    case "max": return round(a[n - 1]);
  }
}

function buildHeadTail(root) {
  if (isExample) {
    root.appendChild(alertBox("warn", "در حال حاضر از یک فایل نمونه استفاده می‌کنید. برای بهره‌گیری کامل از این قابلیت، یک فایل واقعی بارگذاری کنید."));
    return;
  }
  const max = DATA.length;
  // ابتدایی
  root.appendChild(el("h4", "font-bold mb-1 mt-2", "سطرهای ابتدایی"));
  const topW = el("div", "widget mb-2");
  topW.innerHTML = `<label>تعداد سطرهای ابتدایی موردنظر: <span id="topVal">5</span></label>
    <input type="range" min="1" max="${max}" value="5" id="topSlider" class="w-full">`;
  root.appendChild(topW);
  const topTbl = el("div"); root.appendChild(topTbl);
  const drawTop = (n) => { topTbl.innerHTML = ""; topTbl.appendChild(buildTable(DATA.slice(0, n), COLUMNS)); };
  topW.querySelector("#topSlider").oninput = (e) => { topW.querySelector("#topVal").textContent = e.target.value; drawTop(+e.target.value); };
  drawTop(5);

  // انتهایی
  root.appendChild(el("h4", "font-bold mb-1 mt-4", "سطرهای انتهایی"));
  const botW = el("div", "widget mb-2");
  botW.innerHTML = `<label>تعداد سطرهای انتهایی موردنظر: <span id="botVal">5</span></label>
    <input type="range" min="1" max="${max}" value="5" id="botSlider" class="w-full">`;
  root.appendChild(botW);
  const botTbl = el("div"); root.appendChild(botTbl);
  const drawBot = (n) => { botTbl.innerHTML = ""; botTbl.appendChild(buildTable(DATA.slice(-n), COLUMNS)); };
  botW.querySelector("#botSlider").oninput = (e) => { botW.querySelector("#botVal").textContent = e.target.value; drawBot(+e.target.value); };
  drawBot(5);
}

// ===== تب ۲: شمارش مقادیر =====
function renderValueCounts(root) {
  root.appendChild(el("h3", "text-base font-bold mb-3", "شمارش مقادیر ستون‌ها"));
  if (isExample) {
    root.appendChild(alertBox("warn", "در حال حاضر از یک فایل نمونه استفاده می‌کنید. برای بهره‌گیری کامل از این قابلیت، یک فایل واقعی بارگذاری کنید."));
    return;
  }
  const det = el("details", "expander");
  det.appendChild(el("summary", null, "شمارش مقادیر"));
  const body = el("div", "py-3 flex flex-col gap-4");

  const grid = el("div", "grid grid-cols-1 sm:grid-cols-2 gap-4");
  const colW = el("div", "widget");
  colW.innerHTML = `<label>نام ستون را انتخاب کنید</label>
    <select id="vcCol">${COLUMNS.map((c) => `<option>${c}</option>`).join("")}</select>`;
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
    colValues(col).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    let arr = Object.entries(counts).map(([k, v]) => ({ [col]: k, count: v }));
    arr.sort((a, b) => b.count - a.count);
    arr = arr.slice(0, topN);
    out.appendChild(buildTable(arr, [col, "count"]));
    out.appendChild(el("h4", "font-bold mt-4 mb-2", "مصورسازی"));
    if (!arr.length) { out.appendChild(alertBox("warn", "داده‌ای برای نمایش در نمودار وجود ندارد.")); return; }
    const x = arr.map((r) => String(r[col])), y = arr.map((r) => r.count);
    const d1 = el("div", "mb-4"); out.appendChild(d1);
    Plotly.newPlot(d1, [{ type: "bar", x, y, text: y, textposition: "auto", marker: { color: "#217346" } }], plLayout("نمودار میله‌ای"), { responsive: true });
    const d2 = el("div", "mb-4"); out.appendChild(d2);
    Plotly.newPlot(d2, [{ type: "scatter", mode: "lines+markers+text", x, y, text: y }], plLayout("نمودار خطی"), { responsive: true });
    const d3 = el("div", "mb-4"); out.appendChild(d3);
    Plotly.newPlot(d3, [{ type: "pie", labels: x, values: y }], plLayout("نمودار دایره‌ای"), { responsive: true });
  };

  det.appendChild(body);
  root.appendChild(det);
}

// ===== تب ۳: گروه‌بندی =====
function renderGroupby(root) {
  root.appendChild(el("h3", "text-base font-bold mb-3", "گروه‌بندی: تحلیل داده خود را ساده کنید"));
  if (isExample) {
    root.appendChild(alertBox("warn", "در حال حاضر از یک فایل نمونه استفاده می‌کنید. برای بهره‌گیری کامل از این قابلیت، یک فایل واقعی بارگذاری کنید."));
    return;
  }
  root.appendChild(el("p", "mb-3 text-gray-500 dark:text-gray-400", "گروه‌بندی به شما امکان می‌دهد داده‌های خود را بر اساس دسته‌ها و گروه‌های خاص خلاصه کنید"));

  const det = el("details", "expander");
  det.appendChild(el("summary", null, "گروه‌بندی ستون‌های شما"));
  const body = el("div", "py-3 flex flex-col gap-4");

  const grid = el("div", "grid grid-cols-1 sm:grid-cols-3 gap-4");
  const gW = el("div", "widget");
  gW.innerHTML = `<label>ستون (ها) را برای گروه‌بندی انتخاب کنید</label>
    <select id="gbCols" multiple size="4">${COLUMNS.map((c) => `<option>${c}</option>`).join("")}</select>`;
  const opColW = el("div", "widget");
  opColW.innerHTML = `<label>ستون را برای عملیات انتخاب کنید</label>
    <select id="gbOpCol">${COLUMNS.map((c) => `<option>${c}</option>`).join("")}</select>`;
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
    const result = groupby(gbCols, opCol, op);
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
      const xcol = gbCols[0];
      const x = result.map((r) => gbCols.map((c) => r[c]).join(" / "));
      const yv = result.map((r) => r.Result);
      if (g === "bar") {
        Plotly.newPlot(chartDiv, [{ type: "bar", x, y: yv, marker: { color: "#217346" } }], plLayout("نمودار میله‌ای"), { responsive: true });
      } else if (g === "line") {
        Plotly.newPlot(chartDiv, [{ type: "scatter", mode: "lines+markers", x, y: yv }], plLayout("نمودار خطی"), { responsive: true });
      } else if (g === "scatter") {
        Plotly.newPlot(chartDiv, [{ type: "scatter", mode: "markers", x, y: yv, marker: { size: 12, color: "#217346" } }], plLayout("نمودار پراکندگی"), { responsive: true });
      } else if (g === "pie") {
        Plotly.newPlot(chartDiv, [{ type: "pie", labels: x, values: yv }], plLayout("نمودار دایره‌ای"), { responsive: true });
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
        Plotly.newPlot(chartDiv, [{ type: "sunburst", labels, parents, values, branchvalues: "total" }], plLayout("نمودار آفتاب‌پرتو"), { responsive: true });
      }
    };
    chartW.querySelector("#gbChart").onchange = draw;
    draw();
  };

  det.appendChild(body);
  root.appendChild(det);
}

function groupby(gbCols, opCol, op) {
  const groups = {};
  for (const r of DATA) {
    const key = gbCols.map((c) => r[c]).join("\u0001");
    if (!groups[key]) groups[key] = { keyVals: gbCols.map((c) => r[c]), vals: [] };
    let v = r[opCol];
    if (op !== "count") { v = Number(v); if (isNaN(v)) continue; }
    groups[key].vals.push(r[opCol]);
  }
  const agg = (vals) => {
    const nums = vals.map(Number).filter((v) => !isNaN(v));
    switch (op) {
      case "count": return vals.length;
      case "sum": return Number(nums.reduce((s, v) => s + v, 0).toFixed(4));
      case "max": return Math.max(...nums);
      case "min": return Math.min(...nums);
      case "mean": return Number((nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(4));
      case "median": {
        const a = [...nums].sort((x, y) => x - y), n = a.length;
        return n % 2 ? a[(n - 1) / 2] : Number(((a[n / 2 - 1] + a[n / 2]) / 2).toFixed(4));
      }
    }
  };
  return Object.values(groups).map((g) => {
    const row = {};
    gbCols.forEach((c, i) => { row[c] = g.keyVals[i]; });
    row.Result = agg(g.vals);
    return row;
  });
}

function plLayout(title) {
  const dark = document.documentElement.classList.contains("dark");
  return {
    title: { text: title, font: { family: "Vazirmatn, Tahoma, sans-serif" } },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: dark ? "#e5e7eb" : "#111827", family: "Vazirmatn, Tahoma, sans-serif" },
    margin: { t: 50, r: 20, b: 60, l: 50 },
  };
}

function applyThemeButton() {
  const dark = document.documentElement.classList.contains("dark");
  const icon = $("themeIcon"), label = $("themeLabel");
  if (icon) icon.textContent = dark ? "☀️" : "🌙";
  // if (label) label.textContent = dark ? "حالت روشن" : "حالت تاریک";
}

function setupThemeToggle() {
  const btn = $("themeToggle");
  if (!btn) return;
  applyThemeButton();
  btn.addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("vizcraft-theme", dark ? "dark" : "light");
    applyThemeButton();
    if (DATA && DATA.length) render();
  });
}

document.addEventListener("DOMContentLoaded", setupThemeToggle);
if (document.readyState !== "loading") setupThemeToggle();
