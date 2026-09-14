const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function environment() {
  function target() {
    const listeners = new Map();
    return {
      addEventListener(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      dispatch(name, event = {}) { for (const fn of listeners.get(name) || []) fn(event); },
      count(name) { return listeners.get(name)?.size || 0; },
    };
  }
  function element(name) {
    return {
      ...target(), localName: name, namespaceURI: "http://www.w3.org/2000/svg",
      attributes: {}, style: {}, dataset: {}, children: [],
      setAttribute(key, value) { this.attributes[key] = String(value); },
      removeAttribute(key) { delete this.attributes[key]; },
      appendChild(el) { this.children.push(el); },
      replaceChildren(...els) { this.children = els; },
      cloneNode(deep) {
        const copy = element(this.localName);
        Object.assign(copy.attributes, this.attributes);
        Object.assign(copy.style, this.style);
        Object.assign(copy.dataset, this.dataset);
        if (deep) copy.children = this.children.map(child => child.cloneNode(true));
        return copy;
      },
      getBoundingClientRect() { return { left: 0, top: 0, width: 280, height: 280 }; },
    };
  }
  const callbacks = new Map();
  let id = 0, now = 0;
  const media = { ...target(), matches: false };
  const document = { ...target(), hidden: false, documentElement: target(), createElementNS: (_, tag) => element(tag) };
  const window = { ...target(), matchMedia: () => media };
  const context = vm.createContext({
    window, document, performance: { now: () => now },
    requestAnimationFrame(fn) { callbacks.set(++id, fn); return id; },
    cancelAnimationFrame(key) { callbacks.delete(key); },
    XMLSerializer: class {
      serializeToString(el) {
        const attributes = { ...el.attributes };
        if (Object.keys(el.style).length) {
          attributes.style = Object.entries(el.style).map(([key, value]) => `${key}:${value}`).join(";");
        }
        const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(" ");
        return `<${el.localName} ${attrs}>${el.children.map(child => this.serializeToString(child)).join("")}</${el.localName}>`;
      }
    },
  });
  for (const name of ["src/math.js", "src/presets.js", "src/material.js", "src/character.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", name), "utf8"), context);
  }
  return {
    window, document, media, callbacks,
    create(options) { return new window.Companion(element("svg"), options); },
    frame(dt = 16.667) {
      now += dt;
      const queued = [...callbacks.values()];
      callbacks.clear();
      for (const fn of queued) fn(now);
    },
  };
}

test("all companion expressions have compatible, finite geometry", () => {
  const env = environment();
  const states = env.window.COMPANION_PRESETS.states;
  assert.equal(Object.keys(states).length, 9);
  for (const preset of Object.values(states)) {
    for (const eye of preset.eyes) {
      assert.equal(eye.length, 48);
      assert.ok(eye.flat().every(Number.isFinite));
    }
  }
});

function descendants(el) {
  return [el, ...el.children.flatMap(descendants)];
}

function visualTree(bot) {
  return JSON.stringify(descendants(bot.svg).map(el => ({
    tag: el.localName, attributes: el.attributes, style: el.style,
  })));
}

test("material quality disables all enhanced layers and preserves the base silhouette", () => {
  const env = environment(), bot = env.create({ quality: "rich" });
  const m = bot.material;
  assert.equal(m.dots.style.display, "");
  for (const change of [() => bot.setSize(64), () => {
    bot.setSize(280);
    bot.setQuality("minimal");
  }]) {
    change();
    for (const layer of [m.glow, m.material, m.softBody]) assert.equal(layer.style.display, "none");
    assert.equal(m.sharpBody.attributes.mask, "none");
    assert.match(m.sharpBody.attributes.href, /-geometry$/);
  }
  bot.setQuality("balanced");
  assert.equal(m.dots.style.display, "none");
  assert.equal(m.material.style.display, "");
  assert.match(m.sharpBody.attributes.mask, /-sharp\)$/);
  bot.setQuality("rich");
  assert.equal(m.dots.style.display, "");
  bot.setSize(128);
  assert.equal(m.dots.style.display, "none");
  bot.destroy();
});

