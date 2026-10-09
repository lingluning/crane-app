// 左パネル「レイヤー」：配置済みオブジェクトの管理。
//   ・レイヤー（種類）ごとの表示 / 非表示（目のアイコン）
//   ・行をクリックすると、そのレイヤーのオブジェクト一覧を展開
//   ・一覧の項目をクリック → 選択してカメラを寄せる / ゴミ箱 → 削除（撤銷可）
// 配置は右の建造メニューとリボンで行うので、ここではツールを切り替えない。
//
// 非表示は three.js のレイヤー機能で実現する（描画・影・レイキャスト・CSS2D ラベルの
// すべてがカメラ／レイキャスタの layer 0 だけを見るため、layer 1 に移すだけで全部消える）。
// 安全チェック・平面図・保存は表示状態に関係なく全オブジェクトを対象にする。

import * as THREE from 'three';
import { camera, controls } from './scene.js';
import { state } from './state.js';
import { getCrane } from './crane-database.js';
import { getEquipment } from './equipment-catalog.js';
import {
    selectTool, setSelection, expandToGroup, removeObjectFully, updateCounters, updateCraneButton,
    getCraneCenter
} from './tools.js';
import { snapshot } from './undo-stack.js';

const HIDDEN_LAYER = 1;
const PREF_KEY = 'crane_layer_panel';

const LAYERS = [
    { type: 'crane',     name: 'クレーン',   icon: 'i-crane',     color: '#fbbf24' },
    { type: 'loadPick',  name: '起吊位置',   icon: 'i-pickup',    color: '#16a34a' },
    { type: 'loadDrop',  name: '卸荷位置',   icon: 'i-drop',      color: '#dc2626' },
    { type: 'equipment', name: '重機・車両', icon: 'i-crane',     color: '#94a3b8' },
    { type: 'plate',     name: '敷鉄板',     icon: 'i-plate',     color: '#e7c14b' },
    { type: 'forbidden', name: '禁止区',     icon: 'i-forbidden', color: '#dc2626' },
    { type: 'path',      name: '通路',       icon: 'i-path',      color: '#16a34a' },
    { type: 'measure',   name: '距離測定',   icon: 'i-ruler',     color: '#7c3aed' },
];

const hidden = new Set();      // 非表示のレイヤー type
const expanded = new Set();    // 展開中のレイヤー type
let listEl, auxEl;

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadPrefs() {
    try {
        const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
        (p.hidden || []).forEach(t => hidden.add(t));
        (p.expanded || []).forEach(t => expanded.add(t));
    } catch { /* 表示設定なので無視 */ }
}
function savePrefs() {
    try {
        localStorage.setItem(PREF_KEY, JSON.stringify({ hidden: [...hidden], expanded: [...expanded] }));
    } catch { /* 表示設定なので無視 */ }
}

// ---------- 表示 / 非表示 ----------
// オブジェクト本体の子孫に加えて、scene 直下にある付属物（半径円・中心マーカー・枠線・矢印・測定ラベル）も切り替える
function attachmentsOf(obj) {
    const u = obj.userData;
    // userData.label は測定では CSS2DObject だが、起吊・卸荷では表示名の文字列なので Object3D だけ拾う
    return [u.radiusCircle, u.centerMarker, u.border, u.label, ...(u.arrows || []), ...(u.balls || [])]
        .filter(x => x && x.isObject3D);
}

function applyVisibility() {
    state.placedObjects.forEach(obj => {
        const layer = hidden.has(obj.userData.type) ? HIDDEN_LAYER : 0;
        [obj, ...attachmentsOf(obj)].forEach(root => root.traverse(n => n.layers.set(layer)));
    });
}

function setHidden(type, isHidden) {
    if (isHidden) hidden.add(type); else hidden.delete(type);
    // 非表示にしたレイヤーの選択は外す（見えないものを動かせないように）
    if (isHidden && state.selectedObjects.some(o => o.userData.type === type)) {
        const keep = state.selectedObjects.filter(o => o.userData.type !== type);
        setSelection(keep, keep[0] || null);
    }
    applyVisibility();
    savePrefs();
    render();
}

