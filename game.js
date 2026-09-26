"use strict";

const VERSION = "v0.2.0";
const W = 960;
const H = 540;
const TAU = Math.PI * 2;
const REGULAR_KILLS_TO_BOSS = 20;
const HEAL_EVERY_KILLS = 6;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const clockButton = document.getElementById("clockButton");

const keys = new Set();
const bullets = [];
const enemyBullets = [];
const trailDots = [];
const enemies = [];
const items = [];
const particles = [];

const stars = Array.from({ length: 100 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: Math.random() * 1.8 + 0.4,
  s: Math.random() * 24 + 8,
}));

const player = {
  x: 160,
  y: H * 0.48,
  radius: 23,
  angle: 0,
  speed: 245,
  maxHp: 100,
  hp: 100,
  invincible: 0,
};

let gameState = "title";
let clockUp = false;
let score = 0;
let regularKills = 0;
let fireHeld = false;
let fireCooldown = 0;
let spawnCooldown = 0.5;
let lastTime = performance.now();
let aimX = W * 0.82;
let aimY = H * 0.45;
let worldOffset = 0;
let boss = null;
let bossSpawned = false;
let bannerTimer = 0;
let bannerText = "";

let movePointerId = null;
let firePointerId = null;
let moveOrigin = null;
let moveCurrent = null;
const joystick = { x: 0, y: 0 };

function setClockUp(value) {
  clockUp = value;
  clockButton.textContent = clockUp ? "CLOCK UP ON" : "CLOCK UP";
  clockButton.classList.toggle("clock-up", clockUp);
}

function toggleClockUp() {
  if (gameState !== "playing") return;
  setClockUp(!clockUp);
}

function setGameState(next) {
  gameState = next;
  clockButton.style.display = next === "playing" ? "block" : "none";
  if (next !== "playing") {
    fireHeld = false;
    movePointerId = null;
    firePointerId = null;
    moveOrigin = null;
    moveCurrent = null;
    joystick.x = 0;
    joystick.y = 0;
  }
}

function resetGame() {
  bullets.length = 0;
  enemyBullets.length = 0;
  trailDots.length = 0;
  enemies.length = 0;
  items.length = 0;
  particles.length = 0;

  player.x = 160;
  player.y = H * 0.48;
  player.angle = 0;
  player.hp = player.maxHp;
  player.invincible = 0;

  score = 0;
  regularKills = 0;
  fireCooldown = 0;
  spawnCooldown = 0.45;
  worldOffset = 0;
  boss = null;
  bossSpawned = false;
  bannerTimer = 1.6;
  bannerText = "STAGE 1";
  setClockUp(false);
  setGameState("playing");

  for (let i = 0; i < 3; i++) spawnEnemy(130 + i * 190);
}

function startButtonRect() {
  return { x: W / 2 - 125, y: 355, w: 250, h: 72 };
}

function retryButtonRect() {
  return { x: W / 2 - 125, y: 345, w: 250, h: 68 };
}

function titleButtonRect() {
  return { x: W / 2 - 125, y: 425, w: 250, h: 50 };
}

function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

clockButton.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleClockUp();
});

window.addEventListener("keydown", (e) => {
  keys.add(e.code);

  if (gameState === "title" && (e.code === "Enter" || e.code === "Space")) {
    e.preventDefault();
    if (!e.repeat) resetGame();
    return;
  }

  if ((gameState === "gameover" || gameState === "clear") && e.code === "Enter") {
    e.preventDefault();
    if (!e.repeat) resetGame();
    return;
  }

  if (gameState === "playing" && (e.code === "Space" || e.code === "KeyO")) {
    e.preventDefault();
    if (!e.repeat) toggleClockUp();
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

  if (gameState === "title") {
    if (pointInRect(p, startButtonRect())) resetGame();
    return;
  }

  if (gameState === "gameover" || gameState === "clear") {
    if (pointInRect(p, retryButtonRect())) {
      resetGame();
    } else if (pointInRect(p, titleButtonRect())) {
      setGameState("title");
      setClockUp(false);
    }
    return;
  }

  if (gameState !== "playing") return;

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
  if (gameState !== "playing") return;
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

function terrainHeightAt(screenX) {
  const x = screenX + worldOffset;
  return 454
    + Math.sin(x * 0.0105) * 19
    + Math.sin(x * 0.025 + 1.3) * 10
    + Math.sin(x * 0.0042 + 2.1) * 14;
}

function firePlayerBullet() {
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
  const speed = clockUp ? 1040 : 710;

  bullets.push({
    x: sx,
    y: sy,
    vx: nx * speed,
    vy: ny * speed,
    r: clockUp ? 5.2 : 4.4,
    trailClock: 0,
  });

  muzzleBurst(sx, sy, player.angle, clockUp ? 5 : 3);
}

function muzzleBurst(x, y, angle, count) {
  for (let i = 0; i < count; i++) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 0.7;
    const s = Math.random() * 90 + 30;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.16 + Math.random() * 0.12,
      maxLife: 0.28,
      size: 1.5 + Math.random() * 2.5,
      color: "orange",
    });
  }
}