test("material freezes on pause, hidden and reduced motion without losing its lighting", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "thinking" });
  for (let i = 0; i < 50; i++) env.frame();
  bot.setPaused(true);
  let before = visualTree(bot);
  for (let i = 0; i < 50; i++) env.frame();
  assert.equal(visualTree(bot), before);
  bot.setPaused(false);
  env.frame(); env.frame();
  env.document.hidden = true;
  env.document.dispatch("visibilitychange");
  before = visualTree(bot);
  for (let i = 0; i < 50; i++) env.frame();
  assert.equal(visualTree(bot), before);
  env.document.hidden = false;
  env.document.dispatch("visibilitychange");
  bot.setReducedMotion(true);
  before = visualTree(bot);
  for (let i = 0; i < 50; i++) env.frame();
  assert.equal(visualTree(bot), before);
  assert.ok(Number(bot.glow.attributes.opacity) > .5);
  bot.setIntensity(0);
  assert.equal(visualTree(bot), before);
  bot.setState("sleeping");
  assert.ok(Number(bot.glow.attributes.opacity) < .1);
  bot.destroy();
});

test("color fields circulate while their fixed texture stays stable", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "thinking" });
  const fields = () => Object.values(bot.material.flowGradients).map(el => el.attributes.gradientTransform);
  const before = fields();
  const nodes = descendants(bot.svg).length;
  const noise = descendants(bot.svg).find(el => el.localName === "feTurbulence");
  const seed = JSON.stringify(noise.attributes);
  for (let i = 0; i < 180; i++) env.frame();
  assert.ok(fields().some((value, i) => value !== before[i]));
  assert.equal(descendants(bot.svg).length, nodes);
  assert.equal(JSON.stringify(noise.attributes), seed);
  bot.destroy();
});

test("color flow freezes without resetting on pause, reduced motion or zero intensity", () => {
  const env = environment(), bot = env.create({ quality: "rich" });
  const fields = () => Object.values(bot.material.flowGradients).map(el => el.attributes.gradientTransform);
  for (let i = 0; i < 120; i++) env.frame();
  bot.setPaused(true);
  const paused = fields();
  for (let i = 0; i < 20; i++) env.frame();
  assert.deepEqual(fields(), paused);
  bot.setPaused(false);
  bot.setReducedMotion(true);
  assert.deepEqual(fields(), paused);
  for (let i = 0; i < 20; i++) env.frame();
  assert.deepEqual(fields(), paused);
  bot.setReducedMotion(false);
  env.frame(); env.frame();
  assert.notDeepEqual(fields(), paused);
  bot.setIntensity(0);
  const zero = fields();
  for (let i = 0; i < 120; i++) env.frame();
  assert.deepEqual(fields(), zero);
  bot.setIntensity(1);
  env.frame();
  assert.notDeepEqual(fields(), zero);
  bot.destroy();
});

test("disabled material and static instances do not advance color flow", () => {
  const env = environment(), bot = env.create({ quality: "rich" }), still = env.create({ quality: "rich", static: true });
  for (let i = 0; i < 120; i++) env.frame();
  assert.equal(still.material.flowPhase, 0);
  const phase = bot.material.flowPhase;
  bot.setSize(64);
  for (let i = 0; i < 120; i++) env.frame();
  assert.equal(bot.material.flowPhase, phase);
  bot.setQuality("minimal");
  bot.setSize(280);
  for (let i = 0; i < 120; i++) env.frame();
  assert.equal(bot.material.flowPhase, phase);
  bot.setQuality("balanced");
  env.frame();
  assert.ok(bot.material.flowPhase > phase);
  bot.destroy();
  still.destroy();
});

test("state behavior presets provide sequenced eyes, blink cadence and gaze motion", () => {
  const env = environment();
  const states = env.window.COMPANION_PRESETS.states;
  for (const preset of Object.values(states)) {
    assert.ok(Array.isArray(preset.eyeSequence) && preset.eyeSequence.length >= 1);
    assert.ok(preset.eyeSequence.every(kind => env.window.COMPANION_PRESETS.eyeForms[kind]));
    assert.ok(preset.eyeHold === null || preset.eyeHold.length === 2);
    assert.ok(preset.blink === null || preset.blink.length === 2);
    assert.ok(preset.gazeMotion.targets.length >= 1);
    assert.ok(["x", "scaleX", "scaleY", "skew"].every(key => Number.isFinite(preset[key])));
    assert.ok(preset.gesture?.type);
  }
});

