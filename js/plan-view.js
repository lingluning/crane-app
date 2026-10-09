// 二次元平面図（俯瞰）
// 3D 画面のスクリーンショットではなく、配置データ（state.placedObjects）から直接 SVG を描く。
// 地形は一切描かず、重機・吊荷・安全設備だけを残す。SVG なので拡大・印刷しても線がにじまない。
//
// 座標：画面右 = ワールド +X、画面下 = ワールド +Z（アプリの「座標: X, Z」表示と同じ軸）。
// 現場の方位情報はアプリに無いので、北矢印は描かず軸方向だけを示す。

import * as THREE from 'three';
import { state } from './state.js';
import { getCrane } from './crane-database.js';
import { getCraneCenter, showToast } from './tools.js';
import { outriggerPositions, plateUnder } from './ground-pressure.js';
import { computeSwingSectors } from './safety-tools.js';
import { safeSetItem } from './persistence.js';
import { getEquipment } from './equipment-catalog.js';
import { PLAN_STORAGE_KEY } from './export.js';

// ---------- 用紙（A3 横、1 px = 420mm / 1188） ----------
const PAGE_W = 1188, PAGE_H = 840;
const PX_PER_MM = PAGE_W / 420;
const DRAW = { x: 40, y: 56, w: 1108, h: 584 };          // 図面エリア
const NICE_SCALES = [20, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 750,
    1000, 1250, 1500, 2000, 2500, 3000, 5000];
const FONT = `'Hiragino Sans','Yu Gothic','Noto Sans JP','Meiryo',sans-serif`;

const C = {
    ink: '#1f2328', dim: '#5f6770', faint: '#9aa0a8', line: '#d0d0c9',
    crane: '#f59e0b', craneInk: '#92400e',
    radius: '#2563eb', swing: '#f97316',
    pick: '#16a34a', drop: '#dc2626',
    forbidden: '#dc2626', path: '#16a34a',
    plate: '#e7c14b', plateInk: '#a07c10',
    measure: '#7c3aed', ok: '#16a34a', bad: '#dc2626',
    equip: '#94a3b8', equipHeavy: '#f2b705', equipInk: '#334155', hazard: '#d97706'
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const f1 = v => Number(v).toFixed(1);

// three.js の rotation.y と同じ向きで、ローカル (lx, lz) をワールドへ
function localToWorld(cx, cz, theta, lx, lz) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
}

// クレーン本体の長手方向がモデルのローカル X か Z か（モデル差し替えに追従するため毎回測る）
function craneLongAxisIsX(crane) {
    const saved = crane.rotation.y;
    crane.rotation.y = 0;
    crane.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(crane).getSize(new THREE.Vector3());
    crane.rotation.y = saved;
    crane.updateMatrixWorld(true);
    return size.x >= size.z;
}

function loadSettings() {
    try { return JSON.parse(localStorage.getItem('crane_app_settings') || '{}'); }
    catch { return {}; }
}

