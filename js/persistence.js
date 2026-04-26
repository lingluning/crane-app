import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';
import { 
    placeCrane, placeLoad, placePlate, 
    updateCraneRadius, updateCounters, updateCraneButton 
} from './tools.js';

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
            ...(obj.userData.type === 'crane' && {
                workRadius: obj.userData.workRadius || 10,
                model: 'TADANO_GR-250N'
            }),
            ...(obj.userData.type === 'plate' && {
                size: obj.userData.size
            })
        }))
    };
    return data;
}

// ============= 反序列化 =============
export function deserialize(data) {
    // 清空
    state.placedObjects.forEach(obj => {
        if (obj.userData.radiusCircle) scene.remove(obj.userData.radiusCircle);
        scene.remove(obj);
    });
    state.placedObjects.length = 0;
    state.selectedObject = null;
    
    // 重建
    data.objects.forEach(item => {
        const point = new THREE.Vector3(item.position.x, item.position.y, item.position.z);
        
        switch (item.type) {
            case 'crane':
                placeCrane(point);
                const lastCrane = state.placedObjects[state.placedObjects.length - 1];
                if (lastCrane) {
                    lastCrane.rotation.y = item.rotation || 0;
                    if (item.workRadius) {
                        updateCraneRadius(lastCrane, item.workRadius);
                    }
                }
                break;
                
            case 'load':
                placeLoad(point);
                const lastLoad = state.placedObjects[state.placedObjects.length - 1];
                if (lastLoad) {
                    lastLoad.rotation.y = item.rotation || 0;
                }
                break;
                
            case 'plate':
                if (item.size) {
                    state.currentPlateSize = item.size;
                }
                placePlate(point);
                const lastPlate = state.placedObjects[state.placedObjects.length - 1];
                if (lastPlate) {
                    lastPlate.rotation.y = item.rotation || 0;
                }
                break;
        }
    });
    
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