test("action states have distinct form signatures and restart their gesture clock", () => {
  const env = environment(), bot = env.create({ quality: "rich" });
  const states = env.window.COMPANION_PRESETS.states;
  assert.ok(states.thinking.scaleX < 1 && states.thinking.scaleY > 1);
  assert.ok(states.writing.scaleX > 1 && states.writing.scaleY < 1);
  assert.ok(states.sending.scaleX > 1 && states.sending.scaleY < 1);
  assert.notEqual(states.thinking.gesture.type, states.writing.gesture.type);
  assert.notEqual(states.writing.gesture.type, states.sending.gesture.type);
  bot.setState("thinking");
  for (let i = 0; i < 12; i++) env.frame(16.667);
  assert.ok(bot.stateTime > 0);
  bot.setState("writing");
  assert.equal(bot.stateTime, 0);
  for (let i = 0; i < 18; i++) env.frame(16.667);
  const writingTransform = bot.group.attributes.transform;
  bot.setState("sending");
  for (let i = 0; i < 18; i++) env.frame(16.667);
  assert.notEqual(bot.group.attributes.transform, writingTransform);
  bot.destroy();
});

test("action forms replace the cat silhouette and sending resolves back to cat", () => {
  const env = environment(), bot = env.create({ quality: "rich" });
  const shellOpacity = () => Number(bot.material.baseFormOpacity);
  const formOpacity = name => Number(bot.material[name].attributes.opacity);
  const morphOpacity = () => formOpacity("morphForm");

  bot.setState("loading");
  for (let i = 0; i < 34; i++) env.frame(16.667);
  assert.ok(shellOpacity() < .1);
  assert.ok(morphOpacity() > .7);
  assert.ok(formOpacity("loadingForm") > .05);

  bot.setState("writing");
  for (let i = 0; i < 64; i++) env.frame(16.667);
  assert.ok(shellOpacity() < .1);
  assert.ok(morphOpacity() > .7);
  assert.ok(formOpacity("writingForm") > .05);

  bot.setState("sending");
  for (let i = 0; i < 30; i++) env.frame(16.667);
  assert.ok(shellOpacity() < .1);
  assert.ok(morphOpacity() > .7);
  assert.ok(formOpacity("sendingForm") > .05);
  for (let i = 0; i < 72; i++) env.frame(16.667);
  assert.equal(shellOpacity(), 1);
  assert.equal(morphOpacity(), 0);
  assert.equal(formOpacity("sendingForm"), 0);
  bot.destroy();
});

test("action morph is continuous and motion leaves measurable trail energy", () => {
  const env = environment(), bot = env.create({ quality: "rich" });
  const morph = () => bot.material.morphForm.attributes.d;
  bot.setState("loading");
  for (let i = 0; i < 8; i++) env.frame(16.667);
  const loadingStart = morph();
  for (let i = 0; i < 8; i++) env.frame(16.667);
  const loadingMid = morph();
  assert.notEqual(loadingMid, loadingStart);
  assert.ok(loadingMid.includes("C"));

  bot.setState("writing");
  for (let i = 0; i < 24; i++) env.frame(16.667);
  const writingStroke = Number(bot.material.writingStroke.attributes["stroke-width"]);
  const writingParticleOpacity = bot.material.writingParticles
    .reduce((sum, particle) => sum + Number(particle.attributes.opacity), 0);
  assert.ok(writingStroke > 2.75);
  assert.ok(writingParticleOpacity > 0);

  bot.setState("sending");
  for (let i = 0; i < 34; i++) env.frame(16.667);
  assert.ok(Number(bot.material.sendingTrail.attributes["stroke-width"]) >= 2.1);
  assert.ok(Number(bot.material.sendingTrailEcho.attributes.opacity) >= 0);
  assert.ok(bot.material.sendingParticles.some(particle => Number(particle.attributes.rx) > 3.2));
  bot.destroy();
});

test("action hand-offs inherit the current form without a silhouette flash", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "loading" });
  for (let i = 0; i < 30; i++) env.frame(16.667);
  const beforeRing = bot.material.formRing.map(point => [...point]);
  const beforeOpacity = bot.material.formOpacity;

  bot.setState("writing");
  assert.equal(bot.material.formOpacity, beforeOpacity);
  assert.equal(bot.material.formRing.length, beforeRing.length);
  assert.ok(bot.material.formRing.every((point, i) => point.every((value, j) =>
    Math.abs(value - beforeRing[i][j]) < 1e-9)));
  assert.ok(bot.material.baseFormOpacity < .15);

  env.frame(16.667);
  assert.ok(bot.material.formOpacity < beforeOpacity);
  assert.ok(bot.material.baseFormOpacity < .2);

  bot.setState("sending");
  assert.ok(bot.material.formOpacity > .2);
  assert.ok(bot.material.baseFormOpacity < .2);
  bot.destroy();
});

