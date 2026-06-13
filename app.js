// =====================
// 계정 설정
// 여기에 아이디/비밀번호를 직접 입력하세요
// =====================
const ACCOUNTS = {
  '은서': { password: '1234', partner: '호원' },
  '호원': { password: '1234', partner: '은서' },
};

// 처음 만난 날짜 (D+ 계산용)
const START_DATE = new Date('2023-09-01');

// =====================
// 앱 상태
// =====================
let currentUser = null;
let menuOpen = true;
let notifOpen = false;
let prevPage = 'home';
let prevMenu = 'menu-home';
let calYear, calMonth;
let calYearTheir, calMonthTheir;
let thoughtsYear, thoughtsMonth;
let timelineTarget = 'past';

// 데이터 (localStorage에 저장)
function getData(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function setData(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}
function getObj(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}
function setObj(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// =====================
// 로그인
// =====================
function doLogin() {
  const id = document.getElementById('loginId').value.trim();
  const pw = document.getElementById('loginPw').value;
  const err = document.getElementById('loginError');
  if (!ACCOUNTS[id] || ACCOUNTS[id].password !== pw) {
    err.textContent = '아이디 또는 비밀번호가 맞지 않아요.';
    return;
  }
  currentUser = id;
  err.textContent = '';
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  initApp();
}

document.getElementById('loginPw').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doLogin();
});

// =====================
// 앱 초기화
// =====================
function initApp() {
  const partner = ACCOUNTS[currentUser].partner;
  document.getElementById('userAvatar').textContent = currentUser[0];
  document.getElementById('theirName').textContent = partner + '의 기록';
  document.getElementById('theirPageTitle').textContent = partner + '의 기록';
  document.getElementById('letterSalutation').textContent = partner + '에게,';
  document.getElementById('letterFrom').textContent = currentUser + '가 · ' + formatDate(new Date());

  // D+ 계산
  const today = new Date();
  const diff = Math.floor((today - START_DATE) / (1000 * 60 * 60 * 24));
  document.getElementById('ddayCount').textContent = 'D+' + diff;

  // 캘린더 초기화
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();
  calYearTheir = now.getFullYear(); calMonthTheir = now.getMonth();
  thoughtsYear = now.getFullYear(); thoughtsMonth = now.getMonth();

  renderCalendar();
  renderCalendarTheir();
  renderThoughts();
  renderBoard();
  renderTimeline();
  renderFuture();
  renderLetters();
  renderNotifs();
  renderRecentEntries();
  loadHeroFromStorage();
  showPage('home', 'menu-home');
}

// =====================
// 페이지 전환
// =====================
function toggleMenu() {
  menuOpen = !menuOpen;
  document.getElementById('sidebar').classList.toggle('hidden', !menuOpen);
}

function showPage(name, menuId) {
  if (name !== 'notif') { prevPage = name; prevMenu = menuId || ''; }
  notifOpen = (name === 'notif');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (menuId) { const el = document.getElementById(menuId); if (el) el.classList.add('active'); }
  if (name === 'photos') renderAllPhotos();
}

function toggleNotif() {
  if (notifOpen) {
    notifOpen = false;
    showPage(prevPage, prevMenu);
  } else {
    notifOpen = true;
    showPage('notif', null);
    document.getElementById('notifDot').style.display = 'none';
  }
}

// =====================
// 홈 — 대표 사진
// =====================
function triggerPhotoUpload() {
  document.getElementById('heroFileInput').click();
}

function loadHeroPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    localStorage.setItem('heroPhoto', ev.target.result);
    applyHeroPhoto(ev.target.result);
  };
  reader.readAsDataURL(file);
}

function loadHeroFromStorage() {
  const stored = localStorage.getItem('heroPhoto');
  if (stored) applyHeroPhoto(stored);
}

function applyHeroPhoto(src) {
  const img = document.getElementById('heroImg');
  img.onload = function() {
    const ratio = img.naturalHeight / img.naturalWidth;
    const areaW = document.getElementById('photoArea').offsetWidth;
    const imgH = Math.round(areaW * ratio);
    document.getElementById('heroSection').style.height = Math.max(180, imgH) + 'px';
    img.style.height = Math.round(imgH * 1.3) + 'px';
    img.style.width = '100%';
    img.style.display = 'block';
    document.getElementById('photoPlaceholder').style.display = 'none';
  };
  img.src = src;
}

