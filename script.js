(() => {
  "use strict";

  // ---------- element refs ----------
  const el = {
    labelA: document.getElementById("labelA"),
    labelB: document.getElementById("labelB"),
    resourceTitle: document.getElementById("resourceTitle"),
    resourceBody: document.getElementById("resourceBody"),
    questionText: document.getElementById("questionText"),
    fontBody: document.getElementById("fontBody"),
    fontUI: document.getElementById("fontUI"),
    paperWidth: document.getElementById("paperWidth"),
    fontSize: document.getElementById("fontSize"),

    paper: document.getElementById("capture-area"),
    prevInstruction: document.getElementById("prevInstruction"),
    prevTitle: document.getElementById("prevTitle"),
    prevBody: document.getElementById("prevBody"),
    prevChoices: document.getElementById("prevChoices"),

    downloadBtn: document.getElementById("downloadBtn"),
    statusNote: document.getElementById("statusNote"),
    exportFormat: document.getElementById("exportFormat"),
    exportScale: document.getElementById("exportScale"),
    scaleField: document.getElementById("scaleField"),
  };

  const choiceRows = Array.from(document.querySelectorAll(".choice-row"));

  // ---------- helpers ----------

  // Safely turn a template containing the literal tokens {a} / {b}
  // into a DocumentFragment where each token becomes a boxed <span>.
  // Everything else is inserted as plain text (never as HTML), so
  // user input can never break out into markup.
  function buildInlineNodes(template, labelA, labelB) {
    const frag = document.createDocumentFragment();
    const safeA = labelA && labelA.trim() ? labelA.trim() : "a";
    const safeB = labelB && labelB.trim() ? labelB.trim() : "b";
    const parts = String(template ?? "").split(/(\{a\}|\{b\})/g);

    parts.forEach((part) => {
      if (part === "{a}" || part === "{b}") {
        const span = document.createElement("span");
        span.className = "blank-box";
        span.textContent = part === "{a}" ? safeA : safeB;
        frag.appendChild(span);
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    });
    return frag;
  }

  function setChildren(node, fragment) {
    node.replaceChildren(fragment);
  }

  function applyFontClass(node, mode) {
    node.classList.remove("font-gothic", "font-mincho");
    node.classList.add(mode === "gothic" ? "font-gothic" : "font-mincho");
  }

  // ---------- main render ----------
  function render() {
    const labelA = el.labelA.value;
    const labelB = el.labelB.value;

    // instruction line
    setChildren(
      el.prevInstruction,
      buildInlineNodes(el.questionText.value, labelA, labelB)
    );
    applyFontClass(el.prevInstruction, el.fontUI.value);

    // resource title
    el.prevTitle.textContent = el.resourceTitle.value.trim();
    applyFontClass(el.prevTitle, el.fontBody.value);

    // resource body
    setChildren(
      el.prevBody,
      buildInlineNodes(el.resourceBody.value, labelA, labelB)
    );
    applyFontClass(el.prevBody, el.fontBody.value);

    // choices
    el.prevChoices.replaceChildren();
    choiceRows.forEach((row) => {
      const symbol = row.dataset.symbol;
      const valA = row.querySelector(".choiceA").value.trim();
      const valB = row.querySelector(".choiceB").value.trim();

      const line = document.createElement("div");
      line.className = "choice-line";
      applyFontClass(line, el.fontUI.value);

      const symbolSpan = document.createElement("span");
      symbolSpan.className = "choice-line__symbol";
      symbolSpan.textContent = symbol;
      line.appendChild(symbolSpan);

      const partA = document.createElement("span");
      partA.textContent = `${labelA || "a"}＝${valA}`;
      line.appendChild(partA);

      const partB = document.createElement("span");
      partB.textContent = `${labelB || "b"}＝${valB}`;
      line.appendChild(partB);

      el.prevChoices.appendChild(line);
    });

    // sizing
    el.paper.style.maxWidth = `${el.paperWidth.value}px`;
    el.paper.style.setProperty("--doc-font-size", `${el.fontSize.value}px`);
  }

  // wire up live updates
  const watchedInputs = [
    el.labelA, el.labelB, el.resourceTitle, el.resourceBody, el.questionText,
    el.fontBody, el.fontUI, el.paperWidth, el.fontSize,
    ...choiceRows.flatMap((r) => [r.querySelector(".choiceA"), r.querySelector(".choiceB")]),
  ];
  watchedInputs.forEach((input) => {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });

  render();

  // ---------- font readiness ----------
  function setStatus(text, mode) {
    el.statusNote.textContent = text;
    el.statusNote.classList.remove("is-ready", "is-error");
    if (mode) el.statusNote.classList.add(mode);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      setStatus("フォントの読み込みが完了しました。画像を生成できます。", "is-ready");
    });
  } else {
    setStatus("画像を生成できます。", "is-ready");
  }

  el.exportFormat.addEventListener("change", () => {
    el.scaleField.style.display = el.exportFormat.value === "svg" ? "none" : "";
  });

  // ---------- export ----------
  function triggerDownload(href, filename) {
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function timestamp() {
    return new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  }

  async function exportPng(pixelRatio, fontEmbedCss) {
    const dataUrl = await htmlToImage.toPng(el.paper, {
      backgroundColor: "#ffffff",
      pixelRatio,
      cacheBust: true,
      fontEmbedCss,
    });
    triggerDownload(dataUrl, `mondai_${timestamp()}.png`);
  }

  async function exportSvg(fontEmbedCss) {
    const dataUrl = await htmlToImage.toSvg(el.paper, {
      backgroundColor: "#ffffff",
      cacheBust: true,
      fontEmbedCss,
    });
    triggerDownload(dataUrl, `mondai_${timestamp()}.svg`);
  }

  async function exportPdf(pixelRatio, fontEmbedCss) {
    const rect = el.paper.getBoundingClientRect();
    const dataUrl = await htmlToImage.toPng(el.paper, {
      backgroundColor: "#ffffff",
      pixelRatio,
      cacheBust: true,
      fontEmbedCss,
    });

    // CSS px -> pt (1px = 0.75pt at 96dpi). Page size follows the sheet's
    // on-screen size; pixelRatio only affects the embedded image's resolution.
    const widthPt = rect.width * 0.75;
    const heightPt = rect.height * 0.75;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: widthPt >= heightPt ? "landscape" : "portrait",
      unit: "pt",
      format: [widthPt, heightPt],
    });
    pdf.addImage(dataUrl, "PNG", 0, 0, widthPt, heightPt, undefined, "FAST");
    pdf.save(`mondai_${timestamp()}.pdf`);
  }

  // Force the browser to actually fetch every weight of both custom
  // fonts before we ask html-to-image to embed them. Without this,
  // a weight that has never been used on screen (e.g. a bold variant
  // only needed for an empty/optional field) may be missing from
  // document.fonts, and the exporter silently falls back to a
  // system font for it.
  async function ensureFontsLoaded() {
    if (!(document.fonts && document.fonts.load)) return;
    const specs = [
      '400 16px "BIZ UDGothic"',
      '700 16px "BIZ UDGothic"',
      '400 16px "BIZ UDMincho"',
      '700 16px "BIZ UDMincho"',
    ];
    await Promise.all(specs.map((s) => document.fonts.load(s).catch(() => null)));
    if (document.fonts.ready) await document.fonts.ready;
  }

  async function downloadImage() {
    if (typeof htmlToImage === "undefined") {
      setStatus("画像生成ライブラリの読み込みに失敗しました。ネットワーク接続を確認してください。", "is-error");
      return;
    }

    el.downloadBtn.disabled = true;
    const format = el.exportFormat.value;
    setStatus(
      format === "svg" ? "SVGを書き出しています…" : "画像を生成しています…"
    );

    try {
      await ensureFontsLoaded();

      // Pre-build the embeddable font CSS (base64 font data) once,
      // from stylesheets that actually apply to the paper element.
      // This is what lets the exported file keep BIZ UDGothic /
      // BIZ UDMincho instead of silently substituting a system font.
      const fontEmbedCss = await htmlToImage.getFontEmbedCSS(el.paper);

      const scale = Number(el.exportScale.value) || 3;

      if (format === "png") {
        await exportPng(scale, fontEmbedCss);
      } else if (format === "svg") {
        await exportSvg(fontEmbedCss);
      } else if (format === "pdf") {
        if (typeof window.jspdf === "undefined") {
          throw new Error("jsPDF not loaded");
        }
        await exportPdf(scale, fontEmbedCss);
      }

      setStatus("書き出しが完了しました。", "is-ready");
    } catch (err) {
      console.error(err);
      setStatus("書き出しに失敗しました。時間をおいて再度お試しください。", "is-error");
    } finally {
      el.downloadBtn.disabled = false;
    }
  }

  el.downloadBtn.addEventListener("click", downloadImage);
})();
