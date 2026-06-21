/* =========================================================================
   저글링 레이스 · 자동 운영 컨트롤러 (Supabase 공유 / 결정론 동기)
   - 정각 10분 시계마다 자동 시작 (?fast=초 로 테스트 가속)
   - 하루치 시드(zr_days)로 모든 클라이언트가 동일한 추첨/레이스/우승자
   - 회차 = 정각 경계 기준 자동 카운팅(1일 단위 초기화)
   - 22명 회전 추첨(사이클 내 무중복 + 누락 1명 다음 사이클 우선)
   - 회차별 우승자 zr_rounds에 기록(모든 클라 동일값 → 중복 무시)
   ========================================================================= */

const NAMES = [
  "김윤환", "변현제", "김민철", "사테", "박준오", "박수범", "지동원",
  "배성흠", "파도튜브", "토마토", "지두두", "햇살", "찌킹", "치리",
  "주하랑", "소주양", "임조이", "비타밍", "먼진", "아리송이", "진땅콩", "낭니",
];
const PER_RACE = 3;

const FAST = (() => {
  const v = new URLSearchParams(location.search).get("fast");
  const n = v ? parseInt(v, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
})();
const SLOT_MS = FAST ? FAST * 1000 : 10 * 60 * 1000; // 기본 10분

/* ---------- Supabase (REST) ---------- */
const SB = window.SUPABASE_URL;
const KEY = window.SUPABASE_ANON_KEY;
const HDR = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
async function sbGet(path) {
  try {
    const r = await fetch(`${SB}/rest/v1/${path}`, { headers: HDR });
    return r.ok ? await r.json() : [];
  } catch (_) { return []; }
}
async function sbInsertIgnore(table, body) {
  try {
    await fetch(`${SB}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...HDR, Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(body),
    });
  } catch (_) {}
}

/* ---------- 상태 ---------- */
let dateStr = "";
let daySeed = 1;
let startAtMs = 0;
let todayRows = [];     // [{round, winner}]
let racing = false;
let lastRunRound = -1;
let curRound = 0;
let reiniting = false;

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- 결정론 추첨 (하루 시드 기반, 레이스 RNG와 별도) ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let drawState = null; // { seed, rand, pool, carry, list }
function resetDraws(seed) {
  drawState = { seed, rand: mulberry32((seed >>> 0) || 1), pool: [], carry: [], list: [] };
}
function shuffleWith(rand, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function refill(excluded) {
  drawState.pool = shuffleWith(drawState.rand, NAMES.filter((n) => !excluded.includes(n)));
}
function drawOne() {
  if (drawState.carry.length === 0 && drawState.pool.length < PER_RACE) {
    drawState.carry = drawState.pool.slice();   // 이번 사이클 누락 인원(보통 1명)
    refill(drawState.carry);               // 그 인원 제외하고 새 사이클
  }
  const picked = [];
  while (drawState.carry.length && picked.length < PER_RACE) picked.push(drawState.carry.shift());
  while (picked.length < PER_RACE && drawState.pool.length) picked.push(drawState.pool.shift());
  return picked;
}
function participantsFor(round) {
  if (!drawState || drawState.seed !== daySeed) resetDraws(daySeed);
  while (drawState.list.length < round) drawState.list.push(drawOne());
  return drawState.list[round - 1];
}

/* ---------- 시간/회차 ---------- */
function slotInfo(now) {
  const elapsed = now - startAtMs;
  if (elapsed < 0) {
    return { phase: "pre", nextRound: 1, nextBoundary: startAtMs };
  }
  const m = Math.floor(elapsed / SLOT_MS);
  return {
    phase: "run",
    currentRound: m + 1,
    currentRoundStart: startAtMs + m * SLOT_MS,
    nextBoundary: startAtMs + (m + 1) * SLOT_MS,
    nextRound: m + 2,
  };
}

/* ---------- 하루 초기화 (시드/앵커) ---------- */
async function initDay() {
  dateStr = todayStr();
  let rows = await sbGet(`zr_days?date=eq.${dateStr}&select=*`);
  if (!rows.length) {
    const seed = Math.floor(Math.random() * 0x7fffffff) || 1;
    const startAt = new Date(Math.ceil(Date.now() / SLOT_MS) * SLOT_MS).toISOString();
    await sbInsertIgnore("zr_days", { date: dateStr, seed, start_at: startAt });
    rows = await sbGet(`zr_days?date=eq.${dateStr}&select=*`); // 동시 생성 대비 재조회
  }
  const row = rows[0];
  daySeed = Number(row.seed) >>> 0 || 1;
  startAtMs = Date.parse(row.start_at);
  resetDraws(daySeed);
}
async function loadToday() {
  todayRows = await sbGet(`zr_rounds?date=eq.${dateStr}&select=round,winner&order=round.asc`);
  renderToday();
}

/* ---------- 렌더 ---------- */
const $ = (id) => document.getElementById(id);
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function chip(name) {
  return `<div class="zr-chip"><img src="source/img/zergling.png" alt=""><span>${escapeHtml(name)}</span></div>`;
}
function fmt(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function renderToday() {
  const list = $("todayList"), empty = $("todayEmpty");
  $("todayCount").textContent = `${todayRows.length}회`;
  if (!todayRows.length) { list.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";
  const last = todayRows[todayRows.length - 1].round;
  list.innerHTML = todayRows.map((w) => `
    <div class="zr-row${w.round === last ? " is-latest" : ""}">
      <span class="zr-row__round">${w.round}회차</span>
      <span class="zr-row__win">${escapeHtml(w.winner)}</span>
    </div>`).join("");
}
function renderStandby(s) {
  const r = s.phase === "pre" ? 1 : s.nextRound;
  $("sbRound").textContent = `다음 ${r}회차`;
  $("sbNext").innerHTML = participantsFor(r).map(chip).join("");
}
function showStandby(show) { $("standby").classList.toggle("is-hidden", !show); }
function updateBadge(s) {
  const b = $("roundBadge");
  if (racing) { b.textContent = `🏁 ${curRound}회차 진행 중`; b.classList.add("is-racing"); }
  else {
    const r = s.phase === "pre" ? 1 : s.nextRound;
    b.textContent = `오늘 ${r}회차 대기`; b.classList.remove("is-racing");
  }
}

/* ---------- 레이스 시작/종료 ---------- */
function startRound(round, startMs) {
  racing = true;
  lastRunRound = round;
  curRound = round;
  showStandby(false);

  const participants = participantsFor(round).slice();
  const raceSeed = ((daySeed ^ Math.imul(round, 0x9e3779b1)) >>> 0) || 1;

  zrSeedRace(raceSeed);          // 엔진: 레이스 RNG 시드
  createZerglings(participants); // 엔진: 저글링 생성(시드 소비)
  raceStartWall = startMs;       // 엔진: 정각 경계로 동기
  startRace();                   // 엔진: 시작
}

async function onRaceFinished() {
  racing = false;
  let winner = "(없음)";
  if (typeof finishedZerglings !== "undefined" && finishedZerglings.length) {
    const f = finishedZerglings.find((z) => z.rank === 1) || finishedZerglings[0];
    if (f) winner = f.name;
  }
  const participants = participantsFor(curRound);
  const startedAt = new Date(startAtMs + (curRound - 1) * SLOT_MS).toISOString();
  await sbInsertIgnore("zr_rounds", {
    date: dateStr, round: curRound, participants, winner, started_at: startedAt,
  });
  await loadToday();
  renderStandby(slotInfo(Date.now()));
  showStandby(true);
}

/* showResult(엔진)을 자동 흐름용으로 교체 (끝날 때 우승자 기록) */
function installRaceEndHook() {
  // eslint-disable-next-line no-global-assign
  showResult = onRaceFinished;
}

/* ---------- 메인 틱 ---------- */
async function reinit() {
  if (reiniting) return;
  reiniting = true;
  racing = false; lastRunRound = -1; drawState = null;
  await initDay();
  await loadToday();
  reiniting = false;
}
function tick() {
  if (dateStr !== todayStr()) { reinit(); return; }
  const now = Date.now();
  const s = slotInfo(now);

  if (s.phase === "run" && !racing && lastRunRound !== s.currentRound) {
    startRound(s.currentRound, s.currentRoundStart);
  }

  $("sbCountdown").textContent = fmt(s.nextBoundary - now);
  if (!racing) renderStandby(s);
  updateBadge(s);
}

/* ---------- BGM (상단 재생/정지 + 볼륨) ---------- */
let bgmAudioEl = null;
function setupBgm() {
  const btn = $("bgmToggle");
  const vol = $("bgmVolume");
  const audio = new Audio("source/zerg-race-bgm/짭윤환 - jumping zergling.mp3");
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = (vol ? Number(vol.value) : 35) / 100;
  bgmAudioEl = audio;

  const setIcon = () => { if (btn) btn.textContent = audio.paused ? "▶" : "❚❚"; };

  if (btn) {
    btn.addEventListener("click", () => {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
      setIcon();
    });
  }
  if (vol) {
    vol.addEventListener("input", () => { audio.volume = Number(vol.value) / 100; });
  }
  audio.addEventListener("play", setIcon);
  audio.addEventListener("pause", setIcon);

  // 자동재생 시도(OBS 브라우저소스는 성공). 차단되면 버튼은 ▶ 상태로 대기.
  audio.play().then(setIcon).catch(() => setIcon());
}

/* ---------- 부팅 ---------- */
async function boot() {
  // 헤더 저글링 애니메이션 크기 축소(엔진 기본 150px → 헤더에 맞게)
  if (window.setZerglingAnimationConfig) {
    window.setZerglingAnimationConfig({ size: { normal: 52, expanded: 58 }, jump: { height: -10 } });
  }

  await initDay();
  await loadToday();
  installRaceEndHook();
  showStandby(true);
  tick();
  setInterval(tick, 200);
  setInterval(loadToday, 30000); // 다른 클라 기록 반영
  setupBgm();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
