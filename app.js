(() => {
  'use strict';

  const pagesRoot   = document.getElementById('pages-root');
  const blockTools  = document.getElementById('block-tools');

  const settingEra        = document.getElementById('setting-era');
  const settingSubject    = document.getElementById('setting-subject');
  const settingPageNum    = document.getElementById('setting-pagenum');
  const settingCode       = document.getElementById('setting-code');
  const settingCodePrefix = document.getElementById('setting-codeprefix');

  let selectedPage = null;   // currently selected .exam-page element
  let lastEditable = null;   // last focused contenteditable leaf
  let lastRange    = null;   // last saved Range inside lastEditable

  const KANA = ['ア','イ','ウ','エ','オ','カ','キ','ク','ケ','コ','サ','シ','ス'];
  const CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮'];

  /* ============================================================
     PAGE CREATION
     ============================================================ */

  function makePageWrapper(inner, type){
    const wrap = document.createElement('div');
    wrap.className = 'page-wrapper';

    const toolbar = document.createElement('div');
    toolbar.className = 'page-toolbar no-print';
    toolbar.innerHTML = `
      <button data-page-action="up" title="ページを上へ">↑</button>
      <button data-page-action="down" title="ページを下へ">↓</button>
      <button data-page-action="del" title="ページを削除">✕ ページ削除</button>
    `;
    wrap.appendChild(toolbar);
    wrap.appendChild(inner);
    return wrap;
  }

  function createCoverPage(){
    const page = document.createElement('section');
    page.className = 'exam-page cover-page';
    page.dataset.type = 'cover';
    page.innerHTML = `
      <div class="cover-era" contenteditable="true">${escapeHtml(settingEra.value)}</div>
      <div class="cover-kind" contenteditable="true">学力検査</div>
      <div class="cover-subject" contenteditable="true">${escapeHtml(settingSubject.value)}</div>
      <div class="notice-box">
        <div class="notice-title" contenteditable="true">注　　意</div>
        <ol class="notice-list">
          <li contenteditable="true">指示があるまでは、この冊子を開いてはいけません。</li>
          <li contenteditable="true">解答用紙は、この冊子の中に、はさんであります。</li>
          <li contenteditable="true">答えは、全て解答用紙に記入しなさい。</li>
          <li contenteditable="true">検査問題は　　ページで、問題は１から　　まであります。</li>
        </ol>
      </div>
      <div class="cover-code" contenteditable="true">◇M５（830－１）</div>
    `;
    return makePageWrapper(page, 'cover');
  }

  function createQuestionPage(){
    const page = document.createElement('section');
    page.className = 'exam-page question-page';
    page.dataset.type = 'question';
    page.innerHTML = `
      <div class="page-inner"></div>
      <div class="page-footer">
        <span class="page-footer-number">－ 1 －</span>
        <span class="code">◇M５（830－）</span>
      </div>
    `;
    return makePageWrapper(page, 'question');
  }

  function addPage(type){
    const wrap = type === 'cover' ? createCoverPage() : createQuestionPage();
    pagesRoot.appendChild(wrap);
    const pageEl = wrap.querySelector('.exam-page');
    selectPage(pageEl);
    pageEl.scrollIntoView({behavior:'smooth', block:'start'});
    renumberPages();
  }

  document.querySelectorAll('[data-add]').forEach(btn=>{
    btn.addEventListener('click', ()=> addPage(btn.dataset.add));
  });

  /* ============================================================
     PAGE SELECTION
     ============================================================ */

  function selectPage(pageEl){
    document.querySelectorAll('.exam-page.is-selected').forEach(p=>p.classList.remove('is-selected'));
    selectedPage = pageEl;
    if(pageEl){
      pageEl.classList.add('is-selected');
      blockTools.hidden = pageEl.dataset.type !== 'question';
    } else {
      blockTools.hidden = true;
    }
  }

  pagesRoot.addEventListener('click', (e)=>{
    const page = e.target.closest('.exam-page');
    if(page) selectPage(page);
  });

  /* ============================================================
     BLOCK CREATION
     ============================================================ */

  function blockWrapper(innerHtml, extraClass){
    const w = document.createElement('div');
    w.className = 'block-wrapper' + (extraClass ? ' ' + extraClass : '');
    w.innerHTML = `
      <div class="block-controls no-print">
        <button data-block-action="up" title="上へ">↑</button>
        <button data-block-action="down" title="下へ">↓</button>
        <button data-block-action="del" title="削除">✕</button>
      </div>
      ${innerHtml}
    `;
    return w;
  }

  const BLOCK_TEMPLATES = {
    major(){
      return blockWrapper(`
        <div class="major-block">
          <span class="major-number-box" contenteditable="true">1</span>
          <span class="major-lead" contenteditable="true">　〇〇さんは、～について調べ、まとめを書いた。１～１２の問いに答えなさい。</span>
        </div>
      `);
    },
    leadbox(){
      return blockWrapper(`
        <div class="lead-box-block">
          <div class="lead-box-title" contenteditable="true">［〇〇さんのまとめ］</div>
          <div class="lead-box-body" contenteditable="true">ここに前文・資料の説明などを入力します。</div>
        </div>
      `);
    },
    subq(){
      return blockWrapper(`
        <div class="subq-block">
          <span class="subq-number" contenteditable="true">１</span>
          <span class="subq-text" contenteditable="true">　　　に当てはまる言葉を書きなさい。</span>
        </div>
      `);
    },
    choices(){
      const rows = KANA.slice(0,4).map(k=>`
        <div class="choice-row">
          <span class="choice-mark" contenteditable="true">${k}</span>
          <span class="choice-text" contenteditable="true">選択肢の文章</span>
        </div>
      `).join('');
      return blockWrapper(`
        <div class="choices-block">
          ${rows}
          <div class="choices-block-controls no-print">
            <button class="choice-add-btn" data-choice-add="1">＋選択肢を追加</button>
          </div>
        </div>
      `);
    },
    table(){
      const row = () => '<td contenteditable="true">&nbsp;</td>'.repeat(3);
      const rowsHtml = Array.from({length:3}).map(()=>`<tr>${row()}</tr>`).join('');
      return blockWrapper(`
        <div class="table-block">
          <table>${rowsHtml}</table>
          <div class="table-block-controls no-print">
            <button class="table-mini-btn" data-table-action="add-row">＋行</button>
            <button class="table-mini-btn" data-table-action="add-col">＋列</button>
            <button class="table-mini-btn" data-table-action="del-row">－行</button>
            <button class="table-mini-btn" data-table-action="del-col">－列</button>
          </div>
        </div>
      `);
    },
    resource(){
      return blockWrapper(`
        <div class="resource-block">
          <div class="resource-caption" contenteditable="true">［資料］</div>
          <div class="resource-placeholder">（ここに画像・グラフ資料を配置する枠です／本ツールでは画像自体は追加されません）</div>
        </div>
      `);
    },
    text(){
      return blockWrapper(`
        <div class="text-block" contenteditable="true">ここに自由に文章を入力できます。</div>
      `);
    }
  };

  document.querySelectorAll('[data-block]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(!selectedPage || selectedPage.dataset.type !== 'question'){
        alert('先に問題ページをクリックして選択してください。');
        return;
      }
      const inner = selectedPage.querySelector('.page-inner');
      const el = BLOCK_TEMPLATES[btn.dataset.block]();
      inner.appendChild(el);
    });
  });

  /* ============================================================
     BLOCK / PAGE CONTROLS (move / delete) — delegated
     ============================================================ */

  pagesRoot.addEventListener('click', (e)=>{
    const bAction = e.target.closest('[data-block-action]');
    if(bAction){
      const action = bAction.dataset.blockAction;
      const wrapper = bAction.closest('.block-wrapper');
      if(action === 'del'){
        wrapper.remove();
      } else if(action === 'up'){
        const prev = wrapper.previousElementSibling;
        if(prev) wrapper.parentNode.insertBefore(wrapper, prev);
      } else if(action === 'down'){
        const next = wrapper.nextElementSibling;
        if(next) wrapper.parentNode.insertBefore(next, wrapper);
      }
      return;
    }

    const pAction = e.target.closest('[data-page-action]');
    if(pAction){
      const action = pAction.dataset.pageAction;
      const wrapper = pAction.closest('.page-wrapper');
      if(action === 'del'){
        if(confirm('このページを削除しますか？')){
          if(wrapper.querySelector('.exam-page') === selectedPage) selectPage(null);
          wrapper.remove();
          renumberPages();
        }
      } else if(action === 'up'){
        const prev = wrapper.previousElementSibling;
        if(prev){ wrapper.parentNode.insertBefore(wrapper, prev); renumberPages(); }
      } else if(action === 'down'){
        const next = wrapper.nextElementSibling;
        if(next){ wrapper.parentNode.insertBefore(next, wrapper); renumberPages(); }
      }
      return;
    }

    const choiceAdd = e.target.closest('[data-choice-add]');
    if(choiceAdd){
      const block = choiceAdd.closest('.choices-block');
      const existing = block.querySelectorAll('.choice-row').length;
      const mark = KANA[existing] || String(existing + 1);
      const row = document.createElement('div');
      row.className = 'choice-row';
      row.innerHTML = `
        <span class="choice-mark" contenteditable="true">${mark}</span>
        <span class="choice-text" contenteditable="true">選択肢の文章</span>
      `;
      block.insertBefore(row, choiceAdd.closest('.choices-block-controls'));
      return;
    }

    const tblAction = e.target.closest('[data-table-action]');
    if(tblAction){
      const table = tblAction.closest('.table-block').querySelector('table');
      const action = tblAction.dataset.tableAction;
      const rows = Array.from(table.rows);
      if(action === 'add-row'){
        const cols = rows[0] ? rows[0].cells.length : 3;
        const tr = document.createElement('tr');
        for(let i=0;i<cols;i++){
          const td = document.createElement('td');
          td.contentEditable = 'true';
          td.innerHTML = '&nbsp;';
          tr.appendChild(td);
        }
        table.appendChild(tr);
      } else if(action === 'del-row'){
        if(rows.length > 1) table.deleteRow(rows.length - 1);
      } else if(action === 'add-col'){
        rows.forEach(r=>{
          const td = document.createElement('td');
          td.contentEditable = 'true';
          td.innerHTML = '&nbsp;';
          r.appendChild(td);
        });
      } else if(action === 'del-col'){
        rows.forEach(r=>{
          if(r.cells.length > 1) r.deleteCell(r.cells.length - 1);
        });
      }
      return;
    }
  });

  /* ============================================================
     PAGE NUMBERING / FOOTER
     ============================================================ */

  function renumberPages(){
    const qPages = Array.from(pagesRoot.querySelectorAll('.exam-page.question-page'));
    qPages.forEach((page, idx)=>{
      const n = idx + 1;
      const numEl = page.querySelector('.page-footer-number');
      const codeEl = page.querySelector('.page-footer .code');
      if(numEl){
        numEl.style.display = settingPageNum.checked ? '' : 'none';
        numEl.textContent = `－ ${n} －`;
      }
      if(codeEl){
        codeEl.style.display = settingCode.checked ? '' : 'none';
        codeEl.textContent = `${settingCodePrefix.value}${n}）`;
      }
    });
  }
  [settingPageNum, settingCode, settingCodePrefix].forEach(el=>{
    el.addEventListener('input', renumberPages);
    el.addEventListener('change', renumberPages);
  });

  /* ============================================================
     INLINE INSERTION (blank line / fill box / circled number)
     ============================================================ */

  document.addEventListener('focusin', (e)=>{
    const editable = e.target.closest('[contenteditable="true"]');
    if(editable) lastEditable = editable;
  });

  function saveSelectionIfInsideEditable(){
    const sel = window.getSelection();
    if(!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const node = container.nodeType === 1 ? container : container.parentElement;
    if(node && node.closest('[contenteditable="true"]')){
      lastRange = range.cloneRange();
      lastEditable = node.closest('[contenteditable="true"]');
    }
  }
  document.addEventListener('mouseup', saveSelectionIfInsideEditable);
  document.addEventListener('keyup', saveSelectionIfInsideEditable);

  function insertInlineHtml(html){
    if(!lastEditable){
      alert('先に本文中をクリックしてカーソルを置いてから挿入してください。');
      return;
    }
    lastEditable.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    if(lastRange){
      try { sel.addRange(lastRange); } catch(err){ /* range stale, fall back to end */ }
    }
    if(sel.rangeCount === 0){
      const r = document.createRange();
      r.selectNodeContents(lastEditable);
      r.collapse(false);
      sel.addRange(r);
    }
    document.execCommand('insertHTML', false, html);
    saveSelectionIfInsideEditable();
  }

  document.querySelectorAll('[data-inline]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const kind = btn.dataset.inline;
      if(kind === 'blank-line'){
        insertInlineHtml('<span class="inline-blank" contenteditable="false">&nbsp;</span>');
      } else if(kind === 'fill-box'){
        insertInlineHtml('<span class="inline-fillbox" contenteditable="false">&nbsp;</span>');
      } else if(kind === 'circled'){
        insertCircledPicker();
      }
    });
  });

  function insertCircledPicker(){
    const choice = prompt('挿入する丸数字の番号を入力してください（1～15）', '1');
    const n = parseInt(choice, 10);
    if(!n || n < 1 || n > CIRCLED.length) return;
    insertInlineHtml(CIRCLED[n-1]);
  }

  /* ============================================================
     SETTINGS
     ============================================================ */

  document.getElementById('btn-help').addEventListener('click', ()=>{
    document.getElementById('help-modal').hidden = false;
  });
  document.getElementById('help-close').addEventListener('click', ()=>{
    document.getElementById('help-modal').hidden = true;
  });

  /* ============================================================
     SAVE / LOAD (JSON draft)
     ============================================================ */

  document.getElementById('btn-save').addEventListener('click', ()=>{
    const data = {
      html: pagesRoot.innerHTML,
      settings: {
        era: settingEra.value,
        subject: settingSubject.value,
        pagenum: settingPageNum.checked,
        code: settingCode.checked,
        codeprefix: settingCodePrefix.value
      }
    };
    const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exam-draft.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-load').addEventListener('click', ()=>{
    document.getElementById('file-load').click();
  });
  document.getElementById('file-load').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(reader.result);
        pagesRoot.innerHTML = data.html || '';
        if(data.settings){
          settingEra.value = data.settings.era ?? settingEra.value;
          settingSubject.value = data.settings.subject ?? settingSubject.value;
          settingPageNum.checked = data.settings.pagenum ?? true;
          settingCode.checked = data.settings.code ?? true;
          settingCodePrefix.value = data.settings.codeprefix ?? settingCodePrefix.value;
        }
        selectPage(null);
        renumberPages();
      } catch(err){
        alert('読み込みに失敗しました。ファイル形式を確認してください。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ============================================================
     PRINT
     ============================================================ */

  document.getElementById('btn-print').addEventListener('click', ()=>{
    window.print();
  });

  /* ============================================================
     EXPORT — IMAGE
     ============================================================ */

  async function withExportMode(fn){
    document.body.classList.add('exporting');
    document.querySelectorAll('.exam-page.is-selected').forEach(p=>p.classList.remove('is-selected'));
    try{
      await fn();
    } finally {
      document.body.classList.remove('exporting');
    }
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  document.getElementById('btn-export-img').addEventListener('click', async ()=>{
    const pages = Array.from(pagesRoot.querySelectorAll('.exam-page'));
    if(pages.length === 0){ alert('ページがありません。まずページを追加してください。'); return; }
    const btn = document.getElementById('btn-export-img');
    btn.disabled = true; btn.textContent = '書き出し中…';
    await withExportMode(async ()=>{
      for(let i=0; i<pages.length; i++){
        const canvas = await html2canvas(pages[i], {scale:2, backgroundColor:'#ffffff', useCORS:true});
        const blob = await new Promise(res=>canvas.toBlob(res, 'image/png'));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exam-page-${String(i+1).padStart(2,'0')}.png`;
        a.click();
        URL.revokeObjectURL(url);
        await sleep(300);
      }
    });
    btn.disabled = false; btn.textContent = '🖼 画像で書き出す';
  });

  /* ============================================================
     EXPORT — PDF
     ============================================================ */

  document.getElementById('btn-export-pdf').addEventListener('click', async ()=>{
    const pages = Array.from(pagesRoot.querySelectorAll('.exam-page'));
    if(pages.length === 0){ alert('ページがありません。まずページを追加してください。'); return; }
    const btn = document.getElementById('btn-export-pdf');
    btn.disabled = true; btn.textContent = '書き出し中…';
    await withExportMode(async ()=>{
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
      for(let i=0; i<pages.length; i++){
        const canvas = await html2canvas(pages[i], {scale:2, backgroundColor:'#ffffff', useCORS:true});
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if(i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        await sleep(50);
      }
      pdf.save('exam.pdf');
    });
    btn.disabled = false; btn.textContent = '📄 PDFで書き出す';
  });

  /* ============================================================
     UTIL
     ============================================================ */

  function escapeHtml(str){
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  /* ============================================================
     INITIAL STATE — start with one cover + one question page
     ============================================================ */

  addPage('cover');
  addPage('question');

})();
