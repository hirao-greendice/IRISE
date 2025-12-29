const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const input = {
  left: false,
  right: false,
  jumpQueued: false,
};

const pad = document.querySelector(".pad");
const leftButton = document.querySelector(".control.left");
const rightButton = document.querySelector(".control.right");
const jumpButton = document.querySelector(".control.jump");

const tuning = {
  move: 0.87,
  jump: 1.27,
  gravity: 2.13,
};

let viewWidth = 320;
let viewHeight = 480;
let player = null;
let platforms = [];
let lastTime = performance.now();

function queueJump() {
  input.jumpQueued = true;
}

function updateMoveButtons() {
  leftButton.classList.toggle("pressed", input.left);
  rightButton.classList.toggle("pressed", input.right);
}

function setupStage() {
  const base = viewWidth;
  const playerSize = Math.max(22, Math.floor(base * 0.08));
  const groundHeight = Math.max(14, Math.floor(base * 0.06));
  const platformHeight = Math.max(12, Math.floor(base * 0.05));
  const w = viewWidth;
  const h = viewHeight;

  platforms = [
    { x: 0, y: h - groundHeight, w, h: groundHeight },
    {
      x: Math.floor(w * 0.12),
      y: Math.floor(h - w * 0.25),
      w: Math.floor(w * 0.3),
      h: platformHeight,
    },
    {
      x: Math.floor(w * 0.56),
      y: Math.floor(h - w * 0.45),
      w: Math.floor(w * 0.32),
      h: platformHeight,
    },
    {
      x: Math.floor(w * 0.15),
      y: Math.floor(h - w * 0.7),
      w: Math.floor(w * 0.28),
      h: platformHeight,
    },
    {
      x: Math.floor(w * 0.56),
      y: Math.floor(h - w * 0.95),
      w: Math.floor(w * 0.3),
      h: platformHeight,
    },
    {
      x: Math.floor(w * 0.72),
      y: Math.floor(h - w * 1.2),
      w: Math.floor(w * 0.23),
      h: platformHeight,
    },
  ];

  player = {
    x: Math.floor(w * 0.1),
    y: h - groundHeight - playerSize,
    w: playerSize,
    h: playerSize,
    vx: 0,
    vy: 0,
    onGround: false,
  };
}

function resize() {
  const controls = document.querySelector(".controls");
  const hint = document.querySelector(".hint");
  const reserved = controls.offsetHeight + hint.offsetHeight + 28;
  const availableHeight = Math.max(300, window.innerHeight - reserved);
  const maxWidthByHeight = availableHeight / 1.5;
  const maxWidthByWidth = window.innerWidth * 0.92;
  viewWidth = Math.max(220, Math.floor(Math.min(maxWidthByWidth, maxWidthByHeight)));
  viewHeight = Math.floor(viewWidth * 1.5);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
  canvas.width = Math.floor(viewWidth * dpr);
  canvas.height = Math.floor(viewHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  document.documentElement.style.setProperty("--play-width", `${viewWidth}px`);
  document.documentElement.style.setProperty("--play-height", `${viewHeight}px`);
  setupStage();
}

function handleKey(down, event) {
  const key = event.key.toLowerCase();
  let handled = true;
  let moveChanged = false;

  switch (key) {
    case "arrowleft":
    case "a":
      input.left = down;
      moveChanged = true;
      break;
    case "arrowright":
    case "d":
      input.right = down;
      moveChanged = true;
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

  if (moveChanged) {
    updateMoveButtons();
  }

  if (handled) {
    event.preventDefault();
  }
}

window.addEventListener("keydown", (event) => handleKey(true, event), {
  passive: false,
});
window.addEventListener("keyup", (event) => handleKey(false, event), {
  passive: false,
});

let padPointerId = null;

function updatePadDirection(event) {
  const rect = pad.getBoundingClientRect();
  const mid = rect.left + rect.width / 2;
  const direction = event.clientX < mid ? "left" : "right";
  input.left = direction === "left";
  input.right = direction === "right";
  updateMoveButtons();
}

function clearPad() {
  padPointerId = null;
  input.left = false;
  input.right = false;
  updateMoveButtons();
}

pad.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  padPointerId = event.pointerId;
  pad.setPointerCapture(event.pointerId);
  updatePadDirection(event);
});
pad.addEventListener("pointermove", (event) => {
  if (padPointerId === event.pointerId) {
    updatePadDirection(event);
  }
});
pad.addEventListener("pointerup", (event) => {
  if (padPointerId !== event.pointerId) {
    return;
  }
  event.preventDefault();
  pad.releasePointerCapture(event.pointerId);
  clearPad();
});
pad.addEventListener("pointercancel", clearPad);
pad.addEventListener("lostpointercapture", clearPad);

jumpButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
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

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function update(dt) {
  const base = viewWidth;
  const moveSpeed = base * tuning.move;
  const jumpVelocity = base * tuning.jump;
  const gravity = base * tuning.gravity;

  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  player.vx = direction * moveSpeed;

  if (input.jumpQueued && player.onGround) {
    player.vy = -jumpVelocity;
    player.onGround = false;
  }
  input.jumpQueued = false;

  player.vy += gravity * dt;
  const prevY = player.y;

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  if (player.x < 0) {
    player.x = 0;
  }
  if (player.x + player.w > viewWidth) {
    player.x = viewWidth - player.w;
  }

  player.onGround = false;

  platforms.forEach((platform) => {
    if (!rectsOverlap(player, platform)) {
      return;
    }

    if (player.vy >= 0 && prevY + player.h <= platform.y) {
      player.y = platform.y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0 && prevY >= platform.y + platform.h) {
      player.y = platform.y + platform.h;
      player.vy = 0;
    }
  });

  if (player.y > viewHeight + player.h) {
    setupStage();
  }
}

function render() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  ctx.fillStyle = "#111111";
  platforms.forEach((platform) => {
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
  });

  ctx.fillRect(player.x, player.y, player.w, player.h);
}

function tick(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(tick);
}

resize();
window.addEventListener("resize", resize);
requestAnimationFrame(tick);
