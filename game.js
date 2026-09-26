"use strict";

const VERSION = "v0.3.0";
const W = 960;
const H = 540;
const TAU = Math.PI * 2;
const HEAL_EVERY_KILLS = 6;
const BOMB_RADIUS = 230;
const BOMB_MAX = 3;

const STAGES = [
  {
    number: 1,
    targetKills: 20,
    maxEnemies: 7,
    spawnMin: 0.76,
    spawnJitter: 0.82,
    scrollSpeed: 58,
    enemyBulletSpeed: 270,
    bossHp: 90,
    bossBurst: 4,
    bossShotSpeed: 390,
    bossFireInterval: 1.35,
    enemyWeights: { ufo: 0.56, jet: 0.29, robot: 0.15 },
    skyTop: "#050c18",
    skyMid: "#102033",
    groundTop: "#6c6b63",
    groundBottom: "#242823",
    planet: "rgba(210,224,232,.12)"
  },
  {
    number: 2,
    targetKills: 28,
    maxEnemies: 9,
    spawnMin: 0.55,
    spawnJitter: 0.65,
    scrollSpeed: 72,
    enemyBulletSpeed: 320,
    bossHp: 140,
    bossBurst: 6,
    bossShotSpeed: 455,
    bossFireInterval: 1.05,
    enemyWeights: { ufo: 0.30, jet: 0.36, robot: 0.34 },
    skyTop: "#130813",
    skyMid: "#27172c",
    groundTop: "#6b5c5d",
    groundBottom: "#282024",
    planet: "rgba(255,190,172,.12)"
  }
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const actionButtons = document.getElementById("actionButtons");
const clockButton = document.getElementById("clockButton");
const bombButton = document.getElementById("bombButton");

function roundedRectPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

const keys = new Set();
const bullets = [];
const enemyBullets = [];
const trailDots = [];
const enemies = [];
const items = [];
const particles = [];
const shockwaves = [];

const stars = Array.from({ length: 110 }, function () {
  return {
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.8 + 0.4,
    s: Math.random() * 24 + 8
  };
});

const player = {
  x: 160,
  y: H * 0.48,
  radius: 25,
  angle: 0,
  speed: 245,
  maxHp: 100,
  hp: 100,
  invincible: 0,
  bombs: 2
};

let gameState = "title";
let stageIndex = 0;
let stageKills = 0;
let clockUp = false;
let score = 0;
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
let stageClearTimer = 0;
let bombFlash = 0;

let movePointerId = null;
let firePointerId = null;
let moveOrigin = null;
let moveCurrent = null;
const joystick = { x: 0, y: 0 };

function stage() {
  return STAGES[Math.min(stageIndex, STAGES.length - 1)];
}

function setClockUp(value) {
  clockUp = value;
  clockButton.textContent = clockUp ? "CLOCK UP ON" : "CLOCK UP";
  clockButton.classList.toggle("clock-up", clockUp);
}

function toggleClockUp() {
  if (gameState !== "playing") return;
  setClockUp(!clockUp);
}

function updateBombButton() {
  bombButton.textContent = "BOMB × " + player.bombs;
  bombButton.disabled = player.bombs <= 0 || gameState !== "playing";
}

function setGameState(next) {
  gameState = next;
  const playing = next === "playing";
  actionButtons.style.display = playing ? "flex" : "none";
  updateBombButton();

  if (!playing) {
    fireHeld = false;
    movePointerId = null;
    firePointerId = null;
    moveOrigin = null;
    moveCurrent = null;
    joystick.x = 0;
    joystick.y = 0;
  }
}

function clearCombatObjects() {
  bullets.length = 0;
  enemyBullets.length = 0;
  trailDots.length = 0;
  enemies.length = 0;
  items.length = 0;
  particles.length = 0;
  shockwaves.length = 0;
  boss = null;
  bossSpawned = false;
}

function beginStage(index, freshGame) {
  stageIndex = index;
  clearCombatObjects();
  stageKills = 0;
  fireCooldown = 0;
  spawnCooldown = 0.42;
  worldOffset = index * 700;
  stageClearTimer = 0;

  player.x = 160;
  player.y = H * 0.47;
  player.angle = 0;
  player.invincible = 1.0;
  player.bombs = 2;

  if (freshGame) {
    player.hp = player.maxHp;
  } else {
    player.hp = Math.min(player.maxHp, player.hp + 25);
  }

  bannerText = "STAGE " + (stageIndex + 1);
  bannerTimer = 1.8;
  setClockUp(false);
  setGameState("playing");

  for (let i = 0; i < 3; i += 1) {
    spawnEnemy(140 + i * 190);
  }
  updateBombButton();
}

function resetGame() {
  score = 0;
  beginStage(0, true);
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

clockButton.addEventListener("pointerdown", function (e) {
  e.preventDefault();
  e.stopPropagation();
  toggleClockUp();
});

bombButton.addEventListener("pointerdown", function (e) {
  e.preventDefault();
  e.stopPropagation();
  useBomb();
});

window.addEventListener("keydown", function (e) {
  keys.add(e.code);

  if (gameState === "title" && (e.code === "Enter" || e.code === "Space")) {
    e.preventDefault();
    if (!e.repeat) resetGame();
    return;
  }

  if ((gameState === "gameover" || gameState === "complete") && e.code === "Enter") {
    e.preventDefault();
    if (!e.repeat) resetGame();
    return;
  }

  if (gameState === "playing") {
    if (e.code === "Space" || e.code === "KeyO") {
      e.preventDefault();
      if (!e.repeat) toggleClockUp();
    }
    if (e.code === "KeyB" || e.code === "KeyX") {
      e.preventDefault();
      if (!e.repeat) useBomb();
    }
  }
});

window.addEventListener("keyup", function (e) {
  keys.delete(e.code);
});

function getCanvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const scale = Math.min(r.width / W, r.height / H);
  const drawnW = W * scale;
  const drawnH = H * scale;
  const offsetX = r.left + (r.width - drawnW) * 0.5;
  const offsetY = r.top + (r.height - drawnH) * 0.5;

  return {
    x: (e.clientX - offsetX) / scale,
    y: (e.clientY - offsetY) / scale
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

canvas.addEventListener("pointerdown", function (e) {
  e.preventDefault();
  const p = getCanvasPos(e);

  if (gameState === "title") {
    if (pointInRect(p, startButtonRect())) resetGame();
    return;
  }

  if (gameState === "gameover" || gameState === "complete") {
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

canvas.addEventListener("pointermove", function (e) {
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
canvas.addEventListener("contextmenu", function (e) {
  e.preventDefault();
});

function terrainHeightAt(screenX) {
  const x = screenX + worldOffset;
  const stageBump = stageIndex === 0 ? 0 : 4;
  return 454 + stageBump
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

  const shoulderX = player.x + nx * 24;
  const shoulderY = player.y - 24 + ny * 24;
  const speed = clockUp ? 1040 : 710;

  bullets.push({
    x: shoulderX,
    y: shoulderY,
    vx: nx * speed,
    vy: ny * speed,
    r: clockUp ? 5.2 : 4.4,
    trailClock: 0,
    damage: 1
  });

  muzzleBurst(shoulderX, shoulderY, player.angle, clockUp ? 5 : 3);
}

function muzzleBurst(x, y, angle, count) {
  for (let i = 0; i < count; i += 1) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 0.7;
    const s = Math.random() * 90 + 30;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.16 + Math.random() * 0.12,
      maxLife: 0.28,
      size: 1.5 + Math.random() * 2.5,
      color: "orange"
    });
  }
}

function chooseEnemyType() {
  const w = stage().enemyWeights;
  const r = Math.random();
  if (r < w.ufo) return "ufo";
  if (r < w.ufo + w.jet) return "jet";
  return "robot";
}

function spawnEnemy(extraX) {
  if (typeof extraX !== "number") extraX = 0;
  if (stageKills >= stage().targetKills || bossSpawned) return;
  if (enemies.length >= stage().maxEnemies) return;

  const type = chooseEnemyType();
  const y = 78 + Math.random() * 285;
  let enemy;

  if (type === "jet") {
    enemy = {
      type: "jet",
      x: W + 55 + extraX,
      y: y,
      baseY: y,
      r: 19,
      hp: 1,
      maxHp: 1,
      speed: 185 + Math.random() * 65 + stageIndex * 20,
      phase: Math.random() * TAU,
      wobble: 8 + Math.random() * 15,
      fireCooldown: 0.65 + Math.random() * 1.0
    };
  } else if (type === "robot") {
    enemy = {
      type: "robot",
      x: W + 55 + extraX,
      y: y,
      baseY: y,
      r: 25,
      hp: stageIndex === 0 ? 2 : 3,
      maxHp: stageIndex === 0 ? 2 : 3,
      speed: 58 + Math.random() * 30 + stageIndex * 10,
      phase: Math.random() * TAU,
      wobble: 10 + Math.random() * 15,
      fireCooldown: 0.55 + Math.random() * 1.05
    };
  } else {
    enemy = {
      type: "ufo",
      x: W + 55 + extraX,
      y: y,
      baseY: y,
      r: 22,
      hp: 1,
      maxHp: 1,
      speed: 72 + Math.random() * 52 + stageIndex * 10,
      phase: Math.random() * TAU,
      wobble: 18 + Math.random() * 25,
      fireCooldown: 0.8 + Math.random() * 1.5
    };
  }

  enemies.push(enemy);
}

function spawnBoss() {
  if (bossSpawned) return;
  bossSpawned = true;
  enemies.length = 0;
  enemyBullets.length = 0;

  player.bombs = Math.min(BOMB_MAX, player.bombs + 1);
  updateBombButton();

  boss = {
    x: W + 110,
    y: 215,
    radius: 38,
    hp: stage().bossHp,
    maxHp: stage().bossHp,
    angle: Math.PI,
    phase: 0,
    fireCooldown: 0.8,
    burstShots: 0,
    burstCooldown: 0
  };

  bannerText = stageIndex === 0 ? "WARNING - ENEMY ACE" : "WARNING - HEAVY ACE";
  bannerTimer = 2.2;
}

function spawnHealItem(x, y) {
  if (typeof x !== "number") x = W + 40;
  if (typeof y !== "number") y = 180 + Math.random() * 170;

  items.push({
    type: "heal",
    x: x,
    y: y,
    radius: 18,
    phase: Math.random() * TAU,
    speed: 72
  });
}

function fireEnemyBullet(x, y, targetX, targetY, speed, spread) {
  if (typeof speed !== "number") speed = 300;
  if (typeof spread !== "number") spread = 0;

  let angle = Math.atan2(targetY - y, targetX - x);
  angle += spread;

  enemyBullets.push({
    x: x,
    y: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 5,
    trailClock: 0
  });
}

function explode(x, y, count, color) {
  if (typeof count !== "number") count = 18;
  if (!color) color = "orange";

  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * TAU;
    const s = 45 + Math.random() * 210;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.35 + Math.random() * 0.45,
      maxLife: 0.8,
      size: 1.5 + Math.random() * 4.5,
      color: color
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
  stageKills += 1;
  score += e.type === "robot" ? 180 : e.type === "jet" ? 140 : 100;
  explode(e.x, e.y, e.type === "robot" ? 24 : 18, "orange");

  if (stageKills % HEAL_EVERY_KILLS === 0) {
    spawnHealItem(e.x, e.y);
  }

  if (stageKills >= stage().targetKills) {
    spawnBoss();
  }
}

function useBomb() {
  if (gameState !== "playing" || player.bombs <= 0) return;

  player.bombs -= 1;
  player.invincible = Math.max(player.invincible, 0.9);
  bombFlash = 0.18;
  updateBombButton();

  shockwaves.push({
    x: player.x,
    y: player.y,
    life: 0.52,
    maxLife: 0.52,
    radius: 0
  });

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const b = enemyBullets[i];
    if (Math.hypot(b.x - player.x, b.y - player.y) <= BOMB_RADIUS) {
      explode(b.x, b.y, 3, "cyan");
      enemyBullets.splice(i, 1);
      score += 5;
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const e = enemies[i];
    if (Math.hypot(e.x - player.x, e.y - player.y) <= BOMB_RADIUS) {
      e.hp -= e.type === "robot" ? 2 : 99;
      if (e.hp <= 0) {
        enemies.splice(i, 1);
        onRegularEnemyDestroyed(e);
        if (bossSpawned) break;
      } else {
        explode(e.x, e.y, 8, "cyan");
      }
    }
  }

  if (boss && Math.hypot(boss.x - player.x, boss.y - player.y) <= BOMB_RADIUS) {
    boss.hp -= 10;
    explode(boss.x, boss.y, 14, "cyan");
    if (boss.hp <= 0) finishBoss();
  }
}

function finishBoss() {
  if (!boss) return;

  explode(boss.x, boss.y, 56, "orange");
  boss = null;
  enemyBullets.length = 0;
  score += 3000 + stageIndex * 1500;

  if (stageIndex < STAGES.length - 1) {
    stageClearTimer = 2.6;
    setGameState("stageclear");
  } else {
    setGameState("complete");
  }
}

function updatePlaying(dt) {
  const timeScale = clockUp ? 1.18 : 1;
  const worldDt = dt * timeScale;
  worldOffset += (clockUp ? stage().scrollSpeed * 1.45 : stage().scrollSpeed) * dt;

  if (bannerTimer > 0) bannerTimer -= dt;
  if (player.invincible > 0) player.invincible -= dt;
  if (bombFlash > 0) bombFlash -= dt;

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

  player.x = Math.max(56, Math.min(W * 0.56, player.x));
  const groundY = terrainHeightAt(player.x);
  player.y = Math.max(58, Math.min(groundY - player.radius - 10, player.y));
  player.angle = Math.atan2(aimY - (player.y - 24), aimX - player.x);

  fireCooldown -= dt;
  if (fireHeld && fireCooldown <= 0) {
    firePlayerBullet();
    fireCooldown = clockUp ? 0.043 : 0.125;
  }

  updateStars(worldDt);
  updatePlayerBullets(dt);
  updateEnemyBullets(dt);
  updateTrails(dt);

  if (!bossSpawned) {
    spawnCooldown -= worldDt;
    if (spawnCooldown <= 0) {
      spawnEnemy();
      spawnCooldown = stage().spawnMin + Math.random() * stage().spawnJitter;
    }
  }

  updateEnemies(worldDt);
  updateBoss(dt, worldDt);
  updateItems(dt, worldDt);
  updateParticles(dt);
  updateShockwaves(dt);
}

function updateStars(dt) {
  for (let i = 0; i < stars.length; i += 1) {
    const starDot = stars[i];
    starDot.x -= starDot.s * dt;
    if (starDot.x < -4) {
      starDot.x = W + 4;
      starDot.y = Math.random() * H;
    }
  }
}

function updatePlayerBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];

    b.trailClock -= dt;
    if (b.trailClock <= 0) {
      trailDots.push({
        x: b.x,
        y: b.y,
        life: clockUp ? 0.82 : 0.66,
        maxLife: clockUp ? 0.82 : 0.66,
        size: clockUp ? 3.2 : 2.7,
        color: "player"
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
        boss.hp -= b.damage;
        score += 20;
        explode(b.x, b.y, 4, "orange");
        hit = true;

        if (boss.hp <= 0) {
          finishBoss();
        }
      }
    }

    if (!hit) {
      for (let j = enemies.length - 1; j >= 0; j -= 1) {
        const e = enemies[j];
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        const rr = b.r + e.r;

        if (dx * dx + dy * dy < rr * rr) {
          e.hp -= b.damage;
          explode(b.x, b.y, 4, "orange");
          hit = true;

          if (e.hp <= 0) {
            enemies.splice(j, 1);
            onRegularEnemyDestroyed(e);
          }
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
  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const b = enemyBullets[i];

    b.trailClock -= dt;
    if (b.trailClock <= 0) {
      trailDots.push({
        x: b.x,
        y: b.y,
        life: 0.62,
        maxLife: 0.62,
        size: 2.8,
        color: "enemy"
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
      damagePlayer(10 + stageIndex * 2);
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
  for (let i = trailDots.length - 1; i >= 0; i -= 1) {
    trailDots[i].life -= dt;
    if (trailDots[i].life <= 0) trailDots.splice(i, 1);
  }

  if (trailDots.length > 3400) {
    trailDots.splice(0, trailDots.length - 3400);
  }
}

function updateEnemies(worldDt) {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const e = enemies[i];

    if (e.type === "jet") {
      e.x -= e.speed * worldDt;
      e.phase += worldDt * 5.0;
      e.y = e.baseY + Math.sin(e.phase) * e.wobble;
    } else if (e.type === "robot") {
      e.x -= e.speed * worldDt;
      e.phase += worldDt * 1.7;
      e.y = e.baseY + Math.sin(e.phase) * e.wobble;
    } else {
      e.x -= e.speed * worldDt;
      e.phase += worldDt * 2.2;
      e.y = e.baseY + Math.sin(e.phase) * e.wobble;
    }

    const groundY = terrainHeightAt(e.x);
    if (e.y > groundY - 42) e.y = groundY - 42;

    e.fireCooldown -= worldDt;

    if (e.x < W - 30 && e.x > player.x + 90 && e.fireCooldown <= 0) {
      if (e.type === "jet") {
        if (stageIndex > 0 || Math.random() < 0.55) {
          fireEnemyBullet(e.x - 16, e.y, player.x, player.y, stage().enemyBulletSpeed + 35, 0);
        }
        e.fireCooldown = 1.7 + Math.random() * 1.1;
      } else if (e.type === "robot") {
        fireEnemyBullet(e.x - 18, e.y - 18, player.x, player.y, stage().enemyBulletSpeed + 40, -0.035);
        fireEnemyBullet(e.x - 18, e.y - 18, player.x, player.y, stage().enemyBulletSpeed + 40, 0.035);
        e.fireCooldown = 1.2 + Math.random() * 1.15;
      } else {
        fireEnemyBullet(e.x - 15, e.y, player.x, player.y, stage().enemyBulletSpeed, 0);
        e.fireCooldown = 1.45 + Math.random() * 1.55;
      }
    }

    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const rr = e.r + player.radius;

    if (dx * dx + dy * dy < rr * rr) {
      enemies.splice(i, 1);
      damagePlayer(e.type === "robot" ? 22 : 18);
      explode(e.x, e.y, 12, "red");
      continue;
    }

    if (e.x < -70) {
      enemies.splice(i, 1);
    }
  }
}

function updateBoss(dt, worldDt) {
  if (!boss) return;

  if (boss.x > W - 155) {
    boss.x -= 105 * worldDt;
  }

  boss.phase += worldDt;
  boss.y = 215 + Math.sin(boss.phase * (stageIndex === 0 ? 1.35 : 1.65)) * 112;
  const bossGround = terrainHeightAt(boss.x);
  boss.y = Math.min(boss.y, bossGround - 62);
  boss.angle = Math.atan2(player.y - boss.y, player.x - boss.x);

  boss.fireCooldown -= dt;
  boss.burstCooldown -= dt;

  if (boss.fireCooldown <= 0 && boss.burstShots <= 0) {
    boss.burstShots = stage().bossBurst;
    boss.burstCooldown = 0;
    boss.fireCooldown = stage().bossFireInterval;
  }

  if (boss.burstShots > 0 && boss.burstCooldown <= 0) {
    const spreadBase = stageIndex === 0 ? 0.12 : 0.22;
    const spread = (Math.random() - 0.5) * spreadBase;
    fireEnemyBullet(boss.x - 30, boss.y - 20, player.x, player.y, stage().bossShotSpeed, spread);
    boss.burstShots -= 1;
    boss.burstCooldown = stageIndex === 0 ? 0.11 : 0.085;
  }

  if (stageIndex > 0 && Math.floor(boss.phase * 2) % 9 === 0 && boss.burstShots === 0 && Math.random() < 0.025) {
    for (let n = -2; n <= 2; n += 1) {
      fireEnemyBullet(boss.x - 28, boss.y + 10, player.x, player.y, 330, n * 0.15);
    }
  }

  const dx = boss.x - player.x;
  const dy = boss.y - player.y;
  const rr = boss.radius + player.radius;

  if (dx * dx + dy * dy < rr * rr) {
    damagePlayer(26 + stageIndex * 4);
  }
}

function updateItems(dt, worldDt) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
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
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.04, dt);
    p.vy *= Math.pow(0.04, dt);

    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i -= 1) {
    const s = shockwaves[i];
    s.life -= dt;
    const progress = 1 - Math.max(0, s.life / s.maxLife);
    s.radius = BOMB_RADIUS * progress;

    if (s.life <= 0) shockwaves.splice(i, 1);
  }
}

function update(dt) {
  if (gameState === "playing") {
    updatePlaying(dt);
    return;
  }

  updateStars(dt * 0.45);
  worldOffset += 16 * dt;
  updateTrails(dt);
  updateParticles(dt);
  updateShockwaves(dt);

  if (gameState === "stageclear") {
    stageClearTimer -= dt;
    if (stageClearTimer <= 0) {
      beginStage(stageIndex + 1, false);
    }
  }
}

function drawBackground() {
  const s = stage();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s.skyTop);
  g.addColorStop(0.58, s.skyMid);
  g.addColorStop(1, "#161a1d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.82;
  for (let i = 0; i < stars.length; i += 1) {
    const starDot = stars[i];
    ctx.fillStyle = "#b8d8ff";
    ctx.beginPath();
    ctx.arc(starDot.x, starDot.y, starDot.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = s.planet;
  ctx.beginPath();
  ctx.arc(770, 110, stageIndex === 0 ? 66 : 82, 0, TAU);
  ctx.fill();

  ctx.fillStyle = stageIndex === 0 ? "rgba(11,20,31,.42)" : "rgba(40,15,27,.40)";
  ctx.beginPath();
  ctx.arc(792, 92, stageIndex === 0 ? 54 : 67, 0, TAU);
  ctx.fill();

  drawTerrain();
}

function drawTerrain() {
  const s = stage();
  const points = [];

  for (let x = -12; x <= W + 12; x += 12) {
    points.push({ x: x, y: terrainHeightAt(x) });
  }

  const grad = ctx.createLinearGradient(0, 390, 0, H);
  grad.addColorStop(0, s.groundTop);
  grad.addColorStop(0.25, stageIndex === 0 ? "#484943" : "#493b3c");
  grad.addColorStop(1, s.groundBottom);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(points[0].x, H);
  ctx.lineTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineTo(W + 12, H);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = stageIndex === 0 ? "#9a9b91" : "#a48683";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(20,22,20,.36)";
  ctx.lineWidth = 3;

  for (let i = 0; i < 9; i += 1) {
    const x = ((i * 143 - worldOffset * 0.7) % (W + 180)) - 40;
    const y = terrainHeightAt(x) + 22 + (i % 3) * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, 22 + (i % 4) * 5, 7 + (i % 2) * 3, -0.1, Math.PI, TAU);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(195,196,185,.28)";
  for (let i = 0; i < 12; i += 1) {
    const x = ((i * 91 - worldOffset * 1.1) % (W + 120)) - 30;
    const y = terrainHeightAt(x) + 8;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 3), 0, TAU);
    ctx.fill();
  }
}

function drawTrailDots() {
  for (let i = 0; i < trailDots.length; i += 1) {
    const t = trailDots[i];
    const a = Math.max(0, t.life / t.maxLife);

    ctx.fillStyle = t.color === "enemy"
      ? "rgba(255,92,72," + (0.18 + a * 0.78) + ")"
      : "rgba(248,214,112," + (0.15 + a * 0.82) + ")";

    ctx.beginPath();
    ctx.arc(t.x, t.y, t.size * (0.65 + a * 0.45), 0, TAU);
    ctx.fill();
  }
}

function drawPlayerBullets() {
  for (let i = 0; i < bullets.length; i += 1) {
    const b = bullets[i];
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
  for (let i = 0; i < enemyBullets.length; i += 1) {
    const b = enemyBullets[i];
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

function drawUfo(e) {
  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.fillStyle = "#293d4b";
  ctx.strokeStyle = "#9fc5db";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 5, 25, 9, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#52788c";
  ctx.beginPath();
  ctx.ellipse(0, -2, 12, 8, 0, Math.PI, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ff765e";
  ctx.beginPath();
  ctx.arc(-13, 7, 2.5, 0, TAU);
  ctx.arc(0, 8, 2.5, 0, TAU);
  ctx.arc(13, 7, 2.5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawJet(e) {
  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.fillStyle = "#414c57";
  ctx.strokeStyle = "#b6c7d4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-27, 0);
  ctx.lineTo(18, -6);
  ctx.lineTo(27, 0);
  ctx.lineTo(18, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#607889";
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(15, -18);
  ctx.lineTo(8, -2);
  ctx.lineTo(15, 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ff8c4e";
  ctx.beginPath();
  ctx.moveTo(25, -4);
  ctx.lineTo(38 + Math.random() * 8, 0);
  ctx.lineTo(25, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawHumanoidRobot(x, y, scale, enemyStyle, cannonAngle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const body = enemyStyle ? "#55343a" : "#8f3435";
  const armor = enemyStyle ? "#73444b" : "#b8433e";
  const edge = enemyStyle ? "#ff9c91" : "#f2d8cf";
  const dark = enemyStyle ? "#2c2229" : "#3a3438";
  const eye = enemyStyle ? "#ff705f" : "#8fe7ff";

  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.8;

  ctx.fillStyle = dark;
  ctx.beginPath();
  roundedRectPath(-10, -38, 20, 13, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = eye;
  ctx.fillRect(1, -34, 6, 2);

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-18, -23);
  ctx.lineTo(17, -23);
  ctx.lineTo(22, 7);
  ctx.lineTo(10, 18);
  ctx.lineTo(-11, 18);
  ctx.lineTo(-22, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = armor;
  ctx.beginPath();
  ctx.arc(-22, -15, 8, 0, TAU);
  ctx.arc(22, -15, 8, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = dark;
  ctx.beginPath();
  roundedRectPath(-26, -8, 9, 28, 3);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  roundedRectPath(17, -8, 9, 28, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = armor;
  ctx.beginPath();
  roundedRectPath(-17, 17, 13, 28, 4);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  roundedRectPath(4, 17, 13, 28, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = dark;
  ctx.fillRect(-20, 42, 17, 6);
  ctx.fillRect(3, 42, 17, 6);

  ctx.save();
  ctx.translate(0, -22);
  ctx.rotate(cannonAngle || 0);
  ctx.fillStyle = dark;
  ctx.strokeStyle = edge;
  ctx.beginPath();
  roundedRectPath(-5, -5, 39, 9, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = armor;
  ctx.fillRect(25, -3, 13, 5);
  ctx.restore();

  ctx.restore();
}

function drawRobotEnemy(e) {
  drawHumanoidRobot(e.x, e.y, 0.68, true, Math.PI);
}

function drawEnemy(e) {
  if (e.type === "jet") {
    drawJet(e);
  } else if (e.type === "robot") {
    drawRobotEnemy(e);
  } else {
    drawUfo(e);
  }
}

function drawBoss() {
  if (!boss) return;

  drawHumanoidRobot(boss.x, boss.y, stageIndex === 0 ? 1.12 : 1.28, true, boss.angle);

  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.strokeStyle = stageIndex === 0 ? "rgba(255,120,100,.45)" : "rgba(255,78,120,.50)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius + 9 + Math.sin(boss.phase * 4) * 3, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  if (gameState === "title") return;
  if (player.invincible > 0 && Math.floor(player.invincible * 18) % 2 === 0) return;

  drawHumanoidRobot(player.x, player.y, 0.82, false, player.angle);

  if (clockUp) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = "rgba(255,105,28,.28)";
    ctx.beginPath();
    ctx.moveTo(-21, 18);
    ctx.lineTo(-48 - Math.random() * 22, 31);
    ctx.lineTo(-14, 29);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-7, 18);
    ctx.lineTo(-30 - Math.random() * 20, 36);
    ctx.lineTo(2, 29);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawItems() {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
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
    roundedRectPath(-15, -15, 30, 30, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#effff6";
    ctx.fillRect(-4, -10, 8, 20);
    ctx.fillRect(-10, -4, 20, 8);

    ctx.restore();
  }
}

function drawParticles() {
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const a = Math.max(0, p.life / p.maxLife);
    let color;

    if (p.color === "green") {
      color = "rgba(79,255,157," + a + ")";
    } else if (p.color === "red") {
      color = "rgba(255,82,65," + a + ")";
    } else if (p.color === "cyan") {
      color = "rgba(102,224,255," + a + ")";
    } else {
      color = "rgba(255,151,69," + a + ")";
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + a), 0, TAU);
    ctx.fill();
  }
}

function drawShockwaves() {
  for (let i = 0; i < shockwaves.length; i += 1) {
    const s = shockwaves[i];
    const a = Math.max(0, s.life / s.maxLife);
    ctx.strokeStyle = "rgba(122,229,255," + a + ")";
    ctx.lineWidth = 7 * a + 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255," + (a * 0.55) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(0, s.radius - 12), 0, TAU);
    ctx.stroke();
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

  ctx.fillStyle = "rgba(5,10,18,.68)";
  ctx.fillRect(14, 14, 252, 105);

  ctx.fillStyle = "#dbe9f4";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillText("TRAIL CANNON", 27, 38);

  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillStyle = "#b9d3e3";
  ctx.fillText("STAGE " + (stageIndex + 1), 27, 59);

  ctx.fillStyle = clockUp ? "#ffb067" : "#8fc8e8";
  ctx.fillText(clockUp ? "CLOCK UP" : "CLOCK NORMAL", 100, 59);

  ctx.fillStyle = "#eef5fa";
  ctx.fillText("HP", 27, 85);
  drawHpBar(54, 73, 190, 14, player.hp, player.maxHp, player.hp > 30 ? "#48d689" : "#ff604f");

  ctx.fillStyle = "#9fe8ff";
  ctx.fillText("BOMB × " + player.bombs, 27, 108);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(String(score).padStart(6, "0"), W - 145, 76);

  ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillStyle = "#d7e4ec";
  ctx.fillText("TARGET " + Math.min(stageKills, stage().targetKills) + " / " + stage().targetKills, W - 190, 101);

  if (boss) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd1ca";
    ctx.font = "800 13px system-ui, sans-serif";
    ctx.fillText(stageIndex === 0 ? "ENEMY ACE" : "HEAVY ACE", W / 2, 29);
    drawHpBar(W / 2 - 180, 38, 360, 14, boss.hp, boss.maxHp, "#e45348");
    ctx.textAlign = "left";
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(220,235,245,.72)";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillText("左: 移動　右: 照準＋連射　BOMB: 敵弾消去", W / 2, H - 16);
  ctx.textAlign = "left";

  if (bannerTimer > 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,.50)";
    ctx.fillRect(W / 2 - 230, 120, 460, 58);
    ctx.fillStyle = bannerText.indexOf("WARNING") === 0 ? "#ff8875" : "#f3f7fa";
    ctx.font = "800 25px system-ui, sans-serif";
    ctx.fillText(bannerText, W / 2, 157);
    ctx.textAlign = "left";
  }
}

function drawButton(rect, label, primary) {
  if (typeof primary !== "boolean") primary = true;

  ctx.fillStyle = primary ? "rgba(73,137,178,.82)" : "rgba(20,32,44,.78)";
  ctx.strokeStyle = primary ? "#c3e9ff" : "rgba(220,235,245,.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  roundedRectPath(rect.x, rect.y, rect.w, rect.h, 14);
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
  ctx.fillStyle = "rgba(2,7,14,.38)";
  ctx.fillRect(0, 0, W, H);

  drawHumanoidRobot(245, 294, 1.25, false, -0.15);

  ctx.textAlign = "center";
  ctx.fillStyle = "#dff2ff";
  ctx.font = "900 62px system-ui, sans-serif";
  ctx.fillText("TRAIL CANNON", W / 2 + 95, 165);

  ctx.fillStyle = "#ffcc78";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillText("DOTTED TRAJECTORY ACTION SHOOTER", W / 2 + 95, 202);

  ctx.fillStyle = "rgba(224,237,245,.82)";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText("肩キャノンの軌跡で戦場を塗りつぶせ。", W / 2 + 95, 250);

  ctx.fillStyle = "#91b9d2";
  ctx.font = "700 15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(VERSION, W / 2 + 95, 287);

  ctx.textAlign = "left";
  drawButton(startButtonRect(), "START", true);
}

function drawStageClear() {
  ctx.fillStyle = "rgba(2,5,10,.55)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#a7ffd0";
  ctx.font = "900 54px system-ui, sans-serif";
  ctx.fillText("STAGE " + (stageIndex + 1) + " CLEAR", W / 2, 210);
  ctx.fillStyle = "#dbeaf2";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText("NEXT  STAGE " + (stageIndex + 2), W / 2, 260);
  ctx.fillStyle = "#9fc4d9";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillText("HP +25 / BOMB RELOAD", W / 2, 297);
  ctx.textAlign = "left";
}

function drawEndScreen(complete) {
  ctx.fillStyle = "rgba(2,5,10,.68)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = complete ? "#a7ffd0" : "#ff8d7e";
  ctx.font = "900 56px system-ui, sans-serif";
  ctx.fillText(complete ? "ALL STAGES CLEAR" : "GAME OVER", W / 2, 190);

  ctx.fillStyle = "#e5eef5";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText("SCORE  " + String(score).padStart(6, "0"), W / 2, 246);

  if (complete) {
    ctx.fillStyle = "#b9cfdd";
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText("2 STAGES COMPLETE", W / 2, 282);
  }

  ctx.textAlign = "left";
  drawButton(retryButtonRect(), "RETRY", true);
  drawButton(titleButtonRect(), "TITLE", false);
}

function render() {
  drawBackground();
  drawTrailDots();
  drawItems();

  for (let i = 0; i < enemies.length; i += 1) {
    drawEnemy(enemies[i]);
  }

  drawBoss();
  drawParticles();
  drawPlayerBullets();
  drawEnemyBullets();
  drawShockwaves();

  if (gameState !== "title") drawPlayer();

  drawTouchUi();
  drawHud();

  if (bombFlash > 0) {
    ctx.fillStyle = "rgba(180,242,255," + Math.min(0.35, bombFlash * 1.7) + ")";
    ctx.fillRect(0, 0, W, H);
  }

  if (gameState === "title") drawTitle();
  if (gameState === "stageclear") drawStageClear();
  if (gameState === "gameover") drawEndScreen(false);
  if (gameState === "complete") drawEndScreen(true);
}

let fatalError = null;

function drawFatalError(error) {
  ctx.fillStyle = "#160608";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ff9c91";
  ctx.textAlign = "center";
  ctx.font = "800 28px system-ui, sans-serif";
  ctx.fillText("GAME ERROR", W / 2, 205);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 16px system-ui, sans-serif";
  const message = String(error && error.message ? error.message : error).slice(0, 100);
  ctx.fillText(message, W / 2, 248);
  ctx.fillStyle = "#9fb4c4";
  ctx.font = "600 14px ui-monospace, monospace";
  ctx.fillText(VERSION, W / 2, 282);
  ctx.textAlign = "left";
}

function loop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = Math.min(dt, 1 / 30);

  if (!fatalError) {
    try {
      update(dt);
      render();
    } catch (error) {
      fatalError = error;
      console.error("Trail Cannon fatal error:", error);
      drawFatalError(error);
    }
  } else {
    drawFatalError(fatalError);
  }

  requestAnimationFrame(loop);
}

window.addEventListener("error", function (event) {
  if (!fatalError) {
    fatalError = event.error || new Error(event.message || "Unknown error");
  }
});

setGameState("title");
setClockUp(false);
requestAnimationFrame(loop);
