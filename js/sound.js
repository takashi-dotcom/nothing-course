// オリジナルの短いメロディと効果音をWeb Audio APIで合成する。
// 外部の音声ファイルやライブラリは使用しない。
// 前バージョン1.4の1.5倍。波形振幅の設定値であり聴感上の1.5倍とは限らない。
const MASTER_VOLUME = 2.1;
const MUSIC_BPM = 112;
const BEAT_SECONDS = 60 / MUSIC_BPM;

// ハ長調（C major）。メロディはC・F・Gメジャーコードの構成音だけに限定。
// null は前の音を伸ばすための休符で、短い音の連続を避ける。
const MELODY = [
  76, null, 79, 84,  // C: E - G C
  81, null, 84, 81,  // F: A - C A
  79, null, 83, 86,  // G: G - B D
  84, null, 79, 76,  // C: C - G E
  81, null, 77, 81,  // F: A - F A
  79, null, 76, 79,  // C: G - E G
  83, 86, 83, 79,    // G: B D B G
  79, 76, 84, null   // C: G E C -
];
const CHORD_ROOTS = [48, 53, 55, 48, 53, 48, 55, 48];

// クリア専用：静かに喜びが広がる、明るいオリジナル8小節のループ。
// C → G → F → C → F → C → G → C。すべてメジャー三和音。
// 単なる4音のファンファーレではなく、和音と旋律が続くエンディング曲。
const CLEAR_BPM = 118;
const CLEAR_BEAT_SECONDS = 60 / CLEAR_BPM;
const CLEAR_MELODY = [
  76, 79, 84, null,  // C: E G C（明るく上昇）
  83, 86, 79, null,  // G: B D G
  81, 84, 89, null,  // F: A C F
  88, 84, 79, null,  // C: E C G
  84, 88, 91, null,  // C: C E G
  89, 84, 81, null,  // F: F C A
  83, 86, 79, null,  // G: B D G
  84, null, 79, 84   // C: C - G C（解決して自然にループ）
];
const CLEAR_CHORD_ROOTS = [48, 55, 53, 48, 48, 53, 55, 48];
const MAJOR_TRIAD_INTERVALS = [0, 4, 7];

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
    this.musicMode = null;
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
        this.master.gain.value = MASTER_VOLUME;
        // 音量を引き上げたぶん、重なった和音で音割れしないようピークを軽く抑える。
        this.limiter = this.context.createDynamicsCompressor();
        this.limiter.threshold.value = -3;
        this.limiter.knee.value = 3;
        this.limiter.ratio.value = 12;
        this.limiter.attack.value = 0.003;
        this.limiter.release.value = 0.18;
        this.master.connect(this.limiter);
        this.limiter.connect(this.context.destination);
        this.effects = this.context.createGain();
        // BGMは気に入った音量のまま。操作の手応えを感じられるよう効果音だけ約1.65倍に。
        this.effects.gain.value = 1.28;
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

  setEnabled(enabled, gameState) {
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
    this.master.gain.setTargetAtTime(MASTER_VOLUME, now, 0.018);
    if (gameState === "PLAYING") this.startMusic();
    if (gameState === "GOAL" || gameState === "CLEAR") this.startClearMusic();
  }

  note(midi, when, duration, volume, type, destination, attack = 0.018, sustain = 0.78, release = 0.13) {
    if (!this.context || !destination) return;
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();
    const safeDuration = Math.max(0.035, duration);
    const safeAttack = Math.max(0.008, Math.min(safeDuration * 0.18, attack));
    const safeRelease = Math.min(safeDuration * 0.35, release);
    const holdEnd = Math.max(when + safeAttack + 0.003, when + safeDuration - safeRelease);
    const safeLevel = Math.max(0.0002, volume * sustain);
    osc.type = type;
    osc.frequency.setValueAtTime(pitch(midi), when);
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + safeAttack);
    envelope.gain.exponentialRampToValueAtTime(safeLevel, holdEnd);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + safeDuration);
    osc.connect(envelope);
    envelope.connect(destination);
    osc.start(when);
    osc.stop(when + safeDuration + 0.015);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
  }

  // メロディの各音と同じメジャーコードに含まれる、すぐ下の構成音を重ねる。
  lowerHarmony(melodyNote, root) {
    let note = melodyNote - 1;
    while (!MAJOR_TRIAD_INTERVALS.includes(((note - root) % 12 + 12) % 12)) {
      note--;
    }
    return note;
  }

  // 次の発音まで伸ばす。音楽が「ポン、ポン」と途切れ続けないための設計。
  melodyDuration(index, melody = MELODY, beatSeconds = BEAT_SECONDS) {
    let beats = 1;
    while (beats < melody.length && melody[(index + beats) % melody.length] === null) {
      beats++;
    }
    return Math.max(0.18, beats * beatSeconds - 0.045);
  }

  scheduleMusic() {
    const ctx = this.context;
    if (!ctx || !this.musicPlaying || !this.musicBus) return;
    const clear = this.musicMode === "clear";
    const melody = clear ? CLEAR_MELODY : MELODY;
    const roots = clear ? CLEAR_CHORD_ROOTS : CHORD_ROOTS;
    const beat = clear ? CLEAR_BEAT_SECONDS : BEAT_SECONDS;
    const ahead = ctx.currentTime + 0.4;

    while (this.nextBeatTime < ahead && this.musicPlaying) {
      const index = this.beatIndex % melody.length;
      const now = this.nextBeatTime;
      const melodyNote = melody[index];
      const root = roots[Math.floor(index / 4)];

      if (index % 4 === 0) {
        // 4拍ずっと響くメジャー和音とベース。クリア画面も無音にならない。
        for (const interval of MAJOR_TRIAD_INTERVALS) {
          this.note(root + 12 + interval, now, beat * 4.06,
            clear ? 0.031 : 0.030, "triangle", this.musicBus, 0.26, 0.90, 0.30);
        }
        this.note(root, now, beat * 3.96,
          clear ? 0.029 : 0.026, "sine", this.musicBus, 0.09, 0.83, 0.25);
      }

      if (melodyNote !== null) {
        const duration = this.melodyDuration(index, melody, beat);
        // プレイ曲はそのまま。クリア曲は少し明るく、輪郭のある旋律。
        this.note(melodyNote, now, duration,
          clear ? 0.078 : 0.065, "sine", this.musicBus, 0.034, 0.91, 0.15);
        this.note(this.lowerHarmony(melodyNote, root), now, duration,
          clear ? 0.024 : 0.021, "triangle", this.musicBus, 0.06, 0.85, 0.17);
        // ゴールの喜びを、耳に刺さらない小さなきらめきで演出する。
        if (clear && index % 4 === 0) {
          this.note(melodyNote + 12, now, beat * 0.65,
            0.011, "sine", this.musicBus, 0.018, 0.58, 0.14);
        }
      }
      this.nextBeatTime += beat;
      this.beatIndex++;
    }
  }

  startMusic() {
    this.startTrack("play");
  }

  startClearMusic() {
    this.startTrack("clear");
  }

  startTrack(mode) {
    this.stopMusic();
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = mode === "clear" ? 0.63 : 0.68;
    this.musicBus.connect(this.master);
    this.musicMode = mode;
    this.musicPlaying = true;
    this.nextBeatTime = ctx.currentTime + 0.07;
    this.beatIndex = 0;
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic() {
    this.musicPlaying = false;
    this.musicMode = null;
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

  onVisibilityChange(hidden, gameState) {
    if (hidden) {
      this.stopMusic();
      if (this.context && this.context.state === "running") {
        this.context.suspend().catch(() => {});
      }
      return;
    }
    if (!this.enabled) return;
    if (gameState === "PLAYING") this.startMusic();
    if (gameState === "GOAL" || gameState === "CLEAR") this.startClearMusic();
  }
}
