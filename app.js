// =====================
// Supabase 설정
// =====================
const SUPABASE_URL = 'https://qqblcxvhdiydyisextwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxYmxjeHZoZGl5ZHlpc2V4dHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTkxNDYsImV4cCI6MjA5OTk5NTE0Nn0.3Fsnp4GemHKe5gSmh9RApOuswbxUhZ3b5os-SPSz1eY';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================
// 계정 설정
// 여기에 아이디/비밀번호를 직접 입력하세요
// =====================
const ACCOUNTS = {
  '은서': { password: '1234', partner: '호원' },
  '호원': { password: '1234', partner: '은서' },
};

// 계정 목록 순서로 역할(me/partner)을 정합니다. (DB의 user_type 컬럼과 매칭)
const ACCOUNT_NAMES = Object.keys(ACCOUNTS);
function roleOf(username) {
  return username === ACCOUNT_NAMES[0] ? 'me' : 'partner';
}

// 처음 만난 날짜 (D+ 계산용)
const START_DATE = new Date('2026-05-03');

// =====================
// 앱 상태
// =====================
let currentUser = null;
let currentRole = null;   // 'me' | 'partner'
let partnerRole = null;   // 'me' | 'partner'
let menuOpen = true;
let notifOpen = false;
let prevPage = 'home';
let prevMenu = 'menu-home';
let calYear, calMonth;
let calYearTheir, calMonthTheir;
let thoughtsYear, thoughtsMonth;
let timelineTarget = 'past';

// Supabase에서 불러온 데이터를 담아두는 캐시
// (매번 서버에 물어보지 않고, 로그인 시 한 번 불러와서 화면은 여기서 그림)
const cache = {
  myRecords: [],
  theirRecords: [],
  posts: [],
  letters: [],
  thoughts: [],
  timelinePast: [],
  timelineFuture: [],
  heroPhoto: null,
  profile: { bio: '', avatarUrl: null },
  notifications: [],
};

function getRecordsFor(role) {
  return role === currentRole ? cache.myRecords : cache.theirRecords;
}

