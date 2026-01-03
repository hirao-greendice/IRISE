const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const input = {
  left: false,
  right: false,
  jumpQueued: false,
};

const leftButton = document.querySelector(".control.left");
const rightButton = document.querySelector(".control.right");
const jumpButton = document.querySelector(".control.jump");

const GRID_COLS = 10;
const GRID_ROWS = 15;
const AREA_SIZE = 5;
const PLAYER_SIZE = 1;
const MOVE_SPEED = 6.4;
const JUMP_SPEED = 12;
const GRAVITY = 22;
const MAX_FALL_SPEED = 18;
const EXIT_TRIGGER = 0.4;
const ENTRY_OFFSET = 0.2;
const EPS = 0.001;

const SEGMENT_KEYS = ["a", "b", "c", "d", "e", "f", "g"];
const SEGMENT_INDEX = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
  g: 6,
};
const SEGMENT_TONES = {
  a: 520,
  b: 560,
  c: 600,
  d: 640,
  e: 680,
  f: 720,
  g: 760,
};

const BASE_THEME = {
  floor: "#f6efe6",
  grid: "#e4d8cb",
  wall: "#1e1b17",
};
const STAGE_ACCENTS = [
  "#d9674a",
  "#b95e3b",
  "#5f7f6b",
  "#4a7892",
  "#b06a8a",
  "#9a7d44",
  "#6b5c8e",
  "#9a4b4b",
  "#3b6a4e",
  "#7c5a3a",
];
const VOID_THEME = {
  floor: "#f1ebe4",
  grid: "#d7cfc7",
  wall: "#1f1b18",
  accent: "#8b5e4b",
};

const EXIT_BANDS = {
  top: { min: 6.25, max: 8.75 },
  bottom: { min: 6.25, max: 8.75 },
  left: { min: 6.25, max: 8.75 },
  right: { min: 6.25, max: 8.75 },
};
const EXIT_DIRS = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

let viewWidth = 320;
let viewHeight = 480;
let cellSize = 32;

let player = {
  x: 1.5,
  y: 13,
  w: PLAYER_SIZE,
  h: PLAYER_SIZE,
  vx: 0,
  vy: 0,
  onGround: false,
};

let currentStage = null;
let segments = createEmptySegments();
let pulses = [];
let transition = {
  active: false,
  progress: 0,
  duration: 0.65,
  dir: { x: 0, y: 0 },
  nextStage: null,
};
let playerRoom = "current";
let lastTime = performance.now();

let audioCtx = null;
let audioUnlocked = false;

function queueJump() {
  input.jumpQueued = true;
}

function updateMoveButtons() {
  leftButton.classList.toggle("pressed", input.left);
  rightButton.classList.toggle("pressed", input.right);
}

function setMove(dir, value) {
  input[dir] = value;
  updateMoveButtons();
}

function clearInput() {
  input.left = false;
  input.right = false;
  updateMoveButtons();
}

function handleKey(down, event) {
  const key = event.key.toLowerCase();
  let handled = true;

  switch (key) {
    case "arrowleft":
    case "a":
      setMove("left", down);
      break;
    case "arrowright":
    case "d":
      setMove("right", down);
      break;
    case "arrowup":
    case "w":
    case " ":
      if (down && !event.repeat) {
        queueJump();
      }
      break;
    default:
      handled = false;
  }

  if (handled) {
    event.preventDefault();
  }
}

window.addEventListener(
  "keydown",
  (event) => {
    unlockAudio();
    handleKey(true, event);
  },
  { passive: false }
);
window.addEventListener(
  "keyup",
  (event) => handleKey(false, event),
  { passive: false }
);
window.addEventListener("blur", clearInput);
window.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInput();
  }
});

leftButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  unlockAudio();
  leftButton.setPointerCapture(event.pointerId);
  setMove("left", true);
});
leftButton.addEventListener("pointerup", (event) => {
  event.preventDefault();
  leftButton.releasePointerCapture(event.pointerId);
  setMove("left", false);
});
leftButton.addEventListener("pointercancel", () => {
  setMove("left", false);
});
leftButton.addEventListener("lostpointercapture", () => {
  setMove("left", false);
});

rightButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  unlockAudio();
  rightButton.setPointerCapture(event.pointerId);
  setMove("right", true);
});
rightButton.addEventListener("pointerup", (event) => {
  event.preventDefault();
  rightButton.releasePointerCapture(event.pointerId);
  setMove("right", false);
});
rightButton.addEventListener("pointercancel", () => {
  setMove("right", false);
});
rightButton.addEventListener("lostpointercapture", () => {
  setMove("right", false);
});

jumpButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  unlockAudio();
  jumpButton.setPointerCapture(event.pointerId);
  queueJump();
  jumpButton.classList.add("pressed");
});
jumpButton.addEventListener("pointerup", (event) => {
  event.preventDefault();
  jumpButton.releasePointerCapture(event.pointerId);
  jumpButton.classList.remove("pressed");
});
jumpButton.addEventListener("pointercancel", () => {
  jumpButton.classList.remove("pressed");
});
jumpButton.addEventListener("lostpointercapture", () => {
  jumpButton.classList.remove("pressed");
});

function unlockAudio() {
  if (audioUnlocked) {
    return;
  }
  audioUnlocked = true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  } catch (error) {
    audioCtx = null;
  }
}

function playPing(segmentId) {
  if (!audioCtx || audioCtx.state !== "running") {
    return;
  }
  const tone = SEGMENT_TONES[segmentId] || 620;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "triangle";
  osc.frequency.value = tone;
  gain.gain.value = 0.08;
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.18);
}

function createEmptySegments() {
  return {
    a: false,
    b: false,
    c: false,
    d: false,
    e: false,
    f: false,
    g: false,
  };
}

function maskFor(list) {
  let mask = 0;
  list.forEach((key) => {
    mask |= 1 << SEGMENT_INDEX[key];
  });
  return mask;
}

const DIGIT_MASKS = new Map([
  [maskFor(["a", "b", "c", "d", "e", "f"]), 0],
  [maskFor(["b", "c"]), 1],
  [maskFor(["a", "b", "d", "e", "g"]), 2],
  [maskFor(["a", "b", "c", "d", "g"]), 3],
  [maskFor(["f", "g", "b", "c"]), 4],
  [maskFor(["a", "f", "g", "c", "d"]), 5],
  [maskFor(["a", "f", "e", "d", "c", "g"]), 6],
  [maskFor(["a", "b", "c"]), 7],
  [maskFor(["a", "b", "c", "d", "e", "f", "g"]), 8],
  [maskFor(["a", "b", "c", "d", "f", "g"]), 9],
]);

function segmentsToDigit(state) {
  let mask = 0;
  SEGMENT_KEYS.forEach((key) => {
    if (state[key]) {
      mask |= 1 << SEGMENT_INDEX[key];
    }
  });
  return DIGIT_MASKS.get(mask) ?? null;
}

function stageIdFromSegments() {
  const digit = segmentsToDigit(segments);
  if (digit === null) {
    return "void";
  }
  return String(digit);
}

function getTheme(stageId) {
  if (stageId === "void") {
    return VOID_THEME;
  }
  const index = Number(stageId);
  return {
    ...BASE_THEME,
    accent: STAGE_ACCENTS[index] || BASE_THEME.floor,
  };
}

function applyRect(tiles, rect) {
  for (let y = 0; y < rect.h; y += 1) {
    for (let x = 0; x < rect.w; x += 1) {
      const tileX = rect.x + x;
      const tileY = rect.y + y;
      if (
        tileX >= 0 &&
        tileX < GRID_COLS &&
        tileY >= 0 &&
        tileY < GRID_ROWS
      ) {
        tiles[tileY][tileX] = true;
      }
    }
  }
}

function inBand(value, band) {
  return value >= band.min && value <= band.max;
}

function buildTiles(stageId) {
  const tiles = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill(false)
  );

  const groundY = GRID_ROWS - 1;
  for (let x = 0; x < GRID_COLS; x += 1) {
    if (!inBand(x + 0.5, EXIT_BANDS.bottom)) {
      tiles[groundY][x] = true;
    }
  }

  const platforms = [
    { x: 1, y: 12, w: 3, h: 1 },
    { x: 6, y: 12, w: 3, h: 1 },
    { x: 2, y: 9, w: 3, h: 1 },
    { x: 6, y: 8, w: 3, h: 1 },
    { x: 1, y: 6, w: 3, h: 1 },
    { x: 6, y: 5, w: 3, h: 1 },
  ];

  if (stageId === "void") {
    platforms.forEach((platform) => applyRect(tiles, platform));
    applyRect(tiles, { x: 4, y: 10, w: 2, h: 4 });
    return tiles;
  }

  const value = Number(stageId);
  platforms.forEach((platform, index) => {
    if (value & (1 << index)) {
      applyRect(tiles, platform);
    }
  });

  if (value % 2 === 1) {
    applyRect(tiles, { x: 4, y: 7, w: 2, h: 1 });
  }

  return tiles;
}

function createStage(stageId) {
  return {
    id: stageId,
    theme: getTheme(stageId),
    tiles: buildTiles(stageId),
  };
}

