/* Editar PDF: añadir texto, rectángulos, resaltados, tapar con blanco e imágenes */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib");
  const status = U.$("#status");
  const btn = U.$("#run");
  const viewer = U.$("#viewer");
  const props = U.$("#props");
  let file, bytes, view, current = 1, pageVp = null;
  const items = [];
  let selected = null;

  const pxPerPt = () => viewer.getBoundingClientRect().width / pageVp.width;

  async function showPage(n) {
    current = n;
    const page = await view.getPage(n);
    pageVp = page.getViewport({ scale: 1 });
    const c = await P.render(view, n, Math.min(viewer.parentElement.clientWidth - 4, 800));
    viewer.innerHTML = "";
    viewer.appendChild(c);
    viewer.style.width = c.style.width;
    U.$("#page-label").textContent = `Página ${n} de ${view.numPages}`;
    U.$("#prev").disabled = n <= 1;
    U.$("#next").disabled = n >= view.numPages;
    items.filter(it => it.page === n).forEach(draw);
    select(null);
  }

  /* ---------- Dibujar un elemento sobre la página ---------- */
  function draw(it) {
    const el = it.el || document.createElement("div");
    it.el = el;
    el.className = "placed" + (it.type === "text" ? " text-el" : " box") + (it === selected ? " selected" : "");
    el.innerHTML = "";
    el.style.left = it.fx * 100 + "%";
    el.style.top = it.fy * 100 + "%";
    if (it.type === "text") {
      const k = pxPerPt();
      el.style.fontFamily = "Helvetica, Arial, sans-serif";
      el.style.fontWeight = it.bold ? "700" : "400";
      el.style.fontSize = it.size * k + "px";
      el.style.color = it.color;
      el.style.width = "auto";
      el.style.height = "auto";
      el.style.background = "transparent";
      el.textContent = it.text;
    } else {
      el.style.width = it.fw * 100 + "%";
      el.style.height = it.fh * 100 + "%";
      el.style.border = "";
      el.style.background = "transparent";
      if (it.type === "rect") el.style.boxShadow = `inset 0 0 0 ${Math.max(1, it.stroke * pxPerPt())}px ${it.color}`;
      else el.style.boxShadow = "";
      if (it.type === "highlight") el.style.background = hexA(it.color, 0.35);
      if (it.type === "white") el.style.background = "#fff";
      if (it.type === "image") { const img = document.createElement("img"); img.src = it.src; el.appendChild(img); }
    }
    el.insertAdjacentHTML("beforeend", '<button class="del" type="button" aria-label="Quitar">✕</button>' + (it.type === "text" ? "" : '<button class="size" type="button" aria-label="Cambiar tamaño">⤡</button>'));
    if (!el.parentElement) { viewer.appendChild(el); bind(it); }
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function bind(it) {
    const el = it.el;
    let start = null;
    el.addEventListener("pointerdown", e => {
      if (e.target.classList.contains("del")) return;
      e.preventDefault();
      select(it);
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect(), v = viewer.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, fx: it.fx, fy: it.fy, fw: it.fw || r.width / v.width, fh: it.fh || r.height / v.height, resize: e.target.classList.contains("size") };
    });
    el.addEventListener("pointermove", e => {
      if (!start) return;
      const v = viewer.getBoundingClientRect();
      const dx = (e.clientX - start.x) / v.width, dy = (e.clientY - start.y) / v.height;
      if (start.resize) {
        it.fw = Math.max(0.01, Math.min(1 - it.fx, start.fw + dx));
        it.fh = it.type === "image" ? it.fw * (v.width / v.height) / it.ratio : Math.max(0.005, Math.min(1 - it.fy, start.fh + dy));
      } else {
        it.fx = Math.max(0, Math.min(0.99, start.fx + dx));
        it.fy = Math.max(0, Math.min(0.99, start.fy + dy));
      }
      draw(it);
    });
    ["pointerup", "pointercancel"].forEach(ev => el.addEventListener(ev, () => { start = null; }));
    el.addEventListener("click", e => { if (e.target.classList.contains("del")) remove(it); });
  }

  function remove(it) {
    items.splice(items.indexOf(it), 1);
    it.el.remove();
    if (selected === it) select(null);
    update();
  }

  /* ---------- Panel de propiedades ---------- */
  function select(it) {
    selected = it;
    items.forEach(x => x.el && x.el.classList.toggle("selected", x === it));
    props.hidden = !it;
    if (!it) return;
    U.$("#p-text-wrap").hidden = it.type !== "text";
    U.$("#p-size-wrap").hidden = it.type !== "text";
    U.$("#p-stroke-wrap").hidden = it.type !== "rect";
    U.$("#p-color-wrap").hidden = it.type === "white" || it.type === "image";
    if (it.type === "text") { U.$("#p-text").value = it.text; U.$("#p-size").value = it.size; U.$("#p-bold").checked = !!it.bold; }
    if (it.color) U.$("#p-color").value = it.color;
    if (it.type === "rect") U.$("#p-stroke").value = it.stroke;
  }
  props.addEventListener("input", () => {
    if (!selected) return;
    if (selected.type === "text") {
      selected.text = U.$("#p-text").value || " ";
      selected.size = Math.max(4, parseInt(U.$("#p-size").value, 10) || 12);
      selected.bold = U.$("#p-bold").checked;
    }
    if (selected.type === "rect") selected.stroke = parseFloat(U.$("#p-stroke").value);
    if (selected.color) selected.color = U.$("#p-color").value;
    draw(selected);
  });
  U.$("#p-delete").addEventListener("click", () => selected && remove(selected));
  document.addEventListener("keydown", e => {
    if (!selected || e.target.closest("input, textarea, select")) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(selected); }
  });

  /* ---------- Añadir elementos ---------- */
  function add(it) {
    Object.assign(it, { page: current });
    items.push(it);
    draw(it);
    select(it);
    update();
    if (it.type === "text") { U.$("#p-text").focus(); U.$("#p-text").select(); }
  }
  U.$("#add-text").addEventListener("click", () => add({ type: "text", text: "Escribe aquí", size: 14, color: "#111111", fx: 0.1, fy: 0.1 }));
  U.$("#add-rect").addEventListener("click", () => add({ type: "rect", color: "#d13b2e", stroke: 2, fx: 0.3, fy: 0.3, fw: 0.3, fh: 0.08 }));
  U.$("#add-highlight").addEventListener("click", () => add({ type: "highlight", color: "#ffe14d", fx: 0.2, fy: 0.25, fw: 0.4, fh: 0.025 }));
  U.$("#add-white").addEventListener("click", () => add({ type: "white", fx: 0.2, fy: 0.4, fw: 0.3, fh: 0.03 }));
  U.$("#add-image").addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const s = Math.min(1, 1600 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const ratio = c.width / c.height;
      const v = viewer.getBoundingClientRect();
      const fw = 0.3;
      add({ type: "image", src: c.toDataURL("image/png"), ratio, fx: 0.35, fy: 0.35, fw, fh: fw * (v.width / v.height) / ratio });
      e.target.value = "";
    };
    img.src = URL.createObjectURL(f);
  });

  function update() {
    btn.disabled = !items.length;
    status.className = "status";
    status.textContent = items.length
      ? `${items.length} cambio${items.length > 1 ? "s" : ""}. Toca un elemento para editarlo o moverlo.`
      : "Elige qué quieres añadir.";
  }

  U.$("#prev").addEventListener("click", () => showPage(current - 1));
  U.$("#next").addEventListener("click", () => showPage(current + 1));
  viewer.addEventListener("pointerdown", e => { if (e.target === viewer || e.target.tagName === "CANVAS") select(null); });
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => view && showPage(current), 250); });

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

  /* ---------- Guardar ---------- */
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.textContent = "Guardando…";
    try {
      const doc = await P.openEdit(bytes);
      const pages = doc.getPages();
      const fonts = {
        normal: await doc.embedFont(PDFLib.StandardFonts.Helvetica),
        bold: await doc.embedFont(PDFLib.StandardFonts.HelveticaBold)
      };
      for (const it of items) {
        const pjs = await view.getPage(it.page);
        const vp = pjs.getViewport({ scale: 1 });
        const page = pages[it.page - 1];
        const rot = PDFLib.degrees(pjs.rotate);
        if (it.type === "text") {
          const font = it.bold ? fonts.bold : fonts.normal;
          const lines = it.text.split("\n");
          lines.forEach((line, i) => {
            if (!line) return;
            // Punto de la línea base tal como se ve (0,72 ≈ altura de las mayúsculas de Helvetica)
            const bx = it.fx * vp.width;
            const by = it.fy * vp.height + it.size * (0.8 + i * 1.15);
            const [x, y] = vp.convertToPdfPoint(bx, by);
            try { page.drawText(line, { x, y, size: it.size, font, color: rgb(it.color), rotate: rot }); }
            catch (e) { throw new P.FriendlyError("El texto tiene caracteres no admitidos (por ejemplo, emojis). Usa letras, números y signos habituales."); }
          });
          continue;
        }
        const l = it.fx * vp.width, t = it.fy * vp.height, w = it.fw * vp.width, h = it.fh * vp.height;
        const [x1, y1] = vp.convertToPdfPoint(l, t);
        const [x2, y2] = vp.convertToPdfPoint(l + w, t + h);
        const rect = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
        if (it.type === "rect") page.drawRectangle({ ...rect, borderColor: rgb(it.color), borderWidth: it.stroke });
        if (it.type === "highlight") page.drawRectangle({ ...rect, color: rgb(it.color), opacity: 0.35, blendMode: PDFLib.BlendMode.Multiply });
        if (it.type === "white") page.drawRectangle({ ...rect, color: PDFLib.rgb(1, 1, 1) });
        if (it.type === "image") {
          const img = await doc.embedPng(it.src);
          const [ax, ay] = vp.convertToPdfPoint(l, t + h);
          page.drawImage(img, { x: ax, y: ay, width: w, height: h, rotate: rot });
        }
      }
      const out = await P.save(doc);
      P.finish({ title: "PDF editado", detail: U.formatBytes(out.length), blob: P.blob(out), name: U.baseName(file.name) + "-editado.pdf" });
    } catch (e) { P.fail(status, e); btn.disabled = false; }
  });
})();
