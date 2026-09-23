/* Escanear con el móvil: fotos → recorte con perspectiva → mejora tipo escáner → PDF */
(function () {
  "use strict";
  const ready = P.uses("pdflib");
  const status = U.$("#status");
  const btn = U.$("#run");
  const wrap = U.$("#crop");
  const srcCanvas = U.$("#src");
  const outCanvas = U.$("#result");
  const shotsBox = U.$("#shots");
  const shots = [];
  let cur = -1;

  /* ---------- Fotos ---------- */
  async function loadImage(file) {
    let blob = file;
    if (P.isHeic(file)) blob = await P.heicToJpeg(file);
    const url = URL.createObjectURL(blob);
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    // Se trabaja a un máximo de 2400 px para que vaya rápido en el móvil
    const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return c;
  }

  /** Busca el papel (zona clara más grande) y devuelve sus 4 esquinas, o null si no está claro */
  function detectCorners(canvas) {
    const k = 320 / Math.max(canvas.width, canvas.height);
    const w = Math.max(8, Math.round(canvas.width * k)), h = Math.max(8, Math.round(canvas.height * k));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(canvas, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Uint8Array(w * h);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < w * h; i++) { const v = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; g[i] = v; hist[v]++; }
    // Umbral de Otsu
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = w * h - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; }
    }
    // Zona clara conectada más grande
    const label = new Int32Array(w * h).fill(-1);
    let bestId = -1, bestSize = 0, id = 0;
    const stack = [];
    for (let i = 0; i < w * h; i++) {
      if (g[i] <= thr || label[i] !== -1) continue;
      let size = 0;
      stack.push(i); label[i] = id;
      while (stack.length) {
        const p = stack.pop(); size++;
        const x = p % w, y = (p / w) | 0;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of nb) if (q >= 0 && label[q] === -1 && g[q] > thr) { label[q] = id; stack.push(q); }
      }
      if (size > bestSize) { bestSize = size; bestId = id; }
      id++;
    }
    if (bestSize < w * h * 0.15 || bestSize > w * h * 0.97) return null;
    let tl = [0, 0, Infinity], tr = [0, 0, -Infinity], br = [0, 0, -Infinity], bl = [0, 0, Infinity];
    for (let i = 0; i < w * h; i++) {
      if (label[i] !== bestId) continue;
      const x = i % w, y = (i / w) | 0;
      if (x + y < tl[2]) tl = [x, y, x + y];
      if (x + y > br[2]) br = [x, y, x + y];
      if (x - y > tr[2]) tr = [x, y, x - y];
      if (x - y < bl[2]) bl = [x, y, x - y];
    }
    return [tl, tr, br, bl].map(([x, y]) => [x / (w - 1), y / (h - 1)]);
  }

  async function addFiles(list) {
    const files = [...list];
    status.className = "status";
    status.textContent = "Cargando fotos…";
    for (const f of files) {
      try {
        const canvas = await loadImage(f);
        const i = 0.04;
        const corners = detectCorners(canvas) || [[i, i], [1 - i, i], [1 - i, 1 - i], [i, 1 - i]];
        shots.push({ canvas, corners, filter: "doc", rot: 0 });
      } catch (e) { U.toast(`No se puede leer ${f.name}`); }
    }
    if (!shots.length) { P.fail(status, new P.FriendlyError("No se ha podido leer ninguna foto.")); return; }
    P.showWork();
    drawShots();
    select(shots.length - files.length >= 0 ? shots.length - files.length : 0);
    update();
  }

  function drawShots() {
    shotsBox.innerHTML = "";
    shots.forEach((s, i) => {
      const d = document.createElement("div");
      d.className = "shot" + (i === cur ? " active" : "");
      const t = document.createElement("canvas");
      const k = 100 / s.canvas.height;
      t.width = Math.round(s.canvas.width * k); t.height = 100;
      t.getContext("2d").drawImage(s.canvas, 0, 0, t.width, t.height);
      const img = document.createElement("img");
      img.src = t.toDataURL("image/jpeg", 0.6);
      img.alt = `Página ${i + 1}`;
      d.appendChild(img);
      d.insertAdjacentHTML("beforeend", `Pág. ${i + 1}`);
      d.addEventListener("click", () => select(i));
      shotsBox.appendChild(d);
    });
  }

  function select(i) {
    cur = i;
    U.$$(".shot", shotsBox).forEach((d, k) => d.classList.toggle("active", k === i));
    const s = shots[i];
    if (!s) return;
    const maxW = Math.min(wrap.parentElement.clientWidth - 4, 560);
    const k = Math.min(maxW / s.canvas.width, 520 / s.canvas.height);
    srcCanvas.width = Math.round(s.canvas.width * k);
    srcCanvas.height = Math.round(s.canvas.height * k);
    srcCanvas.getContext("2d").drawImage(s.canvas, 0, 0, srcCanvas.width, srcCanvas.height);
    U.$$("#filter button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === s.filter)));
    placeCorners();
    preview();
  }

  /* ---------- Esquinas ---------- */
  const handles = [0, 1, 2, 3].map(k => {
    const h = document.createElement("div");
    h.className = "corner";
    h.setAttribute("aria-label", "Esquina " + (k + 1));
    wrap.appendChild(h);
    let drag = false;
    h.addEventListener("pointerdown", e => { e.preventDefault(); drag = true; h.setPointerCapture(e.pointerId); });
    h.addEventListener("pointermove", e => {
      if (!drag || cur < 0) return;
      const r = srcCanvas.getBoundingClientRect();
      shots[cur].corners[k] = [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
      placeCorners();
    });
    ["pointerup", "pointercancel"].forEach(ev => h.addEventListener(ev, () => { if (drag) { drag = false; preview(); } }));
    return h;
  });

  function placeCorners() {
    const s = shots[cur];
    s.corners.forEach(([x, y], k) => { handles[k].style.left = x * 100 + "%"; handles[k].style.top = y * 100 + "%"; });
    U.$("#quad").setAttribute("points", s.corners.map(([x, y]) => `${x * 100},${y * 100}`).join(" "));
  }

  U.$("#reset-corners").addEventListener("click", () => { shots[cur].corners = [[0, 0], [1, 0], [1, 1], [0, 1]]; placeCorners(); preview(); });
  U.$("#detect").addEventListener("click", () => {
    const c = detectCorners(shots[cur].canvas);
    if (c) { shots[cur].corners = c; placeCorners(); preview(); }
    else U.toast("No se distingue el papel. Ajusta las esquinas a mano.");
  });

  /* ---------- Corrección de perspectiva ---------- */
  function solve(A, b) {
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let max = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[max][i])) max = r;
      [A[i], A[max]] = [A[max], A[i]]; [b[i], b[max]] = [b[max], b[i]];
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
      x[i] = s / A[i][i];
    }
    return x;
  }

  /** Homografía que lleva el rectángulo de salida (W×H) al cuadrilátero de la foto */
  function homography(W, H, q) {
    const dst = [[0, 0], [W, 0], [W, H], [0, H]];
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = dst[i], [u, v] = q[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    return solve(A, b);
  }

  function warp(s, maxSide) {
    const src = s.canvas;
    const q = s.corners.map(([x, y]) => [x * src.width, y * src.height]);
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let W = Math.max(d(q[0], q[1]), d(q[3], q[2]));
    let H = Math.max(d(q[0], q[3]), d(q[1], q[2]));
    const k = Math.min(1, maxSide / Math.max(W, H));
    W = Math.max(10, Math.round(W * k)); H = Math.max(10, Math.round(H * k));
    const h = homography(W, H, q);
    const sd = src.getContext("2d").getImageData(0, 0, src.width, src.height);
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const octx = out.getContext("2d");
    const od = octx.createImageData(W, H);
    const S = sd.data, O = od.data, sw = src.width, sh = src.height;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const den = h[6] * x + h[7] * y + 1;
        const u = (h[0] * x + h[1] * y + h[2]) / den;
        const v = (h[3] * x + h[4] * y + h[5]) / den;
        const x0 = Math.floor(u), y0 = Math.floor(v);
        const o = (y * W + x) * 4;
        if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) { O[o] = O[o + 1] = O[o + 2] = 255; O[o + 3] = 255; continue; }
        const fx = u - x0, fy = v - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        for (let c = 0; c < 3; c++) {
          O[o + c] = (S[i00 + c] * (1 - fx) + S[i10 + c] * fx) * (1 - fy) + (S[i01 + c] * (1 - fx) + S[i11 + c] * fx) * fy;
        }
        O[o + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  /* ---------- Filtros ---------- */
  function applyFilter(c, filter) {
    if (filter === "color") return c;
    const ctx = c.getContext("2d");
    const { width: w, height: h } = c;
    const d = ctx.getImageData(0, 0, w, h);
    const D = d.data;
    let bg = null;
    if (filter === "doc" || filter === "bn") {
      // Fondo aproximado (iluminación): imagen muy reducida y ampliada de nuevo
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(w / 24)); small.height = Math.max(1, Math.round(h / 24));
      const sctx = small.getContext("2d");
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(c, 0, 0, small.width, small.height);
      const big = document.createElement("canvas");
      big.width = w; big.height = h;
      const bctx = big.getContext("2d");
      bctx.imageSmoothingQuality = "high";
      bctx.drawImage(small, 0, 0, w, h);
      bg = bctx.getImageData(0, 0, w, h).data;
    }
    for (let i = 0; i < D.length; i += 4) {
      let g = 0.299 * D[i] + 0.587 * D[i + 1] + 0.114 * D[i + 2];
      if (bg) {
        const b = Math.max(40, 0.299 * bg[i] + 0.587 * bg[i + 1] + 0.114 * bg[i + 2]);
        g = Math.min(255, (g / b) * 255);          // quita sombras y fondo gris
        g = Math.max(0, Math.min(255, (g - 70) * 1.35)); // más contraste
        if (filter === "bn") g = g > 175 ? 255 : 0;
      }
      D[i] = D[i + 1] = D[i + 2] = g;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }

  function rotate(c, deg) {
    if (!deg) return c;
    const r = document.createElement("canvas");
    const swap = deg % 180 !== 0;
    r.width = swap ? c.height : c.width; r.height = swap ? c.width : c.height;
    const ctx = r.getContext("2d");
    ctx.translate(r.width / 2, r.height / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.drawImage(c, -c.width / 2, -c.height / 2);
    return r;
  }

  function process(s, maxSide) {
    return rotate(applyFilter(warp(s, maxSide), s.filter), s.rot);
  }

  let pt;
  function preview() {
    clearTimeout(pt);
    pt = setTimeout(() => {
      const s = shots[cur];
      if (!s) return;
      const c = process(s, 700);
      outCanvas.width = c.width; outCanvas.height = c.height;
      outCanvas.getContext("2d").drawImage(c, 0, 0);
    }, 60);
  }

  U.$$("#filter button").forEach(b => b.addEventListener("click", () => { shots[cur].filter = b.dataset.f; select(cur); }));
  U.$("#rotate").addEventListener("click", () => { shots[cur].rot = (shots[cur].rot + 90) % 360; preview(); });
  U.$("#remove").addEventListener("click", () => {
    shots.splice(cur, 1);
    if (!shots.length) return location.reload();
    drawShots(); select(Math.min(cur, shots.length - 1)); update();
  });
  U.$("#apply-all").addEventListener("click", () => { shots.forEach(s => { s.filter = shots[cur].filter; }); U.toast("Filtro aplicado a todas las páginas"); });

  function update() {
    btn.disabled = !shots.length;
    status.className = "status";
    status.textContent = `${shots.length} ${U.pl(shots.length, "página", "páginas")}. Ajusta las esquinas al borde del papel.`;
  }

  U.$("#file").addEventListener("change", e => addFiles(e.target.files));
  U.$("#more").addEventListener("change", e => { const f = [...e.target.files]; e.target.value = ""; addFiles(f); });

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await ready;
      const doc = await PDFLib.PDFDocument.create();
      const A4 = [595.28, 841.89];
      const size = U.$("#size").value;
      for (let i = 0; i < shots.length; i++) {
        status.textContent = `Creando página ${i + 1} de ${shots.length}…`;
        await U.sleep(20);
        const c = process(shots[i], 2000);
        const blob = await new Promise(r => c.toBlob(r, "image/jpeg", shots[i].filter === "color" ? 0.85 : 0.8));
        const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        let pw, ph;
        if (size === "fit") { pw = c.width * 0.36; ph = c.height * 0.36; } // ~200 ppp
        else { [pw, ph] = c.width > c.height ? [A4[1], A4[0]] : A4; }
        const page = doc.addPage([pw, ph]);
        const k = Math.min(pw / img.width, ph / img.height);
        page.drawImage(img, { x: (pw - img.width * k) / 2, y: (ph - img.height * k) / 2, width: img.width * k, height: img.height * k });
      }
      const out = await P.save(doc);
      P.finish({ title: "Documento escaneado", detail: `${shots.length} ${U.pl(shots.length, "página", "páginas")} · ${U.formatBytes(out.length)}`, blob: P.blob(out), name: "escaneo.pdf" });
    } catch (e) { P.fail(status, e); btn.disabled = false; }
  });
})();
