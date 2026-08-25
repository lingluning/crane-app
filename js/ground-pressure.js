import { state } from './state.js';
import { getCrane } from './crane-database.js';

/**
 * アウトリガ接地圧の推定
 *
 * パネルのラベルは「アウトリガ圧」＝ 1 本あたりの接地圧なので、
 *   接地圧 = 最大アウトリガ反力 / 接地面積
 * で求める。
 *
 * 以前の実装は (機体重量 + 吊荷) 全体を固定 2.0 m² で割っていた。
 * しかも参照していた modes[].footprintArea はデータベースに一度も
 * 定義されておらず、常に 2.0 m² へフォールバックしていたため、
 * 張出モードや敷鉄板を何に変えても数値が動かず、既定構成では
 * 常時「危険」を表示していた（25t 機 + 5t 吊りで 161.9 kN/m²）。
 *
 * ⚠ MAX_REACTION_RATIO は計画用の保守的な仮定値であり、メーカーの
 *   アウトリガ反力表の代わりにはならない。実機の反力表がある場合は
 *   crane-database.js の outrigger.maxReactionRatio に入れて上書きすること。
 */

const DEFAULT_CRANE_WEIGHT = 25;        // t（DB に重量が無い場合）
const KN_PER_TON = 9.81;

// 吊荷がブーム側の隅に来たとき、最も荷重を受けるアウトリガ 1 本が
// 全体（機体 + 吊荷）のうち負担する割合。4 本均等なら 0.25 だが、
// 旋回位置によって偏るため計画時は保守側に取る。
const MAX_REACTION_RATIO = 0.75;

// アウトリガフロート単体の接地面積（敷鉄板を敷かない場合）。
// 25t クラスのフロートは概ね 0.5m 角程度。
const BARE_FLOAT_AREA = 0.25;           // m²

// 判定しきい値（kN/m²）。普通地盤の許容支持力を想定した目安。
const THRESHOLD_GREEN = 100;
const THRESHOLD_YELLOW = 150;

function getPressureStatus(pressure) {
    if (pressure <= THRESHOLD_GREEN) return 'ok';
    if (pressure <= THRESHOLD_YELLOW) return 'warn';
    return 'danger';
}

// 接地面積：敷鉄板が配置されていればその 1 枚の面積、無ければフロート単体。
// 敷鉄板を敷く／敷かないで接地圧が変わるという、このアプリ本来の判断材料にする。
function resolveContactArea() {
    const plate = state.placedObjects.find(o => o.userData.type === 'plate');
    if (plate && plate.userData.size) {
        const { x, z } = plate.userData.size;
        if (Number.isFinite(x) && Number.isFinite(z) && x > 0 && z > 0) {
            return { area: x * z, basis: `敷鉄板 ${x}×${z} m` };
        }
    }
    return { area: BARE_FLOAT_AREA, basis: 'フロート単体（敷鉄板なし）' };
}

export function updateGroundPressure() {
    const crane = state.placedObjects.find(o => o.userData.type === 'crane');
    const valueEl  = document.getElementById('ground-pressure-value');
    const statusEl = document.getElementById('ground-pressure-status');

    if (!crane) {
        if (valueEl)  valueEl.innerHTML  = '-<span class="big-stat-unit">kN/m²</span>';
        if (statusEl) statusEl.innerHTML = '<span class="pill ok">- なし</span>';
        if (valueEl) valueEl.title = '';
        return;
    }

    const craneData = getCrane(crane.userData.craneId || state.currentCraneId);
    const craneWeight = craneData?.dimensions?.weight != null
        ? craneData.dimensions.weight / 1000
        : (craneData?.weight ?? DEFAULT_CRANE_WEIGHT);

    const ratio = craneData?.outrigger?.maxReactionRatio ?? MAX_REACTION_RATIO;
    const { area, basis } = resolveContactArea();

    const totalWeight = craneWeight + (state.actualLoad ?? 0);      // t
    const maxReaction = totalWeight * ratio * KN_PER_TON;           // kN（最大 1 本分）
    const pressure = maxReaction / area;                            // kN/m²

    const status = getPressureStatus(pressure);
    const labels = { ok: 'OK ✅', warn: '注意 ⚠️', danger: '危険 🚨' };

    if (valueEl) {
        valueEl.innerHTML = `${pressure.toFixed(1)}<span class="big-stat-unit">kN/m²</span>`;
        valueEl.title =
            `最大アウトリガ反力 ${maxReaction.toFixed(1)} kN` +
            ` = (機体 ${craneWeight} t + 吊荷 ${(state.actualLoad ?? 0)} t) × ${ratio}\n` +
            `接地面積 ${area.toFixed(2)} m²（${basis}）\n` +
            `⚠ 反力比は計画用の仮定値。実機のアウトリガ反力表で必ず確認すること。`;
    }
    if (statusEl) statusEl.innerHTML = `<span class="pill ${status}">${labels[status]}</span>`;
}
