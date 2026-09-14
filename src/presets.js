/* Companion-specific geometry for the standalone character study. */
(function (g) {
  const BODY = "M52 119C50 77 79 58 124 58C169 58 191 78 195 118C198 142 205 165 202 187C200 215 180 225 133 225C86 225 55 216 50 192C46 171 53 145 52 119Z";
  const LEFT_EAR = "M57 112C51 92 43 48 48 35C52 24 86 44 112 66L93 117Z";
  const RIGHT_EAR = "M142 66C163 46 192 28 198 36C204 47 197 94 191 113L166 117Z";
  const states = {
    idle: {
      label: "安静", eye: "round", x: 0, roll: 0, y: 0, left: 0, right: 0, scaleX: 1, scaleY: 1, skew: 0, glow: 0.20, gaze: [0, 0],
      eyeSequence: ["round", "soft", "curious", "round"], eyeHold: [3.6, 6.2], blink: [5.5, 9.5], blinkBurst: 3, pose: "rest",
      gazeMotion: { targets: [[0, 0], [1.1, -0.4], [-0.8, 0.3]], hold: [2.6, 4.4] },
      eyeMotion: { drift: [0.65, 0.32], speed: 0.46, phase: 0.2, tilt: 0.35, scale: [0.018, 0.012], vergence: 0.08 },
      gesture: { type: "rest" },
    },
    curious: {
      label: "好奇", eye: "curious", x: 0, roll: -7, y: -2, left: -6, right: 9, scaleX: 1.01, scaleY: .99, skew: -1, glow: 0.28, gaze: [3, -2],
      eyeSequence: ["curious", "alert", "round", "wink", "curious"], eyeHold: [1.15, 2.25], blink: [3.4, 6.2], blinkBurst: 3, pose: "curious",
      gazeMotion: { targets: [[0, 0], [2.3, -0.8], [-1.3, 0.5]], hold: [1.1, 2.2] },
      eyeMotion: { drift: [1.45, 0.65], speed: 0.72, phase: 1.1, tilt: 1.4, scale: [0.04, 0.05], vergence: 0.16 },
      gesture: { type: "curious", rate: .58 },
    },
    listening: {
      label: "倾听", eye: "listening", x: 0, roll: 5, y: -1, left: 6, right: -10, scaleX: .99, scaleY: 1.01, skew: 1, glow: 0.50, gaze: [0, -2],
      eyeSequence: ["listening", "wide", "listening", "soft"], eyeHold: [1.9, 3.5], blink: [3.2, 6.4], blinkBurst: 4, pose: "listening",
      gazeMotion: { targets: [[0, 0], [1.6, -0.3], [0.3, 0.5]], hold: [1.8, 3.2] },
      eyeMotion: { drift: [0.55, 0.45], speed: 0.92, phase: 0.4, tilt: 0.9, scale: [0.025, 0.02], vergence: 0.1 },
      gesture: { type: "listening", rate: 1.8 },
    },
    thinking: {
      label: "思考", eye: "narrow", x: -1, roll: -7, y: 2, left: -14, right: 4, scaleX: .89, scaleY: 1.10, skew: -5.5, glow: 0.85, gaze: [-5, -3],
      eyeSequence: ["narrow", "focused", "curious", "narrow", "wink"], eyeHold: [1.25, 2.4], blink: [3.5, 7], blinkBurst: 3, pose: "thinking",
      gazeMotion: { targets: [[0, 0], [-2.2, -0.2], [1.4, -0.7]], hold: [1.4, 2.8] },
      eyeMotion: { drift: [0.9, 0.5], speed: 0.52, phase: 2, tilt: 1.1, scale: [0.05, 0.035], vergence: 0.12 },
      gesture: { type: "thinking", rate: .72, sway: 2.4, squash: .035, tilt: 1.2, gazeFollow: .68 },
    },
    happy: {
      label: "开心", eye: "happy", x: 0, roll: 0, y: -3, left: 7, right: -7, scaleX: 1.02, scaleY: .98, skew: 0, glow: 0.65, gaze: [0, 0],
      eyeSequence: ["happy", "spark", "round", "wink", "happy"], eyeHold: [1.5, 2.8], blink: [2.8, 5.4], blinkBurst: 3, pose: "happy",
      gazeMotion: { targets: [[0, 0], [1.2, -0.5], [-1.2, -0.2]], hold: [1.6, 2.8] },
      eyeMotion: { drift: [0.85, 0.55], speed: 0.82, phase: 0.8, tilt: 0.7, scale: [0.05, 0.08], vergence: 0.14 },
      gesture: { type: "happy", rate: 1.7 },
    },
    sleeping: {
      label: "睡眠", eye: "sleep", x: 0, roll: 6, y: 6, left: -15, right: 15, scaleX: 1.02, scaleY: .98, skew: 1, glow: 0, gaze: [0, 2],
      eyeSequence: ["sleep"], eyeHold: null, blink: null, pose: "sleeping",
      gazeMotion: { targets: [[0, 0]], hold: [4, 4] },
      eyeMotion: { drift: [0.2, 0.1], speed: 0.5, phase: 0.2, tilt: 0.25, scale: [0.02, 0.02], vergence: 0 },
      gesture: { type: "sleeping" },
    },
    loading: {
      label: "加载", eye: "round", x: 0, roll: -2, y: 0, left: -3, right: 2, scaleX: .98, scaleY: 1.02, skew: -1, glow: 0.58, gaze: [0, -1],
      eyeSequence: ["round", "focused", "round", "wide"], eyeHold: [1.8, 3], blink: null, pose: "thinking", overlay: "loading",
      gazeMotion: { targets: [[0, 0], [-1.4, -0.4]], hold: [1.8, 3] },
      eyeMotion: { drift: [0.6, 0.35], speed: 1.05, phase: 1.4, tilt: 0.8, scale: [0.035, 0.025], vergence: 0.08 },
      gesture: { type: "loading", rate: 1.1, form: "capsule" },
    },
    writing: {
      label: "书写", eye: "curious", x: 2, roll: 7, y: 1, left: 10, right: -7, scaleX: 1.06, scaleY: .95, skew: 4.5, glow: 0.50, gaze: [1, -1],
      eyeSequence: ["curious", "focused", "round", "wink", "curious"], eyeHold: [1.4, 2.6], blink: [3.6, 6.8], blinkBurst: 3, pose: "curious", overlay: "writing",
      gazeMotion: { targets: [[0, 0], [1.8, -0.5], [0.5, 0.5]], hold: [1.2, 2.4] },
      eyeMotion: { drift: [1.2, 0.8], speed: 1.35, phase: 0.7, tilt: 1.9, scale: [0.05, 0.06], vergence: 0.18 },
      gesture: { type: "writing", rate: 2.15, sway: 1.8, tilt: 2.2, bob: .8, cycle: 1.8, stroke: .64, form: "ink" },
    },
    sending: {
      label: "发送", eye: "round", x: 2, roll: -4, y: -1, left: 2, right: -2, scaleX: 1.05, scaleY: .95, skew: -3.5, glow: 0.50, gaze: [0, 0],
      eyeSequence: ["focused", "wide", "round", "wink"], eyeHold: [1.1, 2.4], blink: null, pose: "rest", overlay: "sending",
      gazeMotion: { targets: [[0, 0], [1.2, -0.4]], hold: [1.8, 3.2] },
      eyeMotion: { drift: [1.6, 0.7], speed: 1.8, phase: 1.7, tilt: 2.2, scale: [0.08, 0.04], vergence: 0.22 },
      gesture: { type: "sending", thrust: 12, lift: 2.8, tilt: 3.8, duration: 1.55, prep: .18, launch: .28, settle: .52, form: "launch-core" },
    },
  };

  // Equal point counts let every expression interpolate without topology changes.
  function eyePoints(kind, side) {
    return Array.from({ length: 48 }, (_, i) => {
      const a = i / 48 * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a);
      const radius = kind === "curious" ? (side === 0 ? 13 : 16) : 13;
      if (kind === "happy") return [x * 14, x * x * 11 - 6 + y * 3.5];
      if (kind === "sleep") return [x * 14, (1 - x * x) * 3 + y * 2.5];
      if (kind === "wink") {
        if (side === 0) return [x * 14, (1 - x * x) * 2.1 + y * 1.5];
        return [x * 13.5, y * 12.5];
      }
      if (kind === "wide") return [x * (side === 0 ? 13.5 : 14.5), y * (side === 0 ? 17.5 : 17)];
      if (kind === "alert") return [x * (side === 0 ? 13.5 : 15), y * (side === 0 ? 17 : 16.5)];
      if (kind === "focused") return [x * (side === 0 ? 14 : 15), y * 6.5 - x * 1.25];
      if (kind === "soft") return [x * 14.5, y * 10.2 + (1 - x * x) * 1.2];
      if (kind === "spark") return [x * (side === 0 ? 12.5 : 13.5), y * (side === 0 ? 10.5 : 11.5)];
      return [x * (kind === "listening" ? 11.5 : radius), y * (kind === "narrow" ? 7 : kind === "listening" ? 15 : radius)];
    });
  }
  for (const state of Object.values(states)) {
    state.eyes = [eyePoints(state.eye, 0), eyePoints(state.eye, 1)];
  }
  const eyeForms = {};
  const eyeKinds = new Set([...Object.values(states).map(state => state.eye), "wink", "wide", "alert", "focused", "soft", "spark"]);
  for (const kind of eyeKinds) eyeForms[kind] = [eyePoints(kind, 0), eyePoints(kind, 1)];
  g.COMPANION_PRESETS = { BODY, LEFT_EAR, RIGHT_EAR, states, eyeForms };
})(window);
