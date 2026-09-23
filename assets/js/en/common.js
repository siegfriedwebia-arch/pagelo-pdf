/* PDFGratis — funciones comunes a todas las páginas */
(function () {
  "use strict";
  const root = document.documentElement;

  document.addEventListener("DOMContentLoaded", () => {
    // En internet las direcciones van sin «.html» (/unir-pdf). Al abrir la web en tu ordenador
    // (doble clic o Live Server) hace falta la extensión, así que se añade a los enlaces.
    if (location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
      U.$$('a[href^="/"]:not([href^="//"])').forEach(a => {
        const [path, hash] = a.getAttribute("href").slice(1).split("#");
        const file = path === "" || path.endsWith("/") ? path + "index.html" : path + ".html";
        a.setAttribute("href", U.root + file + (hash !== undefined ? "#" + hash : ""));
      });
    }

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

    // Aviso discreto si el navegador está en otro idioma (sin redirigir: Google lo prefiere así)
    try {
      const other = document.querySelector('link[rel="alternate"][hreflang="' + (U.lang === "es" ? "en" : "es") + '"]');
      const nav = (navigator.language || "").toLowerCase();
      const wantsOther = U.lang === "es" ? !nav.startsWith("es") : nav.startsWith("es");
      if (other && wantsOther && !localStorage.getItem("lang-bar-closed")) {
        const bar = document.createElement("div");
        bar.className = "lang-bar";
        bar.innerHTML = U.lang === "es"
          ? '<div class="wrap"><span>This page is also available in English.</span><a lang="en"></a><button type="button" aria-label="Close">✕</button></div>'
          : '<div class="wrap"><span>Esta página también está en español.</span><a lang="es"></a><button type="button" aria-label="Cerrar">✕</button></div>';
        const a = bar.querySelector("a");
        a.href = relative(other.href);
        a.textContent = U.lang === "es" ? "View in English →" : "Ver en español →";
        bar.querySelector("button").addEventListener("click", () => { bar.remove(); try { localStorage.setItem("lang-bar-closed", "1"); } catch (e) {} });
        document.body.insertBefore(bar, document.body.firstChild);
      }
    } catch (e) {}

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

  /** Enlace a la otra versión usando el selector de idioma de la cabecera (funciona también sin dominio) */
  function relative(href) {
    const sw = document.querySelector(".lang-switch");
    return sw ? sw.getAttribute("href") : href;
  }

  // ---------- Utilidades ----------
  const LANG = document.documentElement.lang === "en" ? "en" : "es";
  const U = {
    lang: LANG,
    locale: LANG === "en" ? "en-US" : "es-ES",
    /** Ruta a la raíz de la web ("" en español, "../" en /en/) */
    root: window.SITE_ROOT || "",
    /** Plural: U.pl(3, "página", "páginas") → "páginas" */
    pl: (n, one, many) => (n === 1 ? one : many),
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
      return n.toFixed(i === 0 ? 0 : 1).replace(".", LANG === "en" ? "." : ",") + " " + units[i];
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

    async copy(text, msg = "Copied") {
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
          s.onerror = () => { delete U._scripts[src]; reject(new Error("Couldn't load " + src)); };
          document.head.appendChild(s);
        });
      }
      return U._scripts[src];
    }
  };

  // Estadísticas de visitas de Vercel (sin cookies). Solo en la web publicada, no en tu ordenador.
  (function () {
    const canon = document.querySelector('link[rel="canonical"]');
    const host = canon ? new URL(canon.href).hostname : "";
    if (location.hostname !== host && !location.hostname.endsWith(".vercel.app")) return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    const s = document.createElement("script");
    s.defer = true;
    s.src = "/_vercel/insights/script.js";
    document.head.appendChild(s);
  })();

  // ---------- App instalable (PWA) ----------
  // El service worker solo se activa en la web publicada (no con doble clic ni con Live Server)
  const published = location.protocol === "https:" || (location.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname));
  if ("serviceWorker" in navigator && published) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
  }

  let installEvent = null;
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    installEvent = e;
    installButtons().forEach(b => { b.hidden = false; });
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    installButtons().forEach(b => { b.hidden = true; });
    U.toast("App installed");
  });

  const installButtons = () => [...document.querySelectorAll("#install-btn, [data-install]")];

  function iosHelp() {
    let d = document.getElementById("ios-help");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "ios-help";
      d.className = "ios-help";
      const share = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"/></svg>';
      d.innerHTML = "<h2></h2><ol><li></li><li></li><li></li></ol><button class='btn' type='button'></button>";
      d.querySelector("h2").textContent = "Install PDFGratis on iPhone";
      const li = d.querySelectorAll("li");
      li[0].innerHTML = "Tap the Share button" + " " + share + " " + "in Safari's toolbar.";
      li[1].textContent = "Choose “Add to Home Screen”.";
      li[2].textContent = "Tap “Add”.";
      const ok = d.querySelector("button");
      ok.textContent = "Got it";
      ok.addEventListener("click", () => d.close());
      document.body.appendChild(d);
    }
    d.showModal();
  }

  // Con la app instalada: guardar en segundo plano las librerías de todas las herramientas
  // para que funcionen sin conexión (unos 8 MB, una sola vez). El OCR y HEIC se guardan al usarlos.
  if (published && standalone() && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      let done = null;
      try { done = localStorage.getItem("offline-ready"); } catch (e) {}
      if (done === "v1") return;
      // Hay que esperar a que el service worker controle la página; si no, lo descargado no se guarda
      const controlled = navigator.serviceWorker.controller ? Promise.resolve()
        : new Promise(r => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
      controlled.then(() => {
        const v = "/assets/vendor/";
        const files = ["pdf.min.js", "pdf.worker.min.js", "pdf-lib.min.js", "jszip.min.js", "docx.min.js", "mammoth.browser.min.js",
          "pdfmake.min.js", "vfs_fonts.js", "html-to-pdfmake.min.js", "xlsx.full.min.js"];
        const go = () => Promise.all(files.map(f => fetch(v + f).then(r => { if (!r.ok) throw new Error(f); })))
          .then(() => { try { localStorage.setItem("offline-ready", "v1"); } catch (e) {} })
          .catch(() => {});
        if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 5000 }); else setTimeout(go, 3000);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (standalone()) return;
    installButtons().forEach(b => {
      if (isIOS() && published) b.hidden = false;   // en iPhone no hay aviso automático: se explica cómo
      b.addEventListener("click", async () => {
        if (installEvent) {
          installEvent.prompt();
          await installEvent.userChoice;
          installEvent = null;
          installButtons().forEach(x => { x.hidden = true; });
        } else if (isIOS()) {
          iosHelp();
        }
      });
    });
  });

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
