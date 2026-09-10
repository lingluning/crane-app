import * as THREE from 'three';
import { scene, CSS2DObject } from './scene.js';
import { state } from './state.js';
import { getCraneCenter } from './tools.js';

const boomVisuals = [];

// Signature of the inputs the visuals are derived from. This runs on a 200ms
// timer, so without it an idle scene churns geometry/material allocations
// (3 per load point, 5×/second) purely to redraw the same picture.
let lastSignature = null;

function computeSignature(craneCenter, loadPoints) {
    let sig = `${craneCenter.x.toFixed(3)},${craneCenter.y.toFixed(3)},${craneCenter.z.toFixed(3)}`;
    for (const lp of loadPoints) {
        const p = lp.position;
        sig += `|${lp.userData.type}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    }
    return sig;
}

export function clearBoomVisuals() {
    for (const obj of boomVisuals) {
        if (obj.element && obj.element.parentNode) {
            obj.element.parentNode.removeChild(obj.element);
        }
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    }
    boomVisuals.length = 0;
    lastSignature = null;
}

export function updateBoomVisuals() {
    const crane = state.placedObjects.find(o => o.userData.type === 'crane');
    const loadPoints = crane
        ? state.placedObjects.filter(
            o => o.userData.type === 'loadPick' || o.userData.type === 'loadDrop')
        : [];

    if (!crane || loadPoints.length === 0) {
        if (boomVisuals.length > 0) clearBoomVisuals();
        return;
    }

    const craneCenter = getCraneCenter(crane);
    const signature = computeSignature(craneCenter, loadPoints);
    if (signature === lastSignature) return;

    clearBoomVisuals();
    lastSignature = signature;

    for (const lp of loadPoints) {
        const isPick = lp.userData.type === 'loadPick';
        const color = isPick ? 0x00cc44 : 0xff3333;
        const labelPrefix = isPick ? '起吊' : '落吊';

        const loadPos = new THREE.Vector3();
        lp.getWorldPosition(loadPos);

        const dx = loadPos.x - craneCenter.x;
        const dz = loadPos.z - craneCenter.z;
        const dy = loadPos.y - craneCenter.y;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        const boomAngleDeg = Math.atan2(dy, horizontalDist) * (180 / Math.PI);
        const reachDist = Math.sqrt(horizontalDist * horizontalDist + dy * dy);

        const lineMat = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.7,
            depthTest: false,
        });
        const lineGeo = new THREE.BufferGeometry().setFromPoints([craneCenter, loadPos]);
        const line = new THREE.Line(lineGeo, lineMat);
        line.renderOrder = 10;
        scene.add(line);
        boomVisuals.push(line);

        // Reach arc, centred on the bearing to this load point.
        // RingGeometry builds in XY; after rotation.x = -90° a local angle θ lands at
        // world azimuth −θ, so the sweep has to start at −bearing − half to come out centred.
        const bearing = Math.atan2(dz, dx);
        const ARC_SPAN = Math.PI / 2;
        const arc = new THREE.Mesh(
            new THREE.RingGeometry(
                Math.max(0.05, horizontalDist - 0.15),
                Math.max(0.20, horizontalDist + 0.15),
                48, 1,
                -bearing - ARC_SPAN / 2,
                ARC_SPAN
            ),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide,
                depthTest: false,
            })
        );
        arc.rotation.x = -Math.PI / 2;
        arc.position.set(craneCenter.x, craneCenter.y + 0.01, craneCenter.z);
        arc.renderOrder = 9;
        scene.add(arc);
        boomVisuals.push(arc);

        const labelText = `${labelPrefix}: ${reachDist.toFixed(1)}m / ${boomAngleDeg.toFixed(1)}°`;
        const div = document.createElement('div');
        div.style.cssText = [
            'background:rgba(0,0,0,0.55)',
            'color:#fff',
            'padding:2px 6px',
            'border-radius:3px',
            'font-size:11px',
            'pointer-events:none',
            'white-space:nowrap',
            `border-left:3px solid ${isPick ? '#00cc44' : '#ff3333'}`,
        ].join(';');
        div.textContent = labelText;

        const label = new CSS2DObject(div);
        const midPoint = new THREE.Vector3().addVectors(craneCenter, loadPos).multiplyScalar(0.5);
        midPoint.y += 0.5;
        label.position.copy(midPoint);
        scene.add(label);
        boomVisuals.push(label);
    }
}