function spawnEnemy(extraX = 0) {
  if (regularKills >= REGULAR_KILLS_TO_BOSS || bossSpawned) return;
  if (enemies.length >= 7) return;

  const y = 80 + Math.random() * 280;
  enemies.push({
    x: W + 45 + extraX,
    y,
    baseY: y,
    r: 20 + Math.random() * 5,
    speed: 68 + Math.random() * 55,
    phase: Math.random() * TAU,
    wobble: 12 + Math.random() * 26,
    fireCooldown: 0.7 + Math.random() * 1.8,
  });
}

function spawnBoss() {
  if (bossSpawned) return;
  bossSpawned = true;
  boss = {
    x: W + 100,
    y: 210,
    radius: 34,
    hp: 80,
    maxHp: 80,
    angle: Math.PI,
    phase: 0,
    fireCooldown: 1.0,
    burstShots: 0,
    burstCooldown: 0,
  };
  bannerText = "WARNING - ENEMY ACE";
  bannerTimer = 2.2;
}

function spawnHealItem(x = W + 40, y = 180 + Math.random() * 170) {
  items.push({
    type: "heal",
    x,
    y,
    radius: 18,
    phase: Math.random() * TAU,
    speed: 72,
  });
}

function fireEnemyBullet(x, y, targetX, targetY, speed = 300, spread = 0) {
  let angle = Math.atan2(targetY - y, targetX - x);
  angle += spread;

  enemyBullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 5,
    trailClock: 0,
  });
}

function explode(x, y, count = 18, color = "orange") {
  for (let i = 0; i < count; i++) {
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
      color,
    });
  }
}

function damagePlayer(amount) {
  if (player.invincible > 0 || gameState !== "playing") return;

  player.hp = Math.max(0, player.hp - amount);
  player.invincible = 0.72;
  explode(player.x, player.y, 12, "red");

  if (player.hp <= 0) {
    explode(player.x, player.y, 34, "red");
    setGameState("gameover");
  }
}

function healPlayer(amount) {
  player.hp = Math.min(player.maxHp, player.hp + amount);
  bannerText = "REPAIR +" + amount;
  bannerTimer = 0.9;
  explode(player.x, player.y, 12, "green");
}

function onRegularEnemyDestroyed(e) {
  regularKills += 1;
  score += 100;
  explode(e.x, e.y, 18, "orange");

  if (regularKills % HEAL_EVERY_KILLS === 0) {
    spawnHealItem(e.x, e.y);
  }

  if (regularKills >= REGULAR_KILLS_TO_BOSS) {
    spawnBoss();
  }
}

