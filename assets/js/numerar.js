/* Numerar páginas de un PDF, con vista previa real */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib");
  const status = U.$("#status");
  const btn = U.$("#run");
  const viewer = U.$("#viewer");
  let file, bytes, total = 0;

  function opts() {
    return {
      pos: U.$("#pos").value,               // bl | bc | br | tl | tc | tr
      fmt: U.$("#fmt").value,               // n | pag | pagde | slash
      start: Math.max(0, parseInt(U.$("#start").value, 10) || 1),
      from: Math.max(1, parseInt(U.$("#from").value, 10) || 1),
      size: parseInt(U.$("#size").value, 10),
      margin: parseInt(U.$("#margin").value, 10),
      color: U.$("#color").value,
      bold: U.$("#bold").checked
    };
  }

  function label(o, n, count) {
    return { n: `${n}`, pag: `Página ${n}`, pagde: `Página ${n} de ${count}`, slash: `${n} / ${count}` }[o.fmt];
  }

  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  /** Coloca el número teniendo en cuenta si la página está girada */
  function stamp(page, text, o, font) {
    const box = page.getCropBox();
    const rot = page.getRotation().angle % 360;
    const w = font.widthOfTextAtSize(text, o.size);
    // Tamaño de la página tal como se ve
    const vw = rot % 180 ? box.height : box.width;
    const vh = rot % 180 ? box.width : box.height;
    const m = o.margin;
    // Posición en la página vista (origen abajo a la izquierda)
    let vx = o.pos[1] === "l" ? m : o.pos[1] === "r" ? vw - m - w : (vw - w) / 2;
    let vy = o.pos[0] === "b" ? m : vh - m - o.size;
    // De coordenadas vistas a coordenadas reales del PDF
    let x, y;
    if (rot === 0) { x = box.x + vx; y = box.y + vy; }
    else if (rot === 90) { x = box.x + box.width - vy; y = box.y + vx; }
    else if (rot === 180) { x = box.x + box.width - vx; y = box.y + box.height - vy; }
    else { x = box.x + vy; y = box.y + box.height - vx; }
    page.drawText(text, { x, y, size: o.size, font, color: hex(o.color), rotate: PDFLib.degrees(rot) });
  }

  async function build(previewOnly) {
    const src = await P.openEdit(bytes);
    let doc = src;
    if (previewOnly) {
      doc = await PDFLib.PDFDocument.create();
      const idx = Math.min(opts().from, src.getPageCount()) - 1;
      const [p] = await doc.copyPages(src, [idx]);
      doc.addPage(p);
    }
    const o = opts();
    const font = await doc.embedFont(o.bold ? PDFLib.StandardFonts.HelveticaBold : PDFLib.StandardFonts.Helvetica);
    const pages = doc.getPages();
    const numbered = total - o.from + 1;
    const count = o.start + numbered - 1;
    pages.forEach((p, i) => {
      const realIndex = previewOnly ? o.from - 1 : i;
      if (realIndex < o.from - 1) return;
      const n = o.start + (realIndex - (o.from - 1));
      stamp(p, label(o, n, count), o, font);
    });
    return await doc.save();
  }

  let timer, busy = false, again = false;
  async function preview() {
    if (!bytes) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const out = await build(true);
      const pv = await pdfjsLib.getDocument({ data: out }).promise;
      const c = await P.render(pv, 1, Math.min(viewer.parentElement.clientWidth - 4, 520));
      viewer.innerHTML = "";
      viewer.appendChild(c);
      status.className = "status";
      status.textContent = `Vista previa de la página ${Math.min(opts().from, total)}.`;
      btn.disabled = false;
    } catch (e) { P.fail(status, e); }
    busy = false;
    if (again) { again = false; preview(); }
  }

  U.$("#num-form").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(preview, 250); });

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    try {
      bytes = await P.read(file);
      const view = await P.openView(bytes);
      total = view.numPages;
      await P.openEdit(bytes);
      U.$("#doc-info").textContent = `${file.name} · ${total} páginas`;
      U.$("#from").max = total;
      P.showWork();
      preview();
    } catch (err) { P.fail(status, err); }
  });

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.textContent = "Numerando…";
    try {
      const out = await build(false);
      P.finish({ title: "Páginas numeradas", detail: U.formatBytes(out.length), blob: P.blob(out), name: U.baseName(file.name) + "-numerado.pdf" });
    } catch (e) { P.fail(status, e); btn.disabled = false; }
  });
})();
