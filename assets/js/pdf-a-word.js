/* PDF a Word (.docx)
   - Texto editable: extrae el texto con pdf.js y lo organiza en párrafos y títulos.
   - Aspecto exacto: cada página se inserta como imagen (no editable, pero idéntica). */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "docx");
  const status = U.$("#status");
  const btn = U.$("#run");
  const bar = U.$("#bar");
  let file, bytes, view;

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    try {
      bytes = await P.read(file);
      view = await P.openView(bytes);
      U.$("#doc-info").textContent = `${file.name} · ${view.numPages} páginas`;
      P.showWork();
      U.$("#cover").appendChild(await P.render(view, 1, 220));
      btn.disabled = false;
      // Aviso si parece escaneado (sin texto en la primera página)
      const t = await (await view.getPage(1)).getTextContent();
      if (!t.items.some(it => it.str.trim())) {
        U.$("#scan-note").hidden = false;
        U.$("input[name=mode][value=image]").checked = true;
      }
    } catch (err) { P.fail(status, err); }
  });

  /** Agrupa los fragmentos de texto de una página en líneas y párrafos */
  async function pageParagraphs(page) {
    const content = await page.getTextContent();
    const items = content.items
      .filter(it => it.str !== undefined)
      .map(it => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        size: Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10 || 10,
        w: it.width,
        eol: it.hasEOL,
        bold: /bold|black|heavy/i.test((content.styles[it.fontName] || {}).fontFamily || "") || /bold/i.test(it.fontName)
      }));

    // Líneas: fragmentos con la misma altura (y)
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) < Math.max(2, it.size * 0.45)) {
        const prev = last.items[last.items.length - 1];
        const gap = it.x - (prev.x + prev.w);
        if (gap > it.size * 0.2 && !/\s$/.test(prev.str) && !/^\s/.test(it.str)) last.items.push({ ...it, str: " " + it.str });
        else last.items.push(it);
        last.size = Math.max(last.size, it.size);
      } else {
        lines.push({ y: it.y, size: it.size, items: [it] });
      }
    }
    lines.forEach(l => {
      l.items.sort((a, b) => a.x - b.x);
      l.text = l.items.map(i => i.str).join("").replace(/\s+/g, " ").trim();
      l.x = l.items[0].x;
      l.bold = l.items.every(i => i.bold || !i.str.trim());
    });
    const real = lines.filter(l => l.text);

    // Párrafos: líneas seguidas con poco espacio y mismo tamaño de letra
    const paras = [];
    for (let i = 0; i < real.length; i++) {
      const l = real[i];
      const p = paras[paras.length - 1];
      const prev = real[i - 1];
      const gap = prev ? prev.y - l.y : Infinity;
      if (p && Math.abs(p.size - l.size) < 0.6 && gap < l.size * 1.75 && !/^[•·\-–]\s/.test(l.text)) {
        p.text = p.text.endsWith("-") ? p.text.slice(0, -1) + l.text : p.text + " " + l.text;
        p.bold = p.bold && l.bold;
      } else {
        paras.push({ text: l.text, size: l.size, bold: l.bold });
      }
    }
    return paras;
  }

  async function editable() {
    const D = docx;
    const allPages = [];
    const sizes = [];
    for (let i = 1; i <= view.numPages; i++) {
      status.textContent = `Leyendo página ${i} de ${view.numPages}…`;
      bar.style.width = Math.round((i / view.numPages) * 90) + "%";
      const paras = await pageParagraphs(await view.getPage(i));
      paras.forEach(p => sizes.push(p.size));
      allPages.push(paras);
    }
    if (!sizes.length) throw new P.FriendlyError("Este PDF no tiene texto (parece escaneado). Usa la opción «Aspecto exacto».");
    sizes.sort((a, b) => a - b);
    const body = sizes[Math.floor(sizes.length / 2)]; // tamaño de letra más habitual

    const children = [];
    allPages.forEach((paras, pi) => {
      paras.forEach((p, k) => {
        const ratio = p.size / body;
        let heading;
        if (ratio > 1.6) heading = D.HeadingLevel.HEADING_1;
        else if (ratio > 1.25) heading = D.HeadingLevel.HEADING_2;
        else if (ratio > 1.08 && p.bold && p.text.length < 120) heading = D.HeadingLevel.HEADING_3;
        const bullet = /^[•·▪●]\s*/.test(p.text);
        const text = p.text.replace(/^[•·▪●]\s*/, "");
        children.push(new D.Paragraph({
          heading,
          bullet: bullet ? { level: 0 } : undefined,
          pageBreakBefore: pi > 0 && k === 0,
          spacing: { after: 120 },
          children: [new D.TextRun({ text, bold: !heading && p.bold, size: heading ? undefined : Math.round(Math.min(Math.max(p.size, 8), 14) * 2) })]
        }));
      });
    });
    const doc = new D.Document({
      creator: "Pagelo",
      styles: { default: { document: { run: { font: "Calibri" } } } },
      sections: [{ children }]
    });
    return await D.Packer.toBlob(doc);
  }

  async function asImages() {
    const D = docx;
    const sections = [];
    for (let i = 1; i <= view.numPages; i++) {
      status.textContent = `Convirtiendo página ${i} de ${view.numPages}…`;
      bar.style.width = Math.round((i / view.numPages) * 90) + "%";
      const { canvas, width, height } = await P.renderAtDpi(view, i, 150);
      const jpg = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
      const data = new Uint8Array(await jpg.arrayBuffer());
      // Página de Word del mismo tamaño que la del PDF (1 pt = 20 twips; imagen en píxeles a 96 ppp)
      sections.push({
        properties: { page: { size: { width: Math.round(width * 20), height: Math.round(height * 20) }, margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 } } },
        children: [new D.Paragraph({ children: [new D.ImageRun({ type: "jpg", data, transformation: { width: Math.floor(width * 96 / 72) - 1, height: Math.floor(height * 96 / 72) - 2 } })] })]
      });
    }
    return await D.Packer.toBlob(new D.Document({ creator: "Pagelo", sections }));
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.className = "status";
    bar.style.width = "0%";
    try {
      const mode = U.$("input[name=mode]:checked").value;
      const blob = mode === "image" ? await asImages() : await editable();
      bar.style.width = "100%";
      P.finish({
        title: "Documento de Word listo",
        detail: `${U.formatBytes(blob.size)} · Ábrelo con Word, Google Docs o LibreOffice.`,
        blob,
        name: U.baseName(file.name) + ".docx"
      });
    } catch (e) {
      P.fail(status, e);
      btn.disabled = false;
    }
  });
})();
