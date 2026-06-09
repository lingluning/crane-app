import {
    scene, camera, raycaster, mouse,
    loadModels, startAnimationLoop, getGroundIntersect
} from './scene.js';

import {
    selectTool, updateGhost,
    placeCrane, placeLoadPick, placeLoadDrop, placePlate,  // ⭐
    handleSelect, snapToGrid, updateCounters,
    updateCraneRadius, updateCraneButton,
    showToast, removeObjectFully, translatePlaced, finalizePlacedMove,
    toggleSelection, rotateSelection, formGroupFromSelection,
    ungroupSelection, setSelection, findRootObject
} from './tools.js';

import { serialize, deserialize, startAutoSave } from './persistence.js';

import { state } from './state.js';

import {
    addForbiddenPoint, finishForbiddenZone,
    addPathPoint, finishPath,  
    addMeasurePoint, cancelMeasure,    
    cancelDrawing, showHint, hideHint
} from './safety-tools.js';

import { downloadThreeViews } from './export.js';

import { exportProjectJSON, importProjectJSON } from './export.js';

import { updateSafetyDisplay } from './safety-display.js';
import { getCrane, getMaxRadius, getAllCranes } from './crane-database.js';
import { updateWeather, attachWeatherRefresh } from './weather.js';




// ============= 鼠标移动 =============
window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = getGroundIntersect();

    if (intersects.length > 0) {
        const point = intersects[0].point;

        document.getElementById('coord-display').textContent =
            `座標: X=${point.x.toFixed(2)}, Z=${point.z.toFixed(2)}`;

        if (state.ghost) {
            state.ghost.position.copy(point);
        
            if (state.currentTool === 'plate') {
                state.ghost.position.x = snapToGrid(state.ghost.position.x);
                state.ghost.position.z = snapToGrid(state.ghost.position.z);
            }
            
            if (state.currentTool === 'crane') state.ghost.position.y += 0.75;
            if (state.currentTool === 'loadPick' || state.currentTool === 'loadDrop') state.ghost.position.y += 0.5;
            if (state.currentTool === 'plate') state.ghost.position.y += 0.05;
        }
    }
});

