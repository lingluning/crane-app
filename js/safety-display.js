import { performSafetyCheck, calculateAllDistances } from './safety-calc.js';
import { SAFETY_COLORS } from './crane-database.js';

const STATUS_ICONS = { safe: '✅', caution: '⚠️', danger: '🚨' };
const STATUS_TITLES = { safe: '安全', caution: '注意', danger: '危険' };
const STATUS_COLORS = {
    safe: 'text-green-400',
    caution: 'text-yellow-400',
    danger: 'text-red-400'
};

export function updateSafetyDisplay() {
    // ----- 距离面板 -----
    const data = calculateAllDistances();
    const distPanel = document.getElementById('distance-panel');

    if (data && (data.pickDistances.length > 0 || data.dropDistances.length > 0)) {
        distPanel.classList.remove('hidden');
        updateDistanceList('dist-pick', data.pickDistances);
        updateDistanceList('dist-drop', data.dropDistances);
    } else {
        distPanel.classList.add('hidden');
    }

    // ----- 安全检测 -----
    const result = performSafetyCheck();

    const maxLoadEl = document.getElementById('max-load-display');
    const usageEl = document.getElementById('usage-display');
    const warningEl = document.getElementById('warning-display');
    const statusPanel = document.getElementById('safety-status-panel');

    if (!result || result.checks.length === 0) {
        if (maxLoadEl) maxLoadEl.textContent = '- t';
        if (usageEl) {
            usageEl.textContent = '- %';
            usageEl.className = 'ml-3 font-mono text-base font-bold text-slate-400';
        }
        if (warningEl) warningEl.textContent = '';
        if (statusPanel) statusPanel.classList.add('hidden');
        return;
    }

    // 第 1 个起吊点（或第 1 个 check）显示为代表
    const firstCheck = result.checks[0];

    if (maxLoadEl) {
        maxLoadEl.textContent = firstCheck.maxLoad > 0
            ? `${firstCheck.maxLoad.toFixed(2)} t`
            : '範囲外';
    }

    if (usageEl) {
        if (firstCheck.maxLoad > 0) {
            usageEl.textContent = `${firstCheck.usage.toFixed(1)} %`;
            usageEl.className = `ml-3 font-mono text-base font-bold ${STATUS_COLORS[firstCheck.status]}`;
        } else {
            usageEl.textContent = '⚠️ 範囲外';
            usageEl.className = 'ml-3 font-mono text-base font-bold text-red-400';
        }
    }

    if (warningEl) warningEl.textContent = firstCheck.message || '';

    // 总体状态面板
    if (statusPanel) {
        statusPanel.classList.remove('hidden');
        document.getElementById('safety-icon').textContent = STATUS_ICONS[result.overallStatus];
        document.getElementById('safety-title').textContent = STATUS_TITLES[result.overallStatus];
        document.getElementById('safety-title').className =
            `font-bold text-base ${STATUS_COLORS[result.overallStatus]}`;

        const details = result.checks
            .map(c => `${c.label}: ${c.message || `${c.usage.toFixed(0)}%`}`)
            .join(' / ');
        document.getElementById('safety-detail').textContent = details;
    }

    // 半径圆颜色随总体状态变化
    if (result.crane.userData.radiusCircle) {
        result.crane.userData.radiusCircle.material.color.setHex(
            SAFETY_COLORS[result.overallStatus]
        );
    }
}

function updateDistanceList(id, distances) {
    const el = document.getElementById(id);
    if (!el) return;
    if (distances.length === 0) {
        el.textContent = '- m';
    } else if (distances.length === 1) {
        el.textContent = `${distances[0].distance.toFixed(2)} m`;
    } else {
        el.innerHTML = distances
            .map((d, i) => `#${i + 1}: ${d.distance.toFixed(2)} m`)
            .join('<br>');
    }
}
