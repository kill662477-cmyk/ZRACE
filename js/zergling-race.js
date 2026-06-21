/* ===== 결정론 시드 RNG (mulberry32) =====
   모든 클라이언트가 같은 시드 → 같은 난수열 → 같은 레이스/우승자 */
let _rngState = 0x9e3779b9;
function rng() {
  _rngState |= 0;
  _rngState = (_rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function zrSeedRace(seed) {
  _rngState = (seed >>> 0) || 1;
}

/* ===== 고정 시간스텝 + 벽시계 동기 =====
   레이스 진행을 실제 프레임속도가 아니라 "정각 기준 경과시간"으로 계산해
   어떤 PC/프레임률에서도 동일 시각에 동일 상태가 되도록 한다. */
const FIXED_DT = 1 / 100;
let simStep = 0;        // 이번 레이스에서 진행한 시뮬 스텝 수
let raceStartWall = 0;  // 레이스 시작 벽시계(ms). 컨트롤러가 정각 경계로 설정
let lastRealTime = 0;

let canvas;
let ctx;
let gameState = "ready";

let lastFrameTime = 0;
let gameSpeed = 1;
let originalGameSpeed = 1;
let lastOneSpeedBoostTimer = 0;
let isLastOneSpeedBoost = false;

let zerglingImage = null;
let cannonballImage = null;

let zerglings = [];
let finishedZerglings = [];

let explosions = [];

let track = {
  startX: 0,
  finishX: 0,
  finishLineX: 0,
  finishDistance: 0,
  y: 0,
  width: 0,
  height: 0,
};

const RESULT_WIDTH = 250;
let resultWindowElement = null;
let resultWindowListElement = null;
let lastFinishedCount = 0;

let bgmAudio = null;
let isBgmPlaying = false;
let bgmVolume = 0.3;
let isDraggingVolume = false;
let dragEndTime = 0;
let lastVolumeAngle = null;

const MIN_CHARGE_TIME = 0.2;
const MAX_CHARGE_TIME = 0.3;
const MIN_JUMP_DISTANCE = 20;
const MAX_JUMP_DISTANCE = 80;
const JUMP_SPEED = 150;
const COOLDOWN_TIME = 0.3;
const TARGET_FPS = 100;
const ZERGLING_START_OFFSET_X = 15;

const ADRENALINE_DISTANCE = 160;
const ADRENALINE_JUMP_SPEED = 250;
const STUN_DURATION = 1.5;
const LEFT_JUMP_COOLDOWN = 0.3;
const MIN_LEFT_JUMP_DISTANCE = 40;
const MAX_LEFT_JUMP_DISTANCE = 80;

const ADRENALINE_CHANCE_EARLY = 0.01;
const ADRENALINE_CHANCE_MID = 0.02;
const ADRENALINE_CHANCE_LATE = 0.04;

const STUN_CHANCE_EARLY = 0.04;
const STUN_CHANCE_MID = 0.02;
const STUN_CHANCE_LATE = 0.01;

const LEFT_JUMP_CHANCE_EARLY = 0.3;
const LEFT_JUMP_CHANCE_MID = 0.15;
const LEFT_JUMP_CHANCE_LATE = 0.1;

const WEIGHT_SECTION_1 = 0.5;
const WEIGHT_SECTION_2 = 1.0;
const WEIGHT_SECTION_3 = 2.0;

function initZerglingRace() {
  canvas = document.getElementById("zerglingRaceCanvas");
  if (!canvas) return;

  ctx = canvas.getContext("2d");
  setupCanvas();

  loadZerglingImage();
  loadCannonballImage();

  const startBtn = document.getElementById("zerglingRaceStartBtn");
  const resetBtn = document.getElementById("zerglingRaceResetBtn");
  const shuffleBtn = document.getElementById("zerglingRaceShuffleBtn");
  const nameInput = document.getElementById("zerglingNamesInput");

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (window.playConfirmSound) {
        window.playConfirmSound();
      }
      startRace();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (window.playConfirmSound) {
        window.playConfirmSound();
      }
      resetRace();
    });
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
      if (window.playConfirmSound) {
        window.playConfirmSound();
      }
      shuffleZerglings();
    });
  }

  const speed1xBtn = document.getElementById("zerglingRaceSpeed1x");
  const speed2xBtn = document.getElementById("zerglingRaceSpeed2x");
  const speed3xBtn = document.getElementById("zerglingRaceSpeed3x");

  if (speed1xBtn) {
    speed1xBtn.addEventListener("click", () => {
      if (window.playConfirmSound) {
        window.playConfirmSound();
      }
      setGameSpeed(1);
    });
  }
  if (speed2xBtn) {
    speed2xBtn.addEventListener("click", () => {
      if (window.playConfirmSound) {
        window.playConfirmSound();
      }
      setGameSpeed(2);
    });
  }
  if (speed3xBtn) {
    speed3xBtn.addEventListener("click", () => {
      if (window.playConfirmSound) {
        window.playConfirmSound();
      }
      setGameSpeed(3);
    });
  }

  if (speed1xBtn) {
    speed1xBtn.classList.add("zergling-race-speed__button--active");
  }

  if (nameInput) {
    nameInput.addEventListener("input", () => {
      const names = parseNames(nameInput.value);
      if (names.length > 0 && gameState !== "racing") {
        createZerglings(names);
      } else if (names.length === 0) {

        zerglings = [];
      }
    });

    const initialNames = parseNames(nameInput.value);
    if (initialNames.length > 0) {
      createZerglings(initialNames);
    }
  }

  resultWindowElement = document.getElementById("zerglingRaceResultWindow");
  resultWindowListElement = document.getElementById("zerglingRaceResultWindowList");

  const bgmBtn = document.getElementById("zerglingRaceBgmBtn");
  if (bgmBtn) {
    bgmBtn.addEventListener("click", (e) => {

      if (isDraggingVolume || Date.now() - dragEndTime < 100) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (window.playConfirmSound) {
        window.playConfirmSound();
      }
      toggleBgm();
    });
  }

  initVolumeGauge();

  startAnimation();

  gameLoop();
}

