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
    catch (e) { if (/encrypted/i.test(e.message)) return true; throw new P.FriendlyError("The PDF couldn't be read. It may be damaged."); }
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
        if (enc) throw new P.FriendlyError("This PDF is already protected. To change the password, unlock it first.");
        P.showWork();
        U.$("#pw").focus();
        return;
      }
      // Desbloquear
      if (!enc) throw new P.FriendlyError("This PDF has no password or restrictions: there's no need to unlock it.");
      // Primero se prueba sin contraseña (PDF con restricciones de copia o impresión)
      try {
        const out = await unlockWith("");
        return P.finish({ title: "Restrictions removed", detail: "You can now print, copy and edit the PDF.", blob: P.blob(out), name: U.baseName(file.name) + "-unlocked.pdf" });
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
      if (pw.value && pw.value.length < 4) status.textContent = "Use at least 4 characters (8 or more is better).";
      else if (pw2.value && pw.value !== pw2.value) status.textContent = "The passwords don't match.";
      else status.textContent = ok ? "All set." : "";
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
        P.finish({ title: "PDF protected", detail: "It will ask for the password when opened. Keep it safe: it can't be recovered.", blob: P.blob(out), name: U.baseName(file.name) + "-protected.pdf" });
      } catch (e) { P.fail(status, e); btn.disabled = false; }
    });
  } else {
    const pw = U.$("#pw");
    pw.addEventListener("input", () => { btn.disabled = !pw.value; });
    pw.addEventListener("keydown", e => { if (e.key === "Enter" && pw.value) btn.click(); });
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.className = "status";
      status.textContent = "Checking…";
      try {
        const out = await unlockWith(pw.value);
        P.finish({ title: "PDF unlocked", detail: "It won't ask for a password any more.", blob: P.blob(out), name: U.baseName(file.name) + "-unlocked.pdf" });
      } catch (e) {
        status.className = "status error";
        status.textContent = /password/i.test(e.message) ? "The password is incorrect." : "This PDF couldn't be unlocked.";
        btn.disabled = false;
      }
    });
  }
})();
