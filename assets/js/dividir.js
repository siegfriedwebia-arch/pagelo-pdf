/* Dividir PDF: por rangos, cada N páginas o una página por archivo */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib", "zip");
  const status = U.$("#status");
  const btn = U.$("#run");
  const rangesIn = U.$("#ranges");
  const everyIn = U.$("#every");
  let bytes, view, name, total;

  const mode = () => U.$("input[name=mode]:checked").value;

  function plan() {
    if (mode() === "each") return Array.from({ length: total }, (_, i) => [i + 1, i + 1]);
    if (mode() === "every") {
      const n = Math.max(1, parseInt(everyIn.value, 10) || 1);
      const out = [];
      for (let a = 1; a <= total; a += n) out.push([a, Math.min(total, a + n - 1)]);
      return out;
    }
    return P.parseRanges(rangesIn.value, total);
  }

  function preview() {
    U.$("#ranges-field").hidden = mode() !== "ranges";
    U.$("#every-field").hidden = mode() !== "every";
    status.className = "status";
    try {
      const p = plan();
      status.textContent = `Se crearán ${p.length} archivo${p.length > 1 ? "s" : ""}: ` +
        p.slice(0, 6).map(([a, b]) => a === b ? `pág. ${a}` : `págs. ${a}-${b}`).join(" · ") + (p.length > 6 ? " …" : "");
      btn.disabled = false;
    } catch (e) {
      status.className = "status error";
      status.textContent = e.message;
      btn.disabled = true;
    }
  }

  U.$("#file").addEventListener("change", async e => {
    await ready;
    const f = e.target.files[0];
    if (!f) return;
    try {
      bytes = await P.read(f);
      view = await P.openView(bytes);
      name = U.baseName(f.name);
      total = view.numPages;
      U.$("#doc-info").textContent = `${f.name} · ${total} páginas`;
      rangesIn.value = total > 1 ? `1-${Math.ceil(total / 2)}, ${Math.ceil(total / 2) + 1}-${total}` : "1";
      P.showWork();
      P.thumbs(view, U.$("#pages"), { width: 100 });
      preview();
    } catch (err) { P.fail(status, err); }
  });

  U.$$("input[name=mode]").forEach(r => r.addEventListener("change", preview));
  rangesIn.addEventListener("input", preview);
  everyIn.addEventListener("input", preview);

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const parts = plan();
      const src = await P.openEdit(bytes);
      const files = [];
      for (let i = 0; i < parts.length; i++) {
        status.textContent = `Creando archivo ${i + 1} de ${parts.length}…`;
        const [a, b] = parts[i];
        const out = await PDFLib.PDFDocument.create();
        const idx = Array.from({ length: b - a + 1 }, (_, k) => a - 1 + k);
        (await out.copyPages(src, idx)).forEach(p => out.addPage(p));
        files.push({ name: `${name}-${a === b ? a : a + "-" + b}.pdf`, data: await P.save(out) });
      }
      if (files.length === 1) {
        P.finish({ title: "PDF dividido", detail: U.formatBytes(files[0].data.length), blob: P.blob(files[0].data), name: files[0].name });
      } else {
        status.textContent = "Creando el ZIP…";
        const zip = await P.zip(files);
        P.finish({ title: "PDF dividido", detail: `${files.length} archivos PDF en un ZIP · ${U.formatBytes(zip.size)}`, blob: zip, name: `${name}-dividido.zip` });
      }
    } catch (e) {
      P.fail(status, e);
      btn.disabled = false;
    }
  });
})();
