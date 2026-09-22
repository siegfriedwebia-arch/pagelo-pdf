/* Word (.docx) a PDF: mammoth convierte el Word en HTML y pdfmake genera un PDF con texto real. */
(function () {
  "use strict";
  const ready = P.uses("mammoth", "pdfmake");
  const status = U.$("#status");
  const btn = U.$("#run");
  const previewBox = U.$("#preview");
  let file, html;

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    status.className = "status";
    if (/\.doc$/i.test(file.name)) {
      return P.fail(status, new P.FriendlyError("Los .doc antiguos no se pueden leer en el navegador. Ábrelo en Word o Google Docs y guárdalo como .docx."));
    }
    try {
      status.textContent = "Leyendo el documento…";
      const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, {
        styleMap: [
          "p[style-name='Title'] => h1:fresh", "p[style-name='Título'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Subtítulo'] => h2:fresh",
          "p[style-name='Título 1'] => h1:fresh", "p[style-name='Título 2'] => h2:fresh", "p[style-name='Título 3'] => h3:fresh"
        ]
      });
      html = result.value;
      if (!html.trim()) throw new P.FriendlyError("El documento está vacío o no se ha podido leer.");
      U.$("#doc-info").textContent = file.name;
      previewBox.innerHTML = html;
      P.showWork();
      btn.disabled = false;
      status.textContent = "Revisa la vista previa y pulsa «Convertir a PDF».";
    } catch (err) {
      P.fail(status, err instanceof P.FriendlyError ? err : new P.FriendlyError("No se ha podido leer el archivo. Comprueba que es un .docx de Word."));
    }
  });

  // Ajusta las imágenes al ancho de la página
  function fitImages(node, maxW) {
    if (Array.isArray(node)) return node.forEach(n => fitImages(n, maxW));
    if (!node || typeof node !== "object") return;
    if (node.image) { delete node.width; delete node.height; node.fit = [maxW, 640]; }
    ["stack", "columns", "ul", "ol", "text"].forEach(k => { if (Array.isArray(node[k])) fitImages(node[k], maxW); });
    if (node.table && node.table.body) node.table.body.forEach(r => fitImages(r, maxW));
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.className = "status";
    status.textContent = "Creando el PDF…";
    try {
      const size = U.$("#size").value;
      const margin = parseInt(U.$("#margin").value, 10);
      const pageW = size === "LETTER" ? 612 : 595.28;
      const content = htmlToPdfmake(html, { defaultStyles: { h1: { fontSize: 22, bold: true, marginBottom: 8 }, h2: { fontSize: 17, bold: true, marginBottom: 6 }, h3: { fontSize: 14, bold: true, marginBottom: 5 }, p: { margin: [0, 0, 0, 8] }, table: { marginBottom: 10 } } });
      fitImages(content, pageW - margin * 2);
      const def = {
        pageSize: size,
        pageMargins: [margin, margin, margin, margin],
        content,
        defaultStyle: { fontSize: 11, lineHeight: 1.25 },
        info: { title: U.baseName(file.name), producer: "PDFGratis" }
      };
      const blob = await new Promise((resolve, reject) => {
        try { pdfMake.createPdf(def).getBlob(resolve); } catch (e) { reject(e); }
      });
      P.finish({ title: "PDF listo", detail: U.formatBytes(blob.size), blob, name: U.baseName(file.name) + ".pdf" });
    } catch (e) {
      P.fail(status, e);
      btn.disabled = false;
    }
  });
})();