function getAreaForPlayer() {
  const centerX = Math.min(
    Math.max(player.x + player.w / 2, 0),
    GRID_COLS - EPS
  );
  const centerY = Math.min(
    Math.max(player.y + player.h / 2, 0),
    GRID_ROWS - EPS
  );
  return {
    col: Math.floor(centerX / AREA_SIZE),
    row: Math.floor(centerY / AREA_SIZE),
  };
}

function getHorizontalSegment(row) {
  if (row === 0) {
    return "a";
  }
  if (row === 1) {
    return "g";
  }
  return "d";
}

function getVerticalSegment(col, oldRow, newRow) {
  const upperRow = Math.min(oldRow, newRow);
  if (col === 0) {
    return upperRow === 0 ? "f" : "e";
  }
  return upperRow === 0 ? "b" : "c";
}

function markSegment(segmentId) {
  if (segments[segmentId]) {
    return;
  }
  segments[segmentId] = true;
  spawnPulse(player.x + 0.5, player.y + 0.5);
  playPing(segmentId);
}

function spawnPulse(x, y) {
  pulses.push({ x, y, life: 0, ttl: 0.22, stageId: currentStage.id });
}

function updatePulses(dt) {
  pulses.forEach((pulse) => {
    pulse.life += dt;
  });
  pulses = pulses.filter((pulse) => pulse.life < pulse.ttl);
}

function isSolid(tileX, tileY) {
  if (tileX < 0 || tileX >= GRID_COLS || tileY < 0 || tileY >= GRID_ROWS) {
    return false;
  }
  return currentStage.tiles[tileY][tileX];
}

function movePlayerX(dx) {
  if (!dx) {
    return;
  }
  const nextX = player.x + dx;
  const dir = Math.sign(dx);

  if (dir > 0) {
    const rightEdge = nextX + player.w - EPS;
    const tileX = Math.floor(rightEdge);
    const top = Math.floor(player.y + EPS);
    const bottom = Math.floor(player.y + player.h - EPS);
    for (let y = top; y <= bottom; y += 1) {
      if (isSolid(tileX, y)) {
        player.x = tileX - player.w;
        player.vx = 0;
        return;
      }
    }
  } else {
    const leftEdge = nextX + EPS;
    const tileX = Math.floor(leftEdge);
    const top = Math.floor(player.y + EPS);
    const bottom = Math.floor(player.y + player.h - EPS);
    for (let y = top; y <= bottom; y += 1) {
      if (isSolid(tileX, y)) {
        player.x = tileX + 1;
        player.vx = 0;
        return;
      }
    }
  }

  player.x = nextX;
}

function movePlayerY(dy) {
  if (!dy) {
    return;
  }
  const nextY = player.y + dy;
  const dir = Math.sign(dy);

  if (dir > 0) {
    const bottomEdge = nextY + player.h - EPS;
    const tileY = Math.floor(bottomEdge);
    const left = Math.floor(player.x + EPS);
    const right = Math.floor(player.x + player.w - EPS);
    for (let x = left; x <= right; x += 1) {
      if (isSolid(x, tileY)) {
        player.y = tileY - player.h;
        player.vy = 0;
        player.onGround = true;
        return;
      }
    }
  } else {
    const topEdge = nextY + EPS;
    const tileY = Math.floor(topEdge);
    const left = Math.floor(player.x + EPS);
    const right = Math.floor(player.x + player.w - EPS);
    for (let x = left; x <= right; x += 1) {
      if (isSolid(x, tileY)) {
        player.y = tileY + 1;
        player.vy = 0;
        return;
      }
    }
  }

  player.y = nextY;
}

function inExitBand(edge, centerX, centerY) {
  const band = EXIT_BANDS[edge];
  if (edge === "top" || edge === "bottom") {
    return inBand(centerX, band);
  }
  return inBand(centerY, band);
}

