/**
 * クレーン中心キャリブレーション（独立ツール）
 *
 * 役割：crane_25T.glb の旋回中心 (=ブーム下) を視覚的に決め、
 *       localStorage キー "crane_pivot_offset" に {x, z} を保存する。
 *       メインアプリ (scene.js) が次回ロード時にこの値を読む。
 *
 * 編集モデル：
 *   - クリック → プレビュー（赤マーカー移動、未保存状態）
 *   - 「保存」ボタン → localStorage コミット
 *   - 「既定値に戻す」→ プレビュー & 保存値を BB 既定値に戻し localStorage 削除
 *
 * ビュー：上面正交 ⇄ 3D ペルスペクティブ、ツールバーで切替
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// メインアプリと共通のキー（scene.js の CALIBRATION_STORAGE_KEY と一致）
const STORAGE_KEY = 'crane_pivot_offset';

// BB 既定比率（scene.js のデフォルトと一致）
const DEFAULT_X_RATIO = 0.33;
const DEFAULT_Z_RATIO = 0.5;

// ============= シーン =============
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c1c1c);

// ----- 2 つのカメラを同時保持し、切替で差し替える -----
const orthoHalfHeightInitial = 9;
const aspect0 = window.innerWidth / window.innerHeight;

const orthoCamera = new THREE.OrthographicCamera(
    -orthoHalfHeightInitial * aspect0,  orthoHalfHeightInitial * aspect0,
     orthoHalfHeightInitial,           -orthoHalfHeightInitial,
    0.1, 500
);
orthoCamera.position.set(0, 50, 0);
orthoCamera.up.set(0, 0, -1);       // +Z を画面下方向に → +X 右
orthoCamera.lookAt(0, 0, 0);

const perspCamera = new THREE.PerspectiveCamera(50, aspect0, 0.1, 500);
perspCamera.position.set(14, 11, 14);
perspCamera.up.set(0, 1, 0);
perspCamera.lookAt(0, 1, 0);

let activeCamera = orthoCamera;
let viewMode = 'top';   // 'top' or '3d'

// ============= レンダラ =============
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// ============= OrbitControls（カメラ切替で作り直す） =============
let controls = makeControls(activeCamera, viewMode);

function makeControls(camera, mode) {
    const c = new OrbitControls(camera, renderer.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.target.set(0, 0, 0);

    if (mode === 'top') {
        // 上面ビュー：回転禁止、左ボタンはクリック判定に使うので無効化
        c.enableRotate = false;
        c.mouseButtons = {
            LEFT:   null,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT:  THREE.MOUSE.PAN
        };
    } else {
        // 3D ビュー：左ドラッグで回転 + クリック(=ドラッグなし)で中心設定
        c.enableRotate = true;
        c.mouseButtons = {
            LEFT:   THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT:  THREE.MOUSE.PAN
        };
    }
    c.update();
    return c;
}

function switchView(mode) {
    if (mode === viewMode) return;
    viewMode = mode;
    activeCamera = (mode === 'top') ? orthoCamera : perspCamera;
    // controls は新しいカメラに付け替え
    controls.dispose();
    controls = makeControls(activeCamera, mode);
    // 既知の BB 中心へ target を寄せ直す
    if (sceneCenter) controls.target.set(sceneCenter.x, 0, sceneCenter.z);
    controls.update();

    // ボタンの active state
    document.getElementById('view-top-btn').classList.toggle('active', mode === 'top');
    document.getElementById('view-3d-btn').classList.toggle('active', mode === '3d');
}

// ============= 光源 =============
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
dirLight.position.set(8, 20, 5);
scene.add(dirLight);

// ============= 参照物 =============
const grid = new THREE.GridHelper(40, 40, 0x555555, 0x303030);
grid.position.y = -0.001;
scene.add(grid);

// GLB 原点を示す小さな青ドット
{
    const originSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.12),
        new THREE.MeshBasicMaterial({ color: 0x5a8cff, depthTest: false })
    );
    originSphere.renderOrder = 998;
    originSphere.position.y = 0.05;
    scene.add(originSphere);
}

// クリック用の不可視地面（Y=0、両ビューで raycast）
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshBasicMaterial({ visible: false })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ============= 現在/保存 pivot =============
const currentPivot = { x: 0, z: 0 };   // プレビュー（マーカー位置）
const savedPivot   = { x: 0, z: 0 };   // 最後に localStorage へ書いた値
let defaultPivot   = { x: 0, z: 0 };
let sceneCenter    = null;
let glbLoaded      = false;
let isDirty        = false;

// ============= マーカー =============
function makeCrossMarker(color, size, yOffset) {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({
        color, depthTest: false, transparent: true
    });

    const xGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size, 0, 0),
        new THREE.Vector3( size, 0, 0)
    ]);
    const zGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -size),
        new THREE.Vector3(0, 0,  size)
    ]);
    const xLine = new THREE.Line(xGeom, mat); xLine.renderOrder = 999;
    const zLine = new THREE.Line(zGeom, mat); zLine.renderOrder = 999;
    g.add(xLine, zLine);

    const dot = new THREE.Mesh(
        new THREE.SphereGeometry(size * 0.18),
        new THREE.MeshBasicMaterial({ color, depthTest: false })
    );
    dot.renderOrder = 999;
    g.add(dot);

    g.position.y = yOffset;
    return g;
}

// 灰色：BB 既定値（参考表示）
const defaultMarker = makeCrossMarker(0x888888, 0.5, 0);
scene.add(defaultMarker);

// 赤：現在のプレビュー
const currentMarker = makeCrossMarker(0xff3344, 0.7, 0);
scene.add(currentMarker);

// 上から下向きにレイを撃ってクレーン表面の Y を取得（無ければ地面=0）
function findCraneTopY(x, z) {
    if (!craneRoot) return 0;
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(craneRoot, true);
    return hits.length > 0 ? hits[0].point.y : 0;
}

// ============= localStorage =============
function loadStored() {
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        if (!s) return null;
        const v = JSON.parse(s);
        return (typeof v.x === 'number' && typeof v.z === 'number') ? v : null;
    } catch { return null; }
}

function writeStored(x, z) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, z }));
        console.log(`💾 保存: pivot=(${x.toFixed(2)}, ${z.toFixed(2)}) → ${location.origin} の localStorage`);
    } catch (e) { console.error('保存失败:', e); }
}

function removeStored() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ============= GLB 読込 =============
const loader = new GLTFLoader();
let craneRoot = null;   // クリック判定対象（クレーン躯体）

loader.load('./models/crane_25T.glb', (gltf) => {
    const root = gltf.scene;
    craneRoot = root;
    scene.add(root);

    const box = new THREE.Box3().setFromObject(root);
    defaultPivot = {
        x: box.min.x + (box.max.x - box.min.x) * DEFAULT_X_RATIO,
        z: box.min.z + (box.max.z - box.min.z) * DEFAULT_Z_RATIO
    };

    // 初期値：localStorage 優先、無ければ既定値
    const stored = loadStored();
    if (stored) {
        savedPivot.x = stored.x; savedPivot.z = stored.z;
    } else {
        savedPivot.x = defaultPivot.x; savedPivot.z = defaultPivot.z;
    }
    currentPivot.x = savedPivot.x;
    currentPivot.z = savedPivot.z;
    // craneRoot 設定後に表面 Y を採れるので updateMarker は GLB を scene に
    // 追加してから呼ぶ（craneRoot もこの時点で代入済み）
    updateCurrentMarker();
    updateDefaultMarker();
    refreshDirtyState();
    refreshValues();

    // カメラを BB に合わせる
    sceneCenter = box.getCenter(new THREE.Vector3());
    const bbSize = box.getSize(new THREE.Vector3());
    const maxBB = Math.max(bbSize.x, bbSize.z);
    const desiredHalf = Math.max(8, maxBB * 0.75);
    setOrthoHalfHeight(desiredHalf);
    controls.target.set(sceneCenter.x, 0, sceneCenter.z);
    controls.update();

    glbLoaded = true;
    document.getElementById('loading').style.display = 'none';
}, undefined, (err) => {
    console.error('GLB load error:', err);
    document.getElementById('loading').textContent = 'GLB の読込に失敗しました';
});

function updateCurrentMarker() {
    currentMarker.position.x = currentPivot.x;
    currentMarker.position.z = currentPivot.z;
    // クレーン表面の Y を取って、マーカーをその上面に乗せる
    currentMarker.position.y = findCraneTopY(currentPivot.x, currentPivot.z) + 0.05;
}

function updateDefaultMarker() {
    defaultMarker.position.x = defaultPivot.x;
    defaultMarker.position.z = defaultPivot.z;
    defaultMarker.position.y = findCraneTopY(defaultPivot.x, defaultPivot.z) + 0.03;
}

function setOrthoHalfHeight(halfH) {
    const a = window.innerWidth / window.innerHeight;
    orthoCamera.left   = -halfH * a;
    orthoCamera.right  =  halfH * a;
    orthoCamera.top    =  halfH;
    orthoCamera.bottom = -halfH;
    orthoCamera.updateProjectionMatrix();
}

// ============= クリックで pivot プレビュー =============
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let mouseDownPos = null;
renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouseDownPos = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !mouseDownPos || !glbLoaded) return;
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    mouseDownPos = null;
    // ドラッグ（回転/パン）は無視。閾値は 3D 回転と誤判定しないよう少し広めに
    if (Math.hypot(dx, dy) > 4) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, activeCamera);
    // クレーン躯体 → 地面の順で優先判定（3D 視点でクレーン上をクリック→
    // 真下の X/Z が取れる）。intersectObjects は距離順ソートされるので
    // 結局カメラに近い方が hits[0]。クレーンが手前にあれば躯体ヒット。
    const targets = craneRoot ? [craneRoot, ground] : [ground];
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) return;

    currentPivot.x = hits[0].point.x;
    currentPivot.z = hits[0].point.z;
    updateCurrentMarker();
    refreshDirtyState();
    refreshValues();
});

// ============= 状態表示 =============
function refreshValues() {
    document.getElementById('val-x').textContent = currentPivot.x.toFixed(2);
    document.getElementById('val-z').textContent = currentPivot.z.toFixed(2);
}

function refreshDirtyState() {
    isDirty = (
        Math.abs(currentPivot.x - savedPivot.x) > 1e-6 ||
        Math.abs(currentPivot.z - savedPivot.z) > 1e-6
    );
    const tag = document.getElementById('saved-tag');
    const saveBtn = document.getElementById('save-btn');
    if (isDirty) {
        tag.classList.add('unsaved');
        tag.textContent = '● 未保存';
        saveBtn.classList.add('dirty');
    } else {
        tag.classList.remove('unsaved');
        tag.textContent = '✓ 保存済み';
        saveBtn.classList.remove('dirty');
    }
}

function flashSavedTag() {
    const tag = document.getElementById('saved-tag');
    if (!tag) return;
    tag.classList.add('flash');
    setTimeout(() => tag.classList.remove('flash'), 300);
}

// ============= ボタン =============
document.getElementById('save-btn').addEventListener('click', commitSave);
document.getElementById('reset-btn').addEventListener('click', () => {
    if (!glbLoaded) return;
    removeStored();
    savedPivot.x  = defaultPivot.x;  savedPivot.z  = defaultPivot.z;
    currentPivot.x = defaultPivot.x; currentPivot.z = defaultPivot.z;
    updateCurrentMarker();
    refreshDirtyState();
    refreshValues();
    flashSavedTag();
});
document.getElementById('open-main-btn').addEventListener('click', () => {
    window.open('./index.html', '_blank');
});
document.getElementById('view-top-btn').addEventListener('click', () => switchView('top'));
document.getElementById('view-3d-btn').addEventListener('click',  () => switchView('3d'));

function commitSave() {
    if (!glbLoaded || !isDirty) return;
    writeStored(currentPivot.x, currentPivot.z);
    savedPivot.x = currentPivot.x;
    savedPivot.z = currentPivot.z;
    refreshDirtyState();
    flashSavedTag();
}

// Ctrl/Cmd + S で保存
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        commitSave();
    }
});

// ============= リサイズ =============
window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const a = w / h;

    const halfH = (orthoCamera.top - orthoCamera.bottom) / 2;
    orthoCamera.left  = -halfH * a;
    orthoCamera.right =  halfH * a;
    orthoCamera.updateProjectionMatrix();

    perspCamera.aspect = a;
    perspCamera.updateProjectionMatrix();

    renderer.setSize(w, h);
});

// ============= レンダーループ =============
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, activeCamera);
}
animate();