// ---------- 一覧の表示内容 ----------
function polygonArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
    return Math.abs(a) / 2;
}

function describe(obj, index, crane) {
    const u = obj.userData;
    const radiusTo = () => {
        if (!crane) return '';
        const c = getCraneCenter(crane);
        return `R ${Math.hypot(obj.position.x - c.x, obj.position.z - c.z).toFixed(1)}m`;
    };
    switch (u.type) {
        case 'crane': {
            const d = getCrane(u.craneId || state.currentCraneId);
            return { name: d ? d.displayName : 'クレーン', meta: `R ${(u.workRadius || 10).toFixed(1)}m` };
        }
        case 'loadPick': return { name: `起吊 #${index}`, meta: radiusTo() };
        case 'loadDrop': return { name: `卸荷 #${index}`, meta: radiusTo() };
        case 'equipment': {
            const d = getEquipment(u.equipmentId);
            return { name: `${d ? d.name : u.equipmentId} #${index}`, meta: d ? `${d.weight}t` : '' };
        }
        case 'plate': return { name: `敷鉄板 #${index}`, meta: u.size ? `${u.size.x}×${u.size.z}` : '' };
        case 'forbidden': return { name: `禁止区 #${index}`, meta: u.points ? `${polygonArea(u.points).toFixed(0)}㎡` : '' };
        case 'path': return { name: `通路 #${index}`, meta: u.length ? `${u.length.toFixed(1)}m` : '' };
        case 'measure': return { name: `測定 #${index}`, meta: u.distance != null ? `${u.distance.toFixed(2)}m` : '' };
        default: return { name: u.type, meta: '' };
    }
}

// ---------- 描画 ----------
function render() {
    if (!listEl) return;
    const crane = state.placedObjects.find(o => o.userData.type === 'crane');
    const selected = new Set(state.selectedObjects);

    listEl.innerHTML = LAYERS.map(layer => {
        const objs = state.placedObjects.filter(o => o.userData.type === layer.type);
        const isHidden = hidden.has(layer.type);
        const isOpen = expanded.has(layer.type) && objs.length > 0;
        const counters = {};

        const items = isOpen ? objs.map(o => {
            const key = o.userData.type === 'equipment' ? o.userData.equipmentId : o.userData.type;
            counters[key] = (counters[key] || 0) + 1;
            const { name, meta } = describe(o, counters[key], crane);
            const idx = state.placedObjects.indexOf(o);
            return `<div class="obj-row${selected.has(o) ? ' selected' : ''}${isHidden ? ' muted' : ''}" data-idx="${idx}" title="クリックで選択・移動">
                <span class="obj-name">${esc(name)}</span>
                <span class="obj-meta">${esc(meta)}</span>
                <button class="obj-del" data-idx="${idx}" title="削除（元に戻せます）"><svg class="ic" width="11" height="11"><use href="#i-trash"/></svg></button>
            </div>`;
        }).join('') : '';

        return `<div class="layer-row${isHidden ? ' is-hidden' : ''}${objs.length === 0 ? ' is-empty' : ''}" data-layer="${layer.type}">
                <span class="layer-caret${isOpen ? ' open' : ''}">${objs.length ? '▸' : ''}</span>
                <svg class="ic" width="13" height="13"><use href="#${layer.icon}"/></svg>
                <div class="layer-swatch" style="background:${layer.color}"></div>
                <span class="layer-name">${esc(layer.name)}</span>
                <span class="layer-count" id="count-${layer.type}">${objs.length}</span>
                <button class="layer-eye" data-eye="${layer.type}" title="${isHidden ? '表示する' : '非表示にする'}">
                    <svg class="ic" width="13" height="13"><use href="#${isHidden ? 'i-eye-off' : 'i-eye'}"/></svg>
                </button>
            </div>${items ? `<div class="obj-list">${items}</div>` : ''}`;
    }).join('');

    const visibleCount = LAYERS.length - hidden.size;
    auxEl.textContent = hidden.size ? `表示 ${visibleCount} / ${LAYERS.length}` : `${state.placedObjects.length} 件`;
    auxEl.classList.toggle('has-hidden', hidden.size > 0);
    auxEl.title = hidden.size ? 'クリックですべて表示' : '';

    // ステータスバーの件数
    LAYERS.forEach(l => {
        const el = document.getElementById(`count-${l.type}-status`);
        if (el) el.textContent = state.placedObjects.filter(o => o.userData.type === l.type).length;
    });

    updateCraneSummary(crane);
}

