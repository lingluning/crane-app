import * as THREE from 'three';
import { scene, raycaster, models } from './scene.js';
import { state } from './state.js';

// ============= 工具切换 =============
export function selectTool(toolName) {
    state.currentTool = toolName;

    document.querySelectorAll('.tool-btn').forEach(b => {
        b.classList.remove('active');
    });
    document.querySelector(`[data-tool="${toolName}"]`).classList.add('active');

    updateGhost();
    
    document.getElementById('plate-options').classList.toggle('hidden', toolName !== 'plate');
    
    // ⭐ 切换工具时取消正在画的
    if (state.drawingPoints.length > 0) {
        state.drawingPoints = [];
        if (state.drawingPreview) {
            scene.remove(state.drawingPreview);
            state.drawingPreview = null;
        }
    }
    
    // ⭐ 显示提示
    const hint = document.getElementById('drawing-hint');
    if (toolName === 'forbidden') {
        document.getElementById('hint-text').textContent = '🚫 地面をクリックして禁止区の角を指定 (3 点以上 + Enter で確定)';
        hint.classList.remove('hidden');
    } else if (toolName === 'path') {
        document.getElementById('hint-text').textContent = '🟢 地面をクリックして通路の点を追加 (Enter で確定)';
        hint.classList.remove('hidden');
    } else if (toolName === 'measure') {
        document.getElementById('hint-text').textContent = '📏 2 点をクリックして距離を測定';
        hint.classList.remove('hidden');
    } else {
        hint.classList.add('hidden');
    }
}

// ============= Ghost =============
export function updateGhost() {
    if (state.ghost) {
        scene.remove(state.ghost);
        state.ghost = null;
    }

    let geometry, material;

    switch (state.currentTool) {
        case 'crane':
            geometry = new THREE.CylinderGeometry(0.5, 0.7, 1.5);
            material = new THREE.MeshStandardMaterial({ 
                color: 0xffc800, transparent: true, opacity: 0.5 
            });
            break;
        case 'load':
            geometry = new THREE.BoxGeometry(1, 1, 1);
            material = new THREE.MeshStandardMaterial({ 
                color: 0x8b6f47, transparent: true, opacity: 0.5 
            });
            break;
        case 'plate':
            geometry = new THREE.BoxGeometry(
                state.currentPlateSize.x, 0.1, state.currentPlateSize.z
            );
            material = new THREE.MeshStandardMaterial({ 
                color: 0xffd700, transparent: true, opacity: 0.5 
            });
            break;
        case 'select':
            return;
    }

    state.ghost = new THREE.Mesh(geometry, material);
    scene.add(state.ghost);
}

// ============= 放置函数 =============
export function placeCrane(point) {
    const existingCrane = state.placedObjects.find(o => o.userData.type === 'crane');
    if (existingCrane) {
        alert('⚠️ クレーンは 1 台のみ配置可能です\n既存のクレーンを削除してから配置してください');
        return;
    }

    if (!models.craneTemplate) {
        console.log('吊车模型还没加载完，请稍等');
        return;
    }
    
    const crane = models.craneTemplate.clone();
    crane.position.copy(point);
    crane.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            if (child.material) {
                child.material = child.material.clone();
            }
        }
    });

    crane.userData = { type: 'crane' };
    scene.add(crane);
    state.placedObjects.push(crane);
    updateCounters();

    // 作业半径圆
    const radiusGeom = new THREE.RingGeometry(10, 12, 64);
    const radiusMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5
    });
    const radiusCircle = new THREE.Mesh(radiusGeom, radiusMat);
    radiusCircle.rotation.x = -Math.PI / 2;
    radiusCircle.position.copy(point);
    radiusCircle.position.y += 0.05;
    scene.add(radiusCircle);
    
    crane.userData.radiusCircle = radiusCircle;

    document.getElementById('crane-info').classList.remove('hidden');
    const count = state.placedObjects.filter(o => o.userData.type === 'crane').length;
    document.getElementById('info-count').textContent = count;
    
    updateCraneButton();
}

export function placeLoad(point) {
    const load = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x8b6f47 })
    );
    load.position.copy(point);
    load.position.y += 0.5;
    load.castShadow = true;
    load.userData = { type: 'load' };
    scene.add(load);
    state.placedObjects.push(load);
    updateCounters();
}

export function placePlate(point) {
    const { x: sx, z: sz } = state.currentPlateSize;
    
    const plate = new THREE.Mesh(
        new THREE.BoxGeometry(sx, 0.1, sz),
        new THREE.MeshStandardMaterial({ color: 0xffd700 })
    );
    plate.position.copy(point);
    plate.position.x = snapToGrid(plate.position.x);
    plate.position.z = snapToGrid(plate.position.z);
    plate.position.y += 0.05;
    
    plate.receiveShadow = true;
    plate.userData = { type: 'plate', size: { x: sx, z: sz } };
    scene.add(plate);
    state.placedObjects.push(plate);
    updateCounters();
}

