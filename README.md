# 🏗️ Crane App

A browser-based 3D planning tool for mobile crane operations. Place cranes 🏗️, lift / drop points 🟢🔴, steel plates 🟨, no-go zones 🚫 and access paths 🛣️ on an interactive site, check safety constraints ⚠️, and export a Japanese-format work plan PDF 📋.

## ✨ Recent Updates (2026-05-24)

Heavy refactor pass — interaction smoothness, visual fidelity, and tooling all improved:

- **🎯 Crane center calibration tool** — a new standalone page `calibrate.html` lets you visually pick the crane's slewing center (旋回中心 / boom base) on the GLB mesh. Top-down ortho **and** free 3D perspective views, click directly on the crane mesh to set the pivot, explicit save button (Cmd/Ctrl+S), live "✓ 保存済み / ● 未保存" status, reset to BB-default. Saved to `localStorage['crane_pivot_offset']` and **automatically picked up by the main app on next load** — no source-code editing required.
- **📍 Center marker on the crane body** — the red center cross / radius-ring center now sits on the **top surface of the crane mesh** (turret), not floating at ground level. Both `index.html` and `calibrate.html` raycast from above to find the actual mesh top Y.
- **🏗️ Crane pivot correctness** — wrapped the GLB in a `THREE.Group` so `crane.position` is the **slewing center** (= what the user sees as the marker), not the raw GLB origin. Pivot offset is configurable per-GLB via the calibration tool. Rotation, dragging, radius circle, marker — all anchored to the same correct point.
- **🖱️ Smoother drag / translate** — replaced "snap to cursor every frame" with a frame-rate-independent exponential decay (`α = 1 − exp(−55·dt)`), plus a 4 m catch-up threshold so fast mouse flicks don't lag behind. Works for both single-crane drag and group 平移.
- **⚡ Massive perf fix: drag is now lightweight** — `moveCrane(..., { light: true })` during drag only **translates** the radius-ring tube instead of rebuilding 96 segments + 96 terrain raycasts every frame. Full rebuild + terrain Y re-sample runs **once** on release/convergence. Dropped per-frame CPU work from ~1500 triangles + 96 raycasts to a few vector adds.
- **🪨 Crane follows terrain on release** — when you drop the crane, both its position Y **and** the radius ring resample the site terrain so the model sits flush with sloped ground.
- **🧹 GPU dispose / memory leak fix** — every replaced `TubeGeometry` / `Material` is now properly `dispose()`-d. The radius ring no longer leaks GPU memory every time you drag, change radius, rotate, or delete a crane.
- **🎨 Toon + metallic shading** — lifted the toon-shading dark band so the scene isn't murky, switched mesh outlines from pure black `0x000000` to dark gray `0x4a4a4a`, and added a 5-step **metallic toon** ramp (with bright peak + faint emissive) used **only for the crane** — body now reads as polished metal vs. the matte site.
- **🛡️ Refactor & robustness** — unified all positional updates through `translatePlaced(obj, dx, dz)` / `finalizePlacedMove(obj)` (used by drag, translate, rotate, cancel — eliminated 4 copies of the same `if (type==='crane') moveCrane else position.x=` dispatch). Smoothing tick now guards against deleted objects to prevent orphan radius rings.

## 📅 Earlier Updates (2026-05-20)

- **🖱️ Crane drag-to-move** in 選択 mode (raycast-projected, camera-independent).
- **🧭 Unified top navbar** — old toolbar + side palette merged.
- **☑️ Multi-select** with `Ctrl` / `⌘` + click; groups auto-expand.
- **🖱️🖱️ Right-click context menu** — rotate ↻↺ 15° / translate / group / ungroup / delete.
- **🔁 Rigid-body group rotation** with corrected handedness.
- **⌨️ Space** to switch to 選択 tool.
- **⚙️ Settings modal** with 現場名 / lat / lng / geolocation autofill, persisted to `localStorage`.
- **🌤️ Open-Meteo 3-day weather panel** with red highlight for rain ≥ 10 mm / wind ≥ 10 m/s.

## 🔧 Features

- 🏗️ **3D site editor** (Three.js) — place and rotate crane, pick / drop points, steel plates, forbidden zones, walkways
- ⚠️ **Safety checks** — working radius, load position, path overlap
- 📐 **Distance & load calculation** — auto-computes distance from crane to lift / drop points and queries the load chart for max allowable load and usage rate
- 📚 **Crane database** — outrigger modes (min / mid / max) with per-radius load charts
- 💾 **Save / load** — auto-save to `localStorage`, plus JSON import / export
- 📋 **Output** — 3-view screenshot and Japanese crane work-plan PDF (`移動式クレーン作業計画書`)
- 📏 **Measurement tool** — click two points to measure distance on the ground
- 🖱️ **Drag, multi-select, group, rotate, translate** — full Ctrl+click multi-select and a right-click context menu, with rigid-body group operations and smooth frame-rate-independent motion
- 🎯 **Crane center calibration tool** — visual pivot setter (`calibrate.html`), persisted via `localStorage`
- 🎨 **Toon + metallic shading** — cel-shaded look with a brighter metallic ramp on the crane
- ⚙️ **Settings + 🌤️ weather** — site location is saved and drives a 3-day forecast (rain / wind / temperature) in the top-right panel

## 📂 Project Structure

