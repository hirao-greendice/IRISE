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
const mapButton = document.querySelector(".map-button");
const mapOverlay = document.querySelector(".map-overlay");
const mapClose = document.querySelector(".map-close");
const mapCanvas = document.getElementById("map");
const mapCtx = mapCanvas.getContext("2d");
const editorButton = document.querySelector(".editor-button");
const editorPanel = document.querySelector(".editor-panel");
const editorClose = document.querySelector(".editor-close");
const stageSelect = document.getElementById("stage-select");
const currentStageLabel = document.getElementById("current-stage-label");
const gridColsInput = document.getElementById("grid-cols");
const gridRowsInput = document.getElementById("grid-rows");
const gridApplyButton = document.getElementById("grid-apply");
const editorClearButton = document.getElementById("editor-clear");
const editorSaveButton = document.getElementById("editor-save");
const tileButtons = Array.from(document.querySelectorAll(".tile-button"));

const DEFAULT_GRID = { cols: 14, rows: 21 };
const GRID_LIMITS = { min: 6, max: 40 };
const AREA_COLS = 2;
const AREA_ROWS = 3;
const PLAYER_SIZE = 1;
const MOVE_SPEED = 6.4;
const JUMP_SPEED = 12;
const GRAVITY = 22;
const MAX_FALL_SPEED = 18;
const EXIT_TRIGGER = 0.4;
const ENTRY_OFFSET = 0.2;
const EPS = 0.001;
const STORAGE_KEY = "iris-stages-v1";

const TILE_TYPES = {
  EMPTY: 0,
  SOLID: 1,
  HALF_TOP: 2,
  HALF_BOTTOM: 3,
  HALF_LEFT: 4,
  HALF_RIGHT: 5,
  ONEWAY: 6,
};
const MAX_TILE_ID = 6;
const STAGE_IDS = Array.from({ length: 10 }, (_, index) => String(index));
const VOID_STAGE_ID = "void";
const EDITOR_STAGE_IDS = [...STAGE_IDS, VOID_STAGE_ID];

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

const EXIT_DIRS = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

let viewWidth = 320;
let viewHeight = 480;
let cellSize = 32;

let grid = { ...DEFAULT_GRID };
let stageStore = null;
let editor = {
  active: false,
  selectedTile: TILE_TYPES.SOLID,
  stageId: "0",
  pointerDown: false,
  dragTile: TILE_TYPES.SOLID,
  hover: null,
};

let player = {
  x: 1.5,
  y: grid.rows - 2,
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
  nextCoord: null,
};
let playerRoom = "current";
let lastTime = performance.now();

let audioCtx = null;
let audioUnlocked = false;
let mapOpen = false;
let worldMap = new Map();
let currentCoord = { x: 0, y: 0 };

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
  input.jumpQueued = false;
  updateMoveButtons();
}

function openMap() {
  if (mapOpen || editor.active) {
    return;
  }
  mapOpen = true;
  mapOverlay.classList.add("active");
  mapOverlay.setAttribute("aria-hidden", "false");
  clearInput();
  renderMap();
}

function closeMap() {
  if (!mapOpen) {
    return;
  }
  mapOpen = false;
  mapOverlay.classList.remove("active");
  mapOverlay.setAttribute("aria-hidden", "true");
}

function setEditorMode(active) {
  editor.active = active;
  editorPanel.classList.toggle("active", active);
  editorPanel.setAttribute("aria-hidden", active ? "false" : "true");
  editorButton.classList.toggle("active", active);
  if (active) {
    closeMap();
    clearInput();
    updateCurrentStageLabel();
    setEditorStage(currentStage.id);
  } else {
    editor.pointerDown = false;
    editor.hover = null;
  }
}

function updateTileButtons() {
  tileButtons.forEach((button) => {
    const tileId = Number(button.dataset.tile);
    button.classList.toggle("active", tileId === editor.selectedTile);
  });
}

function formatStageLabel(stageId) {
  if (stageId === VOID_STAGE_ID) {
    return "Void";
  }
  return stageId;
}

function updateCurrentStageLabel() {
  if (!currentStageLabel) {
    return;
  }
  currentStageLabel.textContent = formatStageLabel(currentStage.id);
}