// 알림은 이번 단계에서는 기기 간 동기화 없이 이 브라우저에만 저장돼요.
function getLocalData(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function setLocalData(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// =====================
// 사진 업로드 (Supabase Storage)
// =====================
async function uploadPhoto(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filename = `${currentRole}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('photos').upload(filename, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) {
    alert('사진 업로드에 실패했어요: ' + error.message);
    return null;
  }
  const { data } = sb.storage.from('photos').getPublicUrl(filename);
  return data.publicUrl;
}

// =====================
// 로그인
// =====================
async function doLogin() {
  const id = document.getElementById('loginId').value.trim();
  const pw = document.getElementById('loginPw').value;
  const err = document.getElementById('loginError');
  if (!ACCOUNTS[id]) {
    err.textContent = '아이디 또는 비밀번호가 맞지 않아요.';
    return;
  }

  const role = roleOf(id);
  let validPw = ACCOUNTS[id].password;
  try {
    const { data } = await sb.from('profiles').select('password').eq('user_type', role).maybeSingle();
    if (data && data.password) validPw = data.password;
  } catch (e) { /* 조회 실패하면 기본 비밀번호로 확인 */ }

  if (pw !== validPw) {
    err.textContent = '아이디 또는 비밀번호가 맞지 않아요.';
    return;
  }

  currentUser = id;
  currentRole = role;
  partnerRole = currentRole === 'me' ? 'partner' : 'me';
  err.textContent = '';
  localStorage.setItem('ryoo_session_user', id);

  const loginBtn = document.querySelector('.login-btn');
  if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = '불러오는 중...'; }

  try {
    await loadAllData();
  } catch (e) {
    err.textContent = '데이터를 불러오지 못했어요. 인터넷 연결을 확인해주세요.';
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = '로그인'; }
    return;
  }

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = '로그인'; }
  initApp();
}

document.getElementById('loginPw').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doLogin();
});

// =====================
// Supabase에서 전체 데이터 불러오기
// =====================
async function loadAllData() {
  const [myRecs, theirRecs, posts, letters, thoughts, tlPast, tlFuture, hero, profile, notifs] = await Promise.all([
    sb.from('records').select('*').eq('user_type', currentRole).order('date'),
    sb.from('records').select('*').eq('user_type', partnerRole).order('date'),
    sb.from('board_posts').select('*').order('created_at', { ascending: false }),
    sb.from('letters').select('*').order('created_at', { ascending: false }),
    sb.from('thoughts').select('*'),
    sb.from('timeline').select('*').eq('type', 'past').order('sort_order'),
    sb.from('timeline').select('*').eq('type', 'future').order('sort_order'),
    sb.from('hero_photo').select('*').order('updated_at', { ascending: false }).limit(1),
    sb.from('profiles').select('*').eq('user_type', currentRole).maybeSingle(),
    sb.from('notifications').select('*').eq('for_user', currentRole).order('created_at', { ascending: false }),
  ]);

  cache.myRecords = myRecs.data || [];
  cache.theirRecords = theirRecs.data || [];
  cache.posts = posts.data || [];
  cache.letters = letters.data || [];
  cache.thoughts = thoughts.data || [];
  cache.timelinePast = tlPast.data || [];
  cache.timelineFuture = tlFuture.data || [];
  cache.heroPhoto = (hero.data && hero.data[0])
    ? { url: hero.data[0].photo_url, focalX: hero.data[0].focal_x ?? 50, focalY: hero.data[0].focal_y ?? 50 }
    : null;
  cache.profile = profile.data
    ? {
        bio: profile.data.bio || '',
        avatarUrl: profile.data.avatar_url || null,
        avatarFocalX: profile.data.avatar_focal_x ?? 50,
        avatarFocalY: profile.data.avatar_focal_y ?? 50,
        avatarZoom: profile.data.avatar_zoom ?? 100,
      }
    : { bio: '', avatarUrl: null, avatarFocalX: 50, avatarFocalY: 50, avatarZoom: 100 };
  cache.notifications = notifs.data || [];

  await migratePastDueFuturePlans();
}

// tl_date는 "2024. 03" 같은 자유 텍스트라, 연/월만 뽑아서 비교함
function parseTlDate(str) {
  const m = (str || '').match(/(\d{4})\D+(\d{1,2})/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

async function migratePastDueFuturePlans() {
  const now = new Date();
  const curYM = now.getFullYear() * 12 + now.getMonth();
  const stillFuture = [];
  const toMigrate = [];

  cache.timelineFuture.forEach(item => {
    const parsed = parseTlDate(item.tl_date);
    if (parsed) {
      const itemYM = parsed.year * 12 + (parsed.month - 1);
      if (itemYM < curYM) { toMigrate.push(item); return; }
    }
    stillFuture.push(item);
  });

  if (toMigrate.length === 0) return;

  for (const item of toMigrate) {
    const { error } = await sb.from('timeline').update({ type: 'past' }).eq('id', item.id);
    if (!error) {
      item.type = 'past';
      cache.timelinePast.push(item);
    } else {
      stillFuture.push(item);
    }
  }
  cache.timelineFuture = stillFuture;
}

// =====================
// 앱 초기화
// =====================
function initApp() {
  const partner = ACCOUNTS[currentUser].partner;
  applyAvatar();
  document.getElementById('theirName').textContent = partner + '의 기록';
  document.getElementById('theirPageTitle').textContent = partner + '의 기록';
  document.getElementById('theirAvatarBtn').textContent = partner[0];
  document.getElementById('letterSalutation').textContent = partner + '에게,';
  document.getElementById('letterFrom').textContent = currentUser + '가 · ' + formatDate(new Date());

  // D+ 계산
  const today = new Date();
  const diff = Math.floor((today - START_DATE) / (1000 * 60 * 60 * 24)) + 1;
  document.getElementById('ddayCount').textContent = 'D+' + diff;
  document.getElementById('ddayDetail').textContent = formatDate(START_DATE) + ' 부터';

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
  if (cache.heroPhoto) applyHeroPhoto(cache.heroPhoto);

  syncHeaderHeight();

  // 모바일 화면에서는 사이드바를 기본적으로 접어둠
  if (window.innerWidth <= 700) {
    menuOpen = false;
    document.getElementById('sidebar').classList.add('hidden');
  }

  const restorablePages = ['home','myrecord','their','photos','board','past','future','thoughts','letter'];
  let restored = null;
  try { restored = JSON.parse(localStorage.getItem('ryoo_last_page') || 'null'); } catch (e) { restored = null; }
  if (restored && restorablePages.includes(restored.page) && document.getElementById('page-' + restored.page)) {
    showPage(restored.page, restored.menu);
  } else {
    showPage('home', 'menu-home');
  }
}

function syncHeaderHeight() {
  const header = document.querySelector('.header');
  if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
}
window.addEventListener('resize', syncHeaderHeight);

// =====================
// 페이지 전환
// =====================
function toggleMenu() {
  menuOpen = !menuOpen;
  document.getElementById('sidebar').classList.toggle('hidden', !menuOpen);
  const backdrop = document.getElementById('sidebarBackdrop');
  if (backdrop) backdrop.classList.toggle('hidden', !menuOpen);
}

function showPage(name, menuId) {
  if (name !== 'notif') {
    prevPage = name; prevMenu = menuId || '';
    localStorage.setItem('ryoo_last_page', JSON.stringify({ page: name, menu: menuId || '' }));
  }
  notifOpen = (name === 'notif');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (menuId) { const el = document.getElementById(menuId); if (el) el.classList.add('active'); }
  if (name === 'photos') renderAllPhotos();

  // 모바일에서는 메뉴에서 항목을 고르면 서랍을 자동으로 닫음
  if (window.innerWidth <= 700 && menuOpen) {
    menuOpen = false;
    document.getElementById('sidebar').classList.add('hidden');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

function toggleDdayDetail(e) {
  if (e) e.stopPropagation();
  document.getElementById('ddayDetail').classList.toggle('hidden');
}
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('ddayWrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('ddayDetail').classList.add('hidden');
  }
});

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

let heroFocusFile = null;
let heroFocusXY = { x: 50, y: 50 };

function loadHeroPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  heroFocusFile = file;
  heroFocusXY = { x: 50, y: 50 };
  const url = URL.createObjectURL(file);
  document.getElementById('heroFocusImg').src = url;
  document.getElementById('heroFocusMarker').style.left = '50%';
  document.getElementById('heroFocusMarker').style.top = '50%';
  openModal('modal-hero-focus');
}

function setHeroFocusFromEvent(e) {
  const wrap = document.getElementById('heroFocusWrap');
  const rect = wrap.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  const x = Math.max(0, Math.min(100, ((point.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((point.clientY - rect.top) / rect.height) * 100));
  heroFocusXY = { x, y };
  document.getElementById('heroFocusMarker').style.left = x + '%';
  document.getElementById('heroFocusMarker').style.top = y + '%';
}

document.getElementById('heroFocusWrap').addEventListener('click', setHeroFocusFromEvent);

function cancelHeroFocus() {
  heroFocusFile = null;
  document.getElementById('heroFileInput').value = '';
  closeModal('modal-hero-focus');
}

async function confirmHeroFocus() {
  if (!heroFocusFile) return;
  const saveBtn = document.querySelector('#modal-hero-focus .btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

  const url = await uploadPhoto(heroFocusFile);
  if (!url) { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; } return; }

  const { error } = await sb.from('hero_photo').insert({
    photo_url: url, focal_x: heroFocusXY.x, focal_y: heroFocusXY.y,
  });
  if (error) {
    alert('저장에 실패했어요: ' + error.message);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
    return;
  }

  cache.heroPhoto = { url, focalX: heroFocusXY.x, focalY: heroFocusXY.y };
  applyHeroPhoto(cache.heroPhoto);
  document.getElementById('heroFileInput').value = '';
  heroFocusFile = null;
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
  closeModal('modal-hero-focus');
}

function applyHeroPhoto(hero) {
  const img = document.getElementById('heroImg');
  img.onload = function() {
    const ratio = img.naturalHeight / img.naturalWidth;
    const photoArea = document.getElementById('photoArea');
    const heroSection = document.getElementById('heroSection');
    const areaW = photoArea.offsetWidth;
    const isMobile = window.innerWidth <= 700;
    const maxHeroH = isMobile ? 260 : 520;
    const rawH = Math.round(areaW * ratio);
    const sectionH = Math.max(180, Math.min(rawH, maxHeroH));

    if (isMobile) {
      // 모바일: 텍스트와 사진이 위아래로 쌓이는 구조라, 전체가 아니라
      // 사진 영역에만 높이를 지정해야 아래 섹션과 겹치지 않음
      heroSection.style.height = 'auto';
      photoArea.style.height = sectionH + 'px';
    } else {
      // 데스크탑: 텍스트와 사진이 나란히 있으므로 전체 높이를 맞춤
      heroSection.style.height = sectionH + 'px';
      photoArea.style.height = '';
    }

    // 패럴랙스용 여유 높이 (컨테이너보다 조금 더 크게 만들어서,
    // 스크롤해도 위/아래에 빈 공간이 보이지 않도록 이동 범위를 제한함)
    const overflowH = Math.round(sectionH * 0.2);
    img.style.height = (sectionH + overflowH) + 'px';
    img.style.width = '100%';
    img.style.objectPosition = hero.focalX + '% ' + hero.focalY + '%';
    img.style.display = 'block';
    img.style.transform = 'translateY(0px)';
    img.dataset.maxOffset = overflowH;
    document.getElementById('photoPlaceholder').style.display = 'none';
  };
  img.src = hero.url;
}

// 패럴랙스
document.querySelector('.content').addEventListener('scroll', function() {
  const scrollY = this.scrollTop;
  const img = document.getElementById('heroImg');
  if (img.style.display === 'block') {
    const maxOffset = parseFloat(img.dataset.maxOffset || '0');
    const offset = Math.max(0, Math.min(maxOffset, scrollY * 0.4));
    img.style.transform = 'translateY(-' + offset + 'px)';
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
  const records = getRecordsFor(currentRole);
  const today = new Date();
  for (let i = 0; i < first; i++) { const e = document.createElement('div'); e.className = 'cal-day'; grid.appendChild(e); }
  for (let d = 1; d <= total; d++) {
    const dateStr = calYear + '-' + String(calMonth + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const hasRecord = records.some(r => r.date === dateStr);
    const el = document.createElement('div');
    el.className = 'cal-day' + (hasRecord ? ' has-record' : '');
    if (today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d) el.classList.add('today');
    el.innerHTML = '<span class="cal-day-num">' + d + '</span>';
    el.dataset.date = dateStr;
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
  const role = who === 'my' ? currentRole : partnerRole;
  const records = getRecordsFor(role);
  const record = records.find(r => r.date === dateStr);
  renderDayDetail(dateStr, record, detailId, who === 'my');
}

function renderDayDetail(dateStr, record, detailId, canEdit) {
  const detail = document.getElementById(detailId);
  const emptyId = detailId === 'dayDetail' ? 'dayDetailEmpty' : 'dayDetailTheirEmpty';
  const emptyEl = document.getElementById(emptyId);

  if (!record) {
    detail.classList.add('hidden');
    detail.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  detail.classList.remove('hidden');
  detail.dataset.date = dateStr;
  if (emptyEl) emptyEl.style.display = 'none';
  const displayDate = dateStr.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2월 $3일');
  const photos = record?.photos || [];
  const diary = record?.diary || '';
  const reactions = record?.reactions || {};
  const comments = record?.comments || [];
  const savedTime = record?.created_at ? formatTimeShort(new Date(record.created_at)) : '';

  const commentsHtml = comments.map(c => `
    <div class="comment-row">
      <div class="comment-avatar">${c.author[0]}</div>
      <div><div class="comment-meta">${c.author} · ${c.date}</div><div class="comment-text">${c.text}</div></div>
    </div>`).join('');

  const photosHtml = photos.map(p => `<div class="day-photo"><img src="${p}" alt="사진"></div>`).join('')
    + (canEdit ? `<div class="day-photo day-photo-add" onclick="triggerAddDayPhotos('${dateStr}','${detailId}')"><i class="ti ti-plus"></i></div>` : '');

  const legacyKeys = ['heart', 'star', 'cry'];
  const reactionsHtml = Object.keys(reactions).filter(key => !legacyKeys.includes(key)).map(key => `
    <div class="reaction-btn ${reactions[key] > 0 ? 'active' : ''}" onclick="toggleReaction('${dateStr}','${key}','${detailId}')">${key} <span>${reactions[key]}</span></div>
  `).join('');

  detail.innerHTML = `
    <div class="day-detail-header">
      <div style="display:flex;align-items:baseline;gap:8px;">
        <span class="day-detail-title">${displayDate}</span>
        ${savedTime ? `<span class="day-detail-time">${savedTime}</span>` : ''}
      </div>
      ${canEdit ? `<i class="ti ti-pencil" style="font-size:14px;color:var(--text-tertiary);cursor:pointer" onclick="openEditDiary('${dateStr}')"></i>` : ''}
    </div>
    ${(photos.length || canEdit) ? `<div class="day-photos">${photosHtml}</div>` : ''}
    ${diary ? `<div class="day-diary">${diary}</div>` : ''}
    <div class="day-reactions" id="dayReactions-${detailId}">
      ${reactionsHtml}
      <div class="reaction-add-btn" onclick="openReactionPicker('${dateStr}','${detailId}', this)">+</div>
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

async function toggleReaction(dateStr, key, detailId) {
  const role = detailId === 'dayDetail' ? currentRole : partnerRole;
  const list = getRecordsFor(role);
  const idx = list.findIndex(r => r.date === dateStr);
  if (idx === -1) return;
  const reactions = { ...(list[idx].reactions || {}) };
  reactions[key] = reactions[key] > 0 ? 0 : 1;
  const { error } = await sb.from('records').update({ reactions }).eq('id', list[idx].id);
  if (error) { alert('저장에 실패했어요: ' + error.message); return; }
  list[idx].reactions = reactions;
  renderDayDetail(dateStr, list[idx], detailId, detailId === 'dayDetail');
}

function openReactionPicker(dateStr, detailId, btnEl) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'reaction-emoji-input';
  input.placeholder = '😊';
  input.maxLength = 8;
  btnEl.replaceWith(input);
  input.focus();

  let committed = false;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      committed = true;
      const val = input.value.trim();
      if (val) toggleReaction(dateStr, val, detailId);
      else cancelReactionPicker(dateStr, detailId);
    } else if (e.key === 'Escape') {
      committed = true;
      cancelReactionPicker(dateStr, detailId);
    }
  });
  input.addEventListener('blur', function() {
    if (committed) return;
    const val = input.value.trim();
    if (val) toggleReaction(dateStr, val, detailId);
    else cancelReactionPicker(dateStr, detailId);
  });
}

