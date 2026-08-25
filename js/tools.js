import * as THREE from 'three';
import { scene, raycaster, models, applyToonStyle } from './scene.js';
import { state, bumpRevision } from './state.js';
import { getCrane } from './crane-database.js';
import { CSS2DObject } from './scene.js';


// ============= Toast 通知 =============
const TOAST_ICONS = { warning: '⚠️', error: '❌', info: 'ℹ️', success: '✅' };

/**
 * @param {string} message
 * @param {string} type   warning | error | info | success
 * @param {number} duration  ミリ秒。0 なら自動で消えない（操作を促す通知用）
 * @param {{label: string, onClick: Function}} [action]  任意のボタン
 */
export function showToast(message, type = 'info', duration = 2500, action = null) {
    const container = document.getElementById('toast-container');
    if (!container) return null;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    // メッセージにはシーン名など利用者の入力がそのまま渡る。
    // innerHTML で組むと `<img src=x onerror=...>` のような名前で
    // スクリプトが走るため、テキストは textContent で入れる。
    const iconSpan = document.createElement('span');
    iconSpan.textContent = TOAST_ICONS[type] || '';
    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-msg';
    msgSpan.textContent = message;
    toast.append(iconSpan, msgSpan);

    const dismiss = () => {
        if (!toast.isConnected) return;
        toast.classList.add('leaving');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    if (action && action.label) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
            try { action.onClick && action.onClick(); } finally { dismiss(); }
        });
        toast.appendChild(btn);
    }

    container.appendChild(toast);

    // duration 0 は「消さない」。閉じるボタンを付けて操作を待つ。
    if (duration > 0) {
        setTimeout(dismiss, duration);
    } else {
        const close = document.createElement('button');
        close.className = 'toast-action toast-close';
        close.textContent = '✕';
        close.title = '閉じる';
        close.addEventListener('click', dismiss);
        toast.appendChild(close);
    }

    return dismiss;
}


// ============= GPU リソース解放 =============
// scene.remove() だけでは geometry/material は GPU に残る → 明示的に dispose
// （半径円や中心マーカーは頻繁に作り直すため、放置するとメモリリークになる）
//
// ⚠ ただし「自分が所有していない」リソースは触らないこと。
//   クレーンは models.craneTemplate.clone() で作るが、three.js の clone() は
//   geometry を共有する（material も、描線 LineSegments 側は共有のまま）。
//   そのまま dispose するとテンプレート側の GPU バッファまで解放してしまい、
//   次にクレーンを置くたびにメッシュ全体の再アップロードとシェーダ再コンパイルが
//   走っていた。テンプレート由来のリソースには markTemplateOwned() で印を付け、
//   ここでスキップする。
function isTemplateOwned(res) {
    return !!(res && res.userData && res.userData.__templateOwned);
}

export function markTemplateOwned(root) {
    if (!root) return;
    root.traverse(c => {
        if (c.geometry) c.geometry.userData.__templateOwned = true;
        if (c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => { m.userData = m.userData || {}; m.userData.__templateOwned = true; });
        }
    });
}

export function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse(c => {
        if (c.geometry && !isTemplateOwned(c.geometry)) c.geometry.dispose();
        if (c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => { if (!isTemplateOwned(m)) m.dispose(); });
        }
    });
}

// ============= 完整移除一个 placedObject =============
function removeCSSLabel(lbl, parent) {
    if (!lbl) return;
    if (parent && parent.children.includes(lbl)) parent.remove(lbl);
    else scene.remove(lbl);
    if (lbl.element && lbl.element.parentNode) lbl.element.parentNode.removeChild(lbl.element);
}

