import * as THREE from 'three';
import { scene, raycaster, models, applyToonStyle } from './scene.js';
import { state } from './state.js';
import { getCrane } from './crane-database.js';


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
        alert('⚠️ クレーンは 1 台のみ配置可能です');
        return;
    }

    if (!models.craneTemplate) {
        console.log('吊车模型还没加载完，请稍等');
        return;
    }
    
    // 获取吊车数据
    const craneData = getCrane(state.currentCraneId);
    if (!craneData) {
        alert('吊车数据不存在');
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

    // ⭐ userData 包含完整信息
    crane.userData = {
        type: 'crane',
        craneId: state.currentCraneId,
        craneData: craneData,
        workRadius: 10,
        outriggerMode: 'max',  // 默认全張出
        centerOffset: craneData.centerPoint
    };
    
    scene.add(crane);
    state.placedObjects.push(crane);
    
    // ⭐ 加中心点标记
    const centerMarker = createCenterMarker(point);
    scene.add(centerMarker);
    crane.userData.centerMarker = centerMarker;
    
    // 半径圆（基于中心点）
    const radiusCircle = createTerrainFollowingCircle(point, 10);
    scene.add(radiusCircle);
    crane.userData.radiusCircle = radiusCircle;
    
    updateCounters();
    document.getElementById('crane-info').classList.remove('hidden');
    updateCraneButton();
}

// ⭐ 新函数：中心点标记
function createCenterMarker(position) {
    const group = new THREE.Group();
    
    // 红色十字（2 条线）—— 关掉深度测试，避免被吊车实体遮住
    const lineMat = new THREE.LineBasicMaterial({
        color: 0xff0000,
        linewidth: 2,
        depthTest: false,
        transparent: true
    });

    const size = 0.5;

    // X 方向线
    const xGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size, 0, 0),
        new THREE.Vector3(size, 0, 0)
    ]);
    const xLine = new THREE.Line(xGeom, lineMat);
    xLine.renderOrder = 999;
    group.add(xLine);

    // Z 方向线
    const zGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -size),
        new THREE.Vector3(0, 0, size)
    ]);
    const zLine = new THREE.Line(zGeom, lineMat);
    zLine.renderOrder = 999;
    group.add(zLine);

    // 中心圆点
    const sphereGeom = new THREE.SphereGeometry(0.1);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        depthTest: false,
        transparent: true
    });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.renderOrder = 999;
    group.add(sphere);
    
    // 放在地面上
    group.position.copy(position);
    group.position.y += 0.1;
    
    group.visible = state.showCenterPoints;
    
    return group;
}

// ⭐ 计算吊车的世界坐标中心
export function getCraneCenter(crane) {
    const offset = crane.userData.centerOffset || { offsetX: 0, offsetZ: 0 };
    return new THREE.Vector3(
        crane.position.x + offset.offsetX,
        crane.position.y,
        crane.position.z + offset.offsetZ
    );
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
    applyToonStyle(load);
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
    applyToonStyle(plate);
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