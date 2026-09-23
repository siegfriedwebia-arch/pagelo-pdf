/* Añadir marca de agua (texto o imagen) a un PDF, con vista previa real de la primera página */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib");
  const status = U.$("#status");
  const btn = U.$("#run");
  const previewBox = U.$("#viewer");
  let file, bytes, view, logo = null, type = "text";

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  function opts() {
    return {
      text: U.$("#wm-text").value || " ",
      size: parseInt(U.$("#wm-size").value, 10),
      color: hexToRgb(U.$("#wm-color").value),
      opacity: parseInt(U.$("#wm-opacity").value, 10) / 100,
      angle: parseInt(U.$("#wm-angle").value, 10),
      layout: U.$("#wm-layout").value,
      scale: parseInt(U.$("#wm-scale").value, 10) / 100
    };
  }

  /** Dibuja la marca en una página de pdf-lib */
  function stamp(page, o, font, img) {
    const box = page.getCropBox ? page.getCropBox() : { x: 0, y: 0, ...page.getSize() };
    const pageRot = page.getRotation().angle || 0;
    const angle = o.angle + pageRot; // compensa las páginas giradas
    const rad = angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    let w, h;
    if (type === "text") { w = font.widthOfTextAtSize(o.text, o.size); h = o.size * 0.72; }
    else { w = Math.min(box.width, box.height) * o.scale; h = w * img.height / img.width; }

    const drawAt = (cx, cy) => {
      // Se gira alrededor del centro de la marca
      const x = cx - (w / 2 * cos - h / 2 * sin);
      const y = cy - (w / 2 * sin + h / 2 * cos);
      if (type === "text") page.drawText(o.text, { x, y, size: o.size, font, color: o.color, opacity: o.opacity, rotate: PDFLib.degrees(angle) });
      else page.drawImage(img, { x, y, width: w, height: h, opacity: o.opacity, rotate: PDFLib.degrees(angle) });
    };

    if (o.layout === "tile") {
      const stepX = Math.max(w, h) * 0.9 + 90, stepY = Math.max(h * 3, 140);
      for (let yy = box.y - stepY; yy < box.y + box.height + stepY; yy += stepY) {
        const row = Math.round((yy - box.y) / stepY);
        for (let xx = box.x - stepX + (row % 2 ? stepX / 2 : 0); xx < box.x + box.width + stepX; xx += stepX) drawAt(xx, yy);
      }
    } else {
      drawAt(box.x + box.width / 2, box.y + box.height / 2);
    }
  }

  async function build(onlyFirst) {
    const src = await P.openEdit(bytes);
    let doc = src;
    if (onlyFirst) {
      doc = await PDFLib.PDFDocument.create();
      const [p] = await doc.copyPages(src, [0]);
      doc.addPage(p);
    }
    const o = opts();
    const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    let img = null;
    if (type === "image") {
      if (!logo) throw new P.FriendlyError("Choose an image for the watermark.");
      img = logo.type === "image/png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
    } else {
      try { font.encodeText(o.text); }
      catch (e) { throw new P.FriendlyError("The text contains unsupported characters (such as emojis). Use regular letters, numbers and symbols."); }
    }
    let targets = doc.getPages().map((_, i) => i);
    if (!onlyFirst && U.$("input[name=which]:checked").value === "some") {
      targets = [];
      P.parseRanges(U.$("#ranges").value, doc.getPageCount()).forEach(([a, b]) => { for (let i = a; i <= b; i++) targets.push(i - 1); });
    }
    const pages = doc.getPages();
    [...new Set(targets)].forEach(i => stamp(pages[i], o, font, img));
    return await doc.save();
  }

  let timer, busy = false, again = false;
  function schedulePreview() {
    clearTimeout(timer);
    timer = setTimeout(preview, 250);
  }
  async function preview() {
    if (!bytes) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const out = await build(true);
      const pv = await pdfjsLib.getDocument({ data: out }).promise;
      const c = await P.render(pv, 1, Math.min(previewBox.parentElement.clientWidth - 4, 560));
      previewBox.innerHTML = "";
      previewBox.appendChild(c);
      status.className = "status";
      status.textContent = "Preview of the first page.";
      btn.disabled = false;
    } catch (e) { P.fail(status, e); btn.disabled = true; }
    busy = false;
    if (again) { again = false; preview(); }
  }

  U.$$("#wm-type button").forEach(b => b.addEventListener("click", () => {
    U.$$("#wm-type button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    type = b.dataset.type;
    U.$("#text-opts").hidden = type !== "text";
    U.$("#image-opts").hidden = type !== "image";
    schedulePreview();
  }));

  U.$("#wm-logo").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    let data = new Uint8Array(await f.arrayBuffer()), t = f.type;
    if (t !== "image/png" && t !== "image/jpeg") {
      // WebP y otros: se pasan a PNG
      const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(f); });
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      data = new Uint8Array(await (await new Promise(r => c.toBlob(r, "image/png"))).arrayBuffer()); t = "image/png";
    }
    logo = { bytes: data, type: t };
    schedulePreview();
  });

  U.$("#wm-form").addEventListener("input", e => {
    U.$$(".out[data-for]").forEach(o => { o.textContent = U.$("#" + o.dataset.for).value + (o.dataset.unit || ""); });
    if (e.target.id !== "wm-logo") schedulePreview();
  });
  U.$$("input[name=which]").forEach(r => r.addEventListener("change", () => {
    U.$("#ranges-field").hidden = U.$("input[name=which]:checked").value !== "some";
  }));

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    try {
      bytes = await P.read(file);
      view = await P.openView(bytes);
      await P.openEdit(bytes);
      U.$("#doc-info").textContent = `${file.name} · ${view.numPages} pages`;
      U.$("#ranges").value = `1-${view.numPages}`;
      P.showWork();
      preview();
    } catch (err) { P.fail(status, err); }
  });

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.textContent = "Applying the watermark…";
    try {
      const out = await build(false);
      P.finish({ title: "Watermark added", detail: U.formatBytes(out.length), blob: P.blob(out), name: U.baseName(file.name) + "-watermarked.pdf" });
    } catch (e) { P.fail(status, e); btn.disabled = false; }
  });
})();
