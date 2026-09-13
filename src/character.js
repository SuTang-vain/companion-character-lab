/* One clock and one set of global listeners serve every mounted companion. */
(function (g) {
  const { spring, stepSpring, springSteps, clamp, lerpPoly, polyPath } = g.GROK_MATH;
  const { states, eyeForms } = g.COMPANION_PRESETS;
  const NS = "http://www.w3.org/2000/svg";
  const instances = new Set();
  let frame = null, last = null, nextId = 0;
  let media = null;

  function wantsFrame(bot) {
    return !bot.destroyed && !bot.paused && !bot.reduced && !bot.static;
  }

  function wake() {
    if (frame == null && !document.hidden && [...instances].some(wantsFrame)) {
      last = null;
      frame = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    frame = null;
    const dt = last == null ? 0 : clamp((now - last) / 1000, 0, 0.05);
    last = now;
    for (const bot of instances) if (wantsFrame(bot)) bot.update(dt);
    if (!document.hidden && [...instances].some(wantsFrame)) frame = requestAnimationFrame(tick);
    else last = null;
  }

  function pointerMove(event) {
    for (const bot of instances) {
      if (!bot.followPointer || bot.reduced || bot.paused || bot.static || bot.state === "sleeping") continue;
      const rect = bot.svg.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      bot.gazeX.t = clamp((event.clientX - rect.left - rect.width / 2) / rect.width, -1, 1) * 7;
      bot.gazeY.t = clamp((event.clientY - rect.top - rect.height / 2) / rect.height, -1, 1) * 5;
    }
  }

  function pointerLeave() {
    for (const bot of instances) bot.gazeX.t = bot.gazeY.t = 0;
  }

  function visibilityChange() {
    if (document.hidden) {
      if (frame != null) cancelAnimationFrame(frame);
      frame = last = null;
    } else wake();
  }

  function mediaChange() {
    for (const bot of instances) bot.setReducedMotion(bot.requestedReduced);
  }

  function attach(bot) {
    if (!instances.size) {
      media = g.matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener("change", mediaChange);
      g.addEventListener("pointermove", pointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", pointerLeave);
      document.addEventListener("visibilitychange", visibilityChange);
    }
    instances.add(bot);
  }

  function detach(bot) {
    instances.delete(bot);
    if (!instances.size) {
      if (frame != null) cancelAnimationFrame(frame);
      frame = last = null;
      media.removeEventListener("change", mediaChange);
      g.removeEventListener("pointermove", pointerMove);
      document.documentElement.removeEventListener("pointerleave", pointerLeave);
      document.removeEventListener("visibilitychange", visibilityChange);
      media = null;
    }
  }

  function node(tag, attributes, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes || {})) el.setAttribute(name, value);
    if (parent) parent.appendChild(el);
    return el;
  }

  function delayFor(range, first = false) {
    if (range == null) return Infinity;
    if (Number.isFinite(range)) return Math.max(0, range);
    const min = Math.max(0, Number(range[0]) || 0);
    const max = Math.max(min, Number(range[1]) || min);
    return first ? min : min + Math.random() * (max - min);
  }

  class Companion {
    constructor(svg, options = {}) {
      if (!svg || svg.namespaceURI !== NS || svg.localName !== "svg") {
        throw new TypeError("Companion requires an SVG element");
      }
      this.svg = svg;
      this.destroyed = false;
      this.static = !!options.static;
      this.paused = !!options.paused;
      this.followPointer = options.followPointer !== false;
      this.requestedReduced = !!options.reducedMotion;
      this.quality = options.quality || "balanced";
      this.size = Number.isFinite(options.size) ? clamp(options.size, 24, 1024) : 280;
      this.intensity = Number.isFinite(options.intensity) ? clamp(options.intensity, 0, 1) : 0.7;
      this.surface = options.surface === "dark" ? "dark" : "light";
      this.time = 0;
      this.blinkAt = Infinity;
      this.blinkStart = -100;
      this.bounceAt = -100;
      this.morph = spring(1);
      this.eyeMorph = spring(1);
      this.gazeX = spring(0);
      this.gazeY = spring(0);
      this.behaviorGazeX = spring(0);
      this.behaviorGazeY = spring(0);
      this.poseFollowX = spring(0);
      this.poseFollowY = spring(0);
      this.values = Object.fromEntries(["x", "roll", "y", "left", "right", "scaleX", "scaleY", "skew", "glow"].map(key => [key, spring(key === "scaleX" || key === "scaleY" ? 1 : 0)]));
      this.state = states[options.state] ? options.state : "idle";
      this.fromEyes = states[this.state].eyes;
      this.eyeFrom = states[this.state].eyes;
      this.eyeTo = states[this.state].eyes;
      this.eyeSequence = [states[this.state].eye];
      this.eyeIndex = 0;
      this.eyeNextAt = Infinity;
      this.gazeIndex = 0;
      this.gazeNextAt = Infinity;
      this.stateTime = 0;
      this.build();
      attach(this);
      this.reduced = this.requestedReduced || media.matches;
      this.setState(this.state, true);
      this.setSurface(this.surface);
      wake();
    }

    build() {
      const id = `companion-${++nextId}`;
      this.svg.replaceChildren();
      this.svg.setAttribute("viewBox", "0 0 256 256");
      this.svg.setAttribute("role", "img");
      this.svg.style.width = `${this.size}px`;
      this.svg.style.height = `${this.size}px`;
      this.svg.style.overflow = "visible";
      const defs = node("defs", {}, this.svg);
      const shadowBlur = node("filter", { id: `${id}-shadow`, x: "-50%", y: "-150%", width: "200%", height: "400%" }, defs);
      node("feGaussianBlur", { stdDeviation: "4" }, shadowBlur);
      this.shadow = node("ellipse", { cx: "130", cy: "232", rx: "59", ry: "4", fill: "#101214", opacity: ".1", filter: `url(#${id}-shadow)` }, this.svg);
      this.group = node("g", {}, this.svg);
      this.material = new g.CompanionMaterial(defs, this.group, id);
      this.leftEar = this.material.leftEar;
      this.rightEar = this.material.rightEar;
      this.body = this.material.body;
      this.glow = this.material.glow;
      this.eyeEls = [0, 1].map(() => node("path", { fill: "#fff" }, this.group));
      this.setQuality(this.quality);
    }

    setState(name, immediate = false) {
      if (this.destroyed || !states[name]) return false;
      const currentEyes = this.currentEyePolys();
      const changed = name !== this.state;
      if (changed) this.bounceAt = -100;
      this.state = name;
      this.stateTime = 0;
      const preset = states[name];
      this.svg.setAttribute("aria-label", `Companion · ${preset.label}`);
      this.svg.dataset.state = name;
      this.fromEyes = currentEyes;
      this.morph.x = 0;
      this.morph.v = 0;
      this.morph.t = 1;
      this.eyeFrom = preset.eyes;
      this.eyeTo = preset.eyes;
      this.eyeMorph.x = 1;
      this.eyeMorph.v = 0;
      this.eyeMorph.t = 1;
      this.eyeSequence = preset.eyeSequence || [preset.eye];
      this.eyeIndex = 0;
      this.eyeNextAt = this.time + delayFor(preset.eyeHold, true);
      this.gazeIndex = 0;
      this.gazeNextAt = this.time + (preset.gazeMotion?.targets?.length > 1 ? 0.35 : Infinity);
      this.behaviorGazeX.x = this.behaviorGazeX.t = this.behaviorGazeX.v = 0;
      this.behaviorGazeY.x = this.behaviorGazeY.t = this.behaviorGazeY.v = 0;
      this.poseFollowX.x = this.poseFollowX.t = this.poseFollowX.v = 0;
      this.poseFollowY.x = this.poseFollowY.t = this.poseFollowY.v = 0;
      for (const [key, value] of Object.entries(this.values)) value.t = preset[key];
      this.blinkStart = -100;
      this.blinkAt = this.time + delayFor(preset.blink, true);
      if (name === "sleeping") {
        this.gazeX.x = this.gazeX.t = this.gazeX.v = 0;
        this.gazeY.x = this.gazeY.t = this.gazeY.v = 0;
      }
      if (changed && name === "happy" && !this.reduced && !this.paused) this.play("bounce");
      if (immediate || this.reduced || this.static || this.paused) {
        this.material.snapForm();
        this.settle();
      }
      this.paint();
      wake();
      return true;
    }

    settle() {
      for (const s of [this.morph, this.eyeMorph, this.behaviorGazeX, this.behaviorGazeY, this.poseFollowX, this.poseFollowY, ...Object.values(this.values)]) {
        s.x = s.t;
        s.v = 0;
      }
    }

    setPaused(value) {
      this.paused = !!value;
      wake();
    }

    setReducedMotion(value) {
      this.requestedReduced = !!value;
      this.reduced = this.requestedReduced || !!media?.matches;
      this.bounceAt = this.blinkStart = -100;
      this.gazeX.x = this.gazeX.t = this.gazeX.v = 0;
      this.gazeY.x = this.gazeY.t = this.gazeY.v = 0;
      this.behaviorGazeX.x = this.behaviorGazeX.t = this.behaviorGazeX.v = 0;
      this.behaviorGazeY.x = this.behaviorGazeY.t = this.behaviorGazeY.v = 0;
      this.poseFollowX.x = this.poseFollowX.t = this.poseFollowX.v = 0;
      this.poseFollowY.x = this.poseFollowY.t = this.poseFollowY.v = 0;
      if (this.reduced) this.settle();
      this.paint();
      wake();
    }

    setFollowPointer(value) {
      this.followPointer = !!value;
      if (!value) this.gazeX.t = this.gazeY.t = 0;
    }

    setIntensity(value) {
      this.intensity = clamp(Number(value) || 0, 0, 1);
      if (this.reduced || this.static || this.paused) this.paint();
    }

    setQuality(value) {
      this.quality = ["minimal", "balanced", "rich"].includes(value) ? value : "balanced";
      if (this.material) this.material.configure(this.quality, this.size);
      if (this.group) this.paint();
    }

    setSurface(surface) {
      this.surface = surface === "dark" ? "dark" : "light";
      this.material.setSurface(this.surface);
      this.shadow.setAttribute("opacity", this.surface === "dark" ? ".35" : ".1");
      this.svg.dataset.surface = this.surface;
      this.paint();
    }

    setSize(value) {
      const size = Number(value);
      if (!Number.isFinite(size) || size < 24 || size > 1024) return false;
      this.size = size;
      this.svg.style.width = this.svg.style.height = `${size}px`;
      this.setQuality(this.quality);
      return true;
    }

    play(event = "bounce") {
      if (event !== "bounce" || this.destroyed || this.paused || this.reduced || this.static || this.intensity === 0 || this.state === "sleeping") return false;
      if (this.time - this.bounceAt < 0.85) return false;
      this.bounceAt = this.time;
      wake();
      return true;
    }

    currentEyePolys() {
      const state = states[this.state];
      const stateMorph = clamp(this.morph.x, 0, 1);
      const stateEyes = this.fromEyes.map((poly, i) => lerpPoly(poly, state.eyes[i], stateMorph));
      if (stateMorph < 0.999 || !this.eyeFrom || !this.eyeTo) return stateEyes;
      const eyeMorph = clamp(this.eyeMorph.x, 0, 1);
      return this.eyeFrom.map((poly, i) => lerpPoly(poly, this.eyeTo[i], eyeMorph));
    }

    beginEyeMorph(kind) {
      const target = eyeForms[kind] || states[this.state].eyes;
      this.eyeFrom = this.currentEyePolys();
      this.eyeTo = target;
      this.eyeMorph.x = 0;
      this.eyeMorph.v = 0;
      this.eyeMorph.t = 1;
    }

    advanceBehavior(preset) {
      if (this.eyeSequence.length > 1 && this.time >= this.eyeNextAt) {
        this.eyeIndex = (this.eyeIndex + 1) % this.eyeSequence.length;
        this.beginEyeMorph(this.eyeSequence[this.eyeIndex]);
        this.eyeNextAt = this.time + delayFor(preset.eyeHold);
      }
      const motion = preset.gazeMotion;
      if (motion?.targets?.length && this.time >= this.gazeNextAt) {
        const target = motion.targets[this.gazeIndex % motion.targets.length];
        this.gazeIndex += 1;
        this.behaviorGazeX.t = target[0];
        this.behaviorGazeY.t = target[1];
        this.gazeNextAt = this.time + delayFor(motion.hold);
      }
    }

    update(dt) {
      this.time += dt;
      this.stateTime += dt;
      const preset = states[this.state];
      if (this.time >= this.blinkAt && preset.blink && this.state !== "sleeping") {
        this.blinkStart = this.time;
        this.blinkAt = this.time + delayFor(preset.blink);
      }
      this.advanceBehavior(preset);
      const poseFollow = preset.gesture?.type === "thinking" ? (preset.gesture.gazeFollow || .68) : 0;
      this.poseFollowX.t = this.behaviorGazeX.x * poseFollow;
      this.poseFollowY.t = this.behaviorGazeY.x * poseFollow;
      const steps = springSteps(dt);
      for (let i = 0; i < steps; i++) {
        stepSpring(this.morph, 13, 1, dt / steps);
        stepSpring(this.eyeMorph, 9, 0.92, dt / steps);
        for (const value of Object.values(this.values)) stepSpring(value, 11, 1, dt / steps);
        stepSpring(this.gazeX, 13, 1, dt / steps);
        stepSpring(this.gazeY, 13, 1, dt / steps);
        stepSpring(this.behaviorGazeX, 10, 0.95, dt / steps);
        stepSpring(this.behaviorGazeY, 10, 0.95, dt / steps);
        stepSpring(this.poseFollowX, 5.5, 1, dt / steps);
        stepSpring(this.poseFollowY, 5.5, 1, dt / steps);
      }
      this.material.advance(dt, this.values.glow.x, this.intensity);
      this.paint();
    }

    paint() {
      if (!this.eyeEls || this.destroyed) return;
      const p = states[this.state], v = this.values;
      const still = this.reduced || this.static;
      const t = still ? 0 : this.time;
      const strength = still ? 0 : this.intensity;
      const breathingRate = p.pose === "sleeping" ? 1.3 : p.pose === "thinking" ? 1.25 : 1.7;
      const breathing = Math.sin(t * breathingRate);
      const gesture = p.gesture || {};
      const gestureTime = still ? 0 : this.stateTime;
      const gestureWave = Math.sin(gestureTime * (gesture.rate || 1));
      let actionX = 0, actionY = 0, actionRoll = 0, actionSkew = 0;
      let actionScaleX = 0, actionScaleY = 0;
      if (!still) {
        if (gesture.type === "thinking") {
          const compression = (Math.sin(gestureTime * (gesture.rate || .72) * .52 + 1.2) + 1) * .5;
          const focusX = this.poseFollowX.x;
          const focusY = this.poseFollowY.x;
          actionX = gestureWave * (gesture.sway || 0) * .35 * strength + focusX * .72 * strength;
          actionY = compression * .75 * strength;
          actionY += focusY * .18 * strength;
          actionRoll = gestureWave * (gesture.tilt || 0) * .45 * strength + focusX * .68 * strength;
          actionSkew = gestureWave * .55 * strength + focusX * .2 * strength;
          actionScaleX = -compression * (gesture.squash || 0) * strength;
          actionScaleY = compression * (gesture.squash || 0) * .8 * strength;
        } else if (gesture.type === "writing") {
          const cycle = gesture.cycle || 1.8;
          const cyclePhase = (gestureTime % cycle) / cycle;
          const strokeEnd = gesture.stroke || .64;
          const penDown = cyclePhase < strokeEnd;
          const strokePhase = penDown ? cyclePhase / strokeEnd : 1;
          const strokePulse = penDown ? Math.sin(strokePhase * Math.PI) : 0;
          const strokeSway = penDown ? Math.sin(strokePhase * Math.PI * 2) : 0;
          actionX = strokeSway * (gesture.sway || 0) * strength;
          actionY = -strokePulse * (gesture.bob || 0) * strength;
          actionRoll = strokeSway * (gesture.tilt || 0) * strength;
          actionSkew = -strokeSway * .72 * strength;
          actionScaleX = strokePulse * .018 * strength;
          actionScaleY = -strokePulse * .012 * strength;
        } else if (gesture.type === "sending") {
          const duration = gesture.duration || 1.55;
          const prepEnd = gesture.prep || .18;
          const launchEnd = prepEnd + (gesture.launch || .28);
          const settleStart = duration - (gesture.settle || .52);
          const smooth = value => value * value * (3 - 2 * value);
          if (gestureTime < prepEnd) {
            const prep = smooth(gestureTime / prepEnd);
            actionX = -2.2 * prep * strength;
            actionScaleX = -.018 * prep * strength;
            actionScaleY = .012 * prep * strength;
          } else if (gestureTime < launchEnd) {
            const launch = smooth((gestureTime - prepEnd) / (launchEnd - prepEnd));
            actionX = (-2.2 + (gesture.thrust || 0) * launch) * strength;
            actionY = -(gesture.lift || 0) * launch * strength;
            actionRoll = -(gesture.tilt || 0) * launch * strength;
            actionSkew = -1.8 * launch * strength;
            actionScaleX = .075 * launch * strength;
            actionScaleY = -.045 * launch * strength;
          } else if (gestureTime < settleStart) {
            const flight = 1 - smooth((gestureTime - launchEnd) / Math.max(.01, settleStart - launchEnd));
            actionX = (gesture.thrust || 0) * (.18 + .82 * flight) * strength;
            actionY = -(gesture.lift || 0) * flight * strength;
            actionRoll = -(gesture.tilt || 0) * flight * strength;
            actionSkew = -1.8 * flight * strength;
            actionScaleX = .075 * flight * strength;
            actionScaleY = -.045 * flight * strength;
          } else if (gestureTime < duration) {
            const rebound = 1 - smooth((gestureTime - settleStart) / Math.max(.01, duration - settleStart));
            actionX = (gesture.thrust || 0) * .18 * rebound * strength;
            actionY = -(gesture.lift || 0) * .16 * rebound * strength;
            actionRoll = -(gesture.tilt || 0) * .18 * rebound * strength;
            actionSkew = -.32 * rebound * strength;
            actionScaleX = .014 * rebound * strength;
            actionScaleY = -.008 * rebound * strength;
          }
        }
      }
      const elapsed = this.time - this.bounceAt;
      // A short anticipation and landing keep the one-shot bounce from snapping.
      let hop = 0, bounceSquash = 0;
      if (!still && elapsed >= 0 && elapsed < 0.85) {
        if (elapsed < 0.13) {
          const k = Math.sin(elapsed / 0.13 * Math.PI);
          hop = k * 2 * strength;
          bounceSquash = -0.045 * k * strength;
        } else if (elapsed < 0.65) {
          const k = (elapsed - 0.13) / 0.52;
          hop = -4 * k * (1 - k) * 17 * strength;
          bounceSquash = 0.025 * Math.sin(k * Math.PI) * strength;
        } else bounceSquash = -0.028 * Math.sin((elapsed - 0.65) / 0.2 * Math.PI) * strength;
      }
      const nod = p.pose === "listening" ? Math.sin(t * 1.8) * 1.3 * strength : 0;
      const drift = p.pose === "thinking" ? Math.sin(t * 0.52) * 1.4 * strength
        : p.pose === "curious" ? Math.sin(t * 0.58) * 1.1 * strength : 0;
      const x = v.x.x + actionX;
      const y = v.y.x + breathing * (p.pose === "sleeping" ? 1.2 : p.pose === "thinking" ? 1.1 : 1.5) * strength + hop + nod + drift + actionY;
      const roll = v.roll.x + Math.sin(t * (p.pose === "curious" ? 0.7 : 0.8))
        * (p.pose === "thinking" ? 0.65 : 0.8) * strength;
      const sx = Math.max(.78, v.scaleX.x + actionScaleX);
      const sy = Math.max(.78, v.scaleY.x + breathing * 0.008 * strength + bounceSquash + actionScaleY);
      const skew = v.skew.x + actionSkew;
      this.group.setAttribute("transform", `translate(${(128 + x).toFixed(3)} ${(134 + y).toFixed(3)}) rotate(${(roll + actionRoll).toFixed(3)}) skewX(${skew.toFixed(3)}) scale(${(sx / sy).toFixed(5)} ${sy.toFixed(5)}) translate(-128 -134)`);
      this.leftEar.setAttribute("transform", `rotate(${(v.left.x + Math.sin(t * 1.1) * strength + actionRoll * .45).toFixed(3)} 84 95)`);
      this.rightEar.setAttribute("transform", `rotate(${(v.right.x - actionRoll * .3).toFixed(3)} 171 95)`);
      this.shadow.setAttribute("cx", (130 + x * .28).toFixed(2));
      this.shadow.setAttribute("rx", (62 + hop * 0.6 + Math.abs(actionX) * .35).toFixed(2));
      this.material.paint(v.glow.x, t, strength, this.surface, this.state, this.stateTime, p.gesture);
      const blinkAge = this.time - this.blinkStart;
      const blink = !still && blinkAge >= 0 && blinkAge < 0.22
        ? Math.max(0.08, 1 - Math.sin(blinkAge / 0.22 * Math.PI)) : 1;
      const morph = clamp(this.morph.x, 0, 1);
      const gazeX = still ? 0 : this.gazeX.x + this.behaviorGazeX.x;
      const gazeY = still ? 0 : this.gazeY.x + this.behaviorGazeY.x;
      const eyes = this.currentEyePolys();
      const eyeOpacity = Math.max(0, 1 - (this.material.formBlend || 0) * 1.7);
      this.eyeEls.forEach((eye, i) => {
        eye.setAttribute("d", polyPath(eyes[i]));
        eye.setAttribute("opacity", eyeOpacity.toFixed(3));
        eye.setAttribute("transform", `translate(${(i === 0 ? 91 : 160) + p.gaze[0] + gazeX} ${133 + p.gaze[1] + gazeY}) scale(1 ${blink})`);
      });
    }

    snapshot() {
      return { state: this.state, paused: this.paused, reduced: this.reduced, time: this.time, quality: this.quality, size: this.size, surface: this.surface };
    }

    exportSVG() {
      const copy = this.svg.cloneNode(true);
      copy.removeAttribute("style");
      copy.removeAttribute("class");
      copy.removeAttribute("id");
      copy.setAttribute("xmlns", NS);
      copy.setAttribute("width", this.size);
      copy.setAttribute("height", this.size);
      // Padding preserves ear rotation and glow at the edge of the exported image.
      copy.setAttribute("viewBox", "-12 -12 280 280");
      return new XMLSerializer().serializeToString(copy);
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      detach(this);
      this.svg.replaceChildren();
    }
  }

  g.Companion = Companion;
})(window);
