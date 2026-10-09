// 建造メニュー（右パネル）に並ぶ「ユニット」の定義。
//
// 2 種類ある：
//   kind: 'tool'      … 既存のツール（クレーン・吊荷・敷鉄板・禁止区・通路）をそのまま呼ぶ
//   kind: 'equipment' … 新しい重機・車両。userData.type = 'equipment', equipmentId で保存される
//
// 寸法・重量・範囲はいずれも同クラスの一般的な値（参考値）。実機の仕様書で置き換えること。
// 座標系：模型の長手方向がローカル +X（前方）、幅が Z、原点は接地面の中心。

// ---------- 重機・車両 ----------
export const EQUIPMENT = {
    ex07: {
        name: 'バックホウ 0.7㎥', short: 'バックホウ', spec: '0.7㎥',
        weight: 20, footprint: { length: 4.5, width: 2.8 },
        hazard: { radius: 9.9, label: '作業範囲' }, armLength: 6.3,
        model: 'excavator', scale: { x: 1, y: 1, z: 1 },
    },
    ex025: {
        name: 'バックホウ 0.25㎥', short: 'ミニバックホウ', spec: '0.25㎥',
        weight: 7, footprint: { length: 2.9, width: 2.24 },
        hazard: { radius: 6.2, label: '作業範囲' }, armLength: 4.1,
        model: 'excavator', scale: { x: 0.65, y: 0.65, z: 0.8 },
    },
    pile: {
        name: '杭打機（三点式）', short: '杭打機', spec: 'リーダ18m',
        weight: 65, footprint: { length: 6.0, width: 4.0 },
        hazard: { radius: 18, label: '転倒範囲' }, armLength: 2.6,
        model: 'pileDriver',
    },
    dozer: {
        name: 'ブルドーザー 15t', short: 'ブルドーザー', spec: '15t',
        weight: 15, footprint: { length: 5.0, width: 3.2, offsetX: 0.35 },
        model: 'dozer',
    },
    dump: {
        vehicle: true,   // トラック系（平面図で灰色）
        name: 'ダンプトラック 10t', short: 'ダンプ', spec: '10t',
        weight: 20, footprint: { length: 7.6, width: 2.5 },
        model: 'dump',
    },
    lowboy: {
        vehicle: true,   // トラック系（平面図で灰色）
        name: '低床トレーラー', short: 'トレーラー', spec: '全長16.5m',
        weight: 25, footprint: { length: 16.5, width: 2.5 },
        model: 'lowboy',
    },
    mixer: {
        vehicle: true,   // トラック系（平面図で灰色）
        name: '生コン車（大型）', short: '生コン車', spec: '大型',
        weight: 20, footprint: { length: 7.9, width: 2.5 },
        model: 'mixer',
    },
    pump: {
        vehicle: true,   // トラック系（平面図で灰色）
        name: 'コンクリートポンプ車 32m', short: 'ポンプ車', spec: '32m',
        weight: 20, footprint: { length: 10.5, width: 2.5 },
        hazard: { radius: 28, label: 'ブーム到達範囲' },
        model: 'pump',
    },
    aerial: {
        vehicle: true,   // トラック系（平面図で灰色）
        name: '高所作業車 12m', short: '高所作業車', spec: '12m',
        weight: 8, footprint: { length: 7.0, width: 2.2 },
        hazard: { radius: 10, label: '作業範囲' }, armLength: 4.0,
        model: 'aerial',
    },
};

export function getEquipment(id) {
    return EQUIPMENT[id] || null;
}

// ---------- カメオ（ユニットのアイコン、側面図） ----------
const Y = '#f2b705', K = '#0b0d10', G = '#8fc3e6', W = '#e9edf0', S = '#5b6470';

const wheel = (x, y = 36, r = 4) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#111" stroke="#9aa4ad" stroke-width="1.2"/>` +
    `<circle cx="${x}" cy="${y}" r="${(r * 0.35).toFixed(2)}" fill="#9aa4ad"/>`;

const track = (x, w, y = 33, h = 7) => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#1b1f23" stroke="#6b7480" stroke-width="1.2"/>`;
    for (let cx = x + h / 2; cx <= x + w - h / 2 + 0.01; cx += (w - h) / 4) {
        s += `<circle cx="${cx.toFixed(1)}" cy="${y + h / 2}" r="1.6" fill="#6b7480"/>`;
    }
    return s;
};

const cab = (x, y, w, h, color = Y) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${color}" stroke="${K}" stroke-width="0.8"/>` +
    `<rect x="${x + w * 0.35}" y="${y + 2}" width="${w * 0.55}" height="${h * 0.45}" fill="${G}"/>`;

const truckBase = (cabColor = W) =>
    `<rect x="4" y="30" width="54" height="3" fill="#2a2f35"/>` + cab(43, 15, 15, 16, cabColor) +
    wheel(12) + wheel(21) + wheel(50);