export function removeObjectFully(obj) {
    if (!obj) return;

    if (obj.userData.border) {
        scene.remove(obj.userData.border);
        disposeObject3D(obj.userData.border);
    }
    if (obj.userData.radiusCircle) {
        scene.remove(obj.userData.radiusCircle);
        disposeObject3D(obj.userData.radiusCircle);
        obj.userData.radiusCircle = null;
    }
    if (obj.userData.centerMarker) {
        scene.remove(obj.userData.centerMarker);
        disposeObject3D(obj.userData.centerMarker);
        obj.userData.centerMarker = null;
    }
    if (obj.userData.arrows) {
        obj.userData.arrows.forEach(a => { scene.remove(a); disposeObject3D(a); });
    }
    if (obj.userData.balls) {
        obj.userData.balls.forEach(b => { scene.remove(b); disposeObject3D(b); });
    }
    // loadPick/loadDrop: label is a child of obj
    removeCSSLabel(obj.userData.textLabel, obj);
    // measure: label stored as userData.label, added directly to scene
    removeCSSLabel(obj.userData.label, null);

    scene.remove(obj);
    disposeObject3D(obj);
    const idx = state.placedObjects.indexOf(obj);
    if (idx > -1) state.placedObjects.splice(idx, 1);
    bumpRevision();
}


// ============= 工具切换 =============
export function selectTool(toolName) {
    // ⭐ 已有吊车时禁用 crane 工具
    if (toolName === 'crane' && state.placedObjects.some(o => o.userData.type === 'crane')) {
        showToast('クレーンは 1 台のみ配置可能です', 'warning');
        return;
    }

    state.currentTool = toolName;

    document.querySelectorAll('.tool-btn').forEach(b => {
        b.classList.remove('active');
    });
    document.querySelector(`[data-tool="${toolName}"]`).classList.add('active');

    updateGhost();
    
    document.getElementById('plate-options').classList.toggle('hidden', toolName !== 'plate');
    
    // ⭐ 切换工具时取消正在画的（プレビューは dispose まで行う）
    if (state.drawingPoints.length > 0 || state.drawingPreview) {
        state.drawingPoints = [];
        if (state.drawingPreview) {
            scene.remove(state.drawingPreview);
            disposeObject3D(state.drawingPreview);
            state.drawingPreview = null;
        }
    }
    
    // ⭐ 显示提示
    const hint = document.getElementById('drawing-hint');
    if (toolName === 'forbidden') {
        document.getElementById('hint-text').textContent = '🚫 地面をクリックして禁止区の角を指定 (3 点以上 + Enter で確定)';
        hint.classList.remove('hidden');
    } else if (toolName === 'path') {
        document.getElementById('hint-text').textContent = '🟢 地面をクリックして通路の点を追加 (Enter で確定)';
        hint.classList.remove('hidden');
    } else if (toolName === 'measure') {
        document.getElementById('hint-text').textContent = '📏 2 点をクリックして距離を測定';
        hint.classList.remove('hidden');
    } else {
        hint.classList.add('hidden');
    }
}

// ============= Ghost =============
export function updateGhost() {
    if (state.ghost) {
        scene.remove(state.ghost);
        state.ghost = null;
    }

    let geometry, material;

    switch (state.currentTool) {
        case 'crane':
            geometry = new THREE.CylinderGeometry(0.5, 0.7, 1.5);
            material = new THREE.MeshStandardMaterial({ 
                color: 0xffc800, transparent: true, opacity: 0.5 
            });
            break;

        case 'loadPick':  // ⭐ 新
            geometry = new THREE.BoxGeometry(1, 1, 1);
            material = new THREE.MeshStandardMaterial({ 
                color: 0x00aa00, transparent: true, opacity: 0.5 
            });
            break;

        case 'loadDrop':  // ⭐ 新
            geometry = new THREE.BoxGeometry(1, 1, 1);
            material = new THREE.MeshStandardMaterial({ 
                color: 0xcc0000, transparent: true, opacity: 0.5 
            });
            break;


        case 'plate':
            geometry = new THREE.BoxGeometry(
                state.currentPlateSize.x, 0.1, state.currentPlateSize.z
            );
            material = new THREE.MeshStandardMaterial({ 
                color: 0xffd700, transparent: true, opacity: 0.5 
            });
            break;
        // 選択・作図系ツールはゴーストを持たない。
        // 以前は default に落ちて new THREE.Mesh(undefined, undefined) が
        // 作られ、ツールを切り替えるたびに空のメッシュがシーンに溜まっていた。
        default:
            return;
    }

    state.ghost = new THREE.Mesh(geometry, material);
    scene.add(state.ghost);
}