test("sending returns to the cat with a clean opacity hand-off", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "sending" });
  for (let i = 0; i < 35; i++) env.frame(16.667);
  assert.ok(bot.material.formOpacity > .5);
  assert.ok(bot.material.baseFormOpacity < .1);

  bot.setState("idle");
  assert.ok(bot.material.formOpacity > .5);
  assert.ok(bot.material.baseFormOpacity < .1);
  const handoffOpacity = bot.material.formOpacity;
  for (let i = 0; i < 4; i++) env.frame(16.667);
  assert.ok(bot.material.formOpacity < handoffOpacity);
  assert.ok(bot.material.baseFormOpacity > .1);

  for (let i = 0; i < 20; i++) env.frame(16.667);
  assert.equal(bot.material.formOpacity, 0);
  assert.equal(bot.material.baseFormOpacity, 1);
  bot.destroy();
});

test("live states advance internal eye and gaze behavior, while pause freezes it", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "thinking" });
  const initialEye = bot.eyeIndex;
  const initialGaze = [bot.behaviorGazeX.x, bot.behaviorGazeY.x];
  for (let i = 0; i < 240; i++) env.frame(16.667);
  assert.notEqual(bot.eyeIndex, initialEye);
  assert.notDeepEqual([bot.behaviorGazeX.x, bot.behaviorGazeY.x], initialGaze);
  bot.setPaused(true);
  const paused = {
    eyeIndex: bot.eyeIndex,
    eyeMorph: bot.eyeMorph.x,
    gaze: [bot.behaviorGazeX.x, bot.behaviorGazeY.x],
  };
  for (let i = 0; i < 80; i++) env.frame(16.667);
  assert.equal(bot.eyeIndex, paused.eyeIndex);
  assert.equal(bot.eyeMorph.x, paused.eyeMorph);
  assert.deepEqual([bot.behaviorGazeX.x, bot.behaviorGazeY.x], paused.gaze);
  bot.destroy();
});

test("reduced motion settles behavior eyes and gaze without scheduling playback", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "thinking" });
  bot.setReducedMotion(true);
  const eye = bot.eyeIndex;
  const gaze = [bot.behaviorGazeX.x, bot.behaviorGazeY.x];
  for (let i = 0; i < 180; i++) env.frame(16.667);
  assert.equal(bot.eyeIndex, eye);
  assert.equal(bot.eyeMorph.x, 1);
  assert.deepEqual([bot.behaviorGazeX.x, bot.behaviorGazeY.x], gaze);
  assert.equal(env.callbacks.size, 0);
  bot.destroy();
});

test("eyes combine independent micro-motion, expressive forms and stable action focus", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "curious" });
  const transformAt = () => bot.eyeEls.map(eye => eye.attributes.transform);
  const initial = transformAt();
  for (let i = 0; i < 36; i++) env.frame(16.667);
  const moving = transformAt();
  assert.notDeepEqual(moving, initial);
  assert.notEqual(moving[0], moving[1]);

  bot.setState("sending");
  for (let i = 0; i < 18; i++) env.frame(16.667);
  const focused = transformAt();
  assert.ok(focused.every(value => /translate\([^)]* [^)]*\) rotate\([^)]*\) scale\([^)]*\)/.test(value)));
  assert.ok(focused.every(value => !/NaN|Infinity/.test(value)));
  assert.notDeepEqual(focused, moving);

  bot.setState("curious");
  bot.setPaused(true);
  const paused = transformAt();
  for (let i = 0; i < 60; i++) env.frame(16.667);
  assert.deepEqual(transformAt(), paused);
  bot.destroy();
});

