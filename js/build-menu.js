// 右パネル上部の「建造」メニュー（赤警のサイドバー風）。
// タブで分類を切り替え、カメオ（ユニットのアイコン）をクリックすると配置モードに入る。
//   左クリック   … 選択（もう一度押すと解除）
//   右クリック   … 解除
// カメオ右上の数字はシーン内の配置数。クレーンは 1 台までなので、置くと灰色になる。

import { state } from './state.js';
import { selectTool } from './tools.js';
import { BUILD_TABS, cameoSVG, itemLabel } from './equipment-catalog.js';

const COLLAPSE_KEY = 'crane_build_menu_collapsed';
const TAB_KEY = 'crane_build_menu_tab';

let root, grid, statusEl;
let activeTab = BUILD_TABS[0].key;

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const itemKey = item => item.kind === 'tool' ? `tool:${item.tool}` : `eq:${item.id}`;

function findItem(key) {
    for (const tab of BUILD_TABS) {
        const item = tab.items.find(i => itemKey(i) === key);
        if (item) return item;
    }
    return null;
}

function isActive(item) {
    if (item.kind === 'tool') return state.currentTool === item.tool;
    return state.currentTool === 'equipment' && state.currentEquipmentId === item.id;
}

function placedCount(item) {
    return state.placedObjects.filter(o => item.kind === 'tool'
        ? o.userData.type === item.tool
        : o.userData.type === 'equipment' && o.userData.equipmentId === item.id).length;
}

function readPref(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writePref(key, value) {
    try { localStorage.setItem(key, value); } catch { /* 表示設定なので失敗しても無視 */ }
}

// ---------- 描画 ----------
function renderTabs() {
    root.querySelector('.bm-tabs').innerHTML = BUILD_TABS.map(t =>
        `<button class="bm-tab${t.key === activeTab ? ' active' : ''}" data-tab="${t.key}">${esc(t.label)}</button>`
    ).join('');
}

function renderGrid() {
    const tab = BUILD_TABS.find(t => t.key === activeTab) || BUILD_TABS[0];
    grid.innerHTML = tab.items.map(item => {
        const { name, spec, title } = itemLabel(item);
        return `<button class="cameo" data-build-key="${itemKey(item)}" title="${esc(title)}">
            ${cameoSVG(item.icon)}
            ${spec ? `<span class="cameo-spec">${esc(spec)}</span>` : ''}
            <span class="cameo-count" hidden></span>
            <span class="cameo-name">${esc(name)}</span>
        </button>`;
    }).join('');
    refreshState();
}

// 選択状態・配置数・上限を反映（ツール切替・配置・削除のたびに呼ばれる）
function refreshState() {
    grid.querySelectorAll('.cameo').forEach(el => {
        const item = findItem(el.dataset.buildKey);
        if (!item) return;
        const n = placedCount(item);
        const full = item.limit != null && n >= item.limit;
        el.classList.toggle('active', isActive(item));
        el.classList.toggle('disabled', full);
        const badge = el.querySelector('.cameo-count');
        badge.hidden = n === 0;
        badge.textContent = item.limit != null ? `${n}/${item.limit}` : n;
    });

    const activeItem = BUILD_TABS.flatMap(t => t.items).find(isActive);
    statusEl.textContent = activeItem
        ? `▶ ${itemLabel(activeItem).title}　配置先をクリック`
        : 'ユニットを選択してください';
    statusEl.classList.toggle('ready', !!activeItem);
}

// 赤警の「建造中」っぽい時計回りのワイプ（見た目だけ。配置はすぐ可能）
function playBuildWipe(el) {
    el.classList.remove('building');
    void el.offsetWidth;   // アニメーションを再始動
    el.classList.add('building');
    el.addEventListener('animationend', () => el.classList.remove('building'), { once: true });
}

// ---------- 操作 ----------
function activate(item, el) {
    if (isActive(item)) {           // もう一度押したら解除
        selectTool('select');
        return;
    }
    if (item.kind === 'tool') {
        selectTool(item.tool);      // クレーン上限は selectTool 側でトースト表示して止める
    } else {
        state.currentEquipmentId = item.id;
        selectTool('equipment');
    }
    if (isActive(item)) playBuildWipe(el);
}

function setTab(key) {
    if (!BUILD_TABS.some(t => t.key === key)) return;
    activeTab = key;
    writePref(TAB_KEY, key);
    renderTabs();
    renderGrid();
}

function setCollapsed(collapsed) {
    root.classList.toggle('collapsed', collapsed);
    writePref(COLLAPSE_KEY, collapsed ? '1' : '0');
}

export function initBuildMenu() {
    root = document.getElementById('build-menu');
    if (!root) return;
    grid = root.querySelector('.bm-grid');
    statusEl = root.querySelector('.bm-status');

    activeTab = readPref(TAB_KEY, activeTab);
    if (!BUILD_TABS.some(t => t.key === activeTab)) activeTab = BUILD_TABS[0].key;
    root.classList.toggle('collapsed', readPref(COLLAPSE_KEY, '0') === '1');

    renderTabs();
    renderGrid();

    root.querySelector('.bm-head').addEventListener('click', () =>
        setCollapsed(!root.classList.contains('collapsed')));

    root.querySelector('.bm-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.bm-tab');
        if (btn) setTab(btn.dataset.tab);
    });

    grid.addEventListener('click', (e) => {
        const el = e.target.closest('.cameo');
        if (!el || el.classList.contains('disabled')) return;
        const item = findItem(el.dataset.buildKey);
        if (item) activate(item, el);
    });

    // 右クリック = 解除（赤警と同じ）
    grid.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.cameo')) return;
        e.preventDefault();
        selectTool('select');
    });

    window.addEventListener('tool-changed', refreshState);
    window.addEventListener('placed-objects-changed', refreshState);
}