// ============= 放置函数 =============

export function placeCrane(point) {
    const existingCrane = state.placedObjects.find(o => o.userData.type === 'crane');
    if (existingCrane) {
        showToast('クレーンは 1 台のみ配置可能です', 'warning');
        return;
    }

    if (!models.craneTemplate) {
        console.log('吊车模型还没加载完，请稍等');
        return;
    }
    
    // 获取吊车数据
    const craneData = getCrane(state.currentCraneId);
    if (!craneData) {
        showToast('クレーンデータが存在しません', 'error');
        return;
    }
    
    // clone() は geometry を共有するため、テンプレート由来のリソースに
    // 所有印を付けてからクローンする（印は geometry / material オブジェクト
    // 自体に付くので、共有しているクローン側からも見える）。
    // scene.js からではなくここで行うのは循環 import を避けるため。
    if (!models.craneTemplate.userData.__ownershipMarked) {
        markTemplateOwned(models.craneTemplate);
        models.craneTemplate.userData.__ownershipMarked = true;
    }

    const crane = models.craneTemplate.clone();
    crane.position.copy(point);
    crane.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            if (child.material) {
                // インスタンス固有の material（ハイライトで色を書き換えるため）。
                // clone() は userData も複製するのでテンプレート印を外し、
                // このクローンを自分の所有物として dispose 対象に戻す。
                child.material = child.material.clone();
                child.material.userData = { ...child.material.userData };
                delete child.material.userData.__templateOwned;
            }
        }
    });

    // ⭐ userData 包含完整信息
    crane.userData = {
        type: 'crane',
        craneId: state.currentCraneId,
        craneData: craneData,
        workRadius: 10,
        outriggerMode: state.currentOutriggerMode,
        boomLength: state.currentBoomLength,
        centerOffset: craneData.centerPoint
    };
    
    scene.add(crane);
    state.placedObjects.push(crane);

    // ⭐ 加中心点标记（crane を渡すとメッシュ上面に乗る）
    crane.updateMatrixWorld(true);   // raycast 前に world matrix を確定
    const centerMarker = createCenterMarker(point, crane);
    scene.add(centerMarker);
    crane.userData.centerMarker = centerMarker;
    
    // 半径圆（基于中心点）
    const radiusCircle = createTerrainFollowingCircle(point, 10);
    scene.add(radiusCircle);
    crane.userData.radiusCircle = radiusCircle;
    
    updateCounters();
    updateCraneButton();
    bumpRevision();

    // ⭐ 放置后自动切到选择模式 + 去掉 ghost
    selectTool('select');
}

// 指定 (x, z) におけるクレーン本体メッシュの最上面 Y を取得。
// 真上から下向きにレイを撃って、当たれば Y を返す。当たらなければ null。
function findCraneTopY(craneRoot, x, z) {
    if (!craneRoot) return null;
    const meshes = [];
    craneRoot.traverse(c => { if (c.isMesh) meshes.push(c); });
    if (meshes.length === 0) return null;

    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObjects(meshes, false);
    return hits.length > 0 ? hits[0].point.y : null;
}