function checkForExit() {
  const centerX = player.x + player.w / 2;
  const centerY = player.y + player.h / 2;

  if (player.x < 0) {
    if (inExitBand("left", centerX, centerY)) {
      if (centerX < -EXIT_TRIGGER) {
        startTransition("left");
        return;
      }
    } else {
      player.x = 0;
    }
  }

  if (player.x + player.w > GRID_COLS) {
    if (inExitBand("right", centerX, centerY)) {
      if (centerX > GRID_COLS + EXIT_TRIGGER) {
        startTransition("right");
        return;
      }
    } else {
      player.x = GRID_COLS - player.w;
    }
  }

  if (player.y < 0) {
    if (inExitBand("top", centerX, centerY)) {
      if (centerY < -EXIT_TRIGGER) {
        startTransition("top");
        return;
      }
    } else {
      player.y = 0;
      player.vy = 0;
    }
  }

  if (player.y + player.h > GRID_ROWS) {
    if (inExitBand("bottom", centerX, centerY)) {
      if (centerY > GRID_ROWS + EXIT_TRIGGER) {
        startTransition("bottom");
        return;
      }
    } else {
      player.y = GRID_ROWS - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }
}

function startTransition(edge) {
  const nextStageId = stageIdFromSegments();
  transition = {
    active: true,
    progress: 0,
    duration: 0.65,
    dir: EXIT_DIRS[edge],
    nextStage: createStage(nextStageId),
  };

  segments = createEmptySegments();
  pulses = [];

  const entry = getEntryPoint(edge);
  player.x = entry.x;
  player.y = entry.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  playerRoom = "next";
}

function getEntryPoint(edge) {
  const clampedX = Math.min(
    Math.max(player.x, ENTRY_OFFSET),
    GRID_COLS - PLAYER_SIZE - ENTRY_OFFSET
  );
  const clampedY = Math.min(
    Math.max(player.y, ENTRY_OFFSET),
    GRID_ROWS - PLAYER_SIZE - ENTRY_OFFSET
  );

  switch (edge) {
    case "left":
      return {
        x: GRID_COLS - PLAYER_SIZE - ENTRY_OFFSET,
        y: clampedY,
      };
    case "right":
      return {
        x: ENTRY_OFFSET,
        y: clampedY,
      };
    case "top":
      return {
        x: clampedX,
        y: GRID_ROWS - PLAYER_SIZE - ENTRY_OFFSET,
      };
    case "bottom":
      return {
        x: clampedX,
        y: ENTRY_OFFSET,
      };
    default:
      return { x: ENTRY_OFFSET, y: ENTRY_OFFSET };
  }
}

function updateTransition(dt) {
  transition.progress = Math.min(
    transition.duration,
    transition.progress + dt
  );
  if (transition.progress >= transition.duration) {
    currentStage = transition.nextStage;
    transition.active = false;
    playerRoom = "current";
  }
}

function update(dt) {
  updatePulses(dt);

  if (transition.active) {
    updateTransition(dt);
    return;
  }

  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  player.vx = direction * MOVE_SPEED;

  if (input.jumpQueued && player.onGround) {
    player.vy = -JUMP_SPEED;
    player.onGround = false;
  }
  input.jumpQueued = false;

  player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL_SPEED);

  let area = getAreaForPlayer();

  movePlayerX(player.vx * dt);
  let nextArea = getAreaForPlayer();
  if (nextArea.col !== area.col) {
    markSegment(getHorizontalSegment(nextArea.row));
  }

  area = nextArea;
  player.onGround = false;
  movePlayerY(player.vy * dt);
  nextArea = getAreaForPlayer();
  if (nextArea.row !== area.row) {
    markSegment(getVerticalSegment(nextArea.col, area.row, nextArea.row));
  }

  checkForExit();
}

function drawGrid(theme, offsetX, offsetY) {
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.25;

  for (let x = 1; x < GRID_COLS; x += 1) {
    const px = offsetX + x * cellSize;
    ctx.beginPath();
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + viewHeight);
    ctx.stroke();
  }
  for (let y = 1; y < GRID_ROWS; y += 1) {
    const py = offsetY + y * cellSize;
    ctx.beginPath();
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + viewWidth, py);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawBorders(theme, offsetX, offsetY) {
  const topGap = {
    start: EXIT_BANDS.top.min * cellSize,
    end: EXIT_BANDS.top.max * cellSize,
  };
  const bottomGap = {
    start: EXIT_BANDS.bottom.min * cellSize,
    end: EXIT_BANDS.bottom.max * cellSize,
  };
  const leftGap = {
    start: EXIT_BANDS.left.min * cellSize,
    end: EXIT_BANDS.left.max * cellSize,
  };
  const rightGap = {
    start: EXIT_BANDS.right.min * cellSize,
    end: EXIT_BANDS.right.max * cellSize,
  };

  ctx.strokeStyle = theme.wall;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(offsetX, offsetY);
  ctx.lineTo(offsetX + topGap.start, offsetY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(offsetX + topGap.end, offsetY);
  ctx.lineTo(offsetX + viewWidth, offsetY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(offsetX, offsetY + viewHeight);
  ctx.lineTo(offsetX + bottomGap.start, offsetY + viewHeight);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(offsetX + bottomGap.end, offsetY + viewHeight);
  ctx.lineTo(offsetX + viewWidth, offsetY + viewHeight);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(offsetX, offsetY);
  ctx.lineTo(offsetX, offsetY + leftGap.start);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(offsetX, offsetY + leftGap.end);
  ctx.lineTo(offsetX, offsetY + viewHeight);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(offsetX + viewWidth, offsetY);
  ctx.lineTo(offsetX + viewWidth, offsetY + rightGap.start);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(offsetX + viewWidth, offsetY + rightGap.end);
  ctx.lineTo(offsetX + viewWidth, offsetY + viewHeight);
  ctx.stroke();
}

function drawObstacles(stage, offsetX, offsetY) {
  ctx.fillStyle = stage.theme.wall;
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      if (stage.tiles[y][x]) {
        ctx.fillRect(
          offsetX + x * cellSize,
          offsetY + y * cellSize,
          cellSize,
          cellSize
        );
      }
    }
  }
}