// 安全パネルに今表示されている判定をそのまま転記する（判定ロジックを二重に持たない）
function readSafetyPanel() {
    const t = id => (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim();
    const rows = [
        ['作業半径', t('safety-radius')],
        ['吊荷位置', t('safety-load')],
        ['旋回経路', t('safety-swing')],
        ['通路重複', t('safety-path')],
        ['接地圧',   `${t('ground-pressure-value')} ${t('ground-pressure-status')}`.trim()],
        ['使用率',   t('usage-display')],
    ];
    return rows.map(([k, v]) => {
        const bad = /危険|🚨|重複|侵入|範囲外|作業半径外|横断|⚠/.test(v);
        return { k, v: v || '-', bad };
    });
}

// ---------- 図面の収集 ----------
function collect() {
    const objs = state.placedObjects;
    const of = type => objs.filter(o => o.userData.type === type);
    const crane = of('crane')[0] || null;
    const craneData = crane ? getCrane(crane.userData.craneId || state.currentCraneId) : null;
    return {
        crane, craneData,
        center: crane ? getCraneCenter(crane) : null,
        radius: crane ? (crane.userData.workRadius || 10) : 0,
        outriggers: crane ? outriggerPositions(crane, craneData) : [],
        sectors: computeSwingSectors(crane),
        picks: of('loadPick'), drops: of('loadDrop'),
        zones: of('forbidden').filter(z => Array.isArray(z.userData.points) && z.userData.points.length >= 3),
        paths: of('path').filter(p => Array.isArray(p.userData.points) && p.userData.points.length >= 2),
        plates: of('plate'),
        measures: of('measure').filter(m => m.userData.from && m.userData.to),
        equipment: of('equipment').map(o => ({ o, def: getEquipment(o.userData.equipmentId) })).filter(e => e.def),
    };
}

// 重機の占有矩形（模型の長手 = ローカル X）
function equipmentCorners({ o, def }) {
    const { length: L, width: Wd, offsetX = 0 } = def.footprint;
    return [[-L / 2, -Wd / 2], [L / 2, -Wd / 2], [L / 2, Wd / 2], [-L / 2, Wd / 2]]
        .map(([lx, lz]) => localToWorld(o.position.x, o.position.z, o.rotation.y, lx + offsetX, lz));
}

function plateCorners(p) {
    const { x: sx, z: sz } = p.userData.size || { x: 1.5, z: 3 };
    return [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [-sx / 2, sz / 2]]
        .map(([lx, lz]) => localToWorld(p.position.x, p.position.z, p.rotation.y, lx, lz));
}

function bounds(d) {
    const pts = [];
    const add = (x, z) => pts.push([x, z]);
    if (d.center) {
        add(d.center.x - d.radius, d.center.z - d.radius);
        add(d.center.x + d.radius, d.center.z + d.radius);
        d.outriggers.forEach(p => add(p.x, p.z));
    }
    // 旋回扇環は実際の弧の範囲だけを含める（円全体の外接箱にすると図が不必要に小さくなる）
    d.sectors.forEach(sec => {
        for (let i = 0; i <= 24; i++) {
            const a = sec.start + sec.delta * i / 24;
            add(sec.c.x + sec.rMax * Math.cos(a), sec.c.z + sec.rMax * Math.sin(a));
        }
    });
    [...d.picks, ...d.drops].forEach(o => add(o.position.x, o.position.z));
    d.zones.forEach(z => z.userData.points.forEach(p => add(p.x, p.z)));
    d.paths.forEach(p => p.userData.points.forEach(q => add(q.x, q.z)));
    d.plates.forEach(p => plateCorners(p).forEach(q => add(q.x, q.z)));
    d.measures.forEach(m => { add(m.userData.from.x, m.userData.from.z); add(m.userData.to.x, m.userData.to.z); });
    d.equipment.forEach(e => {
        equipmentCorners(e).forEach(q => add(q.x, q.z));
        if (e.def.hazard) {
            const r = e.def.hazard.radius;
            add(e.o.position.x - r, e.o.position.z - r); add(e.o.position.x + r, e.o.position.z + r);
        }
    });
    if (pts.length === 0) return null;
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const pad = 2;   // m
    return {
        minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad,
        minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad
    };
}

// ---------- SVG 生成 ----------
export function buildPlanSVG() {
    const d = collect();
    const b = bounds(d);
    const out = [];
    const push = s => out.push(s);

    // 縮尺：A3 に 100% で印刷したとき実寸どおりになる切りの良い値を選ぶ
    let N = 200, s = PX_PER_MM * 1000 / N, ox = DRAW.x, oz = DRAW.y;
    if (b) {
        const w = b.maxX - b.minX, h = b.maxZ - b.minZ;
        const sFit = Math.min(DRAW.w / w, DRAW.h / h);
        N = NICE_SCALES.find(n => PX_PER_MM * 1000 / n <= sFit) || NICE_SCALES[NICE_SCALES.length - 1];
        s = PX_PER_MM * 1000 / N;
        ox = DRAW.x + (DRAW.w - w * s) / 2 - b.minX * s;
        oz = DRAW.y + (DRAW.h - h * s) / 2 - b.minZ * s;
    }
    const X = x => +(ox + x * s).toFixed(2);
    const Y = z => +(oz + z * s).toFixed(2);
    const M = m => +(m * s).toFixed(2);                       // 長さ（m → px）
    const poly = pts => pts.map(p => `${X(p.x)},${Y(p.z)}`).join(' ');
    const label = (x, y, text, opts = {}) => {
        const { size = 11, color = C.ink, anchor = 'middle', weight = 500 } = opts;
        return `<text x="${+x.toFixed(1)}" y="${+y.toFixed(1)}" font-size="${size}" fill="${color}" ` +
            `font-weight="${weight}" text-anchor="${anchor}" stroke="#fff" stroke-width="3" ` +
            `paint-order="stroke" stroke-linejoin="round">${esc(text)}</text>`;
    };

    push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}" font-family="${esc(FONT)}">`);
    push(`<defs>
  <pattern id="pv-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="7" stroke="${C.forbidden}" stroke-width="1.3" stroke-opacity="0.55"/>
  </pattern>
  <marker id="pv-arrow-swing" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="${C.swing}"/>
  </marker>
  <marker id="pv-arrow-path" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
    <path d="M0,0 L10,5 L0,10 z" fill="${C.path}"/>
  </marker>
  <clipPath id="pv-clip"><rect x="${DRAW.x}" y="${DRAW.y}" width="${DRAW.w}" height="${DRAW.h}"/></clipPath>
</defs>`);
    push(`<rect width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/>`);
    push(`<rect x="20" y="20" width="${PAGE_W - 40}" height="${PAGE_H - 40}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`);
    push(label(40, 44, '平面図（俯瞰）  PLAN', { size: 15, weight: 700, anchor: 'start' }));
    push(label(PAGE_W - 40, 44, `縮尺 1:${N}（A3 印刷時）`, { size: 12, color: C.dim, anchor: 'end' }));
    push(`<line x1="${DRAW.x}" y1="${DRAW.y - 4}" x2="${DRAW.x + DRAW.w}" y2="${DRAW.y - 4}" stroke="${C.line}"/>`);

    if (!b) {
        push(label(PAGE_W / 2, DRAW.y + DRAW.h / 2, '配置されたオブジェクトがありません', { size: 16, color: C.faint }));
    }

    push(`<g clip-path="url(#pv-clip)">`);

    // 敷鉄板（最下層）
    push(`<g data-layer="plate">`);
    d.plates.forEach(p => push(
        `<polygon data-kind="plate" points="${poly(plateCorners(p))}" fill="${C.plate}" fill-opacity="0.55" stroke="${C.plateInk}" stroke-width="1"/>`));
    push(`</g>`);

    // 立入禁止区
    push(`<g data-layer="forbidden">`);
    d.zones.forEach(z => {
        const pts = z.userData.points;
        push(`<polygon data-kind="forbidden" points="${poly(pts)}" fill="url(#pv-hatch)" stroke="${C.forbidden}" stroke-width="1.8"/>`);
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        const cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
        push(label(X(cx), Y(cz) + 4, '立入禁止', { size: 12, color: C.forbidden, weight: 700 }));
    });
    push(`</g>`);

    // 通路（幅 1m の帯 + 中心線 + 進行方向）
    push(`<g data-layer="path">`);
    d.paths.forEach(p => {
        const pts = p.userData.points;
        push(`<polyline data-kind="path" points="${poly(pts)}" fill="none" stroke="${C.path}" stroke-opacity="0.22" stroke-width="${Math.max(4, M(1))}" stroke-linejoin="round" stroke-linecap="round"/>`);
        push(`<polyline points="${poly(pts)}" fill="none" stroke="${C.path}" stroke-width="1.2" stroke-dasharray="6 4" marker-end="url(#pv-arrow-path)"/>`);
        const a = pts[0], bb = pts[1];
        const len = p.userData.length;
        push(label((X(a.x) + X(bb.x)) / 2, (Y(a.z) + Y(bb.z)) / 2 - 8,
            len ? `通路 ${f1(len)}m` : '通路', { size: 11, color: C.path, weight: 700 }));
    });
    push(`</g>`);

    // 作業半径・旋回範囲
    if (d.center) {
        push(`<g data-layer="radius">`);
        push(`<circle data-kind="work-radius" cx="${X(d.center.x)}" cy="${Y(d.center.z)}" r="${M(d.radius)}" fill="${C.radius}" fill-opacity="0.04" stroke="${C.radius}" stroke-width="1.3" stroke-dasharray="8 5"/>`);
        push(label(X(d.center.x), Y(d.center.z) - M(d.radius) - 6, `作業半径 R=${f1(d.radius)}m`, { size: 11, color: C.radius, weight: 700 }));
        push(`</g>`);
    }

    push(`<g data-layer="swing">`);
    d.sectors.forEach(sec => {
        const pt = (r, a) => `${X(sec.c.x + r * Math.cos(a))},${Y(sec.c.z + r * Math.sin(a))}`;
        const a0 = sec.start, a1 = sec.start + sec.delta;
        const sweep = sec.delta >= 0 ? 1 : 0;
        const ring = sec.rMin > 0
            ? `M${pt(sec.rMax, a0)} A${M(sec.rMax)},${M(sec.rMax)} 0 0 ${sweep} ${pt(sec.rMax, a1)} ` +
              `L${pt(sec.rMin, a1)} A${M(sec.rMin)},${M(sec.rMin)} 0 0 ${1 - sweep} ${pt(sec.rMin, a0)} Z`
            : `M${X(sec.c.x)},${Y(sec.c.z)} L${pt(sec.rMax, a0)} A${M(sec.rMax)},${M(sec.rMax)} 0 0 ${sweep} ${pt(sec.rMax, a1)} Z`;
        push(`<path data-kind="swing" d="${ring}" fill="${C.swing}" fill-opacity="0.13" stroke="${C.swing}" stroke-width="1" stroke-opacity="0.7"/>`);
        // 起吊 → 卸荷の旋回方向
        const rMid = (sec.rPick + sec.rDrop) / 2;
        const inset = Math.min(0.12, Math.abs(sec.delta) * 0.15) * Math.sign(sec.delta || 1);
        push(`<path d="M${pt(rMid, a0 + inset)} A${M(rMid)},${M(rMid)} 0 0 ${sweep} ${pt(rMid, a1 - inset)}" fill="none" stroke="${C.swing}" stroke-width="1.8" marker-end="url(#pv-arrow-swing)"/>`);
    });
    push(`</g>`);

    // 測距
    push(`<g data-layer="measure">`);
    d.measures.forEach(m => {
        const { from: a, to: bb } = m.userData;
        const dist = m.userData.distance ?? Math.hypot(bb.x - a.x, bb.z - a.z);
        push(`<line data-kind="measure" x1="${X(a.x)}" y1="${Y(a.z)}" x2="${X(bb.x)}" y2="${Y(bb.z)}" stroke="${C.measure}" stroke-width="1.2"/>`);
        [a, bb].forEach(p => push(`<circle cx="${X(p.x)}" cy="${Y(p.z)}" r="2.5" fill="${C.measure}"/>`));
        push(label((X(a.x) + X(bb.x)) / 2, (Y(a.z) + Y(bb.z)) / 2 - 6, `${dist.toFixed(2)}m`, { size: 11, color: C.measure, weight: 700 }));
    });
    push(`</g>`);

    // 重機・車両（範囲リング → 車体 → 名称）
    push(`<g data-layer="equipment">`);
    d.equipment.forEach(e => {
        const { o, def } = e;
        if (def.hazard) {
            push(`<circle data-kind="equipment-hazard" cx="${X(o.position.x)}" cy="${Y(o.position.z)}" r="${M(def.hazard.radius)}" fill="${C.hazard}" fill-opacity="0.05" stroke="${C.hazard}" stroke-width="1.1" stroke-dasharray="2 4"/>`);
        }
    });
    d.equipment.forEach(e => {
        const { o, def } = e;
        const heavy = !def.vehicle;
        push(`<polygon data-kind="equipment" data-equipment-id="${esc(o.userData.equipmentId)}" points="${poly(equipmentCorners(e))}" fill="${heavy ? C.equipHeavy : C.equip}" fill-opacity="0.8" stroke="${C.equipInk}" stroke-width="1.2"/>`);
        // 向き（前方）を示す線：ブーム・アーム・リーダ方向
        const reach = def.armLength || def.footprint.length / 2;
        const tip = localToWorld(o.position.x, o.position.z, o.rotation.y, reach, 0);
        push(`<line x1="${X(o.position.x)}" y1="${Y(o.position.z)}" x2="${X(tip.x)}" y2="${Y(tip.z)}" stroke="${C.equipInk}" stroke-width="${def.armLength ? 2.2 : 1}"/>`);
        push(`<circle cx="${X(tip.x)}" cy="${Y(tip.z)}" r="2" fill="${C.equipInk}"/>`);
    });
    d.equipment.forEach(e => {
        const { o, def } = e;
        const y = Math.max(...equipmentCorners(e).map(q => Y(q.z)));
        push(label(X(o.position.x), y + 13, def.short, { size: 10.5, color: C.equipInk, weight: 700 }));
        if (def.hazard) {
            push(label(X(o.position.x), Y(o.position.z) - M(def.hazard.radius) - 4,
                `${def.hazard.label} R=${f1(def.hazard.radius)}m`, { size: 10, color: C.hazard, weight: 700 }));
        }
    });
    push(`</g>`);

    // 旋回中心 → 吊荷の作業半径
    if (d.center) {
        push(`<g data-layer="reach">`);
        [...d.picks, ...d.drops].forEach(o => push(
            `<line x1="${X(d.center.x)}" y1="${Y(d.center.z)}" x2="${X(o.position.x)}" y2="${Y(o.position.z)}" stroke="${C.dim}" stroke-width="0.8" stroke-dasharray="3 3"/>`));
        push(`</g>`);
    }

    // クレーン（アウトリガ → 車体 → 旋回中心）
    if (d.crane) {
        const cr = d.crane, cx = d.center.x, cz = d.center.z, th = cr.rotation.y;
        const dims = d.craneData?.dimensions || { length: 10, width: 2.5 };
        const along = craneLongAxisIsX(cr);
        const hl = dims.length / 2, hw = dims.width / 2;
        const body = (along
            ? [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]]
            : [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]
        ).map(([lx, lz]) => localToWorld(cx, cz, th, lx, lz));

        push(`<g data-layer="crane">`);
        d.outriggers.forEach(p => push(
            `<line x1="${X(cx)}" y1="${Y(cz)}" x2="${X(p.x)}" y2="${Y(p.z)}" stroke="${C.craneInk}" stroke-width="2"/>`));
        push(`<polygon data-kind="crane-body" points="${poly(body)}" fill="${C.crane}" fill-opacity="0.85" stroke="${C.craneInk}" stroke-width="1.5"/>`);
        const pad = Math.max(7, M(0.5));
        d.outriggers.forEach(p => {
            const onPlate = !!plateUnder(p.x, p.z);
            push(`<rect data-kind="outrigger" data-on-plate="${onPlate}" x="${X(p.x) - pad / 2}" y="${Y(p.z) - pad / 2}" width="${pad}" height="${pad}" ` +
                `fill="${onPlate ? '#fff' : C.bad}" stroke="${onPlate ? C.ok : C.bad}" stroke-width="2"/>`);
        });
        const cxp = X(cx), czp = Y(cz);
        push(`<circle cx="${cxp}" cy="${czp}" r="5" fill="#fff" stroke="${C.ink}" stroke-width="1.5"/>`);
        push(`<path d="M${cxp - 9},${czp} H${cxp + 9} M${cxp},${czp - 9} V${czp + 9}" stroke="${C.ink}" stroke-width="1.2"/>`);
        push(`</g>`);
    }

    // 吊荷（最上層）
    push(`<g data-layer="load">`);
    const loadBox = Math.max(10, M(1));
    [['pick', d.picks, C.pick, '起吊'], ['drop', d.drops, C.drop, '卸荷']].forEach(([kind, list, color, jp]) => {
        list.forEach((o, i) => {
            const px = X(o.position.x), py = Y(o.position.z);
            push(`<rect data-kind="load-${kind}" x="${px - loadBox / 2}" y="${py - loadBox / 2}" width="${loadBox}" height="${loadBox}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`);
            const r = d.center ? Math.hypot(o.position.x - d.center.x, o.position.z - d.center.z) : null;
            push(label(px + loadBox / 2 + 5, py + 4, `${jp}#${i + 1}${r !== null ? `  R=${f1(r)}m` : ''}`,
                { size: 11, color, weight: 700, anchor: 'start' }));
        });
    });
    push(`</g>`);

    push(`</g>`);   // clip

    // ---------- 下段：凡例 / 安全判定 / 表題欄 ----------
    const top = DRAW.y + DRAW.h + 14;
    push(`<line x1="20" y1="${top - 6}" x2="${PAGE_W - 20}" y2="${top - 6}" stroke="${C.ink}" stroke-width="1"/>`);

    // スケールバー + 軸方向
    const barM = [1, 2, 5, 10, 20, 50, 100].find(m => m * s >= 80) || 100;
    const bx = 40, by = top + 14;
    push(`<g data-layer="scale">`);
    push(`<rect x="${bx}" y="${by}" width="${barM * s / 2}" height="5" fill="${C.ink}"/>`);
    push(`<rect x="${bx + barM * s / 2}" y="${by}" width="${barM * s / 2}" height="5" fill="#fff" stroke="${C.ink}"/>`);
    push(label(bx, by + 18, '0', { size: 10, color: C.dim, anchor: 'start' }));
    push(label(bx + barM * s, by + 18, `${barM}m`, { size: 10, color: C.dim }));
    const ax = bx + barM * s + 40;
    push(`<path d="M${ax},${by + 3} h28 M${ax + 22},${by - 1} l6,4 l-6,4" stroke="${C.dim}" fill="none" stroke-width="1.2"/>`);
    push(label(ax + 33, by + 7, 'X', { size: 10, color: C.dim, anchor: 'start' }));
    push(`<path d="M${ax},${by + 3} v24 M${ax - 4},${by + 21} l4,6 l4,-6" stroke="${C.dim}" fill="none" stroke-width="1.2"/>`);
    push(label(ax + 6, by + 30, 'Z', { size: 10, color: C.dim, anchor: 'start' }));
    push(`</g>`);

    // 凡例
    const legend = [
        [`<rect width="14" height="9" fill="${C.crane}" stroke="${C.craneInk}"/>`, 'クレーン（車体は概略寸法）'],
        [`<rect x="2" width="9" height="9" fill="#fff" stroke="${C.ok}" stroke-width="2"/>`, 'アウトリガ（敷鉄板上）'],
        [`<rect x="2" width="9" height="9" fill="${C.bad}" stroke="${C.bad}" stroke-width="2"/>`, 'アウトリガ（敷鉄板なし）'],
        [`<line x1="0" y1="5" x2="14" y2="5" stroke="${C.radius}" stroke-width="1.5" stroke-dasharray="4 2"/>`, '作業半径'],
        [`<rect width="14" height="9" fill="${C.swing}" fill-opacity="0.25" stroke="${C.swing}"/>`, '吊荷旋回範囲'],
        [`<rect x="2" width="9" height="9" fill="${C.pick}"/>`, '起吊位置'],
        [`<rect x="2" width="9" height="9" fill="${C.drop}"/>`, '卸荷位置'],
        [`<rect width="14" height="9" fill="url(#pv-hatch)" stroke="${C.forbidden}"/>`, '立入禁止区'],
        [`<rect width="14" height="9" fill="${C.path}" fill-opacity="0.25"/>`, '通路（幅 1m）'],
        [`<rect width="14" height="9" fill="${C.plate}" fill-opacity="0.55" stroke="${C.plateInk}"/>`, '敷鉄板'],
        [`<rect width="14" height="9" fill="${C.equipHeavy}" fill-opacity="0.8" stroke="${C.equipInk}"/>`, '重機（車両は灰色）'],
        [`<line x1="0" y1="5" x2="14" y2="5" stroke="${C.hazard}" stroke-width="1.5" stroke-dasharray="2 2"/>`, '重機の作業・転倒範囲'],
    ];
    const lx0 = 40, ly0 = top + 58;
    push(`<g data-layer="legend">`);
    legend.forEach(([sym, txt], i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = lx0 + col * 168, y = ly0 + row * 16;
        push(`<g transform="translate(${x},${y - 8})">${sym}</g>`);
        push(`<text x="${x + 20}" y="${y}" font-size="10" fill="${C.ink}">${esc(txt)}</text>`);
    });
    push(`</g>`);

    // 安全判定
    const sx0 = 400, sy0 = top + 12;
    push(`<g data-layer="safety">`);
    push(`<text x="${sx0}" y="${sy0 + 4}" font-size="11" font-weight="700" fill="${C.ink}">安全判定</text>`);
    readSafetyPanel().forEach((r, i) => {
        const y = sy0 + 22 + i * 17;
        push(`<text x="${sx0}" y="${y}" font-size="10.5" fill="${C.dim}">${esc(r.k)}</text>`);
        push(`<text x="${sx0 + 62}" y="${y}" font-size="10.5" font-weight="600" fill="${r.bad ? C.bad : C.ink}">${esc(r.v.length > 40 ? r.v.slice(0, 39) + '…' : r.v)}</text>`);
    });
    push(`</g>`);

    // 表題欄
    const settings = loadSettings();
    const mode = d.craneData?.outrigger?.modes?.[state.currentOutriggerMode];
    const title = [
        ['現場名', settings.location?.siteName || '—'],
        ['機種', d.craneData?.displayName || '—'],
        ['ブーム長', d.crane ? `${state.currentBoomLength} m` : '—'],
        ['アウトリガ', mode?.label || '—'],
        ['実吊重', d.crane ? `${state.actualLoad} t` : '—'],
        ['作成日', new Date().toLocaleDateString('ja-JP')],
    ];
    const tx = 780, ty = top + 2, tw = PAGE_W - 40 - tx, rowH = 20;
    push(`<g data-layer="title">`);
    push(`<rect x="${tx}" y="${ty}" width="${tw}" height="${rowH * title.length}" fill="none" stroke="${C.ink}"/>`);
    title.forEach(([k, v], i) => {
        const y = ty + i * rowH;
        if (i) push(`<line x1="${tx}" y1="${y}" x2="${tx + tw}" y2="${y}" stroke="${C.line}"/>`);
        push(`<text x="${tx + 8}" y="${y + 14}" font-size="10" fill="${C.dim}">${esc(k)}</text>`);
        push(`<text x="${tx + 82}" y="${y + 14}" font-size="11" font-weight="600" fill="${C.ink}">${esc(v)}</text>`);
    });
    push(`<line x1="${tx + 74}" y1="${ty}" x2="${tx + 74}" y2="${ty + rowH * title.length}" stroke="${C.line}"/>`);
    push(`</g>`);

    push(label(PAGE_W - 40, PAGE_H - 28, '※ 参考図。寸法・能力は機種の仕様書および現地確認に従うこと。', { size: 9, color: C.faint, anchor: 'end', weight: 400 }));
    push(`</svg>`);
    return out.join('\n');
}

