/* PDF a JPG o PNG: cada página se convierte en una imagen */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "zip");
  const status = U.$("#status");
  const btn = U.$("#run");
  const bar = U.$("#bar");
  let file, bytes, view, name;

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    try {
      bytes = await P.read(file);
      view = await P.openView(bytes);
      name = U.baseName(file.name);
      U.$("#doc-info").textContent = `${file.name} · ${view.numPages} pages`;
      U.$("#ranges").value = `1-${view.numPages}`;
      P.showWork();
      P.thumbs(view, U.$("#pages"), { width: 100 });
      btn.disabled = false;
    } catch (err) { P.fail(status, err); }
  });

  U.$$("input[name=which]").forEach(r => r.addEventListener("change", () => {
    U.$("#ranges-field").hidden = U.$("input[name=which]:checked").value !== "some";
  }));

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.className = "status";
    try {
      const dpi = parseInt(U.$("#dpi").value, 10);
      const fmt = U.$("#fmt").value;
      const ext = fmt === "image/png" ? "png" : "jpg";
      let pages = Array.from({ length: view.numPages }, (_, i) => i + 1);
      if (U.$("input[name=which]:checked").value === "some") {
        pages = [];
        P.parseRanges(U.$("#ranges").value, view.numPages).forEach(([a, b]) => { for (let i = a; i <= b; i++) if (!pages.includes(i)) pages.push(i); });
      }
      const files = [];
      for (let k = 0; k < pages.length; k++) {
        status.textContent = `Converting page ${pages[k]} (${k + 1} of ${pages.length})…`;
        bar.style.width = Math.round(((k + 1) / pages.length) * 100) + "%";
        const { canvas } = await P.renderAtDpi(view, pages[k], dpi);
        const blob = await new Promise(r => canvas.toBlob(r, fmt, 0.9));
        canvas.width = canvas.height = 0;
        files.push({ name: `${name}-page-${pages[k]}.${ext}`, data: blob });
      }
      if (files.length === 1) {
        P.finish({ title: "Image ready", detail: U.formatBytes(files[0].data.size), blob: files[0].data, name: files[0].name });
      } else {
        status.textContent = "Creating the ZIP…";
        const zip = await P.zip(files);
        P.finish({ title: "Images ready", detail: `${files.length} ${ext.toUpperCase()} images in a ZIP · ${U.formatBytes(zip.size)}`, blob: zip, name: `${name}-images.zip` });
      }
    } catch (e) {
      P.fail(status, e);
      btn.disabled = false;
    }
  });
})();
