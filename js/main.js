import { 
    scene, camera, raycaster, mouse,
    loadModels, startAnimationLoop, getGroundIntersect 
} from './scene.js';

import {
    selectTool, updateGhost,
    placeCrane, placeLoadPick, placeLoadDrop, placePlate,  // ⭐
    handleSelect, snapToGrid, updateCounters,
    updateCraneRadius, updateCraneButton,
    showToast, removeObjectFully
} from './tools.js';

import { serialize, deserialize, startAutoSave } from './persistence.js';

import { state } from './state.js';

import {
    addForbiddenPoint, finishForbiddenZone,
    addPathPoint, finishPath,  
    addMeasurePoint, cancelMeasure,    
    cancelDrawing, showHint, hideHint
} from './safety-tools.js';

import { checkSafety } from './safety-tools.js';

import { downloadThreeViews } from './export.js';

import { generateReport } from './export.js';

import { loadFormFromLocalStorage, saveFormToLocalStorage } from './export.js';


import { exportProjectJSON, importProjectJSON } from './export.js';

import { updateSafetyDisplay } from './safety-display.js';
import { getCrane, getMaxRadius } from './crane-database.js';




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

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 选择模式直接处理（不需要打到地面）
    if (state.currentTool === 'select') {
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

// ============= 键盘 =============
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (state.drawingPoints.length > 0) {
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
        if (state.selectedObject) {
            removeObjectFully(state.selectedObject);
            state.selectedObject = null;
            updateCounters();
            updateCraneButton();
        }
    }


    if (event.key === 'r' || event.key === 'R') {
        if (state.selectedObject) {
            state.selectedObject.rotation.y += Math.PI / 18;
            console.log('旋转中:', state.selectedObject.userData.type);
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
    if (state.selectedObject === last) state.selectedObject = null;
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

// ============= 报告 =============
document.getElementById('report-btn').addEventListener('click', () => {
    document.getElementById('report-modal').classList.remove('hidden');
});

document.getElementById('rf-cancel').addEventListener('click', () => {
    document.getElementById('report-modal').classList.add('hidden');
});

document.getElementById('rf-generate').addEventListener('click', async () => {
    document.getElementById('report-modal').classList.add('hidden');
    await generateReport();
});


// 打开表单时加载之前的数据
document.getElementById('report-btn').addEventListener('click', () => {
    document.getElementById('report-modal').classList.remove('hidden');
    loadFormFromLocalStorage();
});

// "一時保存"按钮
document.getElementById('rf-save').addEventListener('click', () => {
    saveFormToLocalStorage();
    showToast('入力内容を一時保存しました', 'success');
});


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
    
    // 更新所有中心点的显示状态
    state.placedObjects.forEach(obj => {
        if (obj.userData.centerMarker) {
            obj.userData.centerMarker.visible = state.showCenterPoints;
        }
    });
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
        const areaLabel = mode.workingArea === 'side' ? ' (側方のみ)' : ' (全周)';
        option.textContent = `${mode.label}${areaLabel}`;
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

// 启动时初始化下拉
updateBoomLengthOptions();
updateOutriggerOptions();
syncRadiusSliderUpperBound();





// ============= 启动 =============
loadModels(() => {
    console.log('🎉 全部加载完成');
});

selectTool('crane');
startAnimationLoop();
startAutoSave(30000);  // 每 30 秒自动保存

setInterval(checkSafety, 500);