function loadZerglingImage() {
  zerglingImage = new Image();
  zerglingImage.src = "source/img/zergling.png";
  zerglingImage.onerror = () => {
    zerglingImage = null;
  };
}

function loadCannonballImage() {
  cannonballImage = new Image();
  cannonballImage.src = "source/img/cannonball.png";
  cannonballImage.onerror = () => {
    cannonballImage = null;
  };
}

function setupCanvas() {
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;

  track.startX = 60;
  track.width = 1000;

  track.height = 420;
  track.finishX = track.startX + track.width;

  track.finishLineX = track.finishX - 50;
  track.finishDistance = track.finishLineX - (track.startX + ZERGLING_START_OFFSET_X);

  const finishLineRight = track.finishX + 20;
  const logicalWidth = finishLineRight + 40;
  const logicalHeight = 530;

  canvas.style.width = logicalWidth + "px";
  canvas.style.height = logicalHeight + "px";

  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;

  ctx.scale(dpr, dpr);

  track.y = 40 + track.height / 2 + 20;
}

function parseNames(input) {
  if (!input || input.trim() === "") {
    return [];
  }

  const names = [];
  const parts = input.split(/\s+/);

  parts.forEach((part) => {
    const trimmed = part.trim();
    if (trimmed.length === 0) return;

    const multiplyMatch = trimmed.match(/^(.+?)\s*\*\s*(\d+)$/);
    if (multiplyMatch) {
      const baseName = multiplyMatch[1].trim();
      const count = parseInt(multiplyMatch[2], 10);

      for (let i = 0; i < count; i++) {
        names.push(baseName);
      }
    } else {

      names.push(trimmed);
    }
  });

  return names;
}

function createZerglings(names) {
  zerglings = [];

  if (names.length === 0) {
    return;
  }

  const numZerglings = names.length;

  const laneSpacing = track.height / (numZerglings + 1);
  const colors = ["#ff5f57", "#ffbd2e", "#28c840", "#2196f3", "#667eea", "#764ba2", "#ff6b9d", "#4ecdc4"];

  names.forEach((name, index) => {
    const laneY = track.y - track.height / 2 + laneSpacing * (index + 1);

    const initialChargeTime = MIN_CHARGE_TIME + rng() * (MAX_CHARGE_TIME - MIN_CHARGE_TIME);
    const initialJumpDistance = MIN_JUMP_DISTANCE + rng() * (MAX_JUMP_DISTANCE - MIN_JUMP_DISTANCE);

    zerglings.push({
      name: name,
      x: track.startX + ZERGLING_START_OFFSET_X,
      y: laneY,
      totalDistance: 0,
      color: colors[index % colors.length],
      finished: false,
      finishTime: 0,
      rank: 0,
      animationFrame: 0,

      state: "charging",
      chargeTimer: 0,
      chargeTime: initialChargeTime,
      jumpDistance: initialJumpDistance,
      jumpProgress: 0,
      cooldownTimer: 0,
      chargePower: 0,

      isAdrenaline: false,
      isLeftJump: false,
      stunTimer: 0,
      stunRotation: 0,
    });
  });
}

function gameLoop(currentTime) {
  const realDt = lastRealTime ? Math.min((currentTime - lastRealTime) / 1000, 1 / 30) : 1 / 60;
  lastRealTime = currentTime;

  if (gameState === "racing") {
    // 정각 기준 경과시간으로 목표 스텝 수를 구해, 부족한 만큼 고정 dt로 진행.
    // (늦게 접속해도 같은 상태로 빠르게 따라잡아 모든 화면이 동기화됨)
    const targetSteps = Math.floor((Date.now() - raceStartWall) / 1000 / FIXED_DT);
    let budget = 6000; // 프레임당 최대 따라잡기 스텝
    while (simStep < targetSteps && budget-- > 0 && gameState === "racing") {
      updateZerglings(FIXED_DT);
      checkFinish();
      simStep++;
    }
  } else {
    updateExplosions(realDt); // 대기 중 폭발 잔효과는 실시간(연출용)
  }

  draw();
  requestAnimationFrame(gameLoop);
}

function updateZerglings(deltaTime) {
  zerglings.forEach((zergling) => {
    if (zergling.finished) return;

    updateZerglingState(zergling, deltaTime);

    zergling.animationFrame += 5 * deltaTime;
  });

  updateExplosions(deltaTime);
}

