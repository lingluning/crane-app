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

//収集データ
// ⚠ rf-* の入力欄は計画書が crane-plan-a3.html (iframe) に移った際に
//   index.html から削除された。要素が無い環境でも落ちないよう、
//   getElementById の結果を必ずガードしてから .value を読む。
//   （以前は null.value で TypeError → JSON エクスポートが常に失敗していた）
function rfValue(id, fallback = '') {
    const el = document.getElementById(`rf-${id}`);
    const v = el ? el.value : '';
    return v || fallback;
}

function collectFormData() {
    return {
        site: rfValue('site', '〇〇現場'),
        company: rfValue('company', '〇〇建設'),
        projectNo: rfValue('projectNo'),
        date: rfValue('date', new Date().toISOString().slice(0, 10)),
        weather: rfValue('weather'),

        craneModel: rfValue('craneModel'),
        vehicleNo: rfValue('vehicleNo'),
        maxLoad: rfValue('maxLoad'),
        radius: rfValue('radius'),

        operator: rfValue('operator'),
        rigger: rfValue('rigger'),
        signaler: rfValue('signaler'),
        guide: rfValue('guide'),

        morning: rfValue('morning'),
        afternoon: rfValue('afternoon'),
        mainLoad: rfValue('mainLoad'),

        windLimit: rfValue('windLimit', 10),
        rainLimit: rfValue('rainLimit', 10),
        notes: rfValue('notes')
    };
}

function collectSceneStats() {
    const cranes = state.placedObjects.filter(o => o.userData.type === 'crane');
    const forbidden = state.placedObjects.filter(o => o.userData.type === 'forbidden');
    const paths = state.placedObjects.filter(o => o.userData.type === 'path');
    const plates = state.placedObjects.filter(o => o.userData.type === 'plate');
    
    return {
        cranesCount: cranes.length,
        forbiddenCount: forbidden.length,
        pathsCount: paths.length,
        plateCount: plates.length,
        totalPathLength: paths.reduce((sum, p) => sum + (p.userData.length || 0), 0)
    };
}