// ============= 鼠标点击 =============
window.addEventListener('click', (event) => {
    // ⭐ 只处理 3D canvas 上的点击，避免 UI 按钮误触发放置/绘制
    if (event.target.tagName !== 'CANVAS') return;

    // 平移モード中のクリックは確定
    if (translateState.active) {
        commitTranslate();
        return;
    }

    // 拖拽刚结束的 click 不应触发选中/放置
    if (suppressNextClick) {
        suppressNextClick = false;
        return;
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 选择模式
    if (state.currentTool === 'select') {
        // Ctrl/⌘ + 左クリック：敷鉄板の多選トグル
        if (event.ctrlKey || event.metaKey) {
            const hits = raycaster.intersectObjects(state.placedObjects, true);
            if (hits.length > 0) {
                const root = findRootObject(hits[0].object);
                if (root) toggleSelection(root);
            }
            return;
        }
        handleSelect();
        return;
    }
    
    const intersects = getGroundIntersect();
    if (intersects.length === 0) return;

    const point = intersects[0].point;

    switch (state.currentTool) {
        case 'crane': placeCrane(point); break;
        case 'loadPick': placeLoadPick(point); break;
        case 'loadDrop': placeLoadDrop(point); break;
        case 'plate': placePlate(point); break;
        case 'forbidden': addForbiddenPoint(point); break;
        case 'path': addPathPoint(point); break;
        case 'measure': addMeasurePoint(point); break;

    }
});

// ============= 移動平滑（拖拽 / 平移共用） =============
// 指数衰减：alpha = 1 - exp(-stiffness * dt)。stiffness 越大跟手越紧。
// dt を実測することで、フレームレートが変動しても見た目の追従感が変わらない。
// 大きな残距離は 1 フレームで一気に追いつくため、マウス急加速時の遅延を抑える。
const MOVE_STIFFNESS = 55;           // 越大越「跟手」
const MOVE_CATCHUP_THRESHOLD = 4.0;  // 残距離(m) がこれを超えたら 1 フレームで詰める
const MOVE_SNAP_EPS = 0.003;         // ここまで近づいたら端数吸収

const moveSmoothing = {
    targets: new Map(),   // obj -> { x, z }
    running: false,
    lastTime: 0
};

function setMoveTarget(obj, x, z) {
    moveSmoothing.targets.set(obj, { x, z });
    if (!moveSmoothing.running) {
        moveSmoothing.running = true;
        moveSmoothing.lastTime = 0;
        requestAnimationFrame(smoothMoveTick);
    }
}

function clearMoveTargets() {
    moveSmoothing.targets.clear();
}

function smoothMoveTick(now) {
    if (moveSmoothing.targets.size === 0) {
        moveSmoothing.running = false;
        moveSmoothing.lastTime = 0;
        return;
    }

    // dt（秒）。初回は 1/60 と仮定。スパイクは 50ms にクランプ。
    const last = moveSmoothing.lastTime;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    moveSmoothing.lastTime = now;

    const alpha = 1 - Math.exp(-MOVE_STIFFNESS * dt);

    moveSmoothing.targets.forEach((t, obj) => {
        // 削除済みオブジェクトは smoothing からも外す
        //（info-panel の点滅 / 余計な showInfo / orphan 生成を防止）
        if (!state.placedObjects.includes(obj)) {
            moveSmoothing.targets.delete(obj);
            return;
        }

        const cx = obj.position.x;
        const cz = obj.position.z;
        const remX = t.x - cx;
        const remZ = t.z - cz;
        const remDist = Math.hypot(remX, remZ);

        // (a) 既に十分近い → 完全に揃えて終了 + 半径円を地形に再フィット
        if (remDist < MOVE_SNAP_EPS) {
            translatePlaced(obj, remX, remZ, { light: true });
            finalizePlacedMove(obj);
            moveSmoothing.targets.delete(obj);
            return;
        }

        // (b) 残距離が大きすぎる（マウスが急加速）→ 1 フレームで追いつく
        const k = remDist > MOVE_CATCHUP_THRESHOLD ? 1.0 : alpha;
        translatePlaced(obj, remX * k, remZ * k, { light: true });   // ⭐ ドラッグ中は軽量パス
    });

    requestAnimationFrame(smoothMoveTick);
}

// ============= 左键拖拽：移动选中的吊车 =============
// 在「選択」工具下按住吊车拖动，按地面射线投影同步吊车位置（与摄像机角度无关）。
const DRAG_THRESHOLD_PX = 4;
const dragState = {
    armed: false,
    dragging: false,
    crane: null,
    offsetX: 0,
    offsetZ: 0,
    startX: 0,
    startY: 0
};
let suppressNextClick = false;

window.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (event.target.tagName !== 'CANVAS') return;
    if (state.currentTool !== 'select') return;
    if (event.ctrlKey || event.metaKey) return;   // Ctrl+左クリックは多選用：ドラッグ無効
    if (translateState.active) return;             // 平移モード中はドラッグ無効

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObjects(state.placedObjects, true);
    if (hits.length === 0) return;

    let root = hits[0].object;
    while (root && !state.placedObjects.includes(root)) root = root.parent;
    if (!root || root.userData.type !== 'crane') return;

    const groundHits = getGroundIntersect();
    if (groundHits.length === 0) return;
    const gp = groundHits[0].point;

    // 先选中吊车（弹出半径/旋转面板）
    if (state.selectedObject !== root) handleSelect();

    dragState.armed = true;
    dragState.dragging = false;
    dragState.crane = root;
    dragState.offsetX = root.position.x - gp.x;
    dragState.offsetZ = root.position.z - gp.z;
    dragState.startX = event.clientX;
    dragState.startY = event.clientY;
});