function cancelReactionPicker(dateStr, detailId) {
  const role = detailId === 'dayDetail' ? currentRole : partnerRole;
  const list = getRecordsFor(role);
  const record = list.find(r => r.date === dateStr);
  renderDayDetail(dateStr, record, detailId, detailId === 'dayDetail');
}

async function submitComment(dateStr, detailId) {
  const input = document.getElementById('commentInput-' + dateStr);
  const text = input.value.trim();
  if (!text) return;
  const role = detailId === 'dayDetail' ? currentRole : partnerRole;
  const list = getRecordsFor(role);
  const idx = list.findIndex(r => r.date === dateStr);
  if (idx === -1) return;
  const comments = [...(list[idx].comments || [])];
  comments.push({ author: currentUser, text, date: formatDateShort(new Date()) });
  const { error } = await sb.from('records').update({ comments }).eq('id', list[idx].id);
  if (error) { alert('저장에 실패했어요: ' + error.message); return; }
  list[idx].comments = comments;
  renderDayDetail(dateStr, list[idx], detailId, detailId === 'dayDetail');
}

// =====================
// 상대방 기록 캘린더
// =====================
function renderCalendarTheir() {
  const label = document.getElementById('calMonthLabelTheir');
  label.textContent = calYearTheir + '년 ' + (calMonthTheir + 1) + '월';
  const grid = document.getElementById('calGridTheir');
  grid.innerHTML = '';
  const days = ['일','월','화','수','목','금','토'];
  days.forEach(d => { const h = document.createElement('div'); h.className = 'cal-header'; h.textContent = d; grid.appendChild(h); });
  const first = new Date(calYearTheir, calMonthTheir, 1).getDay();
  const total = new Date(calYearTheir, calMonthTheir + 1, 0).getDate();
  const records = getRecordsFor(partnerRole);
  const today = new Date();
  for (let i = 0; i < first; i++) { const e = document.createElement('div'); e.className = 'cal-day'; grid.appendChild(e); }
  for (let d = 1; d <= total; d++) {
    const dateStr = calYearTheir + '-' + String(calMonthTheir + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const hasRecord = records.some(r => r.date === dateStr);
    const el = document.createElement('div');
    el.className = 'cal-day' + (hasRecord ? ' has-record' : '');
    if (today.getFullYear() === calYearTheir && today.getMonth() === calMonthTheir && today.getDate() === d) el.classList.add('today');
    el.innerHTML = '<span class="cal-day-num">' + d + '</span>';
    el.dataset.date = dateStr;
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
  document.getElementById('modalRecordTitle').textContent = '기록 추가';
  document.getElementById('recordDateGroup').style.display = '';
  document.getElementById('recordPhotosGroup').style.display = '';
  openModal('modal-record');
}

function openEditDiary(dateStr) {
  const records = getRecordsFor(currentRole);
  const record = records.find(r => r.date === dateStr) || {};
  document.getElementById('recordDate').value = dateStr;
  document.getElementById('recordDiary').value = record.diary || '';
  document.getElementById('recordPhotos').value = '';
  document.getElementById('modal-record').dataset.editDate = dateStr;
  document.getElementById('modalRecordTitle').textContent = '일기 수정';
  document.getElementById('recordDateGroup').style.display = 'none';
  document.getElementById('recordPhotosGroup').style.display = 'none';
  openModal('modal-record');
}

function triggerAddDayPhotos(dateStr, detailId) {
  const input = document.getElementById('dayPhotoAddInput');
  input.dataset.date = dateStr;
  input.dataset.detailId = detailId;
  input.value = '';
  input.click();
}

document.getElementById('dayPhotoAddInput').addEventListener('change', async function(e) {
  const files = e.target.files;
  if (!files.length) return;
  const dateStr = this.dataset.date;
  const detailId = this.dataset.detailId;
  const role = detailId === 'dayDetail' ? currentRole : partnerRole;
  const list = getRecordsFor(role);
  const record = list.find(r => r.date === dateStr);
  if (!record) return;

  const uploaded = await Promise.all(Array.from(files).map(uploadPhoto));
  const newPhotos = [...(record.photos || []), ...uploaded.filter(Boolean)];
  const { error } = await sb.from('records').update({ photos: newPhotos }).eq('id', record.id);
  if (error) { alert('저장에 실패했어요: ' + error.message); return; }
  record.photos = newPhotos;
  renderDayDetail(dateStr, record, detailId, detailId === 'dayDetail');
  renderCalendar();
  renderRecentEntries();
});

async function saveRecord() {
  const date = document.getElementById('recordDate').value;
  const diary = document.getElementById('recordDiary').value.trim();
  const files = document.getElementById('recordPhotos').files;
  if (!date) return;

  const saveBtn = document.querySelector('#modal-record .btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

  try {
    const list = getRecordsFor(currentRole);
    const existing = list.find(r => r.date === date);
    let photoUrls = existing ? [...(existing.photos || [])] : [];

    if (files.length > 0) {
      const uploaded = await Promise.all(Array.from(files).map(uploadPhoto));
      photoUrls.push(...uploaded.filter(Boolean));
    }

    if (existing) {
      const { error } = await sb.from('records').update({ diary, photos: photoUrls }).eq('id', existing.id);
      if (error) throw error;
      existing.diary = diary;
      existing.photos = photoUrls;
    } else {
      const { data, error } = await sb.from('records').insert({
        user_type: currentRole, date, diary, photos: photoUrls,
        reactions: {}, comments: [],
      }).select().single();
      if (error) throw error;
      list.push(data);
      addNotif(partnerRole, currentUser + '님이 새 기록을 남겼어요', 'record', 'their', 'menu-their', null, date);
    }
    list.sort((a, b) => a.date.localeCompare(b.date));
    closeModal('modal-record');
    renderCalendar();
    renderRecentEntries();
    // 방금 저장한 날짜를 캘린더에서 선택 표시하고, 상세 내용도 바로 갱신
    const updated = list.find(r => r.date === date);
    const cell = document.querySelector('#calGrid .cal-day[data-date="' + date + '"]');
    if (cell) {
      document.querySelectorAll('#calGrid .cal-day').forEach(d => d.classList.remove('selected'));
      cell.classList.add('selected');
    }
    renderDayDetail(date, updated, 'dayDetail', true);
  } catch (e) {
    alert('저장에 실패했어요: ' + e.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
  }
}

// =====================
// 홈 최근 기록
// =====================
function renderRecentEntries() {
  const partner = ACCOUNTS[currentUser]?.partner;
  if (!partner) return;
  const myRecords = cache.myRecords.map(r => ({ ...r, who: currentUser, role: currentRole }));
  const theirRecords = cache.theirRecords.map(r => ({ ...r, who: partner, role: partnerRole }));
  const all = [...myRecords, ...theirRecords].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 15);

  const grid = document.getElementById('recentGrid');
  const entries = document.getElementById('recentEntries');
  grid.innerHTML = '';
  entries.innerHTML = '';

  const thumbs = all.filter(r => r.photos && r.photos.length > 0).slice(0, 3);
  if (thumbs.length === 0) {
    grid.style.display = 'none';
  } else {
    grid.style.display = '';
    thumbs.forEach(t => {
      const el = document.createElement('div');
      el.className = 'recent-thumb';
      el.style.cursor = 'pointer';
      const img = document.createElement('img');
      img.src = t.photos[0];
      el.appendChild(img);
      el.onclick = () => openRecordDate(t.date, t.role);
      grid.appendChild(el);
    });
  }

  all.slice(0, 5).forEach(r => {
    const el = document.createElement('div');
    el.className = 'recent-entry';
    el.style.cursor = 'pointer';
    const d = r.date.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2월 $3일');
    el.innerHTML = `<span class="recent-entry-text">${r.who === currentUser ? '' : r.who + ' · '}${r.diary ? r.diary.slice(0, 30) + (r.diary.length > 30 ? '...' : '') : '사진 기록'}</span><span class="recent-entry-date">${d}</span>`;
    el.onclick = () => openRecordDate(r.date, r.role);
    entries.appendChild(el);
  });
}

function openRecordDate(dateStr, role) {
  const [y, m] = dateStr.split('-').map(Number);
  if (role === currentRole) {
    calYear = y; calMonth = m - 1;
    showPage('myrecord', 'menu-myrecord');
    renderCalendar();
    const cell = document.querySelector('#calGrid .cal-day[data-date="' + dateStr + '"]');
    if (cell) selectDay(cell, dateStr, 'my');
  } else {
    calYearTheir = y; calMonthTheir = m - 1;
    showPage('their', 'menu-their');
    renderCalendarTheir();
    const cell = document.querySelector('#calGridTheir .cal-day[data-date="' + dateStr + '"]');
    if (cell) selectDay(cell, dateStr, 'their');
  }
}

// =====================
// 게시판
// =====================
function authorNameOf(userType) {
  return userType === currentRole ? currentUser : ACCOUNTS[currentUser].partner;
}

function renderBoard() {
  const posts = cache.posts;
  const list = document.getElementById('boardList');
  list.className = 'board-list';
  list.innerHTML = '';
  const notices = posts.filter(p => p.is_notice);
  const normals = posts.filter(p => !p.is_notice);
  [...notices, ...normals].forEach(post => {
    const el = document.createElement('div');
    el.className = 'board-item' + (post.is_notice ? ' board-notice' : '');
    el.innerHTML = `
      <div class="board-item-title">${post.is_notice ? '<span class="notice-badge">공지</span>' : ''}${post.title}</div>
      <div class="board-item-meta"><span>${authorNameOf(post.user_type)}</span><span>${formatDateShort(new Date(post.created_at))}</span></div>`;
    el.onclick = () => openPostView(post.id);
    list.appendChild(el);
  });
  if (posts.length === 0) {
    list.innerHTML = '<div style="padding:20px 0;font-size:13px;color:var(--text-tertiary);">아직 게시글이 없어요.</div>';
  }
}

function openPostView(id) {
  const post = cache.posts.find(p => p.id === id);
  if (!post) return;
  document.getElementById('postViewTitle').textContent = post.title;
  document.getElementById('postViewContent').textContent = post.content || '';
  document.getElementById('postViewMeta').textContent = authorNameOf(post.user_type) + ' · ' + formatDateShort(new Date(post.created_at));
  document.getElementById('postViewNoticeBadge').classList.toggle('hidden', !post.is_notice);
  document.getElementById('postViewEditBtn').onclick = () => openWritePost(post.id);
  showPage('post-view', 'menu-board');
}

function openWritePost(editId) {
  const post = editId ? cache.posts.find(p => p.id === editId) : null;
  document.getElementById('postTitle').value = post ? post.title : '';
  document.getElementById('postContent').value = post ? (post.content || '') : '';
  document.getElementById('postNotice').checked = post ? post.is_notice : false;
  document.getElementById('page-post-write').dataset.editId = editId || '';
  document.getElementById('postWriteHeaderTitle').textContent = editId ? '글 수정' : '글 쓰기';
  showPage('post-write', 'menu-board');
}

async function savePost() {
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  const notice = document.getElementById('postNotice').checked;
  if (!title) return;
  const editId = document.getElementById('page-post-write').dataset.editId;

  if (editId) {
    const { error } = await sb.from('board_posts').update({ title, content, is_notice: notice }).eq('id', editId);
    if (error) { alert('저장에 실패했어요: ' + error.message); return; }
    const post = cache.posts.find(p => p.id === editId);
    if (post) { post.title = title; post.content = content; post.is_notice = notice; }
    renderBoard();
    openPostView(editId);
  } else {
    const { data, error } = await sb.from('board_posts').insert({
      user_type: currentRole, title, content, is_notice: notice,
    }).select().single();
    if (error) { alert('게시에 실패했어요: ' + error.message); return; }
    cache.posts.unshift(data);
    if (partnerRole) addNotif(partnerRole, currentUser + '님이 게시글을 올렸어요', 'board', 'board', 'menu-board', data.id);
    renderBoard();
    showPage('board', 'menu-board');
  }
}

// =====================
// 연표
// =====================
function renderTimeline() {
  const items = cache.timelinePast.slice().sort((a, b) => a.tl_date.localeCompare(b.tl_date));
  const wrap = document.getElementById('pastTimeline');
  wrap.innerHTML = '<div class="tl-line"></div>';
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'tl-item';
    el.dataset.id = item.id;
    el.innerHTML = `<div class="tl-dot"></div><div class="tl-date">${item.tl_date}</div><div class="tl-title">${item.title}</div>${item.description ? `<div class="tl-desc">${item.description}</div>` : ''}`;
    el.onclick = () => openEditTimeline('past', item.id);
    wrap.appendChild(el);
  });
  if (items.length === 0) wrap.innerHTML += '<div style="font-size:13px;color:var(--text-tertiary);">아직 기록이 없어요.</div>';
}

function renderFuture() {
  const items = cache.timelineFuture.slice().sort((a, b) => a.tl_date.localeCompare(b.tl_date));
  const wrap = document.getElementById('futureList');
  wrap.innerHTML = '<div class="tl-line"></div>';
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'tl-item';
    el.dataset.id = item.id;
    el.innerHTML = `<div class="tl-dot"></div><div class="tl-date">${item.tl_date}</div><div class="tl-title">${item.title}</div>${item.description ? `<div class="tl-desc">${item.description}</div>` : ''}`;
    el.onclick = () => openEditTimeline('future', item.id);
    wrap.appendChild(el);
  });
  if (items.length === 0) wrap.innerHTML += '<div style="font-size:13px;color:var(--text-tertiary);">아직 계획이 없어요.</div>';
}

