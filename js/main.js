import { 
    scene, camera, raycaster, mouse,
    loadModels, startAnimationLoop, getGroundIntersect 
} from './scene.js';

import {
    selectTool, updateGhost,
    placeCrane, placeLoad, placePlate,
    handleSelect, snapToGrid, updateCounters,
    updateCraneRadius, updateCraneButton
} from './tools.js';

import { serialize, deserialize, startAutoSave } from './persistence.js';

import { state } from './state.js';

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
            if (state.currentTool === 'load') state.ghost.position.y += 0.5;
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
        case 'load': placeLoad(point); break;
        case 'plate': placePlate(point); break;
    }
});

// ============= 键盘 =============
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        selectTool('select');
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectedObject) {
            if (state.selectedObject.userData.radiusCircle) {
                scene.remove(state.selectedObject.userData.radiusCircle);
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

// ============= 启动 =============
loadModels(() => {
    console.log('🎉 全部加载完成');
});

selectTool('crane');
startAnimationLoop();
startAutoSave(30000);  // 每 30 秒自动保存