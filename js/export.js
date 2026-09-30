import { camera, controls, renderer, scene } from './scene.js';
import { state } from './state.js';
import * as THREE from 'three';
import { showToast } from './tools.js';

// 保存当前视角
function saveCurrentView() {
    return {
        position: camera.position.clone(),
        target: controls.target.clone()
    };
}

// 恢复视角
function restoreView(saved) {
    camera.position.copy(saved.position);
    controls.target.copy(saved.target);
    controls.update();
}

// 计算场景中心和包围盒
function getSceneBounds() {
    if (state.placedObjects.length === 0) {
        return { center: new THREE.Vector3(0, 0, 0), size: 30 };
    }
    
    const box = new THREE.Box3();
    state.placedObjects.forEach(obj => {
        box.expandByObject(obj);
    });
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    
    return { center, size: maxSize };
}

// 俯视图
function setTopView() {
    const { center, size } = getSceneBounds();
    camera.position.set(center.x, center.y + size * 2, center.z);
    controls.target.copy(center);
    controls.update();
}

// 侧视图
function setSideView() {
    const { center, size } = getSceneBounds();
    camera.position.set(center.x + size * 2, center.y + size * 0.5, center.z);
    controls.target.copy(center);
    controls.update();
}

// 透视图（默认 3D 视角）
function setPerspectiveView() {
    const { center, size } = getSceneBounds();
    camera.position.set(
        center.x + size * 1.5,
        center.y + size * 1.2,
        center.z + size * 1.5
    );
    controls.target.copy(center);
    controls.update();
}

// 截图当前画面
function captureScreenshot() {
    renderer.render(scene, camera);  // 强制重新渲染一帧
    return renderer.domElement.toDataURL('image/png');
}


export async function takeThreeViews() {
    // 隐藏 ghost
    const ghostVisible = state.ghost ? state.ghost.visible : false;
    if (state.ghost) state.ghost.visible = false;
    
    // 保存原视角
    const original = saveCurrentView();
    
    const screenshots = {};
    
    // 透视图
    setPerspectiveView();
    await new Promise(r => setTimeout(r, 300));
    screenshots.perspective = captureScreenshot();
    
    // 俯视图
    setTopView();
    await new Promise(r => setTimeout(r, 300));
    screenshots.top = captureScreenshot();
    
    // 侧视图
    setSideView();
    await new Promise(r => setTimeout(r, 300));
    screenshots.side = captureScreenshot();
    
    // 恢复
    restoreView(original);
    if (state.ghost) state.ghost.visible = ghostVisible;
    
    return screenshots;
}

// 单独下载 3 张图（测试用）
export async function downloadThreeViews() {
    const screenshots = await takeThreeViews();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    for (const [name, dataURL] of Object.entries(screenshots)) {
        const link = document.createElement('a');
        link.download = `crane-plan-${name}-${timestamp}.png`;
        link.href = dataURL;
        link.click();
        await new Promise(r => setTimeout(r, 200));
    }
}

import { serialize, deserialize } from './persistence.js';

// ============= プロジェクト JSON 入出力 =============
// 3D シーン + A3 計画書（crane-plan-a3.html）の編集内容をまとめて 1 ファイルにする。
// 計画書は iframe 内の別ページなので、そのページが自動保存している localStorage を直接読み書きする。
// （以前は index.html から削除済みの rf-* フォームを読んでいて、出力ボタンが常に TypeError で落ちていた）
export const PLAN_STORAGE_KEY = 'crane_cf19_cadpro_v1';

function readPlanState() {
    try {
        const raw = localStorage.getItem(PLAN_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function exportProjectJSON() {
    const data = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        scene: serialize(),
        plan: readPlanState()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    link.download = `crane-project-${timestamp}.json`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('プロジェクトを出力しました', 'success');
}

export function importProjectJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        let data;
        try {
            data = JSON.parse(e.target.result);
        } catch (err) {
            showToast('ファイル形式エラー（JSON ではありません）', 'error');
            console.error(err);
            return;
        }

        if (!data || typeof data !== 'object' || !data.scene) {
            showToast('クレーン計画のプロジェクトファイルではありません', 'error');
            return;
        }

        try {
            deserialize(data.scene);
        } catch (err) {
            showToast('シーンの読み込みに失敗しました', 'error');
            console.error(err);
            return;
        }

        // v2.0 以降のみ計画書を含む。v1.0 の `form` は削除済みフォームのものなので無視する。
        if (data.plan && typeof data.plan === 'object') {
            try {
                localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(data.plan));
                // 計画書 iframe が既に開かれていれば、その場で読み直させる
                window.dispatchEvent(new CustomEvent('crane-plan-state-imported'));
            } catch (err) {
                showToast('計画書データを保存できませんでした（容量不足の可能性）', 'warning', 4000);
                console.error(err);
            }
        }

        showToast('プロジェクトを読み込みました', 'success');
    };
    reader.readAsText(file);
}
