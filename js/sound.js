// オリジナルの短いメロディと効果音をWeb Audio APIで合成する。
// 外部の音声ファイルやライブラリは使用しない。
const MUSIC_BPM = 112;
const BEAT_SECONDS = 60 / MUSIC_BPM;
const MELODY = [
  72, 76, 79, 76, 74, 76, 79, null,
  72, 76, 81, 79, 76, 74, 72, null,
  69, 72, 76, 72, 67, 69, 72, null,
  71, 74, 79, 74, 72, null, 72, null
];
const CHORD_ROOTS = [48, 43, 45, 41, 48, 41, 43, 48];

function pitch(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class SoundManager {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.effects = null;
    this.musicBus = null;
    this.musicTimer = null;
    this.musicPlaying = false;
    this.nextBeatTime = 0;
    this.beatIndex = 0;
    this.unavailable = false;
  }

  // STARTやスピーカーボタンなど、ユーザー操作の中から呼び出す。
  prepare() {
    if (!this.enabled || this.unavailable) return null;
    if (!this.context) {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) {
        this.unavailable = true;
        return null;
      }
      try {
        this.context = new AudioContextType();
        this.master = this.context.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.context.destination);
        this.effects = this.context.createGain();
        this.effects.gain.value = 0.78;
        this.effects.connect(this.master);
      } catch (error) {
        console.warn("音声機能を初期化できません:", error);
        this.unavailable = true;
        return null;
      }
    }
    if (this.context.state === "suspended") {
      // Safariのユーザー操作制限に合わせ、再開要求をすぐに送る。
      this.context.resume().catch(error => {
        console.info("音声の再開には操作が必要な場合があります:", error);
      });
    }
    return this.context;
  }

  setEnabled(enabled, isPlaying) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.stopMusic();
      if (this.context) {
        const now = this.context.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(0.0001, now, 0.012);
      }
      return;
    }
    const ctx = this.prepare();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.7, now, 0.018);
    if (isPlaying) this.startMusic();
  }

  note(midi, when, duration, volume, type, destination, attack = 0.015) {
    if (!this.context || !destination) return;
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    const safeAttack = Math.min(duration / 3, attack);
    osc.type = type;
    osc.frequency.setValueAtTime(pitch(midi), when);
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + safeAttack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(envelope);
    envelope.connect(destination);
    osc.start(when);
    osc.stop(when + duration + 0.015);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
  }

  scheduleMusic() {
    const ctx = this.context;
    if (!ctx || !this.musicPlaying || !this.musicBus) return;
    const ahead = ctx.currentTime + 0.4;
    while (this.nextBeatTime < ahead && this.musicPlaying) {
      const index = this.beatIndex % MELODY.length;
      const now = this.nextBeatTime;
      const melodyNote = MELODY[index];

      // 音の粒を少し丸くした、木琴のような単音メロディ。
      if (melodyNote !== null) {
        this.note(melodyNote, now, BEAT_SECONDS * 0.77, 0.065, "sine", this.musicBus);
        this.note(melodyNote + 12, now, BEAT_SECONDS * 0.24, 0.009, "triangle", this.musicBus);
      }
      // 4拍に1度だけ、柔らかな和音で草原の空気感を支える。
      if (index % 4 === 0) {
        const root = CHORD_ROOTS[Math.floor(index / 4)];
        for (const shift of [0, 7, 12]) {
          this.note(root + shift, now, BEAT_SECONDS * 3.6,
            0.012, "triangle", this.musicBus, 0.14);
        }
      }
      this.nextBeatTime += BEAT_SECONDS;
      this.beatIndex++;
    }
  }

  startMusic() {
    this.stopMusic();
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.68;
    this.musicBus.connect(this.master);
    this.musicPlaying = true;
    this.nextBeatTime = ctx.currentTime + 0.07;
    this.beatIndex = 0;
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicBus && this.context) {
      const bus = this.musicBus;
      const now = this.context.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0.0001, now, 0.06);
      // すでにスケジュールした長い和音の終了後に接続を解除する。
      window.setTimeout(() => bus.disconnect(), 3000);
      this.musicBus = null;
    }
  }

  playStart() {
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    this.note(72, t, 0.18, 0.050, "sine", this.effects);
    this.note(79, t + 0.11, 0.24, 0.045, "sine", this.effects);
  }

  playJump() {
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.13);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.087, t + 0.013);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.effects);
    osc.start(t);
    osc.stop(t + 0.17);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  playLand() {
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(130, t + 0.085);
    gain.gain.setValueAtTime(0.032, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    osc.connect(gain);
    gain.connect(this.effects);
    osc.start(t);
    osc.stop(t + 0.12);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  playGoalTape() {
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    const t = ctx.currentTime;
    // ごく短いノイズをフィルターに通して、布がほどけるような音にする。
    const length = Math.floor(ctx.sampleRate * 0.19);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.044, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects);
    source.start(t);
    source.stop(t + 0.19);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  playClear() {
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    const notes = [72, 76, 79, 84];
    for (let i = 0; i < notes.length; i++) {
      this.note(notes[i], t + i * 0.16, i === 3 ? 0.52 : 0.26,
        i === 3 ? 0.084 : 0.066, "sine", this.effects);
    }
  }

  onVisibilityChange(hidden, isPlaying) {
    if (hidden) {
      this.stopMusic();
      if (this.context && this.context.state === "running") {
        this.context.suspend().catch(() => {});
      }
      return;
    }
    if (isPlaying && this.enabled) this.startMusic();
  }
}
