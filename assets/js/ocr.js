/* OCR: reconoce el texto de PDF escaneados o fotos (Tesseract, en el navegador).
   Resultado: PDF con texto seleccionable y buscable (se mantiene el aspecto original) y/o texto plano. */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib", "tesseract");
  const status = U.$("#status");
  const btn = U.$("#run");
  const bar = U.$("#bar");
  let file, bytes, view, images = null, pageCount = 0;

  const abs = p => new URL(p, location.href).href;

  U.$("#file").addEventListener("change", async e => {
    await ready;
    const list = [...e.target.files];
    if (!list.length) return;
    try {
      file = list[0];
      const cover = U.$("#cover");
      cover.innerHTML = "";
      if (P.isPdf(file)) {
        bytes = await P.read(file);
        view = await P.openView(bytes);
        pageCount = view.numPages;
        images = null;
        cover.appendChild(await P.render(view, 1, 220));
        // Aviso si el PDF ya tiene texto
        const t = await (await view.getPage(1)).getTextContent();
        U.$("#has-text").hidden = !t.items.some(i => i.str.trim().length > 2);
      } else {
        images = [];
        for (const f of list) images.push(P.isHeic(f) ? await P.heicToJpeg(f) : f);
        pageCount = images.length;
        const img = new Image();
        img.src = URL.createObjectURL(images[0]);
        img.style.maxWidth = "220px";
        cover.appendChild(img);
      }
      U.$("#doc-info").textContent = `${list.length > 1 ? list.length + " imágenes" : file.name} · ${pageCount} ${U.pl(pageCount, "página", "páginas")}`;
      P.showWork();
      btn.disabled = false;
    } catch (err) { P.fail(status, err); }
  });

  /** Imagen (canvas) de cada página para reconocer */
  async function pageImage(i) {
    if (images) {
      const url = URL.createObjectURL(images[i]);
      const img = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = url; });
      const c = document.createElement("canvas");
      const s = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      return { canvas: c, dpi: 200 };
    }
    const { canvas } = await P.renderAtDpi(view, i + 1, 250);
    return { canvas, dpi: 250 };
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.className = "status";
    bar.style.width = "0%";
    const wantPdf = U.$("#out-pdf").checked;
    const wantTxt = U.$("#out-txt").checked;
    if (!wantPdf && !wantTxt) { status.textContent = "Elige al menos un resultado."; btn.disabled = false; return; }
    let worker;
    let pageNow = 0;
    try {
      status.textContent = "Preparando el reconocimiento (la primera vez descarga unos 5 MB)…";
      worker = await Tesseract.createWorker(U.$("#ocr-lang").value, 1, {
        workerPath: abs(U.root + "assets/vendor/tesseract/worker.min.js"),
        corePath: abs(U.root + "assets/vendor/tesseract/core/"),
        langPath: abs(U.root + "assets/vendor/tesseract/lang"),
        gzip: true,
        logger: m => {
          if (m.status === "recognizing text") {
            const pct = ((pageNow + m.progress) / pageCount) * 100;
            bar.style.width = pct.toFixed(1) + "%";
          }
        }
      });
      await worker.setParameters({ preserve_interword_spaces: "1" });

      const texts = [];
      let out = null, src = null;
      if (wantPdf) {
        out = await PDFLib.PDFDocument.create();
        if (!images) src = await P.openEdit(bytes);
      }
      for (let i = 0; i < pageCount; i++) {
        pageNow = i;
        status.textContent = `Leyendo página ${i + 1} de ${pageCount}…`;
        const { canvas, dpi } = await pageImage(i);
        await worker.setParameters({ user_defined_dpi: String(dpi) });
        const { data } = await worker.recognize(canvas, { pdfTitle: "PDFGratis OCR", pdfTextOnly: true }, { text: true, pdf: wantPdf });
        texts.push(data.text.trim());

        if (wantPdf) {
          const layerDoc = await PDFLib.PDFDocument.load(new Uint8Array(data.pdf));
          const [layer] = await out.embedPdf(layerDoc, [0]);
          if (images) {
            // Página nueva con la foto y el texto invisible encima
            const jpg = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
            const img = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
            const w = canvas.width * 72 / dpi, h = canvas.height * 72 / dpi;
            const page = out.addPage([w, h]);
            page.drawImage(img, { x: 0, y: 0, width: w, height: h });
            page.drawPage(layer, { x: 0, y: 0, width: w, height: h });
          } else {
            // Página original intacta + capa de texto invisible
            const [page] = await out.copyPages(src, [i]);
            out.addPage(page);
            const pjs = await view.getPage(i + 1);
            const vp = pjs.getViewport({ scale: 1 });
            const [x, y] = vp.convertToPdfPoint(0, vp.height);
            page.drawPage(layer, { x, y, width: vp.width, height: vp.height, rotate: PDFLib.degrees(pjs.rotate) });
          }
        }
        canvas.width = canvas.height = 0;
      }
      await worker.terminate();
      worker = null;
      bar.style.width = "100%";

      const fullText = texts.map((t, i) => (pageCount > 1 ? `--- Página ${i + 1} ---\n` : "") + t).join("\n\n");
      const base = U.baseName(file.name);
      const words = fullText.split(/\s+/).filter(w => w.length > 1).length;
      if (!words) throw new P.FriendlyError("No se ha reconocido texto. Comprueba que la imagen se ve nítida y derecha.");

      const txtBlob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
      let extra = "";
      if (wantTxt) {
        extra = `<div style="text-align:left;margin-top:1.5rem">
          <label class="label" for="ocr-text">Texto reconocido</label>
          <textarea id="ocr-text" class="ocr-text" readonly></textarea>
          <div class="btns" style="margin-top:.6rem"><button class="btn ghost" type="button" id="copy-text">Copiar texto</button>${wantPdf ? '<a class="btn ghost" id="dl-txt">Descargar TXT</a>' : ""}</div>
        </div>`;
      }
      if (wantPdf) {
        const pdfBytes = await P.save(out);
        P.finish({ title: "Texto reconocido", detail: `${words} palabras · PDF con texto seleccionable y buscable · ${U.formatBytes(pdfBytes.length)}`, blob: P.blob(pdfBytes), name: base + "-ocr.pdf", extra });
      } else {
        P.finish({ title: "Texto reconocido", detail: `${words} palabras`, blob: txtBlob, name: base + ".txt", extra });
      }
      if (wantTxt) {
        U.$("#ocr-text").value = fullText;
        U.$("#copy-text").addEventListener("click", () => U.copy(fullText, "Texto copiado"));
        const dl = U.$("#dl-txt");
        if (dl) { dl.href = URL.createObjectURL(txtBlob); dl.download = base + ".txt"; }
      }
    } catch (e) {
      if (worker) worker.terminate();
      P.fail(status, e);
      btn.disabled = false;
    }
  });
})();
