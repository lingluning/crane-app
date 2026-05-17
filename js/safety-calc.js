import * as THREE from 'three';
import { state } from './state.js';
import { getCraneCenter } from './tools.js';
import { queryLoadChart } from './crane-database.js';



/**
 * 计算吊车到载荷的距离（俯视图距离，忽略高度）
 */
export function calculateDistance(craneCenter, loadPos) {
    const dx = loadPos.x - craneCenter.x;
    const dz = loadPos.z - craneCenter.z;
    return Math.sqrt(dx * dx + dz * dz);
}

/**
 * 获取当前所有相关距离
 */
export function calculateAllDistances() {
    const crane = state.placedObjects.find(o => o.userData.type === 'crane');
    if (!crane) return null;
    
    const craneCenter = getCraneCenter(crane);
    
    const pickPoints = state.placedObjects.filter(o => o.userData.type === 'loadPick');
    const dropPoints = state.placedObjects.filter(o => o.userData.type === 'loadDrop');
    
    return {
        crane,
        craneCenter,
        pickDistances: pickPoints.map(p => ({
            obj: p,
            distance: calculateDistance(craneCenter, p.position)
        })),
        dropDistances: dropPoints.map(p => ({
            obj: p,
            distance: calculateDistance(craneCenter, p.position)
        }))
    };
}


/**
 * 获取当前吊车 + 当前距离 → 最大允许吊重
 */
export function getMaxLoadAtDistance(crane, distance) {
    const craneId = crane.userData.craneId;
    const outriggerMode = crane.userData.outriggerMode || 'max';
    
    return queryLoadChart(craneId, outriggerMode, distance);
}

/**
 * 计算使用率
 */
export function calculateUsage(actualLoad, maxLoad) {
    if (!maxLoad || maxLoad <= 0) return 100;
    return (actualLoad / maxLoad) * 100;
}