function setEditorStage(stageId) {
  if (!EDITOR_STAGE_IDS.includes(stageId)) {
    return;
  }
  editor.stageId = stageId;
  stageSelect.value = stageId;
  currentStage = createStage(stageId);
  player.x = Math.min(player.x, grid.cols - player.w);
  player.y = Math.min(player.y, grid.rows - player.h);
  pulses = [];
  segments = createEmptySegments();
}

function applyGridSize(colsValue, rowsValue) {
  const cols = clampNumber(
    Number(colsValue),
    GRID_LIMITS.min,
    GRID_LIMITS.max,
    grid.cols
  );
  const rows = clampNumber(
    Number(rowsValue),
    GRID_LIMITS.min,
    GRID_LIMITS.max,
    grid.rows
  );
  if (cols === grid.cols && rows === grid.rows) {
    gridColsInput.value = cols;
    gridRowsInput.value = rows;
    return;
  }
  grid = { cols, rows };
  stageStore.grid = { ...grid };
  stageStore.stages = stageStore.stages.map((tiles) =>
    resizeTiles(tiles, grid.cols, grid.rows)
  );
  stageStore.voidStage = resizeTiles(
    stageStore.voidStage,
    grid.cols,
    grid.rows
  );
  currentStage = createStage(editor.stageId);
  player.x = Math.min(player.x, grid.cols - player.w);
  player.y = Math.min(player.y, grid.rows - player.h);
  resize();
  saveStageStore();
  gridColsInput.value = cols;
  gridRowsInput.value = rows;
}

function clearStage(stageId) {
  const tiles = createEmptyTiles(grid.cols, grid.rows);
  if (stageId === VOID_STAGE_ID) {
    stageStore.voidStage = tiles;
  } else {
    const index = Number(stageId);
    if (Number.isNaN(index)) {
      return;
    }
    stageStore.stages[index] = tiles;
  }
  if (currentStage.id === stageId) {
    currentStage.tiles = tiles;
  }
  saveStageStore();
}

function getEditableTiles(stageId) {
  if (stageId === VOID_STAGE_ID) {
    return stageStore.voidStage;
  }
  const index = Number(stageId);
  if (Number.isNaN(index)) {
    return null;
  }
  return stageStore.stages[index] || null;
}

function getTileFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  return {
    tileX: Math.floor(x * grid.cols),
    tileY: Math.floor(y * grid.rows),
  };
}

function paintTile(tileX, tileY, tileType) {
  if (
    tileX < 0 ||
    tileX >= grid.cols ||
    tileY < 0 ||
    tileY >= grid.rows
  ) {
    return;
  }
  const tiles = getEditableTiles(editor.stageId);
  if (!tiles) {
    return;
  }
  if (tiles[tileY][tileX] === tileType) {
    return;
  }
  tiles[tileY][tileX] = tileType;
  saveStageStore();
}

function initEditorUI() {
  stageSelect.value = editor.stageId;
  gridColsInput.value = grid.cols;
  gridRowsInput.value = grid.rows;
  updateTileButtons();
  updateCurrentStageLabel();
}

function handleKey(down, event) {
  const key = event.key.toLowerCase();
  let handled = true;

  if (mapOpen || editor.active) {
    if (key === "escape" && down) {
      if (mapOpen) {
        closeMap();
      }
      if (editor.active) {
        setEditorMode(false);
      }
      event.preventDefault();
    }
    return;
  }

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

mapButton.addEventListener("click", () => {
  openMap();
});

mapClose.addEventListener("click", () => {
  closeMap();
});

editorButton.addEventListener("click", () => {
  setEditorMode(!editor.active);
});

editorClose.addEventListener("click", () => {
  setEditorMode(false);
});

stageSelect.addEventListener("change", (event) => {
  setEditorStage(event.target.value);
});

gridApplyButton.addEventListener("click", () => {
  applyGridSize(gridColsInput.value, gridRowsInput.value);
});

gridColsInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyGridSize(gridColsInput.value, gridRowsInput.value);
  }
});
gridRowsInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyGridSize(gridColsInput.value, gridRowsInput.value);
  }
});

editorClearButton.addEventListener("click", () => {
  clearStage(editor.stageId);
});

editorSaveButton.addEventListener("click", () => {
  saveStageStore();
});

tileButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tileId = Number(button.dataset.tile);
    if (!Number.isNaN(tileId)) {
      editor.selectedTile = tileId;
      updateTileButtons();
    }
  });
});