const excavatorIcon =
    track(6, 30) +
    `<rect x="5" y="23" width="7" height="9" fill="${S}" stroke="${K}" stroke-width="0.8"/>` +
    `<rect x="9" y="22" width="24" height="11" fill="${Y}" stroke="${K}" stroke-width="0.8"/>` +
    cab(21, 12, 11, 11) +
    `<polyline points="30,24 44,8 54,26" fill="none" stroke="${Y}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<polyline points="30,24 44,8 54,26" fill="none" stroke="${K}" stroke-width="0.6" stroke-linejoin="round" opacity="0.6"/>` +
    `<path d="M50,26 L58,26 L56,34 L49,31 Z" fill="#3a3f45" stroke="${K}" stroke-width="0.8"/>`;

const ICONS = {
    crane:
        `<line x1="16" y1="24" x2="60" y2="4" stroke="${Y}" stroke-width="4.5" stroke-linecap="round"/>` +
        `<line x1="60" y1="4" x2="60" y2="20" stroke="#7b8590" stroke-width="1"/>` +
        `<path d="M58,20 h4 l-2,4 z" fill="#7b8590"/>` +
        `<rect x="5" y="24" width="46" height="9" rx="1" fill="${Y}" stroke="${K}" stroke-width="0.8"/>` +
        cab(38, 15, 9, 10, W) + wheel(14, 35, 5.5) + wheel(42, 35, 5.5),
    aerial:
        truckBase() +
        `<rect x="8" y="24" width="30" height="6" fill="${W}" stroke="${K}" stroke-width="0.6"/>` +
        `<line x1="14" y1="24" x2="38" y2="7" stroke="#9aa4ad" stroke-width="3" stroke-linecap="round"/>` +
        `<rect x="34" y="1" width="11" height="7" fill="#f97316" stroke="${K}" stroke-width="0.8"/>`,
    loadPick:
        `<line x1="32" y1="21" x2="32" y2="5" stroke="#7b8590" stroke-width="1.5"/>` +
        `<path d="M26,11 L32,4 L38,11" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<rect x="21" y="21" width="22" height="15" fill="#16a34a" stroke="${K}" stroke-width="0.8"/>` +
        `<line x1="10" y1="38" x2="54" y2="38" stroke="#6b7480" stroke-width="1"/>`,
    loadDrop:
        `<line x1="32" y1="4" x2="32" y2="20" stroke="#7b8590" stroke-width="1.5"/>` +
        `<path d="M26,12 L32,19 L38,12" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linejoin="round"/>` +
        `<rect x="21" y="22" width="22" height="15" fill="#dc2626" stroke="${K}" stroke-width="0.8"/>` +
        `<line x1="10" y1="38" x2="54" y2="38" stroke="#6b7480" stroke-width="1"/>`,
    ex07: excavatorIcon,
    ex025: `<g transform="translate(9,9.5) scale(0.78)">${excavatorIcon}</g>`,
    pile:
        track(4, 40) +
        `<rect x="6" y="22" width="28" height="11" fill="${Y}" stroke="${K}" stroke-width="0.8"/>` +
        cab(20, 13, 11, 10) +
        `<line x1="12" y1="22" x2="45" y2="7" stroke="#9aa4ad" stroke-width="1.6"/>` +
        `<rect x="44" y="1" width="5" height="37" fill="#d33f1f" stroke="${K}" stroke-width="0.8"/>` +
        `<rect x="42" y="13" width="9" height="9" fill="#3a3f45" stroke="${K}" stroke-width="0.8"/>`,
    dozer:
        track(10, 32) +
        `<rect x="12" y="21" width="26" height="12" fill="${Y}" stroke="${K}" stroke-width="0.8"/>` +
        cab(12, 10, 13, 12) +
        `<line x1="36" y1="30" x2="47" y2="32" stroke="#3a3f45" stroke-width="2.2"/>` +
        `<path d="M46,15 Q53,27 46,40 L51,40 L51,15 Z" fill="#c79300" stroke="${K}" stroke-width="0.8"/>`,
    dump:
        `<polygon points="4,13 40,13 40,30 6,30" fill="#7a8b99" stroke="${K}" stroke-width="0.8"/>` +
        `<line x1="8" y1="18" x2="38" y2="18" stroke="#5f6e7a" stroke-width="1"/>` +
        truckBase(),
    lowboy:
        `<rect x="2" y="30" width="38" height="3" fill="#3a3f45"/>` +
        `<polygon points="38,26 48,26 48,30 40,33 38,33" fill="#3a3f45"/>` +
        `<rect x="46" y="29" width="16" height="3" fill="#2a2f35"/>` +
        cab(48, 15, 13, 15, '#2f5d9e') +
        wheel(7, 36, 3.5) + wheel(14, 36, 3.5) + wheel(51, 36, 3.5) + wheel(58, 36, 3.5),
    mixer:
        `<g transform="rotate(-12 22 21)"><ellipse cx="22" cy="21" rx="17" ry="8.5" fill="${W}" stroke="${K}" stroke-width="0.8"/>` +
        `<path d="M10,17 Q22,26 34,17" fill="none" stroke="#f97316" stroke-width="2"/></g>` +
        truckBase(),
    pump:
        `<rect x="4" y="23" width="40" height="7" fill="${W}" stroke="${K}" stroke-width="0.6"/>` +
        `<rect x="8" y="17" width="6" height="6" fill="#9aa4ad"/>` +
        `<path d="M11,17 H41 M41,17 L41,13 M41,13 H9 M9,13 L9,9 M9,9 H38" fill="none" stroke="#9aa4ad" stroke-width="2.6" stroke-linejoin="round"/>` +
        truckBase(),
    plate:
        `<polygon points="8,32 44,32 54,24 18,24" fill="#c9a43a" stroke="#7a5f12" stroke-width="0.8"/>` +
        `<polygon points="8,28 44,28 54,20 18,20" fill="#e7c14b" stroke="#a07c10" stroke-width="0.8"/>` +
        `<polygon points="8,32 44,32 44,28 8,28" fill="#a07c10"/>` +
        `<polygon points="44,32 54,24 54,20 44,28" fill="#8a6a10"/>`,
    forbidden:
        `<rect x="12" y="17" width="40" height="5" fill="#fff"/>` +
        `<path d="M12,17 h5 l-5,5 z M22,17 h5 l-5,5 h-5 z M32,17 h5 l-5,5 h-5 z M42,17 h5 l-5,5 h-5 z M52,17 v5 h-5 z" fill="#dc2626"/>` +
        `<polygon points="11,38 15,12 19,38" fill="#f97316" stroke="${K}" stroke-width="0.6"/>` +
        `<polygon points="45,38 49,12 53,38" fill="#f97316" stroke="${K}" stroke-width="0.6"/>` +
        `<rect x="12.5" y="26" width="5" height="3" fill="#fff"/><rect x="46.5" y="26" width="5" height="3" fill="#fff"/>` +
        `<rect x="8" y="37" width="14" height="2.5" fill="#333"/><rect x="42" y="37" width="14" height="2.5" fill="#333"/>`,
    path:
        `<path d="M6,38 C20,32 26,28 34,20 S50,10 58,8" fill="none" stroke="#16a34a" stroke-opacity="0.35" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="M6,38 C20,32 26,28 34,20 S50,10 58,8" fill="none" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="4 3"/>` +
        `<path d="M52,6 L59,8 L54,13" fill="none" stroke="#16a34a" stroke-width="1.8"/>`,
};