function getSkillChanceByRank(zergling) {

  const progress = zergling.totalDistance / track.width;
  if (progress < 0.1) {
    return { adrenalineChance: 0, stunChance: 0, leftJumpChance: 0 };
  }

  const sortedZerglings = [...zerglings].sort((a, b) => b.totalDistance - a.totalDistance);
  const currentRank = sortedZerglings.findIndex((z) => z === zergling) + 1;
  const totalZerglings = zerglings.length;
  const rankRatio = currentRank / totalZerglings;

  let baseAdrenalineChance, baseStunChance, baseLeftJumpChance;

  if (rankRatio <= 0.1) {

    baseAdrenalineChance = ADRENALINE_CHANCE_EARLY;
    baseStunChance = STUN_CHANCE_EARLY;
    baseLeftJumpChance = LEFT_JUMP_CHANCE_EARLY;
  } else if (rankRatio <= 0.5) {

    baseAdrenalineChance = ADRENALINE_CHANCE_MID;
    baseStunChance = STUN_CHANCE_MID;
    baseLeftJumpChance = LEFT_JUMP_CHANCE_MID;
  } else {

    baseAdrenalineChance = ADRENALINE_CHANCE_LATE;
    baseStunChance = STUN_CHANCE_LATE;
    baseLeftJumpChance = LEFT_JUMP_CHANCE_LATE;
  }

  let weight;
  if (progress < 0.4) {

    weight = WEIGHT_SECTION_1;
  } else if (progress < 0.7) {

    weight = WEIGHT_SECTION_2;
  } else {

    weight = WEIGHT_SECTION_3;
  }

  const adrenalineChance = baseAdrenalineChance * weight;
  const stunChance = baseStunChance * weight;
  const leftJumpChance = baseLeftJumpChance * weight;

  return { adrenalineChance, stunChance, leftJumpChance };
}

function updateZerglingState(zergling, deltaTime) {

  const remainingZerglings = zerglings.filter((z) => !z.finished);
  const isLastOne = remainingZerglings.length === 1;

  if (zergling.state === "stunned") {
    zergling.stunTimer -= deltaTime;
    zergling.stunRotation += deltaTime * 10;

    if (zergling.stunTimer <= 0) {
      zergling.state = "charging";
      zergling.chargeTimer = 0;
      zergling.stunRotation = 0;
    }
    return;
  }

  if (zergling.state === "charging") {

    zergling.chargeTimer += deltaTime;
    zergling.chargePower = Math.min(1, zergling.chargeTimer / zergling.chargeTime);

    if (!zergling.isAdrenaline && !zergling.isLeftJump && zergling.chargeTimer < deltaTime * 2) {

      const { adrenalineChance } = getSkillChanceByRank(zergling);
      if (rng() < adrenalineChance) {
        zergling.isAdrenaline = true;
        zergling.jumpDistance = ADRENALINE_DISTANCE;
      }
    }

    if (!isLastOne && !zergling.isAdrenaline && !zergling.isLeftJump && zergling.chargeTimer < deltaTime * 2) {

      const { leftJumpChance } = getSkillChanceByRank(zergling);
      if (rng() < leftJumpChance) {
        zergling.isLeftJump = true;

        zergling.jumpDistance = MIN_LEFT_JUMP_DISTANCE + rng() * (MAX_LEFT_JUMP_DISTANCE - MIN_LEFT_JUMP_DISTANCE);
      }
    }

    if (!isLastOne && zergling.chargeTimer < deltaTime * 2) {
      const { stunChance } = getSkillChanceByRank(zergling);
      if (rng() < stunChance) {
        zergling.state = "stunned";
        zergling.stunTimer = STUN_DURATION;
        zergling.stunRotation = 0;
        return;
      }
    }

    if (zergling.chargeTimer >= zergling.chargeTime) {
      zergling.state = "jumping";
      zergling.jumpProgress = 0;

      if (zergling.isLeftJump) {
        const originalX = track.startX + ZERGLING_START_OFFSET_X + zergling.totalDistance;
        createExplosion(originalX, zergling.y);
      }
    }
  } else if (zergling.state === "jumping") {

    const currentJumpSpeed = zergling.isAdrenaline ? ADRENALINE_JUMP_SPEED : JUMP_SPEED;
    const jumpDistance = currentJumpSpeed * deltaTime;
    zergling.jumpProgress += jumpDistance;

    if (zergling.isLeftJump) {
      zergling.totalDistance -= jumpDistance;
      zergling.totalDistance = Math.max(0, zergling.totalDistance);
    } else {
      zergling.totalDistance += jumpDistance;
    }

    zergling.x = track.startX + ZERGLING_START_OFFSET_X + zergling.totalDistance;

    if (zergling.jumpProgress >= zergling.jumpDistance) {
      zergling.state = "cooldown";

      zergling.cooldownTimer = zergling.isLeftJump ? LEFT_JUMP_COOLDOWN : COOLDOWN_TIME;
      zergling.chargePower = 0;
      zergling.isAdrenaline = false;

    }

    if (zergling.x >= track.finishLineX) {
      zergling.x = track.finishLineX;
    }
  } else if (zergling.state === "cooldown") {

    zergling.cooldownTimer -= deltaTime;

    if (zergling.cooldownTimer <= 0) {
      zergling.state = "charging";
      zergling.chargeTimer = 0;

      zergling.chargeTime = MIN_CHARGE_TIME + rng() * (MAX_CHARGE_TIME - MIN_CHARGE_TIME);

      zergling.jumpDistance = MIN_JUMP_DISTANCE + rng() * (MAX_JUMP_DISTANCE - MIN_JUMP_DISTANCE);
      zergling.isAdrenaline = false;
      zergling.isLeftJump = false;
    }
  }
}

