/* Proteger PDF (cifrado AES-256 con contraseña) y desbloquear PDF (quitar la contraseña sabiendo cuál es) */
(function () {
  "use strict";
  const ready = P.uses("pdflib");
  const mode = U.$("#tool").dataset.mode; // proteger | desbloquear
  const status = U.$("#status");
  const btn = U.$("#run");
  let file, bytes;

  function randomPassword() {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
  }

  async function isEncrypted() {
    try { await PDFLib.PDFDocument.load(bytes); return false; }
    catch (e) { if (/encrypted/i.test(e.message)) return true; throw new P.FriendlyError("No se ha podido leer el PDF. Puede que esté dañado."); }
  }

  async function unlockWith(password) {
    const src = await PDFLib.PDFDocument.load(bytes, { password });
    const out = await PDFLib.PDFDocument.create();
    (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
    const t = src.getTitle();
    if (t) out.setTitle(t);
    return await P.save(out);
  }

  U.$("#file").addEventListener("change", async e => {
    await ready;
    file = e.target.files[0];
    if (!file) return;
    status.className = "status";
    try {
      bytes = await P.read(file);
      const enc = await isEncrypted();
      U.$("#doc-info").textContent = `${file.name} · ${U.formatBytes(file.size)}`;

      if (mode === "proteger") {
        if (enc) throw new P.FriendlyError("Este PDF ya está protegido. Si quieres cambiar la contraseña, desbloquéalo primero.");
        P.showWork();
        U.$("#pw").focus();
        return;
      }
      // Desbloquear
      if (!enc) throw new P.FriendlyError("Este PDF no tiene contraseña ni restricciones: no hace falta desbloquearlo.");
      // Primero se prueba sin contraseña (PDF con restricciones de copia o impresión)
      try {
        const out = await unlockWith("");
        return P.finish({ title: "Restricciones eliminadas", detail: "Ya puedes imprimir, copiar y editar el PDF.", blob: P.blob(out), name: U.baseName(file.name) + "-desbloqueado.pdf" });
      } catch (e2) {}
      P.showWork();
      U.$("#pw").focus();
    } catch (err) { P.fail(status, err); }
  });

  if (mode === "proteger") {
    const pw = U.$("#pw"), pw2 = U.$("#pw2");
    const check = () => {
      status.className = "status";
      const ok = pw.value.length >= 4 && pw.value === pw2.value;
      btn.disabled = !ok;
      if (pw.value && pw.value.length < 4) status.textContent = "Usa al menos 4 caracteres (mejor 8 o más).";
      else if (pw2.value && pw.value !== pw2.value) status.textContent = "Las contraseñas no coinciden.";
      else status.textContent = ok ? "Todo listo." : "";
    };
    [pw, pw2].forEach(el => el.addEventListener("input", check));
    U.$("#show").addEventListener("change", e => { pw.type = pw2.type = e.target.checked ? "text" : "password"; });

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const doc = await PDFLib.PDFDocument.load(bytes);
        doc.encrypt({
          userPassword: pw.value,
          ownerPassword: randomPassword(),
          permissions: {
            printing: U.$("#perm-print").checked ? "highResolution" : false,
            copying: U.$("#perm-copy").checked,
            modifying: U.$("#perm-edit").checked,
            annotating: U.$("#perm-edit").checked,
            fillingForms: true,
            contentAccessibility: true,
            documentAssembly: U.$("#perm-edit").checked
          }
        });
        const out = await doc.save();
        P.finish({ title: "PDF protegido", detail: "Pedirá la contraseña al abrirlo. Guárdala bien: no se puede recuperar.", blob: P.blob(out), name: U.baseName(file.name) + "-protegido.pdf" });
      } catch (e) { P.fail(status, e); btn.disabled = false; }
    });
  } else {
    const pw = U.$("#pw");
    pw.addEventListener("input", () => { btn.disabled = !pw.value; });
    pw.addEventListener("keydown", e => { if (e.key === "Enter" && pw.value) btn.click(); });
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.className = "status";
      status.textContent = "Comprobando…";
      try {
        const out = await unlockWith(pw.value);
        P.finish({ title: "PDF desbloqueado", detail: "Ya no pedirá contraseña al abrirlo.", blob: P.blob(out), name: U.baseName(file.name) + "-desbloqueado.pdf" });
      } catch (e) {
        status.className = "status error";
        status.textContent = /password/i.test(e.message) ? "La contraseña no es correcta." : "No se ha podido desbloquear este PDF.";
        btn.disabled = false;
      }
    });
  }
})();