test("state changes ease gaze offsets and gesture entry instead of snapping", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "idle" });
  const before = bot.eyeEls.map(eye => eye.attributes.transform);
  bot.setState("curious");

  assert.equal(bot.gazeBaseX.x, 0);
  assert.equal(bot.gazeBaseX.t, 3);
  assert.equal(bot.stateBlend.x, 0);
  assert.deepEqual(bot.eyeEls.map(eye => eye.attributes.transform), before);

  env.frame(16.667);
  env.frame(16.667);
  assert.ok(bot.gazeBaseX.x > 0 && bot.gazeBaseX.x < 3);
  assert.ok(bot.stateBlend.x > 0 && bot.stateBlend.x < 1);

  bot.setState("thinking");
  const entry = bot.group.attributes.transform;
  assert.equal(bot.stateBlend.x, 0);
  assert.equal(bot.stateBlend.t, 1);
  env.frame(16.667);
  assert.notEqual(bot.group.attributes.transform, entry);
  assert.ok(bot.stateBlend.x > 0 && bot.stateBlend.x < 1);
  bot.destroy();
});

test("semantic state overlays stay sparse and freeze with reduced motion", () => {
  const env = environment(), bot = env.create({ quality: "balanced", state: "thinking" });
  const semantic = bot.material.semantic;
  assert.equal(semantic.style.display, "");
  for (let i = 0; i < 90; i++) env.frame(16.667);
  assert.ok(bot.material.thinkingDots.some(dot => Number(dot.attributes.opacity) > 0));
  bot.setState("loading");
  for (let i = 0; i < 30; i++) env.frame(16.667);
  assert.ok(Number(bot.material.loadingArc.attributes.opacity) > 0);
  bot.setState("writing");
  for (let i = 0; i < 30; i++) env.frame(16.667);
  assert.ok(Number(bot.material.writingStroke.attributes.opacity) > 0);
  bot.setState("sending");
  for (let i = 0; i < 30; i++) env.frame(16.667);
  assert.ok(bot.material.sendingParticles.some(particle => Number(particle.attributes.opacity) > 0));
  bot.setReducedMotion(true);
  assert.ok(bot.material.thinkingDots.every(dot => Number(dot.attributes.opacity) === 0));
  assert.equal(Number(bot.material.loadingArc.attributes.opacity), 0);
  assert.equal(Number(bot.material.writingEcho.attributes.opacity), 0);
  assert.equal(Number(bot.material.sendingTrail.attributes.opacity), 0);
  assert.ok(bot.material.sendingParticles.every(particle => Number(particle.attributes.opacity) === 0));
  bot.destroy();
});

test("semantic hand-offs preserve the outgoing layer for a short crossfade", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "loading" });
  for (let i = 0; i < 32; i++) env.frame(16.667);
  bot.setState("writing");
  assert.equal(bot.material.semanticPreviousActive, true);
  assert.ok(bot.material.semanticPrevious.children.length > 0);
  assert.equal(Number(bot.material.semanticPrevious.attributes.opacity), 1);
  for (let i = 0; i < 5; i++) env.frame(16.667);
  assert.ok(Number(bot.material.semanticPrevious.attributes.opacity) < 1);
  assert.ok(Number(bot.material.semanticPrevious.attributes.opacity) > 0);
  for (let i = 0; i < 10; i++) env.frame(16.667);
  assert.equal(bot.material.semanticPreviousActive, false);
  assert.equal(bot.material.semanticPrevious.children.length, 0);
  bot.destroy();
});