window.addEventListener('mousemove', (event) => {
    if (!dragState.armed) return;

    if (!dragState.dragging) {
        const ddx = event.clientX - dragState.startX;
        const ddy = event.clientY - dragState.startY;
        if (Math.hypot(ddx, ddy) < DRAG_THRESHOLD_PX) return;
        dragState.dragging = true;
        document.body.style.cursor = 'grabbing';
    }

    // 上面通用 mousemove 已更新 mouse + raycaster
    const groundHits = getGroundIntersect();
    if (groundHits.length === 0) return;
    const p = groundHits[0].point;

    const crane = dragState.crane;
    const targetX = p.x + dragState.offsetX;
    const targetZ = p.z + dragState.offsetZ;
    setMoveTarget(crane, targetX, targetZ);   // ⭐ 1:1 スナップではなく毎フレーム lerp で追従
});

window.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    if (!dragState.armed) return;

    if (dragState.dragging) {
        suppressNextClick = true;
        document.body.style.cursor = '';
    }
    dragState.armed = false;
    dragState.dragging = false;
    dragState.crane = null;
});

// ============= 右クリックコンテキストメニュー =============
const ROTATE_STEP_RAD = Math.PI / 12;   // 15°

function allInSameGroup(sel) {
    if (sel.length === 0) return true;
    const ids = new Set(sel.map(o => o.userData.groupId));
    return ids.size === 1 && !ids.has(undefined);
}

function openContextMenu(x, y) {
    const menu = document.getElementById('context-menu');
    const sel = state.selectedObjects;

    const canGroup = sel.length >= 2 && !allInSameGroup(sel);
    const canUngroup = sel.some(o => o.userData.groupId);

    menu.querySelectorAll('.ctx-item').forEach(item => {
        const action = item.dataset.action;
        let enabled = sel.length > 0;
        if (action === 'group') enabled = canGroup;
        if (action === 'ungroup') enabled = canUngroup;
        item.toggleAttribute('disabled', !enabled);
    });

    // 一旦表示してサイズ計測 → はみ出し補正
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth)  menu.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) menu.style.top  = `${y - rect.height}px`;
}

function closeContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
}

window.addEventListener('contextmenu', (event) => {
    if (event.target.tagName !== 'CANVAS') return;

    // Mac の Ctrl+左クリックは OS が「右クリック」として contextmenu を発火するが、
    // ユーザーの意図は多選なのでメニューを開かない（click ハンドラ側で toggleSelection）。
    if (event.ctrlKey) {
        event.preventDefault();
        return;
    }

    // 平移モード中の右クリックは平移取消
    if (translateState.active) {
        event.preventDefault();
        cancelTranslate();
        return;
    }

    if (state.currentTool !== 'select') return;
    if (state.selectedObjects.length === 0) return;   // 選択なしならパン(OrbitControls)に任せる

    event.preventDefault();
    openContextMenu(event.clientX, event.clientY);
});

// メニュー外を左クリックしたら閉じる（メニュー内クリックはそのまま）
window.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const menu = document.getElementById('context-menu');
    if (menu.classList.contains('hidden')) return;
    if (!menu.contains(event.target)) closeContextMenu();
});

// メニュー項目の動作
document.getElementById('context-menu').addEventListener('click', (event) => {
    const btn = event.target.closest('.ctx-item');
    if (!btn || btn.hasAttribute('disabled')) return;

    switch (btn.dataset.action) {
        case 'rotate-cw':  rotateSelection( ROTATE_STEP_RAD); break;
        case 'rotate-ccw': rotateSelection(-ROTATE_STEP_RAD); break;
        case 'translate':  startTranslate(); break;
        case 'group': {
            const formed = formGroupFromSelection();
            if (formed) showToast(`${state.selectedObjects.length} 個をグループ化しました`, 'success');
            setSelection(state.selectedObjects.slice(), state.selectedObject);   // info-panel 更新
            break;
        }
        case 'ungroup': {
            const changed = ungroupSelection();
            if (changed) showToast('グループ解除しました', 'info');
            setSelection(state.selectedObjects.slice(), state.selectedObject);
            break;
        }
        case 'delete': {
            state.selectedObjects.slice().forEach(o => removeObjectFully(o));
            setSelection([]);
            updateCounters();
            updateCraneButton();
            break;
        }
    }
    closeContextMenu();
});