canvas.addEventListener("contextmenu", (event) => {
  if (editor.active) {
    event.preventDefault();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  if (!editor.active || mapOpen) {
    return;
  }
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  editor.pointerDown = true;
  editor.dragTile =
    event.button === 2 || event.shiftKey
      ? TILE_TYPES.EMPTY
      : editor.selectedTile;
  const { tileX, tileY } = getTileFromEvent(event);
  editor.hover = { x: tileX, y: tileY };
  paintTile(tileX, tileY, editor.dragTile);
});

canvas.addEventListener("pointermove", (event) => {
  if (!editor.active || mapOpen) {
    return;
  }
  const { tileX, tileY } = getTileFromEvent(event);
  editor.hover = { x: tileX, y: tileY };
  if (editor.pointerDown) {
    paintTile(tileX, tileY, editor.dragTile);
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (!editor.active) {
    return;
  }
  editor.pointerDown = false;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch (error) {
    // Ignore release errors.
  }
});

canvas.addEventListener("pointerleave", () => {
  if (!editor.active) {
    return;
  }
  editor.pointerDown = false;
  editor.hover = null;
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

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
}

function getExitBands(cols, rows) {
  const bandWidth = Math.max(2, Math.floor(cols * 0.3));
  const bandHeight = Math.max(2, Math.floor(rows * 0.3));
  const width = Math.max(2, Math.min(cols - 2, bandWidth));
  const height = Math.max(2, Math.min(rows - 2, bandHeight));
  const startX = (cols - width) / 2;
  const endX = startX + width;
  const startY = (rows - height) / 2;
  const endY = startY + height;
  return {
    top: { min: startX, max: endX },
    bottom: { min: startX, max: endX },
    left: { min: startY, max: endY },
    right: { min: startY, max: endY },
  };
}

function createEmptyTiles(cols, rows) {
  return Array.from({ length: rows }, () =>
    Array(cols).fill(TILE_TYPES.EMPTY)
  );
}

function normalizeTiles(raw, cols, rows) {
  const tiles = createEmptyTiles(cols, rows);
  if (!Array.isArray(raw)) {
    return tiles;
  }
  for (let y = 0; y < rows; y += 1) {
    if (!Array.isArray(raw[y])) {
      continue;
    }
    for (let x = 0; x < cols; x += 1) {
      const value = Number(raw[y][x]);
      tiles[y][x] =
        Number.isFinite(value) && value >= 0 && value <= MAX_TILE_ID
          ? value
          : TILE_TYPES.EMPTY;
    }
  }
  return tiles;
}

function resizeTiles(raw, cols, rows) {
  const tiles = createEmptyTiles(cols, rows);
  if (!Array.isArray(raw)) {
    return tiles;
  }
  const copyRows = Math.min(rows, raw.length);
  for (let y = 0; y < copyRows; y += 1) {
    if (!Array.isArray(raw[y])) {
      continue;
    }
    const copyCols = Math.min(cols, raw[y].length);
    for (let x = 0; x < copyCols; x += 1) {
      const value = Number(raw[y][x]);
      tiles[y][x] =
        Number.isFinite(value) && value >= 0 && value <= MAX_TILE_ID
          ? value
          : TILE_TYPES.EMPTY;
    }
  }
  return tiles;
}

function buildDefaultStageStore() {
  const gridSize = { ...DEFAULT_GRID };
  const stages = STAGE_IDS.map((stageId) =>
    buildTiles(stageId, gridSize.cols, gridSize.rows)
  );
  const voidStage = buildTiles(VOID_STAGE_ID, gridSize.cols, gridSize.rows);
  return { grid: gridSize, stages, voidStage };
}

function loadStageStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    const cols = clampNumber(
      Number(data?.grid?.cols),
      GRID_LIMITS.min,
      GRID_LIMITS.max,
      DEFAULT_GRID.cols
    );
    const rows = clampNumber(
      Number(data?.grid?.rows),
      GRID_LIMITS.min,
      GRID_LIMITS.max,
      DEFAULT_GRID.rows
    );
    const stages = STAGE_IDS.map((_, index) =>
      normalizeTiles(data?.stages?.[index], cols, rows)
    );
    let voidStage = null;
    if (Array.isArray(data?.voidStage)) {
      voidStage = normalizeTiles(data.voidStage, cols, rows);
    } else {
      voidStage = buildTiles(VOID_STAGE_ID, cols, rows);
    }
    return { grid: { cols, rows }, stages, voidStage };
  } catch (error) {
    return null;
  }
}

function saveStageStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stageStore));
  } catch (error) {
    // Ignore storage failures.
  }
}