function updatePlaying(dt) {
  const timeScale = clockUp ? 1.18 : 1;
  const worldDt = dt * timeScale;
  worldOffset += (clockUp ? 84 : 58) * dt;

  if (bannerTimer > 0) bannerTimer -= dt;
  if (player.invincible > 0) player.invincible -= dt;

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

  const pSpeed = player.speed * (clockUp ? 1.48 : 1);
  player.x += mx * pSpeed * dt;
  player.y += my * pSpeed * dt;

  player.x = Math.max(54, Math.min(W * 0.55, player.x));
  const groundY = terrainHeightAt(player.x);
  player.y = Math.max(52, Math.min(groundY - player.radius - 9, player.y));

  player.angle = Math.atan2(aimY - player.y, aimX - player.x);

  fireCooldown -= dt;
  if (fireHeld && fireCooldown <= 0) {
    firePlayerBullet();
    fireCooldown = clockUp ? 0.043 : 0.125;
  }

  for (const star of stars) {
    star.x -= star.s * worldDt;
    if (star.x < -4) {
      star.x = W + 4;
      star.y = Math.random() * H;
    }
  }

  updatePlayerBullets(dt);
  updateEnemyBullets(dt);
  updateTrails(dt);

  if (!bossSpawned) {
    spawnCooldown -= worldDt;
    if (spawnCooldown <= 0) {
      spawnEnemy();
      spawnCooldown = 0.78 + Math.random() * 0.85;
    }
  }

  updateEnemies(worldDt);
  updateBoss(dt, worldDt);
  updateItems(dt, worldDt);
  updateParticles(dt);
}

function updatePlayerBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];

    b.trailClock -= dt;
    if (b.trailClock <= 0) {
      trailDots.push({
        x: b.x,
        y: b.y,
        life: clockUp ? 0.82 : 0.66,
        maxLife: clockUp ? 0.82 : 0.66,
        size: clockUp ? 3.2 : 2.7,
        color: "player",
      });
      b.trailClock = clockUp ? 0.022 : 0.032;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    let hit = false;

    if (boss) {
      const dx = b.x - boss.x;
      const dy = b.y - boss.y;
      const rr = b.r + boss.radius;
      if (dx * dx + dy * dy < rr * rr) {
        boss.hp -= 1;
        score += 20;
        explode(b.x, b.y, 4, "orange");
        hit = true;

        if (boss.hp <= 0) {
          explode(boss.x, boss.y, 50, "orange");
          boss = null;
          score += 3000;
          setGameState("clear");
        }
      }
    }

    if (!hit) {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        const rr = b.r + e.r;

        if (dx * dx + dy * dy < rr * rr) {
          enemies.splice(j, 1);
          onRegularEnemyDestroyed(e);
          hit = true;
          break;
        }
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
}

function updateEnemyBullets(dt) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];

    b.trailClock -= dt;
    if (b.trailClock <= 0) {
      trailDots.push({
        x: b.x,
        y: b.y,
        life: 0.62,
        maxLife: 0.62,
        size: 2.8,
        color: "enemy",
      });
      b.trailClock = 0.035;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    const dx = b.x - player.x;
    const dy = b.y - player.y;
    const rr = b.r + player.radius;

    if (dx * dx + dy * dy < rr * rr) {
      enemyBullets.splice(i, 1);
      damagePlayer(10);
      continue;
    }

    if (
      b.x < -70 ||
      b.x > W + 70 ||
      b.y < -70 ||
      b.y > H + 70
    ) {
      enemyBullets.splice(i, 1);
    }
  }
}

function updateTrails(dt) {
  for (let i = trailDots.length - 1; i >= 0; i--) {
    trailDots[i].life -= dt;
    if (trailDots[i].life <= 0) trailDots.splice(i, 1);
  }

  if (trailDots.length > 3200) {
    trailDots.splice(0, trailDots.length - 3200);
  }
}

function updateEnemies(worldDt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.x -= e.speed * worldDt;
    e.phase += worldDt * 2.2;
    e.y = e.baseY + Math.sin(e.phase) * e.wobble;

    const groundY = terrainHeightAt(e.x);
    if (e.y > groundY - 38) e.y = groundY - 38;

    e.fireCooldown -= worldDt;
    if (e.fireCooldown <= 0 && e.x < W - 30 && e.x > player.x + 100) {
      fireEnemyBullet(e.x - 15, e.y, player.x, player.y, 260 + Math.random() * 45);
      e.fireCooldown = 1.5 + Math.random() * 1.8;
    }

    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const rr = e.r + player.radius;

    if (dx * dx + dy * dy < rr * rr) {
      enemies.splice(i, 1);
      damagePlayer(18);
      explode(e.x, e.y, 12, "red");
      continue;
    }

    if (e.x < -60) enemies.splice(i, 1);
  }
}

