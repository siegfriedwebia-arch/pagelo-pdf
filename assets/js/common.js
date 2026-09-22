/* PDFGratis — funciones comunes a todas las páginas */
(function () {
  "use strict";
  const root = document.documentElement;

  document.addEventListener("DOMContentLoaded", () => {
    const themeBtn = document.getElementById("theme-btn");
    if (themeBtn) themeBtn.addEventListener("click", () => {
      const cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
    });

    const menuBtn = document.getElementById("menu-btn");
    const nav = document.getElementById("site-nav");
    if (menuBtn && nav) menuBtn.addEventListener("click", () => {
      menuBtn.setAttribute("aria-expanded", String(nav.classList.toggle("open")));
    });

    // Buscador de la portada
    const finder = document.getElementById("finder");
    if (finder) {
      const cards = U.$$(".sheet");
      finder.addEventListener("input", () => {
        const q = U.normalize(finder.value);
        let shown = 0;
        cards.forEach(c => {
          const hit = !q || U.normalize(c.textContent + " " + (c.dataset.keys || "")).includes(q);
          c.hidden = !hit;
          if (hit) shown++;
        });
        U.$$(".cat-block").forEach(b => { b.hidden = !b.querySelector(".sheet:not([hidden])"); });
        document.getElementById("no-results").hidden = shown > 0;
      });
    }

    // «Configuración de privacidad y cookies»: vuelve a abrir el aviso de consentimiento de Google
    U.$$(".cookie-settings").forEach(a => a.addEventListener("click", e => {
      if (window.googlefc && googlefc.callbackQueue && googlefc.showRevocationMessage) {
        e.preventDefault();
        googlefc.callbackQueue.push(googlefc.showRevocationMessage);
      }
    }));

    // Arrastrar y soltar archivos en cualquier zona .drop
    U.$$(".drop").forEach(drop => {
      const input = drop.querySelector("input[type=file]");
      ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
      ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
      drop.addEventListener("drop", e => {
        if (!e.dataTransfer.files.length) return;
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  });

  // ---------- Utilidades ----------
  const U = {
    $: (sel, ctx = document) => ctx.querySelector(sel),
    $$: (sel, ctx = document) => [...ctx.querySelectorAll(sel)],

    normalize(str) {
      return String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    },

    formatBytes(bytes) {
      if (!bytes && bytes !== 0) return "";
      const units = ["B", "KB", "MB", "GB"];
      let i = 0, n = bytes;
      while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
      return n.toFixed(i === 0 ? 0 : 1).replace(".", ",") + " " + units[i];
    },

    toast(msg) {
      let t = document.querySelector(".toast");
      if (!t) {
        t = document.createElement("div");
        t.className = "toast";
        t.setAttribute("role", "status");
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove("show"), 1800);
    },

    async copy(text, msg = "Copiado") {
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      U.toast(msg);
    },

    download(blobOrUrl, filename) {
      const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (typeof blobOrUrl !== "string") setTimeout(() => URL.revokeObjectURL(url), 4000);
    },

    baseName(filename) {
      return filename.replace(/\.[^.]+$/, "");
    },

    param(name) {
      return new URLSearchParams(location.search).get(name);
    },

    sleep: ms => new Promise(r => setTimeout(r, ms)),

    /** Carga un script una sola vez y devuelve una promesa */
    loadScript(src) {
      U._scripts = U._scripts || {};
      if (!U._scripts[src]) {
        U._scripts[src] = new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = src;
          s.onload = resolve;
          s.onerror = () => { delete U._scripts[src]; reject(new Error("No se ha podido cargar " + src)); };
          document.head.appendChild(s);
        });
      }
      return U._scripts[src];
    }
  };

  // Google AdSense: se carga cuando la página ya está lista y solo si hay un ID real
  window.addEventListener("load", () => {
    const meta = document.querySelector('meta[name="google-adsense-account"]');
    const id = meta && meta.content;
    if (!id || /X/.test(id)) return;
    const go = () => {
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + id;
      document.head.appendChild(s);
    };
    if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 1200);
  });

  window.U = U;
})();
