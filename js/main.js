import { CONFIG } from "./config.js";
import { InputController } from "./input.js";
import { Game } from "./game.js";
import { Renderer } from "./render.js";
import { SoundManager } from "./sound.js";

const stage = document.getElementById("stage");
const canvas = document.getElementById("gameCanvas");
const titleScreen = document.getElementById("titleScreen");
const clearScreen = document.getElementById("clearScreen");
const controls = document.getElementById("touchControls");
const hint = document.getElementById("keyboardHint");
const startButton = document.getElementById("startButton");
const replayButton = document.getElementById("replayButton");
const noteLink = document.getElementById("noteLink");
const soundToggle = document.getElementById("soundToggle");

const input = new InputController(document.querySelectorAll(".control-button"));
const renderer = new Renderer(canvas);
const sound = new SoundManager();
const game = new Game(onStateChange);
const hasKeyboardPointer = matchMedia("(hover: hover) and (pointer: fine)");

noteLink.href = CONFIG.noteUrl;

function onStateChange(state) {
  const playing = state === "PLAYING";
  titleScreen.hidden = state !== "TITLE";
  clearScreen.hidden = state !== "CLEAR";
  controls.hidden = !playing;
  hint.hidden = true;
  input.setEnabled(playing);
  if (state === "PLAYING") sound.startMusic();
  if (state === "GOAL") {
    sound.stopMusic();
    sound.playGoalTape();
    // テープを切った瞬間から、クリア専用のBGMを流し続ける。
    sound.startClearMusic();
  }
}

function beginGame() {
  // 音声再生をユーザー操作の直後に許可してもらう（特にiPhone Safari）。
  sound.prepare();
  game.start();
  sound.playStart();
  startButton.blur();
  replayButton.blur();
}

function updateSoundButton() {
  const enabled = sound.enabled;
  soundToggle.setAttribute("aria-pressed", String(enabled));
  soundToggle.setAttribute("aria-label", enabled ? "音を消す" : "音を出す");
  soundToggle.title = enabled ? "音を消す" : "音を出す";
  soundToggle.classList.toggle("is-muted", !enabled);
}

soundToggle.addEventListener("click", () => {
  sound.setEnabled(!sound.enabled, game.state);
  updateSoundButton();
  soundToggle.blur();
});
// ほかのアプリから戻った際、次のタッチ操作で音声が再開できるようにする。
for (const button of document.querySelectorAll(".control-button")) {
  button.addEventListener("pointerdown", () => sound.prepare());
}

startButton.addEventListener("click", beginGame);
replayButton.addEventListener("click", beginGame);

window.addEventListener("keydown", event => {
  if (event.code !== "Enter" || event.repeat) return;
  if (event.target instanceof Element && event.target.closest("button, a")) return;
  if (game.state === "TITLE" || game.state === "CLEAR") {
    event.preventDefault();
    beginGame();
  }
});

function resize() {
  renderer.resize();
  game.setViewportWidth(renderer.getVisibleWorldWidth());
}
const observer = new ResizeObserver(resize);
observer.observe(stage);
window.addEventListener("orientationchange", () => {
  input.clear();
  resize();
});
window.addEventListener("blur", () => input.clear());
document.addEventListener("visibilitychange", () => {
  input.clear();
  lastTimestamp = 0;
  accumulator = 0;
  sound.onVisibilityChange(document.hidden, game.state);
});

let lastTimestamp = 0;
let accumulator = 0;
const step = CONFIG.simulation.step;

function frame(timestamp) {
  try {
    if (lastTimestamp === 0) lastTimestamp = timestamp;
    const elapsed = Math.min((timestamp - lastTimestamp) / 1000, CONFIG.simulation.maxFrameSeconds);
    lastTimestamp = timestamp;

    if (!document.hidden) {
      accumulator += elapsed;
      let count = 0;
      while (accumulator >= step && count < CONFIG.simulation.maxStepsPerFrame) {
        const wasGrounded = game.player.grounded;
        const wasPlaying = game.state === "PLAYING";
        game.update(step, input.snapshot());
        if (wasPlaying && wasGrounded && !game.player.grounded) sound.playJump();
        if (wasPlaying && !wasGrounded && game.player.grounded) sound.playLand();
        accumulator -= step;
        count++;
      }
      if (count === CONFIG.simulation.maxStepsPerFrame) accumulator = 0;
      hint.hidden = game.state !== "PLAYING" || !hasKeyboardPointer.matches || game.playTime > 4.5;
      renderer.draw(game);
    }
    requestAnimationFrame(frame);
  } catch (error) {
    console.error("ゲームの実行中にエラーが発生しました:", error);
    input.setEnabled(false);
    const msg = document.createElement("p");
    msg.className = "keyboard-hint";
    msg.textContent = "読み込みエラーが発生しました。ページを再読み込みしてください。";
    msg.hidden = false;
    stage.append(msg);
  }
}

updateSoundButton();
onStateChange("TITLE");
resize();
requestAnimationFrame(frame);
