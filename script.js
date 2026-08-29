/* ===================== 状態管理 ===================== */
let questions = []; // {id, subject, passage, choices:[4], correct(0-3)}
let uidSeed = 1;

function newQuestion(overrides={}){
  return Object.assign({
    id: uidSeed++,
    subject: "",
    passage: "次の文中の{a}，{b}に当てはまる言葉の正しい組み合わせを、ア～エから一つ選び、符号で書きなさい。\n\n",
    choices: ["", "", "", ""],
    correct: 0
  }, overrides);
}

/* ===================== サンプルデータ ===================== */
const SAMPLE_QUESTIONS = [
  {subject:"歴史", passage:"奈良時代、人口増加による口分田の不足に対応するため、743年、朝廷は新しく開墾した土地の永久私有を認める{a}を出した。これにより、貴族や寺社による{b}が進み、公地公民の原則がくずれ始めた。",
   choices:["墾田永年私財法／私有地の拡大（荘園の形成）","墾田永年私財法／土地の国有化","三世一身法／私有地の拡大（荘園の形成）","三世一身法／土地の国有化"], correct:0},
  {subject:"歴史", passage:"1221年、後鳥羽上皇が鎌倉幕府打倒を目指して兵をあげたが敗れた。この争いを{a}という。幕府はこの後、京都に{b}を置いて朝廷を監視するとともに、西国の武士の統率にあたらせた。",
   choices:["承久の乱／六波羅探題","承久の乱／鎌倉府","応仁の乱／六波羅探題","応仁の乱／鎌倉府"], correct:0},
  {subject:"歴史", passage:"18世紀後半、老中の田沼意次は、商工業者の同業者組織である株仲間の結成を{a}し、営業税を徴収することで幕府の財政を立て直そうとした。しかし、あとを継いだ老中松平定信は、質素・倹約を奨励する{b}と呼ばれる改革を行った。",
   choices:["奨励／寛政の改革","奨励／天保の改革","禁止／寛政の改革","禁止／天保の改革"], correct:0},
  {subject:"地理", passage:"乾燥帯のうち、年間を通じてほとんど雨が降らない気候を{a}といい、わずかながら雨季があり丈の短い草原が広がる気候を{b}という。",
   choices:["砂漠気候／ステップ気候","砂漠気候／温帯冬季少雨気候","サバナ気候／ステップ気候","サバナ気候／温帯冬季少雨気候"], correct:0},
  {subject:"地理", passage:"本州中央部を南北に走る溝状の地形を{a}といい、その西の縁にあたる糸魚川・静岡構造線を境に、東日本と西日本では山地の走る方向が大きく異なる。また、九州から関東地方まで日本列島を東西に横断する断層帯を{b}という。",
   choices:["フォッサマグナ／中央構造線","フォッサマグナ／環太平洋造山帯","リアス海岸／中央構造線","リアス海岸／環太平洋造山帯"], correct:0},
  {subject:"地理", passage:"高度経済成長期以降、大都市では都心部の人口が減り、郊外の人口が増える{a}現象が見られたが、近年は大都市の再開発が進み、都心部の人口が再び増える{b}現象も見られるようになった。",
   choices:["ドーナツ化／都心回帰","ドーナツ化／地方創生","過疎化／都心回帰","過疎化／地方創生"], correct:0}
];