function updateBoss(dt, worldDt) {
  if (!boss) return;

  if (boss.x > W - 155) {
    boss.x -= 105 * worldDt;
  }

  boss.phase += worldDt;
  boss.y = 215 + Math.sin(boss.phase * 1.35) * 112;
  const bossGround = terrainHeightAt(boss.x);
  boss.y = Math.min(boss.y, bossGround - 58);
  boss.angle = Math.atan2(player.y - boss.y, player.x - boss.x);

  boss.fireCooldown -= dt;
  boss.burstCooldown -= dt;

  if (boss.fireCooldown <= 0 && boss.burstShots <= 0) {
    boss.burstShots = 4;
    boss.burstCooldown = 0;
    boss.fireCooldown = 1.35;
  }

  if (boss.burstShots > 0 && boss.burstCooldown <= 0) {
    const spread = (Math.random() - 0.5) * 0.12;
    fireEnemyBullet(boss.x - 28, boss.y - 12, player.x, player.y, 390, spread);
    boss.burstShots -= 1;
    boss.burstCooldown = 0.11;
  }

  const dx = boss.x - player.x;
  const dy = boss.y - player.y;
  const rr = boss.radius + player.radius;

  if (dx * dx + dy * dy < rr * rr) {
    damagePlayer(24);
  }
}

function updateItems(dt, worldDt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    item.phase += dt * 3;
    item.x -= item.speed * worldDt;

    const dx = item.x - player.x;
    const dy = item.y - player.y;
    const rr = item.radius + player.radius;

    if (dx * dx + dy * dy < rr * rr) {
      healPlayer(30);
      items.splice(i, 1);
      continue;
    }

    if (item.x < -50) items.splice(i, 1);
  }
}

function updateParticles(dt) {
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

function update(dt) {
  if (gameState === "playing") {
    updatePlaying(dt);
  } else {
    for (const star of stars) {
      star.x -= star.s * dt * 0.45;
      if (star.x < -4) {
        star.x = W + 4;
        star.y = Math.random() * H;
      }
    }
    worldOffset += 16 * dt;
    updateTrails(dt);
    updateParticles(dt);
  }
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#050c18");
  g.addColorStop(0.58, "#102033");
  g.addColorStop(1, "#161a1d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.82;
  for (const star of stars) {
    ctx.fillStyle = "#b8d8ff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(210,224,232,.12)";
  ctx.beginPath();
  ctx.arc(770, 110, 66, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "rgba(11,20,31,.42)";
  ctx.beginPath();
  ctx.arc(792, 92, 54, 0, TAU);
  ctx.fill();

  drawTerrain();
}

function drawTerrain() {
  const points = [];
  for (let x = -12; x <= W + 12; x += 12) {
    points.push({ x, y: terrainHeightAt(x) });
  }

  const grad = ctx.createLinearGradient(0, 390, 0, H);
  grad.addColorStop(0, "#6c6b63");
  grad.addColorStop(0.25, "#484943");
  grad.addColorStop(1, "#242823");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(points[0].x, H);
  ctx.lineTo(points[0].x, points[0].y);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(W + 12, H);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#9a9b91";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(20,22,20,.36)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const x = ((i * 143 - worldOffset * 0.7) % (W + 180)) - 40;
    const y = terrainHeightAt(x) + 22 + (i % 3) * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, 22 + (i % 4) * 5, 7 + (i % 2) * 3, -0.1, Math.PI, TAU);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(195,196,185,.28)";
  for (let i = 0; i < 12; i++) {
    const x = ((i * 91 - worldOffset * 1.1) % (W + 120)) - 30;
    const y = terrainHeightAt(x) + 8;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 3), 0, TAU);
    ctx.fill();
  }
}

function drawTrailDots() {
  for (const t of trailDots) {
    const a = Math.max(0, t.life / t.maxLife);
    ctx.fillStyle = t.color === "enemy"
      ? `rgba(255,92,72,${0.18 + a * 0.78})`
      : `rgba(248,214,112,${0.15 + a * 0.82})`;

    ctx.beginPath();
    ctx.arc(t.x, t.y, t.size * (0.65 + a * 0.45), 0, TAU);
    ctx.fill();
  }
}

function drawPlayerBullets() {
  for (const b of bullets) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));

    ctx.fillStyle = clockUp ? "#fff4c4" : "#ffe58a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, b.r, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = clockUp ? "rgba(255,119,38,.95)" : "rgba(255,165,58,.75)";
    ctx.beginPath();
    ctx.moveTo(-7, -b.r * 0.7);
    ctx.lineTo(-17 - Math.random() * 8, 0);
    ctx.lineTo(-7, b.r * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

function drawEnemyBullets() {
  for (const b of enemyBullets) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));

    ctx.fillStyle = "#ff7668";
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, b.r, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(255,52,34,.7)";
    ctx.beginPath();
    ctx.moveTo(-7, -3);
    ctx.lineTo(-18, 0);
    ctx.lineTo(-7, 3);
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