// 패럴랙스
document.querySelector('.content').addEventListener('scroll', function() {
  const scrollY = this.scrollTop;
  const img = document.getElementById('heroImg');
  if (img.style.display === 'block') {
    img.style.transform = 'translateY(' + (scrollY * 0.4) + 'px)';
  }
});

// =====================
// 내 기록 — 캘린더
// =====================
function renderCalendar() {
  const label = document.getElementById('calMonthLabel');
  label.textContent = calYear + '년 ' + (calMonth + 1) + '월';
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  const days = ['일','월','화','수','목','금','토'];
  days.forEach(d => { const h = document.createElement('div'); h.className = 'cal-header'; h.textContent = d; grid.appendChild(h); });
  const first = new Date(calYear, calMonth, 1).getDay();
  const total = new Date(calYear, calMonth + 1, 0).getDate();
  const records = getData('records_' + currentUser);
  const today = new Date();
  for (let i = 0; i < first; i++) { const e = document.createElement('div'); e.className = 'cal-day'; grid.appendChild(e); }
  for (let d = 1; d <= total; d++) {
    const dateStr = calYear + '-' + String(calMonth + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const hasRecord = records.some(r => r.date === dateStr);
    const el = document.createElement('div');
    el.className = 'cal-day' + (hasRecord ? ' has-record' : '');
    if (today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d) el.classList.add('today');
    el.textContent = d;
    el.onclick = () => selectDay(el, dateStr, 'my');
    grid.appendChild(el);
  }
}

function changeMonth(dir) { calMonth += dir; if (calMonth > 11) { calMonth = 0; calYear++; } if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); document.getElementById('dayDetail').classList.add('hidden'); }

function selectDay(el, dateStr, who) {
  const gridId = who === 'my' ? 'calGrid' : 'calGridTheir';
  const detailId = who === 'my' ? 'dayDetail' : 'dayDetailTheir';
  document.querySelectorAll('#' + gridId + ' .cal-day').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  const user = who === 'my' ? currentUser : ACCOUNTS[currentUser].partner;
  const records = getData('records_' + user);
  const record = records.find(r => r.date === dateStr);
  renderDayDetail(dateStr, record, detailId, who === 'my');
}

function renderDayDetail(dateStr, record, detailId, canEdit) {
  const detail = document.getElementById(detailId);
  detail.classList.remove('hidden');
  // empty 메시지 숨기기
  const emptyId = detailId === 'dayDetail' ? 'dayDetailEmpty' : 'dayDetailTheirEmpty';
  const emptyEl = document.getElementById(emptyId);
  if (emptyEl) emptyEl.style.display = 'none';
  const displayDate = dateStr.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2월 $3일');
  const photos = record?.photos || [];
  const diary = record?.diary || '';
  const reactions = record?.reactions || { heart: 0, star: 0, cry: 0 };
  const comments = record?.comments || [];

  let photosHtml = photos.length
    ? photos.map(p => `<div class="day-photo"><img src="${p}" alt="사진"></div>`).join('')
    : `<div class="day-photo"><i class="ti ti-photo"></i></div><div class="day-photo"><i class="ti ti-photo"></i></div><div class="day-photo"><i class="ti ti-photo"></i></div>`;

  const commentsHtml = comments.map(c => `
    <div class="comment-row">
      <div class="comment-avatar">${c.author[0]}</div>
      <div><div class="comment-meta">${c.author} · ${c.date}</div><div class="comment-text">${c.text}</div></div>
    </div>`).join('');

  detail.innerHTML = `
    <div class="day-detail-header">
      <span class="day-detail-title">${displayDate}</span>
      ${canEdit ? `<i class="ti ti-pencil" style="font-size:14px;color:var(--text-tertiary);cursor:pointer" onclick="openEditRecord('${dateStr}')"></i>` : ''}
    </div>
    ${photos.length ? `<div class="day-photos">${photos.map(p => `<div class="day-photo"><img src="${p}" alt="사진"></div>`).join('')}</div>` : ''}
    ${diary ? `<div class="day-diary">${diary}</div>` : ''}
    <div class="day-reactions">
      <div class="reaction-btn ${reactions.heart > 0 ? 'active' : ''}" onclick="toggleReaction('${dateStr}','heart','${detailId}')"><i class="ti ti-heart" style="font-size:12px"></i> <span>${reactions.heart}</span></div>
      <div class="reaction-btn ${reactions.star > 0 ? 'active' : ''}" onclick="toggleReaction('${dateStr}','star','${detailId}')"><i class="ti ti-star" style="font-size:12px"></i> <span>${reactions.star}</span></div>
      <div class="reaction-btn ${reactions.cry > 0 ? 'active' : ''}" onclick="toggleReaction('${dateStr}','cry','${detailId}')">🥹 <span>${reactions.cry}</span></div>
    </div>
    <div class="day-comments">
      <div id="commentList-${dateStr}">${commentsHtml}</div>
      <div class="comment-input-row">
        <div class="comment-avatar">${currentUser[0]}</div>
        <input class="comment-input" id="commentInput-${dateStr}" placeholder="댓글 달기..." onkeydown="if(event.key==='Enter')submitComment('${dateStr}','${detailId}')">
        <button class="comment-send" onclick="submitComment('${dateStr}','${detailId}')">등록</button>
      </div>
    </div>`;
}

