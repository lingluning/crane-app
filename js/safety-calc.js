import * as THREE from 'three';
import { state } from './state.js';
import { getCraneCenter } from './tools.js';
import {
    queryLoadChart,
    evaluateSafety
} from './crane-database.js';

/**
 * 计算吊车到载荷的距离（俯视图距离，忽略高度）
 */
export function calculateDistance(craneCenter, loadPos) {
    const dx = loadPos.x - craneCenter.x;
    const dz = loadPos.z - craneCenter.z;
    return Math.sqrt(dx * dx + dz * dz);
}

/**
 * 当前所有距离
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
 * 单个载荷点的完整检查
 */
function checkOneLoadPoint(craneId, outriggerMode, boomLength, distance, actualLoad) {
    const loadResult = queryLoadChart(craneId, outriggerMode, boomLength, distance);

    if (!loadResult.isInRange) {
        return {
            status: 'danger',
            maxLoad: 0,
            usage: 999,
            message: loadResult.message
        };
    }

    const usage = (actualLoad / loadResult.capacity) * 100;
    const status = evaluateSafety(actualLoad, loadResult.capacity);

    return {
        status,
        maxLoad: loadResult.capacity,
        usage,
        isCriticalAngle: loadResult.isCriticalAngle,
        message: loadResult.message || (status === 'danger' ? '使用率超過' : '')
    };
}

/**
 * 完整安全检测（升级版）
 */
export function performSafetyCheck() {
    const data = calculateAllDistances();
    if (!data) return null;

    const crane = data.crane;
    const craneId = crane.userData.craneId;
    const outriggerMode = state.currentOutriggerMode;
    const boomLength = state.currentBoomLength;
    const checks = [];

    data.pickDistances.forEach((d, i) => {
        const check = checkOneLoadPoint(
            craneId, outriggerMode, boomLength,
            d.distance, state.actualLoad
        );
        checks.push({
            type: 'pickLoad',
            index: i,
            obj: d.obj,
            distance: d.distance,
            ...check,
            label: `起吊 #${i + 1}`
        });
    });

    data.dropDistances.forEach((d, i) => {
        const check = checkOneLoadPoint(
            craneId, outriggerMode, boomLength,
            d.distance, state.actualLoad
        );
        checks.push({
            type: 'dropLoad',
            index: i,
            obj: d.obj,
            distance: d.distance,
            ...check,
            label: `卸荷 #${i + 1}`
        });
    });

    const priorities = { safe: 0, caution: 1, danger: 2 };
    let overallStatus = 'safe';
    checks.forEach(c => {
        if (priorities[c.status] > priorities[overallStatus]) {
            overallStatus = c.status;
        }
    });

    return {
        crane,
        checks,
        overallStatus
    };
}