function checkFinish() {

  zerglings.forEach((zergling) => {
    if (!zergling.finished && zergling.totalDistance >= track.finishDistance) {
      zergling.finished = true;
      // 결정론: 실시간(Date.now) 대신 시뮬 스텝으로 완주 시점 기록.
      // (늦게 접속해 여러 스텝을 한 프레임에 처리해도 모두 같은 순위)
      zergling.finishStep = simStep;

      if (!finishedZerglings.includes(zergling)) {
        finishedZerglings.push(zergling);
      }
    }
  });

  finishedZerglings.sort((a, b) => {
    if (a.finishStep !== b.finishStep) return a.finishStep - b.finishStep;       // 먼저 통과한 스텝
    if (b.totalDistance !== a.totalDistance) return b.totalDistance - a.totalDistance; // 더 앞선 거리
    return zerglings.indexOf(a) - zerglings.indexOf(b);                          // 레인 순서(안정)
  });
  finishedZerglings.forEach((zergling, index) => {
    zergling.rank = index + 1;
  });

  if (finishedZerglings.length > 0) {
    scrollToRecent10();
  }

  const remainingZerglings = zerglings.filter((z) => !z.finished);
  if (remainingZerglings.length === 1 && !isLastOneSpeedBoost) {

    originalGameSpeed = gameSpeed;
    lastOneSpeedBoostTimer = 2.0;
    isLastOneSpeedBoost = true;
  }

  if (zerglings.every((zergling) => zergling.finished) && gameState === "racing") {

    gameSpeed = originalGameSpeed;
    isLastOneSpeedBoost = false;
    lastOneSpeedBoostTimer = 0;

    gameState = "finished";
    showResult();
  }
}

function scrollToRecent10() {
  if (!resultWindowListElement) return;

  const itemHeight = 50;
  const totalContentHeight = finishedZerglings.length * itemHeight;

  const recent10StartIndex = Math.max(0, finishedZerglings.length - 10);
  const targetScrollTop = recent10StartIndex * itemHeight;

  resultWindowListElement.scrollTop = targetScrollTop;
}

function draw() {

  ctx.fillStyle = "#7c2828";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTrack();

  drawZerglings();

  drawExplosions();

  drawFinishLine();

  updateResultWindow();
}

function drawTrack() {

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(track.startX - 20, track.y - track.height / 2 - 20, track.width + 40, track.height + 40);

  ctx.strokeStyle = "#7c2828";
  ctx.lineWidth = 10;
  ctx.strokeRect(track.startX - 20, track.y - track.height / 2 - 20, track.width + 40, track.height + 40);

  ctx.fillStyle = "#7c2828";
  ctx.fillRect(track.startX - 10, track.y - track.height / 2 - 10, track.width + 20, track.height + 20);
}

function drawZerglings() {
  zerglings.forEach((zergling) => {

    if (zergling.finished) return;

    drawZergling(zergling.x, zergling.y, zergling);
  });
}