test("action overlays are driven by a source gesture and keep their phases distinct", () => {
  const env = environment(), bot = env.create({ quality: "balanced", state: "thinking" });
  let sawGazeLead = false;
  for (let i = 0; i < 300; i++) {
    env.frame(16.667);
    const gaze = Math.hypot(bot.behaviorGazeX.x, bot.behaviorGazeY.x);
    const follow = Math.hypot(bot.poseFollowX.x, bot.poseFollowY.x);
    if (gaze > .05 && follow > .005 && follow < gaze * 1.25) sawGazeLead = true;
  }
  assert.ok(sawGazeLead);

  bot.setState("writing");
  for (let i = 0; i < 18; i++) env.frame(16.667);
  const writingPath = bot.material.writingStroke.attributes.d;
  const pencilTransform = bot.material.writingPencil.attributes.transform;
  assert.match(writingPath, /^M/);
  assert.match(pencilTransform, /translate\(/);
  for (let i = 0; i < 18; i++) env.frame(16.667);
  assert.notEqual(bot.material.writingStroke.attributes.d, writingPath);

  bot.setState("sending");
  for (let i = 0; i < 20; i++) env.frame(16.667);
  assert.ok(Number(bot.material.sendingRing.attributes.opacity) > 0);
  assert.ok(bot.material.sendingParticles.some(particle => Number(particle.attributes.opacity) > 0));
  for (let i = 0; i < 75; i++) env.frame(16.667);
  assert.equal(Number(bot.material.sendingRing.attributes.opacity), 0);
  assert.ok(bot.material.sendingParticles.every(particle => Number(particle.attributes.opacity) === 0));
  bot.destroy();
});

test("rich material uses a sparse tapered particle trail", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "thinking" });
  const particles = bot.material.trailParticles;
  const ribbon = bot.material.ribbonStrokes;
  assert.equal(particles.length, 8);
  assert.equal(ribbon.length, 3);
  assert.ok(ribbon.every(({ path }) => path.attributes.d.includes("C50 81")));
  assert.ok(ribbon.every(({ path }) => path.attributes["pathLength"] === "1"));
  assert.ok(ribbon[0].opacity > ribbon[1].opacity);
  assert.ok(ribbon[1].opacity > ribbon[2].opacity);
  assert.equal(bot.material.ribbon.style.display, "");
  assert.ok(bot.group.children.indexOf(bot.material.trail)
    > bot.group.children.indexOf(bot.material.material));
  assert.ok(particles[0].length >= 6);
  assert.ok(particles[0].width < 1);
  assert.ok(particles.every(({ particle }) => particle.attributes.transform));
  for (const light of bot.material.flowLights) {
    const group = particles.filter(item => item.light === light);
    assert.ok(group.every((item, i) => i === 0 || item.length < group[i - 1].length));
    assert.ok(group.every((item, i) => i === 0 || item.opacity < group[i - 1].opacity));
  }
  const before = particles.map(item => item.particle.attributes.transform);
  for (let i = 0; i < 90; i++) env.frame();
  assert.ok(particles.some((item, i) => item.particle.attributes.transform !== before[i]));
  const ribbonBefore = ribbon.map(({ path }) => path.attributes["stroke-dashoffset"]);
  for (let i = 0; i < 90; i++) env.frame();
  assert.ok(ribbon.some(({ path }, i) => path.attributes["stroke-dashoffset"] !== ribbonBefore[i]));
  bot.setPaused(true);
  const paused = particles.map(item => item.particle.attributes.transform);
  const ribbonPaused = ribbon.map(({ path }) => path.attributes["stroke-dashoffset"]);
  for (let i = 0; i < 30; i++) env.frame();
  assert.deepEqual(particles.map(item => item.particle.attributes.transform), paused);
  assert.deepEqual(ribbon.map(({ path }) => path.attributes["stroke-dashoffset"]), ribbonPaused);
  bot.setSize(64);
  assert.equal(bot.material.trail.style.display, "none");
  assert.equal(bot.material.ribbon.style.display, "none");
  bot.destroy();
});

test("trail history is bounded and velocity responds to motion", () => {
  const env = environment(), bot = env.create({ quality: "rich", state: "thinking", size: 280 });
  for (let i = 0; i < 180; i++) env.frame(16.667);
  assert.ok(bot.material.lightHistory.every(history => history.length <= 96));
  assert.ok(bot.material.lightHistory.every(history =>
    history.length < 2 || history.at(-1).time - history[0].time <= 1.05 + 0.05));
  const calm = bot.material.flowVelocity;
  bot.setIntensity(1);
  for (let i = 0; i < 45; i++) env.frame(16.667);
  assert.ok(bot.material.flowVelocity > calm);
  const phase = bot.material.flowPhase;
  const velocity = bot.material.flowVelocity;
  bot.setPaused(true);
  for (let i = 0; i < 30; i++) env.frame(16.667);
  assert.equal(bot.material.flowPhase, phase);
  assert.equal(bot.material.flowVelocity, velocity);
  bot.destroy();
});