// ⭐ 中心点マーカー作成。クレーン躯体が与えられたらメッシュ上面に乗せる、
//   なければ地面 +0.1。Y のみ動的に計算する点に注意。
function createCenterMarker(position, craneRoot) {
    const group = new THREE.Group();

    // 红色十字（2 条线）—— 关掉深度测试，避免被吊车实体遮住
    const lineMat = new THREE.LineBasicMaterial({
        color: 0xff0000,
        linewidth: 2,
        depthTest: false,
        transparent: true
    });

    const size = 0.5;

    const xGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size, 0, 0),
        new THREE.Vector3(size, 0, 0)
    ]);
    const xLine = new THREE.Line(xGeom, lineMat);
    xLine.renderOrder = 999;
    group.add(xLine);

    const zGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -size),
        new THREE.Vector3(0, 0, size)
    ]);
    const zLine = new THREE.Line(zGeom, lineMat);
    zLine.renderOrder = 999;
    group.add(zLine);

    const sphereGeom = new THREE.SphereGeometry(0.1);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        depthTest: false,
        transparent: true
    });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.renderOrder = 999;
    group.add(sphere);

    // 配置：X/Z は wrapper 原点、Y はクレーン上面（無ければ地面 +0.1）
    group.position.x = position.x;
    group.position.z = position.z;
    const topY = findCraneTopY(craneRoot, position.x, position.z);
    group.position.y = (topY !== null) ? topY + 0.05 : position.y + 0.1;

    group.visible = state.showCenterPoints;

    return group;
}

// ⭐ 计算吊车的世界坐标中心
export function getCraneCenter(crane) {
    const offset = crane.userData.centerOffset || { offsetX: 0, offsetZ: 0 };
    return new THREE.Vector3(
        crane.position.x + offset.offsetX,
        crane.position.y,
        crane.position.z + offset.offsetZ
    );
}

// 起吊位置（绿色）
export function placeLoadPick(point) {
    const load = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x00aa00 })  // 绿色
    );
    load.position.copy(point);
    load.position.y += 0.5;
    load.castShadow = true;
    load.userData = { 
        type: 'loadPick',
        label: '起吊'
    };
    scene.add(load);
    state.placedObjects.push(load);
    
    // 加文字标签
    addLoadLabel(load, '🟢 起吊');

    updateCounters();
    bumpRevision();
}

// 卸荷位置（红色）
export function placeLoadDrop(point) {
    const load = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xcc0000 })  // 红色
    );
    load.position.copy(point);
    load.position.y += 0.5;
    load.castShadow = true;
    load.userData = { 
        type: 'loadDrop',
        label: '卸荷'
    };
    scene.add(load);
    state.placedObjects.push(load);
    
    addLoadLabel(load, '🔴 卸荷');

    updateCounters();
    bumpRevision();
}

// 加文字标签（用之前的 CSS2DObject）
function addLoadLabel(loadObj, text) {
    const labelDiv = document.createElement('div');
    labelDiv.style.background = 'rgba(0, 0, 0, 0.7)';
    labelDiv.style.color = 'white';
    labelDiv.style.padding = '2px 8px';
    labelDiv.style.borderRadius = '4px';
    labelDiv.style.fontSize = '12px';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.style.pointerEvents = 'none';
    labelDiv.textContent = text;
    
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, 1.2, 0);  // 在方块上方
    loadObj.add(label);
    loadObj.userData.textLabel = label;
}




export function placePlate(point) {
    const { x: sx, z: sz } = state.currentPlateSize;

    const plate = new THREE.Mesh(
        new THREE.BoxGeometry(sx, 0.1, sz),
        new THREE.MeshStandardMaterial({ color: 0xffd700 })
    );
    plate.position.copy(point);
    plate.position.x = snapToGrid(plate.position.x);
    plate.position.z = snapToGrid(plate.position.z);
    plate.position.y += 0.05;

    plate.receiveShadow = true;
    plate.userData = { type: 'plate', size: { x: sx, z: sz } };
    applyToonStyle(plate);
    scene.add(plate);
    state.placedObjects.push(plate);
    updateCounters();
    bumpRevision();
}

// ============= 选择 / 高亮 =============
// 単一クリック選択：交点があれば setSelection、なければクリア
export function handleSelect() {
    const intersects = raycaster.intersectObjects(state.placedObjects, true);

    if (intersects.length === 0) {
        setSelection([]);
        return;
    }

    const root = findRootObject(intersects[0].object);
    if (!root) {
        setSelection([]);
        return;
    }

    // 敷鉄板がグループに属するなら、グループ全員を選択
    setSelection(expandToGroup(root), root);
}

