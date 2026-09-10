import { state } from './state.js';
import { getCrane } from './crane-database.js';
import { getCraneCenter } from './tools.js';

const KN_PER_TON = 9.81;

// ブームを 1 隅に振ったときの最大アウトリガ反力の割合。4 本均等なら 0.25 だが、
// 旋回により 1 本へ偏るのが計画上の最悪ケース。メーカー資料では 0.5〜0.75。
const WORST_CORNER_FACTOR = 0.6;

// アウトリガフロート単体の接地面積 (m²)。25t クラスで約 0.5m 角。
// 敷鉄板が無い場合はこの面積で受けることになる。
const BARE_FLOAT_AREA = 0.25;

const DEFAULT_CRANE_WEIGHT_T = 25;
const DEFAULT_EXTENSION_WIDTH = 5.0;

// 地盤支持力の目安 (kN/m²)
const THRESHOLD_OK = 100;    // 一般的な締固め地盤
const THRESHOLD_WARN = 150;  // 良好な地盤 / 要確認

function craneWeightTons(craneData) {
    if (craneData?.dimensions?.weight != null) return craneData.dimensions.weight / 1000;
    if (craneData?.weight != null) return craneData.weight;
    return DEFAULT_CRANE_WEIGHT_T;
}

// アウトリガ 4 本の接地点（世界座標 XZ）。張出幅を一辺とする正方形で近似する。
function outriggerPositions(crane, craneData) {
    const mode = craneData?.outrigger?.modes?.[state.currentOutriggerMode];
    const half = (mode?.extensionWidth ?? DEFAULT_EXTENSION_WIDTH) / 2;
    const center = getCraneCenter(crane);
    const c = Math.cos(crane.rotation.y);
    const s = Math.sin(crane.rotation.y);

    return [[-half, -half], [half, -half], [half, half], [-half, half]].map(([lx, lz]) => ({
        x: center.x + lx * c + lz * s,
        z: center.z - lx * s + lz * c
    }));
}

// 敷鉄板の上に乗っているか（板は回転しうるのでローカル座標に戻して判定）
function plateUnder(px, pz) {
    const plates = state.placedObjects.filter(o => o.userData.type === 'plate' && o.userData.size);
    for (const plate of plates) {
        const { x: sx, z: sz } = plate.userData.size;
        const dx = px - plate.position.x;
        const dz = pz - plate.position.z;
        const c = Math.cos(-plate.rotation.y);
        const s = Math.sin(-plate.rotation.y);
        const lx = dx * c + dz * s;
        const lz = -dx * s + dz * c;
        if (Math.abs(lx) <= sx / 2 && Math.abs(lz) <= sz / 2) return plate;
    }
    return null;
}

function statusOf(pressure) {
    if (pressure <= THRESHOLD_OK) return 'ok';
    if (pressure <= THRESHOLD_WARN) return 'warn';
    return 'danger';
}

export function updateGroundPressure() {
    const valueEl  = document.getElementById('ground-pressure-value');
    const statusEl = document.getElementById('ground-pressure-status');
    const detailEl = document.getElementById('ground-pressure-detail');

    const crane = state.placedObjects.find(o => o.userData.type === 'crane');
    if (!crane) {
        if (valueEl)  valueEl.innerHTML  = '-<span class="big-stat-unit">kN/m²</span>';
        if (statusEl) statusEl.innerHTML = '<span class="pill ok">- なし</span>';
        if (detailEl) detailEl.textContent = '';
        return;
    }

    const craneData = getCrane(crane.userData.craneId || state.currentCraneId);
    const totalKN = (craneWeightTons(craneData) + (state.actualLoad ?? 0)) * KN_PER_TON;
    const reactionKN = totalKN * WORST_CORNER_FACTOR;

    // 最も条件の悪い（＝接地面積が最小の）アウトリガが計画を支配する
    const positions = outriggerPositions(crane, craneData);
    let worstPressure = 0;
    let platedCount = 0;

    positions.forEach(p => {
        const plate = plateUnder(p.x, p.z);
        if (plate) platedCount++;
        const area = plate
            ? plate.userData.size.x * plate.userData.size.z
            : BARE_FLOAT_AREA;
        worstPressure = Math.max(worstPressure, reactionKN / area);
    });

    const status = statusOf(worstPressure);
    const labels = { ok: 'OK ✅', warn: '注意 ⚠️', danger: '危険 🚨' };

    if (valueEl) valueEl.innerHTML = `${worstPressure.toFixed(0)}<span class="big-stat-unit">kN/m²</span>`;
    if (statusEl) statusEl.innerHTML = `<span class="pill ${status}">${labels[status]}</span>`;
    if (detailEl) {
        detailEl.textContent = platedCount === 4
            ? `敷鉄板 4/4 · 最大反力 ${reactionKN.toFixed(0)} kN`
            : `敷鉄板 ${platedCount}/4 — 未敷設のアウトリガが支配 · 最大反力 ${reactionKN.toFixed(0)} kN`;
    }
}