function toggleReaction(dateStr, type, detailId) {
  const who = detailId === 'dayDetail' ? currentUser : ACCOUNTS[currentUser].partner;
  const records = getData('records_' + who);
  const idx = records.findIndex(r => r.date === dateStr);
  if (idx === -1) return;
  if (!records[idx].reactions) records[idx].reactions = { heart: 0, star: 0, cry: 0 };
  records[idx].reactions[type] = records[idx].reactions[type] > 0 ? 0 : 1;
  setData('records_' + who, records);
  const record = records[idx];
  renderDayDetail(dateStr, record, detailId, detailId === 'dayDetail');
}

function submitComment(dateStr, detailId) {
  const input = document.getElementById('commentInput-' + dateStr);
  const text = input.value.trim();
  if (!text) return;
  const who = detailId === 'dayDetail' ? currentUser : ACCOUNTS[currentUser].partner;
  const records = getData('records_' + who);
  const idx = records.findIndex(r => r.date === dateStr);
  if (idx === -1) return;
  if (!records[idx].comments) records[idx].comments = [];
  records[idx].comments.push({ author: currentUser, text, date: formatDateShort(new Date()) });
  setData('records_' + who, records);
  renderDayDetail(dateStr, records[idx], detailId, detailId === 'dayDetail');
}

