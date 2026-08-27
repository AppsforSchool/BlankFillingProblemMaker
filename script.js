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

  // ---------- export ----------
  async function downloadImage() {
    if (typeof html2canvas === "undefined") {
      setStatus("画像生成ライブラリの読み込みに失敗しました。ネットワーク接続を確認してください。", "is-error");
      return;
    }

    el.downloadBtn.disabled = true;
    setStatus("画像を生成しています…");

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const canvas = await html2canvas(el.paper, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      link.href = dataUrl;
      link.download = `mondai_${stamp}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setStatus("画像をダウンロードしました。", "is-ready");
    } catch (err) {
      console.error(err);
      setStatus("画像の生成に失敗しました。時間をおいて再度お試しください。", "is-error");
    } finally {
      el.downloadBtn.disabled = false;
    }
  }

  el.downloadBtn.addEventListener("click", downloadImage);
})();
