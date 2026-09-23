/* Tachar datos: cubre zonas con negro y convierte esas páginas en imagen,
   para que el texto de debajo desaparezca de verdad (no solo se tape). */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib");
  const status = U.$("#status");
  const btn = U.$("#run");
  const viewer = U.$("#viewer");
  let file, bytes, view, current = 1;
  const boxes = []; // { page, fx, fy, fw, fh }

  const PATTERNS = {
    dni: /\b\d{8}[\s-]?[A-HJ-NP-TV-Z]\b|\b[XYZ][\s-]?\d{7}[\s-]?[A-HJ-NP-TV-Z]\b/gi,
    iban: /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{4}){4,7}(?:[\s-]?[A-Z0-9]{1,4})?\b/g,
    email: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
    tel: /(?:\+34[\s-]?)?\b[6789]\d{2}[\s-]?\d{2,3}[\s-]?\d{2,3}(?:[\s-]?\d{2})?\b|(?:\+1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    tarjeta: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g
  };

  async function showPage(n) {
    current = n;
    const c = await P.render(view, n, Math.min(viewer.parentElement.clientWidth - 4, 800));
    viewer.innerHTML = "";
    viewer.appendChild(c);
    viewer.style.width = c.style.width;
    U.$("#page-label").textContent = `Página ${n} de ${view.numPages}`;
    U.$("#prev").disabled = n <= 1;
    U.$("#next").disabled = n >= view.numPages;
    boxes.filter(b => b.page === n).forEach(drawBox);
  }

  function drawBox(b) {
    const el = document.createElement("div");
    el.className = "redact";
    el.title = "Quitar";
    Object.assign(el.style, { left: b.fx * 100 + "%", top: b.fy * 100 + "%", width: b.fw * 100 + "%", height: b.fh * 100 + "%" });
    el.addEventListener("pointerdown", e => e.stopPropagation());
    el.addEventListener("click", e => { e.stopPropagation(); boxes.splice(boxes.indexOf(b), 1); el.remove(); update(); });
    viewer.appendChild(el);
  }

  function update() {
    btn.disabled = !boxes.length;
    const pages = new Set(boxes.map(b => b.page)).size;
    status.className = "status";
    status.textContent = boxes.length
      ? `${boxes.length} ${U.pl(boxes.length, "zona", "zonas")} ${U.pl(boxes.length, "tachada", "tachadas")} en ${pages} ${U.pl(pages, "página", "páginas")}. Toca una zona para quitarla.`
      : "Arrastra sobre la página para tachar, o busca datos automáticamente.";
  }

  // Dibujar rectángulos arrastrando sobre la página
  let drawStart = null, ghost = null;
  viewer.addEventListener("pointerdown", e => {
    if (!view) return;
    e.preventDefault();
    const r = viewer.getBoundingClientRect();
    drawStart = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    ghost = document.createElement("div");
    ghost.className = "redact";
    ghost.style.opacity = ".6";
    viewer.appendChild(ghost);
    viewer.setPointerCapture(e.pointerId);
  });
  viewer.addEventListener("pointermove", e => {
    if (!drawStart) return;
    const r = viewer.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    Object.assign(ghost.style, {
      left: Math.min(x, drawStart.x) * 100 + "%", top: Math.min(y, drawStart.y) * 100 + "%",
      width: Math.abs(x - drawStart.x) * 100 + "%", height: Math.abs(y - drawStart.y) * 100 + "%"
    });
    ghost._b = { page: current, fx: Math.min(x, drawStart.x), fy: Math.min(y, drawStart.y), fw: Math.abs(x - drawStart.x), fh: Math.abs(y - drawStart.y) };
  });
  const endDraw = () => {
    if (!drawStart) return;
    const b = ghost && ghost._b;
    ghost && ghost.remove();
    drawStart = null;
    if (b && b.fw > 0.005 && b.fh > 0.004) { boxes.push(b); drawBox(b); update(); }
  };
  viewer.addEventListener("pointerup", endDraw);
  viewer.addEventListener("pointercancel", endDraw);

  /* ---------- Buscar datos en el texto ---------- */
  // Mide el ancho proporcional de un trozo de texto (las letras no miden todas lo mismo)
  const mctx = document.createElement("canvas").getContext("2d");
  function frac(str, from, to, fontFamily) {
    mctx.font = `100px ${fontFamily || "Helvetica, Arial, sans-serif"}`;
    const total = mctx.measureText(str).width || 1;
    return [mctx.measureText(str.slice(0, from)).width / total, mctx.measureText(str.slice(0, to)).width / total];
  }
  async function search(regexes) {
    let found = 0;
    for (let n = 1; n <= view.numPages; n++) {
      const page = await view.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      for (const it of content.items) {
        if (!it.str || !it.str.trim()) continue;
        const [a, b, c, d, e, f] = it.transform;
        const h = Math.hypot(c, d) || 10;
                for (const re of regexes) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(it.str))) {
            if (!m[0].trim()) { re.lastIndex++; continue; }
            // Posición del texto encontrado dentro del fragmento
            const style = content.styles[it.fontName] || {};
            const [f0, f1] = frac(it.str, m.index, m.index + m[0].length, style.fontFamily);
            const pad = h * 0.15;
            const x0 = e + it.width * f0 - pad;
            const x1 = e + it.width * f1 + pad;
            const [vx1, vy1, vx2, vy2] = vp.convertToViewportRectangle([x0, f - h * 0.28, x1, f + h * 0.92]);
            const box = {
              page: n,
              fx: Math.min(vx1, vx2) / vp.width, fy: Math.min(vy1, vy2) / vp.height,
              fw: Math.abs(vx2 - vx1) / vp.width, fh: Math.abs(vy2 - vy1) / vp.height
            };
            const dup = boxes.some(o => o.page === n && Math.abs(o.fx - box.fx) < 0.002 && Math.abs(o.fy - box.fy) < 0.002);
            if (!dup) { boxes.push(box); found++; }
          }
        }
      }
    }
    return found;
  }

  U.$("#find").addEventListener("click", async () => {
    const regexes = U.$$("input[name=pat]:checked").map(i => new RegExp(PATTERNS[i.value].source, PATTERNS[i.value].flags));
    const custom = U.$("#custom").value.trim();
    if (custom) custom.split(",").map(s => s.trim()).filter(Boolean).forEach(w => regexes.push(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")));
    if (!regexes.length) { status.textContent = "Marca qué datos buscar o escribe un texto."; return; }
    status.textContent = "Buscando…";
    const n = await search(regexes);
    await showPage(current);
    update();
    const msg = n ? `Se han tachado ${n} coincidencias. Revisa todas las páginas antes de guardar.` : "No se ha encontrado nada. Si el PDF es escaneado, tacha a mano arrastrando sobre la página.";
    status.textContent = msg + " " + status.textContent;
  });

  U.$("#prev").addEventListener("click", () => showPage(current - 1));
  U.$("#next").addEventListener("click", () => showPage(current + 1));
  U.$("#undo").addEventListener("click", () => { const i = boxes.map(b => b.page).lastIndexOf(current); if (i >= 0) { boxes.splice(i, 1); showPage(current); update(); } });

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    try {
      bytes = await P.read(file);
      view = await P.openView(bytes);
      await P.openEdit(bytes);
      P.showWork();
      await showPage(1);
      update();
    } catch (err) { P.fail(status, err); }
  });

  /* ---------- Guardar: las páginas tachadas pasan a ser imagen ---------- */
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const src = await P.openEdit(bytes);
      const out = await PDFLib.PDFDocument.create();
      const dpi = parseInt(U.$("#dpi").value, 10);
      const all = U.$("#all-pages").checked;
      const redPages = new Set(boxes.map(b => b.page));
      for (let n = 1; n <= view.numPages; n++) {
        status.textContent = `Procesando página ${n} de ${view.numPages}…`;
        if (!all && !redPages.has(n)) {
          const [p] = await out.copyPages(src, [n - 1]);
          out.addPage(p);
          continue;
        }
        const { canvas, width, height } = await P.renderAtDpi(view, n, dpi);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#000";
        boxes.filter(b => b.page === n).forEach(b => ctx.fillRect(b.fx * canvas.width, b.fy * canvas.height, b.fw * canvas.width, b.fh * canvas.height));
        const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.9));
        const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const page = out.addPage([width, height]);
        page.drawImage(img, { x: 0, y: 0, width, height });
        canvas.width = canvas.height = 0;
      }
      // Sin metadatos del documento original (autor, título, programa…)
      out.setTitle(""); out.setAuthor(""); out.setSubject(""); out.setKeywords([]); out.setCreator("PDFGratis"); out.setProducer("PDFGratis");
      const res = await P.save(out);
      P.finish({
        title: "Datos tachados",
        detail: `${U.formatBytes(res.length)} · Las páginas tachadas son ahora imágenes: el texto oculto no se puede recuperar.`,
        blob: P.blob(res),
        name: U.baseName(file.name) + "-tachado.pdf"
      });
    } catch (e) { P.fail(status, e); btn.disabled = false; }
  });
})();