// =====================
// 상대방 기록 캘린더
// =====================
function renderCalendarTheir() {
  const partner = ACCOUNTS[currentUser].partner;
  const label = document.getElementById('calMonthLabelTheir');
  label.textContent = calYearTheir + '년 ' + (calMonthTheir + 1) + '월';
  const grid = document.getElementById('calGridTheir');
  grid.innerHTML = '';
  const days = ['일','월','화','수','목','금','토'];
  days.forEach(d => { const h = document.createElement('div'); h.className = 'cal-header'; h.textContent = d; grid.appendChild(h); });
  const first = new Date(calYearTheir, calMonthTheir, 1).getDay();
  const total = new Date(calYearTheir, calMonthTheir + 1, 0).getDate();
  const records = getData('records_' + partner);
  const today = new Date();
  for (let i = 0; i < first; i++) { const e = document.createElement('div'); e.className = 'cal-day'; grid.appendChild(e); }
  for (let d = 1; d <= total; d++) {
    const dateStr = calYearTheir + '-' + String(calMonthTheir + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const hasRecord = records.some(r => r.date === dateStr);
    const el = document.createElement('div');
    el.className = 'cal-day' + (hasRecord ? ' has-record' : '');
    if (today.getFullYear() === calYearTheir && today.getMonth() === calMonthTheir && today.getDate() === d) el.classList.add('today');
    el.textContent = d;
    el.onclick = () => selectDay(el, dateStr, 'their');
    grid.appendChild(el);
  }
}

function changeMonthTheir(dir) { calMonthTheir += dir; if (calMonthTheir > 11) { calMonthTheir = 0; calYearTheir++; } if (calMonthTheir < 0) { calMonthTheir = 11; calYearTheir--; } renderCalendarTheir(); document.getElementById('dayDetailTheir').classList.add('hidden'); }

// =====================
// 기록 추가 / 수정
// =====================
function openAddRecord() {
  const today = new Date();
  document.getElementById('recordDate').value = today.toISOString().split('T')[0];
  document.getElementById('recordDiary').value = '';
  document.getElementById('recordPhotos').value = '';
  document.getElementById('modal-record').dataset.editDate = '';
  openModal('modal-record');
}

function openEditRecord(dateStr) {
  const records = getData('records_' + currentUser);
  const record = records.find(r => r.date === dateStr) || {};
  document.getElementById('recordDate').value = dateStr;
  document.getElementById('recordDiary').value = record.diary || '';
  document.getElementById('modal-record').dataset.editDate = dateStr;
  openModal('modal-record');
}

function saveRecord() {
  const date = document.getElementById('recordDate').value;
  const diary = document.getElementById('recordDiary').value.trim();
  const files = document.getElementById('recordPhotos').files;
  if (!date) return;

  const records = getData('records_' + currentUser);
  const existing = records.findIndex(r => r.date === date);

  const processPhotos = (existingPhotos) => {
    if (files.length === 0) {
      finishSave(date, diary, existingPhotos || []);
      return;
    }
    const photos = existingPhotos ? [...existingPhotos] : [];
    let loaded = 0;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = function(e) {
        photos.push(e.target.result);
        loaded++;
        if (loaded === files.length) finishSave(date, diary, photos);
      };
      reader.readAsDataURL(file);
    });
  };

  const existingPhotos = existing !== -1 ? records[existing].photos : [];
  processPhotos(existingPhotos);
}

function finishSave(date, diary, photos) {
  const records = getData('records_' + currentUser);
  const idx = records.findIndex(r => r.date === date);
  if (idx !== -1) {
    records[idx].diary = diary;
    records[idx].photos = photos;
  } else {
    records.push({ date, diary, photos, reactions: { heart: 0, star: 0, cry: 0 }, comments: [] });
  }
  records.sort((a, b) => a.date.localeCompare(b.date));
  setData('records_' + currentUser, records);
  closeModal('modal-record');
  renderCalendar();
  renderRecentEntries();
}

// =====================
// 홈 최근 기록
// =====================
function renderRecentEntries() {
  const partner = ACCOUNTS[currentUser]?.partner;
  if (!partner) return;
  const myRecords = getData('records_' + currentUser).map(r => ({...r, who: currentUser}));
  const theirRecords = getData('records_' + partner).map(r => ({...r, who: partner}));
  const all = [...myRecords, ...theirRecords].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 8);

  const grid = document.getElementById('recentGrid');
  const entries = document.getElementById('recentEntries');
  grid.innerHTML = '';
  entries.innerHTML = '';

  const thumbs = all.filter(r => r.photos && r.photos.length > 0).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    const el = document.createElement('div');
    el.className = 'recent-thumb';
    if (thumbs[i]) {
      const img = document.createElement('img');
      img.src = thumbs[i].photos[0];
      el.appendChild(img);
    } else {
      el.classList.add('empty');
      el.innerHTML = '<i class="ti ti-photo"></i>';
    }
    grid.appendChild(el);
  }

  all.forEach(r => {
    const el = document.createElement('div');
    el.className = 'recent-entry';
    const d = r.date.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2월 $3일');
    el.innerHTML = `<span class="recent-entry-text">${r.who === currentUser ? '' : r.who + ' · '}${r.diary ? r.diary.slice(0, 30) + (r.diary.length > 30 ? '...' : '') : '사진 기록'}</span><span class="recent-entry-date">${d}</span>`;
    entries.appendChild(el);
  });
}

