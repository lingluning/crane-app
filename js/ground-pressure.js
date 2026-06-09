import { state } from './state.js';
import { getCrane } from './crane-database.js';

const DEFAULT_CRANE_WEIGHT = 25;
const DEFAULT_FOOTPRINT_AREA = 2.0;
const KN_PER_TON = 9.81;

const THRESHOLD_GREEN = 100;
const THRESHOLD_YELLOW = 150;

function getPressureStatus(pressure) {
    if (pressure <= THRESHOLD_GREEN) return 'ok';
    if (pressure <= THRESHOLD_YELLOW) return 'warn';
    return 'danger';
}

export function updateGroundPressure() {
    const crane = state.placedObjects.find(o => o.userData.type === 'crane');
    const valueEl  = document.getElementById('ground-pressure-value');
    const statusEl = document.getElementById('ground-pressure-status');

    if (!crane) {
        if (valueEl)  valueEl.innerHTML  = '-<span class="big-stat-unit">kN/m²</span>';
        if (statusEl) statusEl.innerHTML = '<span class="pill ok">- なし</span>';
        return;
    }

    const craneData = getCrane(state.currentCraneId);
    const craneWeight = craneData?.dimensions?.weight != null
        ? craneData.dimensions.weight / 1000
        : (craneData?.weight ?? DEFAULT_CRANE_WEIGHT);

    const modeData = craneData?.outrigger?.modes?.[state.currentOutriggerMode];
    const footprintArea = modeData?.footprintArea ?? DEFAULT_FOOTPRINT_AREA;

    const totalLoad = (craneWeight + (state.actualLoad ?? 0)) * KN_PER_TON;
    const pressure = totalLoad / footprintArea;
    const status = getPressureStatus(pressure);
    const labels = { ok: 'OK ✅', warn: '注意 ⚠️', danger: '危険 🚨' };

    if (valueEl)  valueEl.innerHTML  = `${pressure.toFixed(1)}<span class="big-stat-unit">kN/m²</span>`;
    if (statusEl) statusEl.innerHTML = `<span class="pill ${status}">${labels[status]}</span>`;
}