// ============= 平移モード（メニューから起動。マウスで追従、クリック確定、Esc 取消） =============
const translateState = {
    active: false,
    startX: 0, startZ: 0,
    originals: []   // [{obj, x, z}]
};

function startTranslate() {
    if (state.selectedObjects.length === 0) return;
    const groundHits = getGroundIntersect();
    if (groundHits.length === 0) {
        showToast('カーソルを 3D ビュー上に置いてから実行してください', 'warning');
        return;
    }
    const start = groundHits[0].point;

    translateState.active = true;
    translateState.startX = start.x;
    translateState.startZ = start.z;
    translateState.originals = state.selectedObjects.map(obj => ({
        obj, x: obj.position.x, z: obj.position.z
    }));
    document.body.style.cursor = 'move';
    showToast('マウスで移動 / 左クリックで確定 / Esc で取消', 'info', 3000);
}

function applyTranslate() {
    if (!translateState.active) return;
    const groundHits = getGroundIntersect();
    if (groundHits.length === 0) return;
    const p = groundHits[0].point;
    const dx = p.x - translateState.startX;
    const dz = p.z - translateState.startZ;

    translateState.originals.forEach(({obj, x, z}) => {
        setMoveTarget(obj, x + dx, z + dz);   // ⭐ 平滑追従（commit/cancel 時は別途処理）
    });
}

function commitTranslate() {
    translateState.active = false;
    translateState.originals = [];
    document.body.style.cursor = '';
}

function cancelTranslate() {
    if (!translateState.active) return;
    clearMoveTargets();   // ⭐ 残った平滑ターゲットが原位復元を邪魔しないように
    translateState.originals.forEach(({obj, x, z}) => {
        translatePlaced(obj, x - obj.position.x, z - obj.position.z);   // 非 light → クレーンは Y も再フィット
    });
    translateState.active = false;
    translateState.originals = [];
    document.body.style.cursor = '';
}

// 平移中の追従 / 確定（既存の mousemove / click より後に登録するため、新規ハンドラで処理）
window.addEventListener('mousemove', () => {
    if (translateState.active) applyTranslate();
});

// ============= 键盘 =============
window.addEventListener('keydown', (event) => {
    // スペースキーで選択モードへ（入力中は除く）
    if (event.key === ' ' || event.code === 'Space') {
        const tag = event.target && event.target.tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
            event.preventDefault();
            selectTool('select');
            return;
        }
    }

    if (event.key === 'Escape') {
        if (translateState.active) {
            cancelTranslate();
        } else if (!document.getElementById('context-menu').classList.contains('hidden')) {
            closeContextMenu();
        } else if (state.drawingPoints.length > 0) {
            cancelDrawing();   // ⭐ 优先取消正在画的
        } else if (state.currentTool === 'measure') {
            cancelMeasure();   // ⭐ 新增
            selectTool('select');
        } else {
            selectTool('select');
        }
    }

    if (event.key === 'Enter') {
        if (state.currentTool === 'forbidden' && state.drawingPoints.length >= 3) {
            finishForbiddenZone();
        }
        if (state.currentTool === 'path' && state.drawingPoints.length >= 2) {
            finishPath();   // ⭐ 新增
        }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectedObjects.length > 0) {
            state.selectedObjects.slice().forEach(obj => removeObjectFully(obj));
            setSelection([]);
            updateCounters();
            updateCraneButton();
        }
    }


    if (event.key === 'r' || event.key === 'R') {
        if (state.selectedObjects.length > 0) {
            rotateSelection(Math.PI / 18);   // 10°
        }
    }
});

// ============= 工具按钮 =============
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        selectTool(btn.dataset.tool);
    });
});

// ============= 撤销按钮 =============
document.getElementById('undo-btn').addEventListener('click', () => {
    if (state.placedObjects.length === 0) return;

    const last = state.placedObjects[state.placedObjects.length - 1];
    if (state.selectedObjects.includes(last)) {
        const remaining = state.selectedObjects.filter(o => o !== last);
        setSelection(remaining, remaining[0] || null);
    }
    removeObjectFully(last);
    updateCounters();
    updateCraneButton();
});