/* ===================== ユーティリティ ===================== */
function escapeHtml(str){
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function formatPassage(str){
  const escaped = escapeHtml(str).replace(/\n/g, "<br>");
  return escaped.replace(/\{([a-zA-Zａ-ｚＡ-Ｚ])\}/g, (m, letter) => `<span class="blank">${letter}</span>`);
}
const KIGO = ["ア","イ","ウ","エ"];

/* ===================== エディタ描画 ===================== */
const editorList = document.getElementById('editor-list');

function renderEditor(){
  editorList.innerHTML = "";
  if(questions.length === 0){
    editorList.innerHTML = '<div class="empty-msg" style="padding:20px 0;">「＋ 問題を追加」または「サンプルを読み込む」から始めてください。</div>';
    return;
  }
  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'edit-card';
    card.dataset.id = q.id;
    card.innerHTML = `
      <div class="edit-card-head">
        <span class="qidx">問${idx+1}</span>
        <input type="text" class="subject-input" placeholder="教科ラベル（例: 歴史）" value="${escapeHtml(q.subject)}">
        <button class="mini-btn" data-act="up">↑</button>
        <button class="mini-btn" data-act="down">↓</button>
        <button class="mini-btn" data-act="dup">複製</button>
        <button class="mini-btn danger" data-act="del">削除</button>
      </div>
      <label class="field-label">問題文（空所は {a} {b} のように書くと四角囲みの空欄になります）</label>
      <textarea class="passage-input" data-act="passage" rows="4">${escapeHtml(q.passage)}</textarea>
      <label class="field-label">選択肢</label>
      <div class="choice-grid">
        ${[0,1,2,3].map(i => `
          <div class="choice-row">
            <span class="kigo">${KIGO[i]}</span>
            <input type="text" data-act="choice" data-idx="${i}" value="${escapeHtml(q.choices[i])}">
          </div>`).join('')}
      </div>
      <div class="correct-row">
        正解（解答一覧用・任意）:
        <select data-act="correct">
          ${[0,1,2,3].map(i => `<option value="${i}" ${q.correct===i?'selected':''}>${KIGO[i]}</option>`).join('')}
        </select>
      </div>
    `;
    editorList.appendChild(card);
  });
}

function findQuestion(id){
  return questions.find(q => q.id === Number(id));
}

editorList.addEventListener('input', (e) => {
  const card = e.target.closest('.edit-card');
  if(!card) return;
  const q = findQuestion(card.dataset.id);
  if(!q) return;
  const act = e.target.dataset.act;

  if(e.target.classList.contains('subject-input')){
    q.subject = e.target.value;
  } else if(act === 'passage'){
    q.passage = e.target.value;
  } else if(act === 'choice'){
    q.choices[Number(e.target.dataset.idx)] = e.target.value;
  } else if(act === 'correct'){
    q.correct = Number(e.target.value);
  }
  renderPreview();
});

editorList.addEventListener('click', (e) => {
  const btn = e.target.closest('.mini-btn');
  if(!btn) return;
  const card = e.target.closest('.edit-card');
  const id = Number(card.dataset.id);
  const idx = questions.findIndex(q => q.id === id);
  if(idx === -1) return;

  const act = btn.dataset.act;
  if(act === 'del'){
    questions.splice(idx, 1);
  } else if(act === 'up' && idx > 0){
    [questions[idx-1], questions[idx]] = [questions[idx], questions[idx-1]];
  } else if(act === 'down' && idx < questions.length-1){
    [questions[idx+1], questions[idx]] = [questions[idx], questions[idx+1]];
  } else if(act === 'dup'){
    const copy = JSON.parse(JSON.stringify(questions[idx]));
    copy.id = uidSeed++;
    questions.splice(idx+1, 0, copy);
  }
  renderEditor();
  renderPreview();
});

