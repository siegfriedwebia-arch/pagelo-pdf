/* PDFGratis — utilidades PDF compartidas.
   Usa pdf-lib (editar) y pdf.js (ver y dibujar páginas). Todo ocurre en el navegador. */
(function () {
  "use strict";
  class FriendlyError extends Error {}

  // Librerías pesadas: se descargan en segundo plano después de mostrar la página
  const V = U.root + "assets/vendor/";
  const LIBS = {
    pdfjs: [V + "pdf.min.js"],
    pdflib: [V + "pdf-lib.min.js"],
    zip: [V + "jszip.min.js"],
    docx: [V + "docx.min.js"],
    mammoth: [V + "mammoth.browser.min.js"],
    pdfmake: [V + "pdfmake.min.js", V + "vfs_fonts.js", V + "html-to-pdfmake.min.js"],
    pdfmakeOnly: [V + "pdfmake.min.js", V + "vfs_fonts.js"],
    xlsx: [V + "xlsx.full.min.js"],
    heic: [V + "heic-to.js"],
    tesseract: [V + "tesseract/tesseract.min.js"]
  };

  // Cola compartida para dibujar miniaturas solo cuando se ven
  const lazyQueue = [];
  let lazyBusy = false;
  async function lazyPump() {
    if (lazyBusy) return;
    lazyBusy = true;
    while (lazyQueue.length) {
      const job = lazyQueue.shift();
      try { job.el.appendChild(await P.render(job.pdf, job.page, job.width)); } catch (e) {}
    }
    lazyBusy = false;
  }
  const lazyIO = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting && en.target._job) { lazyIO.unobserve(en.target); lazyQueue.push(en.target._job); en.target._job = null; }
    });
    lazyPump();
  }, { rootMargin: "400px" }) : null;

  async function need(names) {
    for (const n of names) for (const src of LIBS[n]) await U.loadScript(src);
    if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = V + "pdf.worker.min.js";
  }

  const P = {
    FriendlyError,

    /** Pide las librerías que usa la herramienta. Empiezan a bajarse cuando el navegador está libre. */
    uses(...names) {
      let start;
      const kick = new Promise(r => { start = r; });
      const go = () => start();
      // Se empiezan a descargar en cuanto la persona toca la página (por ejemplo, al pulsar «Elegir PDF»),
      // así no gastan datos ni procesador si solo está leyendo.
      ["pointerdown", "keydown", "dragenter", "change"].forEach(ev => document.addEventListener(ev, go, { once: true, capture: true, passive: true }));
      const ready = kick.then(() => need(names));
      ready.catch(() => {
        const up = document.getElementById("upload-error");
        const msg = "The tool couldn't be loaded. Check your connection and reload the page.";
        if (up) { up.textContent = msg; up.hidden = false; } else U.toast(msg);
      });
      return ready;
    },

    async read(file) {
      return new Uint8Array(await file.arrayBuffer());
    },

    isPdf(file) {
      return file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    },

    /** Abre un PDF para dibujarlo con pdf.js (se pasa una copia porque pdf.js se queda con el buffer) */
    async openView(bytes, password) {
      try {
        return await pdfjsLib.getDocument({ data: bytes.slice(0), password, isEvalSupported: false }).promise;
      } catch (e) {
        if (e && e.name === "PasswordException") {
          throw new FriendlyError("This PDF is password-protected. Remove the password first with the “Unlock PDF” tool.");
        }
        throw new FriendlyError("The file couldn't be opened. Make sure it's a valid PDF and isn't damaged.");
      }
    },

    /** Abre un PDF para editarlo con pdf-lib. Los PDF con restricciones pero sin contraseña de apertura se abren igual. */
    async openEdit(bytes, password) {
      try {
        return await PDFLib.PDFDocument.load(bytes, password !== undefined ? { password } : undefined);
      } catch (e) {
        if (e && /encrypted/i.test(e.message) && password === undefined) {
          try { return await PDFLib.PDFDocument.load(bytes, { password: "" }); } catch (e2) {}
          throw new FriendlyError("This PDF is password-protected. Remove the password first with the “Unlock PDF” tool.");
        }
        if (e && /password/i.test(e.message)) throw new FriendlyError("The password is incorrect.");
        throw new FriendlyError("The PDF couldn't be read. It may be damaged.");
      }
    },

    async save(doc) {
      return await doc.save({ useObjectStreams: true });
    },

    blob(bytes, type = "application/pdf") {
      return new Blob([bytes], { type });
    },

    /** Dibuja una página en un canvas del ancho indicado (en píxeles CSS) */
    async render(pdf, pageNumber, width, extraRotation = 0) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1, rotation: (page.rotate + extraRotation) % 360 });
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * ratio, rotation: (page.rotate + extraRotation) % 360 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = width + "px";
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      return canvas;
    },

    /** Dibuja una página a una resolución concreta (ppp) para exportar */
    async renderAtDpi(pdf, pageNumber, dpi) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const size = page.getViewport({ scale: 1 });
      page.cleanup();
      return { canvas, width: size.width, height: size.height };
    },

    /** Dibuja la página en el elemento cuando este aparece en pantalla */
    lazy(el, pdf, page, width = 110) {
      el._job = { el, pdf, page, width };
      if (lazyIO) lazyIO.observe(el); else { lazyQueue.push(el._job); lazyPump(); }
    },

    /** Convierte un HEIC/HEIF (fotos de iPhone) en un Blob JPG usando heic-to */
    async heicToJpeg(file, quality = 0.92) {
      await need(["heic"]);
      return await HeicTo({ blob: file, type: "image/jpeg", quality });
    },

    isHeic(file) {
      return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    },

    need(...names) { return need(names); },

    /** Crea la cuadrícula de miniaturas. Devuelve los elementos <figure> en orden. */
    async thumbs(pdf, container, { onClick, width = 110, badge = false } = {}) {
      container.innerHTML = "";
      const figs = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const fig = document.createElement("figure");
        fig.className = "pg";
        fig.tabIndex = 0;
        fig.dataset.page = i;
        fig.setAttribute("role", "button");
        fig.innerHTML = `<div class="thumb"></div><figcaption>Page ${i}</figcaption>${badge ? '<span class="badge">✓</span>' : ""}`;
        if (onClick) {
          fig.addEventListener("click", e => onClick(fig, i, e));
          fig.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(fig, i, e); } });
        }
        container.appendChild(fig);
        figs.push(fig);
      }
      // Solo se dibujan las miniaturas que están (o van a estar) en pantalla, de una en una
      const queue = [];
      let busy = false;
      const pump = async () => {
        if (busy) return;
        busy = true;
        while (queue.length) {
          const fig = queue.shift();
          try { fig.querySelector(".thumb").appendChild(await P.render(pdf, +fig.dataset.page, width)); } catch (e) {}
        }
        busy = false;
      };
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(entries => {
          entries.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); queue.push(en.target); } });
          pump();
        }, { rootMargin: "400px" });
        figs.forEach(f => io.observe(f));
      } else {
        queue.push(...figs);
        pump();
      }
      return figs;
    },

    /** "1-3, 5, 8-" → [[1,3],[5,5],[8,max]] */
    parseRanges(text, max) {
      const out = [];
      const parts = String(text).replace(/\s/g, "").split(/[,;]/).filter(Boolean);
      for (const p of parts) {
        const m = p.match(/^(\d*)-(\d*)$|^(\d+)$/);
        if (!m) throw new FriendlyError(`I don't understand “${p}”. Use numbers and hyphens, for example: 1-3, 5, 8-10`);
        let a, b;
        if (m[3]) { a = b = parseInt(m[3], 10); }
        else { a = m[1] ? parseInt(m[1], 10) : 1; b = m[2] ? parseInt(m[2], 10) : max; }
        if (a < 1 || b > max || a > b) throw new FriendlyError(`The range “${p}” isn't valid: the document has ${max} pages.`);
        out.push([a, b]);
      }
      if (!out.length) throw new FriendlyError("Enter at least one page or range.");
      return out;
    },

    /** Lista de páginas → texto compacto "1-3, 5" */
    compact(pages) {
      const s = [...pages].sort((a, b) => a - b);
      const out = [];
      for (let i = 0; i < s.length; i++) {
        let j = i;
        while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
        out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
        i = j;
      }
      return out.join(", ");
    },

    async zip(files) {
      const zip = new JSZip();
      files.forEach(f => zip.file(f.name, f.data));
      return await zip.generateAsync({ type: "blob" });
    },

    /** Muestra el panel final con botón de descarga */
    finish({ title, detail = "", blob, name, extra = "" }) {
      U.$$("[data-step]").forEach(el => { el.hidden = el.dataset.step !== "done"; });
      const st = U.$("#status");
      if (st) { st.textContent = ""; st.className = "status"; }
      const done = U.$("#done");
      done.hidden = false;
      const url = URL.createObjectURL(blob);
      done.innerHTML = `
        <div class="panel done">
          <h2></h2>
          <p class="sizes">${detail}</p>
          <div class="btns">
            <a class="btn" id="done-dl" href="${url}">Download</a>
            <button class="btn ghost" type="button" id="done-again">Start over</button>
          </div>
          ${extra}
        </div>`;
      done.querySelector("h2").textContent = title;
      done.querySelector("#done-dl").download = name;
      done.querySelector("#done-dl").textContent = "Download " + (name.endsWith(".zip") ? "ZIP" : name.split(".").pop().toUpperCase());
      done.querySelector("#done-again").addEventListener("click", () => location.reload());
      done.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    /** Muestra un error en el elemento de estado */
    fail(statusEl, e) {
      console.error(e);
      const msg = e instanceof FriendlyError ? e.message : "Something went wrong while processing the file. Try another browser or a different PDF.";
      statusEl.className = "status error";
      statusEl.textContent = msg;
      // Si el error ocurre al subir el archivo, se muestra bajo la zona de subida
      const up = U.$("#upload-error");
      if (up && statusEl.closest("[hidden]")) { up.textContent = msg; up.hidden = false; }
      const input = U.$("#file");
      if (input && statusEl.closest("[hidden]")) input.value = "";
    },

    /** Pasa de la zona de subida al espacio de trabajo */
    showWork() {
      U.$$("[data-step]").forEach(el => { el.hidden = el.dataset.step !== "work"; });
    },

    sizeText(before, after) {
      const pct = Math.round((1 - after / before) * 100);
      return `${U.formatBytes(before)} → ${U.formatBytes(after)}` + (pct > 0 ? ` · <b>−${pct}%</b>` : "");
    }
  };

  window.P = P;
})();