function openAddTimeline(target) {
  timelineTarget = target;
  document.getElementById('modal-timeline').dataset.editId = '';
  document.getElementById('timelineModalTitle').textContent = target === 'past' ? '과거 기록 추가' : '미래 계획 추가';
  document.getElementById('tlDate').value = '';
  document.getElementById('tlTitle').value = '';
  document.getElementById('tlDesc').value = '';
  document.getElementById('tlDeleteBtn').classList.add('hidden');
  openModal('modal-timeline');
}

function openEditTimeline(target, id) {
  timelineTarget = target;
  const list = target === 'past' ? cache.timelinePast : cache.timelineFuture;
  const item = list.find(i => i.id === id);
  if (!item) return;
  document.getElementById('modal-timeline').dataset.editId = id;
  document.getElementById('timelineModalTitle').textContent = target === 'past' ? '과거 기록 수정' : '미래 계획 수정';
  document.getElementById('tlDate').value = item.tl_date;
  document.getElementById('tlTitle').value = item.title;
  document.getElementById('tlDesc').value = item.description || '';
  document.getElementById('tlDeleteBtn').classList.remove('hidden');
  openModal('modal-timeline');
}

async function deleteTimelineItem() {
  const editId = document.getElementById('modal-timeline').dataset.editId;
  if (!editId) return;
  if (!confirm('이 항목을 삭제할까요?')) return;
  const { error } = await sb.from('timeline').delete().eq('id', editId);
  if (error) { alert('삭제에 실패했어요: ' + error.message); return; }
  cache.timelinePast = cache.timelinePast.filter(i => i.id !== editId);
  cache.timelineFuture = cache.timelineFuture.filter(i => i.id !== editId);
  closeModal('modal-timeline');
  renderTimeline();
  renderFuture();
}

