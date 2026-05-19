# 🗓️ Updates — 2026-05-19

Today's work covers **Week 11** (engineering-grade load data) plus a series of
UX, camera, and drawing improvements. ✨

---

## 🏗️ 1. Week 11 — Engineering-grade load data

The load-chart model was rewritten to match real crane PDFs (4-parameter
lookup instead of 1-parameter). 📈

**Old:** `query(radius) → max load`
**New:** `query(outriggerMode, boomLength, radius, angle) → max load`

### 📦 Data structure (`js/crane-database.js`)

```js
loadChart[outriggerMode] = [
    { boomLength, criticalAngle, points: [{ radius, capacity }, ...] },
    ...
]
```

- 🚜 `KATO_CR-250RV` (25t) added with **5 outrigger modes × 4 boom lengths**
  (9.35m / 16.4m / 23.45m / 30.5m).
- 🔄 `TADANO_GR-160N` (16t) migrated to the new structure.
- 🧰 New helpers: `getBoomLoadCurve`, `queryLoadChart`, `checkWorkingArea`,
  `getMaxRadius`, `evaluateSafety`.
- 🚫 `checkWorkingArea` enforces the **"full / side-only"** working-area
  restriction (mid/min outrigger modes disable front-back lifts).

### 🧠 State (`js/state.js`)

```js
state.currentCraneId        = 'KATO_CR-250RV';
state.currentBoomLength     = 9.35;
state.currentOutriggerMode  = 'maxFull';
```

### 🧮 Safety calculations (`js/safety-calc.js`)

- 📐 New `calculateAngle(craneCenter, loadPos)` — angle of the load relative
  to the crane (0° = front, 90° = right).
- 🛡️ New `performSafetyCheck()` — runs `checkWorkingArea` + `queryLoadChart`
  for every pick / drop point and returns a combined report
  `{ checks: [...], overallStatus: 'safe' | 'caution' | 'danger' }`.

### 🖥️ Display (`js/safety-display.js`)

- ✨ New `updateSafetyDisplay()` updates the distance panel, max load,
  usage rate, the warning line, and the overall status panel in one pass.
- 🟢🟡🔴 The crane's working-radius circle now changes color based on the
  overall safety status.

### 🎛️ UI (`index.html`)

- 🛡️ New **Safety Status** panel (icon + title + per-point detail) at the top
  of the right sidebar.
- ⚖️ Load panel rebuilt:
  - 📏 Boom-length `<select>` (populated from the crane's `availableLengths`)
  - 🦿 5-tier outrigger `<select>` (labeled with full / side-only working area)
  - 📊 Max load / usage rate / warning message readout

---

## 🍞 2. Toast notifications

All **11** `alert()` popups across the app were replaced with non-blocking
toasts. 🎉

- 🧩 New `showToast(message, type, duration)` in `js/tools.js`
  (types: `warning ⚠️ | error ❌ | info ℹ️ | success ✅`).
- 🎞️ Toast container with slide-in / slide-out animation added to
  `index.html`.

---

## 🐛 3. UX and bug fixes

| Area              | Change                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| 🏗️ Crane placement | After placing the (only allowed) crane, auto-switch to select mode.   |
| 🚫 Crane tool button | Clicking the disabled crane tool is now blocked + shows a toast.    |
| 🗑️ Delete / Undo    | New `removeObjectFully()` helper. Fixes residual emoji / text labels |
|                   | (CSS2D DOM nodes) after deleting pick / drop points or undoing.        |
| 🖱️ Canvas clicks   | Click handler now ignores UI clicks (only fires on `<canvas>`).        |
|                   | Fixes the ghost first-point added when picking forbidden-zone / path.  |

---

## 📷 4. Camera controls (`js/scene.js`)

### 🖱️ Mouse-button remap
- **Left** 👆 → free (used by the app for placement / selection)
- **Middle** 🎯 → rotate (custom — orbit around cursor)
- **Right** ✋ → pan

### 🌀 Rotate around the cursor (custom)
- OrbitControls' built-in middle rotate is **disabled**; replaced with a
  custom implementation that:
  - 🎯 Raycasts the ground at mousedown to find the **pivot**.
  - 🔄 Rotates **both** `camera.position` and `controls.target` around the
    pivot by the same quaternion (yaw around world-Y, pitch around camera
    right) — so the view direction is preserved and **no jump** occurs at
    mousedown.

### 🔍 Zoom toward the cursor (custom)
- OrbitControls' built-in wheel zoom is **disabled** (multiplicative zoom
  slows down to a crawl near the target 🐌).
- Replaced with a wheel handler that:
  - 🎯 Raycasts the cursor to find the world point to zoom toward.
  - 📐 Step size = `max(distance × 0.15, 1.5m)` — minimum step keeps zoom
    responsive even when close. 🚀
  - 🛑 Clamped by `ZOOM_MIN_DIST = 1.5m` to prevent passing through objects.

---

## 🎨 5. UI layout refactor

The whole HTML layout was rewritten earlier today to remove pixel-based
positioning. 📐

- 🔝 **Top center**: unified action toolbar (undo / save / load / export /
  import / 3-view / report / center-toggle).
- ⬅️ **Left**: tool palette (vertical) with the plate-size options appearing
  beside it when the plate tool is active.
- ➡️ **Right**: single scrollable sidebar with all info panels
  (safety status / safety check / distance / load / crane control /
  crane info / selection).
- ⬇️ **Bottom**: counter (left), coordinates (right), hint (center).

---

## ✏️ 6. Drawing improvements (`js/safety-tools.js`)

### 👀 Forbidden zone & path — clearer previews
- 🔴🟢 New shared `createDrawingPreview()` helper used by both tools.
- ⬆️ Preview lines lifted **+0.1 m** above the ground (avoids z-fighting).
- 👻 `depthTest: false` + `renderOrder: 999` — preview is always drawn on
  top, never hidden behind terrain.
- 🟢 Sphere markers added at every clicked point (visible even with a
  single point, before the first dashed segment appears).
- ➖➖ Slightly larger dash / gap sizes for visibility.

### 🛣️ Walkway path — now 1m wide flat ribbon
- 🔁 Replaced the old `TubeGeometry` "green sausage" 🌭 with a real flat
  ribbon laid on the ground.
- 🧱 New `buildRibbonGeometry(points, width)` — generates a `BufferGeometry`
  whose end vertices use the **average direction of adjacent segments**
  (miter joint), so corners stay continuous without gaps.
- ⚙️ `PATH_WIDTH = 1.0 m`, semi-transparent green (`opacity 0.55`),
  `DoubleSide`, `depthWrite: false` — looks like a real walkway. 🚶

---

## 📂 Files changed

```
index.html
js/crane-database.js
js/main.js
js/safety-calc.js
js/safety-display.js
js/safety-tools.js
js/scene.js
js/state.js
js/tools.js
js/export.js
README.md
UPDATES.md
```
