/* Organizar PDF: reordenar, girar, borrar páginas, añadir otros PDF y páginas en blanco */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib");
  const grid = U.$("#pages");
  const status = U.$("#status");
  const btn = U.$("#run");
  const docs = [];   // { name, bytes, view }
  let name = "documento";

  function refresh() {
    const n = grid.children.length;
    U.$$(".pg figcaption", grid).forEach((c, i) => { c.textContent = `Página ${i + 1}`; });
    status.className = "status";
    status.textContent = n ? `${n} ${U.pl(n, "página", "páginas")}. Arrastra con ⠿ para cambiar el orden.` : "No queda ninguna página.";
    btn.disabled = n === 0;
  }

  function card(page) {
    const fig = document.createElement("figure");
    fig.className = "pg org";
    fig._page = page;
    fig.innerHTML = `<div class="thumb"></div><figcaption></figcaption>
      <div class="org-tools">
        <button type="button" class="org-drag" aria-label="Arrastrar para mover">⠿</button>
        <button type="button" data-a="left" aria-label="Mover a la izquierda">‹</button>
        <button type="button" data-a="right" aria-label="Mover a la derecha">›</button>
        <button type="button" data-a="rot" aria-label="Girar">↻</button>
        <button type="button" data-a="del" aria-label="Eliminar">✕</button>
      </div>`;
    const thumb = fig.querySelector(".thumb");
    if (page.blank) thumb.innerHTML = '<span class="hint">En blanco</span>';
    else P.lazy(thumb, docs[page.doc].view, page.index + 1, 110);
    return fig;
  }

  function applyRotation(fig) {
    const r = fig._page.rot;
    const c = fig.querySelector("canvas");
    if (c) c.style.transform = `rotate(${r}deg) scale(${r % 180 ? 0.77 : 1})`;
  }

  async function addFiles(list) {
    const files = [...list].filter(P.isPdf);
    await ready;
    for (const f of files) {
      try {
        const bytes = await P.read(f);
        const view = await P.openView(bytes);
        docs.push({ name: f.name, bytes, view });
        if (docs.length === 1) name = U.baseName(f.name);
        const d = docs.length - 1;
        for (let i = 0; i < view.numPages; i++) grid.appendChild(card({ doc: d, index: i, rot: 0 }));
      } catch (e) { P.fail(status, e); }
    }
    if (docs.length) { P.showWork(); U.$("#doc-info").textContent = docs.map(d => d.name).join(" + "); }
    refresh();
  }

  U.$("#file").addEventListener("change", e => addFiles(e.target.files));
  U.$("#more").addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });

  grid.addEventListener("click", e => {
    const b = e.target.closest("button[data-a]");
    if (!b) return;
    const fig = b.closest("figure");
    const a = b.dataset.a;
    if (a === "del") fig.remove();
    if (a === "rot") { fig._page.rot = (fig._page.rot + 90) % 360; applyRotation(fig); }
    if (a === "left" && fig.previousElementSibling) grid.insertBefore(fig, fig.previousElementSibling);
    if (a === "right" && fig.nextElementSibling) grid.insertBefore(fig.nextElementSibling, fig);
    refresh();
  });

  // Arrastrar con el asa ⠿ (funciona con ratón y con el dedo)
  let dragging = null;
  grid.addEventListener("pointerdown", e => {
    const h = e.target.closest(".org-drag");
    if (!h) return;
    e.preventDefault();
    dragging = h.closest("figure");
    dragging.classList.add("dragging");
    h.setPointerCapture(e.pointerId);
  });
  grid.addEventListener("pointermove", e => {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = el && el.closest(".pg");
    if (!over || over === dragging || over.parentElement !== grid) return;
    const r = over.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    grid.insertBefore(dragging, after ? over.nextSibling : over);
  });
  const stop = () => { if (dragging) { dragging.classList.remove("dragging"); dragging = null; refresh(); } };
  grid.addEventListener("pointerup", stop);
  grid.addEventListener("pointercancel", stop);

  U.$("#blank").addEventListener("click", () => { grid.appendChild(card({ blank: true, rot: 0 })); refresh(); grid.lastChild.scrollIntoView({ block: "nearest" }); });
  U.$("#reverse").addEventListener("click", () => { [...grid.children].reverse().forEach(f => grid.appendChild(f)); refresh(); });

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.textContent = "Guardando…";
    try {
      const out = await PDFLib.PDFDocument.create();
      const loaded = {};
      let lastSize = [595.28, 841.89];
      for (const fig of grid.children) {
        const pg = fig._page;
        let page;
        if (pg.blank) page = out.addPage(lastSize);
        else {
          if (!loaded[pg.doc]) loaded[pg.doc] = await P.openEdit(docs[pg.doc].bytes);
          [page] = await out.copyPages(loaded[pg.doc], [pg.index]);
          out.addPage(page);
          const s = page.getSize();
          lastSize = [s.width, s.height];
        }
        if (pg.rot) page.setRotation(PDFLib.degrees((page.getRotation().angle + pg.rot) % 360));
      }
      const bytes = await P.save(out);
      P.finish({ title: "PDF organizado", detail: `${out.getPageCount()} páginas · ${U.formatBytes(bytes.length)}`, blob: P.blob(bytes), name: `${name}-organizado.pdf` });
    } catch (e) { P.fail(status, e); btn.disabled = false; }
  });
})();