// Ctrl+左クリックで任意のオブジェクトを選択に追加 / 解除（グループ単位）
export function toggleSelection(obj) {
    if (!obj) return;

    const current = state.selectedObjects.slice();
    const expanded = expandToGroup(obj);
    const alreadyIn = expanded.some(o => current.includes(o));

    if (alreadyIn) {
        const remaining = current.filter(o => !expanded.includes(o));
        setSelection(remaining, remaining[0] || null);
    } else {
        const merged = [...current, ...expanded];
        const unique = [...new Set(merged)];
        setSelection(unique, obj);
    }
}

// groupId を持つオブジェクトは、同 ID の全メンバーを返す（型不問）
export function expandToGroup(obj) {
    if (obj.userData.groupId) {
        return state.placedObjects.filter(o => o.userData.groupId === obj.userData.groupId);
    }
    return [obj];
}

// 全選択を入れ替え（旧ハイライト消去 → 新ハイライト + UI 更新）
export function setSelection(objects, primary = null) {
    state.selectedObjects.forEach(o => clearHighlight(o));

    state.selectedObjects = objects.slice();
    state.selectedObject = primary || objects[0] || null;

    state.selectedObjects.forEach(o => applyHighlight(o));

    showInfo(state.selectedObject);
    updateCraneControlPanel();
}

function updateCraneControlPanel() {
    const ctrl = document.getElementById('crane-control');
    const obj = state.selectedObject;
    const isSingleCrane =
        obj && obj.userData.type === 'crane' && state.selectedObjects.length === 1;

    if (isSingleCrane) {
        ctrl.classList.remove('hidden');
        const r = obj.userData.workRadius || 10;
        document.getElementById('radius-slider').value = r;
        document.getElementById('radius-value').textContent = r.toFixed(1);
        // スライダーは min=0 / max=360。剰余だけだと反時計回りで負になり、
        // スライダー側は 0 にクランプされる一方で数値表示は -45 のままになり、
        // 表示と実物がずれた上、次に触った瞬間クレーンが飛んでいた。
        // [0, 360) に正規化する。
        const rot = ((obj.rotation.y * 180 / Math.PI) % 360 + 360) % 360;
        document.getElementById('rotation-slider').value = rot;
        document.getElementById('rotation-value').textContent = rot.toFixed(0);
    } else {
        ctrl.classList.add('hidden');
    }
}

// グループ ID 発行
let _nextGroupSeq = 1;
function generateGroupId() {
    return `g_${Date.now()}_${_nextGroupSeq++}`;
}

// 現在の選択にある全オブジェクトを 1 つのグループにまとめる（2 個以上のとき）
// 既に同一グループの場合は何もしない（false を返す）
export function formGroupFromSelection() {
    const sel = state.selectedObjects;
    if (sel.length < 2) return false;

    const ids = new Set(sel.map(o => o.userData.groupId));
    if (ids.size === 1 && !ids.has(undefined)) return false;   // 既に同一グループ

    const gid = generateGroupId();
    sel.forEach(o => { o.userData.groupId = gid; });
    return true;
}

// 選択中のオブジェクトから groupId を外す
export function ungroupSelection() {
    let changed = false;
    state.selectedObjects.forEach(o => {
        if (o.userData.groupId) {
            delete o.userData.groupId;
            changed = true;
        }
    });
    return changed;
}

