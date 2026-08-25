import * as THREE from 'three';
import { scene } from './scene.js';
import { state, bumpRevision } from './state.js';
import {
    placeCrane, placeLoadPick, placeLoadDrop, placePlate,
    updateCraneRadius, updateCounters, updateCraneButton,
    removeObjectFully
} from './tools.js';
import { finishForbiddenZone, finishPath, addMeasurePoint, hideHint } from './safety-tools.js';

// ============= 序列化 =============
export function serialize() {
    const data = {
        version: '1.1',
        savedAt: new Date().toISOString(),
        craneSettings: {
            craneId: state.currentCraneId,
            boomLength: state.currentBoomLength,
            outriggerMode: state.currentOutriggerMode,
            actualLoad: state.actualLoad
        },
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
                craneId: obj.userData.craneId || state.currentCraneId,
                boomLength: obj.userData.boomLength || state.currentBoomLength,
                outriggerMode: obj.userData.outriggerMode || state.currentOutriggerMode
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
    state.placedObjects.slice().forEach(obj => removeObjectFully(obj));
    state.placedObjects.length = 0;
    state.selectedObject = null;
    state.selectedObjects = [];

    // Restore global crane settings if saved
    if (data.craneSettings) {
        if (data.craneSettings.craneId)       state.currentCraneId       = data.craneSettings.craneId;
        if (data.craneSettings.boomLength)    state.currentBoomLength    = data.craneSettings.boomLength;
        if (data.craneSettings.outriggerMode) state.currentOutriggerMode = data.craneSettings.outriggerMode;
        if (data.craneSettings.actualLoad != null) state.actualLoad      = data.craneSettings.actualLoad;
    }

    (data.objects || []).forEach(item => {
        const point = new THREE.Vector3(item.position.x, item.position.y, item.position.z);
        const countBefore = state.placedObjects.length;

        switch (item.type) {
            case 'crane':
                // Apply per-crane settings before placeCrane reads state
                if (item.craneId)       state.currentCraneId       = item.craneId;
                if (item.boomLength)    state.currentBoomLength    = item.boomLength;
                if (item.outriggerMode) state.currentOutriggerMode = item.outriggerMode;
                placeCrane(point);
                break;
            case 'loadPick':
            case 'load':
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

        // この item が実際にオブジェクトを生成したときだけ属性を復元する。
        // （点数不足で finishForbiddenZone / finishPath が中断した場合、
        //   末尾は「1 つ前のオブジェクト」なので、そこへ書き込むと破壊してしまう）
        if (state.placedObjects.length === countBefore) return;
        const last = state.placedObjects[state.placedObjects.length - 1];

        // ⭐ Y をセーブ値へ戻す。
        //   placeLoadPick/Drop は +0.5、placePlate は +0.05 の設置オフセットを
        //   無条件に足すが、serialize が保存しているのは「オフセット加算後」の Y。
        //   そのまま place に渡すと読み込みのたびに二重加算され、
        //   ロード / Undo / Redo / シナリオ切替のたびにオブジェクトが浮き上がる。
        if (Number.isFinite(item.position.y)) {
            last.position.y = item.position.y;
        }

        last.rotation.y = item.rotation || 0;
        if (item.groupId) last.userData.groupId = item.groupId;
        if (item.type === 'crane' && item.workRadius) {
            updateCraneRadius(last, item.workRadius);
        }
    });

    hideHint();
    updateCounters();
    updateCraneButton();
    bumpRevision();

    // Notify main.js to sync UI selects (avoids circular dependency)
    window.dispatchEvent(new CustomEvent('crane-state-loaded'));
}

// ============= 自动保存 =============
let _autoSaveTimer = null;
export function startAutoSave(intervalMs = 30000) {
    if (_autoSaveTimer) clearInterval(_autoSaveTimer);
    _autoSaveTimer = setInterval(() => {
        if (state.placedObjects.length > 0) {
            const data = serialize();
            localStorage.setItem('crane_plan_auto', JSON.stringify(data));
        }
    }, intervalMs);
}