export async function generateReport() {
    // 1. 收集数据
    const formData = collectFormData();
    const stats = collectSceneStats();
    
    // 2. 拍 3 张图
    const screenshots = await takeThreeViews();
    
    // 3. 生成 HTML
    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>移動式クレーン作業計画書 - ${formData.site}</title>
    <style>
        @page { size: A3 landscape; margin: 8mm; }
        
        * { box-sizing: border-box; }
        body {
            font-family: 'Hiragino Kaku Gothic Pro', 'Yu Gothic', sans-serif;
            font-size: 11px;
            line-height: 1.4;
            margin: 0;
            color: #000;
        }
        
        .header {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            padding: 8px;
            border: 2px solid #000;
            margin-bottom: 6px;
        }
        
        .container {
            display: grid;
            grid-template-columns: 360px 1fr;
            gap: 6px;
            height: calc(100vh - 60px);
        }
        
        /* 左侧表格 */
        .info-section { border: 1px solid #000; }
        .info-section-title {
            background: #ddd;
            padding: 3px 6px;
            font-weight: bold;
            font-size: 10px;
            border-bottom: 1px solid #000;
        }
        .info-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
        }
        .info-table td {
            border: 1px solid #888;
            padding: 3px 5px;
            vertical-align: middle;
        }
        .info-table .label {
            background: #f5f5f5;
            font-weight: bold;
            width: 40%;
        }
        
        /* 右侧图区 */
        .images-area {
            display: grid;
            grid-template-rows: 1.6fr 1fr;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }
        .image-box {
            border: 1px solid #000;
            display: flex;
            flex-direction: column;
            background: white;
        }
        .image-box.large {
            grid-column: span 2;
        }
        .image-title {
            background: #333;
            color: white;
            padding: 3px 8px;
            font-weight: bold;
            font-size: 10px;
        }
        .image-content {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .image-content img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        
        /* 警告 */
        .warning {
            background: #fee;
            border-left: 3px solid #c00;
            padding: 4px 8px;
            margin: 4px 0;
            font-size: 9px;
        }
        
        /* 签名区 */
        .signature-area {
            border: 1px solid #000;
            margin-top: 4px;
            padding: 4px;
            font-size: 9px;
        }
        .signature-area table {
            width: 100%;
        }
        .signature-area td {
            border: 1px solid #888;
            padding: 4px;
            text-align: center;
            height: 30px;
        }
        
        @media print {
            body { -webkit-print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="header">移動式クレーン 作業計画書</div>
    
    <div class="container">
        <!-- 左侧信息表格 -->
        <div>
            <div class="info-section">
                <div class="info-section-title">基本情報</div>
                <table class="info-table">
                    <tr><td class="label">現場名</td><td>${formData.site}</td></tr>
                    <tr><td class="label">所属</td><td>${formData.company}</td></tr>
                    <tr><td class="label">工事番号</td><td>${formData.projectNo || '-'}</td></tr>
                    <tr><td class="label">作業日</td><td>${formData.date}</td></tr>
                    <tr><td class="label">天候</td><td>${formData.weather}</td></tr>
                </table>
            </div>
            
            <div class="info-section">
                <div class="info-section-title">クレーン情報</div>
                <table class="info-table">
                    <tr><td class="label">機種</td><td>${formData.craneModel}</td></tr>
                    <tr><td class="label">車両番号</td><td>${formData.vehicleNo || '-'}</td></tr>
                    <tr><td class="label">最大荷重</td><td>${formData.maxLoad} t</td></tr>
                    <tr><td class="label">作業半径</td><td>${formData.radius} m</td></tr>
                </table>
            </div>
            
            <div class="info-section">
                <div class="info-section-title">人員</div>
                <table class="info-table">
                    <tr><td class="label">運転者</td><td>${formData.operator || '-'}</td></tr>
                    <tr><td class="label">玉掛者</td><td>${formData.rigger || '-'}</td></tr>
                    <tr><td class="label">合図者</td><td>${formData.signaler || '-'}</td></tr>
                    <tr><td class="label">誘導員</td><td>${formData.guide || '-'}</td></tr>
                </table>
            </div>
            
            <div class="info-section">
                <div class="info-section-title">作業内容</div>
                <table class="info-table">
                    <tr><td class="label">午前</td><td>${formData.morning || '-'}</td></tr>
                    <tr><td class="label">午後</td><td>${formData.afternoon || '-'}</td></tr>
                    <tr><td class="label">主要吊荷</td><td>${formData.mainLoad || '-'}</td></tr>
                </table>
            </div>
            
            <div class="info-section">
                <div class="info-section-title">安全条件</div>
                <table class="info-table">
                    <tr><td class="label">風速中止基準</td><td>${formData.windLimit} m/s 以上</td></tr>
                    <tr><td class="label">雨量中止基準</td><td>${formData.rainLimit} mm/h 以上</td></tr>
                    <tr><td class="label">立入禁止区</td><td>${stats.forbiddenCount} 箇所</td></tr>
                    <tr><td class="label">通路</td><td>${stats.pathsCount} 本 (${stats.totalPathLength.toFixed(1)} m)</td></tr>
                    <tr><td class="label">敷鉄板</td><td>${stats.plateCount} 枚</td></tr>
                </table>
            </div>
            
            ${formData.notes ? `
            <div class="info-section">
                <div class="info-section-title">特記事項</div>
                <div style="padding: 4px 6px; font-size: 10px;">${formData.notes}</div>
            </div>
            ` : ''}
            
            <div class="signature-area">
                <table>
                    <tr>
                        <td style="width: 25%;">作成者</td>
                        <td style="width: 25%;"></td>
                        <td style="width: 25%;">承認者</td>
                        <td style="width: 25%;"></td>
                    </tr>
                </table>
            </div>
        </div>
        
        <!-- 右侧图区 -->
        <div class="images-area">
            <div class="image-box large">
                <div class="image-title">透視図</div>
                <div class="image-content">
                    <img src="${screenshots.perspective}">
                </div>
            </div>
            <div class="image-box">
                <div class="image-title">平面図（俯瞰）</div>
                <div class="image-content">
                    <img src="${screenshots.top}">
                </div>
            </div>
            <div class="image-box">
                <div class="image-title">立面図（側面）</div>
                <div class="image-content">
                    <img src="${screenshots.side}">
                </div>
            </div>
        </div>

        <div style="margin-top: 8px; padding: 6px; background: #ffeeee; border: 1px solid #c00; font-size: 9px;">
    ⚠️          注意：本書類の負荷率データは参考用です。
                実際の作業前に、必ず実機の負荷率表で確認してください。
        </div>
    </div>
    
    <script>
        window.onload = () => {
            setTimeout(() => window.print(), 800);
        };
    </script>
</body>
</html>`;
    
    // 4. 在新窗口打开
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
        showToast('ポップアップがブロックされました。ブラウザの設定を確認してください', 'error', 4000);
        return;
    }
    newWindow.document.write(html);
    newWindow.document.close();
}

// 表单数据自动保存
export function saveFormToLocalStorage() {
    const data = collectFormData();
    localStorage.setItem('crane_report_form', JSON.stringify(data));
}

export function loadFormFromLocalStorage() {
    const saved = localStorage.getItem('crane_report_form');
    if (!saved) return;
    
    try {
        const data = JSON.parse(saved);
        Object.keys(data).forEach(key => {
            const el = document.getElementById(`rf-${key}`);
            if (el) el.value = data[key];
        });
    } catch (e) {
        console.error('表单加载失败', e);
    }
}

import { serialize, deserialize } from './persistence.js';

// JSON 导出（包含 3D 场景 + 表单数据）
export function exportProjectJSON() {
    const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        scene: serialize(),
        form: collectFormData()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
        type: 'application/json' 
    });
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const url = URL.createObjectURL(blob);
    link.download = `crane-project-${timestamp}.json`;
    link.href = url;
    link.click();
    // Blob URL はドキュメントが閉じるまで生き続けるため明示的に解放する。
    // click() の処理が終わる猶予を与えてから revoke。
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// JSON 导入
export function importProjectJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // 加载场景
            if (data.scene) {
                deserialize(data.scene);
            }
            
            // 加载表单
            if (data.form) {
                Object.keys(data.form).forEach(key => {
                    const el = document.getElementById(`rf-${key}`);
                    if (el) el.value = data.form[key];
                });
            }
            
            showToast('プロジェクトを読み込みました', 'success');
        } catch (err) {
            showToast('ファイル形式エラー', 'error');
            console.error(err);
        }
    };
    reader.readAsText(file);
}