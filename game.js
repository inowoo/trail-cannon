"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const turboButton = document.getElementById("turboButton");

const W = 960;
const H = 540;
const TAU = Math.PI * 2;

const player = {
  x: 160,
  y: H * 0.52,
  radius: 24,
  angle: 0,
  speed: 245,
};

const keys = new Set();
const bullets = [];
const trailDots = [];
const enemies = [];
const particles = [];
const stars = Array.from({ length: 90 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: Math.random() * 1.8 + 0.4,
  s: Math.random() * 24 + 8,
}));

let turbo = false;
let score = 0;
let fireHeld = false;
let fireCooldown = 0;
let spawnCooldown = 0.4;
let lastTime = performance.now();
let aimX = W * 0.82;
let aimY = H * 0.5;

let movePointerId = null;
let firePointerId = null;
let moveOrigin = null;
let moveCurrent = null;

const joystick = { x: 0, y: 0 };

function toggleTurbo() {
  turbo = !turbo;
  turboButton.textContent = turbo ? "8MHz" : "NORMAL";
  turboButton.classList.toggle("turbo", turbo);
}

turboButton.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleTurbo();
});

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Space" || e.code === "KeyO") {
    e.preventDefault();
    if (!e.repeat) toggleTurbo();
  }
});

window.addEventListener("keyup", (e) => keys.delete(e.code));

function getCanvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / W, r.height / H);
  const drawnW = W * scale;
  const drawnH = H * scale;
  const offsetX = r.left + (r.width - drawnW) * 0.5;
  const offsetY = r.top + (r.height - drawnH) * 0.5;

  return {
    x: (e.clientX - offsetX) / scale,
    y: (e.clientY - offsetY) / scale,
  };
}

function updateJoystick() {
  if (!moveOrigin || !moveCurrent) {
    joystick.x = 0;
    joystick.y = 0;
    return;
  }

  const dx = moveCurrent.x - moveOrigin.x;
  const dy = moveCurrent.y - moveOrigin.y;
  const len = Math.hypot(dx, dy);
  const max = 72;
  const clamped = Math.min(len, max);

  if (len > 0.001) {
    joystick.x = (dx / len) * (clamped / max);
    joystick.y = (dy / len) * (clamped / max);
  } else {
    joystick.x = 0;
    joystick.y = 0;
  }
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const p = getCanvasPos(e);

  if (e.pointerType === "mouse") {
    aimX = p.x;
    aimY = p.y;
    fireHeld = true;
    firePointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  if (p.x < W * 0.46 && movePointerId === null) {
    movePointerId = e.pointerId;
    moveOrigin = p;
    moveCurrent = p;
    updateJoystick();
  } else if (firePointerId === null) {
    firePointerId = e.pointerId;
    aimX = p.x;
    aimY = p.y;
    fireHeld = true;
  }

  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  const p = getCanvasPos(e);

  if (e.pointerType === "mouse") {
    aimX = p.x;
    aimY = p.y;
  }

  if (e.pointerId === movePointerId) {
    moveCurrent = p;
    updateJoystick();
  }

  if (e.pointerId === firePointerId) {
    aimX = p.x;
    aimY = p.y;
  }
});

