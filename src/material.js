/* All material layers share local geometry and remain self-contained on export. */
(function (g) {
  const NS = "http://www.w3.org/2000/svg";
  const { BODY, LEFT_EAR, RIGHT_EAR } = g.COMPANION_PRESETS;
  const { flattenPath } = g.GROK_MATH;
  const MORPH_POINTS = 64;
  const TAU = Math.PI * 2;
  const MATERIAL_PARAMS = Object.freeze({
    flowBaseSpeed: .22,
    flowActivitySpeed: .12,
    orbitX: 58,
    orbitY: 64,
    trailOrbitX: 63,
    trailOrbitY: 69,
    trailHistorySeconds: 1.05,
    trailMaxSamples: 96,
  });
  const SEMANTIC_CROSSFADE_SECONDS = .18;
  const SEMANTIC_STATES = new Set(["thinking", "loading", "writing", "sending"]);
  const RIBBON_PATH = "M47 121C50 81 83 47 126 45C171 43 204 77 209 121";

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function smooth(value) {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  }

  function easeOut(value) {
    const t = clamp(value);
    return 1 - (1 - t) ** 3;
  }

  function closedSpline(points) {
    if (!points.length) return "M0 0Z";
    let d = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
    for (let i = 0; i < points.length; i++) {
      const previous = points[(i - 1 + points.length) % points.length];
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const after = points[(i + 2) % points.length];
      d += `C${(current[0] + (next[0] - previous[0]) / 6).toFixed(2)} ${(current[1] + (next[1] - previous[1]) / 6).toFixed(2)} `
        + `${(next[0] - (after[0] - current[0]) / 6).toFixed(2)} ${(next[1] - (after[1] - current[1]) / 6).toFixed(2)} `
        + `${next[0].toFixed(2)} ${next[1].toFixed(2)}`;
    }
    return `${d}Z`;
  }

  function resampleRing(points, count = MORPH_POINTS) {
    const source = points.slice();
    if (source.length > 1) {
      const first = source[0], last = source[source.length - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) < .01) source.pop();
    }
    if (source.length < 2) return Array.from({ length: count }, () => [128, 128]);
    const lengths = [];
    let total = 0;
    for (let i = 0; i < source.length; i++) {
      const a = source[i], b = source[(i + 1) % source.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      lengths.push(length);
      total += length;
    }
    const result = [];
    for (let i = 0; i < count; i++) {
      let distance = total * i / count;
      let segment = 0;
      while (segment < lengths.length - 1 && distance > lengths[segment]) {
        distance -= lengths[segment++];
      }
      const a = source[segment], b = source[(segment + 1) % source.length];
      const t = lengths[segment] ? distance / lengths[segment] : 0;
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return result;
  }

  function ringCenter(ring) {
    const sum = ring.reduce((acc, point) => ({ x: acc.x + point[0], y: acc.y + point[1] }), { x: 0, y: 0 });
    return { x: sum.x / ring.length, y: sum.y / ring.length };
  }

  function centerRing(ring, x = 128, y = 132) {
    const center = ringCenter(ring);
    return ring.map(([px, py]) => [px - center.x + x, py - center.y + y]);
  }

  function rotateRing(ring, angle, cx, cy, scaleX = 1, scaleY = 1) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return ring.map(([px, py]) => {
      const x = (px - cx) * scaleX;
      const y = (py - cy) * scaleY;
      return [cx + x * cos - y * sin, cy + x * sin + y * cos];
    });
  }

  function translateRing(ring, x, y) {
    return ring.map(([px, py]) => [px + x, py + y]);
  }

  function morphRing(from, to, t) {
    return from.map((point, i) => [
      point[0] + (to[i][0] - point[0]) * t,
      point[1] + (to[i][1] - point[1]) * t,
    ]);
  }

  function alignRing(ring, reference) {
    let best = ring;
    let bestScore = Infinity;
    for (let offset = 0; offset < ring.length; offset++) {
      let score = 0;
      for (let i = 0; i < reference.length; i++) {
        const point = ring[(i + offset) % ring.length];
        const target = reference[i];
        score += (point[0] - target[0]) ** 2 + (point[1] - target[1]) ** 2;
      }
      if (score < bestScore) {
        bestScore = score;
        best = Array.from({ length: ring.length }, (_, i) => ring[(i + offset) % ring.length]);
      }
    }
    return best;
  }

  function ellipseRing(cx, cy, rx, ry, count = MORPH_POINTS) {
    return Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + TAU * i / count;
      return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
    });
  }

  const SOURCE_RING = resampleRing(flattenPath(BODY, 3));
  const CAPSULE_RING = alignRing(centerRing(resampleRing(flattenPath(
    "M128 63C155 63 172 89 172 132C172 175 155 201 128 201C101 201 84 175 84 132C84 89 101 63 128 63Z", 3,
  )), 128, 132), SOURCE_RING);
  const INK_RING = alignRing(centerRing(resampleRing(flattenPath(
    "M-7 8C-3 12 3 12 8 7L23 -28C25 -34 20 -41 14 -39L-5 2Z", 3,
  )), 128, 132), SOURCE_RING);
  const CORE_RING = alignRing(ellipseRing(128, 132, 25, 21), SOURCE_RING);

  function pathFromPoints(points) {
    if (!points.length) return "M0 0";
    if (points.length === 1) return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    let d = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1];
      const current = points[i];
      const midX = (previous.x + current.x) * .5;
      const midY = (previous.y + current.y) * .5;
      d += ` Q${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
      if (i === points.length - 1) d += ` Q${current.x.toFixed(2)} ${current.y.toFixed(2)} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
    }
    return d;
  }

  function node(tag, attributes, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes || {})) el.setAttribute(name, value);
    if (parent) parent.appendChild(el);
    return el;
  }

  class CompanionMaterial {
    constructor(defs, parent, id) {
      this.flowPhase = 0;
      this.flowTime = 0;
      this.flowVelocity = 0;
      this.semanticState = null;
      this.writingSamples = [];
      this.writingSpeed = 0;
      this.writingLastSample = null;
      this.sendingSpeed = 0;
      this.formBlend = 0;
      this.baseFormOpacity = 1;
      this.formState = null;
      this.formRing = SOURCE_RING.map(point => [...point]);
      this.formFrom = SOURCE_RING.map(point => [...point]);
      this.formOpacity = 0;
      this.formOpacityFrom = 0;
      this.skipFormTransition = false;
      this.formTransitionFromActive = false;
      this.semanticEntry = 1;
      this.semanticPreviousActive = false;
      this.semanticPreviousAt = -Infinity;
      const ref = name => `url(#${id}-${name})`;
      const use = (name, attributes, target) => node("use", { href: `#${id}-${name}`, ...attributes }, target);
      const bounds = { x: "12", y: "4", width: "232", height: "248" };
      const filter = name => node("filter", {
        id: `${id}-${name}`, filterUnits: "userSpaceOnUse", ...bounds,
        "color-interpolation-filters": "sRGB",
      }, defs);
      const mask = name => node("mask", {
        id: `${id}-${name}`, maskUnits: "userSpaceOnUse", ...bounds,
      }, defs);
      const rect = (fill, target) => node("rect", { ...bounds, fill }, target);
      const linear = (name, stops) => {
        const gradient = node("linearGradient", {
          id: `${id}-${name}`, gradientUnits: "userSpaceOnUse",
          x1: "0", y1: "0", x2: "0", y2: "256",
        }, defs);
        for (const [offset, opacity] of stops) {
          node("stop", { offset, "stop-color": "#fff", "stop-opacity": opacity }, gradient);
        }
      };
      const radial = (name, x, y, rx, ry, stops) => {
        const gradient = node("radialGradient", {
          id: `${id}-${name}`, gradientUnits: "userSpaceOnUse",
          cx: "0", cy: "0", r: "1", gradientTransform: `matrix(${rx} 0 0 ${ry} ${x} ${y})`,
        }, defs);
        return {
          gradient,
          stops: stops.map(([offset, color, opacity]) =>
            node("stop", { offset, "stop-color": color, "stop-opacity": opacity }, gradient)),
        };
      };

      const shell = radial("shell", 100, 88, 175, 180, [
        ["0%", "#171a1c", 1], ["48%", "#0c0e10", 1], ["100%", "#08090b", 1],
      ]);
      this.shell = shell.stops;
      const geometry = node("g", { id: `${id}-geometry`, fill: ref("shell") }, defs);
      this.leftEar = node("path", { d: LEFT_EAR }, geometry);
      this.rightEar = node("path", { d: RIGHT_EAR }, geometry);
      this.body = node("path", { d: BODY }, geometry);

      // The soft lower body is fully opaque before the crisp copy fades out.
      linear("sharp-fade", [["0%", 1], ["66%", 1], ["87%", 0], ["100%", 0]]);
      linear("soft-fade", [["0%", 0], ["49%", 0], ["65%", 1], ["100%", 1]]);
      rect(ref("sharp-fade"), mask("sharp"));
      rect(ref("soft-fade"), mask("soft"));
      const softness = filter("softness");
      this.softness = node("feGaussianBlur", { stdDeviation: "3.6" }, softness);
      this.softBody = node("g", { mask: ref("soft") }, parent);
      use("geometry", { filter: ref("softness") }, this.softBody);
      this.sharpBody = use("geometry", { mask: ref("sharp") }, parent);
      this.sharpMask = ref("sharp");

      const cyan = radial("cyan", 77, 84, 69, 66, [
        ["0%", "#54ecdf", 1], ["35%", "#54ecdf", .95], ["100%", "#54ecdf", 0],
      ]);
      const violet = radial("violet", 142, 64, 67, 51, [
        ["0%", "#a28afb", .9], ["32%", "#a28afb", .8], ["100%", "#a28afb", 0],
      ]);
      const rose = radial("rose", 194, 140, 35, 69, [
        ["0%", "#f0a8cd", .85], ["25%", "#f0a8cd", .7], ["100%", "#f0a8cd", 0],
      ]);
      const bounce = radial("bounce", 139, 218, 100, 35, [
        ["0%", "#8a92b8", .34], ["100%", "#8a92b8", 0],
      ]);
      this.flowGradients = { cyan: cyan.gradient, violet: violet.gradient, rose: rose.gradient };
      this.flowLights = [
        { gradient: cyan.gradient, offset: -2.3, rx: 74, ry: 72, color: "#54ecdf", trailCount: 3, orbitX: 58, orbitY: 64 },
        { gradient: violet.gradient, offset: -2.3 + Math.PI * 2 / 3, rx: 76, ry: 70, color: "#a28afb", trailCount: 3, orbitX: 58, orbitY: 64 },
        { gradient: rose.gradient, offset: -2.3 + Math.PI * 4 / 3, rx: 70, ry: 74, color: "#f0a8cd", trailCount: 2, orbitX: 58, orbitY: 64 },
      ];
      this.lightHistory = this.flowLights.map(() => []);
      const field = node("g", { id: `${id}-light-field` }, defs);
      this.fieldRects = {};
      for (const name of ["cyan", "violet", "rose", "bounce"]) {
        this.fieldRects[name] = rect(ref(name), field);
      }
      this.fieldRects.cyan.setAttribute("opacity", ".82");
      this.fieldRects.violet.setAttribute("opacity", ".68");
      this.fieldRects.rose.setAttribute("opacity", ".28");
      this.fieldRects.bounce.setAttribute("opacity", ".2");
      const trailBlur = filter("trail-blur");
      node("feGaussianBlur", { stdDeviation: ".48" }, trailBlur);

      // Alpha erosion makes a variable-width inner band, not a stroked arc.
      const rim = filter("rim");
      node("feMorphology", { in: "SourceAlpha", operator: "erode", radius: "6", result: "core" }, rim);
      node("feGaussianBlur", { in: "core", stdDeviation: "3.3", result: "core-soft" }, rim);
      node("feComposite", { in: "SourceAlpha", in2: "core-soft", operator: "out", result: "edge" }, rim);
      node("feFlood", { "flood-color": "#fff" }, rim);
      node("feComposite", { in2: "edge", operator: "in" }, rim);
      node("path", { d: BODY, fill: "#fff", filter: ref("rim") }, mask("body-rim"));

      const bloom = filter("bloom");
      node("feGaussianBlur", { in: "SourceAlpha", stdDeviation: "5.5", result: "spread" }, bloom);
      node("feComposite", { in: "spread", in2: "SourceAlpha", operator: "out", result: "outside" }, bloom);
      node("feFlood", { "flood-color": "#fff" }, bloom);
      node("feComposite", { in2: "outside", operator: "in" }, bloom);
      node("path", { d: BODY, fill: "#fff", filter: ref("bloom") }, mask("body-bloom"));

      // Union the ear/body alpha before extracting the outer silhouette.
      use("geometry", { filter: ref("rim") }, mask("silhouette"));
      this.glow = node("g", { "pointer-events": "none" }, parent);
      this.bloom = use("light-field", { mask: ref("body-bloom"), opacity: ".42" }, this.glow);
      this.edge = use("light-field", { mask: ref("body-rim"), opacity: ".7" }, this.glow);
      this.silhouette = use("light-field", { mask: ref("silhouette"), opacity: ".08" }, this.glow);

      const clip = node("clipPath", { id: `${id}-body-clip` }, defs);
      node("path", { d: BODY }, clip);
      const silhouetteClip = node("clipPath", { id: `${id}-silhouette-clip` }, defs);
      for (const d of [LEFT_EAR, RIGHT_EAR, BODY]) node("path", { d }, silhouetteClip);
      this.trail = node("g", { "clip-path": ref("silhouette-clip"), "pointer-events": "none" }, this.glow);
      this.trailParticles = [];
      for (const light of this.flowLights) {
        for (let i = 0; i < light.trailCount; i++) {
          const length = 6.8 - i * 1.08;
          const width = .86 - i * .12;
          const opacity = .28 - i * .05;
          const particle = node("ellipse", {
            rx: length.toFixed(2),
            ry: width.toFixed(2),
            fill: light.color,
            opacity: opacity.toFixed(3),
            filter: ref("trail-blur"),
          }, this.trail);
          this.trailParticles.push({
            particle,
            light,
            lightIndex: this.flowLights.indexOf(light),
            lag: .14 + i * .2,
            length,
            width,
            opacity,
          });
        }
      }
      const grain = filter("grain");
      node("feTurbulence", {
        type: "fractalNoise", baseFrequency: ".78", numOctaves: "3", seed: "12", result: "noise",
      }, grain);
      // Noise luminance, rather than its constant alpha, controls particle density.
      node("feColorMatrix", {
        in: "noise", type: "matrix", result: "density",
        values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .2126 .7152 .0722 0 0",
      }, grain);
      const threshold = node("feComponentTransfer", { in: "density", result: "grain-alpha" }, grain);
      node("feFuncA", { type: "linear", slope: "3.5", intercept: "-1.25" }, threshold);
      node("feComposite", { in: "SourceGraphic", in2: "grain-alpha", operator: "in" }, grain);
      const pattern = node("pattern", {
        id: `${id}-dots`, patternUnits: "userSpaceOnUse", width: "2.6", height: "2.6",
      }, defs);
      node("circle", { cx: ".55", cy: ".55", r: ".23", fill: "#fff" }, pattern);
      node("circle", { cx: "1.85", cy: "1.85", r: ".17", fill: "#fff", opacity: ".65" }, pattern);
      rect(ref("dots"), mask("microdots"));
      this.material = node("g", { "clip-path": ref("body-clip"), "pointer-events": "none" }, parent);
      this.grain = use("light-field", { filter: ref("grain"), opacity: ".13" }, this.material);
      this.dots = use("light-field", { mask: ref("microdots"), opacity: ".28" }, this.material);

      // Keep the sparse residual light above the shell so the trail is readable.
      parent.appendChild(this.trail);
      this.trail.style.mixBlendMode = "screen";

      // One moving upper arc gives Rich a readable light gesture without building a full halo.
      this.ribbonGradient = node("linearGradient", {
        id: `${id}-ribbon`, gradientUnits: "userSpaceOnUse",
        x1: "32", y1: "48", x2: "224", y2: "120",
      }, defs);
      for (const [offset, color, opacity] of [
        ["0%", "#54ecdf", ".82"],
        ["34%", "#a28afb", ".92"],
        ["67%", "#f0a8cd", ".76"],
        ["100%", "#54ecdf", ".58"],
      ]) node("stop", { offset, "stop-color": color, "stop-opacity": opacity }, this.ribbonGradient);
      const ribbonBlur = filter("ribbon-blur");
      node("feGaussianBlur", { stdDeviation: "1.15" }, ribbonBlur);
      this.ribbon = node("g", { "data-material": "ribbon", "pointer-events": "none" }, parent);
      this.ribbon.style.mixBlendMode = "screen";
      this.ribbonStrokes = [
        { dash: "0.18 0.82", width: "3.6", opacity: .30, lag: 0, blur: false },
        { dash: "0.12 0.88", width: "2.4", opacity: .16, lag: .11, blur: true },
        { dash: "0.07 0.93", width: "1.5", opacity: .09, lag: .23, blur: true },
      ].map(spec => {
        const attributes = {
          d: RIBBON_PATH, fill: "none", stroke: `url(#${id}-ribbon)`,
          "stroke-width": spec.width, "stroke-linecap": "round",
          "stroke-dasharray": spec.dash, "stroke-dashoffset": "0",
          "pathLength": "1", opacity: "0",
        };
        if (spec.blur) attributes.filter = ref("ribbon-blur");
        return { ...spec, path: node("path", attributes, this.ribbon) };
      });

      // Keep the outgoing semantic layer behind the live layer for source-style hand-offs.
      this.semanticPrevious = node("g", {
        "data-material": "semantic-previous", "pointer-events": "none", opacity: "0",
      }, parent);
      this.semanticPrevious.style.mixBlendMode = "screen";
      this.semantic = node("g", { "pointer-events": "none" }, parent);
      this.semantic.style.mixBlendMode = "screen";
      this.thinkingDots = [0, 1, 2].map((_, i) => node("circle", {
        cx: (181 + i * 9).toFixed(1), cy: "30", r: (2.25 + i * .16).toFixed(2),
        fill: i === 1 ? "#b9a9ff" : "#8eebdf", opacity: "0", "data-semantic": "thinking-dot",
      }, this.semantic));
      this.loadingArc = node("path", {
        d: "M72 182 A62 58 0 0 0 184 182", fill: "none", stroke: "#65e4d7",
        "stroke-width": "2.4", "stroke-linecap": "round", opacity: "0", "data-semantic": "loading-arc",
      }, this.semantic);
      this.writingStroke = node("path", {
        d: "M171 174 Q199 138 229 151", fill: "none", stroke: "#f0a8cd",
        "stroke-width": "3.4", "stroke-linecap": "round", opacity: "0", "data-semantic": "writing-stroke",
      }, this.semantic);
      this.writingTrace = node("path", {
        d: "M171 174 Q199 138 229 151", fill: "none", stroke: "#65e4d7",
        "stroke-width": "1.1", "stroke-linecap": "round", opacity: "0", "data-semantic": "writing-trace",
      }, this.semantic);
      this.writingEcho = node("path", {
        d: "M178 188 Q207 157 229 170", fill: "none", stroke: "#b9a9ff",
        "stroke-width": "1.8", "stroke-linecap": "round", opacity: "0", "data-semantic": "writing-echo",
      }, this.semantic);
      this.writingParticles = [0, 1, 2, 3].map((_, i) => node("ellipse", {
        cx: "0", cy: "0", rx: (3.8 - i * .48).toFixed(2), ry: (1.1 - i * .12).toFixed(2),
        fill: i % 2 ? "#b9a9ff" : "#f0a8cd", opacity: "0", "data-semantic": "writing-particle",
      }, this.semantic));
      this.writingPencil = node("g", { opacity: "0", "data-semantic": "writing-pencil" }, this.semantic);
      this.writingPencilBody = node("path", {
        d: "M-3 5 L3 7 L14 -25 L8 -27 Z", fill: "#f0a8cd",
      }, this.writingPencil);
      this.writingPencilTip = node("path", {
        d: "M-3 5 L0 13 L3 7 Z", fill: "#fff5fb",
      }, this.writingPencil);
      this.writingPencilHighlight = node("path", {
        d: "M6 -2 L11 0", fill: "none", stroke: "#fff", "stroke-width": "1.25", "stroke-linecap": "round", opacity: ".75",
      }, this.writingPencil);
      this.sendingTrail = node("path", {
        d: "M181 135 C199 128 214 112 231 94", fill: "none", stroke: "#b9a9ff",
        "stroke-width": "3.8", "stroke-linecap": "round", "stroke-dasharray": "0.24 0.76",
        "stroke-dashoffset": "0", "pathLength": "1", opacity: "0", "data-semantic": "sending-trail",
      }, this.semantic);
      this.sendingTrailEcho = node("path", {
        d: "M181 138 C199 131 214 115 231 97", fill: "none", stroke: "#65e4d7",
        "stroke-width": "1.35", "stroke-linecap": "round", "stroke-dasharray": "0.14 0.86",
        "stroke-dashoffset": "0", "pathLength": "1", opacity: "0", "data-semantic": "sending-trail-echo",
      }, this.semantic);
      this.sendingParticles = [0, 1, 2].map((_, i) => node("ellipse", {
        cx: "0", cy: "0", rx: (4.8 - i * .66).toFixed(2), ry: (2.15 - i * .22).toFixed(2),
        fill: i === 0 ? "#65e4d7" : i === 1 ? "#b9a9ff" : "#f0a8cd", opacity: "0", "data-semantic": "sending-particle",
      }, this.semantic));
      this.sendingRing = node("circle", {
        cx: "166", cy: "146", r: "4", fill: "none", stroke: "#8eebdf", "stroke-width": "2.1", opacity: "0", "data-semantic": "sending-ring",
      }, this.semantic);

      this.actionForm = node("g", { "data-material": "action-form", "pointer-events": "none" }, parent);
      this.actionForm.style.mixBlendMode = "normal";
      this.morphForm = node("path", {
        d: closedSpline(SOURCE_RING), fill: ref("shell"), opacity: "0", "data-form": "morph-silhouette",
      }, this.actionForm);
      this.loadingForm = node("g", { opacity: "0", "data-form": "loading-capsule" }, this.actionForm);
      this.loadingCore = node("path", {
        d: "M128 63C155 63 172 89 172 132C172 175 155 201 128 201C101 201 84 175 84 132C84 89 101 63 128 63Z",
        fill: ref("shell"),
      }, this.loadingForm);
      this.loadingBeacon = node("circle", {
        cx: "128", cy: "132", r: "6", fill: "#8eebdf", opacity: ".8",
      }, this.loadingForm);
      this.loadingFormRing = node("circle", {
        cx: "128", cy: "132", r: "61", fill: "none", stroke: "#65e4d7", "stroke-width": "2.3", opacity: ".7",
      }, this.loadingForm);

      this.writingForm = node("g", { opacity: "0", "data-form": "writing-ink" }, this.actionForm);
      this.writingCore = node("path", {
        d: "M-7 8C-3 12 3 12 8 7L23 -28C25 -34 20 -41 14 -39L-5 2Z", fill: ref("shell"),
      }, this.writingForm);
      this.writingCoreTip = node("path", {
        d: "M-7 8L-1 19L8 7Z", fill: "#f0a8cd",
      }, this.writingForm);
      this.writingCoreShine = node("path", {
        d: "M8 -14L13 -12", fill: "none", stroke: "#fff", "stroke-width": "1.4", "stroke-linecap": "round", opacity: ".68",
      }, this.writingForm);

      this.sendingForm = node("g", { opacity: "0", "data-form": "sending-core" }, this.actionForm);
      this.sendingCore = node("path", {
        d: "M-21 0C-21 -13 -12 -21 1 -21C14 -21 22 -13 22 0C22 13 14 21 1 21C-12 21 -21 13 -21 0Z", fill: ref("shell"),
      }, this.sendingForm);
      this.sendingCoreShine = node("path", {
        d: "M-2 -3C4 -5 9 -3 12 0", fill: "none", stroke: "#8eebdf", "stroke-width": "1.6", "stroke-linecap": "round", opacity: ".7",
      }, this.sendingForm);
    }

    configure(quality, size) {
      this.enabled = quality !== "minimal" && size > 64;
      this.rich = quality === "rich";
      for (const el of [this.glow, this.material, this.softBody, this.trail, this.semanticPrevious, this.semantic]) {
        el.style.display = this.enabled ? "" : "none";
      }
      this.actionForm.style.display = this.enabled ? "" : "none";
      this.formBlend = 0;
      this.formState = null;
      this.formRing = SOURCE_RING.map(point => [...point]);
      this.formFrom = SOURCE_RING.map(point => [...point]);
      this.formOpacity = 0;
      this.formOpacityFrom = 0;
      this.formTransitionFromActive = false;
      this.semanticState = null;
      this.semanticEntry = 1;
      this.clearSemanticPrevious();
      this.writingSamples = [];
      this.writingLastSample = null;
      this.writingSpeed = 0;
      this.sendingSpeed = 0;
      this.skipFormTransition = false;
      this.setBaseOpacity(1);
      this.sharpBody.setAttribute("mask", this.enabled ? this.sharpMask : "none");
      this.softness.setAttribute("stdDeviation", this.rich ? "4.8" : "3.2");
      this.dots.style.display = this.enabled && this.rich && size >= 160 ? "" : "none";
      this.trail.style.display = this.enabled && this.rich && size >= 160 ? "" : "none";
      this.ribbon.style.display = this.enabled && this.rich && size >= 160 ? "" : "none";
      this.grain.setAttribute("opacity", this.rich ? ".14" : ".08");
      this.dots.setAttribute("opacity", this.rich ? ".3" : ".2");
    }

    setBaseOpacity(value) {
      this.baseFormOpacity = clamp(value);
      const opacity = this.baseFormOpacity.toFixed(3);
      this.softBody.setAttribute("opacity", opacity);
      this.sharpBody.setAttribute("opacity", opacity);
    }

    bodyAttenuation() {
      // Action forms should replace the silhouette, not sit on top of it.
      // Let the shell clear earlier than the form settles so hand-offs read as one object.
      return clamp(1 - this.formBlend * 2.15);
    }

    hideSemantic() {
      this.thinkingDots.forEach(dot => dot.setAttribute("opacity", "0"));
      this.loadingArc.setAttribute("opacity", "0");
      this.writingStroke.setAttribute("opacity", "0");
      this.writingTrace.setAttribute("opacity", "0");
      this.writingEcho.setAttribute("opacity", "0");
      this.writingParticles.forEach(particle => particle.setAttribute("opacity", "0"));
      this.writingPencil.setAttribute("opacity", "0");
      this.sendingTrail.setAttribute("opacity", "0");
      this.sendingTrailEcho.setAttribute("opacity", "0");
      this.sendingParticles.forEach(particle => particle.setAttribute("opacity", "0"));
      this.sendingRing.setAttribute("opacity", "0");
    }

    clearSemanticPrevious() {
      this.semanticPreviousActive = false;
      this.semanticPreviousAt = -Infinity;
      this.semanticPrevious.setAttribute("opacity", "0");
      this.semanticPrevious.replaceChildren();
    }

    captureSemanticPrevious() {
      const snapshot = this.semantic.cloneNode(true);
      this.semanticPrevious.replaceChildren(...snapshot.children);
      this.semanticPrevious.setAttribute("opacity", "1");
      this.semanticPreviousAt = performance.now();
      this.semanticPreviousActive = true;
    }

    paintSemanticPrevious(motion) {
      if (!this.semanticPreviousActive) return;
      if (!this.enabled || motion <= 0) {
        this.clearSemanticPrevious();
        return;
      }
      const age = Math.max(0, (performance.now() - this.semanticPreviousAt) / 1000);
      const fade = clamp(1 - smooth(age / SEMANTIC_CROSSFADE_SECONDS));
      this.semanticPrevious.setAttribute("opacity", fade.toFixed(3));
      // Remove the nearly invisible clone too, so repeated hand-offs do not accumulate nodes.
      if (fade <= 0.02) this.clearSemanticPrevious();
    }

    hideForms() {
      this.morphForm.setAttribute("opacity", "0");
      this.loadingForm.setAttribute("opacity", "0");
      this.writingForm.setAttribute("opacity", "0");
      this.sendingForm.setAttribute("opacity", "0");
    }

    snapForm() {
      this.formState = null;
      this.formRing = SOURCE_RING.map(point => [...point]);
      this.formFrom = SOURCE_RING.map(point => [...point]);
      this.formOpacity = 0;
      this.formOpacityFrom = 0;
      this.formBlend = 0;
      this.skipFormTransition = true;
      this.formTransitionFromActive = false;
      this.hideForms();
      this.setBaseOpacity(1);
    }

    setMorphForm(ring, opacity) {
      this.formRing = ring.map(point => [...point]);
      this.formOpacity = clamp(opacity);
      this.morphForm.setAttribute("d", closedSpline(this.formRing));
      this.morphForm.setAttribute("opacity", this.formOpacity.toFixed(3));
    }

    writingPoint(progress, cyclePhase) {
      return {
        x: 150 + progress * 52,
        y: 173 + Math.sin(progress * Math.PI * 2) * 4 + Math.sin(cyclePhase * Math.PI * 2) * 1.2,
      };
    }

    recordWritingSample(point, stateTime, penDown) {
      if (this.writingLastSample) {
        const dt = Math.max(.001, stateTime - this.writingLastSample.t);
        const distance = Math.hypot(point.x - this.writingLastSample.x, point.y - this.writingLastSample.y);
        const speed = clamp(distance / dt / 180);
        this.writingSpeed += (speed - this.writingSpeed) * .48;
      } else {
        this.writingSpeed = 0;
      }
      this.writingLastSample = { x: point.x, y: point.y, t: stateTime };
      if (!penDown) return;
      this.writingSamples.push({ x: point.x, y: point.y, t: stateTime, speed: this.writingSpeed });
      while (this.writingSamples.length > 1
        && (stateTime - this.writingSamples[0].t > .72 || this.writingSamples.length > 42)) {
        this.writingSamples.shift();
      }
    }

    paintForm(state, time, motion, stateTime = time, gesture = {}) {
      this.hideForms();
      this.formBlend = 0;
      this.setBaseOpacity(1);
      if (!this.enabled || motion <= 0) {
        this.formState = state;
        this.formRing = SOURCE_RING.map(point => [...point]);
        this.formFrom = SOURCE_RING.map(point => [...point]);
        this.formOpacity = 0;
        this.formOpacityFrom = 0;
        return;
      }

      if (state !== this.formState) {
        this.formTransitionFromActive = this.formOpacity > .08;
        this.formState = state;
        this.formFrom = this.formRing.map(point => [...point]);
        this.formOpacityFrom = this.formOpacity;
      }
      const hasActionForm = gesture.form === "capsule" || gesture.form === "ink" || gesture.form === "launch-core";
      const transitionDuration = hasActionForm
        ? (this.formTransitionFromActive ? .28 : .34)
        : .20;
      const transition = this.skipFormTransition ? 1 : easeOut(stateTime / transitionDuration);
      this.skipFormTransition = false;
      let target = SOURCE_RING;
      let targetOpacity = 0;
      const detailMix = transition;

      if (gesture.form === "capsule") {
        const cycle = (stateTime * (gesture.rate || 1.1) * .42) % 1;
        const breathing = Math.sin(cycle * Math.PI);
        const entry = easeOut(stateTime / .24);
        const blend = entry * (.82 + breathing * .12);
        target = rotateRing(
          CAPSULE_RING,
          Math.sin(time * .55) * .045,
          128,
          132,
          1 + breathing * .035,
          1 + breathing * .055,
        );
        targetOpacity = blend * .94;
        this.loadingForm.setAttribute("opacity", (blend * .14 * detailMix).toFixed(3));
        this.loadingForm.setAttribute(
          "transform",
          `translate(128 132) rotate(${(Math.sin(time * .55) * 3.5).toFixed(2)}) scale(${(0.9 + breathing * .08).toFixed(3)} ${(0.94 + breathing * .1).toFixed(3)}) translate(-128 -132)`,
        );
        this.loadingFormRing.setAttribute("stroke-dasharray", "76 245");
        this.loadingFormRing.setAttribute("stroke-dashoffset", (-cycle * 321).toFixed(2));
        this.loadingFormRing.setAttribute("opacity", (.28 + breathing * .2).toFixed(3));
        this.loadingBeacon.setAttribute("r", (4.8 + breathing * 1.35).toFixed(2));
      } else if (gesture.form === "ink") {
        const cycle = gesture.cycle || 1.8;
        const cyclePhase = (stateTime % cycle) / cycle;
        const strokeEnd = gesture.stroke || .64;
        const penDown = cyclePhase < strokeEnd;
        const strokePhase = penDown ? cyclePhase / strokeEnd : 1;
        const strokePulse = penDown ? Math.sin(strokePhase * Math.PI) : 0;
        const entry = easeOut(stateTime / .24);
        const blend = entry * (.84 + strokePulse * .12);
        const point = this.writingPoint(strokePhase, cyclePhase);
        const anchor = smooth(stateTime / .44);
        const angle = (-6 + Math.sin(strokePhase * Math.PI * 2) * 5) * Math.PI / 180;
        target = translateRing(
          rotateRing(
            INK_RING,
            angle,
            128,
            132,
            1.02 + strokePulse * .12 + this.writingSpeed * .12,
            .96 - strokePulse * .08,
          ),
          (128 + (point.x - 128) * anchor) - 128,
          (132 + (point.y - 132) * anchor) - 132,
        );
        targetOpacity = blend * .94;
        this.writingForm.setAttribute("opacity", (blend * (.14 + strokePulse * .08) * detailMix).toFixed(3));
        this.writingForm.setAttribute(
          "transform",
          `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${(-6 + Math.sin(strokePhase * Math.PI * 2) * 5).toFixed(2)}) scale(1.34)`,
        );
      } else if (gesture.form === "launch-core") {
        const duration = gesture.duration || 1.55;
        const prepEnd = gesture.prep || .18;
        const launchEnd = prepEnd + (gesture.launch || .28);
        const settleStart = duration - (gesture.settle || .52);
        let blend = 0;
        const entry = easeOut(stateTime / .26);
        if (stateTime < prepEnd) {
          blend = .48 * entry;
        } else if (stateTime < launchEnd) {
          blend = .48 + .46 * easeOut((stateTime - prepEnd) / (launchEnd - prepEnd));
        } else if (stateTime < settleStart) {
          blend = .94;
        } else if (stateTime < duration) {
          blend = .94 * (1 - smooth((stateTime - settleStart) / Math.max(.01, duration - settleStart)));
        }
        const launchPhase = clamp((stateTime - prepEnd) / .72);
        const launchProgress = smooth(launchPhase);
        const launchVelocity = launchPhase > 0 && launchPhase < 1
          ? clamp(6 * launchPhase * (1 - launchPhase) / .72)
          : 0;
        const origin = { x: 166, y: 146 };
        const x = origin.x + launchProgress * 58;
        const y = origin.y - launchProgress * 36;
        target = translateRing(
          rotateRing(CORE_RING, -.34, 128, 132, 1.04 + launchVelocity * .7, .92 - launchVelocity * .18),
          x - 128,
          y - 132,
        );
        targetOpacity = blend * .95;
        this.sendingSpeed = launchVelocity;
        this.sendingForm.setAttribute("opacity", (blend * (.14 + launchVelocity * .08) * detailMix).toFixed(3));
        this.sendingForm.setAttribute(
          "transform",
          `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(-20) scale(${(1.12 + blend * .2 + launchVelocity * .1).toFixed(3)} ${(0.96 + blend * .16).toFixed(3)})`,
        );
      }

      // Keep a small amount of outgoing energy while one action hands off to another.
      // The ring itself reaches the new silhouette quickly, so intermediate frames do not turn gray.
      const carry = this.formTransitionFromActive && hasActionForm
        ? this.formOpacityFrom * (1 - smooth(stateTime / .18))
        : 0;
      const opacityTarget = Math.max(targetOpacity, carry);
      const ring = morphRing(this.formFrom, target, transition);
      const opacity = this.formOpacityFrom + (opacityTarget - this.formOpacityFrom) * transition;
      this.formBlend = opacity;
      this.setBaseOpacity(this.bodyAttenuation());
      this.setMorphForm(ring, opacity);
      if (!hasActionForm && transition >= 1) this.formRing = SOURCE_RING.map(point => [...point]);
    }

    paintSemantic(state, time, motion, stateTime = time, gesture = {}) {
      if (state !== this.semanticState) {
        if (this.semanticState && SEMANTIC_STATES.has(this.semanticState) && motion > 0) {
          this.captureSemanticPrevious();
        } else {
          this.clearSemanticPrevious();
        }
        this.semanticState = state;
        this.writingSamples = [];
        this.writingLastSample = null;
        this.writingSpeed = 0;
        this.sendingSpeed = 0;
      }
      this.paintSemanticPrevious(motion);
      this.hideSemantic();
      if (!this.enabled || motion <= 0) {
        this.clearSemanticPrevious();
        return;
      }
      const entry = easeOut(stateTime / .16);
      if (state === "thinking") {
        const phase = (stateTime * .72) % 3;
        this.thinkingDots.forEach((dot, i) => {
          const distance = Math.min(Math.abs(phase - i), 3 - Math.abs(phase - i));
          const pulse = Math.max(0, 1 - distance * 2.2);
          dot.setAttribute("cy", (42 - pulse * 3.4).toFixed(2));
          dot.setAttribute("r", (2.05 + pulse * 1.05).toFixed(2));
          dot.setAttribute("opacity", (pulse * .62 * entry).toFixed(3));
        });
      } else if (state === "loading") {
        const phase = (stateTime * 34) % 144;
        this.loadingArc.setAttribute("stroke-dasharray", "28 116");
        this.loadingArc.setAttribute("stroke-dashoffset", (-phase).toFixed(2));
        this.loadingArc.setAttribute("opacity", (.38 * (1 - this.formBlend * .82) * entry).toFixed(3));
      } else if (state === "writing") {
        const cycle = gesture.cycle || 1.8;
        const cyclePhase = (stateTime % cycle) / cycle;
        const strokeEnd = gesture.stroke || .64;
        const penDown = cyclePhase < strokeEnd;
        const strokePhase = penDown ? cyclePhase / strokeEnd : 1;
        const point = this.writingPoint(strokePhase, cyclePhase);
        this.recordWritingSample(point, stateTime, penDown);
        if (!penDown && this.writingSamples.length) {
          const age = stateTime - this.writingSamples[this.writingSamples.length - 1].t;
          while (this.writingSamples.length > 1 && age > .18) this.writingSamples.shift();
        }
        const trail = this.writingSamples.length ? this.writingSamples : [{ ...point, t: stateTime, speed: 0 }];
        const trailAge = trail.length ? stateTime - trail[0].t : 0;
        const tailFade = penDown ? 1 : clamp(1 - (trailAge - .2) / .48);
        const energy = clamp(.28 + this.writingSpeed * .92) * tailFade;
        const previous = trail[Math.max(0, trail.length - 2)] || trail[0];
        const tangent = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
        this.writingStroke.setAttribute("d", pathFromPoints(trail));
        this.writingStroke.setAttribute("stroke-width", (2.75 + this.writingSpeed * 2.2).toFixed(2));
        this.writingStroke.setAttribute("stroke-dasharray", penDown ? "0.7 0.3" : "0.46 0.54");
        this.writingStroke.setAttribute("pathLength", "1");
        this.writingStroke.setAttribute("opacity", (energy * (1 - this.formBlend * .42) * entry).toFixed(3));
        this.writingTrace.setAttribute("d", pathFromPoints(trail));
        this.writingTrace.setAttribute("stroke-width", (0.75 + this.writingSpeed * .56).toFixed(2));
        this.writingTrace.setAttribute("opacity", (energy * (.22 + this.writingSpeed * .08) * entry).toFixed(3));
        const echoOffset = 3 + this.writingSpeed * 4;
        const echo = trail.map(sample => ({ x: sample.x + echoOffset, y: sample.y + 6 + this.writingSpeed * 4 }));
        this.writingEcho.setAttribute("d", pathFromPoints(echo));
        this.writingEcho.setAttribute("stroke-width", (1.2 + this.writingSpeed * 1.2).toFixed(2));
        this.writingEcho.setAttribute("opacity", (energy * .28 * (1 - this.formBlend * .28) * entry).toFixed(3));
        this.writingParticles.forEach((particle, i) => {
          const sample = trail[Math.max(0, trail.length - 1 - i * 3)] || trail[0];
          const age = stateTime - sample.t;
          const fade = clamp(1 - age / .72);
          particle.setAttribute("transform", `translate(${sample.x.toFixed(2)} ${sample.y.toFixed(2)}) rotate(${tangent.toFixed(1)})`);
          particle.setAttribute("rx", (2.1 + this.writingSpeed * 2.2 - i * .24).toFixed(2));
          particle.setAttribute("ry", (0.65 + this.writingSpeed * .42 - i * .08).toFixed(2));
          particle.setAttribute("opacity", (fade * energy * (.42 - i * .075) * (1 - this.formBlend * .25) * entry).toFixed(3));
        });
        const angle = -6 + Math.sin(strokePhase * Math.PI * 2) * 5;
        this.writingPencil.setAttribute("transform", `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${angle.toFixed(2)}) scale(1.16)`);
        this.writingPencil.setAttribute("opacity", ((penDown ? .18 : .055) * (1 - this.formBlend * .42) * entry).toFixed(3));
      } else if (state === "sending") {
        const duration = gesture.duration || 1.55;
        const prepEnd = gesture.prep || .18;
        const launchEnd = prepEnd + (gesture.launch || .28);
        const launchPhase = clamp((stateTime - prepEnd) / .72);
        const launchProgress = smooth(launchPhase);
        const launchVelocity = launchPhase > 0 && launchPhase < 1
          ? clamp(6 * launchPhase * (1 - launchPhase) / .72)
          : 0;
        const origin = { x: 166, y: 146 };
        const end = {
          x: origin.x + launchProgress * 58,
          y: origin.y - launchProgress * 36,
        };
        const direction = { x: 58 / 68.24, y: -36 / 68.24 };
        const tailLength = 14 + launchVelocity * 34;
        const trailStart = {
          x: end.x - direction.x * tailLength,
          y: end.y - direction.y * tailLength,
        };
        const trailVisible = stateTime >= prepEnd && stateTime < duration;
        const launchFade = stateTime < launchEnd ? .7 : 1 - clamp((stateTime - launchEnd) / Math.max(.01, duration - launchEnd));
        const trailOpacity = trailVisible ? (.20 + launchVelocity * .34) * launchFade * entry : 0;
        this.sendingTrail.setAttribute(
          "d",
          `M${trailStart.x.toFixed(2)} ${trailStart.y.toFixed(2)} C${(trailStart.x + direction.x * tailLength * .45).toFixed(2)} ${(trailStart.y + direction.y * tailLength * .45).toFixed(2)} ${(end.x - direction.x * 8).toFixed(2)} ${(end.y - direction.y * 8).toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
        );
        this.sendingTrail.setAttribute("stroke-width", (2.25 + launchVelocity * 3.2).toFixed(2));
        this.sendingTrail.setAttribute("stroke-dasharray", `${(.34 + launchVelocity * .22).toFixed(3)} ${(0.66 - launchVelocity * .22).toFixed(3)}`);
        this.sendingTrail.setAttribute("stroke-dashoffset", (-launchProgress - launchVelocity * .08).toFixed(3));
        this.sendingTrail.setAttribute("opacity", trailOpacity.toFixed(3));
        this.sendingTrailEcho.setAttribute(
          "d",
          `M${(trailStart.x - 2).toFixed(2)} ${(trailStart.y + 4).toFixed(2)} C${(trailStart.x + direction.x * tailLength * .5 - 2).toFixed(2)} ${(trailStart.y + direction.y * tailLength * .5 + 4).toFixed(2)} ${(end.x - direction.x * 7 - 2).toFixed(2)} ${(end.y - direction.y * 7 + 4).toFixed(2)} ${(end.x - 2).toFixed(2)} ${(end.y + 4).toFixed(2)}`,
        );
        this.sendingTrailEcho.setAttribute("stroke-width", (0.9 + launchVelocity * 1.4).toFixed(2));
        this.sendingTrailEcho.setAttribute("stroke-dashoffset", (-launchProgress - .24).toFixed(3));
        this.sendingTrailEcho.setAttribute("opacity", (trailOpacity * .34).toFixed(3));
        this.sendingParticles.forEach((particle, i) => {
          const delay = i * .07;
          const t = clamp((stateTime - prepEnd - delay) / .72);
          const ease = smooth(t);
          const x = end.x - direction.x * i * (7 + launchVelocity * 8);
          const y = end.y - direction.y * i * (7 + launchVelocity * 8);
          particle.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(-20)`);
          particle.setAttribute("rx", (3.2 + launchVelocity * 2.6 - i * .38).toFixed(2));
          particle.setAttribute("ry", (1.35 + launchVelocity * .9 - i * .15).toFixed(2));
          particle.setAttribute("opacity", (t > 0 && t < 1 ? (.28 + launchVelocity * .58) * (1 - i * .18) * launchFade * entry : 0).toFixed(3));
        });
        const ringAge = stateTime - prepEnd;
        const ringPhase = clamp(ringAge / .4);
        this.sendingRing.setAttribute("r", (4 + ringPhase * 19).toFixed(2));
        this.sendingRing.setAttribute("opacity", (ringAge >= 0 && ringAge < .4 ? .58 * (1 - ringPhase) * entry : 0).toFixed(3));
      }
    }

    paintRibbon(time, motion, activity) {
      const visible = this.enabled && this.rich && this.ribbon.style.display !== "none"
        && motion > 0 && activity > .04;
      if (!visible) {
        this.ribbonStrokes.forEach(({ path }) => path.setAttribute("opacity", "0"));
        return;
      }
      const phase = (time * .085) % 1;
      const gradientShift = Math.sin(time * .18) * 10;
      this.ribbonGradient.setAttribute("gradientTransform", `translate(${gradientShift.toFixed(2)} 0)`);
      const shimmer = .88 + Math.sin(time * 1.1) * .05;
      this.ribbonStrokes.forEach(spec => {
        const offset = (phase + spec.lag) % 1;
        const formAttenuation = this.bodyAttenuation();
        const opacity = spec.opacity * (.76 + activity * .28) * shimmer * formAttenuation;
        spec.path.setAttribute("stroke-dashoffset", (-offset).toFixed(3));
        spec.path.setAttribute("opacity", opacity.toFixed(3));
      });
    }

    setSurface(surface) {
      const colors = surface === "dark"
        ? ["#303639", "#171a1d", "#0c0e10"]
        : ["#171a1c", "#0c0e10", "#08090b"];
      this.shell.forEach((stop, i) => stop.setAttribute("stop-color", colors[i]));
    }

    advance(dt, glow, motion) {
      if (!this.enabled || dt <= 0 || motion <= 0) return;
      const activity = Math.max(0, Math.min(1, glow));
      this.flowTime += dt;
      const targetVelocity = (MATERIAL_PARAMS.flowBaseSpeed + activity * MATERIAL_PARAMS.flowActivitySpeed) * motion;
      const blend = Math.min(1, dt * 8);
      this.flowVelocity += (targetVelocity - this.flowVelocity) * blend;
      this.flowPhase += dt * this.flowVelocity;
      this.flowLights.forEach((light, lightIndex) => {
        const angle = this.flowPhase + light.offset;
        const history = this.lightHistory[lightIndex];
        history.push({
          time: this.flowTime,
          x: 128 + Math.cos(angle) * light.orbitX,
          y: 124 + Math.sin(angle) * light.orbitY,
          angle,
        });
        while (
          history.length > 1
          && (this.flowTime - history[0].time > MATERIAL_PARAMS.trailHistorySeconds
            || history.length > MATERIAL_PARAMS.trailMaxSamples)
        ) {
          history.shift();
        }
      });
    }

    currentLightPosition(light) {
      const angle = this.flowPhase + light.offset;
      return {
        x: 128 + Math.cos(angle) * light.orbitX,
        y: 124 + Math.sin(angle) * light.orbitY,
        angle,
      };
    }

    historyPosition(lightIndex, age) {
      const history = this.lightHistory[lightIndex];
      if (!history.length) return this.currentLightPosition(this.flowLights[lightIndex]);
      const target = this.flowTime - age;
      if (target <= history[0].time) return history[0];
      for (let i = history.length - 1; i > 0; i--) {
        const newer = history[i], older = history[i - 1];
        if (target >= older.time && target <= newer.time) {
          const span = newer.time - older.time || 1;
          const t = (target - older.time) / span;
          return {
            x: older.x + (newer.x - older.x) * t,
            y: older.y + (newer.y - older.y) * t,
            angle: older.angle + (newer.angle - older.angle) * t,
          };
        }
      }
      return history[history.length - 1];
    }

    paint(glow, time, motion, surface, state, stateTime = time, gesture = {}) {
      if (!this.enabled) return;
      const activity = Math.max(0, Math.min(1, glow));
      this.paintForm(state, time, motion, stateTime, gesture);
      this.paintSemantic(state, time, motion, stateTime, gesture);
      this.paintRibbon(time, motion, activity);
      const pulse = 1 + Math.sin(time * 1.15) * .045 * motion;
      for (const light of this.flowLights) {
        const { x, y, angle } = this.currentLightPosition(light);
        const spread = Math.sin(angle * 2) * 3;
        light.gradient.setAttribute(
          "gradientTransform",
          `matrix(${(light.rx + spread).toFixed(2)} 0 0 ${(light.ry - spread).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`,
        );
      }
      for (const trail of this.trailParticles) {
        const speedRatio = Math.min(1, this.flowVelocity / (MATERIAL_PARAMS.flowBaseSpeed + MATERIAL_PARAMS.flowActivitySpeed));
        const sample = this.historyPosition(trail.lightIndex, trail.lag * (.72 + speedRatio * .45));
        const x = sample.x + (sample.x - 128) * ((MATERIAL_PARAMS.trailOrbitX / MATERIAL_PARAMS.orbitX) - 1);
        const y = sample.y + (sample.y - 124) * ((MATERIAL_PARAMS.trailOrbitY / MATERIAL_PARAMS.orbitY) - 1);
        const angle = sample.angle;
        const tangent = (angle + Math.PI / 2) * 180 / Math.PI;
        trail.particle.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${tangent.toFixed(1)})`);
        const trailScale = .9 + speedRatio * .18 + activity * .06;
        trail.particle.setAttribute("rx", (trail.length * trailScale).toFixed(2));
        trail.particle.setAttribute("ry", (trail.width * trailScale).toFixed(2));
        trail.particle.setAttribute("opacity", (trail.opacity * (.56 + activity * .4 + speedRatio * .1) * this.bodyAttenuation()).toFixed(3));
      }
      const bodyLight = this.bodyAttenuation();
      const lighting = (.04 + Math.sqrt(activity) * .62) * (this.rich ? .92 : .78) * bodyLight
        * (surface === "dark" ? .82 : 1) * pulse;
      this.glow.setAttribute("opacity", lighting.toFixed(3));
      this.material.setAttribute("opacity", ((.05 + Math.sqrt(activity) * .36) * pulse * bodyLight).toFixed(3));
    }
  }

  g.CompanionMaterial = CompanionMaterial;
})(window);