// =====================
// 게시판
// =====================
function renderBoard() {
  const posts = getData('posts');
  const list = document.getElementById('boardList');
  list.className = 'board-list';
  list.innerHTML = '';
  const notices = posts.filter(p => p.notice);
  const normals = posts.filter(p => !p.notice);
  [...notices, ...normals].forEach(post => {
    const el = document.createElement('div');
    el.className = 'board-item' + (post.notice ? ' board-notice' : '');
    el.innerHTML = `
      <div class="board-item-title">${post.notice ? '<span class="notice-badge">공지</span>' : ''}${post.title}</div>
      <div class="board-item-meta"><span>${post.author}</span><span>${post.date}</span></div>`;
    list.appendChild(el);
  });
  if (posts.length === 0) {
    list.innerHTML = '<div style="padding:20px 0;font-size:13px;color:var(--text-tertiary);">아직 게시글이 없어요.</div>';
  }
}

function openWritePost() {
  document.getElementById('postTitle').value = '';
  document.getElementById('postContent').value = '';
  document.getElementById('postNotice').checked = false;
  openModal('modal-post');
}

function savePost() {
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  const notice = document.getElementById('postNotice').checked;
  if (!title) return;
  const posts = getData('posts');
  posts.unshift({ title, content, author: currentUser, date: formatDateShort(new Date()), notice });
  setData('posts', posts);
  closeModal('modal-post');
  renderBoard();
}

// =====================
// 연표
// =====================
function renderTimeline() {
  const items = getData('timeline_past');
  const wrap = document.getElementById('pastTimeline');
  wrap.innerHTML = '<div class="tl-line"></div>';
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'tl-item';
    el.innerHTML = `<div class="tl-dot"></div><div class="tl-date">${item.date}</div><div class="tl-title">${item.title}</div>${item.desc ? `<div class="tl-desc">${item.desc}</div>` : ''}`;
    wrap.appendChild(el);
  });
  if (items.length === 0) wrap.innerHTML += '<div style="font-size:13px;color:var(--text-tertiary);">아직 기록이 없어요.</div>';
}

function renderFuture() {
  const items = getData('timeline_future');
  const list = document.getElementById('futureList');
  list.className = 'future-list';
  list.innerHTML = '';
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'future-item';
    el.innerHTML = `<div class="future-date">${item.date}</div><div class="future-text">${item.title}</div>`;
    list.appendChild(el);
  });
  if (items.length === 0) list.innerHTML = '<div style="padding:0;font-size:13px;color:var(--text-tertiary);">아직 계획이 없어요.</div>';
}

function openAddTimeline(target) {
  timelineTarget = target;
  document.getElementById('timelineModalTitle').textContent = target === 'past' ? '걸어온 흔적 추가' : '걸어갈 흔적 추가';
  document.getElementById('tlDate').value = '';
  document.getElementById('tlTitle').value = '';
  document.getElementById('tlDesc').value = '';
  openModal('modal-timeline');
}

function saveTimeline() {
  const date = document.getElementById('tlDate').value.trim();
  const title = document.getElementById('tlTitle').value.trim();
  const desc = document.getElementById('tlDesc').value.trim();
  if (!date || !title) return;
  const key = 'timeline_' + timelineTarget;
  const items = getData(key);
  items.push({ date, title, desc });
  setData(key, items);
  closeModal('modal-timeline');
  if (timelineTarget === 'past') renderTimeline();
  else renderFuture();
}

// =====================
// 떠도는 생각들
// =====================
function renderThoughts() {
  const label = document.getElementById('thoughtsMonthLabel');
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  label.textContent = thoughtsYear + '년 ' + monthNames[thoughtsMonth] + '의 떠도는 생각들';
  const key = 'thoughts_' + currentUser + '_' + thoughtsYear + '_' + thoughtsMonth;
  const thoughts = getData(key);
  const canvas = document.getElementById('thoughtsCanvas');
  canvas.innerHTML = '';
  thoughts.forEach(t => {
    const el = document.createElement('span');
    el.className = 'thought-tag';
    el.style.top = t.top + 'px';
    el.style.left = t.left + 'px';
    el.style.fontSize = t.size + 'px';
    el.textContent = t.text;
    canvas.appendChild(el);
  });
}

