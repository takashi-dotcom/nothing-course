import { CONFIG } from "./config.js";

function roundedRect(ctx, x, y, w, h, radius, fill) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function hillShape(ctx, x, y, width, rise, color) {
  ctx.beginPath();
  ctx.moveTo(x - width / 2, y + 80);
  ctx.bezierCurveTo(x - width * .27, y - rise, x + width * .22, y - rise * .9, x + width / 2, y + 80);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function cloud(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(255,255,255,.90)";
  ctx.beginPath();
  ctx.ellipse(0, 5, 32, 11, 0, 0, Math.PI * 2);
  ctx.ellipse(-16, -2, 15, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(5, -9, 20, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(22, 1, 15, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTree(ctx, x, ground, size, variant) {
  ctx.save();
  ctx.translate(x, ground);
  ctx.scale(size, size);
  const green = variant % 2 ? "#62b582" : "#70bd86";
  roundedRect(ctx, -4, -56, 8, 54, 3, "#987950");
  for (const c of [
    [-15, -56, 19], [14, -60, 20], [-2, -75, 23], [5, -49, 19]
  ]) {
    ctx.beginPath();
    ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2);
    ctx.fillStyle = green;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(-11, -75, 14, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(169,221,156,.34)";
  ctx.fill();
  ctx.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    if (!this.ctx) throw new Error("Canvas 2Dが利用できません。");
    this.width = 960;
    this.height = 540;
    this.scale = 1;
    this.dpr = 1;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // 縦画面でも旅人が小さくなりすぎない拡大率
    this.scale = Math.max(this.width / 960, this.height / 540);
    const w = Math.round(this.width * this.dpr);
    const h = Math.round(this.height * this.dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  getVisibleWorldWidth() {
    return this.width / this.scale;
  }

  drawLayer(game, parallax, painter) {
    const c = this.ctx;
    c.save();
    c.translate(-game.cameraX * parallax * this.scale, 0);
    c.scale(this.scale, this.scale);
    painter(c, this.height * .77 / this.scale);
    c.restore();
  }

  draw(game) {
    const c = this.ctx;
    const w = this.width;
    const h = this.height;
    const s = this.scale;
    const ground = h * .77;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#99dafa");
    sky.addColorStop(.72, "#daf5fa");
    sky.addColorStop(1, "#eaf8ec");
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);

    // 画面奥にある太陽。点滅させず穏やかに描く。
    c.beginPath();
    c.arc(w * .83, h * .16, 27 * s, 0, Math.PI * 2);
    c.fillStyle = "rgba(255,233,158,.35)";
    c.fill();
    c.beginPath();
    c.arc(w * .83, h * .16, 18 * s, 0, Math.PI * 2);
    c.fillStyle = "#ffe89e";
    c.fill();

    this.drawLayer(game, .1, (ctx, y) => {
      const first = Math.floor((game.cameraX * .1 - 380) / 360) - 1;
      const count = Math.ceil(this.getVisibleWorldWidth() / 360) + 5;
      for (let i = first; i < first + count; i++) {
        const drift = (game.time * 4) % 360;
        cloud(ctx, i * 360 + drift + 130, y * (.19 + ((i % 3 + 3) % 3) * .15), 0.85 + ((i % 4 + 4) % 4) * .12);
      }
    });

    // 遠くの山
    this.drawLayer(game, .24, (ctx, y) => {
      const first = Math.floor((game.cameraX * .24 - 400) / 440) - 1;
      const count = Math.ceil(this.getVisibleWorldWidth() / 440) + 5;
      for (let i = first; i < first + count; i++) {
        hillShape(ctx, i * 440 + 150, y - 20, 500, 145 + (i % 3) * 18,
          i % 2 === 0 ? "#bddcbf" : "#c8e3c7");
      }
    });

    // 中景の丘
    this.drawLayer(game, .45, (ctx, y) => {
      const first = Math.floor((game.cameraX * .45 - 400) / 420) - 1;
      const count = Math.ceil(this.getVisibleWorldWidth() / 420) + 5;
      for (let i = first; i < first + count; i++) {
        hillShape(ctx, i * 420 + 125, y + 23, 490, 75 + ((i % 3 + 3) % 3) * 13,
          i % 2 === 0 ? "#91c9aa" : "#a0d0ad");
      }
    });

    // 木々はすべて背景。障害物や当たり判定を持たない。
    this.drawLayer(game, .66, (ctx, y) => {
      const first = Math.floor((game.cameraX * .66 - 300) / 320) - 1;
      const count = Math.ceil(this.getVisibleWorldWidth() / 320) + 5;
      for (let i = first; i < first + count; i++) {
        const variant = (i * 7 + 53) % 5;
        drawTree(ctx, i * 320 + 90 + variant * 18, y + 22, .8 + variant * .09, variant);
      }
    });

    // 地面には段差、穴、障害物を一切作らない。
    c.fillStyle = "#8bca6c";
    c.fillRect(0, ground, w, h - ground);
    c.fillStyle = "#b99470";
    c.fillRect(0, ground + 10 * s, w, h - ground);
    c.fillStyle = "#70b765";
    c.fillRect(0, ground, w, 6 * s);

    // 土の控えめな模様
    const leftX = Math.floor(game.cameraX / 44) - 2;
    const countX = Math.ceil(this.getVisibleWorldWidth() / 44) + 5;
    c.fillStyle = "rgba(143,103,78,.18)";
    for (let i = leftX; i < leftX + countX; i++) {
      const x = (i * 44 + 17 - game.cameraX) * s;
      const offset = (i % 3 + 3) % 3;
      roundedRect(c, x, ground + (25 + offset * 19) * s, 13 * s, 3 * s, 2 * s, "rgba(143,103,78,.20)");
      roundedRect(c, x + 15 * s, ground + (50 + offset * 17) * s, 7 * s, 3 * s, 2 * s, "rgba(255,232,196,.23)");
    }

    // 草や花は飾り。ゲーム内の収集物ではない。
    const firstBlade = Math.floor(game.cameraX / 34) - 1;
    const bladeCount = Math.ceil(this.getVisibleWorldWidth() / 34) + 4;
    for (let i = firstBlade; i < firstBlade + bladeCount; i++) {
      const x = (i * 34 + 13 - game.cameraX) * s;
      const n = (i % 7 + 7) % 7;
      c.lineWidth = Math.max(1, 1.5 * s);
      c.strokeStyle = n % 2 ? "#5aaa64" : "#6eb76a";
      c.beginPath();
      c.moveTo(x - 5 * s, ground);
      c.lineTo(x - 8 * s, ground - (5 + n) * s);
      c.moveTo(x, ground);
      c.lineTo(x + 2 * s, ground - (5 + n / 2) * s);
      c.moveTo(x + 5 * s, ground);
      c.lineTo(x + 9 * s, ground - 5 * s);
      c.stroke();
      if (n === 2 && i % 5 === 2) {
        c.fillStyle = "#fff4d8";
        c.beginPath();
        c.arc(x + 10 * s, ground - 9 * s, 2.5 * s, 0, Math.PI * 2);
        c.fill();
      }
    }

    this.drawStartGuide(game);
    this.drawGoal(game, ground);
    this.drawPlayer(game, ground);
  }

  drawStartGuide(game) {
    if (game.state !== "PLAYING") return;
    const distance = Math.max(0, game.player.x - CONFIG.world.startX);
    const fadeStart = 120;
    const fadeEnd = 270;
    if (distance >= fadeEnd) return;

    const alpha = distance <= fadeStart ? 1 : (fadeEnd - distance) / (fadeEnd - fadeStart);
    const c = this.ctx;
    const x = this.width * .56;
    const y = this.height * .35;
    const s = Math.min(this.scale, 1.2);

    c.save();
    c.globalAlpha = alpha;
    roundedRect(c, x - 64 * s, y - 26 * s, 128 * s, 52 * s, 26 * s, "rgba(255,255,255,.83)");
    c.strokeStyle = "rgba(48,124,147,.24)";
    c.lineWidth = 1.5 * s;
    c.beginPath();
    c.roundRect(x - 64 * s, y - 26 * s, 128 * s, 52 * s, 26 * s);
    c.stroke();

    c.fillStyle = "#307f95";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "700 " + (23 * s) + "px sans-serif";
    c.fillText("Go!", x - 19 * s, y);

    c.strokeStyle = "#307f95";
    c.lineWidth = 4 * s;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(x + 12 * s, y);
    c.lineTo(x + 43 * s, y);
    c.moveTo(x + 33 * s, y - 9 * s);
    c.lineTo(x + 43 * s, y);
    c.lineTo(x + 33 * s, y + 9 * s);
    c.stroke();
    c.restore();
  }

  drawGoal(game, ground) {
    const c = this.ctx;
    const s = this.scale;
    const x = (CONFIG.world.goalX - game.cameraX) * s;
    if (x < -90 * s || x > this.width + 90 * s) return;
    const left = x - 39 * s;
    const right = x + 39 * s;
    const top = ground - 88 * s;
    const tapeY = ground - 36 * s;

    for (const px of [left, right]) {
      roundedRect(c, px - 2.5 * s, top, 5 * s, 88 * s, 2 * s, "#79959a");
      c.beginPath();
      c.arc(px, top, 4 * s, 0, Math.PI * 2);
      c.fillStyle = "#fff7e6";
      c.fill();
    }

    const broken = game.state === "GOAL" || game.state === "CLEAR";
    if (broken) {
      const p = game.state === "CLEAR" ? 1 : Math.min(1, game.goalTime / .45);
      c.lineWidth = 6 * s;
      c.strokeStyle = "#fffef6";
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(left, tapeY);
      c.quadraticCurveTo(left + 22 * s, tapeY + 10 * p * s, x - 3 * s, tapeY + 37 * p * s);
      c.moveTo(right, tapeY);
      c.quadraticCurveTo(right - 22 * s, tapeY + 10 * p * s, x + 3 * s, tapeY + 37 * p * s);
      c.stroke();
    } else {
      c.strokeStyle = "#fffef6";
      c.lineWidth = 6 * s;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(left, tapeY);
      c.quadraticCurveTo(x, tapeY + 3 * s, right, tapeY);
      c.stroke();
    }

    c.fillStyle = "#f4d47b";
    c.beginPath();
    c.moveTo(right, top + 10 * s);
    c.lineTo(right + 32 * s, top + 13 * s);
    c.lineTo(right + 26 * s, top + 23 * s);
    c.lineTo(right, top + 20 * s);
    c.closePath();
    c.fill();
  }

  drawPlayer(game, ground) {
    const c = this.ctx;
    const p = game.player;
    const s = this.scale;
    const x = (p.x - game.cameraX) * s;
    const celebrating = game.state === "CLEAR";
    const running = p.grounded && !celebrating ? Math.min(1, Math.abs(p.vx) / CONFIG.player.topSpeed) : 0;
    const phase = p.runPhase;
    const bob = Math.abs(Math.sin(phase)) * 1.4 * running;
    const celebrationRise = celebrating ? Math.max(0, Math.sin(game.time * 7)) * 25 : 0;
    const footY = ground - (p.y + celebrationRise + bob) * s;

    // 空中にいる場合も地面の位置を見失わないよう、薄い影を置く。
    c.beginPath();
    c.ellipse(x, ground + 3 * s, (12 + p.y * .035) * s, 3.4 * s, 0, 0, Math.PI * 2);
    c.fillStyle = "rgba(61,106,78,.17)";
    c.fill();

    c.save();
    c.translate(x, footY);
    c.scale(s * p.facing, s);
    const footSwing = celebrating ? 4 : Math.sin(phase) * 7 * running;
    const armSwing = celebrating ? 0 : Math.sin(phase) * 5 * running;

    // 足と靴
    c.lineCap = "round";
    c.lineWidth = 7;
    c.strokeStyle = "#37638a";
    c.beginPath();
    c.moveTo(-5, -15);
    c.lineTo(-6 + footSwing, -3);
    c.moveTo(5, -15);
    c.lineTo(6 - footSwing, -3);
    c.stroke();
    roundedRect(c, -10 + footSwing, -4, 11, 5, 2, "#2f5778");
    roundedRect(c, 1 - footSwing, -4, 11, 5, 2, "#2f5778");

    // 腕（胴体より先に描く）
    c.lineWidth = 6;
    c.strokeStyle = "#3484b0";
    c.beginPath();
    if (celebrating) {
      c.moveTo(-9, -28);
      c.lineTo(-21, -47);
      c.moveTo(9, -28);
      c.lineTo(21, -47);
    } else {
      c.moveTo(-9, -27);
      c.lineTo(-15 - armSwing, -15);
      c.moveTo(9, -27);
      c.lineTo(15 + armSwing, -17);
    }
    c.stroke();

    // 上着
    roundedRect(c, -11, -33, 22, 21, 7, "#398ab8");
    roundedRect(c, -9, -19, 18, 4, 2, "#347cad");

    // マフラーは軽量な図形アニメーション
    const flutter = Math.sin(game.time * 6.2 + phase * .4) * 2;
    const wind = 4 * running + Math.max(0, p.vy / 100);
    c.beginPath();
    c.moveTo(-7, -31);
    c.quadraticCurveTo(-18 - wind, -34 + flutter, -29 - wind * .6, -29 - flutter);
    c.strokeStyle = "#f6c84e";
    c.lineWidth = 6;
    c.stroke();
    c.beginPath();
    c.moveTo(-9, -33);
    c.quadraticCurveTo(0, -29, 10, -33);
    c.stroke();

    // 丸い顔
    c.beginPath();
    c.arc(0, -41, 11.8, 0, Math.PI * 2);
    c.fillStyle = "#ffe0ba";
    c.fill();
    c.strokeStyle = "#ceaa87";
    c.lineWidth = 1;
    c.stroke();

    // 髪の毛（特定のゲームキャラを模倣しないシンプルな形）
    c.beginPath();
    c.moveTo(-10, -44);
    c.quadraticCurveTo(-8, -57, 0, -53);
    c.quadraticCurveTo(8, -57, 10, -45);
    c.quadraticCurveTo(3, -50, -2, -49);
    c.quadraticCurveTo(-8, -46, -10, -44);
    c.fillStyle = "#66574c";
    c.fill();

    c.fillStyle = "#4b4945";
    if (celebrating) {
      c.strokeStyle = "#4b4945";
      c.lineWidth = 1.3;
      c.beginPath();
      c.arc(-4, -42, 2.2, Math.PI * 1.07, Math.PI * 1.89);
      c.arc(5, -42, 2.2, Math.PI * 1.07, Math.PI * 1.89);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(-4, -41, 1.3, 0, Math.PI * 2);
      c.arc(5, -41, 1.3, 0, Math.PI * 2);
      c.fill();
    }
    c.beginPath();
    if (celebrating) {
      c.arc(1, -36, 3.6, 0.12, Math.PI - .12);
    } else {
      c.arc(1, -37.5, 2.5, .16, Math.PI - .16);
    }
    c.lineWidth = 1.5;
    c.strokeStyle = "#926c57";
    c.stroke();

    c.restore();
  }
}
