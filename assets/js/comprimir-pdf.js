/* Comprimir PDF.
   - Básica: reorganiza el archivo y quita datos sobrantes. Mantiene texto y enlaces.
   - Recomendada / Extrema: convierte cada página en una imagen JPG optimizada. Reduce mucho los PDF escaneados o con fotos. */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib");
  const status = U.$("#status");
  const btn = U.$("#run");
  const bar = U.$("#bar");
  let file, bytes;

  const LEVELS = {
    recomendada: { dpi: 144, q: 0.72 },
    extrema: { dpi: 96, q: 0.5 }
  };

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    try {
      bytes = await P.read(file);
      const view = await P.openView(bytes);
      U.$("#doc-info").textContent = `${file.name} · ${view.numPages} páginas · ${U.formatBytes(file.size)}`;
      P.showWork();
      const c = await P.render(view, 1, 220);
      U.$("#cover").appendChild(c);
      btn.disabled = false;
    } catch (err) { P.fail(status, err); }
  });

  async function basic() {
    const doc = await P.openEdit(bytes);
    doc.setProducer("PDFGratis");
    doc.setCreator("PDFGratis");
    return await doc.save({ useObjectStreams: true, addDefaultPage: false });
  }

  async function raster(level) {
    const view = await P.openView(bytes);
    const out = await PDFLib.PDFDocument.create();
    for (let i = 1; i <= view.numPages; i++) {
      status.textContent = `Comprimiendo página ${i} de ${view.numPages}…`;
      bar.style.width = Math.round((i / view.numPages) * 100) + "%";
      const { canvas, width, height } = await P.renderAtDpi(view, i, level.dpi);
      const jpg = await new Promise(r => canvas.toBlob(r, "image/jpeg", level.q));
      const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      const page = out.addPage([width, height]);
      page.drawImage(img, { x: 0, y: 0, width, height });
      canvas.width = canvas.height = 0; // libera memoria
    }
    return await out.save({ useObjectStreams: true });
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.className = "status";
    bar.style.width = "0%";
    try {
      const level = U.$("input[name=level]:checked").value;
      const result = level === "basica" ? await basic() : await raster(LEVELS[level]);
      bar.style.width = "100%";
      const smaller = result.length < file.size;
      const name = U.baseName(file.name) + "-comprimido.pdf";
      P.finish({
        title: smaller ? "PDF comprimido" : "Este PDF ya estaba optimizado",
        detail: smaller
          ? P.sizeText(file.size, result.length)
          : `No se ha podido reducir (${U.formatBytes(file.size)}). Prueba con un nivel más alto o descarga el original.`,
        blob: smaller ? P.blob(result) : file,
        name: smaller ? name : file.name
      });
    } catch (e) {
      P.fail(status, e);
      btn.disabled = false;
    }
  });
})();
