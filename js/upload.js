/*
 * upload.js — Phase 1 feature: CSV/Excel upload, drag-and-drop and the sample
 * dataset. Parsing is preserved from the original app; on success it hands rows
 * to App.state and asks the dashboard to render.
 */
window.App = window.App || {};

(function (App) {
  "use strict";
  const { $, iconHTML } = App.dom;
  const S = App.state;

  const ALLOWED_EXT = ["csv", "xlsx", "xls"];

  function getExt(name) {
    const parts = String(name).toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
  }

  function showFileError(text) {
    App.ui.hideLoading();
    App.dashboard.clear();
    $("fileStatus").innerHTML =
      `<span class="text-red-600 dark:text-red-400 font-semibold inline-flex items-center gap-1">${iconHTML("error", "text-base")}<span>${text}</span></span>`;
    App.ui.toast("error", text, 5000);
  }

  // Derive the column set as the union of keys across a sample of rows, so
  // ragged rows (some keys missing on row 0) don't drop columns.
  function deriveColumns(rows) {
    const seen = [];
    const set = new Set();
    const sample = rows.slice(0, 200);
    for (const r of sample) {
      for (const k of Object.keys(r)) {
        if (!set.has(k)) { set.add(k); seen.push(k); }
      }
    }
    return seen;
  }

  // Validate parsed output. Returns a Persian error string, or null if OK.
  function validate(rows, columns) {
    if (!rows.length) return "فایل خالی است یا هیچ ردیف معتبری ندارد.";
    if (!columns.length) return "هیچ ستونی در فایل تشخیص داده نشد. ممکن است فایل سرستون (header) نداشته باشد.";
    // All cells blank across the whole (sampled) dataset?
    const sample = rows.slice(0, 200);
    const anyValue = sample.some((r) => columns.some((c) => {
      const v = r[c];
      return v !== null && v !== undefined && v !== "";
    }));
    if (!anyValue) return "تمام مقادیر فایل خالی هستند.";
    return null;
  }

  // Normalise parsed rows → validate → store + render.
  // meta: { size, type, uploadedAt } from the source File (absent for sample).
  function loadData(rows, fname, isExample, meta = {}) {
    // try/finally guarantees the loading overlay is cleared on EVERY exit path —
    // success, validation failure (early return), or an exception thrown by
    // App.dashboard.render(). Without this, a render() throw would skip the hide
    // and leave the overlay stuck over a half-rendered page.
    try {
      const clean = (rows || []).filter((r) => r && Object.keys(r).length > 0);
      const columns = clean.length ? deriveColumns(clean) : [];

      const err = validate(clean, columns);
      if (err) { showFileError(err); return; }

      S.setData(clean, columns, {
        isExample,
        fileName: fname,
        fileSize: meta.size,
        fileType: meta.type,
        uploadedAt: meta.uploadedAt || Date.now(),
      });
      $("fileStatus").innerHTML =
        `فایل <bdi>«${fname}»</bdi> بارگذاری شد — ` +
        `<bdi>${clean.length.toLocaleString("en-US")}</bdi> ردیف، <bdi>${columns.length}</bdi> ستون`;
      App.dashboard.render();
      App.ui.toast("ok", "فایل با موفقیت بارگذاری شد");
    } finally {
      App.ui.hideLoading();
    }
  }

  function handleFile(file) {
    if (!file) return;
    const ext = getExt(file.name);
    if (!ALLOWED_EXT.includes(ext)) {
      showFileError(`فرمت فایل پشتیبانی نمی‌شود. تنها فرمت‌های ${ALLOWED_EXT.join("، ")} مجاز هستند.`);
      return;
    }
    $("fileStatus").textContent = "در حال خواندن فایل...";
    App.ui.showLoading("در حال خواندن و پردازش فایل...");
    const meta = { size: file.size, type: file.type || ext, uploadedAt: Date.now() };

    if (ext === "csv") {
      Papa.parse(file, {
        header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: (res) => {
          // PapaParse may "complete" with rows yet still report fatal errors.
          if ((!res.data || !res.data.length) && res.errors && res.errors.length) {
            showFileError("خطا در خواندن فایل CSV: " + (res.errors[0].message || "ساختار نامعتبر"));
            return;
          }
          loadData(res.data, file.name, false, meta);
        },
        error: () => showFileError("خطا در خواندن فایل CSV. ممکن است فایل خراب باشد."),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
          if (!wb.SheetNames.length) { showFileError("فایل اکسل هیچ برگه‌ای (sheet) ندارد."); return; }
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
          loadData(json, file.name, false, meta);
        } catch (err) {
          showFileError("خطا در خواندن فایل اکسل. ممکن است فایل خراب یا نامعتبر باشد.");
        }
      };
      reader.onerror = () => showFileError("خطا در خواندن فایل.");
      reader.readAsArrayBuffer(file);
    }
  }

  function loadSample() {
    $("fileStatus").textContent = "در حال بارگذاری مجموعه‌داده نمونه...";
    App.ui.showLoading("در حال بارگذاری مجموعه‌داده نمونه...");
    // SAMPLE_CSV is an in-memory string, so PapaParse parses it SYNCHRONOUSLY and
    // returns the result directly — no async callback. We read that return value
    // so any parse failure throws into the catch below (instead of being lost in
    // an async error callback), and finally always clears the overlay.
    try {
      if (!window.SAMPLE_CSV) {
        throw new Error("SAMPLE_CSV یافت نشد — assets/sample-data.js بارگذاری نشده است.");
      }
      const res = Papa.parse(window.SAMPLE_CSV, {
        header: true, dynamicTyping: true, skipEmptyLines: true,
      });
      if ((!res.data || !res.data.length) && res.errors && res.errors.length) {
        throw new Error(res.errors[0].message || "ساختار CSV نمونه نامعتبر است.");
      }
      loadData(res.data, "titanic.csv (نمونه)", true);
    } catch (error) {
      // Surface the real error for debugging, reset UI, notify the user.
      console.error("بارگذاری مجموعه‌داده نمونه ناموفق بود:", error);
      App.dashboard.clear();
      $("fileStatus").textContent = "خطا در بارگذاری مجموعه‌داده نمونه.";
      App.ui.toast("error", "بارگذاری مجموعه‌داده نمونه با خطا مواجه شد.");
    } finally {
      App.ui.hideLoading();
    }
  }

  function setup() {
    const input = $("fileInput");
    if (input) {
      input.addEventListener("change", (e) => {
        handleFile(e.target.files[0]);
        e.target.value = "";
      });
    }

    const exampleBtn = $("exampleBtn");
    if (exampleBtn) exampleBtn.addEventListener("click", loadSample);

    // Drag & drop on the upload label.
    const dz = document.querySelector('label[for="fileInput"]');
    if (dz) {
      // Keyboard activation: the file input is visually hidden, so Enter/Space on
      // the focused dropzone opens the picker (mouse already works via <label>).
      dz.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (input) input.click();
        }
      });
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
    }
  }

  App.upload = { setup, handleFile, loadSample, loadData };
})(window.App);
