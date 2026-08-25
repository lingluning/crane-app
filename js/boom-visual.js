import * as THREE from 'three';
import { scene, CSS2DObject } from './scene.js';
import { state } from './state.js';
import { getCraneCenter } from './tools.js';

const boomVisuals = [];

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
}

export function updateBoomVisuals() {
    clearBoomVisuals();

    const crane = state.placedObjects.find(o => o.userData.type === 'crane');
    if (!crane) return;

    const craneCenter = getCraneCenter(crane);

    const loadPoints = state.placedObjects.filter(
        o => o.userData.type === 'loadPick' || o.userData.type === 'loadDrop'
    );

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
        const reachDist = Math.sqrt(horizontalDist * horizontalDist + dy * dy);

        // ブーム起伏角 θ ≈ acos(作業半径 / ブーム長)。
        // 以前は atan2(dy, 水平距離) を「ブーム角」として出していたが、
        // これは吊車中心から吊点への「見下ろし角」であって起伏角ではない。
        // 吊点は地面上にあるので値はほぼ 0 か負になり、現場向けの
        // 表示としては誤解を招く。
        const boomLength = crane.userData.boomLength || state.currentBoomLength;
        const boomAngleDeg = (boomLength && horizontalDist <= boomLength)
            ? Math.acos(horizontalDist / boomLength) * (180 / Math.PI)
            : null;
        const boomAngleText = boomAngleDeg === null
            ? '範囲外'
            : `${boomAngleDeg.toFixed(1)}°`;

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

        const arcSegments = 64;
        const arcAngle = Math.PI * 2;
        const innerRadius = horizontalDist - 0.15;
        const outerRadius = horizontalDist + 0.15;
        const ringGeo = new THREE.RingGeometry(
            Math.max(0.1, innerRadius),
            outerRadius,
            arcSegments,
            1,
            0,
            arcAngle * 0.25
        );
        const ringMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthTest: false,
        });
        const arc = new THREE.Mesh(ringGeo, ringMat);
        arc.rotation.x = -Math.PI / 2;
        arc.position.set(craneCenter.x, craneCenter.y + 0.01, craneCenter.z);

        // RingGeometry は XY 平面で 0〜90° に張られ、rotation.x=-90° で
        // 世界 XZ に倒れる。このとき世界方位角は -(θ + rotation.z) になるため、
        // 90° 扇形の中心を吊点方向 angle に合わせるには
        //   -(rotation.z + 45°) = angle  →  rotation.z = -(angle + 45°)
        // が正しい。以前は -(angle - 22.5°) で、扇形が吊点から 67.5° ずれた
        // 方向に描かれていた。
        const angle = Math.atan2(dz, dx);
        arc.rotation.z = -(angle + Math.PI / 4);
        arc.renderOrder = 9;
        scene.add(arc);
        boomVisuals.push(arc);

        const labelText = `${labelPrefix}: ${reachDist.toFixed(1)}m / ${boomAngleText}`;
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
