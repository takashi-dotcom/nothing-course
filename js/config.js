// 調整したい数値は原則ここに集約する。
export const CONFIG = Object.freeze({
  world: {
    startX: 448,
    goalX: 3550,
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
  // note本記事への戻り先。
  noteUrl: "https://note.com/joyful_cougar823/n/na695ff43b1e5"
});