// ============= 滑杆 =============
document.getElementById('radius-slider').addEventListener('input', (e) => {
    if (!state.selectedObject || state.selectedObject.userData.type !== 'crane') return;
    
    const radius = parseFloat(e.target.value);
    document.getElementById('radius-value').textContent = radius.toFixed(1);
    updateCraneRadius(state.selectedObject, radius);
});

document.getElementById('rotation-slider').addEventListener('input', (e) => {
    if (!state.selectedObject || state.selectedObject.userData.type !== 'crane') return;

    const angleDeg = parseFloat(e.target.value);
    document.getElementById('rotation-value').textContent = angleDeg;
    state.selectedObject.rotation.y = (angleDeg * Math.PI) / 180;
});

// ============= 敷板尺寸 =============
document.querySelectorAll('.plate-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const [x, z] = btn.dataset.size.split('x').map(Number);
        state.currentPlateSize = { x, z };
        
        document.querySelectorAll('.plate-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (state.currentTool === 'plate') {
            updateGhost();
        }
    });
});

// ============= 保存 / 加载 =============
document.getElementById('save-btn').addEventListener('click', () => {
    const data = serialize();
    localStorage.setItem('crane_plan', JSON.stringify(data));
    
    showToast(`保存しました（${data.objects.length} 個のオブジェクト）`, 'success');
    console.log('保存的数据:', data);
});

document.getElementById('load-btn').addEventListener('click', () => {
    const saved = localStorage.getItem('crane_plan');
    
    if (!saved) {
        showToast('保存されたプランがありません', 'warning');
        return;
    }
    
    try {
        const data = JSON.parse(saved);
        deserialize(data);
        showToast(`読み込みました（${data.objects.length} 個 / ${data.savedAt}）`, 'success', 3500);
    } catch (e) {
        showToast('読み込みエラー', 'error');
        console.error(e);
    }
});

// ============= 截图 =============
document.getElementById('screenshot-btn').addEventListener('click', async () => {
    await downloadThreeViews();
});

// ============= 計画書（CF-19 · A3）を埋め込みオーバーレイで開く =============
//   index 内の #plan-overlay 内の iframe に crane-plan-a3.html を遅延ロードして表示。
//   自動保存・PDF出力はオーバーレイ内のページが独自に処理する。
(function () {
    const overlay = document.getElementById('plan-overlay');
    const frame   = document.getElementById('plan-frame');
    const closeBtn = document.getElementById('plan-close');

    function openPlan() {
        // 初回オープン時のみソースを設定（以後は state を保持）
        if (!frame.src || frame.src === 'about:blank') {
            frame.src = './crane-plan-a3.html';
        }
        overlay.classList.remove('hidden');
        // iframe の中で fit-to-width を再計算させる（display:none → flex で resize は発火しないので明示的に通知）
        requestAnimationFrame(() => {
            try { frame.contentWindow && frame.contentWindow.dispatchEvent(new Event('resize')); } catch (e) {}
        });
    }
    function closePlan() {
        overlay.classList.add('hidden');
    }

    document.getElementById('report-btn').addEventListener('click', openPlan);
    closeBtn.addEventListener('click', closePlan);

    // iframe 内から閉じたい場合：parent に postMessage を送れば閉じる
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'crane-plan-close') closePlan();
    });

    // Esc キーで閉じる（他のショートカットを潰さないよう、オーバーレイ表示中だけ）
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
            closePlan();
            e.stopPropagation();
        }
    }, true);   // capture phase で先に拾う
})();


document.getElementById('export-json-btn').addEventListener('click', exportProjectJSON);

document.getElementById('import-json-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importProjectJSON(file);
});


document.getElementById('toggle-center-btn').addEventListener('click', () => {
    state.showCenterPoints = !state.showCenterPoints;

    state.placedObjects.forEach(obj => {
        if (obj.userData.centerMarker) {
            obj.userData.centerMarker.visible = state.showCenterPoints;
        }
    });

    // ボタンの on/off 表示を同期
    document.getElementById('toggle-center-btn')
        .classList.toggle('on', state.showCenterPoints);
});