async function saveTimeline() {
  const date = document.getElementById('tlDate').value.trim();
  const title = document.getElementById('tlTitle').value.trim();
  const desc = document.getElementById('tlDesc').value.trim();
  if (!date || !title) return;
  const editId = document.getElementById('modal-timeline').dataset.editId;
  const list = timelineTarget === 'past' ? cache.timelinePast : cache.timelineFuture;

  if (editId) {
    const { error } = await sb.from('timeline').update({ tl_date: date, title, description: desc }).eq('id', editId);
    if (error) { alert('저장에 실패했어요: ' + error.message); return; }
    const item = list.find(i => i.id === editId);
    if (item) { item.tl_date = date; item.title = title; item.description = desc; }
  } else {
    const { data, error } = await sb.from('timeline').insert({
      type: timelineTarget, tl_date: date, title, description: desc, sort_order: list.length,
    }).select().single();
    if (error) { alert('저장에 실패했어요: ' + error.message); return; }
    list.push(data);
    const label = timelineTarget === 'past' ? '과거 기록' : '미래 계획';
    addNotif(partnerRole, currentUser + '님이 ' + label + '을 남겼어요', 'timeline', timelineTarget, timelineTarget === 'past' ? 'menu-past' : 'menu-future', data.id);
  }

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
  const monthStr = thoughtsYear + '-' + String(thoughtsMonth + 1).padStart(2, '0');
  const thoughts = cache.thoughts
    .filter(t => (t.month || '').startsWith(monthStr))
    .sort(() => Math.random() - 0.5); // 순서를 매번 랜덤하게 섞어서 흩어진 느낌을 줌
  const canvas = document.getElementById('thoughtsCanvas');
  canvas.innerHTML = '';
  const aligns = ['flex-start', 'center', 'flex-end'];
  thoughts.forEach(t => {
    const el = document.createElement('div');
    el.className = 'thought-tag';
    el.style.alignSelf = aligns[Math.floor(Math.random() * aligns.length)];
    el.style.marginTop = Math.floor(Math.random() * 26) + 'px';
    el.style.marginLeft = Math.floor(Math.random() * 60) + 'px';
    const d = new Date(t.created_at);
    const meta = authorNameOf(t.user_type) + ' · ' + formatDateShort(d) + ' ' + formatTimeShort(d);
    el.innerHTML = `<span>${t.content}</span><span class="thought-tag-meta">${meta}</span>`;
    canvas.appendChild(el);
  });
  if (thoughts.length === 0) {
    canvas.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);">이 달엔 아직 남긴 생각이 없어요.</div>';
  }
}

