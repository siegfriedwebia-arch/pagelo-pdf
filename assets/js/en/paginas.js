/* Rotar, eliminar y extraer páginas. El modo se lee de data-mode en #tool. */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib", "zip");
  const mode = U.$("#tool").dataset.mode; // rotar | eliminar | extraer
  const status = U.$("#status");
  const btn = U.$("#run");
  const grid = U.$("#pages");
  const rangeIn = U.$("#ranges");
  let bytes, view, name, figs = [];
  const rot = {};           // rotación extra por página (rotar)
  const picked = new Set(); // páginas marcadas (eliminar / extraer)

  function refresh() {
    status.className = "status";
    if (mode === "rotar") {
      const n = Object.values(rot).filter(v => v % 360).length;
      status.textContent = n ? `${n} ${U.pl(n, "page", "pages")} ${U.pl(n, "rotated", "rotated")}.` : "Tap a page to rotate it or use the buttons to rotate them all.";
      btn.disabled = n === 0;
      return;
    }
    figs.forEach((f, i) => f.classList.toggle(mode === "eliminar" ? "removed" : "selected", picked.has(i + 1)));
    if (rangeIn && document.activeElement !== rangeIn) rangeIn.value = P.compact(picked);
    const n = picked.size;
    if (mode === "eliminar") {
      status.textContent = n ? `Will delete ${n} ${U.pl(n, "page", "pages")}. Remaining: ${view.numPages - n}.` : "Tap the pages you want to delete.";
      btn.disabled = n === 0 || n === view.numPages;
      if (n === view.numPages) { status.className = "status error"; status.textContent = "You can't delete every page."; }
    } else {
      status.textContent = n ? `${n} ${U.pl(n, "page", "pages")} ${U.pl(n, "selected", "selected")}.` : "Tap the pages you want to extract.";
      btn.disabled = n === 0;
    }
  }

  function turn(i, delta) {
    rot[i] = ((rot[i] || 0) + delta + 360) % 360;
    const c = figs[i - 1].querySelector("canvas");
    if (c) c.style.transform = `rotate(${rot[i]}deg) scale(${rot[i] % 180 ? 0.77 : 1})`;
  }

  U.$("#file").addEventListener("change", async e => {
    await ready;
    const f = e.target.files[0];
    if (!f) return;
    try {
      bytes = await P.read(f);
      view = await P.openView(bytes);
      name = U.baseName(f.name);
      U.$("#doc-info").textContent = `${f.name} · ${view.numPages} pages`;
      P.showWork();
      figs = await P.thumbs(view, grid, {
        width: 110,
        badge: mode === "extraer",
        onClick: (fig, i) => {
          if (mode === "rotar") turn(i, 90);
          else picked.has(i) ? picked.delete(i) : picked.add(i);
          refresh();
        }
      });
      refresh();
    } catch (err) { P.fail(status, err); }
  });

  // Botones de «girar todas»
  U.$$("[data-rotate-all]").forEach(b => b.addEventListener("click", () => {
    for (let i = 1; i <= view.numPages; i++) turn(i, parseInt(b.dataset.rotateAll, 10));
    refresh();
  }));

  // Selección escribiendo rangos
  if (rangeIn) rangeIn.addEventListener("input", () => {
    try {
      const set = new Set();
      if (rangeIn.value.trim()) P.parseRanges(rangeIn.value, view.numPages).forEach(([a, b]) => { for (let i = a; i <= b; i++) set.add(i); });
      picked.clear(); set.forEach(i => picked.add(i));
      refresh();
    } catch (e) { status.className = "status error"; status.textContent = e.message; }
  });
  const allBtn = U.$("#select-all");
  if (allBtn) allBtn.addEventListener("click", () => { for (let i = 1; i <= view.numPages; i++) picked.add(i); refresh(); });
  const noneBtn = U.$("#select-none");
  if (noneBtn) noneBtn.addEventListener("click", () => { picked.clear(); refresh(); });

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const doc = await P.openEdit(bytes);
      if (mode === "rotar") {
        doc.getPages().forEach((p, i) => {
          const extra = rot[i + 1] || 0;
          if (extra) p.setRotation(PDFLib.degrees((p.getRotation().angle + extra) % 360));
        });
        const out = await P.save(doc);
        return P.finish({ title: "PDF rotated", detail: U.formatBytes(out.length), blob: P.blob(out), name: `${name}-rotated.pdf` });
      }
      if (mode === "eliminar") {
        [...picked].sort((a, b) => b - a).forEach(i => doc.removePage(i - 1));
        const out = await P.save(doc);
        return P.finish({ title: "Pages deleted", detail: `Remaining: ${doc.getPageCount()} pages · ${U.formatBytes(out.length)}`, blob: P.blob(out), name: `${name}-edited.pdf` });
      }
      // extraer
      const order = [...picked].sort((a, b) => a - b);
      if (U.$("input[name=out]:checked").value === "one") {
        const out = await PDFLib.PDFDocument.create();
        (await out.copyPages(doc, order.map(i => i - 1))).forEach(p => out.addPage(p));
        const b = await P.save(out);
        return P.finish({ title: "Pages extracted", detail: `${order.length} pages · ${U.formatBytes(b.length)}`, blob: P.blob(b), name: `${name}-pages-${P.compact(order).replace(/\s/g, "")}.pdf` });
      }
      const files = [];
      for (const i of order) {
        const out = await PDFLib.PDFDocument.create();
        const [pg] = await out.copyPages(doc, [i - 1]);
        out.addPage(pg);
        files.push({ name: `${name}-page-${i}.pdf`, data: await P.save(out) });
      }
      const zip = await P.zip(files);
      P.finish({ title: "Pages extracted", detail: `${files.length} PDFs in a ZIP · ${U.formatBytes(zip.size)}`, blob: zip, name: `${name}-pages.zip` });
    } catch (e) {
      P.fail(status, e);
      btn.disabled = false;
    }
  });
})();
