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

  // ---------- robust Google Fonts embedding ----------
  // html-to-image's built-in font auto-detection can be unreliable
  // (it has to guess which @font-face rules apply to the captured
  // node). Instead, we fetch the exact Google Fonts stylesheet we
  // already load in <head>, download every referenced font file
  // ourselves, and rewrite the CSS to use base64 data URIs. This
  // gives html-to-image a guaranteed-correct, self-contained
  // stylesheet to embed — no auto-detection involved.

  let cachedFontEmbedCssPromise = null;

  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function guessFontMime(url) {
    if (url.endsWith(".woff2")) return "font/woff2";
    if (url.endsWith(".woff")) return "font/woff";
    if (url.endsWith(".ttf")) return "font/ttf";
    return "application/octet-stream";
  }

  async function buildEmbeddedGoogleFontCss() {
    const link = document.querySelector('link[href*="fonts.googleapis.com"]');
    if (!link) throw new Error("Google Fonts <link> not found");

    const cssRes = await fetch(link.href, { mode: "cors" });
    if (!cssRes.ok) throw new Error(`Google Fonts CSS fetch failed: ${cssRes.status}`);
    let cssText = await cssRes.text();

    const urlRegex = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;
    const fontUrls = [...new Set([...cssText.matchAll(urlRegex)].map((m) => m[1]))];

    await Promise.all(
      fontUrls.map(async (fontUrl) => {
        const fontRes = await fetch(fontUrl, { mode: "cors" });
        if (!fontRes.ok) throw new Error(`Font file fetch failed: ${fontUrl}`);
        const buf = await fontRes.arrayBuffer();
        const dataUri = `data:${guessFontMime(fontUrl)};base64,${arrayBufferToBase64(buf)}`;
        cssText = cssText.split(fontUrl).join(dataUri);
      })
    );

    return cssText;
  }

  // Computed once and reused for every export in this session.
  async function getFontEmbedCss() {
    if (!cachedFontEmbedCssPromise) {
      cachedFontEmbedCssPromise = buildEmbeddedGoogleFontCss().catch(async (err) => {
        console.warn("Custom font embedding failed, falling back to html-to-image's auto-detection.", err);
        cachedFontEmbedCssPromise = null; // allow retry next time
        return htmlToImage.getFontEmbedCSS(el.paper);
      });
    }
    return cachedFontEmbedCssPromise;
  }

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
      // from our own robust fetch-and-inline routine. This is what
      // lets the exported file keep BIZ UDGothic / BIZ UDMincho
      // instead of silently substituting a system font.
      const fontEmbedCss = await getFontEmbedCss();

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
