import { 
    scene, camera, raycaster, mouse,
    loadModels, startAnimationLoop, getGroundIntersect 
} from './scene.js';

import {
    selectTool, updateGhost,
    placeCrane, placeLoadPick, placeLoadDrop, placePlate,  // ⭐
    handleSelect, snapToGrid, updateCounters,
    updateCraneRadius, updateCraneButton
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

import { updateDistanceDisplay } from './safety-display.js';




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
            // ⭐ 如果是禁止区，也删除边框
            if (state.selectedObject.userData.border) {
                scene.remove(state.selectedObject.userData.border);
            }
            if (state.selectedObject.userData.radiusCircle) {
                scene.remove(state.selectedObject.userData.radiusCircle);
            }
            
            if (state.selectedObject.userData.arrows) {   // ⭐ 新增
                state.selectedObject.userData.arrows.forEach(a => scene.remove(a));
            }

            if (state.selectedObject.userData.centerMarker) {  // ⭐ 新增
            scene.remove(state.selectedObject.userData.centerMarker);
            }

            if (state.selectedObject.userData.label) {
                scene.remove(state.selectedObject.userData.label);
            }

            if (state.selectedObject.userData.balls) {
                state.selectedObject.userData.balls.forEach(b => scene.remove(b));
            }

            scene.remove(state.selectedObject);
            const index = state.placedObjects.indexOf(state.selectedObject);
            if (index > -1) state.placedObjects.splice(index, 1);
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

    const last = state.placedObjects.pop();

    if (last.userData.radiusCircle) {
        scene.remove(last.userData.radiusCircle);
    }
    scene.remove(last);
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
    
    alert(`✅ 保存しました\n${data.objects.length} 個のオブジェクト`);
    console.log('保存的数据:', data);
});

document.getElementById('load-btn').addEventListener('click', () => {
    const saved = localStorage.getItem('crane_plan');
    
    if (!saved) {
        alert('保存されたプランがありません');
        return;
    }
    
    try {
        const data = JSON.parse(saved);
        deserialize(data);
        alert(`✅ 読み込みました\n${data.objects.length} 個のオブジェクト\n保存時刻: ${data.savedAt}`);
    } catch (e) {
        alert('❌ 読み込みエラー');
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
    alert('✅ 入力内容を一時保存しました');
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

// 定时更新距离显示
setInterval(updateDistanceDisplay, 200);

// 实际吊重输入
document.getElementById('actual-load-input').addEventListener('input', (e) => {
    state.actualLoad = parseFloat(e.target.value) || 0;
});


// アウトリガー切换
document.querySelectorAll('.outrigger-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        
        // 更新按钮样式
        document.querySelectorAll('.outrigger-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 更新吊车状态
        const crane = state.placedObjects.find(o => o.userData.type === 'crane');
        if (crane) {
            crane.userData.outriggerMode = mode;
            
            // 更新最大半径上限
            const maxRadius = crane.userData.craneData.outrigger.modes[mode].maxRadius;
            document.getElementById('radius-slider').max = maxRadius;
            
            if (crane.userData.workRadius > maxRadius) {
                // 半径超过上限，自动缩小
                import('./tools.js').then(({ updateCraneRadius }) => {
                    updateCraneRadius(crane, maxRadius);
                    document.getElementById('radius-slider').value = maxRadius;
                    document.getElementById('radius-value').textContent = maxRadius.toFixed(1);
                });
            }
        }
    });
});





// ============= 启动 =============
loadModels(() => {
    console.log('🎉 全部加载完成');
});

selectTool('crane');
startAnimationLoop();
startAutoSave(30000);  // 每 30 秒自动保存

setInterval(checkSafety, 500);