// 選択を回転：単体は自身周り、複数は選択全体の重心を 1 点として剛体回転
//   - グループ化後は同じ centroid を毎回再計算するため自然に「1 つの中心点」周り
//   - クレーンは moveCrane 経由で中心マーカー・作業半径円も同期させる
//   - 位置の回転方向を three.js の rotation.y（+X → -Z）と一致させる：
//       x' = cx + dx·cosθ + dz·sinθ
//       z' = cz − dx·sinθ + dz·cosθ
export function rotateSelection(angleRad) {
    const sel = state.selectedObjects;
    if (sel.length === 0) return;
    bumpRevision();

    if (sel.length === 1) {
        sel[0].rotation.y += angleRad;
        return;
    }

    let cx = 0, cz = 0;
    sel.forEach(o => { cx += o.position.x; cz += o.position.z; });
    cx /= sel.length;
    cz /= sel.length;

    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    sel.forEach(o => {
        const dx = o.position.x - cx;
        const dz = o.position.z - cz;
        const newX = cx + dx * cos + dz * sin;
        const newZ = cz - dx * sin + dz * cos;

        translatePlaced(o, newX - o.position.x, newZ - o.position.z);
        o.rotation.y += angleRad;
    });
}

export function findRootObject(mesh) {
    let obj = mesh;
    while (obj) {
        if (state.placedObjects.includes(obj)) {
            return obj;
        }
        obj = obj.parent;
    }
    return null;
}

// ハイライト適用：emissive 対応マテリアルは emissive を青で発光、
// 非対応 (MeshBasicMaterial / LineBasicMaterial 等) はベースカラーを橙黄に変える。
const HIGHLIGHT_EMISSIVE = 0x0044ff;
const HIGHLIGHT_BASE_COLOR = 0xffaa00;

function _highlightOne(node) {
    if (!node.material) return;
    const mat = node.material;
    if (mat.emissive) {
        if (node.userData._origEmissive === undefined) {
            node.userData._origEmissive = mat.emissive.getHex();
        }
        mat.emissive.setHex(HIGHLIGHT_EMISSIVE);
    } else if (mat.color) {
        if (node.userData._origColor === undefined) {
            node.userData._origColor = mat.color.getHex();
        }
        mat.color.setHex(HIGHLIGHT_BASE_COLOR);
    }
}

function _restoreOne(node) {
    if (!node.material) return;
    const mat = node.material;
    if (node.userData._origEmissive !== undefined && mat.emissive) {
        mat.emissive.setHex(node.userData._origEmissive);
        delete node.userData._origEmissive;
    }
    if (node.userData._origColor !== undefined && mat.color) {
        mat.color.setHex(node.userData._origColor);
        delete node.userData._origColor;
    }
}

export function applyHighlight(obj) {
    obj.traverse(child => {
        if (child.isMesh || child.isLine || child.isLineSegments || child.isLineLoop) {
            _highlightOne(child);
        }
    });
    // userData に付随する線・矢印もハイライト（scene 直下にあるため traverse では拾えない）
    if (obj.userData.border) obj.userData.border.traverse(_highlightOne);
    if (obj.userData.arrows) obj.userData.arrows.forEach(a => a.traverse(_highlightOne));
}

export function clearHighlight(obj) {
    obj.traverse(child => {
        if (child.isMesh || child.isLine || child.isLineSegments || child.isLineLoop) {
            _restoreOne(child);
        }
    });
    if (obj.userData.border) obj.userData.border.traverse(_restoreOne);
    if (obj.userData.arrows) obj.userData.arrows.forEach(a => a.traverse(_restoreOne));
}

// ============= UI 更新 =============
// showInfo は moveCrane 経由でドラッグ中は毎フレーム呼ばれる。
// 以前は毎回 innerHTML を組み直しており、ドラッグのあいだ 60fps で
// パネル全体の再パース＋レイアウトが走っていた。
// 同じオブジェクト・同じ選択状態なら、変化する座標行だけ textContent で
// 差し替える。
const _infoCache = { obj: null, selCount: -1, grouped: null, posEl: null };