// ---------- 出力 ----------
function svgToPngDataURL(svg, scale = 2) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = PAGE_W * scale;
            canvas.height = PAGE_H * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('SVG の描画に失敗しました'));
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
}

function download(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

let currentSVG = '';

export function openPlanView() {
    currentSVG = buildPlanSVG();
    document.getElementById('plan-view-canvas').innerHTML = currentSVG;
    document.getElementById('plan-view-modal').classList.remove('hidden');
}

export function closePlanView() {
    document.getElementById('plan-view-modal').classList.add('hidden');
}

export function downloadPlanSVG() {
    const url = URL.createObjectURL(new Blob([currentSVG], { type: 'image/svg+xml' }));
    download(url, `crane-plan-view-${stamp()}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPlanPNG() {
    try {
        download(await svgToPngDataURL(currentSVG, 2), `crane-plan-view-${stamp()}.png`);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// 計画書（crane-plan-a3.html）の「平面図 PLAN」枠に貼り込む
export async function insertPlanIntoReport() {
    let png;
    try {
        png = await svgToPngDataURL(currentSVG, 1.5);
    } catch (e) {
        showToast(e.message, 'error');
        return;
    }
    let plan;
    try { plan = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || 'null'); } catch { plan = null; }
    plan = plan && typeof plan === 'object' ? plan : {};
    plan.fields = plan.fields || {};
    plan.checkboxes = plan.checkboxes || {};
    plan.images = { ...(plan.images || {}), plan: png };
    if (!safeSetItem(PLAN_STORAGE_KEY, JSON.stringify(plan))) return;
    window.dispatchEvent(new CustomEvent('crane-plan-state-imported'));
    showToast('計画書の平面図に挿入しました', 'success');
}
