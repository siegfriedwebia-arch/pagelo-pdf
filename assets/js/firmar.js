/* Firmar PDF: dibuja, escribe o sube tu firma y colócala donde quieras */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib");
  const status = U.$("#status");
  const btn = U.$("#run");
  const viewer = U.$("#viewer");
  const pageLabel = U.$("#page-label");
  let file, bytes, view, current = 1, pageCanvas = null;
  let signature = null;       // dataURL de la firma actual
  const placements = [];      // { page, fx, fy, fw, fh, src }

  /* ---------------- Crear la firma ---------------- */
  const pad = U.$("#pad");
  const pctx = pad.getContext("2d");
  let drawing = false, last = null, padDirty = false;
  let inkColor = "#0a1f5c";

  function setupPad() {
    const r = pad.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    pad.width = Math.round(r.width * dpr);
    pad.height = Math.round(r.height * dpr);
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.lineCap = "round";
    pctx.lineJoin = "round";
    padDirty = false;
  }
  function padPoint(e) { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  pad.addEventListener("pointerdown", e => { drawing = true; last = padPoint(e); pad.setPointerCapture(e.pointerId); });
  pad.addEventListener("pointermove", e => {
    if (!drawing) return;
    const p = padPoint(e);
    pctx.strokeStyle = inkColor;
    pctx.lineWidth = e.pressure && e.pointerType === "pen" ? 1.5 + e.pressure * 3 : 2.6;
    pctx.beginPath();
    pctx.moveTo(last.x, last.y);
    pctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2);
    pctx.lineTo(p.x, p.y);
    pctx.stroke();
    last = p;
    padDirty = true;
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => pad.addEventListener(ev, () => {
    if (drawing && padDirty) useCanvas(pad);
    drawing = false;
  }));
  U.$("#clear-pad").addEventListener("click", () => { setupPad(); setSignature(null); });

  U.$$("[data-ink]").forEach(b => b.addEventListener("click", () => {
    inkColor = b.dataset.ink;
    U.$$("[data-ink]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    if (U.$("#tab-type").hidden === false) typeSignature();
  }));

  // Pestañas
  U.$$("#sig-tabs button").forEach(b => b.addEventListener("click", () => {
    U.$$("#sig-tabs button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    ["draw", "type", "image"].forEach(t => { U.$("#tab-" + t).hidden = t !== b.dataset.tab; });
    if (b.dataset.tab === "draw") setupPad();
    if (b.dataset.tab === "type") typeSignature();
  }));

  // Firma escrita
  async function typeSignature() {
    const text = U.$("#sig-text").value.trim();
    if (!text) return setSignature(null);
    const font = U.$("#sig-font").value;
    try { await document.fonts.load(`64px "${font}"`); } catch (e) {}
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = `96px "${font}", cursive`;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    c.width = w; c.height = 160;
    ctx.font = `96px "${font}", cursive`;
    ctx.fillStyle = inkColor;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, 80);
    useCanvas(c);
  }
  U.$("#sig-text").addEventListener("input", typeSignature);
  U.$("#sig-font").addEventListener("change", typeSignature);

  // Firma desde imagen
  U.$("#sig-file").addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const max = 1200, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      if (U.$("#remove-white").checked) {
        const d = ctx.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          const light = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
          if (light > 215) d.data[i + 3] = 0;
          else if (light > 170) d.data[i + 3] = Math.round(d.data[i + 3] * (215 - light) / 45);
        }
        ctx.putImageData(d, 0, 0);
      }
      useCanvas(c);
    };
    img.src = URL.createObjectURL(f);
  });

  /** Recorta los bordes transparentes y guarda la firma */
  function useCanvas(src) {
    const ctx = src.getContext("2d");
    const { width: w, height: h } = src;
    const data = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return setSignature(null);
    const pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const out = document.createElement("canvas");
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext("2d").drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    setSignature(out.toDataURL("image/png"), out.width / out.height);
  }

  function setSignature(url, ratio) {
    signature = url ? { url, ratio } : null;
    const prev = U.$("#sig-preview");
    prev.innerHTML = url ? `<img alt="Tu firma" src="${url}">` : '<span class="hint">Aquí verás tu firma</span>';
    U.$("#place").disabled = !url || !view;
  }

  /* ---------------- Visor del PDF ---------------- */
  async function showPage(n) {
    current = n;
    const width = Math.min(viewer.parentElement.clientWidth - 4, 780);
    pageCanvas = await P.render(view, n, width);
    viewer.innerHTML = "";
    viewer.appendChild(pageCanvas);
    viewer.style.width = pageCanvas.style.width;
    pageLabel.textContent = `Página ${n} de ${view.numPages}`;
    U.$("#prev").disabled = n <= 1;
    U.$("#next").disabled = n >= view.numPages;
    placements.filter(p => p.page === n).forEach(addBox);
  }

  function addBox(pl) {
    const box = document.createElement("div");
    box.className = "placed";
    box.innerHTML = `<img alt=""><button class="del" type="button" aria-label="Quitar">✕</button><button class="size" type="button" aria-label="Cambiar tamaño">⤡</button>`;
    box.querySelector("img").src = pl.src;
    const pos = () => {
      box.style.left = pl.fx * 100 + "%"; box.style.top = pl.fy * 100 + "%";
      box.style.width = pl.fw * 100 + "%"; box.style.height = pl.fh * 100 + "%";
    };
    pos();
    box.querySelector(".del").addEventListener("click", e => {
      e.stopPropagation();
      placements.splice(placements.indexOf(pl), 1);
      box.remove();
      update();
    });
    let start = null;
    box.addEventListener("pointerdown", e => {
      if (e.target.classList.contains("del")) return;
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, fx: pl.fx, fy: pl.fy, fw: pl.fw, fh: pl.fh, resize: e.target.classList.contains("size") };
    });
    box.addEventListener("pointermove", e => {
      if (!start) return;
      const r = viewer.getBoundingClientRect();
      const dx = (e.clientX - start.x) / r.width, dy = (e.clientY - start.y) / r.height;
      if (start.resize) {
        const fw = Math.max(0.04, Math.min(1 - pl.fx, start.fw + dx));
        pl.fw = fw;
        pl.fh = fw * (r.width / r.height) / pl.ratio;
      } else {
        pl.fx = Math.max(0, Math.min(1 - pl.fw, start.fx + dx));
        pl.fy = Math.max(0, Math.min(1 - pl.fh, start.fy + dy));
      }
      pos();
    });
    ["pointerup", "pointercancel"].forEach(ev => box.addEventListener(ev, () => { start = null; }));
    viewer.appendChild(box);
  }

  function place(src, ratio, fw) {
    const r = viewer.getBoundingClientRect();
    const fh = fw * (r.width / r.height) / ratio;
    const pl = { page: current, fx: 0.55, fy: Math.min(0.8, 1 - fh - 0.05), fw, fh, src, ratio };
    placements.push(pl);
    addBox(pl);
    update();
  }

  function update() {
    btn.disabled = !placements.length;
    status.className = "status";
    status.textContent = placements.length
      ? `${placements.length} elemento${placements.length > 1 ? "s" : ""} colocado${placements.length > 1 ? "s" : ""}. Arrástralos para moverlos y usa ⤡ para cambiar el tamaño.`
      : "Crea tu firma y pulsa «Colocar en esta página».";
  }

  U.$("#place").addEventListener("click", () => signature && place(signature.url, signature.ratio, 0.3));
  U.$("#add-date").addEventListener("click", () => {
    const c = document.createElement("canvas");
    const text = new Date().toLocaleDateString("es-ES");
    const ctx = c.getContext("2d");
    ctx.font = "48px Helvetica, Arial, sans-serif";
    c.width = Math.ceil(ctx.measureText(text).width) + 10; c.height = 64;
    ctx.font = "48px Helvetica, Arial, sans-serif";
    ctx.fillStyle = "#111";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 5, 34);
    place(c.toDataURL("image/png"), c.width / c.height, 0.16);
  });
  U.$("#prev").addEventListener("click", () => showPage(current - 1));
  U.$("#next").addEventListener("click", () => showPage(current + 1));
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => view && showPage(current), 250); });

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    try {
      bytes = await P.read(file);
      view = await P.openView(bytes);
      await P.openEdit(bytes); // comprueba que se puede editar
      P.showWork();
      setupPad();
      await showPage(1);
      update();
      setSignature(signature && signature.url, signature && signature.ratio);
    } catch (err) { P.fail(status, err); }
  });

  /* ---------------- Guardar ---------------- */
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.textContent = "Firmando…";
    try {
      const doc = await P.openEdit(bytes);
      const pages = doc.getPages();
      const cache = {};
      for (const pl of placements) {
        const img = cache[pl.src] || (cache[pl.src] = await doc.embedPng(pl.src));
        const pjs = await view.getPage(pl.page);
        const vp = pjs.getViewport({ scale: 1 }); // incluye el giro de la página
        const left = pl.fx * vp.width, top = pl.fy * vp.height;
        const w = pl.fw * vp.width, h = pl.fh * vp.height;
        const [x, y] = vp.convertToPdfPoint(left, top + h); // esquina inferior izquierda tal como se ve
        pages[pl.page - 1].drawImage(img, { x, y, width: w, height: h, rotate: PDFLib.degrees(pjs.rotate) });
      }
      const out = await P.save(doc);
      P.finish({ title: "PDF firmado", detail: U.formatBytes(out.length), blob: P.blob(out), name: U.baseName(file.name) + "-firmado.pdf" });
    } catch (e) {
      P.fail(status, e);
      btn.disabled = false;
    }
  });

  setSignature(null);
})();
