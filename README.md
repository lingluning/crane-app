# Crane App

A browser-based 3D planning tool for mobile crane operations. Place cranes, lift / drop points, steel plates, no-go zones and access paths on an interactive site, check safety constraints, and export a Japanese-format work plan (PDF).

## Features

- **3D site editor** (Three.js) — place and rotate crane, pick / drop points, steel plates, forbidden zones, walkways
- **Safety checks** — working radius, load position, path overlap
- **Distance & load calculation** — auto-computes distance from crane to lift / drop points and queries the load chart for max allowable load and usage rate
- **Crane database** — outrigger modes (min / mid / max) with per-radius load charts
- **Save / load** — auto-save to `localStorage`, plus JSON import / export
- **Output** — 3-view screenshot and Japanese crane work-plan PDF (`移動式クレーン作業計画書`)
- **Measurement tool** — click two points to measure distance on the ground

## Project Structure

```
crane-app/
├── index.html              # Layout, panels, modal
├── js/
│   ├── main.js             # Event wiring (mouse, keyboard, buttons)
│   ├── scene.js            # Three.js scene, camera, renderer, model loading
│   ├── state.js            # Shared mutable state
│   ├── tools.js            # Tool selection, placement, selection, counters
│   ├── safety-tools.js     # Forbidden zone, path, measurement, safety check
│   ├── safety-calc.js      # Distance / max-load / usage calculations
│   ├── safety-display.js   # Distance & load panel rendering
│   ├── crane-database.js   # Crane specs and load charts
│   ├── persistence.js      # Auto-save, serialize / deserialize
│   └── export.js           # 3-view screenshot, JSON I/O, PDF report
├── models/                 # GLB / GLTF crane and site models
└── python/                 # (helper scripts)
```

## Running

The project uses ES modules and a CDN import map — no build step required. Serve the folder with any static server:

```bash
# VS Code: Live Server extension (default port 5500)
# or:
python3 -m http.server 8000
```

Then open `http://localhost:8000/` (or the Live Server URL).

## Controls

| Key / Action      | Effect                                          |
| ----------------- | ----------------------------------------------- |
| Click tool button | Select tool (crane / pick / drop / plate / …)  |
| Click on ground   | Place object at cursor                          |
| Drag with mouse   | Orbit / pan camera                              |
| `R`               | Rotate selected object                          |
| `Delete` / `Backspace` | Remove selected object                     |
| `Enter`           | Finish forbidden zone (≥3 points) or path (≥2) |
| `Esc`             | Cancel current drawing or return to select     |

## Tech Stack

- [Three.js 0.160](https://threejs.org/) — 3D rendering
- [Tailwind CSS](https://tailwindcss.com/) (CDN) — styling
- Vanilla ES modules — no bundler

## Status

Active development. Recent milestones:

- Week 9: Crane database + load chart lookup
- Week 7: Japanese work-plan PDF + JSON import / export
- Week 6: Working radius, access paths, distance measurement
- Week 5: Code split, crane rotation, plate sizes, persistence
- Week 4: Crane and site model import
