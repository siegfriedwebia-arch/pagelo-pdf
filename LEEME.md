# PDFGratis — herramientas PDF gratis

Web 100 % estática (HTML, CSS y JavaScript). No necesita servidor ni base de datos:
todos los documentos se procesan en el navegador del visitante y nunca se suben a internet.
Solo pagas el dominio.

## 1. Abrirla en Visual Studio Code

1. Descomprime la carpeta y ábrela en VS Code: **Archivo → Abrir carpeta**.
2. Instala la extensión **Live Server** (de Ritwick Dey).
3. Clic derecho en `index.html` → **Open with Live Server**.

## 2. Estructura

```
index.html                  Portada con buscador
unir-pdf.html               dividir-pdf.html        rotar-pdf.html
eliminar-paginas.html       extraer-paginas.html    comprimir-pdf.html
pdf-a-word.html             word-a-pdf.html         jpg-a-pdf.html
pdf-a-jpg.html              firmar-pdf.html         proteger-pdf.html
desbloquear-pdf.html        marca-de-agua.html
convertir-imagenes.html     comprimir-imagenes.html redimensionar-imagenes.html
contacto.html · privacidad.html · aviso-legal.html · 404.html · sitemap.xml · robots.txt

assets/css/style.css        Estilos (colores y tipografías al principio, en :root)
assets/js/common.js         Menú, modo oscuro, buscador, arrastrar archivos
assets/js/pdf-kit.js        Funciones PDF compartidas (abrir, miniaturas, rangos, descarga)
assets/js/*.js              Un archivo por herramienta
assets/vendor/              Librerías incluidas (no dependen de internet)
```

## 3. Personalízala antes de publicar

Con **Buscar y reemplazar en todos los archivos** (Ctrl+Shift+H):

- `https://tudominio.com` → tu dominio (todas las páginas, sitemap.xml y robots.txt).
- El correo de contacto (siegfriedwebia@gmail.com) está en `contacto.html`, `privacidad.html` y `aviso-legal.html`.
- Rellena los datos entre corchetes `[ ]` de `privacidad.html` y `aviso-legal.html`.

La cabecera y el pie se repiten en cada página: cualquier cambio hazlo con Ctrl+Shift+H.

## 4. Publicarla gratis

**Cloudflare Pages** (recomendado): sube la carpeta a un repositorio de GitHub y en Cloudflare
ve a Workers y Pages → Crear → Pages → Conectar con Git. Sin comando de compilación; carpeta `/`.
Después añade tu dominio en «Dominios personalizados».

Alternativas gratuitas: GitHub Pages o Netlify (arrastrando la carpeta a app.netlify.com/drop).

Todos los archivos pesan menos de 25 MB, dentro del límite de Cloudflare Pages.

## 5. Google AdSense y el aviso de cookies

La web ya lleva la etiqueta de AdSense en todas las páginas (el código de anuncios se carga
desde `assets/js/common.js` cuando la página ya se ha mostrado, para no ralentizarla), el archivo `ads.txt`,
la política de cookies y el enlace «Configuración de privacidad y cookies» en el pie.
Solo falta poner tu ID de editor:

1. Regístrate en adsense.google.com y añade tu dominio.
2. Copia tu ID de editor (empieza por `ca-pub-` seguido de 16 números).
3. En VS Code, Ctrl+Shift+H: busca `XXXXXXXXXXXXXXXX` y reemplázalo por tus 16 números.
   Así se actualizan a la vez todas las páginas y `ads.txt`.
4. Publica los cambios y en AdSense pulsa «Verificar».

Aviso de cookies (obligatorio para anuncios en Europa):
en AdSense → **Privacidad y mensajes** → **Normativas europeas** → Crear mensaje.
Elige tu web, idioma español, pon la URL de `privacidad.html`, deja las opciones
«Consentir», «No consentir» y «Gestionar opciones», y pulsa **Publicar**.
Google mostrará el aviso automáticamente; no hace falta tocar el código.

Da de alta también la web en **Google Search Console** y envía `sitemap.xml`.

## 6. Qué hace cada herramienta por dentro (y sus límites)

- **Comprimir PDF**: «Básica» mantiene el texto; «Recomendada» y «Extrema» convierten las
  páginas en imagen (mucha reducción, pero el texto deja de ser seleccionable).
- **PDF a Word**: extrae texto, títulos y viñetas. No copia tablas complejas ni fotos.
  Los PDF escaneados no tienen texto: se pasan como imagen (no hay OCR).
- **Word a PDF**: solo .docx. No copia encabezados, pies de página ni columnas.
- **Proteger PDF**: cifrado AES-256. **Desbloquear**: requiere saber la contraseña
  (o quita restricciones de PDF que se abren sin contraseña).
- **Firmar PDF**: firma manuscrita como imagen, no firma con certificado digital.

## 7. Licencias de las librerías incluidas

Todas permiten uso comercial gratuito:
pdf-lib (@cantoo/pdf-lib) — MIT · pdf.js — Apache 2.0 · docx — MIT · mammoth — BSD-2 ·
pdfmake — MIT · html-to-pdfmake — MIT · JSZip — MIT.
