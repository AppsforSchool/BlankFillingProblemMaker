/* ============================================================
   入試問題ジェネレーター - script.js
   全てクライアントサイドで完結（サーバー送信なし）
   ============================================================ */

(function () {
  'use strict';

  const container = document.getElementById('pages-container');
  const exportStage = document.getElementById('export-stage');
  const imageFileInput = document.getElementById('image-file-input');
  const loadJsonInput = document.getElementById('load-json-input');
  const zoomLevelLabel = document.getElementById('zoom-level');

  let zoom = 1;
  let activePage = null;          // last page the user interacted with
  let pendingImageTarget = null;  // context captured before opening the file picker

  /* ------------------------------------------------------------
     Small helpers
  ------------------------------------------------------------ */
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function toCircled(n) {
    if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
    if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21);
    return '(' + n + ')';
  }

  const KANA = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ'];

  function closestInPage(node, selector) {
    if (!node) return null;
    const elNode = node.nodeType === 3 ? node.parentElement : node;
    if (!elNode || !elNode.closest) return null;
    return elNode.closest(selector);
  }

  function isInsidePage(node) {
    return !!closestInPage(node, '.page');
  }

  function placeCaretAfter(node) {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function focusEl(node) {
    if (!node) return;
    node.focus();
    // place caret at end
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ------------------------------------------------------------
     Context detection (which page / qblock / subq the user is in)
  ------------------------------------------------------------ */
  function getContext() {
    let activeElement = document.activeElement;
    let page = closestInPage(activeElement, '.page');
    if (!page) page = activePage;
    if (!page || !document.body.contains(page)) return { page: null };

    const qblockRaw = closestInPage(activeElement, '.qblock');
    const qblock = qblockRaw && page.contains(qblockRaw) ? qblockRaw : null;
    const qbody = qblock ? qblock.querySelector(':scope > .qbody') : null;
    const qsubs = qbody ? qbody.querySelector(':scope > .qsubs') : null;

    const subqRaw = closestInPage(activeElement, '.subq');
    const subq = subqRaw && page.contains(subqRaw) ? subqRaw : null;

    return { page, qblock, qbody, qsubs, subq };
  }

  /* ------------------------------------------------------------
     Block control bar (↑ ↓ × and type-specific buttons)
  ------------------------------------------------------------ */
  function controlsHtml(type) {
    let extra = '';
    if (type === 'choices') extra = '<button data-act="add-choice" title="選択肢を追加">＋</button>';
    if (type === 'refbox') extra = '<button data-act="toggle-float" title="配置切替（全幅／右寄せ）">⇔</button>';
    if (type === 'infobox-grid') extra = '<button data-act="add-box" title="ボックスを追加">□＋</button>';
    return (
      '<div class="block-controls" contenteditable="false">' +
      '<button data-act="up" title="上へ">↑</button>' +
      '<button data-act="down" title="下へ">↓</button>' +
      extra +
      '<button data-act="del" title="削除">×</button>' +
      '</div>'
    );
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.block-controls button');
    if (!btn) return;
    e.preventDefault();
    const block = btn.closest('.block');
    if (!block) return;
    const act = btn.dataset.act;
    if (act === 'up') {
      const prev = block.previousElementSibling;
      if (prev) block.parentNode.insertBefore(block, prev);
    } else if (act === 'down') {
      const next = block.nextElementSibling;
      if (next) block.parentNode.insertBefore(next, block);
    } else if (act === 'del') {
      if (confirm('この部品を削除しますか？')) block.remove();
    } else if (act === 'add-choice') {
      addChoiceItem(block);
    } else if (act === 'toggle-float') {
      block.classList.toggle('ref-right');
    } else if (act === 'add-box') {
      const box = block.querySelector('.infobox');
      const clone = box.cloneNode(true);
      clone.querySelectorAll('[contenteditable]').forEach((n) => {
        if (n.classList.contains('infobox-title')) n.textContent = '見出し';
        if (n.classList.contains('infobox-body')) n.textContent = '本文を入力してください。';
      });
      block.appendChild(clone);
    }
    scheduleOverflowCheck();
  });

  function addChoiceItem(choicesBlock) {
    const items = choicesBlock.querySelectorAll('.choice-item');
    const idx = items.length;
    const item = el(
      '<span class="choice-item"><span class="kana" contenteditable="false">' +
        (KANA[idx] || '?') +
        '</span><span class="choice-text" contenteditable="true">選択肢' + (idx + 1) + '</span></span>'
    );
    choicesBlock.appendChild(item);
  }

  /* ------------------------------------------------------------
     Templates
  ------------------------------------------------------------ */
  function buildQuestionPage(pageNumber) {
    return el(
      '<div class="page-frame"><div class="page page-type-question">' +
        '<div class="page-inner"></div>' +
        '<div class="page-number" contenteditable="true">－' + pageNumber + '－</div>' +
        '<div class="page-code" contenteditable="true">◇◇◇（000－00）</div>' +
      '</div></div>'
    );
  }

  function buildCoverPage() {
    return el(
      '<div class="page-frame"><div class="page page-type-cover">' +
        '<div class="cover-page">' +
          '<div class="cover-year" contenteditable="true">令和　　年度</div>' +
          '<div class="cover-titles">' +
            '<div class="cover-kind" contenteditable="true">学　力　検　査</div>' +
            '<div class="cover-subject" contenteditable="true">教　科　名</div>' +
          '</div>' +
          '<div class="cover-notes-title" contenteditable="true">注　　意</div>' +
          '<div class="cover-notes-box" contenteditable="true">' +
            '<ol>' +
              '<li>指示があるまでは、この冊子を開いてはいけません。</li>' +
              '<li>解答用紙は、この冊子の中に、はさんであります。</li>' +
              '<li>答えは、全て解答用紙に記入しなさい。</li>' +
              '<li>検査問題は　ページで、問題は　１　から　　まであります。</li>' +
            '</ol>' +
          '</div>' +
        '</div>' +
        '<div class="page-code" contenteditable="true">◇◇◇（000－00）</div>' +
      '</div></div>'
    );
  }

  function buildDividerPage() {
    return el(
      '<div class="page-frame"><div class="page page-type-divider">' +
        '<div class="cover-page">' +
          '<div class="cover-year" contenteditable="true">令和　　年度</div>' +
          '<div class="cover-titles">' +
            '<div class="cover-kind" contenteditable="true">検　査　問　題</div>' +
            '<div class="cover-subject" contenteditable="true">教　科　名</div>' +
          '</div>' +
        '</div>' +
        '<div class="page-code" contenteditable="true">◇◇◇（000－00）</div>' +
      '</div></div>'
    );
  }

  function buildDaimon(num) {
    return el(
      '<div class="block qblock" data-block="qblock">' +
        controlsHtml('qblock') +
        '<div class="qnum-box" contenteditable="true">' + num + '</div>' +
        '<div class="qbody">' +
          '<div class="qlead" contenteditable="true">（ここに大問のリード文を入力してください。）</div>' +
          '<div class="qsubs"></div>' +
        '</div>' +
      '</div>'
    );
  }

  function buildBox(cols) {
    const box =
      '<div class="infobox">' +
        '<div class="infobox-title" contenteditable="true">見出し</div>' +
        '<div class="infobox-body" contenteditable="true">本文を入力してください。</div>' +
      '</div>';
    if (cols === 2) {
      return el(
        '<div class="block infobox-grid" data-block="infobox-grid">' +
          controlsHtml('infobox-grid') + box + box +
        '</div>'
      );
    }
    return el(
      '<div class="block infobox-single" data-block="infobox-single">' +
        controlsHtml('infobox-single') + box +
      '</div>'
    );
  }

  function buildSubq(num) {
    return el(
      '<div class="block subq" data-block="subq">' +
        controlsHtml('subq') +
        '<span class="subq-label" contenteditable="true">' + num + '</span>' +
        '<span class="subq-prompt" contenteditable="true">　設問文を入力してください。［［Ⅰ］］のように二重角括弧で空欄になります。</span>' +
      '</div>'
    );
  }

  function buildChoices() {
    const items = [0, 1, 2, 3]
      .map(
        (i) =>
          '<span class="choice-item"><span class="kana" contenteditable="false">' +
          KANA[i] +
          '</span><span class="choice-text" contenteditable="true">選択肢' + (i + 1) + '</span></span>'
      )
      .join('');
    return el(
      '<div class="block choices choices-block" data-block="choices">' +
        controlsHtml('choices') + items +
      '</div>'
    );
  }

  function buildRefBox() {
    return el(
      '<div class="block ref-box" data-block="refbox">' +
        controlsHtml('refbox') +
        '<div class="ref-title" contenteditable="true">［資料］</div>' +
        '<div class="ref-body" contenteditable="true">資料の内容を入力してください。</div>' +
      '</div>'
    );
  }

  function buildFreeImage(dataUrl) {
    return el(
      '<div class="block free-image" data-block="free-image" style="width:55mm;height:38mm;">' +
        controlsHtml('free-image') +
        '<img src="' + dataUrl + '" contenteditable="false">' +
      '</div>'
    );
  }

  /* ------------------------------------------------------------
     Inline markup post-processing (turn [[ ]] typed as plain text
     is NOT auto-converted; instead we insert the .blank span
     directly via the toolbar. The following converts double-bracket
     text typed manually, as a convenience, on blur.)
  ------------------------------------------------------------ */
  function autoConvertBlanksIn(node) {
    if (!node) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    let n;
    while ((n = walker.nextNode())) {
      if (/\[\[.*?\]\]/.test(n.nodeValue)) targets.push(n);
    }
    targets.forEach((textNode) => {
      const parts = textNode.nodeValue.split(/(\[\[.*?\]\])/g);
      if (parts.length <= 1) return;
      const frag = document.createDocumentFragment();
      parts.forEach((p) => {
        const m = p.match(/^\[\[(.*?)\]\]$/);
        if (m) {
          const span = document.createElement('span');
          span.className = 'blank';
          span.contentEditable = 'true';
          span.textContent = m[1] || '\u3000';
          frag.appendChild(span);
        } else if (p) {
          frag.appendChild(document.createTextNode(p));
        }
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  container.addEventListener(
    'blur',
    function (e) {
      const t = e.target;
      if (t && t.isContentEditable) autoConvertBlanksIn(t);
    },
    true
  );

  /* ------------------------------------------------------------
     Toolbar actions
  ------------------------------------------------------------ */
  function alertCtx(msg) {
    alert(msg);
  }

  const actions = {
    'add-question-page': function () {
      const count = document.querySelectorAll('.page-type-question').length + 1;
      const frame = buildQuestionPage(count);
      container.appendChild(frame);
      activePage = frame.querySelector('.page');
      scheduleOverflowCheck();
    },
    'add-cover-page': function () {
      const frame = buildCoverPage();
      container.appendChild(frame);
      activePage = frame.querySelector('.page');
    },
    'add-divider-page': function () {
      const frame = buildDividerPage();
      container.appendChild(frame);
      activePage = frame.querySelector('.page');
    },
    'insert-daimon': function () {
      const ctx = getContext();
      if (!ctx.page) return alertCtx('先に「＋問題ページ」でページを追加し、その中をクリックしてください。');
      const pageInner = ctx.page.querySelector('.page-inner');
      if (!pageInner) return alertCtx('この種類のページには大問を追加できません。問題ページを選んでください。');
      const num = document.querySelectorAll('.qnum-box').length + 1;
      const node = buildDaimon(num);
      if (ctx.qblock) ctx.qblock.after(node);
      else pageInner.appendChild(node);
      focusEl(node.querySelector('.qlead'));
      scheduleOverflowCheck();
    },
    'insert-box2': function () { insertBox(2); },
    'insert-box1': function () { insertBox(1); },
    'insert-subq': function () {
      const ctx = getContext();
      if (!ctx.qsubs) return alertCtx('先に大問枠の中をクリックしてください（大問枠がない場合は「大問枠」を追加してください）。');
      const num = ctx.qsubs.querySelectorAll(':scope > .subq').length + 1;
      const node = buildSubq(num);
      if (ctx.subq && ctx.qsubs.contains(ctx.subq)) ctx.subq.after(node);
      else ctx.qsubs.appendChild(node);
      focusEl(node.querySelector('.subq-prompt'));
      scheduleOverflowCheck();
    },
    'insert-choices': function () {
      const ctx = getContext();
      const target = ctx.subq || ctx.qbody;
      if (!target) return alertCtx('先に設問（または大問）の中をクリックしてください。');
      const node = buildChoices();
      target.appendChild(node);
      scheduleOverflowCheck();
    },
    'insert-refbox': function () {
      const ctx = getContext();
      const target = ctx.subq || ctx.qbody;
      if (!target) return alertCtx('先に設問（または大問）の中をクリックしてください。');
      const node = buildRefBox();
      target.appendChild(node);
      scheduleOverflowCheck();
    },
    'insert-blank': function () {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !isInsidePage(sel.anchorNode)) {
        return alertCtx('本文中の挿入したい位置をクリック（または語句を選択）してから押してください。');
      }
      const range = sel.getRangeAt(0);
      let text = '\u3000';
      if (!sel.isCollapsed) {
        text = range.toString();
        range.deleteContents();
      }
      const span = document.createElement('span');
      span.className = 'blank';
      span.contentEditable = 'true';
      span.textContent = text;
      range.insertNode(span);
      placeCaretAfter(span);
      scheduleOverflowCheck();
    },
    'insert-underline': function () {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !isInsidePage(sel.anchorNode)) {
        return alertCtx('下線を引きたい語句を選択してから押してください。');
      }
      const range = sel.getRangeAt(0);
      const suggestion = document.querySelectorAll('.circ').length + 1;
      const input = prompt('丸数字の番号を入力してください', String(suggestion));
      if (input === null) return;
      const n = parseInt(input, 10);
      if (!n || n < 1) return;
      const text = range.toString();
      range.deleteContents();
      const circ = document.createElement('span');
      circ.className = 'circ';
      circ.contentEditable = 'false';
      circ.textContent = toCircled(n);
      const ul = document.createElement('span');
      ul.className = 'ul';
      ul.contentEditable = 'true';
      ul.textContent = text;
      const frag = document.createDocumentFragment();
      frag.appendChild(circ);
      frag.appendChild(ul);
      range.insertNode(frag);
      placeCaretAfter(ul);
      scheduleOverflowCheck();
    },
    'insert-bold': function () {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !isInsidePage(sel.anchorNode)) {
        return alertCtx('太字にしたい語句を選択してから押してください。');
      }
      const range = sel.getRangeAt(0);
      const b = document.createElement('b');
      try {
        range.surroundContents(b);
      } catch (err) {
        const text = range.toString();
        range.deleteContents();
        b.textContent = text;
        range.insertNode(b);
      }
      placeCaretAfter(b);
    },
    'insert-image': function () {
      pendingImageTarget = getContext();
      pendingImageTarget.activeElement = document.activeElement;
      imageFileInput.value = '';
      imageFileInput.click();
    },
  };

  function insertBox(cols) {
    const ctx = getContext();
    if (!ctx.qbody) return alertCtx('先に大問枠の中をクリックしてください（大問枠がない場合は「大問枠」を追加してください）。');
    const node = buildBox(cols);
    const qsubs = ctx.qbody.querySelector(':scope > .qsubs');
    if (qsubs) ctx.qbody.insertBefore(node, qsubs);
    else ctx.qbody.appendChild(node);
    scheduleOverflowCheck();
  }

  imageFileInput.addEventListener('change', function () {
    const file = imageFileInput.files && imageFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const dataUrl = reader.result;
      const activeEl = pendingImageTarget && pendingImageTarget.activeElement;
      if (
        activeEl &&
        activeEl.isContentEditable &&
        (activeEl.classList.contains('ref-body') ||
          activeEl.classList.contains('infobox-body') ||
          activeEl.classList.contains('qlead'))
      ) {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.maxWidth = '100%';
        activeEl.appendChild(document.createElement('br'));
        activeEl.appendChild(img);
      } else {
        const ctx = pendingImageTarget || {};
        const target = ctx.subq || ctx.qbody || (ctx.page && ctx.page.querySelector('.page-inner'));
        if (!target) {
          alertCtx('先にページ内をクリックしてから画像を挿入してください。');
          return;
        }
        target.appendChild(buildFreeImage(dataUrl));
      }
      scheduleOverflowCheck();
    };
    reader.readAsDataURL(file);
  });

  document.querySelectorAll('#toolbar button[data-action]').forEach((btn) => {
    // Prevent the button from stealing focus / collapsing the text selection
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const fn = actions[btn.dataset.action];
      if (fn) fn();
    });
  });

  /* ------------------------------------------------------------
     Track which page the user last clicked in (for context)
  ------------------------------------------------------------ */
  container.addEventListener('click', function (e) {
    const page = e.target.closest('.page');
    if (page) activePage = page;
  });

  /* ------------------------------------------------------------
     Zoom
  ------------------------------------------------------------ */
  function applyZoom() {
    document.documentElement.style.setProperty('--scale', zoom.toFixed(2));
    zoomLevelLabel.textContent = Math.round(zoom * 100) + '%';
  }
  document.querySelector('[data-action="zoom-in"]').addEventListener('click', () => {
    zoom = Math.min(2, zoom + 0.1);
    applyZoom();
  });
  document.querySelector('[data-action="zoom-out"]').addEventListener('click', () => {
    zoom = Math.max(0.4, zoom - 0.1);
    applyZoom();
  });

  /* ------------------------------------------------------------
     Overflow warning
  ------------------------------------------------------------ */
  let overflowTimer = null;
  function scheduleOverflowCheck() {
    clearTimeout(overflowTimer);
    overflowTimer = setTimeout(checkOverflow, 250);
  }
  function checkOverflow() {
    document.querySelectorAll('.page').forEach((p) => {
      const inner = p.querySelector('.page-inner');
      if (!inner) {
        p.classList.remove('overflow');
        return;
      }
      const cs = getComputedStyle(p);
      const avail = p.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 34; // leave room for footer
      if (inner.scrollHeight > avail) p.classList.add('overflow');
      else p.classList.remove('overflow');
    });
  }
  container.addEventListener('input', scheduleOverflowCheck);
  window.addEventListener('resize', scheduleOverflowCheck);

  /* ------------------------------------------------------------
     Help panel
  ------------------------------------------------------------ */
  document.getElementById('toggle-help').addEventListener('click', () => {
    document.getElementById('help-panel').classList.add('show');
  });
  document.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.action === 'close-help') {
      document.getElementById('help-panel').classList.remove('show');
    }
  });

  /* ------------------------------------------------------------
     Save / Load project (JSON containing the raw markup)
  ------------------------------------------------------------ */
  document.querySelector('[data-action="save-json"]').addEventListener('click', () => {
    const data = { version: 1, savedAt: new Date().toISOString(), html: container.innerHTML };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'exam-project.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.querySelector('[data-action="load-json"]').addEventListener('click', () => {
    loadJsonInput.click();
  });
  loadJsonInput.addEventListener('change', () => {
    const file = loadJsonInput.files && loadJsonInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (typeof data.html === 'string') {
          container.innerHTML = data.html;
          activePage = container.querySelector('.page');
          scheduleOverflowCheck();
        }
      } catch (err) {
        alert('ファイルの読み込みに失敗しました。');
      }
    };
    reader.readAsText(file);
  });

  /* ------------------------------------------------------------
     Export PNG / PDF
  ------------------------------------------------------------ */
  async function withZoomReset(fn) {
    const prevZoom = zoom;
    zoom = 1;
    applyZoom();
    if (document.activeElement) document.activeElement.blur();
    await new Promise((r) => setTimeout(r, 50)); // allow reflow
    try {
      await fn();
    } finally {
      zoom = prevZoom;
      applyZoom();
    }
  }

  async function captureAllPages() {
    const pages = Array.from(document.querySelectorAll('.page'));
    const canvases = [];
    for (const p of pages) {
      const canvas = await html2canvas(p, {
        scale: 3,
        backgroundColor: '#ffffff',
        useCORS: true,
        windowWidth: p.scrollWidth,
        windowHeight: p.scrollHeight,
      });
      canvases.push(canvas);
    }
    return canvases;
  }

  document.querySelector('[data-action="export-png"]').addEventListener('click', async () => {
    await withZoomReset(async () => {
      const canvases = await captureAllPages();
      canvases.forEach((canvas, i) => {
        const a = document.createElement('a');
        a.download = 'exam-page-' + (i + 1) + '.png';
        a.href = canvas.toDataURL('image/png');
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    });
  });

  document.querySelector('[data-action="export-pdf"]').addEventListener('click', async () => {
    await withZoomReset(async () => {
      const canvases = await captureAllPages();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      canvases.forEach((canvas, i) => {
        if (i > 0) pdf.addPage();
        const img = canvas.toDataURL('image/jpeg', 0.93);
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297);
      });
      pdf.save('exam.pdf');
    });
  });

  document.querySelector('[data-action="print-page"]').addEventListener('click', () => {
    window.print();
  });

  /* ------------------------------------------------------------
     Initial demo content
  ------------------------------------------------------------ */
  function init() {
    container.appendChild(buildCoverPage());
    const qFrame = buildQuestionPage(1);
    container.appendChild(qFrame);
    const page = qFrame.querySelector('.page');
    const pageInner = page.querySelector('.page-inner');
    const daimon = buildDaimon(1);
    pageInner.appendChild(daimon);
    daimon.querySelector('.qlead').textContent =
      '（ここに大問のリード文を入力します。例：花子さんは、○○について学習した内容をまとめた。1～3の問いに答えなさい。）';
    const box = buildBox(2);
    daimon.querySelector('.qbody').insertBefore(box, daimon.querySelector('.qsubs'));
    const sq = buildSubq(1);
    sq.querySelector('.subq-prompt').innerHTML =
      '　文章中の<span class="blank" contenteditable="true">Ⅰ</span>に当てはまる言葉を、ア～エから一つ選び、符号で書きなさい。';
    daimon.querySelector('.qsubs').appendChild(sq);
    sq.appendChild(buildChoices());
    activePage = page;
    applyZoom();
    scheduleOverflowCheck();
  }

  init();
})();