```
crane-app/
├── index.html              # 🎛️ Main app: layout, top navbar, panels, modals, context menu
├── calibrate.html          # 🎯 Standalone crane center calibration tool
├── js/
│   ├── main.js             # 🎛️ Event wiring (mouse, keyboard, drag, smoothing, context menu, settings)
│   ├── scene.js            # 🎬 Three.js scene, cameras, renderer, model loading, toon shading, pivot API
│   ├── calibrate.js        # 🎯 Calibration tool: ortho/3D cameras, click-to-set, localStorage save
│   ├── state.js            # 🗃️ Shared mutable state (incl. selectedObjects[])
│   ├── tools.js            # 🛠️ Tools, placement, multi-select, moveCrane (light/full), dispose, marker on mesh
│   ├── safety-tools.js     # ⚠️ Forbidden zone, path, measurement, safety check
│   ├── safety-calc.js      # 🧮 Distance / max-load / usage calculations
│   ├── safety-display.js   # 📊 Distance & load panel rendering
│   ├── crane-database.js   # 🏗️ Crane specs and load charts
│   ├── persistence.js      # 💾 Auto-save, serialize / deserialize (incl. groupId, full cleanup on load)
│   ├── weather.js          # 🌤️ Open-Meteo client + 3-day forecast panel
│   └── export.js           # 📤 3-view screenshot, JSON I/O, PDF report
├── models/                 # 🧱 GLB / GLTF crane and site models
└── python/                 # 🐍 (Trimesh helper scripts to generate procedural crane GLBs)
```

## ▶️ Running

The project uses ES modules and a CDN import map — no build step required. Serve the folder with any static server:

```bash
# VS Code: Live Server extension (default port 5500)
# or:
python3 -m http.server 8000
```

Then open:
- Main app: `http://localhost:8000/index.html`
- Calibration tool: `http://localhost:8000/calibrate.html`

> ⚠️ **Both pages must be served from the same origin** (scheme + host + port). The calibration tool writes to `localStorage['crane_pivot_offset']` and the main app reads from it — `localStorage` is scoped per origin, so opening one via Live Server (`:5500`) and the other via Python's server (`:8000`) will *silently* not sync. Pick one server for both.

## 🎯 Calibrating the Crane Pivot

1. Open `calibrate.html`.
2. The crane appears centered at world origin. Two crosses overlay it: **gray** = bounding-box-derived default, **red** = current saved pivot (or default if nothing saved).
3. Toggle between **上面** (top-down ortho, locked) and **3D** (free orbit) — both views support click-to-set.
4. Click on the crane's slewing turret (the short cylinder directly below where the boom meets the body). The red marker jumps onto the mesh surface there; the status bar shows `● 未保存`.
5. Hit **保存** (or `Cmd/Ctrl+S`). Tag flips to `✓ 保存済み`.
6. Reload `index.html` — the new pivot is applied to every crane you place.

## 🎮 Main App Controls

| Key / Action                    | Effect                                                        |
| ------------------------------- | ------------------------------------------------------------- |
| Click tool button               | Select tool (crane / pick / drop / plate / …)                 |
| Click on ground                 | 🟢 Place object at cursor                                     |
| Click on object (選択 mode)     | 👆 Select (group expands automatically if it has a `groupId`) |
| `Ctrl` / `⌘` + left-click       | ☑️ Toggle object in/out of multi-selection                    |
| Drag crane (left button)        | 🖱️ Smooth raycast-projected move (camera-independent)         |
| Right-click on selection        | 🪟 Open context menu (rotate / translate / group / delete)    |
| Right mouse drag (empty area)   | 🎥 Pan camera                                                 |
| Middle mouse drag               | 🔄 Orbit around mouse-picked pivot                            |
| Mouse wheel                     | 🔍 Zoom to cursor                                             |
| `R`                             | ↻ Rotate selected object(s) 10° (around centroid if multi)    |
| `Space`                         | 👆 Switch to 選択 tool                                        |
| `Delete` / `Backspace`          | 🗑 Remove every selected object                              |
| `Enter`                         | ✅ Finish forbidden zone (≥3 points) or path (≥2)             |
| `Esc`                           | ⏹ Cancel drawing / close menu / cancel 平移 / return to 選択 |

## 🧰 Tech Stack

- [Three.js 0.160](https://threejs.org/) — 3D rendering
- [Tailwind CSS](https://tailwindcss.com/) (CDN) — styling
- [Open-Meteo](https://open-meteo.com/) — weather forecast API (no key required)
- Vanilla ES modules — no bundler

## 🚧 Status

Active development. Recent milestones:

- 📅 **2026-05-24**: Crane center calibration tool (`calibrate.html`) with top/3D views, marker-on-mesh, wrapper-based pivot correctness, frame-rate-independent drag smoothing, lightweight in-flight `moveCrane`, terrain-Y follow on release, GPU dispose / leak fix, `translatePlaced` / `finalizePlacedMove` refactor, metallic toon for crane
- 📅 **2026-05-20**: Drag-to-move crane, top-nav redesign, multi-select for all types, right-click context menu (rotate / translate / group / delete), rigid-body group rotation, ⚙️ settings modal with location, 🌤️ Open-Meteo 3-day weather panel
- 🗓️ Week 9: Crane database + load chart lookup
- 🗓️ Week 7: Japanese work-plan PDF + JSON import / export
- 🗓️ Week 6: Working radius, access paths, distance measurement
- 🗓️ Week 5: Code split, crane rotation, plate sizes, persistence
- 🗓️ Week 4: Crane and site model import
