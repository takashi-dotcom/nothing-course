const KEY_ACTIONS = new Map([
  ["ArrowLeft", "left"], ["KeyA", "left"],
  ["ArrowRight", "right"], ["KeyD", "right"],
  ["Space", "jump"]
]);

export class InputController {
  constructor(controls) {
    this.controls = [...controls];
    this.keys = new Set();
    this.pointers = new Map();
    this.justJump = false;
    this.enabled = false;

    window.addEventListener("keydown", event => this.onKeyDown(event));
    window.addEventListener("keyup", event => this.onKeyUp(event));
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clear();
    });

    for (const button of this.controls) {
      button.addEventListener("pointerdown", event => this.onPointerDown(event, button));
      button.addEventListener("pointermove", event => this.onPointerMove(event, button));
      button.addEventListener("pointerup", event => this.release(event));
      button.addEventListener("pointercancel", event => this.release(event));
      button.addEventListener("lostpointercapture", event => this.release(event));
      button.addEventListener("contextmenu", event => event.preventDefault());
      button.addEventListener("dragstart", event => event.preventDefault());
    }
  }

  setEnabled(enabled) {
    this.clear();
    this.enabled = enabled;
  }

  onKeyDown(event) {
    const action = KEY_ACTIONS.get(event.code);
    if (!action || !this.enabled) return;
    event.preventDefault();
    if (!this.keys.has(event.code) && action === "jump" && !this.isDown("jump")) {
      this.justJump = true;
    }
    this.keys.add(event.code);
  }

  onKeyUp(event) {
    const action = KEY_ACTIONS.get(event.code);
    if (!action) return;
    if (this.enabled) event.preventDefault();
    this.keys.delete(event.code);
  }

  onPointerDown(event, button) {
    if (!this.enabled || event.button !== 0) return;
    event.preventDefault();
    const action = button.dataset.action;
    if (action === "jump" && !this.isDown("jump")) this.justJump = true;
    this.pointers.set(event.pointerId, { action, button });
    try { button.setPointerCapture(event.pointerId); } catch (_) {}
    this.updateButtonAppearance();
  }

  onPointerMove(event, button) {
    const item = this.pointers.get(event.pointerId);
    if (!item || item.button !== button) return;
    const r = button.getBoundingClientRect();
    const tolerance = 18;
    if (event.clientX < r.left - tolerance || event.clientX > r.right + tolerance ||
        event.clientY < r.top - tolerance || event.clientY > r.bottom + tolerance) {
      this.release(event);
    }
  }

  release(event) {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    this.updateButtonAppearance();
  }

  isDown(action) {
    for (const code of this.keys) {
      if (KEY_ACTIONS.get(code) === action) return true;
    }
    for (const item of this.pointers.values()) {
      if (item.action === action) return true;
    }
    return false;
  }

  snapshot() {
    const result = {
      left: this.isDown("left"),
      right: this.isDown("right"),
      jumpHeld: this.isDown("jump"),
      justJump: this.justJump
    };
    this.justJump = false;
    return result;
  }

  updateButtonAppearance() {
    for (const button of this.controls) {
      button.classList.toggle("is-pressed", [...this.pointers.values()]
        .some(item => item.button === button));
    }
  }

  clear() {
    this.keys.clear();
    this.pointers.clear();
    this.justJump = false;
    this.updateButtonAppearance();
  }
}
