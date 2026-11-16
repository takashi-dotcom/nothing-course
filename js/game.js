import { CONFIG } from "./config.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const moveToward = (value, target, delta) => {
  if (value < target) return Math.min(value + delta, target);
  if (value > target) return Math.max(value - delta, target);
  return value;
};

export class Game {
  constructor(onStateChange = () => {}) {
    this.onStateChange = onStateChange;
    this.viewWidth = 960;
    this.time = 0;
    this.playTime = 0;
    this.goalTime = 0;
    this.state = "TITLE";
    this.player = this.makePlayer();
    this.cameraX = this.desiredCamera();
  }

  makePlayer() {
    return {
      x: CONFIG.world.startX,
      y: 0, // 地面からの高さ。上方向がプラス
      vx: 0,
      vy: 0,
      grounded: true,
      facing: 1,
      runPhase: 0,
      jumpBuffer: 0,
      jumpCutApplied: false
    };
  }

  setState(nextState) {
    if (this.state === nextState) return;
    this.state = nextState;
    this.onStateChange(nextState);
  }

  setViewportWidth(width) {
    if (!Number.isFinite(width) || width <= 0) return;
    this.viewWidth = width;
    this.cameraX = this.desiredCamera();
  }

  desiredCamera() {
    const target = this.player.x - (this.viewWidth / 2 + CONFIG.camera.offsetFromCenter);
    const maxCamera = Math.max(0, CONFIG.world.goalX - this.viewWidth / 2);
    return clamp(target, 0, maxCamera);
  }

  start() {
    this.player = this.makePlayer();
    this.playTime = 0;
    this.goalTime = 0;
    this.cameraX = this.desiredCamera();
    this.setState("PLAYING");
  }

  update(dt, input) {
    this.time += dt;
    if (this.state === "TITLE" || this.state === "CLEAR") return;

    if (this.state === "GOAL") {
      this.goalTime += dt;
      this.player.vx = moveToward(this.player.vx, 0, CONFIG.player.groundDeceleration * dt);
      this.updateVertical(dt, false);
      this.updateCamera(dt);
      if (this.goalTime >= 0.85 && this.player.grounded) this.setState("CLEAR");
      return;
    }

    this.playTime += dt;
    const p = this.player;
    const cfg = CONFIG.player;
    const direction = Number(input.right) - Number(input.left);
    const inAir = !p.grounded;

    if (direction !== 0) {
      p.facing = direction;
      const acceleration = inAir
        ? cfg.airAcceleration
        : (p.vx * direction < 0 ? cfg.reverseAcceleration : cfg.groundAcceleration);
      p.vx = moveToward(p.vx, direction * cfg.topSpeed, acceleration * dt);
    } else {
      const deceleration = inAir ? cfg.airDeceleration : cfg.groundDeceleration;
      p.vx = moveToward(p.vx, 0, deceleration * dt);
    }

    p.x = Math.max(CONFIG.world.leftEdge + cfg.width / 2, p.x + p.vx * dt);
    p.runPhase += Math.abs(p.vx) * dt / 16;

    if (input.justJump) p.jumpBuffer = cfg.jumpBuffer;
    else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

    if (p.grounded && p.jumpBuffer > 0) {
      p.vy = cfg.jumpSpeed;
      p.grounded = false;
      p.jumpCutApplied = false;
      p.jumpBuffer = 0;
    }

    this.updateVertical(dt, input.jumpHeld);
    this.updateCamera(dt);

    // 空中で横切ってもゴール。障害物を避ける動作は要求しない。
    if (p.x >= CONFIG.world.goalX && p.vx >= 0) {
      p.x = CONFIG.world.goalX;
      this.goalTime = 0;
      this.setState("GOAL");
    }
  }

  updateVertical(dt, jumpHeld) {
    const p = this.player;
    if (p.grounded) return;

    // 早く離した場合だけ上昇速度を小さくし、低いジャンプにする。
    if (p.vy > 0 && !jumpHeld && !p.jumpCutApplied) {
      p.vy *= CONFIG.player.jumpCutFactor;
      p.jumpCutApplied = true;
    }

    p.vy -= CONFIG.player.gravity * dt;
    p.y += p.vy * dt;

    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.grounded = true;
      p.jumpCutApplied = false;
    }
  }

  updateCamera(dt) {
    const target = this.desiredCamera();
    const easing = 1 - Math.exp(-CONFIG.camera.followStrength * dt);
    this.cameraX += (target - this.cameraX) * easing;
  }
}