function drawPulses(stage, offsetX, offsetY) {
  pulses.forEach((pulse) => {
    if (pulse.stageId !== stage.id) {
      return;
    }
    const t = pulse.life / pulse.ttl;
    const radius = cellSize * (0.2 + t * 0.6);
    ctx.strokeStyle = stage.theme.accent;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      offsetX + pulse.x * cellSize,
      offsetY + pulse.y * cellSize,
      radius,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawPlayer(stage, offsetX, offsetY) {
  ctx.fillStyle = stage.theme.accent;
  ctx.fillRect(
    offsetX + player.x * cellSize,
    offsetY + player.y * cellSize,
    player.w * cellSize,
    player.h * cellSize
  );
}

function renderStage(stage, offsetX, offsetY) {
  ctx.fillStyle = stage.theme.floor;
  ctx.fillRect(offsetX, offsetY, viewWidth, viewHeight);
  drawGrid(stage.theme, offsetX, offsetY);
  drawObstacles(stage, offsetX, offsetY);
  drawBorders(stage.theme, offsetX, offsetY);
}

function render() {
  const stageWidth = viewWidth;
  const stageHeight = viewHeight;

  let cameraX = 0;
  let cameraY = 0;
  if (transition.active) {
    const progress = transition.progress / transition.duration;
    cameraX = transition.dir.x * stageWidth * progress;
    cameraY = transition.dir.y * stageHeight * progress;
  }

  ctx.fillStyle = currentStage.theme.floor;
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  const currentOffsetX = -cameraX;
  const currentOffsetY = -cameraY;
  renderStage(currentStage, currentOffsetX, currentOffsetY);
  drawPulses(currentStage, currentOffsetX, currentOffsetY);

  let playerOffsetX = currentOffsetX;
  let playerOffsetY = currentOffsetY;

  if (transition.active && transition.nextStage) {
    const nextOffsetX = transition.dir.x * stageWidth - cameraX;
    const nextOffsetY = transition.dir.y * stageHeight - cameraY;
    renderStage(transition.nextStage, nextOffsetX, nextOffsetY);

    if (playerRoom === "next") {
      playerOffsetX = nextOffsetX;
      playerOffsetY = nextOffsetY;
    }
  }

  drawPlayer(
    playerRoom === "next" && transition.nextStage
      ? transition.nextStage
      : currentStage,
    playerOffsetX,
    playerOffsetY
  );
}

function resize() {
  const controls = document.querySelector(".controls");
  const hint = document.querySelector(".hint");
  const title = document.querySelector(".title");
  const reserved =
    controls.offsetHeight + hint.offsetHeight + title.offsetHeight + 32;
  const availableHeight = Math.max(300, window.innerHeight - reserved);
  const maxWidthByHeight = availableHeight * (GRID_COLS / GRID_ROWS);
  const maxWidthByWidth = window.innerWidth * 0.92;

  viewWidth = Math.max(
    220,
    Math.floor(Math.min(maxWidthByWidth, maxWidthByHeight))
  );
  viewHeight = Math.floor(viewWidth * (GRID_ROWS / GRID_COLS));
  cellSize = viewWidth / GRID_COLS;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
  canvas.width = Math.floor(viewWidth * dpr);
  canvas.height = Math.floor(viewHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  document.documentElement.style.setProperty("--play-width", `${viewWidth}px`);
  document.documentElement.style.setProperty("--play-height", `${viewHeight}px`);
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(tick);
}

function startGame() {
  currentStage = createStage("0");
  segments = createEmptySegments();
  player = {
    x: 1.5,
    y: 13,
    w: PLAYER_SIZE,
    h: PLAYER_SIZE,
    vx: 0,
    vy: 0,
    onGround: false,
  };
  resize();
  requestAnimationFrame(tick);
}

window.addEventListener("resize", resize);
startGame();
