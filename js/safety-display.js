import { performSafetyCheck, calculateAllDistances } from './safety-calc.js';
import { SAFETY_COLORS } from './crane-database.js';
import { state } from './state.js';

// 半径円の色はこのモジュールが唯一の書き手。
// checkSafety() は判定結果を crane.userData.zoneConflict に置くだけで、
// material には触れない（両方が別基準で書いて点滅していたため）。
const NEUTRAL_CIRCLE_COLOR = 0xff0000;   // 評価材料が無いときの既定色

function updateRadiusCircleColors(loadStatus) {
    state.placedObjects.forEach(obj => {
        if (obj.userData.type !== 'crane') return;
        const circle = obj.userData.radiusCircle;
        if (!circle || !circle.material) return;

        if (obj.userData.zoneConflict) {
            circle.material.color.setHex(SAFETY_COLORS.danger);
            circle.material.opacity = 0.65;
        } else if (loadStatus) {
            circle.material.color.setHex(SAFETY_COLORS[loadStatus] ?? NEUTRAL_CIRCLE_COLOR);
            circle.material.opacity = 0.55;
        } else {
            circle.material.color.setHex(NEUTRAL_CIRCLE_COLOR);
            circle.material.opacity = 0.55;
        }
    });
}

const STATUS_ICONS = { safe: '✅', caution: '⚠️', danger: '🚨' };

const STATUS_TITLES = { safe: '安全', caution: '注意', danger: '危険' };
const STATUS_COLORS = {
    safe: 'text-green-400',
    caution: 'text-yellow-400',
    danger: 'text-red-400'
};

// capacity が 0 のとき usage は Infinity になりうる。そのまま toFixed すると
// 画面に "Infinity %" と出てしまうので、範囲外として表示する。
function formatUsage(usage, digits) {
    return Number.isFinite(usage) ? `${usage.toFixed(digits)}` : '範囲外';
}

export function updateSafetyDisplay() {
    // ----- 距离面板 -----
    const data = calculateAllDistances();
    const distPanel = document.getElementById('distance-panel');

    if (distPanel) {
        if (data && (data.pickDistances.length > 0 || data.dropDistances.length > 0)) {
            distPanel.classList.remove('hidden');
            updateDistanceList('dist-pick', data.pickDistances);
            updateDistanceList('dist-drop', data.dropDistances);
        } else {
            distPanel.classList.add('hidden');
        }
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
        // 吊点が無くても禁止区との重複は着色したいので、ここでも必ず通す
        updateRadiusCircleColors(null);
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
            usageEl.textContent = Number.isFinite(firstCheck.usage)
                ? `${firstCheck.usage.toFixed(1)} %`
                : '⚠️ 範囲外';
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
        const iconEl  = document.getElementById('safety-icon');
        const titleEl = document.getElementById('safety-title');
        if (iconEl)  iconEl.textContent  = STATUS_ICONS[result.overallStatus];
        if (titleEl) {
            titleEl.textContent = STATUS_TITLES[result.overallStatus];
            titleEl.className = `font-bold text-base ${STATUS_COLORS[result.overallStatus]}`;
        }

        const details = result.checks
            .map(c => `${c.label}: ${c.message || `${formatUsage(c.usage, 0)}%`}`)
            .join(' / ');
        const detailEl = document.getElementById('safety-detail');
        if (detailEl) detailEl.textContent = details;
    }

    // 半径圆颜色：禁止区との重複を優先し、無ければ荷載状態で着色
    updateRadiusCircleColors(result.overallStatus);
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