stageStore = loadStageStore() || buildDefaultStageStore();
grid = { ...stageStore.grid };

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

function coordKey(coord) {
  return `${coord.x},${coord.y}`;
}

function parseCoordKey(key) {
  const parts = key.split(",").map(Number);
  return { x: parts[0], y: parts[1] };
}

function getStageColor(stageId) {
  if (stageId === "void") {
    return VOID_THEME.accent;
  }
  const index = Number(stageId);
  return STAGE_ACCENTS[index] || BASE_THEME.wall;
}

function renderMap() {
  if (!mapOpen) {
    return;
  }

  const rect = mapCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  mapCanvas.width = Math.floor(rect.width * dpr);
  mapCanvas.height = Math.floor(rect.height * dpr);
  mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  mapCtx.fillStyle = "#fbf6ee";
  mapCtx.fillRect(0, 0, rect.width, rect.height);

  const entries = Array.from(worldMap.entries()).map(([key, stageId]) => ({
    ...parseCoordKey(key),
    stageId,
  }));
  if (entries.length === 0) {
    return;
  }

  let minX = entries[0].x;
  let maxX = entries[0].x;
  let minY = entries[0].y;
  let maxY = entries[0].y;
  entries.forEach((entry) => {
    minX = Math.min(minX, entry.x);
    maxX = Math.max(maxX, entry.x);
    minY = Math.min(minY, entry.y);
    maxY = Math.max(maxY, entry.y);
  });

  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const margin = 12;
  const cell = Math.min(
    (rect.width - margin * 2) / cols,
    (rect.height - margin * 2) / rows
  );
  const originX = (rect.width - cell * cols) / 2;
  const originY = (rect.height - cell * rows) / 2;

  entries.forEach((entry) => {
    const x = originX + (entry.x - minX) * cell;
    const y = originY + (entry.y - minY) * cell;
    mapCtx.fillStyle = getStageColor(entry.stageId);
    mapCtx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    mapCtx.strokeStyle = "rgba(26, 23, 18, 0.25)";
    mapCtx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  });

  const cursorX = originX + (currentCoord.x - minX) * cell;
  const cursorY = originY + (currentCoord.y - minY) * cell;
  mapCtx.strokeStyle = "#1a1712";
  mapCtx.lineWidth = 2;
  mapCtx.strokeRect(cursorX + 0.5, cursorY + 0.5, cell - 1, cell - 1);
}

function applyRect(tiles, rect, tileType = TILE_TYPES.SOLID) {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  for (let y = 0; y < rect.h; y += 1) {
    for (let x = 0; x < rect.w; x += 1) {
      const tileX = rect.x + x;
      const tileY = rect.y + y;
      if (tileX >= 0 && tileX < cols && tileY >= 0 && tileY < rows) {
        tiles[tileY][tileX] = tileType;
      }
    }
  }
}

function inBand(value, band) {
  return value >= band.min && value <= band.max;
}

function buildTiles(stageId, cols = grid.cols, rows = grid.rows) {
  const tiles = createEmptyTiles(cols, rows);
  const exitBands = getExitBands(cols, rows);

  const groundY = rows - 1;
  for (let x = 0; x < cols; x += 1) {
    if (!inBand(x + 0.5, exitBands.bottom)) {
      tiles[groundY][x] = TILE_TYPES.SOLID;
    }
  }

  const platforms = [
    { x: 1, y: 17, w: 4, h: 1 },
    { x: 8, y: 17, w: 4, h: 1 },
    { x: 3, y: 13, w: 4, h: 1 },
    { x: 8, y: 11, w: 4, h: 1 },
    { x: 1, y: 8, w: 4, h: 1 },
    { x: 8, y: 7, w: 4, h: 1 },
  ];

  if (stageId === "void") {
    platforms.forEach((platform) => applyRect(tiles, platform));
    applyRect(tiles, { x: 6, y: 14, w: 3, h: 6 });
    return tiles;
  }

  const value = Number(stageId);
  platforms.forEach((platform, index) => {
    if (value & (1 << index)) {
      applyRect(tiles, platform);
    }
  });

  if (value % 2 === 1) {
    applyRect(tiles, { x: 6, y: 10, w: 3, h: 1 });
  }

  return tiles;
}