function releasePointer(e) {
  if (e.pointerId === movePointerId) {
    movePointerId = null;
    moveOrigin = null;
    moveCurrent = null;
    updateJoystick();
  }

  if (e.pointerId === firePointerId) {
    firePointerId = null;
    fireHeld = false;
  }
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function fire() {
  const dx = aimX - player.x;
  const dy = aimY - player.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;

  player.angle = Math.atan2(ny, nx);

  const px = -ny;
  const py = nx;
  const shoulderOffset = -12;

  const sx = player.x + nx * 30 + px * shoulderOffset;
  const sy = player.y + ny * 30 + py * shoulderOffset;
  const speed = turbo ? 1040 : 710;

  bullets.push({
    x: sx,
    y: sy,
    vx: nx * speed,
    vy: ny * speed,
    r: turbo ? 5.2 : 4.4,
    trailClock: 0,
  });

  for (let i = 0; i < (turbo ? 5 : 3); i++) {
    const a = player.angle + Math.PI + (Math.random() - 0.5) * 0.7;
    const s = Math.random() * 90 + 30;
    particles.push({
      x: sx,
      y: sy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.16 + Math.random() * 0.12,
      maxLife: 0.28,
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

function spawnEnemy() {
  if (enemies.length >= 9) return;

  const y = 60 + Math.random() * (H - 120);
  enemies.push({
    x: W + 50,
    y,
    baseY: y,
    r: 19 + Math.random() * 6,
    speed: 72 + Math.random() * 58,
    phase: Math.random() * TAU,
    wobble: 12 + Math.random() * 26,
  });
}

function explode(x, y) {
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * TAU;
    const s = 45 + Math.random() * 210;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.35 + Math.random() * 0.45,
      maxLife: 0.8,
      size: 1.5 + Math.random() * 4.5,
    });
  }
}

function update(dt) {
  const timeScale = turbo ? 1.18 : 1;
  const worldDt = dt * timeScale;

  let mx = joystick.x;
  let my = joystick.y;

  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) my -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) my += 1;

  const mLen = Math.hypot(mx, my);
  if (mLen > 1) {
    mx /= mLen;
    my /= mLen;
  }

  const pSpeed = player.speed * (turbo ? 1.48 : 1);
  player.x += mx * pSpeed * dt;
  player.y += my * pSpeed * dt;

  player.x = Math.max(54, Math.min(W * 0.55, player.x));
  player.y = Math.max(54, Math.min(H - 54, player.y));

  player.angle = Math.atan2(aimY - player.y, aimX - player.x);

  fireCooldown -= dt;
  if (fireHeld && fireCooldown <= 0) {
    fire();
    fireCooldown = turbo ? 0.043 : 0.125;
  }

  for (const star of stars) {
    star.x -= star.s * worldDt;
    if (star.x < -4) {
      star.x = W + 4;
      star.y = Math.random() * H;
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];

    b.trailClock -= dt;
    if (b.trailClock <= 0) {
      trailDots.push({
        x: b.x,
        y: b.y,
        life: turbo ? 0.82 : 0.66,
        maxLife: turbo ? 0.82 : 0.66,
        size: turbo ? 3.2 : 2.7,
      });
      b.trailClock = turbo ? 0.022 : 0.032;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      const dx = b.x - e.x;
      const dy = b.y - e.y;
      const rr = b.r + e.r;

      if (dx * dx + dy * dy < rr * rr) {
        explode(e.x, e.y);
        enemies.splice(j, 1);
        score += 100;
        hit = true;
        break;
      }
    }

    if (
      hit ||
      b.x < -80 ||
      b.x > W + 80 ||
      b.y < -80 ||
      b.y > H + 80
    ) {
      bullets.splice(i, 1);
    }
  }

  for (let i = trailDots.length - 1; i >= 0; i--) {
    trailDots[i].life -= dt;
    if (trailDots[i].life <= 0) trailDots.splice(i, 1);
  }
  if (trailDots.length > 2600) {
    trailDots.splice(0, trailDots.length - 2600);
  }

  spawnCooldown -= worldDt;
  if (spawnCooldown <= 0) {
    spawnEnemy();
    spawnCooldown = 0.72 + Math.random() * 0.9;
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.x -= e.speed * worldDt;
    e.phase += worldDt * 2.2;
    e.y = e.baseY + Math.sin(e.phase) * e.wobble;

    if (e.x < -60) enemies.splice(i, 1);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.04, dt);
    p.vy *= Math.pow(0.04, dt);

    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#07111f");
  g.addColorStop(0.62, "#0b1827");
  g.addColorStop(1, "#071018");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.8;
  for (const star of stars) {
    ctx.fillStyle = "#b8d8ff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const horizon = H * 0.72;
  ctx.strokeStyle = "rgba(92,147,180,.16)";
  ctx.lineWidth = 1;

  for (let y = horizon; y < H; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  for (let x = -80; x < W + 80; x += 80) {
    ctx.beginPath();
    ctx.moveTo(W / 2, horizon);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
}

function drawTrailDots() {
  for (const t of trailDots) {
    const a = Math.max(0, t.life / t.maxLife);
    ctx.fillStyle = `rgba(248,214,112,${0.15 + a * 0.82})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.size * (0.65 + a * 0.45), 0, TAU);
    ctx.fill();
  }
}

function drawBullets() {
  for (const b of bullets) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));

    ctx.fillStyle = turbo ? "#fff4c4" : "#ffe58a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, b.r, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = turbo ? "rgba(255,119,38,.95)" : "rgba(255,165,58,.75)";
    ctx.beginPath();
    ctx.moveTo(-7, -b.r * 0.7);
    ctx.lineTo(-17 - Math.random() * 8, 0);
    ctx.lineTo(-7, b.r * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.fillStyle = "#26394b";
  ctx.strokeStyle = "#8eaec7";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-e.r, -8);
  ctx.lineTo(-4, -e.r * 0.62);
  ctx.lineTo(e.r, -9);
  ctx.lineTo(e.r * 0.82, 10);
  ctx.lineTo(0, e.r * 0.66);
  ctx.lineTo(-e.r, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ff6748";
  ctx.beginPath();
  ctx.arc(6, 0, 5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawPlayer() {
  const a = player.angle;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const px = -ny;
  const py = nx;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(a);

  ctx.fillStyle = "#1b2f42";
  ctx.strokeStyle = "#b4d0e5";
  ctx.lineWidth = 2.4;

  ctx.beginPath();
  ctx.roundRect(-23, -19, 45, 38, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#486c85";
  ctx.fillRect(-18, 17, 15, 18);
  ctx.fillRect(4, 17, 15, 18);

  ctx.fillStyle = "#c8e8ff";
  ctx.beginPath();
  ctx.arc(8, -2, 6, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#2f4659";
  ctx.strokeStyle = "#d7eaf7";
  ctx.beginPath();
  ctx.roundRect(-5, -31, 42, 10, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = turbo ? "#ff8b3d" : "#78b8df";
  ctx.beginPath();
  ctx.arc(-21, 0, 5, 0, TAU);
  ctx.fill();

  ctx.restore();

  if (turbo) {
    ctx.fillStyle = "rgba(255,105,28,.26)";
    ctx.beginPath();
    ctx.moveTo(player.x - nx * 28 + px * 10, player.y - ny * 28 + py * 10);
    ctx.lineTo(player.x - nx * (62 + Math.random() * 20), player.y - ny * (62 + Math.random() * 20));
    ctx.lineTo(player.x - nx * 28 - px * 10, player.y - ny * 28 - py * 10);
    ctx.closePath();
    ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = `rgba(255,151,69,${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + a), 0, TAU);
    ctx.fill();
  }
}

function drawTouchUi() {
  if (moveOrigin && moveCurrent) {
    ctx.strokeStyle = "rgba(210,230,245,.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(moveOrigin.x, moveOrigin.y, 72, 0, TAU);
    ctx.stroke();

    const knobX = moveOrigin.x + joystick.x * 72;
    const knobY = moveOrigin.y + joystick.y * 72;

    ctx.fillStyle = "rgba(210,230,245,.18)";
    ctx.beginPath();
    ctx.arc(knobX, knobY, 28, 0, TAU);
    ctx.fill();
  }

  if (fireHeld) {
    ctx.strokeStyle = "rgba(255,224,120,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(aimX, aimY, 18, 0, TAU);
    ctx.moveTo(aimX - 25, aimY);
    ctx.lineTo(aimX + 25, aimY);
    ctx.moveTo(aimX, aimY - 25);
    ctx.lineTo(aimX, aimY + 25);
    ctx.stroke();
  }
}

function drawHud() {
  ctx.fillStyle = "rgba(5,10,18,.64)";
  ctx.fillRect(14, 14, 196, 64);

  ctx.fillStyle = "#dbe9f4";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText("TRAIL CANNON", 27, 40);

  ctx.font = "600 14px system-ui, sans-serif";
  ctx.fillStyle = turbo ? "#ffb067" : "#8fc8e8";
  ctx.fillText(turbo ? "CLOCK: 8MHz" : "CLOCK: NORMAL", 27, 63);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(220,235,245,.74)";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillText("左側ドラッグ: 移動　右側長押し: 照準＋連射", W / 2, H - 18);
  ctx.textAlign = "left";

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 20px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(String(score).padStart(6, "0"), W - 136, 78);
}

function render() {
  drawBackground();
  drawTrailDots();

  for (const e of enemies) drawEnemy(e);

  drawParticles();
  drawBullets();
  drawPlayer();
  drawTouchUi();
  drawHud();
}

function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 1 / 30);

  update(dt);
  render();
  requestAnimationFrame(loop);
}

for (let i = 0; i < 4; i++) spawnEnemy();
requestAnimationFrame(loop);
