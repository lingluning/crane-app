import { calculateAllDistances, getMaxLoadAtDistance, calculateUsage } from './safety-calc.js';
import { state } from './state.js';

export function updateDistanceDisplay() {
    const data = calculateAllDistances();
    const distPanel = document.getElementById('distance-panel');
    const loadPanel = document.getElementById('load-panel');
    
    if (!data) {
        distPanel.classList.add('hidden');
        loadPanel.classList.add('hidden');
        return;
    }
    
    // 距离面板
    if (data.pickDistances.length === 0 && data.dropDistances.length === 0) {
        distPanel.classList.add('hidden');
        loadPanel.classList.add('hidden');
        return;
    }
    
    distPanel.classList.remove('hidden');
    loadPanel.classList.remove('hidden');
    
    // 距离显示（同前）
    updateElement('dist-pick', data.pickDistances);
    updateElement('dist-drop', data.dropDistances);
    
    // 载荷查询（取起吊点的距离）
    if (data.pickDistances.length > 0) {
        const distance = data.pickDistances[0].distance;
        const maxLoad = getMaxLoadAtDistance(data.crane, distance);
        const usage = calculateUsage(state.actualLoad, maxLoad);
        
        document.getElementById('max-load-pick').textContent = 
            maxLoad > 0 ? `${maxLoad.toFixed(2)} t` : '範囲外';
        document.getElementById('usage-pick').textContent = 
            maxLoad > 0 ? `${usage.toFixed(1)} %` : '⚠️ 範囲外';
    }
}

function updateElement(id, distances) {
    const el = document.getElementById(id);
    if (distances.length === 0) {
        el.textContent = '- m';
    } else if (distances.length === 1) {
        el.textContent = `${distances[0].distance.toFixed(2)} m`;
    } else {
        el.innerHTML = distances
            .map((d, i) => `#${i+1}: ${d.distance.toFixed(2)} m`)
            .join('<br>');
    }
}