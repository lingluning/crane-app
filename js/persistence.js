import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';
import {
    placeCrane, placeLoadPick, placeLoadDrop, placePlate,
    updateCraneRadius, updateCounters, updateCraneButton,
    removeObjectFully
} from './tools.js';
import { finishForbiddenZone, finishPath, addMeasurePoint, hideHint } from './safety-tools.js';

// ============= 序列化 =============
export function serialize() {
    const data = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        objects: state.placedObjects.map(obj => ({
            type: obj.userData.type,
            position: {
                x: obj.position.x,
                y: obj.position.y,
                z: obj.position.z
            },
            rotation: obj.rotation.y,
            ...(obj.userData.groupId && { groupId: obj.userData.groupId }),
            ...(obj.userData.type === 'crane' && {
                workRadius: obj.userData.workRadius || 10,
                model: 'TADANO_GR-250N'
            }),
            ...(obj.userData.type === 'plate' && {
                size: obj.userData.size
            }),
            ...((obj.userData.type === 'forbidden' || obj.userData.type === 'path') && {
                points: obj.userData.points
            }),
            ...(obj.userData.type === 'measure' && {
                from: obj.userData.from,
                to: obj.userData.to
            })
        }))
    };
    return data;
}

// ============= 反序列化 =============
export function deserialize(data) {
    // 清空：removeObjectFully で centerMarker / border / textLabel / arrows なども確実に回収
    // （以前は radiusCircle と obj 自身しか外していなくて、中心マーカーが幽霊化していた）
    state.placedObjects.slice().forEach(obj => removeObjectFully(obj));
    state.placedObjects.length = 0;
    state.selectedObject = null;
    state.selectedObjects = [];
    
    // 重建
    data.objects.forEach(item => {
        const point = new THREE.Vector3(item.position.x, item.position.y, item.position.z);

        switch (item.type) {
            case 'crane':
                placeCrane(point);
                break;
            case 'loadPick':
            case 'load':   // 旧存档兼容
                placeLoadPick(point);
                break;
            case 'loadDrop':
                placeLoadDrop(point);
                break;
            case 'plate':
                if (item.size) state.currentPlateSize = item.size;
                placePlate(point);
                break;
            case 'forbidden':
                if (item.points && item.points.length >= 3) {
                    state.drawingPoints = item.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                    finishForbiddenZone();
                }
                break;
            case 'path':
                if (item.points && item.points.length >= 2) {
                    state.drawingPoints = item.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                    finishPath();
                }
                break;
            case 'measure':
                if (item.from && item.to) {
                    addMeasurePoint(new THREE.Vector3(item.from.x, item.from.y, item.from.z));
                    addMeasurePoint(new THREE.Vector3(item.to.x, item.to.y, item.to.z));
                }
                break;
        }

        const last = state.placedObjects[state.placedObjects.length - 1];
        if (!last) return;

        last.rotation.y = item.rotation || 0;
        if (item.groupId) last.userData.groupId = item.groupId;
        if (item.type === 'crane' && item.workRadius) {
            updateCraneRadius(last, item.workRadius);
        }
    });

    hideHint();   // addMeasurePoint が出す測定ヒントを消す
    updateCounters();
    updateCraneButton();
}

// ============= 自动保存 =============
export function startAutoSave(intervalMs = 30000) {
    setInterval(() => {
        if (state.placedObjects.length > 0) {
            const data = serialize();
            localStorage.setItem('crane_plan_auto', JSON.stringify(data));
            console.log('🔄 自动保存:', new Date().toLocaleTimeString());
        }
    }, intervalMs);
}