export function cameoSVG(iconKey) {
    return `<svg viewBox="0 0 64 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ICONS[iconKey] || ''}</svg>`;
}

// ---------- タブ構成（赤警のサイドバー同様 4 タブ） ----------
export const BUILD_TABS = [
    {
        key: 'lift', label: '揚重', items: [
            { kind: 'tool', tool: 'crane', icon: 'crane', name: 'クレーン', spec: '25t', limit: 1 },
            { kind: 'equipment', id: 'aerial', icon: 'aerial' },
            { kind: 'tool', tool: 'loadPick', icon: 'loadPick', name: '起吊位置' },
            { kind: 'tool', tool: 'loadDrop', icon: 'loadDrop', name: '卸荷位置' },
        ]
    },
    {
        key: 'heavy', label: '重機', items: [
            { kind: 'equipment', id: 'ex07', icon: 'ex07' },
            { kind: 'equipment', id: 'ex025', icon: 'ex025' },
            { kind: 'equipment', id: 'pile', icon: 'pile' },
            { kind: 'equipment', id: 'dozer', icon: 'dozer' },
        ]
    },
    {
        key: 'vehicle', label: '車両', items: [
            { kind: 'equipment', id: 'dump', icon: 'dump' },
            { kind: 'equipment', id: 'lowboy', icon: 'lowboy' },
            { kind: 'equipment', id: 'mixer', icon: 'mixer' },
            { kind: 'equipment', id: 'pump', icon: 'pump' },
        ]
    },
    {
        key: 'temp', label: '仮設', items: [
            { kind: 'tool', tool: 'plate', icon: 'plate', name: '敷鉄板' },
            { kind: 'tool', tool: 'forbidden', icon: 'forbidden', name: '立入禁止区' },
            { kind: 'tool', tool: 'path', icon: 'path', name: '通路' },
        ]
    },
];

// カメオに表示する名前・スペック（equipment は EQUIPMENT から引く）
export function itemLabel(item) {
    if (item.kind === 'equipment') {
        const def = EQUIPMENT[item.id];
        return { name: def.short, spec: def.spec, title: def.name };
    }
    return { name: item.name, spec: item.spec || '', title: item.name };
}