async function addThought() {
  const input = document.getElementById('thoughtInput');
  const text = input.value.trim();
  if (!text) return;
  const monthStr = thoughtsYear + '-' + String(thoughtsMonth + 1).padStart(2, '0') + '-01';

  const { data, error } = await sb.from('thoughts').insert({
    user_type: currentRole, content: text, month: monthStr,
  }).select().single();
  if (error) { alert('저장에 실패했어요: ' + error.message); return; }
  cache.thoughts.push(data);
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
  // 나에게 온 편지 = 내가 보낸 게 아닌 편지 (계정이 둘뿐이라 나머지는 전부 상대가 보낸 것)
  const letters = cache.letters.filter(l => l.from_user !== currentRole);
  const list = document.getElementById('letterList');
  list.className = 'letter-list';
  list.innerHTML = '';
  letters.forEach(letter => {
    const el = document.createElement('div');
    el.className = 'letter-card' + (!letter.is_read ? ' unread' : '');
    el.innerHTML = `
      <div class="letter-meta">
        <span>${authorNameOf(letter.from_user)} → ${currentUser}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span>${formatDateShort(new Date(letter.created_at))}</span>
          ${!letter.is_read ? '<span class="unread-badge">새 편지</span>' : ''}
        </div>
      </div>
      <div class="letter-preview">${letter.content.slice(0, 50)}...</div>`;
    el.onclick = () => openLetter(letter);
    list.appendChild(el);
  });
  if (letters.length === 0) list.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);">아직 받은 편지가 없어요.</div>';
}