function getStoredTiles(stageId) {
  if (stageId === VOID_STAGE_ID && stageStore.voidStage) {
    return stageStore.voidStage;
  }
  const index = Number(stageId);
  if (!Number.isNaN(index) && stageStore.stages[index]) {
    return stageStore.stages[index];
  }
  return null;
}

function createStage(stageId) {
  const stored = getStoredTiles(stageId);
  return {
    id: stageId,
    theme: getTheme(stageId),
    tiles: stored || buildTiles(stageId),
  };
}

function getAreaForPlayer() {
  const areaWidth = grid.cols / AREA_COLS;
  const areaHeight = grid.rows / AREA_ROWS;
  const centerX = Math.min(
    Math.max(player.x + player.w / 2, 0),
    grid.cols - EPS
  );
  const centerY = Math.min(
    Math.max(player.y + player.h / 2, 0),
    grid.rows - EPS
  );
  return {
    col: Math.min(AREA_COLS - 1, Math.floor(centerX / areaWidth)),
    row: Math.min(AREA_ROWS - 1, Math.floor(centerY / areaHeight)),
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

function rectsForTile(tileX, tileY, type) {
  switch (type) {
    case TILE_TYPES.SOLID:
      return [
        {
          x: tileX,
          y: tileY,
          w: 1,
          h: 1,
          blockX: true,
          blockY: true,
          oneWay: false,
        },
      ];
    case TILE_TYPES.HALF_TOP:
      return [
        {
          x: tileX,
          y: tileY,
          w: 1,
          h: 0.5,
          blockX: true,
          blockY: true,
          oneWay: false,
        },
      ];
    case TILE_TYPES.HALF_BOTTOM:
      return [
        {
          x: tileX,
          y: tileY + 0.5,
          w: 1,
          h: 0.5,
          blockX: true,
          blockY: true,
          oneWay: false,
        },
      ];
    case TILE_TYPES.HALF_LEFT:
      return [
        {
          x: tileX,
          y: tileY,
          w: 0.5,
          h: 1,
          blockX: true,
          blockY: true,
          oneWay: false,
        },
      ];
    case TILE_TYPES.HALF_RIGHT:
      return [
        {
          x: tileX + 0.5,
          y: tileY,
          w: 0.5,
          h: 1,
          blockX: true,
          blockY: true,
          oneWay: false,
        },
      ];
    case TILE_TYPES.ONEWAY:
      return [
        {
          x: tileX,
          y: tileY,
          w: 1,
          h: 1,
          blockX: false,
          blockY: true,
          oneWay: true,
        },
      ];
    default:
      return [];
  }
}

function collectRects(bounds) {
  const rects = [];
  const minX = Math.max(0, Math.floor(bounds.x));
  const maxX = Math.min(grid.cols - 1, Math.floor(bounds.x + bounds.w));
  const minY = Math.max(0, Math.floor(bounds.y));
  const maxY = Math.min(grid.rows - 1, Math.floor(bounds.y + bounds.h));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const type = currentStage.tiles[y]?.[x] ?? TILE_TYPES.EMPTY;
      rects.push(...rectsForTile(x, y, type));
    }
  }

  return rects;
}

function movePlayerX(dx) {
  if (!dx) {
    return;
  }
  const startX = player.x;
  let nextX = player.x + dx;
  const bounds = {
    x: Math.min(startX, nextX),
    y: player.y,
    w: player.w + Math.abs(dx),
    h: player.h,
  };
  const rects = collectRects(bounds);

  if (dx > 0) {
    const startRight = startX + player.w;
    let limit = nextX;
    rects.forEach((rect) => {
      if (!rect.blockX) {
        return;
      }
      if (rect.y >= player.y + player.h || rect.y + rect.h <= player.y) {
        return;
      }
      if (startRight <= rect.x + EPS && nextX + player.w > rect.x) {
        const candidate = rect.x - player.w;
        if (candidate < limit) {
          limit = candidate;
        }
      }
    });
    if (limit !== nextX) {
      nextX = limit;
      player.vx = 0;
    }
  } else {
    const startLeft = startX;
    let limit = nextX;
    rects.forEach((rect) => {
      if (!rect.blockX) {
        return;
      }
      if (rect.y >= player.y + player.h || rect.y + rect.h <= player.y) {
        return;
      }
      if (startLeft >= rect.x + rect.w - EPS && nextX < rect.x + rect.w) {
        const candidate = rect.x + rect.w;
        if (candidate > limit) {
          limit = candidate;
        }
      }
    });
    if (limit !== nextX) {
      nextX = limit;
      player.vx = 0;
    }
  }

  player.x = nextX;
}