export function showInfo(obj) {
    const panel = document.getElementById('info-panel');
    const content = document.getElementById('info-content');
    if (!panel || !content) return;

    if (!obj) {
        panel.classList.add('hidden');
        _infoCache.obj = null;
        _infoCache.posEl = null;
        return;
    }

    const selCount = state.selectedObjects.length;
    const grouped = !!obj.userData.groupId;

    // 構造が同じなら座標だけ更新して終わり（ドラッグ中の高頻度パス）
    if (_infoCache.obj === obj &&
        _infoCache.selCount === selCount &&
        _infoCache.grouped === grouped &&
        _infoCache.posEl && _infoCache.posEl.isConnected) {
        _infoCache.posEl.textContent =
            `位置: X=${obj.position.x.toFixed(1)}, Z=${obj.position.z.toFixed(1)}`;
        return;
    }

    const typeNames = {
        crane: '🏗️ クレーン',
        loadPick: '🟢 起吊',
        loadDrop: '🔴 卸荷',
        plate: '🟨 敷鉄板'
    };

    const multiInfo = selCount > 1
        ? `<div class="text-xs text-yellow-300 mt-1">${selCount} 個を選択中${grouped ? '（グループ）' : ''}</div>`
        : (grouped ? `<div class="text-xs text-yellow-300 mt-1">グループ所属</div>` : '');

    content.innerHTML = `
        <div>種類: ${typeNames[obj.userData.type] || obj.userData.type}</div>
        <div data-info-pos>位置: X=${obj.position.x.toFixed(1)}, Z=${obj.position.z.toFixed(1)}</div>
        ${multiInfo}
        <div class="text-xs text-slate-400 mt-2">Ctrl+クリックで多選 / 右クリックでメニュー</div>
    `;
    panel.classList.remove('hidden');

    _infoCache.obj = obj;
    _infoCache.selCount = selCount;
    _infoCache.grouped = grouped;
    _infoCache.posEl = content.querySelector('[data-info-pos]');
}

export function updateCounters() {
    const types = ['crane', 'loadPick', 'loadDrop', 'plate', 'forbidden', 'path'];
    types.forEach(type => {
        const count = state.placedObjects.filter(o => o.userData.type === type).length;
        const el = document.getElementById(`count-${type}`);
        if (el) el.textContent = count;
    });
}


export function updateCraneButton() {
    const btn = document.querySelector('[data-tool="crane"]');
    const hasCrane = state.placedObjects.some(o => o.userData.type === 'crane');
    
    if (hasCrane) {
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.title = 'クレーンは 1 台まで';
    } else {
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        btn.title = '';
    }
}

export function updateCraneRadius(crane, radiusMeters) {
    crane.userData.workRadius = radiusMeters;
    bumpRevision();
    if (crane.userData.radiusCircle) {
        rebuildCraneRadiusCircle(crane);
    } else {
        // 初回（placeCrane 直後）はまだ円が無い場合があるので作る
        const newCircle = createTerrainFollowingCircle(crane.position, radiusMeters);
        scene.add(newCircle);
        crane.userData.radiusCircle = newCircle;
    }
}

// ============= 統一移動 API =============
// 任意の placedObject を (dx, dz) だけ平行移動。クレーンは付属物
// （中心マーカー・作業半径円）の同期も含む。型ディスパッチを 1 か所に集約。
export function translatePlaced(obj, dx, dz, opts = {}) {
    if (dx !== 0 || dz !== 0) bumpRevision();
    if (obj.userData.type === 'crane') {
        moveCrane(obj, dx, dz, opts);
    } else {
        obj.position.x += dx;
        obj.position.z += dz;
    }
}

// 移動完了時（ドラッグ松手・smoothing 収束・コミットなど）に呼ぶ。
// クレーンだけ地形 Y 再サンプリング + 半径円の精確再構築が要る。
export function finalizePlacedMove(obj) {
    if (obj.userData.type === 'crane') {
        rebuildCraneRadiusCircle(obj);
    }
}

