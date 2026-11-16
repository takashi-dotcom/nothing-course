// 調整したい数値は原則ここに集約する。
export const CONFIG = Object.freeze({
  world: {
    startX: 448,
    goalX: 7000,
    leftEdge: 0
  },
  player: {
    width: 32,
    height: 48,
    topSpeed: 220,
    groundAcceleration: 1400,
    groundDeceleration: 1800,
    reverseAcceleration: 2000,
    airAcceleration: 1000,
    airDeceleration: 520,
    jumpSpeed: 540,
    gravity: 1450,
    jumpCutFactor: 0.46,
    jumpBuffer: 0.1
  },
  simulation: {
    step: 1 / 60,
    maxFrameSeconds: 0.05,
    maxStepsPerFrame: 5
  },
  camera: {
    offsetFromCenter: -32,
    followStrength: 13
  },
  // 記事公開後、具体的なnote記事URLへ差し替える。
  noteUrl: "https://note.com/joyful_cougar823"
});