function movePlayerY(dy) {
  if (!dy) {
    return;
  }
  const startY = player.y;
  let nextY = player.y + dy;
  const bounds = {
    x: player.x,
    y: Math.min(startY, nextY),
    w: player.w,
    h: player.h + Math.abs(dy),
  };
  const rects = collectRects(bounds);

  if (dy > 0) {
    const startBottom = startY + player.h;
    let limit = nextY;
    rects.forEach((rect) => {
      if (!rect.blockY) {
        return;
      }
      if (rect.x >= player.x + player.w || rect.x + rect.w <= player.x) {
        return;
      }
      if (rect.oneWay && startBottom > rect.y + EPS) {
        return;
      }
      if (startBottom <= rect.y + EPS && nextY + player.h > rect.y) {
        const candidate = rect.y - player.h;
        if (candidate < limit) {
          limit = candidate;
        }
      }
    });
    if (limit !== nextY) {
      nextY = limit;
      player.vy = 0;
      player.onGround = true;
    }
  } else {
    const startTop = startY;
    let limit = nextY;
    rects.forEach((rect) => {
      if (!rect.blockY || rect.oneWay) {
        return;
      }
      if (rect.x >= player.x + player.w || rect.x + rect.w <= player.x) {
        return;
      }
      if (startTop >= rect.y + rect.h - EPS && nextY < rect.y + rect.h) {
        const candidate = rect.y + rect.h;
        if (candidate > limit) {
          limit = candidate;
        }
      }
    });
    if (limit !== nextY) {
      nextY = limit;
      player.vy = 0;
    }
  }

  player.y = nextY;
}