/* ===================== プレビュー描画 ===================== */
function renderPreview(){
  const sheet = document.getElementById('preview-sheet');
  const kind = document.getElementById('cover-kind').value;
  const title = document.getElementById('cover-title').value;
  const sub = document.getElementById('cover-sub').value;
  const noticeText = document.getElementById('notice-text').value;
  const showAnswerKey = document.getElementById('toggle-answerkey').checked;

  let html = `
    <div class="cover">
      <div class="kind">${escapeHtml(kind)}</div>
      <h1>${escapeHtml(title)}</h1>
      ${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ''}
    </div>
    ${noticeText.trim() ? `
    <div class="notice">
      <div class="notice-title">注　意</div>
      ${escapeHtml(noticeText).split('\n').filter(l=>l.trim()).map((l,i)=>`${i+1}　${l}`).join('<br>')}
    </div>` : ''}
  `;

  if(questions.length === 0){
    html += `<div class="empty-msg">問題がまだありません。左のパネルから追加してください。</div>`;
  } else {
    let currentSubject = "__init__";
    questions.forEach((q, idx) => {
      if(q.subject !== currentSubject){
        currentSubject = q.subject;
        if(currentSubject){
          html += `<div class="section-label">${escapeHtml(currentSubject)}</div>`;
        }
      }
      html += `
        <div class="q-block">
          <div class="q-head">
            <span class="q-num">問${idx+1}</span>
            ${q.subject ? `<span class="q-tag">${escapeHtml(q.subject)}</span>` : ''}
          </div>
          <div class="q-passage">${formatPassage(q.passage)}</div>
          <ul class="choices">
            ${q.choices.map((c,i) => `<li><span class="kigo">${KIGO[i]}</span><span>${escapeHtml(c)}</span></li>`).join('')}
          </ul>
        </div>
      `;
    });

    if(showAnswerKey){
      html += `
        <div class="answerkey">
          <h3>解答</h3>
          <table><tbody>
            <tr>${questions.map((q,idx) => `<td class="head">問${idx+1}</td>`).join('')}</tr>
            <tr>${questions.map(q => `<td>${KIGO[q.correct]}</td>`).join('')}</tr>
          </tbody></table>
        </div>
      `;
    }
  }

  sheet.innerHTML = html;
}

/* ===================== ボタン類 ===================== */
document.getElementById('add-question-btn').addEventListener('click', () => {
  questions.push(newQuestion());
  renderEditor();
  renderPreview();
});

document.getElementById('load-sample-btn').addEventListener('click', () => {
  SAMPLE_QUESTIONS.forEach(s => questions.push(newQuestion(s)));
  renderEditor();
  renderPreview();
});

document.getElementById('clear-all-btn').addEventListener('click', () => {
  if(questions.length && !confirm('全ての問題を削除します。よろしいですか？')) return;
  questions = [];
  renderEditor();
  renderPreview();
});

document.querySelectorAll('.cover-fields input, .cover-fields textarea, #toggle-answerkey')
  .forEach(el => el.addEventListener('input', renderPreview));

/* ---- JSON 保存・読み込み ---- */
document.getElementById('save-json-btn').addEventListener('click', () => {
  const data = {
    cover:{
      kind: document.getElementById('cover-kind').value,
      title: document.getElementById('cover-title').value,
      sub: document.getElementById('cover-sub').value,
      notice: document.getElementById('notice-text').value,
      showAnswerKey: document.getElementById('toggle-answerkey').checked
    },
    questions
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'social_exam_data.json';
  a.click();
});

document.getElementById('load-json-btn').addEventListener('click', () => {
  document.getElementById('json-file-input').click();
});
document.getElementById('json-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(data.cover){
        document.getElementById('cover-kind').value = data.cover.kind || "";
        document.getElementById('cover-title').value = data.cover.title || "";
        document.getElementById('cover-sub').value = data.cover.sub || "";
        document.getElementById('notice-text').value = data.cover.notice || "";
        document.getElementById('toggle-answerkey').checked = !!data.cover.showAnswerKey;
      }
      questions = (data.questions || []).map(q => newQuestion(q));
      renderEditor();
      renderPreview();
    }catch(err){
      alert('JSONの読み込みに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* ---- 書き出し ---- */
document.getElementById('export-png-btn').addEventListener('click', async () => {
  const sheet = document.getElementById('preview-sheet');
  const canvas = await html2canvas(sheet, {scale:2, backgroundColor:'#fbf9f4'});
  const a = document.createElement('a');
  a.download = 'social_exam.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});

document.getElementById('export-pdf-btn').addEventListener('click', async () => {
  const sheet = document.getElementById('preview-sheet');
  const canvas = await html2canvas(sheet, {scale:2, backgroundColor:'#fbf9f4'});
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'pt', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = canvas.height * imgWidth / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while(heightLeft > 0){
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save('social_exam.pdf');
});

document.getElementById('print-btn').addEventListener('click', () => window.print());

/* ===================== 初期化 ===================== */
SAMPLE_QUESTIONS.slice(0,3).forEach(s => questions.push(newQuestion(s)));
renderEditor();
renderPreview();
