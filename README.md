# 🏗️ Crane App

A browser-based 3D planning tool for mobile crane operations. Place cranes 🏗️, lift / drop points 🟢🔴, steel plates 🟨, no-go zones 🚫 and access paths 🛣️ on an interactive site, check safety constraints ⚠️, and export a Japanese-format work plan PDF 📋.

## ✨ Today's Updates (2026-05-20)

A productive day — the editor moved much closer to a real desktop-app feel:

- **🖱️ Crane drag-to-move** — in 選択 mode, press on the crane and drag it across the ground. Position is projected via raycast so it works at any camera angle. The red center cross and the work-radius ring follow automatically.
- **🧭 Unified top nav bar** — the old centered toolbar and the left-side vertical tool palette were merged into a single full-width navbar at the top (`#top-nav`). All tools, file actions, output buttons, and the new ⚙️ settings button live in one place, grouped by separators.
- **☑️ Multi-select for everything** — `Ctrl` (or `⌘` on Mac) + left-click toggles any object (crane / load / plate) in/out of the selection. Plates / objects sharing a `groupId` are expanded automatically, so picking one member selects the whole group. macOS Ctrl-click is special-cased so it doesn't pop the context menu.
- **🖱️🖱️ Right-click context menu** — when at least one object is selected, right-click shows a popup menu with:
  - ↻ / ↺ **15° rotation** around the selection centroid
  - ⇔ **平移 (translate)** — mouse-follow drag, left-click to commit, `Esc` (or right-click) to cancel
  - 🔗 **グループ化** — assign one `groupId` to every selected object
  - 🔓 **グループ解除** — strip `groupId` from the selection
  - 🗑 **削除** — delete every selected object
- **🔁 Rigid-body group rotation** — fixed a direction-mismatch bug in `rotateSelection`. XZ-plane position rotation now uses the same handedness as Three.js's `rotation.y` (`+X → -Z`), so groups rotate as a single rigid body around their centroid. Cranes inside the selection go through `moveCrane` so their marker + radius circle stay synced.
- **⌨️ Space = select mode** — pressing space outside of any input field switches the active tool to 「選択」.
- **⚙️ Settings modal** — a new ⚙️ 設定 button opens a sidebar-style settings dialog (room for many future categories). The first category is **📍 地点**: 現場名 / 住所 / 緯度 / 経度 / 備考. A 📍 現在地 button uses the browser geolocation API to autofill lat/lng. Everything is persisted under `localStorage['crane_app_settings']`.
- **🌤️ Weather forecast panel** — top-right of the screen now shows the **today / tomorrow / day-after-tomorrow** forecast for the configured site: weather icon, short label, min/max temperature, **precipitation (mm)**, and **max wind speed (m/s)**. Data comes from the free [Open-Meteo](https://open-meteo.com/) API (no key needed). Rain ≥ 10 mm and wind ≥ 10 m/s are highlighted in red — matching the default 風速中止基準 in the work-plan form. Auto-refreshes every 30 minutes; manual 🔄 button included.

## 🔧 Features

- 🏗️ **3D site editor** (Three.js) — place and rotate crane, pick / drop points, steel plates, forbidden zones, walkways
- ⚠️ **Safety checks** — working radius, load position, path overlap
- 📐 **Distance & load calculation** — auto-computes distance from crane to lift / drop points and queries the load chart for max allowable load and usage rate
- 📚 **Crane database** — outrigger modes (min / mid / max) with per-radius load charts
- 💾 **Save / load** — auto-save to `localStorage`, plus JSON import / export
- 📋 **Output** — 3-view screenshot and Japanese crane work-plan PDF (`移動式クレーン作業計画書`)
- 📏 **Measurement tool** — click two points to measure distance on the ground
- 🖱️ **Drag, multi-select, group, rotate, translate** — full Ctrl+click multi-select and a right-click context menu, with rigid-body group operations
- ⚙️ **Settings + 🌤️ weather** — site location is saved and drives a 3-day forecast (rain / wind / temperature) in the top-right panel

## 📂 Project Structure

```
crane-app/
├── index.html              # Layout, top navbar, panels, modals, context menu
├── js/
│   ├── main.js             # 🎛️ Event wiring (mouse, keyboard, drag, context menu, settings)
│   ├── scene.js            # 🎬 Three.js scene, camera, renderer, model loading
│   ├── state.js            # 🗃️ Shared mutable state (incl. selectedObjects[])
│   ├── tools.js            # 🛠️ Tools, placement, multi-select, group / rotate helpers
│   ├── safety-tools.js     # ⚠️ Forbidden zone, path, measurement, safety check
│   ├── safety-calc.js      # 🧮 Distance / max-load / usage calculations
│   ├── safety-display.js   # 📊 Distance & load panel rendering
│   ├── crane-database.js   # 🏗️ Crane specs and load charts
│   ├── persistence.js      # 💾 Auto-save, serialize / deserialize (incl. groupId)
│   ├── weather.js          # 🌤️ Open-Meteo client + 3-day forecast panel
│   └── export.js           # 📤 3-view screenshot, JSON I/O, PDF report
├── models/                 # 🧱 GLB / GLTF crane and site models
└── python/                 # 🐍 (helper scripts)
```

## ▶️ Running

The project uses ES modules and a CDN import map — no build step required. Serve the folder with any static server:

```bash
# VS Code: Live Server extension (default port 5500)
# or:
python3 -m http.server 8000
```

Then open `http://localhost:8000/` (or the Live Server URL).

## 🎮 Controls

| Key / Action                    | Effect                                                        |
| ------------------------------- | ------------------------------------------------------------- |
| Click tool button               | Select tool (crane / pick / drop / plate / …)                 |
| Click on ground                 | 🟢 Place object at cursor                                     |
| Click on object (選択 mode)     | 👆 Select (group expands automatically if it has a `groupId`) |
| `Ctrl` / `⌘` + left-click       | ☑️ Toggle object in/out of multi-selection                    |
| Drag crane (left button)        | 🖱️ Move crane along the ground (camera-independent)           |
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

- 📅 **2026-05-20**: Drag-to-move crane, top-nav redesign, multi-select for all types, right-click context menu (rotate / translate / group / delete), rigid-body group rotation, ⚙️ settings modal with location, 🌤️ Open-Meteo 3-day weather panel
- 🗓️ Week 9: Crane database + load chart lookup
- 🗓️ Week 7: Japanese work-plan PDF + JSON import / export
- 🗓️ Week 6: Working radius, access paths, distance measurement
- 🗓️ Week 5: Code split, crane rotation, plate sizes, persistence
- 🗓️ Week 4: Crane and site model import
