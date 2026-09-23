/* Imágenes (JPG, PNG, WebP…) a PDF, en el orden que elijas */
(function () {
  "use strict";
  const ready = P.uses("pdflib");
  const list = U.$("#files");
  const status = U.$("#status");
  const btn = U.$("#run");
  let items = []; // { file, url }

  const SIZES = { A4: [595.28, 841.89], LETTER: [612, 792] };

  function add(fileList) {
    const imgs = [...fileList].filter(f => f.type.startsWith("image/") || /\.(heic|heif|avif)$/i.test(f.name));
    if (!imgs.length) { status.className = "status error"; status.textContent = "Elige imágenes JPG, PNG o WebP."; return; }
    imgs.forEach(file => items.push({ file, url: URL.createObjectURL(file) }));
    P.showWork();
    draw();
  }

  function draw() {
    list.innerHTML = "";
    items.forEach((it, i) => {
      const li = document.createElement("li");
      li.draggable = true;
      li.dataset.i = i;
      li.innerHTML = `<span class="handle" aria-hidden="true">⋮⋮</span><div class="mini"><img alt=""></div>
        <div class="meta"><b></b><span>${U.formatBytes(it.file.size)}</span></div>
        <div class="act"><button type="button" data-a="up" aria-label="Subir">↑</button><button type="button" data-a="down" aria-label="Bajar">↓</button><button type="button" data-a="del" aria-label="Quitar">✕</button></div>`;
      li.querySelector("img").src = it.url;
      li.querySelector("b").textContent = it.file.name;
      list.appendChild(li);
    });
    status.className = "status";
    status.textContent = items.length ? `${items.length} ${U.pl(items.length, "imagen", "imagenes")}. Cada una será una página.` : "Añade imágenes.";
    btn.disabled = !items.length;
  }

  list.addEventListener("click", e => {
    const b = e.target.closest("button[data-a]");
    if (!b) return;
    const i = +b.closest("li").dataset.i;
    if (b.dataset.a === "del") items.splice(i, 1);
    if (b.dataset.a === "up" && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
    if (b.dataset.a === "down" && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
    draw();
  });
  let from = null;
  list.addEventListener("dragstart", e => { from = +e.target.closest("li").dataset.i; });
  list.addEventListener("dragend", () => { from = null; });
  list.addEventListener("dragover", e => {
    e.preventDefault();
    const li = e.target.closest("li");
    if (!li || from === null || +li.dataset.i === from) return;
    const to = +li.dataset.i;
    const [m] = items.splice(from, 1);
    items.splice(to, 0, m);
    from = to;
    draw();
  });

  U.$("#file").addEventListener("change", e => add(e.target.files));
  U.$("#more").addEventListener("change", e => { add(e.target.files); e.target.value = ""; });

  function loadImg(url) {
    return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
  }

  // Orientación EXIF de un JPG (las fotos del móvil suelen venir giradas y solo el EXIF lo corrige)
  function exifOrientation(b) {
    if (b[0] !== 0xFF || b[1] !== 0xD8) return 1;
    let i = 2;
    while (i < b.length - 10) {
      if (b[i] !== 0xFF) return 1;
      const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (marker === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78) {
        const t = i + 10, le = b[t] === 0x49;
        const r16 = o => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
        const r32 = o => le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
        const ifd = t + r32(t + 4), n = r16(ifd);
        for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (r16(e) === 0x0112) return r16(e + 8); }
        return 1;
      }
      i += 2 + len;
    }
    return 1;
  }

  async function embed(doc, it) {
    const t = it.file.type;
    if (t === "image/jpeg") {
      const bytes = new Uint8Array(await it.file.arrayBuffer());
      if (exifOrientation(bytes) <= 1) return doc.embedJpg(bytes);
    }
    if (t === "image/png") return doc.embedPng(new Uint8Array(await it.file.arrayBuffer()));
    // Fotos HEIC del iPhone
    if (P.isHeic(it.file)) {
      const jpg = await P.heicToJpeg(it.file);
      return doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    }
    // Otros formatos (WebP, GIF…) se pasan a JPG
    const img = await loadImg(it.url);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
    return doc.embedJpg(new Uint8Array(await b.arrayBuffer()));
  }

  btn.addEventListener("click", async () => {
    await ready;
    btn.disabled = true;
    status.className = "status";
    try {
      const size = U.$("#size").value;
      const orient = U.$("#orient").value;
      const margin = parseInt(U.$("#margin").value, 10);
      const doc = await PDFLib.PDFDocument.create();
      for (let i = 0; i < items.length; i++) {
        status.textContent = `Añadiendo imagen ${i + 1} de ${items.length}…`;
        let img;
        try { img = await embed(doc, items[i]); }
        catch (e) { throw new P.FriendlyError(`No se puede leer «${items[i].file.name}» en este navegador.`); }
        let pw, ph;
        if (size === "fit") { pw = img.width * 0.75 + margin * 2; ph = img.height * 0.75 + margin * 2; }
        else {
          [pw, ph] = SIZES[size];
          const landscape = orient === "landscape" || (orient === "auto" && img.width > img.height);
          if (landscape) [pw, ph] = [ph, pw];
        }
        const page = doc.addPage([pw, ph]);
        const scale = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      }
      const bytes = await P.save(doc);
      P.finish({ title: "PDF creado", detail: `${items.length} ${U.pl(items.length, "página", "páginas")} · ${U.formatBytes(bytes.length)}`, blob: P.blob(bytes), name: "imagenes.pdf" });
    } catch (e) {
      P.fail(status, e);
      btn.disabled = false;
    }
  });
})();