async function openLetter(letter) {
  if (!letter.is_read) {
    const { error } = await sb.from('letters').update({ is_read: true }).eq('id', letter.id);
    if (!error) {
      const idx = cache.letters.findIndex(l => l.id === letter.id);
      if (idx !== -1) cache.letters[idx].is_read = true;
    }
  }
  document.getElementById('viewLetterSalutation').textContent = currentUser + '에게,';
  document.getElementById('viewLetterContent').textContent = letter.content;
  document.getElementById('viewLetterFrom').textContent = authorNameOf(letter.from_user) + '가 · ' + formatDateShort(new Date(letter.created_at));
  openModal('modal-letter-view');
  renderLetters();
}

async function sendLetter() {
  const content = document.getElementById('letterContent').value.trim();
  if (!content) return;
  const { data, error } = await sb.from('letters').insert({
    from_user: currentRole, content, is_read: false,
  }).select().single();
  if (error) { alert('편지 전송에 실패했어요: ' + error.message); return; }
  cache.letters.unshift(data);
  document.getElementById('letterContent').value = '';
  addNotif(partnerRole, currentUser + '님이 편지를 보냈어요', 'letter', 'letter', 'menu-letter', data.id);
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
async function addNotif(forRole, text, type, linkPage, linkMenu, refId, refDate) {
  try {
    const { data, error } = await sb.from('notifications').insert({
      for_user: forRole, text, type, link_page: linkPage || null, link_menu: linkMenu || null,
      ref_id: refId || null, ref_date: refDate || null,
    }).select().single();
    if (!error && data && forRole === currentRole) cache.notifications.unshift(data);
  } catch (e) { /* 알림은 부가 기능이라 실패해도 조용히 넘어감 */ }
}

function renderNotifs() {
  const notifs = cache.notifications;
  const list = document.getElementById('notifList');
  list.className = 'notif-list';
  list.innerHTML = '';
  notifs.forEach(n => {
    const el = document.createElement('div');
    el.className = 'notif-item' + (n.is_read ? ' notif-read' : '');
    const d = new Date(n.created_at);
    el.innerHTML = `<div class="notif-text">${n.text}</div><div class="notif-time">${formatDateShort(d)} ${formatTimeShort(d)}</div>`;
    el.onclick = () => openNotif(n);
    list.appendChild(el);
  });
  if (notifs.length === 0) list.innerHTML = '<div style="padding:20px 0;font-size:13px;color:var(--text-tertiary);">새 알림이 없어요.</div>';
  const hasUnread = notifs.some(n => !n.is_read);
  document.getElementById('notifDot').style.display = hasUnread ? 'block' : 'none';
}

async function openNotif(n) {
  if (!n.is_read) {
    const { error } = await sb.from('notifications').update({ is_read: true }).eq('id', n.id);
    if (!error) n.is_read = true;
  }
  renderNotifs();

  if (n.type === 'letter') {
    showPage('letter', 'menu-letter');
    switchLetterTab(document.querySelectorAll('.letter-tab')[0], 'inbox');
    if (n.ref_id) {
      const letter = cache.letters.find(l => l.id === n.ref_id);
      if (letter) openLetter(letter);
    }
  } else if (n.type === 'board') {
    showPage('board', 'menu-board');
    if (n.ref_id) openPostView(n.ref_id);
  } else if (n.type === 'record' && n.ref_date) {
    openRecordDate(n.ref_date, partnerRole);
  } else if (n.type === 'timeline') {
    showPage(n.link_page, n.link_menu);
    if (n.ref_id) {
      setTimeout(() => {
        const el = document.querySelector('.tl-item[data-id="' + n.ref_id + '"]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.transition = 'background 0.3s';
          el.style.background = 'var(--bg-secondary)';
          setTimeout(() => { el.style.background = ''; }, 1500);
        }
      }, 60);
    }
  } else if (n.link_page) {
    showPage(n.link_page, n.link_menu);
  }
}

// =====================
// 모든 사진
// =====================
let allPhotosFiltered = [];
let lbIdx = 0;
let currentPhotoFilter = 'all';

function renderAllPhotos() {
  const partner = ACCOUNTS[currentUser].partner;
  const myRecords = cache.myRecords.map(r => ({ ...r, who: currentUser }));
  const theirRecords = cache.theirRecords.map(r => ({ ...r, who: partner }));
  const all = [...myRecords, ...theirRecords].sort((a,b) => b.date.localeCompare(a.date));

  document.getElementById('filterMyTag').textContent = currentUser + ' 사진';
  document.getElementById('filterTheirTag').textContent = partner + ' 사진';

  if (currentPhotoFilter === 'my') allPhotosFiltered = all.filter(r => r.who === currentUser);
  else if (currentPhotoFilter === 'their') allPhotosFiltered = all.filter(r => r.who === partner);
  else allPhotosFiltered = all;

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

(function() {
  let touchStartX = 0;
  const lightbox = document.getElementById('lightbox');
  lightbox.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) moveLb(1); else moveLb(-1);
  }, { passive: true });
})();

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
function formatTimeShort(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

// =====================
// 프로필 패널
// =====================
let pendingAvatarUrl = null;
let pendingAvatarFocal = { x: 50, y: 50 };
let pendingAvatarZoom = 100;
let avatarFocusFile = null;
let avatarFocusXY = { x: 50, y: 50 };
let avatarFocusZoom = 100;

function applyAvatar() {
  const avatarEl = document.getElementById('userAvatar');
  if (cache.profile.avatarUrl) {
    avatarEl.style.backgroundImage = `url(${cache.profile.avatarUrl})`;
    avatarEl.style.backgroundSize = (cache.profile.avatarZoom ?? 100) + '% auto';
    avatarEl.style.backgroundPosition = (cache.profile.avatarFocalX ?? 50) + '% ' + (cache.profile.avatarFocalY ?? 50) + '%';
    avatarEl.textContent = '';
  } else {
    avatarEl.style.backgroundImage = '';
    avatarEl.textContent = currentUser[0];
  }
}

function openProfilePanel() {
  const panel = document.getElementById('profilePanel');
  panel.classList.remove('view-mode');
  document.getElementById('profilePanelTitle').textContent = '프로필';

  document.getElementById('profileBio').value = cache.profile.bio || '';
  document.getElementById('profileNewPw').value = '';
  pendingAvatarUrl = null;
  pendingAvatarFocal = { x: cache.profile.avatarFocalX ?? 50, y: cache.profile.avatarFocalY ?? 50 };
  pendingAvatarZoom = cache.profile.avatarZoom ?? 100;

  const avatarImg = document.getElementById('profileAvatarImg');
  const initial = document.getElementById('profileAvatarInitial');
  if (cache.profile.avatarUrl) {
    avatarImg.src = cache.profile.avatarUrl;
    avatarImg.style.objectPosition = pendingAvatarFocal.x + '% ' + pendingAvatarFocal.y + '%';
    avatarImg.style.transform = 'scale(' + (pendingAvatarZoom / 100) + ')';
    avatarImg.style.display = 'block';
    initial.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    initial.style.display = 'block';
    initial.textContent = currentUser[0];
  }

  panel.classList.remove('closed');
  document.getElementById('profilePanelBackdrop').classList.remove('hidden');
}

async function openPartnerProfile() {
  const panel = document.getElementById('profilePanel');
  const partnerName = ACCOUNTS[currentUser].partner;
  panel.classList.add('view-mode');
  document.getElementById('profilePanelTitle').textContent = partnerName + '의 프로필';

  const avatarImg = document.getElementById('profileAvatarImg');
  const initial = document.getElementById('profileAvatarInitial');
  avatarImg.style.display = 'none';
  avatarImg.style.transform = 'none';
  initial.style.display = 'block';
  initial.textContent = '···';
  document.getElementById('profileBioViewText').textContent = '불러오는 중...';

  panel.classList.remove('closed');
  document.getElementById('profilePanelBackdrop').classList.remove('hidden');

  const { data } = await sb.from('profiles').select('*').eq('user_type', partnerRole).maybeSingle();

  if (data && data.avatar_url) {
    avatarImg.src = data.avatar_url;
    avatarImg.style.objectPosition = (data.avatar_focal_x ?? 50) + '% ' + (data.avatar_focal_y ?? 50) + '%';
    avatarImg.style.transform = 'scale(' + ((data.avatar_zoom ?? 100) / 100) + ')';
    avatarImg.style.display = 'block';
    initial.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    initial.style.display = 'block';
    initial.textContent = partnerName[0];
  }
  document.getElementById('profileBioViewText').textContent = (data && data.bio) ? data.bio : '아직 소개글이 없어요.';
}

function closeProfilePanel() {
  document.getElementById('profilePanel').classList.add('closed');
  document.getElementById('profilePanelBackdrop').classList.add('hidden');
}

function triggerProfileAvatarUpload() {
  if (document.getElementById('profilePanel').classList.contains('view-mode')) return;
  document.getElementById('profileAvatarInput').click();
}

// 사진을 고르면 바로 올리지 않고, 초점 위치와 확대 정도를 먼저 정하게 함
function loadProfileAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;
  avatarFocusFile = file;
  avatarFocusXY = { x: 50, y: 50 };
  avatarFocusZoom = 100;
  document.getElementById('avatarZoomSlider').value = 100;
  const url = URL.createObjectURL(file);
  const img = document.getElementById('avatarFocusImg');
  img.src = url;
  img.style.transform = 'scale(1)';
  document.getElementById('avatarFocusMarker').style.left = '50%';
  document.getElementById('avatarFocusMarker').style.top = '50%';
  openModal('modal-avatar-focus');
}

