/* Unir PDF: ordena varios archivos y los junta en uno */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib");
  const list = U.$("#files");
  const status = U.$("#status");
  const btn = U.$("#run");
  let items = []; // { file, bytes, pages }

  async function add(fileList) {
    const pdfs = [...fileList].filter(P.isPdf); // se copia antes de esperar: el campo se vacía después
    await ready;
    if (!pdfs.length) { status.className = "status error"; status.textContent = "Elige archivos PDF."; return; }
    status.className = "status";
    status.textContent = "Leyendo archivos…";
    for (const file of pdfs) {
      try {
        const bytes = await P.read(file);
        const view = await P.openView(bytes);
        const item = { file, bytes, pages: view.numPages, view };
        items.push(item);
      } catch (e) {
        U.toast(`${file.name}: ${e.message}`);
      }
    }
    P.showWork();
    draw();
  }

  function draw() {
    list.innerHTML = "";
    items.forEach((it, i) => {
      const li = document.createElement("li");
      li.draggable = true;
      li.dataset.i = i;
      li.innerHTML = `
        <span class="handle" aria-hidden="true">⋮⋮</span>
        <div class="mini"></div>
        <div class="meta"><b></b><span>${it.pages} página${it.pages > 1 ? "s" : ""} · ${U.formatBytes(it.file.size)}</span></div>
        <div class="act">
          <button type="button" data-a="up" aria-label="Subir">↑</button>
          <button type="button" data-a="down" aria-label="Bajar">↓</button>
          <button type="button" data-a="del" aria-label="Quitar">✕</button>
        </div>`;
      li.querySelector("b").textContent = it.file.name;
      if (it.thumb) li.querySelector(".mini").appendChild(it.thumb);
      else P.render(it.view, 1, 44).then(c => { it.thumb = c; li.querySelector(".mini").appendChild(c); }).catch(() => {});
      list.appendChild(li);
    });
    const total = items.reduce((s, it) => s + it.pages, 0);
    status.className = "status";
    status.textContent = items.length < 2
      ? "Añade al menos otro PDF para unirlos."
      : `${items.length} archivos · ${total} páginas en total. Ordénalos arrastrando o con las flechas.`;
    btn.disabled = items.length < 2;
  }

  list.addEventListener("click", e => {
    const b = e.target.closest("button[data-a]");
    if (!b) return;
    const i = parseInt(b.closest("li").dataset.i, 10);
    if (b.dataset.a === "del") items.splice(i, 1);
    if (b.dataset.a === "up" && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
    if (b.dataset.a === "down" && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
    draw();
  });

  // Reordenar arrastrando (ordenador)
  let from = null;
  list.addEventListener("dragstart", e => { const li = e.target.closest("li"); from = +li.dataset.i; li.classList.add("dragging"); });
  list.addEventListener("dragend", () => { from = null; draw(); });
  list.addEventListener("dragover", e => {
    e.preventDefault();
    const li = e.target.closest("li");
    if (!li || from === null) return;
    const to = +li.dataset.i;
    if (to === from) return;
    const [m] = items.splice(from, 1);
    items.splice(to, 0, m);
    from = to;
    draw();
    list.children[to].classList.add("dragging");
  });

  U.$("#file").addEventListener("change", e => add(e.target.files));
  U.$("#more").addEventListener("change", e => { add(e.target.files); e.target.value = ""; });

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.className = "status";
    try {
      const out = await PDFLib.PDFDocument.create();
      for (let i = 0; i < items.length; i++) {
        status.textContent = `Uniendo ${i + 1} de ${items.length}…`;
        const src = await P.openEdit(items[i].bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));
      }
      const bytes = await P.save(out);
      P.finish({
        title: "PDF unido",
        detail: `${out.getPageCount()} páginas · ${U.formatBytes(bytes.length)}`,
        blob: P.blob(bytes),
        name: "pdf-unido.pdf"
      });
    } catch (e) {
      P.fail(status, e);
      btn.disabled = false;
    }
  });
})();
