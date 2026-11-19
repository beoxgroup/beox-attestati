(() => {
  "use strict";

  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  const form = document.querySelector("#certificate-form");
  const participantsInput = document.querySelector("#participants");
  const dateInput = document.querySelector("#event-date");
  const logoInput = document.querySelector("#company-logo");
  const trainerOneInput = document.querySelector("#trainer-one");
  const trainerTwoInput = document.querySelector("#trainer-two");
  const fileNameInput = document.querySelector("#file-name");
  const participantCount = document.querySelector("#participant-count");
  const buttonCount = document.querySelector("#button-count");
  const generateButton = document.querySelector("#generate-button");
  const formMessage = document.querySelector("#form-message");
  const uploadLabel = document.querySelector("#upload-label");

  const previewParticipant = document.querySelector("#preview-participant");
  const previewDate = document.querySelector("#preview-date");
  const previewLogo = document.querySelector("#preview-logo");
  const previewTrainerOneSignature = document.querySelector("#preview-trainer-one-signature");
  const previewTrainerTwoSignature = document.querySelector("#preview-trainer-two-signature");
  const previewTrainerOneRight = document.querySelector("#preview-trainer-one-right");
  const previewTrainerTwoRight = document.querySelector("#preview-trainer-two-right");

  const BLUE = rgb(12 / 255, 60 / 255, 125 / 255);
  const GREY = rgb(84 / 255, 84 / 255, 84 / 255);
  const MONTHS = [
    "GENNAIO",
    "FEBBRAIO",
    "MARZO",
    "APRILE",
    "MAGGIO",
    "GIUGNO",
    "LUGLIO",
    "AGOSTO",
    "SETTEMBRE",
    "OTTOBRE",
    "NOVEMBRE",
    "DICEMBRE",
  ];
  const TRAINERS = Object.freeze({
    "Nicole Crivelletto": "./assets/signatures/nicole-crivelletto.png",
    "Elena Volpato": "./assets/signatures/elena-volpato.png",
    "Federico Marcante": "./assets/signatures/federico-marcante.png",
    "Luca Rigoldi": "./assets/signatures/luca-rigoldi.png",
  });

  let logoState = null;
  let logoPreviewUrl = null;
  let signaturePreviewRequest = 0;
  const signatureCache = new Map();

  function parseParticipants(value) {
    return value
      .split(/\r?\n/)
      .map((line) => line.replace(/\t+/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function formatDate(value) {
    if (!value) return "DATA ATTIVITÀ";
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return "DATA ATTIVITÀ";
    const [, year, month, day] = match;
    return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
  }

  function setMessage(text = "", type = "") {
    formMessage.textContent = text;
    formMessage.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function updateCount() {
    const count = parseParticipants(participantsInput.value).length;
    participantCount.textContent = `${count} ${count === 1 ? "nome" : "nomi"}`;
    buttonCount.textContent = `${count} ${count === 1 ? "pagina" : "pagine"}`;
    previewParticipant.textContent = parseParticipants(participantsInput.value)[0]?.toUpperCase() || "NOME E COGNOME";
  }

  function bytesFromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function normalizeSignature(bytes) {
    const sourceBlob = new Blob([bytes], { type: "image/png" });
    const bitmap = await createImageBitmap(sourceBlob);
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = bitmap.width;
    sourceCanvas.height = bitmap.height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    sourceContext.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    let minX = sourceCanvas.width;
    let minY = sourceCanvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < sourceCanvas.height; y += 1) {
      for (let x = 0; x < sourceCanvas.width; x += 1) {
        const alpha = imageData.data[(y * sourceCanvas.width + x) * 4 + 3];
        if (alpha > 24) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      throw new Error("Una firma non contiene tratti visibili.");
    }

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = 900;
    outputCanvas.height = 270;
    const outputContext = outputCanvas.getContext("2d");
    const scale = Math.min(840 / cropWidth, 220 / cropHeight);
    const drawWidth = cropWidth * scale;
    const drawHeight = cropHeight * scale;
    outputContext.drawImage(
      sourceCanvas,
      minX,
      minY,
      cropWidth,
      cropHeight,
      (outputCanvas.width - drawWidth) / 2,
      (outputCanvas.height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );

    const normalizedBlob = await new Promise((resolve, reject) => {
      outputCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Firma non elaborabile.")), "image/png");
    });
    return {
      bytes: new Uint8Array(await normalizedBlob.arrayBuffer()),
      previewUrl: URL.createObjectURL(normalizedBlob),
    };
  }

  function loadSignature(name) {
    if (!TRAINERS[name]) return Promise.reject(new Error("Formatore non valido."));
    if (!signatureCache.has(name)) {
      signatureCache.set(name, (async () => {
        let bytes;
        const offlineValue = window.__BEOX_SIGNATURE_BASE64?.[name];
        if (offlineValue) {
          bytes = bytesFromBase64(offlineValue);
        } else {
          const response = await fetch(TRAINERS[name]);
          if (!response.ok) throw new Error(`Impossibile caricare la firma di ${name}.`);
          bytes = new Uint8Array(await response.arrayBuffer());
        }
        return normalizeSignature(bytes);
      })());
    }
    return signatureCache.get(name);
  }

  function syncTrainerOptions() {
    for (const option of trainerOneInput.options) {
      option.disabled = Boolean(option.value && option.value === trainerTwoInput.value);
    }
    for (const option of trainerTwoInput.options) {
      option.disabled = Boolean(option.value && option.value === trainerOneInput.value);
    }
  }

  async function updateSignaturePreviews() {
    const request = ++signaturePreviewRequest;
    const selections = [
      [trainerOneInput.value, previewTrainerOneSignature],
      [trainerTwoInput.value, previewTrainerTwoSignature],
    ];

    await Promise.all(selections.map(async ([name, image]) => {
      if (!name) {
        image.hidden = true;
        image.removeAttribute("src");
        image.alt = "";
        return;
      }
      image.hidden = true;
      image.alt = "";
      try {
        const asset = await loadSignature(name);
        if (request !== signaturePreviewRequest) return;
        image.src = asset.previewUrl;
        image.alt = `Firma di ${name}`;
        image.hidden = false;
      } catch (error) {
        if (request === signaturePreviewRequest) {
          image.hidden = true;
          setMessage(error?.message || "Impossibile caricare una firma.", "error");
        }
      }
    }));
  }

  function updatePreview() {
    previewDate.textContent = formatDate(dateInput.value);
    const trainerOne = trainerOneInput.value.toUpperCase() || "FORMATORE 1";
    const trainerTwo = trainerTwoInput.value.toUpperCase() || "FORMATORE 2";

    previewTrainerOneRight.textContent = trainerOne;
    previewTrainerTwoRight.textContent = trainerTwo;
    syncTrainerOptions();
    void updateSignaturePreviews();

    try {
      localStorage.setItem(
        "beox-attestati-settings",
        JSON.stringify({
          date: dateInput.value,
          trainerOne: trainerOneInput.value,
          trainerTwo: trainerTwoInput.value,
          fileName: fileNameInput.value,
        }),
      );
    } catch (_) {
      // L'app continua a funzionare anche se il browser blocca localStorage.
    }
  }

  function restoreSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("beox-attestati-settings") || "null");
      if (!saved) return;
      dateInput.value = saved.date || "";
      trainerOneInput.value = TRAINERS[saved.trainerOne] ? saved.trainerOne : "";
      trainerTwoInput.value = TRAINERS[saved.trainerTwo] ? saved.trainerTwo : "";
      fileNameInput.value = saved.fileName || "attestati-beox";
    } catch (_) {
      // Dati locali non validi: si parte con il modulo vuoto.
    }
  }

  async function handleLogoSelection() {
    setMessage();
    const file = logoInput.files?.[0];
    logoState = null;

    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
      logoPreviewUrl = null;
    }

    if (!file) {
      previewLogo.hidden = true;
      uploadLabel.textContent = "Scegli un logo PNG o JPEG";
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    const isPng = file.type === "image/png" || extension === "png";
    const isJpeg = file.type === "image/jpeg" || extension === "jpg" || extension === "jpeg";

    if (!isPng && !isJpeg) {
      logoInput.value = "";
      previewLogo.hidden = true;
      uploadLabel.textContent = "Scegli un logo PNG o JPEG";
      setMessage("Il logo deve essere in formato PNG, JPG o JPEG.", "error");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      logoInput.value = "";
      previewLogo.hidden = true;
      uploadLabel.textContent = "Scegli un logo PNG o JPEG";
      setMessage("Il logo supera 10 MB. Scegli un'immagine più leggera.", "error");
      return;
    }

    logoState = {
      bytes: new Uint8Array(await file.arrayBuffer()),
      type: isPng ? "png" : "jpeg",
      name: file.name,
    };

    logoPreviewUrl = URL.createObjectURL(file);
    previewLogo.src = logoPreviewUrl;
    previewLogo.hidden = false;
    uploadLabel.textContent = file.name;
  }

  function fitTextSize(text, font, maxSize, minSize, maxWidth) {
    let size = maxSize;
    while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
      size -= 0.5;
    }
    return size;
  }

  function drawCenteredText(page, text, font, options) {
    const size = fitTextSize(text, font, options.maxSize, options.minSize, options.width);
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: options.x + (options.width - textWidth) / 2,
      y: options.y,
      size,
      font,
      color: options.color,
    });
  }

  function drawLine(page, x1, y, x2) {
    page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      thickness: 0.8,
      color: BLUE,
    });
  }

  async function getTemplateBytes() {
    if (window.__BEOX_TEMPLATE_BASE64) {
      const binary = atob(window.__BEOX_TEMPLATE_BASE64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }

    const response = await fetch("./assets/attestato-template.pdf");
    if (!response.ok) throw new Error("Impossibile caricare il modello dell'attestato.");
    return new Uint8Array(await response.arrayBuffer());
  }

  async function generatePdf(participants) {
    const templateBytes = await getTemplateBytes();
    const templatePdf = await PDFDocument.load(templateBytes);
    const outputPdf = await PDFDocument.create();
    const boldFont = await outputPdf.embedFont(StandardFonts.HelveticaBold);
    const embeddedLogo = logoState.type === "png"
      ? await outputPdf.embedPng(logoState.bytes)
      : await outputPdf.embedJpg(logoState.bytes);
    const signatureAssets = await Promise.all([
      loadSignature(trainerOneInput.value),
      loadSignature(trainerTwoInput.value),
    ]);
    const embeddedSignatures = await Promise.all(
      signatureAssets.map((asset) => outputPdf.embedPng(asset.bytes)),
    );

    const formattedDate = formatDate(dateInput.value);
    const trainerOne = trainerOneInput.value.toUpperCase();
    const trainerTwo = trainerTwoInput.value.toUpperCase();

    outputPdf.setTitle("Attestati BeOx");
    outputPdf.setAuthor("BeOx");
    outputPdf.setSubject("Attestati personalizzati A4 orizzontale");
    outputPdf.setProducer("BeOx - Generatore attestati");
    outputPdf.setCreationDate(new Date());

    for (let index = 0; index < participants.length; index += 1) {
      const [page] = await outputPdf.copyPages(templatePdf, [0]);
      outputPdf.addPage(page);

      drawCenteredText(page, participants[index].toUpperCase(), boldFont, {
        x: 190,
        y: 365,
        width: 462,
        maxSize: 22,
        minSize: 11,
        color: GREY,
      });

      const logoMaxWidth = 170;
      const logoMaxHeight = 54;
      const naturalScale = Math.min(
        logoMaxWidth / embeddedLogo.width,
        logoMaxHeight / embeddedLogo.height,
      );
      const logoWidth = embeddedLogo.width * naturalScale;
      const logoHeight = embeddedLogo.height * naturalScale;
      page.drawImage(embeddedLogo, {
        x: 185 - logoWidth / 2,
        y: 122,
        width: logoWidth,
        height: logoHeight,
      });

      drawLine(page, 90, 110, 280);
      drawCenteredText(page, formattedDate, boldFont, {
        x: 90,
        y: 92,
        width: 190,
        maxSize: 8.5,
        minSize: 8.5,
        color: GREY,
      });

      const signatureY = 110;
      const nameY = 92;
      const firstX = 515;
      const secondX = 645;
      const lineWidth = 115;

      page.drawImage(embeddedSignatures[0], {
        x: firstX + 3.5,
        y: signatureY + 3,
        width: 108,
        height: 32.4,
      });
      page.drawImage(embeddedSignatures[1], {
        x: secondX + 3.5,
        y: signatureY + 3,
        width: 108,
        height: 32.4,
      });

      drawLine(page, firstX, signatureY, firstX + lineWidth);
      drawLine(page, secondX, signatureY, secondX + lineWidth);
      drawCenteredText(page, trainerOne, boldFont, {
        x: firstX,
        y: nameY,
        width: lineWidth,
        maxSize: 8.5,
        minSize: 8.5,
        color: GREY,
      });
      drawCenteredText(page, trainerTwo, boldFont, {
        x: secondX,
        y: nameY,
        width: lineWidth,
        maxSize: 8.5,
        minSize: 8.5,
        color: GREY,
      });

      if ((index + 1) % 10 === 0) {
        setMessage(`Preparazione pagina ${index + 1} di ${participants.length}…`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    return outputPdf.save({ useObjectStreams: false });
  }

  function sanitizeFileName(value) {
    const cleaned = value
      .trim()
      .replace(/\.pdf$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return cleaned || "attestati-beox";
  }

  function downloadPdf(bytes, fileName) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFileName(fileName)}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage();

    const participants = parseParticipants(participantsInput.value);
    if (!participants.length) {
      setMessage("Incolla almeno un partecipante.", "error");
      participantsInput.focus();
      return;
    }
    if (!dateInput.value) {
      setMessage("Seleziona la data dell'attività.", "error");
      dateInput.focus();
      return;
    }
    if (!logoState) {
      setMessage("Carica il logo dell'azienda in formato PNG o JPEG.", "error");
      logoInput.focus();
      return;
    }
    if (!trainerOneInput.value || !trainerTwoInput.value) {
      setMessage("Seleziona entrambi i formatori.", "error");
      (!trainerOneInput.value ? trainerOneInput : trainerTwoInput).focus();
      return;
    }
    if (trainerOneInput.value === trainerTwoInput.value) {
      setMessage("Seleziona due formatori diversi.", "error");
      trainerTwoInput.focus();
      return;
    }

    generateButton.disabled = true;
    generateButton.querySelector("span:first-child").textContent = "Creazione in corso…";
    setMessage(`Preparazione di ${participants.length} pagine…`);

    try {
      const pdfBytes = await generatePdf(participants);
      downloadPdf(pdfBytes, fileNameInput.value);
      setMessage(`PDF creato: ${participants.length} ${participants.length === 1 ? "pagina" : "pagine"}.`, "success");
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "Non è stato possibile creare il PDF.", "error");
    } finally {
      generateButton.disabled = false;
      generateButton.querySelector("span:first-child").textContent = "Genera PDF";
    }
  }

  restoreSettings();
  updateCount();
  updatePreview();

  participantsInput.addEventListener("input", updateCount);
  dateInput.addEventListener("input", updatePreview);
  trainerOneInput.addEventListener("change", updatePreview);
  trainerTwoInput.addEventListener("change", updatePreview);
  fileNameInput.addEventListener("input", updatePreview);
  logoInput.addEventListener("change", handleLogoSelection);
  form.addEventListener("submit", handleSubmit);
})();
