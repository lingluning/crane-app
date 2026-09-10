import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';
import {
    placeCrane, placeLoadPick, placeLoadDrop, placePlate,
    updateCraneRadius, updateCounters, updateCraneButton,
    removeObjectFully, setSelection, showToast
} from './tools.js';
import {
    finishForbiddenZone, finishPath, addMeasurePoint, hideHint,
    cancelMeasure, cancelDrawing
} from './safety-tools.js';

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
    // Order matters: setSelection walks the current selection to strip highlights,
    // so it has to run while those objects still exist. It also hides the info and
    // crane-control panels — assigning state.selectedObjects directly (as before)
    // left them showing a deleted object after every undo/redo.
    setSelection([], null);
    // measureFirstPoint and drawingPreview live in safety-tools module scope, not in
    // state, so a half-finished measurement or polygon otherwise survives undo and
    // pairs up with the user's next click.
    cancelMeasure();
    cancelDrawing();

    state.placedObjects.slice().forEach(obj => removeObjectFully(obj));
    state.placedObjects.length = 0;

    // Restore global crane settings if saved
    if (data.craneSettings) {
        const cs = data.craneSettings;
        if (cs.craneId != null)       state.currentCraneId       = cs.craneId;
        if (cs.boomLength != null)    state.currentBoomLength    = cs.boomLength;
        if (cs.outriggerMode != null) state.currentOutriggerMode = cs.outriggerMode;
        if (cs.actualLoad != null)    state.actualLoad           = cs.actualLoad;
    }

    let skipped = 0;

    (data.objects || []).forEach(item => {
        const point = new THREE.Vector3(item.position.x, item.position.y, item.position.z);
        const before = state.placedObjects.length;

        switch (item.type) {
            case 'crane': {
                // placeCrane reads these off state, so they must be applied first —
                // but it can bail (model still loading / crane already placed), and
                // leaving them applied would strand the UI on a crane that isn't there.
                const prev = {
                    craneId: state.currentCraneId,
                    boomLength: state.currentBoomLength,
                    outriggerMode: state.currentOutriggerMode
                };
                if (item.craneId != null)       state.currentCraneId       = item.craneId;
                if (item.boomLength != null)    state.currentBoomLength    = item.boomLength;
                if (item.outriggerMode != null) state.currentOutriggerMode = item.outriggerMode;
                placeCrane(point);
                if (state.placedObjects.length === before) {
                    state.currentCraneId       = prev.craneId;
                    state.currentBoomLength    = prev.boomLength;
                    state.currentOutriggerMode = prev.outriggerMode;
                }
                break;
            }
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

        // Only touch the tail object when THIS item is what created it — otherwise
        // a bailed placement would apply the rotation / radius to the previous object.
        if (state.placedObjects.length === before) {
            skipped++;
            return;
        }

        const last = state.placedObjects[state.placedObjects.length - 1];
        last.rotation.y = item.rotation || 0;
        if (item.groupId) last.userData.groupId = item.groupId;
        if (item.type === 'crane' && item.workRadius) {
            updateCraneRadius(last, item.workRadius);
        }
    });

    // measure restore leaves the "click 2 points" hint up
    cancelMeasure();
    hideHint();
    updateCounters();
    updateCraneButton();

    if (skipped > 0) {
        showToast(`${skipped} 個の要素を復元できませんでした`, 'warning', 3500);
    }

    // Notify main.js to sync UI selects (avoids circular dependency)
    window.dispatchEvent(new CustomEvent('crane-state-loaded'));
}

// ============= 自动保存 =============
// onSave receives the already-serialized payload so callers (e.g. the scenario
// tab store) can persist it without running serialize() a second time.
let _autoSaveTimer = null;
export function startAutoSave(intervalMs = 30000, onSave = null) {
    if (_autoSaveTimer) clearInterval(_autoSaveTimer);
    _autoSaveTimer = setInterval(() => {
        if (state.placedObjects.length === 0) return;
        const data = serialize();
        localStorage.setItem('crane_plan_auto', JSON.stringify(data));
        if (onSave) onSave(data);
    }, intervalMs);
}
