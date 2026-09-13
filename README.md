# Companion Character Lab

Standalone SVG character motion study for a small companion bot. The project
focuses on expressive state changes, continuous silhouette morphing, restrained
color flow, and particle trails that remain readable at small sizes.

## Run

No build step or dependency installation is required for the demo. Open
[`index.html`](./index.html) directly in a browser, or serve the directory with
any static file server.

The test suite uses Node's built-in test runner:

```bash
npm test
npm run check
```

## What Is Included

- Nine states: idle, curious, listening, thinking, happy, sleeping, loading,
  writing, and sending.
- Continuous morphing between the cat silhouette and action forms.
- Loading capsule, writing ink cone, and sending launch core.
- Independent eye playback, gaze behavior, pose motion, and gesture timing.
- Rich-mode cyan, violet, and rose light flow with sparse tapered trails.
- Short semantic crossfades between outgoing and incoming action layers.
- Minimal, balanced, and rich rendering quality modes.
- Pause, reduced-motion, pointer gaze, intensity, surface, size, and SVG export.

## Runtime API

Load the browser files in this order:

```html
<script src="src/math.js"></script>
<script src="src/presets.js"></script>
<script src="src/material.js"></script>
<script src="src/character.js"></script>
```

Then mount a character on an SVG element:

```js
const bot = new Companion(svg, {
  state: "curious",
  size: 160,
  quality: "rich",
});

bot.setState("thinking");
bot.setPaused(true);
bot.setReducedMotion(true);
bot.destroy();
```

## Motion Model

State changes are coordinated across four layers:

1. The state clock restarts the current gesture and eye playlist.
2. The silhouette ring morphs from the current form into the next form.
3. The outgoing semantic layer is retained for a short crossfade while the new
   layer enters.
4. Light flow, particles, eyes, and pose continue from their current values.

This keeps loading, writing, and sending visually distinct without turning the
character into a static icon swap. The normal state returns to the cat form
after an action completes.

## Blender Assessment

Blender is **not required for the current target**. The character is currently
a flat, icon-scale SVG experience whose important qualities are silhouette
continuity, eye playback, state timing, restrained glow, and particle trails.
Those are more controllable and easier to export with the current 2D renderer.

Blender becomes worthwhile when the product direction changes toward one or
more of these goals:

- a genuine 3D volume with visible yaw, pitch, and depth lighting;
- camera parallax or a turntable-style interaction;
- volumetric fur, translucent materials, or physically consistent reflections;
- rendered clips or a reusable 3D asset pipeline for multiple platforms.

The recommended path is to finish the 2D state system first, then prototype a
small Blender asset only as a visual experiment. Do not replace the SVG engine
with Blender until the 3D version proves that depth adds meaning beyond the
current silhouette and motion language.

## Project Status

Version `0.1.0` is the independent initialization of the companion renderer.
The project is intentionally self-contained and does not include the original
reference application's extracted files, geometry, or packaged assets.