function addThought() {
  const input = document.getElementById('thoughtInput');
  const text = input.value.trim();
  if (!text) return;
  const key = 'thoughts_' + currentUser + '_' + thoughtsYear + '_' + thoughtsMonth;
  const thoughts = getData(key);
  const canvas = document.getElementById('thoughtsCanvas');
  const w = canvas.offsetWidth - 160;
  const h = canvas.offsetHeight - 40;
  const top = Math.max(10, Math.floor(Math.random() * h));
  const left = Math.max(10, Math.floor(Math.random() * w));
  const size = 11 + Math.floor(Math.random() * 5);
  thoughts.push({ text, top, left, size });
  setData(key, thoughts);
  input.value = '';
  renderThoughts();
}

function changeThoughtsMonth(dir) {
  thoughtsMonth += dir;
  if (thoughtsMonth > 11) { thoughtsMonth = 0; thoughtsYear++; }
  if (thoughtsMonth < 0) { thoughtsMonth = 11; thoughtsYear--; }
  renderThoughts();
}

// =====================
// 편지
// =====================
function renderLetters() {
  const letters = getData('letters').filter(l => l.to === currentUser);
  const list = document.getElementById('letterList');
  list.className = 'letter-list';
  list.innerHTML = '';
  letters.reverse().forEach(letter => {
    const el = document.createElement('div');
    el.className = 'letter-card' + (!letter.read ? ' unread' : '');
    el.innerHTML = `
      <div class="letter-meta">
        <span>${letter.from} → ${letter.to}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span>${letter.date}</span>
          ${!letter.read ? '<span class="unread-badge">새 편지</span>' : ''}
        </div>
      </div>
      <div class="letter-preview">${letter.content.slice(0, 50)}...</div>`;
    el.onclick = () => openLetter(letter);
    list.appendChild(el);
  });
  if (letters.length === 0) list.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);">아직 받은 편지가 없어요.</div>';
}

function openLetter(letter) {
  const letters = getData('letters');
  const idx = letters.findIndex(l => l.id === letter.id);
  if (idx !== -1) { letters[idx].read = true; setData('letters', letters); }
  alert(letter.from + '이 보낸 편지\n\n' + letter.content);
  renderLetters();
}

function sendLetter() {
  const content = document.getElementById('letterContent').value.trim();
  if (!content) return;
  const partner = ACCOUNTS[currentUser].partner;
  const letters = getData('letters');
  letters.push({ id: Date.now(), from: currentUser, to: partner, content, date: formatDateShort(new Date()), read: false });
  setData('letters', letters);
  document.getElementById('letterContent').value = '';
  addNotif(partner, currentUser + '이 새 편지를 보냈어요', 'letter');
  alert('편지를 보냈어요 💌');
  switchLetterTab(document.querySelectorAll('.letter-tab')[0], 'inbox');
}

