import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';
import { getCraneCenter } from './tools.js';

const N_ARC = 36;
const N_RADII = 6;

const _swingVisuals = [];

export function clearSwingVisuals() {
    while (_swingVisuals.length > 0) {
        const obj = _swingVisuals.pop();
        scene.remove(obj);
        obj.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
            }
        });
    }
}

function pointInPolygonXZ(px, pz, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, zi = polygon[i].z;
        const xj = polygon[j].x, zj = polygon[j].z;
        const intersect = ((zi > pz) !== (zj > pz)) &&
            (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function shortArcAngles(a1, a2) {
    let diff = ((a2 - a1) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    return { start: a1, delta: diff };
}

function computeSwingArcPoints(craneCenter, pick, drop) {
    const dx1 = pick.x - craneCenter.x, dz1 = pick.z - craneCenter.z;
    const dx2 = drop.x - craneCenter.x, dz2 = drop.z - craneCenter.z;

    const r1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
    const r2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);

    const a1 = Math.atan2(dz1, dx1);
    const a2 = Math.atan2(dz2, dx2);

    const { start, delta } = shortArcAngles(a1, a2);

    const points = [];

    for (let ri = 0; ri < N_RADII; ri++) {
        const t = N_RADII > 1 ? ri / (N_RADII - 1) : 0.5;
        const r = r1 + (r2 - r1) * t;
        for (let i = 0; i <= N_ARC; i++) {
            const frac = i / N_ARC;
            const angle = start + delta * frac;
            points.push(new THREE.Vector3(
                craneCenter.x + Math.cos(angle) * r,
                craneCenter.y + 0.15,
                craneCenter.z + Math.sin(angle) * r
            ));
        }
    }

    return points;
}

function buildArcLineObject(craneCenter, pick, drop) {
    const dx1 = pick.x - craneCenter.x, dz1 = pick.z - craneCenter.z;
    const dx2 = drop.x - craneCenter.x, dz2 = drop.z - craneCenter.z;
    const r1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
    const r2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
    const a1 = Math.atan2(dz1, dx1);
    const a2 = Math.atan2(dz2, dx2);
    const { start, delta } = shortArcAngles(a1, a2);
    const rMid = (r1 + r2) / 2;

    const pts = [];
    for (let i = 0; i <= N_ARC; i++) {
        const frac = i / N_ARC;
        const angle = start + delta * frac;
        pts.push(new THREE.Vector3(
            craneCenter.x + Math.cos(angle) * rMid,
            craneCenter.y + 0.15,
            craneCenter.z + Math.sin(angle) * rMid
        ));
    }

    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.75,
        depthTest: false,
        linewidth: 2
    });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 998;
    return line;
}

export function updateSwingCheck() {
    clearSwingVisuals();

    const el = document.getElementById('safety-swing');

    const crane = state.placedObjects.find(o => o.userData.type === 'crane');
    const picks = state.placedObjects.filter(o => o.userData.type === 'loadPick');
    const drops = state.placedObjects.filter(o => o.userData.type === 'loadDrop');
    const forbiddenZones = state.placedObjects.filter(
        o => o.userData.type === 'forbidden' && Array.isArray(o.userData.points) && o.userData.points.length >= 3
    );

    if (!crane || picks.length === 0 || drops.length === 0) {
        if (el) el.innerHTML = '<span class="pill ok">- なし</span>';
        return;
    }

    const craneCenter = getCraneCenter(crane);
    const results = [];

    picks.forEach((pick, pi) => {
        drops.forEach((drop, di) => {
            const arcPoints = computeSwingArcPoints(craneCenter, pick.position, drop.position);

            const violations = [];
            forbiddenZones.forEach(zone => {
                const polygon = zone.userData.points;
                const hit = arcPoints.some(p => pointInPolygonXZ(p.x, p.z, polygon));
                if (hit) violations.push(zone);
            });

            results.push({
                pickIndex: pi + 1,
                dropIndex: di + 1,
                violated: violations.length > 0,
                zoneCount: violations.length
            });

            const lineObj = buildArcLineObject(craneCenter, pick.position, drop.position);
            if (violations.length > 0) {
                lineObj.material.color.setHex(0xff3300);
            }
            scene.add(lineObj);
            _swingVisuals.push(lineObj);
        });
    });

    if (el) {
        const anyViolation = results.some(r => r.violated);
        if (results.length === 0) {
            el.innerHTML = '<span class="pill ok">- なし</span>';
        } else if (!anyViolation) {
            el.innerHTML = '<span class="pill ok">✅ 安全</span>';
        } else {
            const msgs = results
                .filter(r => r.violated)
                .map(r => `起#${r.pickIndex}→卸#${r.dropIndex}`)
                .join(' ');
            el.innerHTML = `<span class="pill danger">🚨 禁止区侵入 ${msgs}</span>`;
        }
    }
}
