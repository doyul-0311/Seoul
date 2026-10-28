import { BASE, ORIGINS, CATS, PRICE } from './places.js';
import { firebaseConfig } from './firebase-config.js';

const FIREBASE_VERSION = '10.12.2';

const S = {
  origin: 'gwm', mode: 'lunch', sort: 'near', cat: null, showAll: false,
  reviews: [], added: [], closed: new Set(),
  backend: 'loading', // loading | live | off | error
  fb: null, uid: null,
  google: {}, googleOn: false,
  sheetId: null, pickPool: null, confirmClose: false, stars: 0, showHidden: false,
};

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
{ const o = ls.get('gw_origin'); if (ORIGINS.some((x) => x.id === o)) S.origin = o; }
{ const m = ls.get('gw_mode'); if (m === 'lunch' || m === 'dinner') S.mode = m; }
{ const s = ls.get('gw_sort'); if (['near', 'team', 'google'].includes(s)) S.sort = s; }

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const starStr = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
const catOf = (id) => CATS.find((c) => c.id === id) || CATS[2];
const canWrite = () => S.backend === 'live' && !!S.uid;
const fmtCount = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + '천' : String(n));

function dist(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function walkOf(p) {
  if (p.walk) return p.walk;
  const o = ORIGINS.find((x) => x.id === S.origin);
  return Math.max(1, Math.round((dist(o, p) * 1.3) / 70));
}

function allPlaces() {
  const added = S.added.map((a) => ({
    id: 'u_' + a.id, n: String(a.name || '').slice(0, 30), c: CATS.some((c) => c.id === a.cat) ? a.cat : 'rice',
    a: String(a.area || ''), walk: Math.min(30, Math.max(1, Number(a.walk) || 5)),
    p: [1, 2, 3].includes(Number(a.price)) ? Number(a.price) : 2, m: String(a.menu || ''), phone: String(a.phone || ''),
    g: a.group ? 1 : 0, room: a.group ? 1 : 0, d: a.group ? 1 : 0, added: true, uid: a.uid,
  })).filter((p) => p.n);
  return BASE.concat(added);
}
function teamRatings() {
  const r = {};
  for (const v of S.reviews) {
    const s = Number(v.stars);
    if (!(s >= 1 && s <= 5)) continue;
    (r[v.pid] ??= { sum: 0, n: 0 });
    r[v.pid].sum += s; r[v.pid].n++;
  }
  return r;
}
// 리뷰 수가 적으면 평균(4.0) 쪽으로 당겨서 순위를 매깁니다. 표시는 원래 평점 그대로.
const bayes = (avg, n, prior, weight) => (avg * n + prior * weight) / (n + weight);

function visible() { return allPlaces().filter((p) => !S.closed.has(p.id)); }
function enrich(list) {
  const R = teamRatings();
  return list.map((p) => {
    const w = walkOf(p), rt = R[p.id], gg = S.google[p.id];
    const avg = rt ? rt.sum / rt.n : 0;
    const gr = gg && typeof gg.rating === 'number' ? gg : null;
    const dinner = (p.room ? 3 : 0) + (p.g ? 2 : 0) + (p.d ? 2 : 0) + avg * 0.6 - w * 0.15;
    return { ...p, w, avg, rn: rt ? rt.n : 0, gg: gr, dinner,
      teamScore: rt ? bayes(avg, rt.n, 3.8, 2) : 0,
      gScore: gr ? bayes(gr.rating, gr.count, 4.0, 30) : 0 };
  });
}
function sorted(list) {
  const base = (a, b) => (S.mode === 'dinner' ? b.dinner - a.dinner || a.w - b.w : a.w - b.w || b.avg - a.avg);
  return enrich(list).sort((a, b) => {
    if (S.sort === 'team') { if (!!b.rn !== !!a.rn) return b.rn ? 1 : -1; if (a.rn && b.rn && b.teamScore !== a.teamScore) return b.teamScore - a.teamScore; }
    if (S.sort === 'google' && S.googleOn) { if (!!b.gg !== !!a.gg) return b.gg ? 1 : -1; if (a.gg && b.gg && b.gScore !== a.gScore) return b.gScore - a.gScore; }
    return base(a, b);
  });
}
const naverUrl = (p) => 'https://map.naver.com/p/search/' + encodeURIComponent(p.q || p.n);
const googleUrl = (p) => (S.google[p.id] && S.google[p.id].uri) || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((p.q || p.n) + ' 서울');

/* ---------- render ---------- */
function renderControls() {
  $('originSeg').innerHTML = ORIGINS.map((o) => `<button data-o="${o.id}" aria-pressed="${o.id === S.origin}">${esc(o.label)}</button>`).join('');
  $('mLunch').setAttribute('aria-pressed', S.mode === 'lunch');
  $('mDinner').setAttribute('aria-pressed', S.mode === 'dinner');
  $('sNear').textContent = S.mode === 'dinner' ? '회식 추천순' : '가까운 순';
  $('sGoogle').hidden = !S.googleOn;
  const sort = S.sort === 'google' && !S.googleOn ? 'near' : S.sort;
  $('sNear').setAttribute('aria-pressed', sort === 'near');
  $('sTeam').setAttribute('aria-pressed', sort === 'team');
  $('sGoogle').setAttribute('aria-pressed', sort === 'google');
  $('gAttr').hidden = !S.googleOn;
}
function renderTiles() {
  const v = visible();
  $('tiles').innerHTML = CATS.map((c) => {
    const n = v.filter((p) => p.c === c.id).length;
    return `<button class="tile" data-cat="${c.id}" aria-pressed="${S.cat === c.id}"><span class="g">${c.g}</span><span class="l">${c.l}</span><span class="c num">${n}곳</span></button>`;
  }).join('') + `<button class="tile any" id="anyBtn"><span class="g">?</span><span class="l">아무거나</span><span class="c">${S.mode === 'lunch' ? '10분 안쪽에서' : '회식 후보에서'}</span></button>`;
  $('clearCat').hidden = !S.cat;
}
function scoreHTML(p) {
  const g = p.gg ? `<span class="num">G ★ ${p.gg.rating.toFixed(1)}</span>리뷰 ${fmtCount(p.gg.count)}` : '';
  const t = p.rn ? `<span class="num">★ ${p.avg.toFixed(1)}</span>동료 ${p.rn}` : '';
  if (S.sort === 'google' && g) return g;
  if (S.sort === 'team' && t) return t;
  return t || g || `<span class="num">${'₩'.repeat(p.p)}</span>${PRICE[p.p]}`;
}
function rowHTML(p) {
  const pills = [];
  if (p.room) pills.push('<span class="pill acc">룸</span>');
  else if (p.g && S.mode === 'dinner') pills.push('<span class="pill">여럿이</span>');
  if (p.added) pills.push('<span class="pill">동료 추가</span>');
  return `<button class="row" data-id="${esc(p.id)}"><span class="walk"><span class="num">${p.w}</span><small>분</small></span>
    <span style="min-width:0"><span class="nm">${esc(p.n)} ${pills.join('')}</span><span class="mn" style="display:block">${esc(catOf(p.c).l)} · ${esc(p.m)}</span></span>
    <span class="score">${scoreHTML(p)}</span></button>`;
}
function renderList() {
  let list = visible();
  if (S.cat) list = list.filter((p) => p.c === S.cat);
  list = sorted(list);
  const sort = S.sort === 'google' && !S.googleOn ? 'near' : S.sort;
  $('h-list').textContent = sort === 'team' ? '동료 평점 높은 집' : sort === 'google' ? '구글 평점 높은 집' : S.mode === 'dinner' ? '회식하기 좋은 집' : '가까운 집';
  const o = ORIGINS.find((x) => x.id === S.origin).label;
  let sub = `${S.cat ? catOf(S.cat).l + ' · ' : ''}${o} 기준 ${list.length}곳`;
  if (sort === 'team') { const k = list.filter((p) => p.rn).length; sub += k ? ` · 후기 있는 ${k}곳 먼저` : ' · 아직 후기가 없어 가까운 순으로 보여요'; }
  if (sort === 'google') sub += ' · 리뷰 수가 적은 곳은 보정';
  $('listSub').textContent = sub;
  if (!list.length) { $('list').innerHTML = '<div class="empty" style="border:0">이 분류에는 아직 식당이 없어요. 아래에서 단골집을 추가해 보세요.</div>'; return; }
  const lim = S.showAll || S.cat ? list.length : 10;
  $('list').innerHTML = list.slice(0, lim).map(rowHTML).join('') + (list.length > lim ? `<button class="more" id="moreBtn">${list.length - lim}곳 더 보기</button>` : '');
}
function nameOf(pid) { const p = allPlaces().find((x) => x.id === pid); return p ? p.n : '(목록에 없는 집)'; }
function ago(t) {
  const s = (Date.now() - Number(t)) / 1000;
  if (!(s >= 0)) return '';
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + '분 전';
  if (s < 86400) return Math.round(s / 3600) + '시간 전';
  if (s < 86400 * 30) return Math.round(s / 86400) + '일 전';
  return new Date(Number(t)).toLocaleDateString('ko-KR');
}
function renderStrip() {
  const rv = S.reviews.filter((r) => !S.closed.has(r.pid)).slice(0, 12);
  $('rvCount').textContent = S.reviews.length ? `${S.reviews.length}개` : '';
  if (!rv.length) {
    $('strip').innerHTML = `<div class="empty">${S.backend === 'live' ? '아직 후기가 없어요. 다녀온 집을 눌러 첫 후기를 남겨 보세요.' : S.backend === 'off' ? '후기 기능이 아직 설정되지 않았어요. (README의 Firebase 단계)' : '후기를 불러오는 중이에요.'}</div>`;
    return;
  }
  $('strip').innerHTML = rv.map((r) => `<button class="rv" data-id="${esc(r.pid)}"><b>${esc(nameOf(r.pid))}</b><span class="stars">${starStr(Number(r.stars) || 0)}</span>
    <span class="t">${esc(String(r.text || '').slice(0, 80))}</span><span class="meta"><span>${esc(String(r.nick || '익명').slice(0, 12))}</span><span>${ago(r.at)}</span></span></button>`).join('');
}
function renderRank() {
  const R = teamRatings();
  const top = visible().map((p) => ({ p, r: R[p.id] })).filter((x) => x.r && x.r.n >= 2)
    .sort((a, b) => b.r.sum / b.r.n - a.r.sum / a.r.n || b.r.n - a.r.n).slice(0, 5);
  $('rankSec').hidden = !top.length;
  $('rank').innerHTML = top.map((x, i) => `<li><button data-id="${esc(x.p.id)}"><span class="n">${i + 1}</span><span>${esc(x.p.n)} <span class="sub">${esc(catOf(x.p.c).l)}</span></span><span class="num">★ ${(x.r.sum / x.r.n).toFixed(1)} <span class="sub">(${x.r.n})</span></span></button></li>`).join('');
}
function renderHidden() {
  const hidden = allPlaces().filter((p) => S.closed.has(p.id));
  $('hiddenLine').hidden = !hidden.length;
  $('hiddenLine').innerHTML = hidden.length ? `없어진 집으로 신고되어 숨긴 곳 ${hidden.length}곳 · <button class="linkbtn" id="toggleHidden">${S.showHidden ? '접기' : '보기'}</button>` : '';
  $('hiddenList').hidden = !(S.showHidden && hidden.length);
  $('hiddenList').innerHTML = hidden.map((p) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0"><span>${esc(p.n)}</span>${canWrite() ? `<button class="linkbtn" data-restore="${esc(p.id)}">다시 보이기</button>` : ''}</div>`).join('');
}
function renderStatus() {
  const msg = {
    loading: '불러오는 중…',
    live: S.uid ? '동료 후기 실시간 반영 중' : '읽기 전용이에요. (익명 로그인이 꺼져 있어요)',
    off: '후기·추가 기능은 Firebase를 설정하면 켜져요.',
    error: '후기를 불러오지 못했어요. 새로고침해 주세요.',
  }[S.backend];
  $('status').textContent = msg + (S.googleOn ? ' · 구글 평점 표시 중' : '');
  $('aSubmit').disabled = !canWrite();
}
function renderAll() {
  renderControls(); renderTiles(); renderList(); renderStrip(); renderRank(); renderHidden(); renderStatus();
  if (S.sheetId) renderSheet();
}

/* ---------- detail sheet ---------- */
function openSheet(id, pick) {
  S.sheetId = id; S.pickPool = !!pick; S.confirmClose = false; S.stars = 0;
  renderSheet();
  $('sheet').hidden = false; $('backdrop').hidden = false; document.body.style.overflow = 'hidden';
}
function closeSheet() { S.sheetId = null; $('sheet').hidden = true; $('backdrop').hidden = true; document.body.style.overflow = ''; }
function renderSheet() {
  const p = enrich(allPlaces()).find((x) => x.id === S.sheetId);
  if (!p) { closeSheet(); return; }
  const rv = S.reviews.filter((r) => r.pid === p.id);
  const prevText = $('rText') ? $('rText').value : '';
  const nick = ls.get('gw_nick') || '';
  const gName = p.gg && p.gg.name && p.gg.name.replace(/\s/g, '') !== p.n.replace(/\s/g, '') ? ` (구글 등록명: ${esc(p.gg.name)})` : '';
  $('sheetIn').innerHTML = `<div class="grab"></div>
   <div class="sh-top"><div>${S.pickPool ? '<div class="pick-tag">오늘은 여기</div>' : ''}<h3 id="shName">${esc(p.n)}</h3>
     <div class="sub">${esc(catOf(p.c).l)}${p.rn ? ` · 동료 <span class="stars">★</span> ${p.avg.toFixed(1)} (${p.rn})` : ''}</div></div>
     <button class="x" id="xBtn" aria-label="닫기">✕</button></div>
   ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
   <dl class="facts">
     <dt>도보</dt><dd><span class="num">${p.w}</span>분 ${p.added ? '(직접 입력)' : `(${esc(ORIGINS.find((o) => o.id === S.origin).label)}에서)`}</dd>
     ${p.gg ? `<dt>구글 평점</dt><dd><span class="stars">★</span> <span class="num">${p.gg.rating.toFixed(1)}</span> · 리뷰 ${p.gg.count.toLocaleString('ko-KR')}개${gName} <span class="g-badge">Google 지도</span></dd>` : ''}
     <dt>대표 메뉴</dt><dd>${esc(p.m || '-')}</dd>
     <dt>가격대</dt><dd>${PRICE[p.p]} (추정)</dd>
     <dt>위치</dt><dd>${esc(p.a || '-')}</dd>
     ${p.phone ? `<dt>전화</dt><dd><a class="num" href="tel:${esc(p.phone.replace(/[^0-9+]/g, ''))}">${esc(p.phone)}</a></dd>` : ''}
     ${p.room || p.g ? `<dt>회식</dt><dd>${p.room ? '룸·단체석 언급이 있어요' : '여럿이 나눠 먹는 메뉴가 있어요'} (예약 전 확인)</dd>` : ''}
   </dl>
   <div class="actions"><a class="btn" href="${naverUrl(p)}" target="_blank" rel="noopener">네이버 지도·예약</a>
     <a class="btn ghost" href="${esc(googleUrl(p))}" target="_blank" rel="noopener">구글 지도</a>
     ${S.pickPool ? '<button class="btn hot" id="againBtn">다시 고르기</button>' : ''}</div>
   <section class="sec"><h2>후기 남기기</h2>
     ${canWrite() ? `<div class="starpick" id="starpick">${[1, 2, 3, 4, 5].map((n) => `<button data-s="${n}" class="${n <= S.stars ? 'on' : ''}" aria-label="${n}점">★</button>`).join('')}</div>
     <div class="f"><label for="rText">한 줄 평</label><input type="text" id="rText" maxlength="80" placeholder="예: 12시 10분에 갔는데 바로 앉았어요" value="${esc(prevText)}"></div>
     <div class="f"><label for="rNick">닉네임</label><input type="text" id="rNick" maxlength="12" value="${esc(nick)}" placeholder="한 번만 정하면 기억해요"></div>
     <div><button class="btn" id="rSubmit">후기 등록</button> <span class="msg" id="rMsg"></span></div>`
     : `<div class="empty">${S.backend === 'off' ? '후기 기능은 Firebase를 설정하면 켜져요.' : '지금은 후기를 남길 수 없어요.'}</div>`}
   </section>
   <section class="sec"><h2>동료 후기 <span class="sub num">${rv.length}</span></h2>
     ${rv.length ? `<ul class="rlist">${rv.map((r) => `<li><span class="stars">${starStr(Number(r.stars) || 0)}</span> ${esc(String(r.text || '').slice(0, 80))}<div class="meta">${esc(String(r.nick || '익명').slice(0, 12))} · ${ago(r.at)}${S.uid && r.uid === S.uid ? `<button class="rv-del" data-delrv="${esc(r.id)}">내 후기 삭제</button>` : ''}</div></li>`).join('')}</ul>` : '<div class="sub">아직 후기가 없어요.</div>'}
   </section>
   ${canWrite() ? (S.confirmClose ? `<div class="confirm">정말 없어졌나요? 신고하면 모두의 목록에서 숨겨져요. (페이지 아래에서 다시 보이게 할 수 있어요)
       <div class="actions"><button class="btn hot" id="closeYes">신고하기</button><button class="btn ghost" id="closeNo">취소</button></div></div>`
     : `<button class="linkbtn" id="closeAsk" style="align-self:flex-start;color:var(--muted)">없어진 집이에요</button>`) : ''}`;
}

/* ---------- actions ---------- */
function pickRandom() {
  let pool = sorted(visible().filter((p) => !S.cat || p.c === S.cat));
  if (S.mode === 'lunch') { const near = pool.filter((p) => p.w <= 10); if (near.length >= 3) pool = near; }
  else pool = pool.slice(0, Math.max(5, Math.ceil(pool.length / 3)));
  if (S.sheetId && pool.length > 1) pool = pool.filter((p) => p.id !== S.sheetId);
  const p = pool[Math.floor(Math.random() * pool.length)];
  if (p) openSheet(p.id, true);
}

async function submitReview() {
  const msg = $('rMsg');
  const text = $('rText').value.trim().slice(0, 80);
  const nick = $('rNick').value.trim().slice(0, 12);
  if (!S.stars) { msg.textContent = '별점을 먼저 눌러 주세요.'; return; }
  if (!nick) { msg.textContent = '닉네임을 정해 주세요.'; $('rNick').focus(); return; }
  ls.set('gw_nick', nick);
  $('rSubmit').disabled = true; msg.textContent = '등록 중…';
  try {
    await S.fb.add('reviews', { pid: S.sheetId, stars: S.stars, text, nick, at: Date.now(), uid: S.uid });
    S.stars = 0; $('rText').value = '';
    renderSheet();
    $('rMsg') && ($('rMsg').textContent = '등록했어요.');
  } catch (err) {
    console.error(err);
    $('rSubmit').disabled = false;
    msg.textContent = '등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.';
  }
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button,[data-id]');
  if (!t) return;
  const d = t.dataset;
  if (d.o) { S.origin = d.o; ls.set('gw_origin', S.origin); renderAll(); return; }
  if (d.mode) { S.mode = d.mode; ls.set('gw_mode', S.mode); renderAll(); return; }
  if (d.sort) { S.sort = d.sort; ls.set('gw_sort', S.sort); renderAll(); return; }
  if (d.cat) {
    S.cat = S.cat === d.cat ? null : d.cat; renderAll();
    $('h-list').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  if (t.id === 'clearCat') { S.cat = null; renderAll(); return; }
  if (t.id === 'moreBtn') { S.showAll = true; renderList(); return; }
  if (t.id === 'anyBtn' || t.id === 'againBtn') { pickRandom(); return; }
  if (t.id === 'xBtn') { closeSheet(); return; }
  if (t.id === 'toggleHidden') { S.showHidden = !S.showHidden; renderHidden(); return; }
  if (d.restore) { try { await S.fb.remove('closed', d.restore); } catch (err) { console.error(err); } return; }
  if (d.delrv) { try { await S.fb.remove('reviews', d.delrv); } catch (err) { console.error(err); } return; }
  if (d.s) { S.stars = Number(d.s); document.querySelectorAll('#starpick button').forEach((b) => b.classList.toggle('on', Number(b.dataset.s) <= S.stars)); return; }
  if (t.id === 'rSubmit') { submitReview(); return; }
  if (t.id === 'closeAsk') { S.confirmClose = true; renderSheet(); return; }
  if (t.id === 'closeNo') { S.confirmClose = false; renderSheet(); return; }
  if (t.id === 'closeYes') {
    const id = S.sheetId;
    try { await S.fb.put('closed', id, { at: Date.now(), uid: S.uid }); closeSheet(); }
    catch (err) { console.error(err); S.confirmClose = false; renderSheet(); }
    return;
  }
  if (d.id) { openSheet(d.id); }
});
$('backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheetId) closeSheet(); });

$('aCat').innerHTML = CATS.map((c) => `<option value="${c.id}">${c.l}</option>`).join('');
$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('aMsg');
  const name = $('aName').value.trim();
  if (!name) { m.textContent = ' 식당 이름을 적어 주세요.'; return; }
  if (allPlaces().some((p) => p.n.replace(/\s/g, '') === name.replace(/\s/g, ''))) { m.textContent = ' 이미 목록에 있는 집이에요.'; return; }
  if (!canWrite()) { m.textContent = ' 지금은 추가할 수 없어요.'; return; }
  $('aSubmit').disabled = true; m.textContent = ' 추가 중…';
  try {
    await S.fb.add('added', {
      name: name.slice(0, 30), cat: $('aCat').value, area: $('aArea').value.trim().slice(0, 30),
      walk: Math.min(30, Math.max(1, Math.round(Number($('aWalk').value)) || 5)),
      price: Number($('aPrice').value), menu: $('aMenu').value.trim().slice(0, 40),
      phone: $('aPhone').value.trim().slice(0, 20), group: $('aGroup').checked, at: Date.now(), uid: S.uid,
    });
    e.target.reset(); m.textContent = ' 추가했어요. 목록에 바로 보여요.';
  } catch (err) { console.error(err); m.textContent = ' 추가하지 못했어요. 잠시 뒤 다시 시도해 주세요.'; }
  $('aSubmit').disabled = !canWrite();
});

renderAll();

/* ---------- Firebase (후기·추가·신고) ---------- */
async function initFirebase() {
  if (!firebaseConfig || !firebaseConfig.apiKey) { S.backend = 'off'; renderAll(); return; }
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [{ initializeApp }, fs, au] = await Promise.all([
      import(`${base}/firebase-app.js`), import(`${base}/firebase-firestore.js`), import(`${base}/firebase-auth.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    const db = fs.getFirestore(app);
    const auth = au.getAuth(app);
    S.fb = {
      add: (col, data) => fs.addDoc(fs.collection(db, col), data),
      put: (col, id, data) => fs.setDoc(fs.doc(db, col, id), data),
      remove: (col, id) => fs.deleteDoc(fs.doc(db, col, id)),
    };
    const fail = (err) => { console.error(err); S.backend = 'error'; renderAll(); };
    fs.onSnapshot(fs.query(fs.collection(db, 'reviews'), fs.orderBy('at', 'desc'), fs.limit(500)), (s) => {
      S.reviews = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => typeof r.pid === 'string'); renderAll();
    }, fail);
    fs.onSnapshot(fs.query(fs.collection(db, 'added'), fs.orderBy('at', 'asc'), fs.limit(300)), (s) => {
      S.added = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderAll();
    }, fail);
    fs.onSnapshot(fs.collection(db, 'closed'), (s) => { S.closed = new Set(s.docs.map((d) => d.id)); renderAll(); }, fail);
    S.backend = 'live';
    au.onAuthStateChanged(auth, (u) => { S.uid = u ? u.uid : null; renderAll(); });
    au.signInAnonymously(auth).catch((err) => { console.error('익명 로그인 실패 — Firebase 콘솔에서 익명 로그인을 켜 주세요.', err); renderAll(); });
    renderAll();
  } catch (err) { console.error(err); S.backend = 'error'; renderAll(); }
}

/* ---------- 구글 평점 (서버 함수) ---------- */
async function loadGoogle() {
  try {
    const r = await fetch('/api/ratings');
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.enabled && j.places) { S.google = j.places; S.googleOn = true; renderAll(); }
  } catch (e) { /* 서버 함수가 없는 환경(로컬 미리보기 등) */ }
}

initFirebase();
loadGoogle();