function inExitBand(edge, centerX, centerY) {
  const band = getExitBands(grid.cols, grid.rows)[edge];
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

  if (player.x + player.w > grid.cols) {
    if (inExitBand("right", centerX, centerY)) {
      if (centerX > grid.cols + EXIT_TRIGGER) {
        startTransition("right");
        return;
      }
    } else {
      player.x = grid.cols - player.w;
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

  if (player.y + player.h > grid.rows) {
    if (inExitBand("bottom", centerX, centerY)) {
      if (centerY > grid.rows + EXIT_TRIGGER) {
        startTransition("bottom");
        return;
      }
    } else {
      player.y = grid.rows - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }
}

function startTransition(edge) {
  const dir = EXIT_DIRS[edge];
  const nextCoord = { x: currentCoord.x + dir.x, y: currentCoord.y + dir.y };
  let nextStageId = worldMap.get(coordKey(nextCoord));
  if (!nextStageId) {
    nextStageId = stageIdFromSegments();
    worldMap.set(coordKey(nextCoord), nextStageId);
    if (mapOpen) {
      renderMap();
    }
  }
  transition = {
    active: true,
    progress: 0,
    duration: 0.65,
    dir,
    nextStage: createStage(nextStageId),
    nextCoord,
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
    grid.cols - PLAYER_SIZE - ENTRY_OFFSET
  );
  const clampedY = Math.min(
    Math.max(player.y, ENTRY_OFFSET),
    grid.rows - PLAYER_SIZE - ENTRY_OFFSET
  );

  switch (edge) {
    case "left":
      return {
        x: grid.cols - PLAYER_SIZE - ENTRY_OFFSET,
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
        y: grid.rows - PLAYER_SIZE - ENTRY_OFFSET,
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
    if (transition.nextCoord) {
      currentCoord = transition.nextCoord;
      worldMap.set(coordKey(currentCoord), currentStage.id);
    }
    playerRoom = "current";
    if (mapOpen) {
      renderMap();
    }
  }
}

function update(dt) {
  updatePulses(dt);

  if (transition.active) {
    updateTransition(dt);
    return;
  }

  if (mapOpen || editor.active) {
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

  for (let x = 1; x < grid.cols; x += 1) {
    const px = offsetX + x * cellSize;
    ctx.beginPath();
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + viewHeight);
    ctx.stroke();
  }
  for (let y = 1; y < grid.rows; y += 1) {
    const py = offsetY + y * cellSize;
    ctx.beginPath();
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + viewWidth, py);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawBorders(theme, offsetX, offsetY) {
  const exitBands = getExitBands(grid.cols, grid.rows);
  const topGap = {
    start: exitBands.top.min * cellSize,
    end: exitBands.top.max * cellSize,
  };
  const bottomGap = {
    start: exitBands.bottom.min * cellSize,
    end: exitBands.bottom.max * cellSize,
  };
  const leftGap = {
    start: exitBands.left.min * cellSize,
    end: exitBands.left.max * cellSize,
  };
  const rightGap = {
    start: exitBands.right.min * cellSize,
    end: exitBands.right.max * cellSize,
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

function drawTile(type, x, y, offsetX, offsetY) {
  const px = offsetX + x * cellSize;
  const py = offsetY + y * cellSize;
  const half = cellSize * 0.5;

  switch (type) {
    case TILE_TYPES.SOLID:
      ctx.fillRect(px, py, cellSize, cellSize);
      break;
    case TILE_TYPES.HALF_TOP:
      ctx.fillRect(px, py, cellSize, half);
      break;
    case TILE_TYPES.HALF_BOTTOM:
      ctx.fillRect(px, py + half, cellSize, half);
      break;
    case TILE_TYPES.HALF_LEFT:
      ctx.fillRect(px, py, half, cellSize);
      break;
    case TILE_TYPES.HALF_RIGHT:
      ctx.fillRect(px + half, py, half, cellSize);
      break;
    case TILE_TYPES.ONEWAY: {
      const height = Math.max(3, cellSize * 0.2);
      ctx.fillRect(px, py, cellSize, height);
      break;
    }
    default:
      break;
  }
}

function drawObstacles(stage, offsetX, offsetY) {
  ctx.fillStyle = stage.theme.wall;
  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.cols; x += 1) {
      const type = stage.tiles[y]?.[x] ?? TILE_TYPES.EMPTY;
      if (type !== TILE_TYPES.EMPTY) {
        drawTile(type, x, y, offsetX, offsetY);
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

function drawEditorOverlay(offsetX, offsetY) {
  if (!editor.active || !editor.hover) {
    return;
  }
  const x = editor.hover.x;
  const y = editor.hover.y;
  if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) {
    return;
  }
  ctx.strokeStyle = currentStage.theme.accent;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.strokeRect(
    offsetX + x * cellSize + 1,
    offsetY + y * cellSize + 1,
    cellSize - 2,
    cellSize - 2
  );
  ctx.globalAlpha = 1;
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

  drawEditorOverlay(currentOffsetX, currentOffsetY);
}

function resize() {
  const controls = document.querySelector(".controls");
  const hint = document.querySelector(".hint");
  const title = document.querySelector(".title");
  const reserved =
    controls.offsetHeight + hint.offsetHeight + title.offsetHeight + 32;
  const availableHeight = Math.max(300, window.innerHeight - reserved);
  const maxWidthByHeight = availableHeight * (grid.cols / grid.rows);
  const maxWidthByWidth = window.innerWidth * 0.92;

  viewWidth = Math.max(
    220,
    Math.floor(Math.min(maxWidthByWidth, maxWidthByHeight))
  );
  viewHeight = Math.floor(viewWidth * (grid.rows / grid.cols));
  cellSize = viewWidth / grid.cols;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
  canvas.width = Math.floor(viewWidth * dpr);
  canvas.height = Math.floor(viewHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  document.documentElement.style.setProperty("--play-width", `${viewWidth}px`);
  document.documentElement.style.setProperty("--play-height", `${viewHeight}px`);

  if (mapOpen) {
    renderMap();
  }
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(tick);
}

function startGame() {
  worldMap = new Map();
  currentCoord = { x: 0, y: 0 };
  worldMap.set(coordKey(currentCoord), "0");
  currentStage = createStage(editor.stageId);
  segments = createEmptySegments();
  player = {
    x: 1.5,
    y: grid.rows - 2,
    w: PLAYER_SIZE,
    h: PLAYER_SIZE,
    vx: 0,
    vy: 0,
    onGround: false,
  };
  initEditorUI();
  resize();
  requestAnimationFrame(tick);
}

window.addEventListener("resize", resize);
startGame();
