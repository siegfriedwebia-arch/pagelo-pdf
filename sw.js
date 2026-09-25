/* Pagelo — service worker (lo genera pwa.py: no lo edites a mano)
   Guarda la web en el dispositivo para que se pueda instalar y usar sin conexión. */
const VERSION = "828b38d86a";
const CORE = "core-" + VERSION;       // páginas y código de esta versión
const VENDOR = "vendor-v1";           // librerías grandes: se guardan la primera vez que se usan
const CORE_FILES = [
 "/",
 "/aviso-legal",
 "/comprimir-imagenes",
 "/comprimir-pdf",
 "/contacto",
 "/convertir-imagenes",
 "/desbloquear-pdf",
 "/dividir-pdf",
 "/editar-pdf",
 "/eliminar-paginas",
 "/en/",
 "/en/about",
 "/en/add-page-numbers",
 "/en/add-watermark",
 "/en/compress-images",
 "/en/compress-pdf",
 "/en/contact",
 "/en/convert-images",
 "/en/delete-pdf-pages",
 "/en/edit-pdf",
 "/en/excel-to-pdf",
 "/en/extract-pdf-pages",
 "/en/fill-pdf-form",
 "/en/guide-are-online-pdf-tools-safe",
 "/en/guide-convert-pdf-to-word-and-edit",
 "/en/guide-merge-pdf-files-into-one",
 "/en/guide-redact-personal-data-in-a-pdf",
 "/en/guide-remove-pdf-password",
 "/en/guide-scan-documents-with-your-phone",
 "/en/guide-send-large-pdf-by-email",
 "/en/guide-sign-pdf-on-your-phone",
 "/en/guides",
 "/en/heic-to-jpg",
 "/en/jpg-to-pdf",
 "/en/legal-notice",
 "/en/merge-pdf",
 "/en/ocr-pdf",
 "/en/organize-pdf",
 "/en/pdf-to-jpg",
 "/en/pdf-to-word",
 "/en/privacy",
 "/en/protect-pdf",
 "/en/redact-pdf",
 "/en/resize-images",
 "/en/rotate-pdf",
 "/en/scan-documents",
 "/en/sign-pdf",
 "/en/split-pdf",
 "/en/unlock-pdf",
 "/en/word-to-pdf",
 "/escanear-documentos",
 "/excel-a-pdf",
 "/extraer-paginas",
 "/firmar-pdf",
 "/guia-enviar-pdf-grande-por-email",
 "/guia-es-seguro-usar-webs-de-pdf",
 "/guia-escanear-documentos-con-el-movil",
 "/guia-firmar-pdf-desde-el-movil",
 "/guia-ocultar-datos-personales-en-un-pdf",
 "/guia-pasar-pdf-a-word-y-editarlo",
 "/guia-quitar-contrasena-pdf",
 "/guia-unir-varios-pdf-en-uno",
 "/guias",
 "/heic-a-jpg",
 "/jpg-a-pdf",
 "/marca-de-agua",
 "/numerar-paginas",
 "/ocr-pdf",
 "/organizar-pdf",
 "/pdf-a-jpg",
 "/pdf-a-word",
 "/privacidad",
 "/proteger-pdf",
 "/redimensionar-imagenes",
 "/rellenar-formulario-pdf",
 "/rotar-pdf",
 "/sobre-pagelo",
 "/tachar-datos-pdf",
 "/unir-pdf",
 "/word-a-pdf",
 "/assets/css/style.css",
 "/manifest.webmanifest",
 "/en/manifest.webmanifest",
 "/assets/icons/icon-192.png",
 "/assets/icons/icon-48.png",
 "/assets/icons/apple-touch-icon.png",
 "/assets/fonts/caveat-600.woff2",
 "/assets/fonts/dancing-script-600.woff2",
 "/assets/fonts/great-vibes-400.woff2",
 "/assets/fonts/sora-600.woff2",
 "/assets/fonts/sora-700.woff2",
 "/assets/fonts/source-sans-3-400.woff2",
 "/assets/fonts/source-sans-3-600.woff2",
 "/assets/fonts/source-sans-3-700.woff2",
 "/assets/js/common.js",
 "/assets/js/comprimir-pdf.js",
 "/assets/js/dividir.js",
 "/assets/js/editar.js",
 "/assets/js/escanear.js",
 "/assets/js/excel-a-pdf.js",
 "/assets/js/firmar.js",
 "/assets/js/formulario.js",
 "/assets/js/imagen.js",
 "/assets/js/jpg-a-pdf.js",
 "/assets/js/marca-agua.js",
 "/assets/js/numerar.js",
 "/assets/js/ocr.js",
 "/assets/js/organizar.js",
 "/assets/js/paginas.js",
 "/assets/js/pdf-a-jpg.js",
 "/assets/js/pdf-a-word.js",
 "/assets/js/pdf-kit.js",
 "/assets/js/seguridad.js",
 "/assets/js/tachar.js",
 "/assets/js/unir.js",
 "/assets/js/word-a-pdf.js",
 "/assets/js/en/common.js",
 "/assets/js/en/comprimir-pdf.js",
 "/assets/js/en/dividir.js",
 "/assets/js/en/editar.js",
 "/assets/js/en/escanear.js",
 "/assets/js/en/excel-a-pdf.js",
 "/assets/js/en/firmar.js",
 "/assets/js/en/formulario.js",
 "/assets/js/en/imagen.js",
 "/assets/js/en/jpg-a-pdf.js",
 "/assets/js/en/marca-agua.js",
 "/assets/js/en/numerar.js",
 "/assets/js/en/ocr.js",
 "/assets/js/en/organizar.js",
 "/assets/js/en/paginas.js",
 "/assets/js/en/pdf-a-jpg.js",
 "/assets/js/en/pdf-a-word.js",
 "/assets/js/en/pdf-kit.js",
 "/assets/js/en/seguridad.js",
 "/assets/js/en/tachar.js",
 "/assets/js/en/unir.js",
 "/assets/js/en/word-a-pdf.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CORE).then(c => c.addAll(CORE_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("core-") && k !== CORE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la red (para tener siempre la última versión); si no hay conexión, la copia guardada
async function networkFirst(request) {
  const cache = await caches.open(CORE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: true }) || await caches.match(request, { ignoreSearch: true });
    if (hit) return hit;
    const en = new URL(request.url).pathname.startsWith("/en/");
    return (await cache.match(en ? "/en/" : "/")) || Response.error();
  }
}

// Primero la copia guardada (librerías que no cambian)
async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

// La copia guardada al momento y se actualiza por detrás
async function staleWhileRevalidate(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  const net = fetch(request).then(res => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/_vercel/")) return;             // estadísticas: siempre en directo
    if (req.mode === "navigate") return event.respondWith(networkFirst(req));
    if (url.pathname.startsWith("/assets/vendor/")) return event.respondWith(cacheFirst(req, VENDOR));
    return event.respondWith(staleWhileRevalidate(req, CORE));
  }
  // Todo lo demás (anuncios, etc.) va directo a internet
});
