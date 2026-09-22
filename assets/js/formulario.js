/* Rellenar formularios PDF: muestra los campos sobre cada página para escribir directamente */
(function () {
  "use strict";
  const ready = P.uses("pdfjs", "pdflib");
  const status = U.$("#status");
  const btn = U.$("#run");
  const box = U.$("#form-pages");
  let file, bytes, view, doc, form;
  const controls = []; // { field, type, get() }

  function kind(f) {
    const n = f.constructor.name;
    if (f instanceof PDFLib.PDFTextField || n === "PDFTextField") return "text";
    if (f instanceof PDFLib.PDFCheckBox || n === "PDFCheckBox") return "check";
    if (f instanceof PDFLib.PDFRadioGroup || n === "PDFRadioGroup") return "radio";
    if (f instanceof PDFLib.PDFDropdown || n === "PDFDropdown") return "dropdown";
    if (f instanceof PDFLib.PDFOptionList || n === "PDFOptionList") return "list";
    return "other";
  }

  /** Mapa referencia de anotación → número de página */
  function widgetPages() {
    const map = new Map();
    doc.getPages().forEach((p, i) => {
      const annots = p.node.Annots();
      if (!annots) return;
      for (let k = 0; k < annots.size(); k++) {
        const ref = annots.get(k);
        map.set(ref.toString(), i);
      }
    });
    return map;
  }

  async function build() {
    const fields = form.getFields();
    const map = widgetPages();
    const wraps = [];
    const width = Math.min(box.clientWidth - 4, 820);
    for (let i = 1; i <= view.numPages; i++) {
      const wrap = document.createElement("div");
      wrap.className = "viewer";
      const c = await P.render(view, i, width);
      wrap.appendChild(c);
      wrap.style.width = c.style.width;
      box.appendChild(wrap);
      const page = await view.getPage(i);
      wraps.push({ wrap, vp: page.getViewport({ scale: 1 }) });
    }
    let placed = 0;
    const radioGroups = {};
    fields.forEach((field, fi) => {
      const type = kind(field);
      if (type === "other") return;
      const name = field.getName();
      let readOnly = false;
      try { readOnly = field.isReadOnly(); } catch (e) {}
      const widgets = field.acroField.getWidgets();
      const radioOptions = type === "radio" ? field.getOptions() : [];
      widgets.forEach((w, wi) => {
        const ref = doc.context.getObjectRef(w.dict);
        const pageIndex = ref ? map.get(ref.toString()) : undefined;
        if (pageIndex === undefined) return;
        const { wrap, vp } = wraps[pageIndex];
        const r = w.getRectangle();
        const [x1, y1, x2, y2] = vp.convertToViewportRectangle([r.x, r.y, r.x + r.width, r.y + r.height]);
        const left = Math.min(x1, x2) / vp.width * 100, top = Math.min(y1, y2) / vp.height * 100;
        const wd = Math.abs(x2 - x1) / vp.width * 100, ht = Math.abs(y2 - y1) / vp.height * 100;
        let el;
        if (type === "text") {
          const multi = field.isMultiline();
          el = document.createElement(multi ? "textarea" : "input");
          if (!multi) el.type = "text";
          el.value = field.getText() || "";
          const max = field.getMaxLength();
          if (max) el.maxLength = max;
          if (wi === 0) controls.push({ field, type, get: () => el.value });
          else el.addEventListener("input", () => { const first = controls.find(c => c.field === field); if (first) first.el.value = el.value; });
          if (wi === 0) controls[controls.length - 1].el = el;
        } else if (type === "check") {
          el = document.createElement("input");
          el.type = "checkbox";
          el.checked = field.isChecked();
          if (wi === 0) controls.push({ field, type, get: () => el.checked });
        } else if (type === "radio") {
          el = document.createElement("input");
          el.type = "radio";
          el.name = "radio-" + fi;
          el.value = radioOptions[wi] !== undefined ? radioOptions[wi] : String(wi);
          el.checked = field.getSelected() === el.value;
          radioGroups[fi] = radioGroups[fi] || [];
          radioGroups[fi].push(el);
          if (wi === 0) controls.push({ field, type, get: () => { const s = radioGroups[fi].find(x => x.checked); return s ? s.value : null; } });
        } else {
          el = document.createElement("select");
          if (type === "list" && field.isMultiselect && field.isMultiselect()) el.multiple = true;
          el.innerHTML = '<option value=""></option>';
          field.getOptions().forEach(o => { const op = document.createElement("option"); op.value = op.textContent = o; el.appendChild(op); });
          const sel = field.getSelected();
          [...el.options].forEach(op => { op.selected = sel.includes(op.value); });
          if (wi === 0) controls.push({ field, type, get: () => [...el.selectedOptions].map(o => o.value).filter(Boolean) });
        }
        el.className = "form-field";
        el.title = name;
        el.setAttribute("aria-label", name);
        el.disabled = readOnly;
        Object.assign(el.style, { left: left + "%", top: top + "%", width: wd + "%", height: ht + "%" });
        if (type === "check" || type === "radio") Object.assign(el.style, { width: Math.min(wd, ht * vp.height / vp.width) + "%", height: ht + "%" });
        wrap.appendChild(el);
        placed++;
      });
    });
    // Campos que no se han podido situar en la página: se muestran en una lista aparte
    const extra = U.$("#extra-fields");
    fields.forEach(field => {
      const type = kind(field);
      if (type === "other" || controls.some(c => c.field === field)) return;
      const row = document.createElement("div");
      row.className = "field";
      const label = document.createElement("label");
      label.textContent = field.getName();
      row.appendChild(label);
      let el;
      if (type === "text") { el = document.createElement("input"); el.type = "text"; el.value = field.getText() || ""; controls.push({ field, type, el, get: () => el.value }); }
      else if (type === "check") { el = document.createElement("input"); el.type = "checkbox"; el.checked = field.isChecked(); controls.push({ field, type, get: () => el.checked }); }
      else {
        el = document.createElement("select");
        el.innerHTML = '<option value=""></option>';
        field.getOptions().forEach(o => { const op = document.createElement("option"); op.value = op.textContent = o; el.appendChild(op); });
        controls.push({ field, type, get: () => type === "radio" ? (el.value || null) : [el.value].filter(Boolean) });
      }
      row.appendChild(el);
      extra.appendChild(row);
    });
    extra.parentElement.hidden = !extra.children.length;
    return { total: fields.length, placed };
  }

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    try {
      bytes = await P.read(file);
      view = await P.openView(bytes);
      doc = await P.openEdit(bytes);
      form = doc.getForm();
      const hasXfa = doc.catalog.lookup(PDFLib.PDFName.of("AcroForm")) && doc.catalog.lookup(PDFLib.PDFName.of("AcroForm")).get(PDFLib.PDFName.of("XFA"));
      if (!form.getFields().length) {
        throw new P.FriendlyError(hasXfa
          ? "Este formulario usa un formato especial (XFA) que solo funciona en Adobe Acrobat Reader. Ábrelo allí para rellenarlo."
          : "Este PDF no tiene campos para rellenar. Usa «Editar PDF» para escribir encima del documento.");
      }
      U.$("#doc-info").textContent = `${file.name} · ${view.numPages} páginas`;
      P.showWork();
      const r = await build();
      status.className = "status";
      status.textContent = `${controls.length} campos encontrados. Rellénalos directamente sobre el documento.`;
      if (hasXfa) U.$("#xfa-note").hidden = false;
      btn.disabled = false;
    } catch (err) { P.fail(status, err); }
  });

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.textContent = "Guardando…";
    try {
      for (const c of controls) {
        const v = c.get();
        try {
          if (c.type === "text") c.field.setText(v);
          else if (c.type === "check") v ? c.field.check() : c.field.uncheck();
          else if (c.type === "radio") { if (v) c.field.select(v); }
          else if (c.type === "dropdown" || c.type === "list") { if (v.length) c.field.select(c.type === "dropdown" ? v[0] : v); else c.field.clear(); }
        } catch (e) { console.warn("Campo no guardado:", c.field.getName(), e); }
      }
      try { form.updateFieldAppearances(await doc.embedFont(PDFLib.StandardFonts.Helvetica)); } catch (e) {}
      if (U.$("#flatten").checked) form.flatten();
      const out = await P.save(doc);
      P.finish({ title: "Formulario rellenado", detail: U.formatBytes(out.length), blob: P.blob(out), name: U.baseName(file.name) + "-relleno.pdf" });
    } catch (e) { P.fail(status, e); btn.disabled = false; }
  });
})();