// 平移选中的吊车（同步移动中心点 + 重建作业半径圆）
// opts.light=true: ドラッグ中の毎フレーム呼び出し用。
//   半径円（96 セグメント TubeGeometry + 96 回の地形 raycast）を再生成せず、
//   平行移動するだけで済ませる。重い処理を毎フレームから排除。
//   ドラッグ確定 (mouseup / commit) 後に rebuildCraneRadiusCircle で精確に作り直す。
export function moveCrane(crane, dx, dz, opts = {}) {
    crane.position.x += dx;
    crane.position.z += dz;

    if (crane.userData.centerMarker) {
        crane.userData.centerMarker.position.x += dx;
        crane.userData.centerMarker.position.z += dz;
    }

    if (crane.userData.radiusCircle) {
        if (opts.light) {
            crane.userData.radiusCircle.position.x += dx;
            crane.userData.radiusCircle.position.z += dz;
        } else {
            // 非 light：地形 Y も含めて完全に作り直す
            rebuildCraneRadiusCircle(crane);
        }
    }

    showInfo(crane);
}

// 指定 (x,z) の地面 Y を 1 本の下向きレイで取得。site が未読込なら null。
function sampleGroundY(x, z) {
    if (!models.siteModel) return null;
    const siteMeshes = [];
    models.siteModel.traverse(c => { if (c.isMesh) siteMeshes.push(c); });
    if (siteMeshes.length === 0) return null;

    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObjects(siteMeshes, true);
    return hits.length > 0 ? hits[0].point.y : null;
}

// 拖動収束/松手时调用：light モードで累積した tube.position オフセットを精算 +
// 地形 Y 再サンプリングで吊車本体・中心マーカー・半径円すべてを地面に再フィット。
export function rebuildCraneRadiusCircle(crane) {
    // 地形 Y を採り直して、吊車と中心マーカーも一緒に持ち上げる/沈める
    const groundY = sampleGroundY(crane.position.x, crane.position.z);
    if (groundY !== null) {
        crane.position.y = groundY;
        if (crane.userData.centerMarker) {
            // Y はクレーン本体メッシュ上面に合わせる（無ければ地面 +0.1）
            crane.updateMatrixWorld(true);
            const topY = findCraneTopY(crane, crane.position.x, crane.position.z);
            crane.userData.centerMarker.position.y =
                (topY !== null) ? topY + 0.05 : groundY + 0.1;
        }
    }

    if (!crane.userData.radiusCircle) return;

    const old = crane.userData.radiusCircle;
    scene.remove(old);
    disposeObject3D(old);   // ⭐ GPU リソース解放
    const newCircle = createTerrainFollowingCircle(
        crane.position,
        crane.userData.workRadius || 10
    );
    scene.add(newCircle);
    crane.userData.radiusCircle = newCircle;
}

// 绕中心采样一圈点，每点向下射线打地形拿到真实 Y，
// 连成一个细圆管，作业半径圆就会贴着地形起伏
export function createTerrainFollowingCircle(center, radiusMeters, segments = 96) {
    const siteMeshes = [];
    if (models.siteModel) {
        models.siteModel.traverse(c => { if (c.isMesh) siteMeshes.push(c); });
    }

    const localRay = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const points = [];

    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const x = center.x + Math.cos(a) * radiusMeters;
        const z = center.z + Math.sin(a) * radiusMeters;

        let y = center.y;
        if (siteMeshes.length > 0) {
            localRay.set(new THREE.Vector3(x, 500, z), down);
            const hits = localRay.intersectObjects(siteMeshes, true);
            if (hits.length > 0) y = hits[0].point.y;
        }
        points.push(new THREE.Vector3(x, y + 0.06, z));   // 略抬一点防 z-fighting
    }

    const curve = new THREE.CatmullRomCurve3(points, true);   // closed
    const tubeGeom = new THREE.TubeGeometry(curve, segments * 2, 0.12, 8, true);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthTest: true
    });
    const tube = new THREE.Mesh(tubeGeom, mat);
    tube.userData.isRadiusCircle = true;
    return tube;
}

// ============= 工具函数 =============
export function snapToGrid(value, gridSize = 0.5) {
    return Math.round(value / gridSize) * gridSize;
}