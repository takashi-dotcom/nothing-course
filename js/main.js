import { CONFIG } from "./config.js";
import { InputController } from "./input.js";
import { Game } from "./game.js";
import { Renderer } from "./render.js";

const stage = document.getElementById("stage");
const canvas = document.getElementById("gameCanvas");
const titleScreen = document.getElementById("titleScreen");
const clearScreen = document.getElementById("clearScreen");
const controls = document.getElementById("touchControls");
const hint = document.getElementById("keyboardHint");
const startButton = document.getElementById("startButton");
const replayButton = document.getElementById("replayButton");
const noteLink = document.getElementById("noteLink");

const input = new InputController(document.querySelectorAll(".control-button"));
const renderer = new Renderer(canvas);
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
}

function beginGame() {
  game.start();
  startButton.blur();
  replayButton.blur();
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
        game.update(step, input.snapshot());
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

onStateChange("TITLE");
resize();
requestAnimationFrame(frame);
