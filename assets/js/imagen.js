/* Comprimir, convertir y redimensionar imágenes en el navegador con canvas.
   La página indica el modo con data-mode="comprimir", "convertir" o "redimensionar" en #image-tool. */
(function () {
  "use strict";
  const tool = U.$("#image-tool");
  const mode = tool.dataset.mode;
  const input = U.$("#file");
  const list = U.$("#list");
  const btn = U.$("#process");
  const zipBtn = U.$("#zip");
  const status = U.$("#status");
  const quality = U.$("#quality") || { value: 92, addEventListener() {} };
  const qualityOut = U.$("#quality-out") || {};
  let files = [];
  let outputs = [];
  let format = mode === "convertir" ? "image/jpeg" : "same";

  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

  quality.addEventListener("input", () => { qualityOut.textContent = quality.value + "%"; });

  U.$$("#format button").forEach(b => {
    b.addEventListener("click", () => {
      U.$$("#format button").forEach(x => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      format = b.dataset.format;
      const lossless = format === "image/png";
      U.$("#quality-field").hidden = lossless && mode === "convertir";
      const bg = U.$("#bg-field");
      if (bg) bg.hidden = format !== "image/jpeg";
    });
  });

  input.addEventListener("change", () => {
    files = [...input.files].filter(f => f.type.startsWith("image/") || /\.(heic|heif|avif)$/i.test(f.name));
    outputs = [];
    zipBtn.hidden = true;
    list.innerHTML = "";
    files.forEach((f, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<img alt=""><div class="meta"><b></b><span>${U.formatBytes(f.size)}</span></div>`;
      li.querySelector("b").textContent = f.name;
      const im = li.querySelector("img");
      im.onload = () => { const sp = li.querySelector(".meta span"); if (!sp.dataset.done) sp.textContent += ` · ${im.naturalWidth}×${im.naturalHeight}`; };
      if (isHeic(f)) decodable(f).then(b => { im.src = URL.createObjectURL(b); }).catch(() => {});
      else im.src = URL.createObjectURL(f);
      li.dataset.index = i;
      list.appendChild(li);
    });
    btn.disabled = files.length === 0;
    status.className = "status";
    status.textContent = files.length ? `${files.length} imagen(es) preparadas.` : "Selecciona imágenes.";
  });

  // Redimensionar: por porcentaje o por píxeles
  function targetSize(w, h) {
    if (U.$("input[name=by]:checked").value === "percent") {
      const p = Math.max(1, parseFloat(U.$("#percent").value) || 100) / 100;
      return [Math.max(1, Math.round(w * p)), Math.max(1, Math.round(h * p))];
    }
    const tw = parseInt(U.$("#w").value, 10), th = parseInt(U.$("#h").value, 10);
    const keep = U.$("#keep").checked;
    if (tw && th && !keep) return [tw, th];
    if (tw && th && keep) { const s = Math.min(tw / w, th / h); return [Math.round(w * s), Math.round(h * s)]; }
    if (tw) return [tw, Math.round(h * tw / w)];
    if (th) return [Math.round(w * th / h), th];
    return [w, h];
  }
  const byRadios = U.$$("input[name=by]");
  byRadios.forEach(r => r.addEventListener("change", () => {
    const pct = U.$("input[name=by]:checked").value === "percent";
    U.$("#by-percent").hidden = !pct;
    U.$("#by-pixels").hidden = pct;
  }));
  const pctIn = U.$("#percent");
  if (pctIn) pctIn.addEventListener("input", () => { U.$("#percent-out").textContent = pctIn.value + "%"; });

  const isHeic = f => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

  // Fotos HEIC del iPhone: se convierten primero (la mayoría de navegadores no las abren)
  async function decodable(file) {
    if (!isHeic(file)) return file;
    await U.loadScript("assets/vendor/heic-to.js");
    return await HeicTo({ blob: file, type: "image/png" });
  }

  async function loadImage(file) {
    const src = await decodable(file);
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(src);
    });
  }

  function toBlob(canvas, type, q) {
    return new Promise(res => canvas.toBlob(res, type, q));
  }

  async function processOne(file) {
    const img = await loadImage(file);
    let w = img.naturalWidth, h = img.naturalHeight;
    const maxSel = U.$("#max-width");
    const max = maxSel ? parseInt(maxSel.value, 10) : 0;
    if (max && Math.max(w, h) > max) {
      const s = max / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    if (mode === "redimensionar") [w, h] = targetSize(w, h);
    let type = format === "same" ? file.type : format;
    if (!EXT[type]) type = "image/jpeg"; // GIF, BMP, HEIC… se guardan como JPG
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (type === "image/jpeg") {
      const bg = U.$("#bg");
      ctx.fillStyle = bg ? bg.value : "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const q = parseInt(quality.value, 10) / 100;
    let blob = await toBlob(canvas, type, type === "image/png" ? undefined : q);
    // Safari antiguo no sabe crear WebP: devuelve PNG
    if (blob.type !== type) type = blob.type;
    let keptOriginal = false;
    if (mode === "comprimir" && blob.size >= file.size && type === file.type && w === img.naturalWidth && h === img.naturalHeight) {
      blob = file;
      keptOriginal = true;
    }
    return { blob, name: `${U.baseName(file.name)}${{ comprimir: "-min", redimensionar: `-${w}x${h}`, convertir: "" }[mode]}.${EXT[type] || "jpg"}`, w, h, keptOriginal };
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    outputs = [];
    let before = 0, after = 0;
    status.className = "status";
    for (let i = 0; i < files.length; i++) {
      const li = list.children[i];
      const span = li.querySelector(".meta span");
      status.textContent = `Procesando ${i + 1} de ${files.length}…`;
      try {
        const out = await processOne(files[i]);
        outputs.push(out);
        before += files[i].size;
        after += out.blob.size;
        const pct = Math.round((1 - out.blob.size / files[i].size) * 100);
        span.dataset.done = "1";
        span.innerHTML = `${U.formatBytes(files[i].size)} → <strong>${U.formatBytes(out.blob.size)}</strong> ` +
          (pct > 0 ? `<strong class="good">(−${pct}%)</strong>` : "") +
          ` · ${out.w}×${out.h}` + (out.keptOriginal ? " · ya estaba optimizada" : "");
        let dl = li.querySelector("a");
        if (!dl) {
          dl = document.createElement("a");
          dl.className = "btn small";
          dl.textContent = "Descargar";
          li.appendChild(dl);
        }
        dl.href = URL.createObjectURL(out.blob);
        dl.download = out.name;
      } catch (e) {
        span.textContent = "No se puede leer este formato en tu navegador.";
      }
    }
    const pct = before ? Math.round((1 - after / before) * 100) : 0;
    status.textContent = mode === "comprimir"
      ? `Hecho. Total: ${U.formatBytes(before)} → ${U.formatBytes(after)}${pct > 0 ? ` (−${pct}%)` : ""}.`
      : `Hecho. ${outputs.length} imagen(es) ${mode === "convertir" ? "convertidas" : "redimensionadas"}.`;
    zipBtn.hidden = outputs.length < 2;
    btn.disabled = false;
  });

  zipBtn.addEventListener("click", async () => {
    zipBtn.disabled = true;
    await U.loadScript("assets/vendor/jszip.min.js");
    const zip = new JSZip();
    const used = new Set();
    outputs.forEach(o => {
      let name = o.name, n = 1;
      while (used.has(name)) name = o.name.replace(/(\.[^.]+)$/, `-${n++}$1`);
      used.add(name);
      zip.file(name, o.blob);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    U.download(blob, `imagenes-${{ comprimir: "comprimidas", convertir: "convertidas", redimensionar: "redimensionadas" }[mode]}.zip`);
    zipBtn.disabled = false;
  });
})();