function drawZergling(x, y, zergling) {
  ctx.save();
  ctx.translate(x, y);

  if (zergling.state === "stunned") {

    ctx.rotate(Math.sin(zergling.stunRotation) * 0.3);

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#ffbd2e";
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  let jumpHeight = 0;
  if (zergling.state === "jumping") {
    jumpHeight = Math.sin((zergling.jumpProgress / zergling.jumpDistance) * Math.PI) * 15;
  }

  if (zergling.state === "charging") {
    const chargeScale = 0.9 + zergling.chargePower * 0.2;
    ctx.scale(chargeScale, chargeScale);
  }

  if (zergling.state === "jumping") {
    ctx.translate(0, -jumpHeight);

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(0, 15, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (zergling.isLeftJump) {
    ctx.scale(-1, 1);
  }

  if (zerglingImage && zerglingImage.complete && zerglingImage.naturalWidth > 0) {
    const imageWidth = 60;
    const imageHeight = 60;

    ctx.drawImage(zerglingImage, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
  }

  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px Pretendard";
  ctx.textAlign = "center";
  const nameOffsetY = zergling.state === "jumping" ? Math.sin((zergling.jumpProgress / zergling.jumpDistance) * Math.PI) * 15 : 0;
  ctx.fillText(zergling.name, x, y - 30 - nameOffsetY);

  if (zergling.state === "jumping" && zergling.isAdrenaline) {
    const textY = y - Math.sin((zergling.jumpProgress / zergling.jumpDistance) * Math.PI) * 10;
    const textX = x + 40;
    ctx.fillStyle = "#ffbd2e";
    ctx.font = "bold 20px Pretendard";
    ctx.textAlign = "left";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeText("아드레날린!", textX, textY);
    ctx.fillText("아드레날린!", textX, textY);
  }

  if (zergling.state === "stunned") {
    const textY = y;
    ctx.fillStyle = "#ffbd2e";
    ctx.font = "bold 20px Pretendard";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;

    ctx.textAlign = "right";
    const textXLeft = x - 40;
    ctx.strokeText("기", textXLeft, textY);
    ctx.fillText("기", textXLeft, textY);

    ctx.textAlign = "left";
    const textXRight = x + 40;
    ctx.strokeText("절", textXRight, textY);
    ctx.fillText("절", textXRight, textY);
  }
}

function updateResultWindow() {
  if (!resultWindowListElement) return;

  if (finishedZerglings.length === lastFinishedCount) {
    return;
  }

  const wasNewFinisher = finishedZerglings.length > lastFinishedCount;
  lastFinishedCount = finishedZerglings.length;

  resultWindowListElement.innerHTML = "";

  if (finishedZerglings.length === 0) {
    return;
  }

  finishedZerglings.forEach((zergling, index) => {
    const itemElement = document.createElement("div");
    const isFirst = index === 0;
    const isLast = index === finishedZerglings.length - 1;
    let className = "zergling-race-result-item";
    if (isFirst) className += " zergling-race-result-item--first";
    if (isLast) className += " zergling-race-result-item--last";
    itemElement.className = className;

    const rankElement = document.createElement("span");
    rankElement.className = "zergling-race-result-item__rank";
    rankElement.textContent = `${zergling.rank}등`;

    const nameElement = document.createElement("span");
    nameElement.className = "zergling-race-result-item__name";
    nameElement.textContent = zergling.name;

    itemElement.appendChild(rankElement);
    itemElement.appendChild(nameElement);
    resultWindowListElement.appendChild(itemElement);
  });

  if (wasNewFinisher) {
    scrollToRecent10();
  }
}

function drawRecentRanking() {

  const recentFinished = finishedZerglings.slice(-10);

  if (recentFinished.length === 0) return;

  const boxWidth = 250;
  const boxHeight = 30 + recentFinished.length * 25;
  const boxX = 20;
  const boxY = 20;

  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px Pretendard";
  ctx.textAlign = "left";
  ctx.fillText("최근 완주 순서", boxX + 10, boxY + 20);

  recentFinished.forEach((zergling, index) => {
    const yPos = boxY + 45 + index * 25;
    const rank = zergling.rank;

    ctx.fillStyle = rank === 1 ? "#ffd700" : "#ffffff";
    ctx.font = "bold 14px Pretendard";
    ctx.textAlign = "left";
    ctx.fillText(`${rank}등`, boxX + 10, yPos);

    ctx.fillStyle = "#ffffff";
    ctx.font = "14px Pretendard";
    ctx.fillText(zergling.name, boxX + 60, yPos);
  });
}

function createExplosion(x, y) {
  explosions.push({
    x: x,
    y: y,
    scale: 0,
    opacity: 0,
    duration: 1,
    elapsed: 0,
  });
}

function updateExplosions(deltaTime) {
  explosions = explosions.filter((explosion) => {
    explosion.elapsed += deltaTime;

    if (explosion.elapsed >= explosion.duration) {
      return false;
    }

    const growPhase = 0.6;
    const holdPhase = 0.8;
    const fadePhase = 1.0;

    if (explosion.elapsed <= growPhase) {

      const progress = explosion.elapsed / growPhase;
      explosion.scale = progress;
      explosion.opacity = progress;
    } else if (explosion.elapsed <= holdPhase) {

      explosion.scale = 1.0;
      explosion.opacity = 1.0;
    } else {

      explosion.scale = 1.0;
      const fadeProgress = (explosion.elapsed - holdPhase) / (fadePhase - holdPhase);
      explosion.opacity = 1.0 - fadeProgress;
    }

    return true;
  });
}

function drawExplosions() {
  explosions.forEach((explosion) => {
    if (!cannonballImage || !cannonballImage.complete || cannonballImage.naturalWidth === 0) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = explosion.opacity;
    ctx.translate(explosion.x, explosion.y);

    const imageSize = 60;
    const scaledSize = imageSize * explosion.scale;

    ctx.drawImage(
      cannonballImage,
      -scaledSize / 2,
      -scaledSize / 2,
      scaledSize,
      scaledSize
    );

    ctx.restore();
  });
}

function drawFinishLine() {

  const finishLineX = track.finishLineX;

  const dotWidth = 8;
  const dotHeight = 28;
  const dotGap = 12;
  const dotCount = 12;
  const totalHeight = 468;

  const startY = track.y - totalHeight / 2;

  ctx.fillStyle = "#ffbd2e";
  for (let i = 0; i < dotCount; i++) {
    const dotY = startY + i * (dotHeight + dotGap);
    ctx.fillRect(finishLineX - dotWidth / 2, dotY, dotWidth, dotHeight);
  }

  ctx.save();
  ctx.translate(track.finishX - 16, track.y);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Pretendard";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FINISH", 0, 0);
  ctx.restore();
}

function startRace() {
  if (zerglings.length === 0) {
    alert("이름을 입력해주세요!");
    return;
  }

  if (zerglings.length < 2) {
    alert("최소 2명 이상의 이름을 입력해주세요!");
    return;
  }

  finishedZerglings = [];
  lastFinishedCount = 0;

  if (resultWindowListElement) {
    resultWindowListElement.innerHTML = "";
  }

  simStep = 0; // 결정론 시뮬 스텝 초기화 (raceStartWall은 컨트롤러가 설정)

  isLastOneSpeedBoost = false;
  lastOneSpeedBoostTimer = 0;
  originalGameSpeed = gameSpeed;

  gameState = "racing";
}

function resetRace() {
  gameState = "ready";
  zerglings = [];
  explosions = [];

  isLastOneSpeedBoost = false;
  lastOneSpeedBoostTimer = 0;
  originalGameSpeed = 1;

  const input = document.getElementById("zerglingNamesInput");
  if (input) {
    input.value = "";
  }
}

function setGameSpeed(speed) {

  if (isLastOneSpeedBoost) {
    originalGameSpeed = speed;
  } else {
    gameSpeed = speed;
    originalGameSpeed = speed;
  }

  const speed1xBtn = document.getElementById("zerglingRaceSpeed1x");
  const speed2xBtn = document.getElementById("zerglingRaceSpeed2x");
  const speed3xBtn = document.getElementById("zerglingRaceSpeed3x");

  if (speed1xBtn) speed1xBtn.classList.remove("zergling-race-speed__button--active");
  if (speed2xBtn) speed2xBtn.classList.remove("zergling-race-speed__button--active");
  if (speed3xBtn) speed3xBtn.classList.remove("zergling-race-speed__button--active");

  if (speed === 1 && speed1xBtn) {
    speed1xBtn.classList.add("zergling-race-speed__button--active");
  } else if (speed === 2 && speed2xBtn) {
    speed2xBtn.classList.add("zergling-race-speed__button--active");
  } else if (speed === 3 && speed3xBtn) {
    speed3xBtn.classList.add("zergling-race-speed__button--active");
  }
}

function shuffleZerglings() {
  if (gameState === "racing" || zerglings.length === 0) {
    return;
  }

  for (let i = zerglings.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [zerglings[i], zerglings[j]] = [zerglings[j], zerglings[i]];
  }

  const numZerglings = zerglings.length;
  const laneSpacing = track.height / (numZerglings + 1);

  zerglings.forEach((zergling, index) => {
    const laneY = track.y - track.height / 2 + laneSpacing * (index + 1);
    zergling.y = laneY;

    zergling.x = track.startX + ZERGLING_START_OFFSET_X;
    zergling.totalDistance = 0;
    zergling.finished = false;
    zergling.finishTime = 0;
    zergling.rank = 0;

    zergling.state = "charging";
    zergling.chargeTimer = 0;
    zergling.chargeTime = MIN_CHARGE_TIME + rng() * (MAX_CHARGE_TIME - MIN_CHARGE_TIME);
    zergling.jumpDistance = MIN_JUMP_DISTANCE + rng() * (MAX_JUMP_DISTANCE - MIN_JUMP_DISTANCE);
    zergling.jumpProgress = 0;
    zergling.cooldownTimer = 0;
    zergling.chargePower = 0;
    zergling.isAdrenaline = false;
    zergling.isLeftJump = false;
    zergling.stunTimer = 0;
    zergling.stunRotation = 0;
  });
}

function showResult() {

  const input = document.getElementById("zerglingNamesInput");
  if (input) {
    const names = parseNames(input.value);
    if (names.length > 0) {
      createZerglings(names);
    }
  }
}

function toggleBgm() {
  const playIcon = document.querySelector(".zergling-race-bgm__play");
  const pauseIcon = document.querySelector(".zergling-race-bgm__pause");

  if (!bgmAudio) {
    bgmAudio = new Audio("source/zerg-race-bgm/짭윤환 - jumping zergling.mp3");
    bgmAudio.loop = true;
    bgmAudio.volume = bgmVolume;

    bgmAudio.addEventListener("ended", () => {
      isBgmPlaying = false;
      if (playIcon) playIcon.style.display = "flex";
      if (pauseIcon) pauseIcon.style.display = "none";
    });
  }

  if (isBgmPlaying) {

    bgmAudio.pause();
    isBgmPlaying = false;
    if (playIcon) playIcon.style.display = "flex";
    if (pauseIcon) pauseIcon.style.display = "none";
  } else {

    bgmAudio.play().catch((error) => {
    });
    isBgmPlaying = true;
    if (playIcon) playIcon.style.display = "none";
    if (pauseIcon) pauseIcon.style.display = "flex";
  }
}

function initVolumeGauge() {
  const container = document.getElementById("zerglingRaceBgmContainer");
  if (!container) return;

  updateVolumeGauge(bgmVolume);

  container.addEventListener("mousedown", handleVolumeStart);
  document.addEventListener("mousemove", handleVolumeMove);
  document.addEventListener("mouseup", handleVolumeEnd);
  document.addEventListener("mouseleave", handleVolumeEnd);

  container.addEventListener("touchstart", handleVolumeStart, { passive: false });
  document.addEventListener("touchmove", handleVolumeMove, { passive: false });
  document.addEventListener("touchend", handleVolumeEnd);
  document.addEventListener("touchcancel", handleVolumeEnd);
}

function isInsideButton(e) {
  const container = document.getElementById("zerglingRaceBgmContainer");
  if (!container) return false;

  const rect = container.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const distance = Math.sqrt(
    Math.pow(clientX - centerX, 2) + Math.pow(clientY - centerY, 2)
  );

  const buttonRadius = 13.5;

  return distance <= buttonRadius;
}

function handleVolumeStart(e) {

  if (isInsideButton(e)) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  isDraggingVolume = true;

  const container = document.getElementById("zerglingRaceBgmContainer");
  if (container) {
    container.classList.add("dragging");
  }

  calculateVolumeFromEvent(e);
}

function handleVolumeMove(e) {
  if (!isDraggingVolume) return;

  e.preventDefault();

  requestAnimationFrame(() => {
    calculateVolumeFromEvent(e);
  });
}

function handleVolumeEnd() {
  if (!isDraggingVolume) return;

  isDraggingVolume = false;
  dragEndTime = Date.now();
  lastVolumeAngle = null;

  const container = document.getElementById("zerglingRaceBgmContainer");
  if (container) {
    container.classList.remove("dragging");
  }
}

function calculateVolumeFromEvent(e) {
  const container = document.getElementById("zerglingRaceBgmContainer");
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let clientX, clientY;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const deltaX = clientX - centerX;
  const deltaY = clientY - centerY;
  let angle = Math.atan2(deltaX, -deltaY) * (180 / Math.PI);

  if (angle < 0) angle += 360;

  if (lastVolumeAngle !== null) {
    const angleDiff = angle - lastVolumeAngle;

    if (angleDiff < -180) {

      angle = 360;
    }

    else if (angleDiff > 180) {

      angle = 0;
    }
  }

  lastVolumeAngle = angle;

  const volume = Math.min(1, Math.max(0, angle / 360));

  setVolume(volume);
}

function setVolume(volume) {
  bgmVolume = volume;

  if (bgmAudio) {
    bgmAudio.volume = bgmVolume;
  }

  updateVolumeGauge(bgmVolume);
}

function updateVolumeGauge(volume) {
  const gauge = document.getElementById("zerglingRaceBgmGauge");
  if (!gauge) return;

  const circumference = 2 * Math.PI * 15;

  const offset = circumference * (1 - volume);

  gauge.style.strokeDashoffset = offset;
}

let animationConfig = {

  sizeChange: {
    count: 4,
    expandTime: 0.2,
    shrinkTime: 0.1,
    gapTime: 0.3,
  },

  waitTime: 0.3,

  jump: {
    count: 4,
    jumpTime: 0.3,
    gapTime: 0.3,
    height: -30,
  },

  size: {
    normal: 150,
    expanded: 160,
  },
};

let animationState = {
  phase: "sizeChange",
  phaseTime: 0,
  phaseIndex: 0,
  isFlipped: false,
  animationId: null,
};

function setAnimationConfig(config) {
  if (config.sizeChange) {
    Object.assign(animationConfig.sizeChange, config.sizeChange);
  }
  if (config.waitTime !== undefined) {
    animationConfig.waitTime = config.waitTime;
  }
  if (config.jump) {
    Object.assign(animationConfig.jump, config.jump);
  }
  if (config.size) {
    Object.assign(animationConfig.size, config.size);
  }
}

function updateAnimation(currentTime) {
  const animationImage = document.getElementById("zerglingRaceAnimationImage");
  const animationShadow = document.getElementById("zerglingRaceAnimationShadow");
  if (!animationImage) {
    animationState.animationId = requestAnimationFrame(updateAnimation);
    return;
  }

  const deltaTime = (currentTime - (animationState.lastTime || currentTime)) / 1000;
  animationState.lastTime = currentTime;
  animationState.phaseTime += deltaTime;

  let width = animationConfig.size.normal;
  let translateY = 0;
  let scaleX = animationState.isFlipped ? -1 : 1;
  let shadowOpacity = 0;
  let shadowSize = 0;

  switch (animationState.phase) {
    case "sizeChange":

      {
        const expandTime = animationConfig.sizeChange.expandTime;
        const shrinkTime = animationConfig.sizeChange.shrinkTime;
        const gapTime = animationConfig.sizeChange.gapTime;
        const totalTime = expandTime + shrinkTime;
        const cycleTime = totalTime + gapTime;
        const cycleIndex = Math.floor(animationState.phaseTime / cycleTime);
        const cycleLocalTime = animationState.phaseTime % cycleTime;

        if (cycleIndex >= animationConfig.sizeChange.count) {

          animationState.phase = "wait1";
          animationState.phaseTime = 0;
        } else {
          if (cycleLocalTime < expandTime) {

            const progress = cycleLocalTime / expandTime;
            width = animationConfig.size.normal + (animationConfig.size.expanded - animationConfig.size.normal) * progress;
          } else if (cycleLocalTime < expandTime + shrinkTime) {

            const progress = (cycleLocalTime - expandTime) / shrinkTime;
            width = animationConfig.size.expanded - (animationConfig.size.expanded - animationConfig.size.normal) * progress;
          }

        }
      }
      break;

    case "wait1":

      if (animationState.phaseTime >= animationConfig.waitTime) {
        animationState.phase = "jump";
        animationState.phaseTime = 0;
        animationState.phaseIndex = 0;
      }
      break;

    case "jump":

      {
        const jumpTime = animationConfig.jump.jumpTime;
        const gapTime = animationConfig.jump.gapTime;
        const cycleTime = jumpTime + gapTime;
        const cycleIndex = Math.floor(animationState.phaseTime / cycleTime);
        const cycleLocalTime = animationState.phaseTime % cycleTime;

        if (cycleIndex >= animationConfig.jump.count) {

          animationState.phase = "wait2";
          animationState.phaseTime = 0;
        } else {
          if (cycleLocalTime < jumpTime) {

            const progress = cycleLocalTime / jumpTime;
            if (progress < 0.5) {

              const jumpProgress = progress / 0.5;
              translateY = animationConfig.jump.height * jumpProgress;

              const heightRatio = Math.abs(translateY) / Math.abs(animationConfig.jump.height);
              shadowSize = 20 * (1 - heightRatio * 0.5);
              shadowOpacity = 0.4 * (1 - heightRatio * 0.4);
            } else {

              const jumpProgress = (progress - 0.5) / 0.5;
              translateY = animationConfig.jump.height * (1 - jumpProgress);

              const heightRatio = Math.abs(translateY) / Math.abs(animationConfig.jump.height);
              shadowSize = 20 * (1 - heightRatio * 0.5);
              shadowOpacity = 0.3 * (1 - heightRatio * 0.5);
            }
          } else {

            shadowOpacity = 0;
            shadowSize = 0;
          }
        }
      }
      break;

    case "wait2":

      if (animationState.phaseTime >= animationConfig.waitTime) {
        animationState.phase = "flip";
        animationState.phaseTime = 0;
        animationState.isFlipped = true;
        scaleX = -1;
      }
      break;

    case "flip":

      animationState.phase = "sizeChange2";
      animationState.phaseTime = 0;
      animationState.phaseIndex = 0;
      break;

    case "sizeChange2":

      {
        const expandTime = animationConfig.sizeChange.expandTime;
        const shrinkTime = animationConfig.sizeChange.shrinkTime;
        const gapTime = animationConfig.sizeChange.gapTime;
        const totalTime = expandTime + shrinkTime;
        const cycleTime = totalTime + gapTime;
        const cycleIndex = Math.floor(animationState.phaseTime / cycleTime);
        const cycleLocalTime = animationState.phaseTime % cycleTime;

        if (cycleIndex >= animationConfig.sizeChange.count) {

          animationState.phase = "wait3";
          animationState.phaseTime = 0;
        } else {
          if (cycleLocalTime < expandTime) {

            const progress = cycleLocalTime / expandTime;
            width = animationConfig.size.normal + (animationConfig.size.expanded - animationConfig.size.normal) * progress;
          } else if (cycleLocalTime < expandTime + shrinkTime) {

            const progress = (cycleLocalTime - expandTime) / shrinkTime;
            width = animationConfig.size.expanded - (animationConfig.size.expanded - animationConfig.size.normal) * progress;
          }

        }
      }
      break;

    case "wait3":

      if (animationState.phaseTime >= animationConfig.waitTime) {
        animationState.phase = "jump2";
        animationState.phaseTime = 0;
        animationState.phaseIndex = 0;
      }
      break;

    case "jump2":

      {
        const jumpTime = animationConfig.jump.jumpTime;
        const gapTime = animationConfig.jump.gapTime;
        const cycleTime = jumpTime + gapTime;
        const cycleIndex = Math.floor(animationState.phaseTime / cycleTime);
        const cycleLocalTime = animationState.phaseTime % cycleTime;

        if (cycleIndex >= animationConfig.jump.count) {

          animationState.phase = "wait4";
          animationState.phaseTime = 0;
        } else {
          if (cycleLocalTime < jumpTime) {

            const progress = cycleLocalTime / jumpTime;
            if (progress < 0.5) {

              const jumpProgress = progress / 0.5;
              translateY = animationConfig.jump.height * jumpProgress;

              const heightRatio = Math.abs(translateY) / Math.abs(animationConfig.jump.height);
              shadowSize = 20 * (1 - heightRatio * 0.5);
              shadowOpacity = 0.4 * (1 - heightRatio * 0.4);
            } else {

              const jumpProgress = (progress - 0.5) / 0.5;
              translateY = animationConfig.jump.height * (1 - jumpProgress);

              const heightRatio = Math.abs(translateY) / Math.abs(animationConfig.jump.height);
              shadowSize = 20 * (1 - heightRatio * 0.5);
              shadowOpacity = 0.3 * (1 - heightRatio * 0.5);
            }
          } else {

            shadowOpacity = 0;
            shadowSize = 0;
          }
        }
      }
      break;

    case "wait4":

      if (animationState.phaseTime >= animationConfig.waitTime) {
        animationState.phase = "flip2";
        animationState.phaseTime = 0;
        animationState.isFlipped = false;
        scaleX = 1;
      }
      break;

    case "flip2":

      animationState.phase = "sizeChange";
      animationState.phaseTime = 0;
      animationState.phaseIndex = 0;
      break;
  }

  animationImage.style.width = width + "px";
  animationImage.style.transform = `translateY(${translateY}px) scaleX(${scaleX})`;

  if (animationShadow) {
    if (shadowOpacity > 0 && shadowSize > 0 && translateY !== 0) {

      const heightRatio = Math.abs(translateY) / Math.abs(animationConfig.jump.height);
      const shadowWidth = 120 * (1 - heightRatio * 0.3);
      const shadowHeight = 30 * (1 - heightRatio * 0.3);
      animationShadow.style.opacity = shadowOpacity;
      animationShadow.style.width = shadowWidth + "px";
      animationShadow.style.height = shadowHeight + "px";
      animationShadow.style.display = "block";
    } else {
      animationShadow.style.opacity = "0";
      animationShadow.style.display = "none";
    }
  }

  animationState.animationId = requestAnimationFrame(updateAnimation);
}

function startAnimation() {
  const animationImage = document.getElementById("zerglingRaceAnimationImage");
  if (!animationImage) return;

  animationState.phase = "sizeChange";
  animationState.phaseTime = 0;
  animationState.phaseIndex = 0;
  animationState.isFlipped = false;
  animationState.lastTime = null;

  if (animationState.animationId) {
    cancelAnimationFrame(animationState.animationId);
  }

  animationState.animationId = requestAnimationFrame(updateAnimation);
}

function stopAnimation() {
  if (animationState.animationId) {
    cancelAnimationFrame(animationState.animationId);
    animationState.animationId = null;
  }
}

if (typeof window !== "undefined") {
  window.setZerglingAnimationConfig = setAnimationConfig;
  window.startZerglingAnimation = startAnimation;
  window.stopZerglingAnimation = stopAnimation;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initZerglingRace);
  } else {
    initZerglingRace();
  }
}