function drawBoss() {
  if (!boss) return;

  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.rotate(boss.angle);

  ctx.fillStyle = "#492b31";
  ctx.strokeStyle = "#ff9284";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.roundRect(-30, -25, 58, 50, 9);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#713b3d";
  ctx.fillRect(-20, 22, 18, 22);
  ctx.fillRect(5, 22, 18, 22);

  ctx.fillStyle = "#ffb5a8";
  ctx.beginPath();
  ctx.arc(-12, -4, 7, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#53323a";
  ctx.beginPath();
  ctx.roundRect(-40, -37, 52, 12, 5);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawPlayer() {
  if (gameState === "title") return;
  if (player.invincible > 0 && Math.floor(player.invincible * 18) % 2 === 0) return;

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

  ctx.fillStyle = clockUp ? "#ff8b3d" : "#78b8df";
  ctx.beginPath();
  ctx.arc(-21, 0, 5, 0, TAU);
  ctx.fill();

  ctx.restore();

  if (clockUp) {
    ctx.fillStyle = "rgba(255,105,28,.26)";
    ctx.beginPath();
    ctx.moveTo(player.x - nx * 28 + px * 10, player.y - ny * 28 + py * 10);
    ctx.lineTo(player.x - nx * (62 + Math.random() * 20), player.y - ny * (62 + Math.random() * 20));
    ctx.lineTo(player.x - nx * 28 - px * 10, player.y - ny * 28 - py * 10);
    ctx.closePath();
    ctx.fill();
  }
}

function drawItems() {
  for (const item of items) {
    const bobY = item.y + Math.sin(item.phase) * 6;

    ctx.save();
    ctx.translate(item.x, bobY);

    ctx.fillStyle = "rgba(65,255,155,.16)";
    ctx.beginPath();
    ctx.arc(0, 0, item.radius + 8, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#43d98c";
    ctx.strokeStyle = "#c7ffe4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-15, -15, 30, 30, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#effff6";
    ctx.fillRect(-4, -10, 8, 20);
    ctx.fillRect(-10, -4, 20, 8);

    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    const color = p.color === "green"
      ? `rgba(79,255,157,${a})`
      : p.color === "red"
      ? `rgba(255,82,65,${a})`
      : `rgba(255,151,69,${a})`;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + a), 0, TAU);
    ctx.fill();
  }
}

function drawTouchUi() {
  if (gameState !== "playing") return;

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

function drawHpBar(x, y, w, h, value, max, fg) {
  const ratio = Math.max(0, Math.min(1, value / max));

  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = fg;
  ctx.fillRect(x + 2, y + 2, (w - 4) * ratio, h - 4);

  ctx.strokeStyle = "rgba(255,255,255,.52)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawHud() {
  if (gameState !== "playing") return;

  ctx.fillStyle = "rgba(5,10,18,.66)";
  ctx.fillRect(14, 14, 240, 88);

  ctx.fillStyle = "#dbe9f4";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillText("TRAIL CANNON", 27, 38);

  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = clockUp ? "#ffb067" : "#8fc8e8";
  ctx.fillText(clockUp ? "CLOCK UP" : "CLOCK NORMAL", 27, 59);

  ctx.fillStyle = "#eef5fa";
  ctx.fillText("HP", 27, 84);
  drawHpBar(54, 72, 180, 14, player.hp, player.maxHp, player.hp > 30 ? "#48d689" : "#ff604f");

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(String(score).padStart(6, "0"), W - 145, 76);

  ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillStyle = "#d7e4ec";
  ctx.fillText("TARGET " + Math.min(regularKills, REGULAR_KILLS_TO_BOSS) + " / " + REGULAR_KILLS_TO_BOSS, W - 190, 101);

  if (boss) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd1ca";
    ctx.font = "800 13px system-ui, sans-serif";
    ctx.fillText("ENEMY ACE", W / 2, 29);
    drawHpBar(W / 2 - 180, 38, 360, 14, boss.hp, boss.maxHp, "#e45348");
    ctx.textAlign = "left";
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(220,235,245,.72)";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.fillText("左側ドラッグ: 移動　右側長押し: 照準＋連射", W / 2, H - 16);
  ctx.textAlign = "left";

  if (bannerTimer > 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,.48)";
    ctx.fillRect(W / 2 - 220, 120, 440, 58);
    ctx.fillStyle = bannerText.startsWith("WARNING") ? "#ff8875" : "#f3f7fa";
    ctx.font = "800 25px system-ui, sans-serif";
    ctx.fillText(bannerText, W / 2, 157);
    ctx.textAlign = "left";
  }
}

function drawButton(rect, label, primary = true) {
  ctx.fillStyle = primary ? "rgba(73,137,178,.82)" : "rgba(20,32,44,.78)";
  ctx.strokeStyle = primary ? "#c3e9ff" : "rgba(220,235,245,.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = primary ? "800 25px system-ui, sans-serif" : "700 17px system-ui, sans-serif";
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

function drawTitle() {
  ctx.fillStyle = "rgba(2,7,14,.36)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";

  ctx.fillStyle = "#dff2ff";
  ctx.font = "900 62px system-ui, sans-serif";
  ctx.fillText("TRAIL CANNON", W / 2, 175);

  ctx.fillStyle = "#ffcc78";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillText("DOTTED TRAJECTORY ACTION SHOOTER", W / 2, 212);

  ctx.fillStyle = "rgba(224,237,245,.82)";
  ctx.font = "600 17px system-ui, sans-serif";
  ctx.fillText("無限連射する肩キャノンで、空間に軌跡を描け。", W / 2, 267);

  ctx.fillStyle = "#91b9d2";
  ctx.font = "700 15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(VERSION, W / 2, 310);

  ctx.textAlign = "left";
  drawButton(startButtonRect(), "START");
}

function drawEndScreen(clear) {
  ctx.fillStyle = "rgba(2,5,10,.66)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = clear ? "#a7ffd0" : "#ff8d7e";
  ctx.font = "900 58px system-ui, sans-serif";
  ctx.fillText(clear ? "STAGE CLEAR" : "GAME OVER", W / 2, 190);

  ctx.fillStyle = "#e5eef5";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText("SCORE  " + String(score).padStart(6, "0"), W / 2, 246);

  if (clear) {
    ctx.fillStyle = "#b9cfdd";
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText("ENEMY ACE DESTROYED", W / 2, 282);
  }

  ctx.textAlign = "left";
  drawButton(retryButtonRect(), "RETRY");
  drawButton(titleButtonRect(), "TITLE", false);
}

function render() {
  drawBackground();
  drawTrailDots();
  drawItems();

  for (const e of enemies) drawEnemy(e);

  drawBoss();
  drawParticles();
  drawPlayerBullets();
  drawEnemyBullets();

  if (gameState !== "title") drawPlayer();

  drawTouchUi();
  drawHud();

  if (gameState === "title") drawTitle();
  if (gameState === "gameover") drawEndScreen(false);
  if (gameState === "clear") drawEndScreen(true);
}

function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 1 / 30);

  update(dt);
  render();
  requestAnimationFrame(loop);
}

setGameState("title");
requestAnimationFrame(loop);