function switchLetterTab(el, tab) {
  document.querySelectorAll('.letter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('letter-inbox').classList.toggle('hidden', tab !== 'inbox');
  document.getElementById('letter-write').classList.toggle('hidden', tab !== 'write');
}

// =====================
// 알림
// =====================
function addNotif(forUser, text, type) {
  const key = 'notifs_' + forUser;
  const notifs = getData(key);
  notifs.unshift({ text, type, date: '방금 전', read: false });
  setData(key, notifs);
}

function renderNotifs() {
  const notifs = getData('notifs_' + currentUser);
  const list = document.getElementById('notifList');
  list.className = 'notif-list';
  list.innerHTML = '';
  const iconMap = { letter: 'ti-mail', record: 'ti-camera', future: 'ti-map' };
  notifs.forEach(n => {
    const el = document.createElement('div');
    el.className = 'notif-item' + (n.read ? ' notif-read' : '');
    el.innerHTML = `
      <div class="notif-icon"><i class="ti ${iconMap[n.type] || 'ti-bell'}"></i></div>
      <div><div class="notif-text">${n.text}</div><div class="notif-time">${n.date}</div></div>`;
    list.appendChild(el);
  });
  if (notifs.length === 0) list.innerHTML = '<div style="padding:20px 0;font-size:13px;color:var(--text-tertiary);">새 알림이 없어요.</div>';
  const hasUnread = notifs.some(n => !n.read);
  document.getElementById('notifDot').style.display = hasUnread ? 'block' : 'none';
}

// =====================
// 모든 사진
// =====================
let allPhotosFiltered = [];
let lbIdx = 0;
let currentPhotoFilter = 'all';

function renderAllPhotos() {
  const partner = ACCOUNTS[currentUser].partner;
  const myRecords = getData('records_' + currentUser).map(r => ({...r, who: currentUser}));
  const theirRecords = getData('records_' + partner).map(r => ({...r, who: partner}));
  const all = [...myRecords, ...theirRecords].sort((a,b) => b.date.localeCompare(a.date));

  // 필터 이름 업데이트
  document.getElementById('filterMyTag').textContent = currentUser + ' 사진';
  document.getElementById('filterTheirTag').textContent = partner + ' 사진';

  if (currentPhotoFilter === 'my') allPhotosFiltered = all.filter(r => r.who === currentUser);
  else if (currentPhotoFilter === 'their') allPhotosFiltered = all.filter(r => r.who === partner);
  else allPhotosFiltered = all;

  // 사진 있는 기록만, 각 사진을 개별 항목으로 펼치기
  const photoItems = [];
  allPhotosFiltered.forEach(r => {
    if (r.photos && r.photos.length > 0) {
      r.photos.forEach(p => photoItems.push({ src: p, who: r.who, date: r.date }));
    }
  });

  const grid = document.getElementById('photosGrid');
  grid.innerHTML = '';
  if (photoItems.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:40px 0;text-align:center;font-size:13px;color:var(--text-tertiary);">아직 사진이 없어요.</div>';
    return;
  }
  photoItems.forEach((item, i) => {
    const cell = document.createElement('div');
    cell.className = 'photo-cell';
    const d = item.date.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2월 $3일');
    cell.innerHTML = `<img src="${item.src}" alt="사진"><div class="photo-cell-overlay"><div class="photo-cell-who">${item.who}</div><div class="photo-cell-date">${d}</div></div>`;
    cell.onclick = () => openLb(i, photoItems);
    grid.appendChild(cell);
  });
}

function setPhotoFilter(el, f) {
  document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  currentPhotoFilter = f;
  renderAllPhotos();
}

// =====================
// 라이트박스
// =====================
let lbItems = [];

function openLb(idx, items) {
  lbItems = items;
  lbIdx = idx;
  updateLb();
  document.getElementById('lightbox').classList.remove('hidden');
}

function closeLb() {
  document.getElementById('lightbox').classList.add('hidden');
}

function moveLb(dir) {
  lbIdx = Math.max(0, Math.min(lbItems.length - 1, lbIdx + dir));
  updateLb();
}

function updateLb() {
  const item = lbItems[lbIdx];
  const img = document.getElementById('lbImg');
  const placeholder = document.getElementById('lbPlaceholder');
  if (item.src) {
    img.src = item.src;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'flex';
  }
  const d = item.date ? item.date.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2월 $3일') : '';
  document.getElementById('lbWho').textContent = item.who || '';
  document.getElementById('lbDate').textContent = d;
  document.getElementById('lbCounter').textContent = (lbIdx + 1) + ' / ' + lbItems.length;
  document.getElementById('lbPrev').classList.toggle('disabled', lbIdx === 0);
  document.getElementById('lbNext').classList.toggle('disabled', lbIdx === lbItems.length - 1);
}

document.addEventListener('keydown', function(e) {
  if (document.getElementById('lightbox').classList.contains('hidden')) return;
  if (e.key === 'ArrowLeft') moveLb(-1);
  if (e.key === 'ArrowRight') moveLb(1);
  if (e.key === 'Escape') closeLb();
});

// =====================
// 모달
// =====================
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', function(e) { if (e.target === this) this.classList.add('hidden'); });
});

// =====================
// 날짜 포맷
// =====================
function formatDate(d) {
  return d.getFullYear() + '년 ' + (d.getMonth()+1) + '월 ' + d.getDate() + '일';
}
function formatDateShort(d) {
  return (d.getMonth()+1) + '월 ' + d.getDate() + '일';
}