document.getElementById('avatarFocusWrap').addEventListener('click', function(e) {
  const rect = this.getBoundingClientRect();
  const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
  avatarFocusXY = { x, y };
  document.getElementById('avatarFocusMarker').style.left = x + '%';
  document.getElementById('avatarFocusMarker').style.top = y + '%';
});

function updateAvatarZoomPreview(val) {
  avatarFocusZoom = Number(val);
  document.getElementById('avatarFocusImg').style.transform = 'scale(' + (avatarFocusZoom / 100) + ')';
}

function cancelAvatarFocus() {
  avatarFocusFile = null;
  document.getElementById('profileAvatarInput').value = '';
  closeModal('modal-avatar-focus');
}

async function confirmAvatarFocus() {
  if (!avatarFocusFile) return;
  const saveBtn = document.querySelector('#modal-avatar-focus .btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

  const url = await uploadPhoto(avatarFocusFile);
  if (!url) { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; } return; }

  pendingAvatarUrl = url;
  pendingAvatarFocal = { ...avatarFocusXY };
  pendingAvatarZoom = avatarFocusZoom;

  const avatarImg = document.getElementById('profileAvatarImg');
  avatarImg.src = url;
  avatarImg.style.objectPosition = pendingAvatarFocal.x + '% ' + pendingAvatarFocal.y + '%';
  avatarImg.style.transform = 'scale(' + (pendingAvatarZoom / 100) + ')';
  avatarImg.style.display = 'block';
  document.getElementById('profileAvatarInitial').style.display = 'none';

  avatarFocusFile = null;
  document.getElementById('profileAvatarInput').value = '';
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
  closeModal('modal-avatar-focus');
}

async function saveProfile() {
  const bio = document.getElementById('profileBio').value.trim();
  const newPw = document.getElementById('profileNewPw').value;
  const saveBtn = document.querySelector('.profile-panel-body .btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

  const payload = { user_type: currentRole, bio };
  if (pendingAvatarUrl) {
    payload.avatar_url = pendingAvatarUrl;
    payload.avatar_focal_x = pendingAvatarFocal.x;
    payload.avatar_focal_y = pendingAvatarFocal.y;
    payload.avatar_zoom = pendingAvatarZoom;
  }
  if (newPw) payload.password = newPw;

  const { data, error } = await sb.from('profiles').upsert(payload, { onConflict: 'user_type' }).select().single();
  if (error) {
    alert('저장에 실패했어요: ' + error.message);
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
    return;
  }

  cache.profile = {
    bio: data.bio || '',
    avatarUrl: data.avatar_url || null,
    avatarFocalX: data.avatar_focal_x ?? 50,
    avatarFocalY: data.avatar_focal_y ?? 50,
    avatarZoom: data.avatar_zoom ?? 100,
  };
  applyAvatar();
  pendingAvatarUrl = null;
  document.getElementById('profileNewPw').value = '';
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
  closeProfilePanel();
  alert(newPw ? '저장했어요. 다음 로그인부터 새 비밀번호를 사용해주세요.' : '저장했어요.');
}

// =====================
// 로그인 상태 유지 / 로그아웃
// =====================
function doLogout() {
  localStorage.removeItem('ryoo_session_user');
  location.reload();
}

async function tryAutoLogin() {
  const saved = localStorage.getItem('ryoo_session_user');
  if (!saved || !ACCOUNTS[saved]) return;

  currentUser = saved;
  currentRole = roleOf(saved);
  partnerRole = currentRole === 'me' ? 'partner' : 'me';

  try {
    await loadAllData();
  } catch (e) {
    return; // 실패하면 그냥 로그인 화면 그대로 둠
  }
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  initApp();
}

tryAutoLogin();