// ============= 选择 / 高亮 =============
export function handleSelect() {
    const intersects = raycaster.intersectObjects(state.placedObjects, true);
    
    if (state.selectedObject) {
        clearHighlight(state.selectedObject);
        state.selectedObject = null;
    }
    
    if (intersects.length > 0) {
        const root = findRootObject(intersects[0].object);
        if (root) {
            state.selectedObject = root;
            applyHighlight(state.selectedObject);
            console.log('选中了:', state.selectedObject.userData.type);
        }
    }
    
    showInfo(state.selectedObject);

    // 显示/隐藏控制面板
    const ctrl = document.getElementById('crane-control');
    if (state.selectedObject && state.selectedObject.userData.type === 'crane') {
        ctrl.classList.remove('hidden');
        const r = state.selectedObject.userData.workRadius || 10;
        document.getElementById('radius-slider').value = r;
        document.getElementById('radius-value').textContent = r.toFixed(1);
        
        const rot = (state.selectedObject.rotation.y * 180 / Math.PI) % 360;
        document.getElementById('rotation-slider').value = rot;
        document.getElementById('rotation-value').textContent = rot.toFixed(0);
    } else {
        ctrl.classList.add('hidden');
    }
}

export function findRootObject(mesh) {
    let obj = mesh;
    while (obj) {
        if (state.placedObjects.includes(obj)) {
            return obj;
        }
        obj = obj.parent;
    }
    return null;
}

export function applyHighlight(obj) {
    obj.traverse(child => {
        if (child.isMesh && child.material && child.material.emissive) {
            if (child.userData._origEmissive === undefined) {
                child.userData._origEmissive = child.material.emissive.getHex();
            }
            child.material.emissive.setHex(0x0044ff);
        }
    });
}

export function clearHighlight(obj) {
    obj.traverse(child => {
        if (child.isMesh && child.material && child.material.emissive) {
            if (child.userData._origEmissive !== undefined) {
                child.material.emissive.setHex(child.userData._origEmissive);
            } else {
                child.material.emissive.setHex(0x000000);
            }
        }
    });
}

// ============= UI 更新 =============
export function showInfo(obj) {
    const panel = document.getElementById('info-panel');
    const content = document.getElementById('info-content');

    if (!obj) {
        panel.classList.add('hidden');
        return;
    }

    const typeNames = {
        crane: '🏗️ クレーン',
        load: '📦 吊荷',
        plate: '🟨 敷鉄板'
    };

    content.innerHTML = `
        <div>種類: ${typeNames[obj.userData.type]}</div>
        <div>位置: X=${obj.position.x.toFixed(1)}, Z=${obj.position.z.toFixed(1)}</div>
        <div class="text-xs text-slate-400 mt-2">DEL キーで削除</div>
    `;
    panel.classList.remove('hidden');
}

export function updateCounters() {
    const cranes = state.placedObjects.filter(o => o.userData.type === 'crane');
    const loads = state.placedObjects.filter(o => o.userData.type === 'load');
    const plates = state.placedObjects.filter(o => o.userData.type === 'plate');
    const forbidden = state.placedObjects.filter(o => o.userData.type === 'forbidden');
    const paths = state.placedObjects.filter(o => o.userData.type === 'path');
    const measures = state.placedObjects.filter(o => o.userData.type === 'measure');

    
    document.getElementById('count-crane').textContent = cranes.length;
    document.getElementById('count-load').textContent = loads.length;
    document.getElementById('count-plate').textContent = plates.length;
    document.getElementById('count-forbidden').textContent = forbidden.length;
    document.getElementById('count-path').textContent = paths.length;
}

export function updateCraneButton() {
    const btn = document.querySelector('[data-tool="crane"]');
    const hasCrane = state.placedObjects.some(o => o.userData.type === 'crane');
    
    if (hasCrane) {
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.title = 'クレーンは 1 台まで';
    } else {
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        btn.title = '';
    }
}

export function updateCraneRadius(crane, radiusMeters) {
    if (crane.userData.radiusCircle) {
        scene.remove(crane.userData.radiusCircle);
    }
    
    const radiusGeom = new THREE.RingGeometry(
        radiusMeters - 0.15, radiusMeters + 0.15, 64
    );
    const radiusMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5
    });
    const newCircle = new THREE.Mesh(radiusGeom, radiusMat);
    newCircle.rotation.x = -Math.PI / 2;
    newCircle.position.copy(crane.position);
    newCircle.position.y += 0.05;
    scene.add(newCircle);
    
    crane.userData.radiusCircle = newCircle;
    crane.userData.workRadius = radiusMeters;
}

// ============= 工具函数 =============
export function snapToGrid(value, gridSize = 0.5) {
    return Math.round(value / gridSize) * gridSize;
}