// 定时更新安全 / 距离显示
setInterval(updateSafetyDisplay, 200);

// 实际吊重输入
document.getElementById('actual-load-input').addEventListener('input', (e) => {
    state.actualLoad = parseFloat(e.target.value) || 0;
});

// ============= Week 11: ブーム + アウトリガー 下拉 =============

function updateBoomLengthOptions() {
    const crane = getCrane(state.currentCraneId);
    if (!crane) return;

    const select = document.getElementById('boom-length-select');
    if (!select) return;

    select.innerHTML = '';
    crane.boom.availableLengths.forEach(length => {
        const option = document.createElement('option');
        option.value = length;
        option.textContent = `${length} m`;
        if (length === state.currentBoomLength) option.selected = true;
        select.appendChild(option);
    });

    // 如果当前 boom 不在新列表里，退到第一个
    if (!crane.boom.availableLengths.includes(state.currentBoomLength)) {
        state.currentBoomLength = crane.boom.availableLengths[0];
        select.value = state.currentBoomLength;
    }
}

function updateOutriggerOptions() {
    const crane = getCrane(state.currentCraneId);
    if (!crane) return;

    const select = document.getElementById('outrigger-select');
    if (!select) return;

    select.innerHTML = '';
    Object.values(crane.outrigger.modes).forEach(mode => {
        const option = document.createElement('option');
        option.value = mode.id;
        option.textContent = mode.label;
        if (mode.id === state.currentOutriggerMode) option.selected = true;
        select.appendChild(option);
    });

    // 当前模式不存在时退回默认
    const modeKeys = Object.keys(crane.outrigger.modes);
    if (!modeKeys.includes(state.currentOutriggerMode)) {
        state.currentOutriggerMode = modeKeys[0];
        select.value = state.currentOutriggerMode;
    }
}

function syncRadiusSliderUpperBound() {
    const maxR = getMaxRadius(
        state.currentCraneId,
        state.currentOutriggerMode,
        state.currentBoomLength
    );

    const slider = document.getElementById('radius-slider');
    if (slider) {
        slider.max = maxR;
        const crane = state.placedObjects.find(o => o.userData.type === 'crane');
        if (crane && crane.userData.workRadius > maxR) {
            import('./tools.js').then(({ updateCraneRadius }) => {
                updateCraneRadius(crane, maxR);
                slider.value = maxR;
                document.getElementById('radius-value').textContent = maxR.toFixed(1);
            });
        }
    }
}

document.getElementById('boom-length-select').addEventListener('change', (e) => {
    state.currentBoomLength = parseFloat(e.target.value);
    syncRadiusSliderUpperBound();
});

document.getElementById('outrigger-select').addEventListener('change', (e) => {
    state.currentOutriggerMode = e.target.value;
    // 同步到当前吊车（旧字段，便于其他代码读取）
    const crane = state.placedObjects.find(o => o.userData.type === 'crane');
    if (crane) crane.userData.outriggerMode = e.target.value;
    syncRadiusSliderUpperBound();
});

// ============= 機種（クレーン型式）プルダウン =============
function updateCraneModelOptions() {
    const select = document.getElementById('crane-model-select');
    if (!select) return;

    select.innerHTML = '';
    getAllCranes().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.displayName;
        if (c.id === state.currentCraneId) opt.selected = true;
        select.appendChild(opt);
    });
}

