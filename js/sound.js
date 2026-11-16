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

// ゴール後は通常曲と差別化し、ニ長調・ゆったり3拍子の独立した旋律に。
// D → A → G → D → G → D → A → D、すべてメジャー和音。
// 和音に馴染む音階上の経過音を使い、軽やかなワルツにする。
const CLEAR_BPM = 106;
const CLEAR_BEAT_SECONDS = 60 / CLEAR_BPM;
const CLEAR_BEATS_PER_BAR = 3;
const CLEAR_MELODY = [
  78, 79, 81,     // D:  F#5 G5 A5
  85, 83, 81,     // A:  C#6 B5 A5
  79, 81, 83,     // G:  G5 A5 B5
  86, null, 81,   // D:  D6 ... A5
  83, 81, 79,     // G:  B5 A5 G5
  78, 81, 86,     // D:  F#5 A5 D6
  85, 83, 81,     // A:  C#6 B5 A5
  86, null, 86    // D:  D6 ... D6
];
const CLEAR_CHORD_ROOTS = [50, 57, 55, 50, 55, 50, 57, 50];
const FANFARE_SECONDS = 1.04;
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
    const beatsPerBar = clear ? CLEAR_BEATS_PER_BAR : 4;
    const ahead = ctx.currentTime + 0.4;

    while (this.nextBeatTime < ahead && this.musicPlaying) {
      const index = this.beatIndex % melody.length;
      const now = this.nextBeatTime;
      const melodyNote = melody[index];
      const position = index % beatsPerBar;
      const root = roots[Math.floor(index / beatsPerBar)];

      if (position === 0) {
        // 通常曲の4拍子と違い、クリア曲は軽やかな3拍子のメジャー和音。
        for (const interval of MAJOR_TRIAD_INTERVALS) {
          this.note(root + 12 + interval, now, beat * (beatsPerBar + 0.06),
            clear ? 0.029 : 0.030, clear ? "sine" : "triangle",
            this.musicBus, 0.24, 0.87, 0.27);
        }
        this.note(root, now, beat * (beatsPerBar - 0.04),
          clear ? 0.028 : 0.026, "sine", this.musicBus, 0.09, 0.83, 0.25);
      }

      if (melodyNote !== null) {
        const duration = this.melodyDuration(index, melody, beat);
        this.note(melodyNote, now, duration,
          clear ? 0.075 : 0.065, clear ? "triangle" : "sine",
          this.musicBus, 0.028, 0.89, 0.16);
        this.note(this.lowerHarmony(melodyNote, root), now, duration,
          clear ? 0.017 : 0.021, "triangle", this.musicBus, 0.06, 0.85, 0.17);
      }

      // ゴール後は伴奏の2拍目・3拍目に柔らかな音を添え、3拍子らしさを出す。
      if (clear && position > 0) {
        this.note(root + (position === 1 ? 19 : 16), now, beat * 0.52,
          0.015, "sine", this.musicBus, 0.018, 0.65, 0.15);
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

  startTrack(mode, delay = 0.07) {
    this.stopMusic();
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = mode === "clear" ? 0.63 : 0.68;
    this.musicBus.connect(this.master);
    this.musicMode = mode;
    this.musicPlaying = true;
    // クリア曲はファンファーレのあとから正確な音声時刻で開始する。
    this.nextBeatTime = ctx.currentTime + Math.max(0.01, delay);
    this.beatIndex = 0;
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  beginGoalSequence() {
    // ゴールで旧曲を約12msの短いフェードにして、合図と重ならないようにする。
    this.stopMusic(0.012);
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    this.playGoalTape();
    this.playGoalFanfare();
    this.startTrack("clear", FANFARE_SECONDS + 0.13);
  }

  playGoalFanfare() {
    if (!this.enabled) return;
    const ctx = this.prepare();
    if (!ctx) return;
    const t = ctx.currentTime + 0.035;
    // 新規オリジナル。約1秒の素早く駆け上がる合図「トゥルルルルル！」。
    // テンポ感も音域も通常BGMとは明確に切り替える。
    const phrase = [74, 78, 81, 83, 85, 86, 90, 93, 98];
    const gap = 0.083;
    phrase.forEach((midi, index) => {
      const when = t + index * gap;
      const last = index === phrase.length - 1;
      this.note(midi, when, last ? 0.32 : 0.13,
        last ? 0.085 : 0.073, "triangle", this.effects,
        0.003, 0.72, last ? 0.14 : 0.06);
      if (last) {
        this.note(midi - 12, when, 0.32,
          0.034, "sine", this.effects, 0.008, 0.73, 0.16);
      }
    });
  }

  stopMusic(fadeSeconds = 0.06) {
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
      bus.gain.setTargetAtTime(0.0001, now, fadeSeconds);
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

    // 瞬間的に輪郭のある「ポイッ」という軽いジャンプ音。
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(760, t + 0.035);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.10);

    // 入力と同時に発音。ゆっくり立ち上がる包絡を使わない。
    gain.gain.setValueAtTime(0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.075, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);

    osc.connect(gain);
    gain.connect(this.effects);
    osc.start(t);
    osc.stop(t + 0.12);

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
