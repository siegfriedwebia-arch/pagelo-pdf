/* Excel (.xlsx, .xls, .ods, .csv) a PDF: cada hoja se convierte en una tabla */
(function () {
  "use strict";
  const ready = P.uses("xlsx", "pdfmakeOnly");
  const status = U.$("#status");
  const btn = U.$("#run");
  const sheetsBox = U.$("#sheets");
  const previewBox = U.$("#preview");
  let file, wb;

  /** Datos de una hoja como filas de texto, sin filas ni columnas vacías */
  function sheetRows(name) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false });
    let maxCol = 0;
    rows.forEach(r => r.forEach((v, i) => { if (String(v).trim() !== "") maxCol = Math.max(maxCol, i + 1); }));
    const used = rows.map(r => Array.from({ length: maxCol }, (_, i) => (r[i] === undefined ? "" : String(r[i]))))
      .filter(r => r.some(v => v.trim() !== ""));
    // Quita columnas vacías del principio
    let first = 0;
    while (first < maxCol && used.every(r => !r[first].trim())) first++;
    return used.map(r => r.slice(first));
  }

  /** Anchos de columna: automáticos si caben; si no, se reparten para que la tabla quepa en la página */
  function fitWidths(rows, cols, fontSize, avail) {
    const est = Array.from({ length: cols }, (_, c) => {
      const len = Math.max(...rows.map(r => Math.min(40, String(r[c]).length)), 2);
      return len * fontSize * 0.52 + 7;
    });
    const total = est.reduce((a, b) => a + b, 0) + cols * 1;
    if (total <= avail) return Array(cols).fill("auto");
    const k = (avail - cols * 7) / total;
    return est.map(w => Math.max(14, w * k));
  }

  function renderPreview() {
    const name = U.$$("input[name=sheet]:checked").map(i => i.value)[0];
    if (!name) { previewBox.innerHTML = '<p class="hint">Choose at least one sheet.</p>'; return; }
    const rows = sheetRows(name).slice(0, 30);
    const t = document.createElement("table");
    t.style.cssText = "border-collapse:collapse;font-size:.85rem;background:#fff;color:#111";
    rows.forEach((r, i) => {
      const tr = t.insertRow();
      r.forEach(v => { const td = tr.insertCell(); td.textContent = v; td.style.cssText = `border:1px solid #ccc;padding:3px 6px;white-space:nowrap;${i === 0 ? "font-weight:700;background:#f1f3f6" : ""}`; });
    });
    previewBox.innerHTML = `<p class="hint">Preview of “${name}” (first rows):</p>`;
    previewBox.appendChild(t);
  }

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    try {
      wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true, dense: false });
      sheetsBox.innerHTML = "";
      wb.SheetNames.forEach((n, i) => {
        const rows = sheetRows(n).length;
        const l = document.createElement("label");
        l.className = "check";
        l.innerHTML = `<input type="checkbox" name="sheet" ${rows ? "checked" : ""} ${rows ? "" : "disabled"}> <span></span>`;
        l.querySelector("input").value = n;
        l.querySelector("span").textContent = `${n} (${rows} rows)`;
        sheetsBox.appendChild(l);
      });
      if (!U.$$("input[name=sheet]:checked").length) throw new P.FriendlyError("The file has no data.");
      U.$("#doc-info").textContent = file.name;
      P.showWork();
      renderPreview();
      btn.disabled = false;
    } catch (err) {
      P.fail(status, err instanceof P.FriendlyError ? err : new P.FriendlyError("The file couldn't be read. Make sure it's a spreadsheet (.xlsx, .xls, .ods or .csv) and isn't password-protected."));
    }
  });
  sheetsBox.addEventListener("change", renderPreview);

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.className = "status";
    status.textContent = "Creating the PDF…";
    await U.sleep(30);
    try {
      const names = U.$$("input[name=sheet]:checked").map(i => i.value);
      if (!names.length) throw new P.FriendlyError("Choose at least one sheet.");
      const orientSel = U.$("#orient").value;
      const header = U.$("#header").checked;
      const content = [];
      const all = names.map(n => sheetRows(n));
      const landscapeNeeded = all.some(r => r.length && r[0].length > 7);
      const orientation = orientSel === "auto" ? (landscapeNeeded ? "landscape" : "portrait") : orientSel;
      const [pw, ph] = U.$("#size").value === "LETTER" ? [612, 792] : [595.28, 841.89];
      const avail = (orientation === "landscape" ? ph : pw) - 56;
      names.forEach((name, si) => {
        const rows = all[si];
        if (!rows.length) return;
        const cols = rows[0].length;
        const fontSize = cols > 16 ? 6 : cols > 11 ? 7 : cols > 7 ? 8 : 9.5;
        if (names.length > 1) content.push({ text: name, style: "sheet", pageBreak: si > 0 ? "before" : undefined });
        else if (si > 0) content.push({ text: "", pageBreak: "before" });
        content.push({
          table: {
            headerRows: header ? 1 : 0,
            widths: fitWidths(rows, cols, fontSize, avail),
            dontBreakRows: true,
            body: rows.map((r, ri) => r.map(v => ({ text: v, bold: header && ri === 0, fillColor: header && ri === 0 ? "#eef1f5" : undefined, alignment: /^-?[\d.,]+\s?[%€$]?$/.test(v.trim()) ? "right" : "left" })))
          },
          layout: { hLineColor: () => "#c9ced8", vLineColor: () => "#c9ced8", hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2 },
          fontSize
        });
      });
      const def = {
        pageSize: U.$("#size").value,
        pageOrientation: orientation,
        pageMargins: [28, 32, 28, 32],
        content,
        styles: { sheet: { fontSize: 13, bold: true, margin: [0, 0, 0, 8] } },
        defaultStyle: { fontSize: 9 },
        footer: (p, n) => ({ text: `${p} / ${n}`, alignment: "center", fontSize: 7, color: "#888", margin: [0, 8, 0, 0] }),
        info: { title: U.baseName(file.name), producer: "PDFGratis" }
      };
      const blob = await new Promise((resolve, reject) => { try { pdfMake.createPdf(def).getBlob(resolve); } catch (e) { reject(e); } });
      P.finish({ title: "PDF ready", detail: `${names.length} ${U.pl(names.length, "sheet", "sheets")} · ${U.formatBytes(blob.size)}`, blob, name: U.baseName(file.name) + ".pdf" });
    } catch (e) { P.fail(status, e); btn.disabled = false; }
  });
})();