function updateCraneSummary(crane) {
    const el = document.getElementById('rail-crane-radius');
    if (!el) return;
    el.innerHTML = crane
        ? `${(crane.userData.workRadius || 10).toFixed(1)}<span class="big-stat-unit">m</span>`
        : '<span style="color:var(--text-faint)">未配置</span>';
}

// ---------- カメラ移動（向き・距離はそのまま、注視点だけ寄せる） ----------
let flyRaf = 0;
function focusOn(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const goal = box.getCenter(new THREE.Vector3());
    const from = controls.target.clone();
    const delta = goal.clone().sub(from);
    const camFrom = camera.position.clone();
    const t0 = performance.now();
    cancelAnimationFrame(flyRaf);
    const step = (now) => {
        const t = Math.min(1, (now - t0) / 350);
        const k = 1 - Math.pow(1 - t, 3);   // ease-out
        controls.target.copy(from).addScaledVector(delta, k);
        camera.position.copy(camFrom).addScaledVector(delta, k);
        controls.update();
        if (t < 1) flyRaf = requestAnimationFrame(step);
    };
    flyRaf = requestAnimationFrame(step);
}

// ---------- 操作 ----------
function onListClick(e) {
    const eye = e.target.closest('.layer-eye');
    if (eye) {
        const type = eye.dataset.eye;
        setHidden(type, !hidden.has(type));
        return;
    }

    const del = e.target.closest('.obj-del');
    if (del) {
        const obj = state.placedObjects[Number(del.dataset.idx)];
        if (!obj) return;
        const keep = state.selectedObjects.filter(o => o !== obj);
        removeObjectFully(obj);
        setSelection(keep, keep[0] || null);
        updateCounters();
        updateCraneButton();
        snapshot();
        return;
    }

    const item = e.target.closest('.obj-row');
    if (item) {
        const obj = state.placedObjects[Number(item.dataset.idx)];
        if (!obj) return;
        if (hidden.has(obj.userData.type)) setHidden(obj.userData.type, false);   // 見えないものは選ばせない
        if (state.currentTool !== 'select') selectTool('select');
        setSelection(expandToGroup(obj), obj);
        focusOn(obj);
        return;
    }

    const row = e.target.closest('.layer-row');
    if (row && !row.classList.contains('is-empty')) {
        const type = row.dataset.layer;
        if (expanded.has(type)) expanded.delete(type); else expanded.add(type);
        savePrefs();
        render();
    }
}

export function initSceneTree() {
    listEl = document.getElementById('layer-list');
    auxEl = document.getElementById('layer-aux');
    if (!listEl) return;
    loadPrefs();
    listEl.addEventListener('click', onListClick);
    auxEl.addEventListener('click', () => {
        if (!hidden.size) return;
        hidden.clear();
        applyVisibility();
        savePrefs();
        render();
    });

    // 配置・削除・読込・撤銷のたびに一覧を作り直し、非表示レイヤーのオブジェクトは隠したままにする
    window.addEventListener('placed-objects-changed', () => {
        applyVisibility();
        render();
    });
    // ユーザーが非表示のレイヤーに新しく置いたときは、置いたものが見えるよう表示に戻す
    //（読込・撤銷では発火しない、main.js が配置操作のときだけ出すイベント）
    window.addEventListener('object-placed', (e) => {
        const type = e.detail && e.detail.type;
        if (type && hidden.has(type)) setHidden(type, false);
    });
    window.addEventListener('selection-changed', render);
    // 半径スライダー操作中も左の作業半径を追従させる
    document.getElementById('radius-slider')?.addEventListener('input', () =>
        updateCraneSummary(state.placedObjects.find(o => o.userData.type === 'crane')));

    render();
}
