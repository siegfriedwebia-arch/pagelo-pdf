/* PDFGratis — utilidades PDF compartidas.
   Usa pdf-lib (editar) y pdf.js (ver y dibujar páginas). Todo ocurre en el navegador. */
(function () {
  "use strict";
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "assets/vendor/pdf.worker.min.js";
  const PDFDocument = window.PDFLib && PDFLib.PDFDocument;

  class FriendlyError extends Error {}

  const P = {
    FriendlyError,

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
          throw new FriendlyError("Este PDF tiene contraseña. Quítala primero con la herramienta «Desbloquear PDF».");
        }
        throw new FriendlyError("No se ha podido abrir el archivo. Comprueba que es un PDF válido y no está dañado.");
      }
    },

    /** Abre un PDF para editarlo con pdf-lib. Los PDF con restricciones pero sin contraseña de apertura se abren igual. */
    async openEdit(bytes, password) {
      try {
        return await PDFDocument.load(bytes, password !== undefined ? { password } : undefined);
      } catch (e) {
        if (e && /encrypted/i.test(e.message) && password === undefined) {
          try { return await PDFDocument.load(bytes, { password: "" }); } catch (e2) {}
          throw new FriendlyError("Este PDF tiene contraseña. Quítala primero con la herramienta «Desbloquear PDF».");
        }
        if (e && /password/i.test(e.message)) throw new FriendlyError("La contraseña no es correcta.");
        throw new FriendlyError("No se ha podido leer el PDF. Puede que esté dañado.");
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
        fig.innerHTML = `<div class="thumb"></div><figcaption>Página ${i}</figcaption>${badge ? '<span class="badge">✓</span>' : ""}`;
        if (onClick) {
          fig.addEventListener("click", e => onClick(fig, i, e));
          fig.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(fig, i, e); } });
        }
        container.appendChild(fig);
        figs.push(fig);
      }
      // Se dibujan de una en una para no bloquear el navegador con PDF largos
      (async () => {
        for (let i = 0; i < figs.length; i++) {
          try {
            const c = await P.render(pdf, i + 1, width);
            figs[i].querySelector(".thumb").appendChild(c);
          } catch (e) {}
        }
      })();
      return figs;
    },

    /** "1-3, 5, 8-" → [[1,3],[5,5],[8,max]] */
    parseRanges(text, max) {
      const out = [];
      const parts = String(text).replace(/\s/g, "").split(/[,;]/).filter(Boolean);
      for (const p of parts) {
        const m = p.match(/^(\d*)-(\d*)$|^(\d+)$/);
        if (!m) throw new FriendlyError(`No entiendo «${p}». Usa números y guiones, por ejemplo: 1-3, 5, 8-10`);
        let a, b;
        if (m[3]) { a = b = parseInt(m[3], 10); }
        else { a = m[1] ? parseInt(m[1], 10) : 1; b = m[2] ? parseInt(m[2], 10) : max; }
        if (a < 1 || b > max || a > b) throw new FriendlyError(`El rango «${p}» no es válido: el documento tiene ${max} páginas.`);
        out.push([a, b]);
      }
      if (!out.length) throw new FriendlyError("Escribe al menos una página o un rango.");
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
            <a class="btn" id="done-dl" href="${url}">Descargar</a>
            <button class="btn ghost" type="button" id="done-again">Empezar de nuevo</button>
          </div>
          ${extra}
        </div>`;
      done.querySelector("h2").textContent = title;
      done.querySelector("#done-dl").download = name;
      done.querySelector("#done-dl").textContent = "Descargar " + (name.endsWith(".zip") ? "ZIP" : name.split(".").pop().toUpperCase());
      done.querySelector("#done-again").addEventListener("click", () => location.reload());
      done.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    /** Muestra un error en el elemento de estado */
    fail(statusEl, e) {
      console.error(e);
      const msg = e instanceof FriendlyError ? e.message : "Algo ha fallado al procesar el archivo. Prueba con otro navegador o con un PDF distinto.";
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