document.getElementById('crane-model-select').addEventListener('change', (e) => {
    const newId = e.target.value;
    const newCrane = getCrane(newId);
    if (!newCrane) return;

    state.currentCraneId = newId;

    // 配置済みクレーンがあれば userData を新しい型式に差し替え
    const placed = state.placedObjects.find(o => o.userData.type === 'crane');
    if (placed) {
        placed.userData.craneId = newId;
        placed.userData.craneData = newCrane;
        placed.userData.centerOffset = newCrane.centerPoint;
    }

    // ラベル更新（吊荷情報パネルの右肩）
    const idLabel = document.getElementById('crane-id-label');
    if (idLabel) idLabel.textContent = newCrane.displayName || newId;

    // ブーム長 / アウトリガ は型式ごとに違うので再構築。
    // 既存値が新型式に無い場合は updateBoomLengthOptions / updateOutriggerOptions
    // 内で先頭値に退避する。
    updateBoomLengthOptions();
    updateOutriggerOptions();
    state.currentBoomLength = parseFloat(
        document.getElementById('boom-length-select').value
    );
    state.currentOutriggerMode = document.getElementById('outrigger-select').value;
    if (placed) placed.userData.outriggerMode = state.currentOutriggerMode;

    syncRadiusSliderUpperBound();
    showToast(`機種を切替: ${newCrane.displayName}`, 'success');
});

// 启动时初始化下拉
updateCraneModelOptions();
updateBoomLengthOptions();
updateOutriggerOptions();
syncRadiusSliderUpperBound();

// 起動時にラベルも反映
{
    const c0 = getCrane(state.currentCraneId);
    const idLabel0 = document.getElementById('crane-id-label');
    if (c0 && idLabel0) idLabel0.textContent = c0.displayName || c0.id;
}





// ============= 設定モーダル =============
const SETTINGS_KEY = 'crane_app_settings';

function defaultSettings() {
    return {
        location: { siteName: '', address: '', lat: null, lng: null, notes: '' }
    };
}

function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    try {
        const parsed = JSON.parse(raw);
        return { ...defaultSettings(), ...parsed, location: { ...defaultSettings().location, ...(parsed.location || {}) } };
    } catch {
        return defaultSettings();
    }
}

function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function openSettingsModal() {
    const s = loadSettings();
    document.getElementById('set-site-name').value = s.location.siteName || '';
    document.getElementById('set-address').value   = s.location.address  || '';
    document.getElementById('set-lat').value       = s.location.lat ?? '';
    document.getElementById('set-lng').value       = s.location.lng ?? '';
    document.getElementById('set-notes').value     = s.location.notes || '';
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}

document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
document.getElementById('settings-close').addEventListener('click', closeSettingsModal);
document.getElementById('settings-cancel').addEventListener('click', closeSettingsModal);

// 背景クリックで閉じる
document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettingsModal();
});

document.getElementById('settings-save').addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('set-lat').value);
    const lng = parseFloat(document.getElementById('set-lng').value);
    const s = loadSettings();
    s.location = {
        siteName: document.getElementById('set-site-name').value.trim(),
        address:  document.getElementById('set-address').value.trim(),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        notes:    document.getElementById('set-notes').value.trim()
    };
    saveSettings(s);
    showToast('設定を保存しました', 'success');
    closeSettingsModal();
    updateWeather();
});

// 現在地取得
document.getElementById('set-locate').addEventListener('click', () => {
    if (!navigator.geolocation) {
        showToast('このブラウザは位置情報をサポートしていません', 'warning');
        return;
    }
    showToast('現在地を取得中…', 'info', 1500);
    navigator.geolocation.getCurrentPosition(
        pos => {
            document.getElementById('set-lat').value = pos.coords.latitude.toFixed(6);
            document.getElementById('set-lng').value = pos.coords.longitude.toFixed(6);
            showToast('現在地を取得しました', 'success');
        },
        err => showToast(`位置情報の取得に失敗: ${err.message}`, 'error', 3500)
    );
});

// サイドバーのタブ切替（将来カテゴリを増やすときに有効）
document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.settings-pane').forEach(p => {
            p.classList.toggle('active', p.id === `settings-pane-${target}`);
        });
    });
});

// ============= 启动 =============
attachWeatherRefresh();
updateWeather();
setInterval(updateWeather, 30 * 60 * 1000);   // 30 分ごとに自動更新

loadModels(() => {
    console.log('🎉 全部加载完成');
});

selectTool('crane');
startAnimationLoop();
startAutoSave(30000);  // 每 30 秒自动保存
