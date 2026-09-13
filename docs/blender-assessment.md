# Blender Assessment

## Decision

Do not make Blender a dependency of the first production iteration.

## Why 2D Is the Better Current Fit

The current experience is judged at icon and small-character scale. Its visual
identity comes from a few things that the SVG renderer already controls well:

- a strong black silhouette;
- deliberate morphs into capsule, ink, and launch-core forms;
- eye shape changes that remain legible at 64px;
- sparse cyan, violet, and rose light flow;
- short particle and ribbon trails;
- deterministic pause, reduced-motion, and export behavior.

A Blender pipeline would add mesh topology, camera, lighting, render, export,
and runtime integration costs before it improves the central interaction.

## When to Prototype 3D

Prototype Blender when the design brief requires depth as behavior rather than
decoration. The strongest reasons would be:

- the companion must turn and reveal volume;
- lighting needs to react to a moving camera;
- the same asset must support rendered video and real-time 3D;
- material response is part of the character's state language.

## Suggested Prototype

Build one low-poly, smooth-shaded body with separate ear meshes and a simple
eye plane. Test only three states: idle, loading, and sending. Match the 2D
timings and compare silhouette readability, transition clarity, frame cost, and
export flexibility. If depth does not improve those measures, keep the SVG path.

## Decision Gate

Move to Blender only if the prototype demonstrates a clear gain in at least two
of the following: emotional readability, state distinction, depth perception,
or platform reuse. Otherwise, continue investing in the 2D renderer and its
shared transition model.