test("material geometry, fixed texture and local references survive every state and export", () => {
  const env = environment(), a = env.create({ quality: "rich" }), b = env.create({ static: true });
  const count = descendants(a.svg).length;
  const idsA = descendants(a.svg).map(el => el.attributes.id).filter(Boolean);
  const idsB = descendants(b.svg).map(el => el.attributes.id).filter(Boolean);
  assert.ok(idsA.every(id => !idsB.includes(id)));
  assert.equal(new Set(idsA).size, idsA.length);
  const noise = descendants(a.svg).find(el => el.localName === "feTurbulence");
  const noiseBefore = JSON.stringify(noise.attributes);
  for (const state of Object.keys(env.window.COMPANION_PRESETS.states)) {
    a.setState(state);
    for (let i = 0; i < 60; i++) env.frame();
    assert.equal(descendants(a.svg).length, count);
    assert.doesNotMatch(visualTree(a), /NaN|Infinity/);
  }
  assert.equal(JSON.stringify(noise.attributes), noiseBefore);
  for (const surface of ["light", "dark"]) {
    a.setSurface(surface);
    for (const quality of ["minimal", "balanced", "rich"]) {
      a.setQuality(quality);
      const exported = a.exportSVG();
      assert.doesNotMatch(exported, /NaN|Infinity|<script|<image|<animate/);
      const ids = new Set([...exported.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
      for (const match of exported.matchAll(/(?:url\(#|href="#)([^")]+)/g)) {
        assert.ok(ids.has(match[1]), `missing local definition: ${match[1]}`);
      }
    }
  }
  a.destroy(); b.destroy();
});

test("shared clock, pause/resume, hidden tab and destroy lifecycle", () => {
  const env = environment();
  const a = env.create(), b = env.create();
  assert.equal(env.callbacks.size, 1);
  assert.equal(env.window.count("pointermove"), 1);
  env.frame(); env.frame();
  const before = a.time;
  a.setPaused(true);
  for (let i = 0; i < 20; i++) env.frame();
  assert.equal(a.time, before);
  assert.ok(b.time > a.time);
  a.setPaused(false);
  env.frame();
  assert.ok(a.time - before < 0.02);
  env.document.hidden = true;
  env.document.dispatch("visibilitychange");
  assert.equal(env.callbacks.size, 0);
  env.document.hidden = false;
  env.document.dispatch("visibilitychange");
  assert.equal(env.callbacks.size, 1);
  a.destroy(); a.destroy(); b.destroy();
  assert.equal(env.callbacks.size, 0);
  assert.equal(env.window.count("pointermove"), 0);
  assert.equal(env.media.count("change"), 0);
});

test("paused expression changes render immediately and cannot trigger a hop", () => {
  const env = environment(), bot = env.create({ paused: true });
  const old = bot.eyeEls[0].attributes.d;
  bot.setState("happy");
  assert.notEqual(bot.eyeEls[0].attributes.d, old);
  assert.equal(bot.morph.x, 1);
  assert.equal(bot.play(), false);
  assert.equal(env.callbacks.size, 0);
  assert.equal(bot.setState("unknown"), false);
  assert.equal(bot.state, "happy");
});

test("reduced motion removes continuous frames, hops and pointer motion", () => {
  const env = environment(), bot = env.create();
  bot.setReducedMotion(true);
  env.frame();
  assert.equal(env.callbacks.size, 0);
  const before = bot.group.attributes.transform;
  env.window.dispatch("pointermove", { clientX: 200, clientY: 200 });
  env.frame();
  assert.equal(bot.group.attributes.transform, before);
  assert.equal(bot.play(), false);
  bot.setState("sleeping");
  assert.equal(bot.morph.x, 1);
  bot.setReducedMotion(false);
  assert.equal(env.callbacks.size, 1);
  env.media.matches = true;
  env.media.dispatch("change");
  assert.equal(bot.reduced, true);
  bot.setReducedMotion(false);
  assert.equal(bot.reduced, true);
});

test("64px and minimal quality remove glow; all states render finite SVG", () => {
  const env = environment(), bot = env.create();
  assert.equal(bot.setSize(64), true);
  assert.equal(bot.glow.style.display, "none");
  assert.equal(bot.setSize(NaN), false);
  bot.setSize(280);
  bot.setQuality("minimal");
  assert.equal(bot.glow.style.display, "none");
  bot.setQuality("rich");
  assert.equal(bot.glow.style.display, "");
  for (const state of Object.keys(env.window.COMPANION_PRESETS.states)) {
    bot.setState(state);
    for (let i = 0; i < 90; i++) env.frame();
    for (const el of [bot.group, bot.leftEar, bot.rightEar, ...bot.eyeEls]) {
      assert.doesNotMatch(JSON.stringify(el.attributes), /NaN|Infinity/);
    }
  }
});
