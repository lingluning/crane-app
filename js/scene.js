import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { state } from './state.js';


// ============= 场景基础 =============
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdadbdd);   // 浅灰背景


export const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(5, 8, 15);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// HiDPI 対応。上限 2 にしておかないと 3x 端末で塗りつぶし量が 9 倍になる。
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;             // 略缓和对比，避免暗部死黑
document.body.appendChild(renderer.domElement);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableZoom = false;    // ⭐ 关掉内置滚轮，自己处理 (避免靠近 target 时越来越慢)

// ⭐ 鼠标按键映射：
//   左键 = 不响应（保留给放置/选择）
//   中键 = 自定义（绕鼠标点旋转，不走 OrbitControls）
//   右键 = 平移
controls.mouseButtons = {
    LEFT:   null,
    MIDDLE: null,
    RIGHT:  THREE.MOUSE.PAN
};

// ⭐ 自定义「绕鼠标点旋转」
//    思路：把 camera.position 和 controls.target 同时绕 pivot 旋转
//    这样 OrbitControls.lookAt(target) 不会触发额外的硬切，视角连续无跳
const _pivotNDC = new THREE.Vector2();
const _pivotRaycaster = new THREE.Raycaster();
const _pivot = new THREE.Vector3();
const _rotQuat = new THREE.Quaternion();
const _rightVec = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _tmpOffset = new THREE.Vector3();
let _isPivotRotating = false;
let _lastPX = 0, _lastPY = 0;
const ROTATE_SPEED = 0.005;

function _siteMeshes() {
    const targets = [];
    if (models.siteModel) {
        models.siteModel.traverse(c => { if (c.isMesh) targets.push(c); });
    }
    return targets;
}

function _rotateAroundPivot(axis, angle) {
    _rotQuat.setFromAxisAngle(axis, angle);

    _tmpOffset.subVectors(camera.position, _pivot).applyQuaternion(_rotQuat);
    camera.position.copy(_pivot).add(_tmpOffset);

    _tmpOffset.subVectors(controls.target, _pivot).applyQuaternion(_rotQuat);
    controls.target.copy(_pivot).add(_tmpOffset);
}

renderer.domElement.addEventListener('mousedown', (event) => {
    if (event.button !== 1) return;   // 只处理中键
    event.preventDefault();

    const rect = renderer.domElement.getBoundingClientRect();
    _pivotNDC.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    _pivotNDC.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
    _pivotRaycaster.setFromCamera(_pivotNDC, camera);

    const hits = _pivotRaycaster.intersectObjects(_siteMeshes());
    if (hits.length > 0) {
        _pivot.copy(hits[0].point);
    } else {
        _pivot.copy(controls.target);   // 没打到地面就退回原 target
    }

    _lastPX = event.clientX;
    _lastPY = event.clientY;
    _isPivotRotating = true;
});

window.addEventListener('mousemove', (event) => {
    if (!_isPivotRotating) return;

    const dx = event.clientX - _lastPX;
    const dy = event.clientY - _lastPY;
    _lastPX = event.clientX;
    _lastPY = event.clientY;

    // Yaw: 绕世界 Y 轴
    _rotateAroundPivot(camera.up, -dx * ROTATE_SPEED);

    // Pitch: 绕 camera 的右方向
    camera.getWorldDirection(_camDir);
    _rightVec.crossVectors(_camDir, camera.up).normalize();
    _rotateAroundPivot(_rightVec, -dy * ROTATE_SPEED);
});

window.addEventListener('mouseup', (event) => {
    if (event.button !== 1) return;
    _isPivotRotating = false;
});

// ⭐ 自定义滚轮缩放
//    - 朝鼠标射线打到的世界点移动 camera（zoom-to-cursor）
//    - 步长 = max(到目标点距离 * STEP_RATIO, MIN_STEP)
//      MIN_STEP 保证靠近时不会越来越慢
const _zoomNDC = new THREE.Vector2();
const _zoomRay = new THREE.Raycaster();
const _zoomMove = new THREE.Vector3();
const _zoomTargetPt = new THREE.Vector3();
const ZOOM_STEP_RATIO = 0.15;
const ZOOM_MIN_STEP   = 1.5;     // 米
const ZOOM_MIN_DIST   = 1.5;     // 与目标点的最小距离，防穿透

renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();

    const rect = renderer.domElement.getBoundingClientRect();
    _zoomNDC.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    _zoomNDC.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
    _zoomRay.setFromCamera(_zoomNDC, camera);

    const hits = _zoomRay.intersectObjects(_siteMeshes());
    if (hits.length > 0) {
        _zoomTargetPt.copy(hits[0].point);
    } else {
        _zoomRay.ray.at(50, _zoomTargetPt);   // 没打到地面，沿光线取 50m 处
    }

    const dir = event.deltaY > 0 ? -1 : 1;    // 向上滚 = 拉近
    const distToPt = camera.position.distanceTo(_zoomTargetPt);
    const step = Math.max(distToPt * ZOOM_STEP_RATIO, ZOOM_MIN_STEP);

    if (dir > 0 && distToPt - step < ZOOM_MIN_DIST) return;   // 防穿透

    _zoomMove.subVectors(_zoomTargetPt, camera.position).normalize().multiplyScalar(dir * step);
    camera.position.add(_zoomMove);
    controls.target.add(_zoomMove);   // target 跟着平移，保持视线方向
}, { passive: false });


// ============= 标签渲染器 =============
export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.zIndex = '3';            // canvas (2) より前、パネル (30+) より後ろ
labelRenderer.domElement.style.pointerEvents = 'none';  // 不挡鼠标
document.body.appendChild(labelRenderer.domElement);

// ============= ウィンドウリサイズ追従 =============
//   レンダラと CSS2D ラベル層、カメラのアスペクト比をブラウザサイズに合わせて更新する。
window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
});



// ============= 光照（卡通光照，柔和对比） =============
const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
directionalLight.position.set(5, 20, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);
scene.add(directionalLight.target);

// 影のフラスタムはサイト読込後に実寸へ合わせる（fitShadowToSite）。
// 既定の DirectionalLight は ±5 単位しかカバーしないため、数十 m ある
// 現場では影が途中で切れる／全く出ない。
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.bias = -0.0005;

function fitShadowToSite(siteRoot) {
    const box = new THREE.Box3().setFromObject(siteRoot);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.5 * 1.15;   // 少し余裕
    const height = Math.max(size.y, 1);

    // 光源を現場中心の斜め上に置き、target を中心に向ける
    const dir = new THREE.Vector3(1, 4, 1).normalize();
    const dist = radius + height * 2;
    directionalLight.position.copy(center).addScaledVector(dir, dist);
    directionalLight.target.position.copy(center);
    directionalLight.target.updateMatrixWorld();

    const cam = directionalLight.shadow.camera;
    cam.left = -radius; cam.right = radius;
    cam.top  =  radius; cam.bottom = -radius;
    cam.near = 0.5;
    cam.far  = dist + radius + height * 2;
    cam.updateProjectionMatrix();
    directionalLight.shadow.needsUpdate = true;
}


// ============= 卡通材质工具（SketchUp 风格 toon + 描边） =============
// 4 阶灰度渐变图 → MeshToonMaterial 的台阶式着色
const toonGradient = new THREE.DataTexture(
    new Uint8Array([175, 200, 225, 255]),       // 暗部进一步抬高，避免死黑
    4, 1,
    THREE.RedFormat
);
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

// ⭐ クレーン専用：5 段、トップに鋭い 255 ピークを置いて
// アニメ調メタリックなハイライトを再現する。コントラストを広げ
// 中段を意図的に少し沈ませることで「金属の光沢」感を出す。
const toonGradientMetal = new THREE.DataTexture(
    new Uint8Array([155, 185, 210, 240, 255]),
    5, 1,
    THREE.RedFormat
);
toonGradientMetal.magFilter = THREE.NearestFilter;
toonGradientMetal.minFilter = THREE.NearestFilter;
toonGradientMetal.needsUpdate = true;

function toToon(orig, gradient = toonGradient, metallic = false) {
    if (!orig) {
        return new THREE.MeshToonMaterial({
            color: 0xffffff,
            gradientMap: gradient,
            emissive: metallic ? 0x1a1a1a : 0x000000   // 金属に微かなセルフ発光でツヤ感
        });
    }
    const toon = new THREE.MeshToonMaterial({
        color: orig.color ? orig.color.clone() : new THREE.Color(0xffffff),
        map: orig.map || null,
        gradientMap: gradient,
        side: orig.side ?? THREE.FrontSide,
        transparent: orig.transparent ?? false,
        opacity: orig.opacity ?? 1,
        emissive: metallic ? 0x1a1a1a : 0x000000
    });
    return toon;
}

export function applyToonStyle(root, { metallic = false } = {}) {
    const gradient = metallic ? toonGradientMetal : toonGradient;

    root.traverse(child => {
        if (!child.isMesh || child.userData._toonApplied) return;

        if (Array.isArray(child.material)) {
            child.material = child.material.map(m => toToon(m, gradient, metallic));
        } else {
            child.material = toToon(child.material, gradient, metallic);
        }

        // 边缘描边：纯黑 → 深灰，让整体色调更柔和
        const edges = new THREE.EdgesGeometry(child.geometry, 30);
        const outline = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x4a4a4a })
        );
        outline.userData._isOutline = true;
        child.add(outline);

        child.userData._toonApplied = true;
    });
}



// ============= Raycaster =============
export const raycaster = new THREE.Raycaster();
export const mouse = new THREE.Vector2();

// ============= クレーン中心調整 (旋回中心) =============
// GLB ローカル座標系の (x, z)。wrapper の原点をここに置く。
// ユーザーが UI で微調整 → setCraneCalibration → 全インスタンスに反映 + 保存。
const CALIBRATION_STORAGE_KEY = 'crane_pivot_offset';

export const craneCalibration = {
    pivotX: 0,
    pivotZ: 0,
    defaultX: 0,    // GLB ロード時に計算（リセット用）
    defaultZ: 0,
    isCustom: false
};

function loadStoredCalibration() {
    try {
        const s = localStorage.getItem(CALIBRATION_STORAGE_KEY);
        if (!s) return null;
        const v = JSON.parse(s);
        return (typeof v.x === 'number' && typeof v.z === 'number') ? v : null;
    } catch { return null; }
}

function saveStoredCalibration(x, z) {
    try { localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify({ x, z })); }
    catch { /* ignore */ }
}

// 既にシーンに置かれたクレーン + テンプレ全部に新オフセットを反映
function applyPivotToAll(x, z) {
    if (models.craneTemplate && models.craneTemplate.children[0]) {
        models.craneTemplate.children[0].position.set(-x, 0, -z);
    }
    state.placedObjects.forEach(obj => {
        if (obj.userData.type === 'crane' && obj.children[0]) {
            obj.children[0].position.set(-x, 0, -z);
        }
    });
}

export function setCraneCalibration(x, z) {
    craneCalibration.pivotX = x;
    craneCalibration.pivotZ = z;
    craneCalibration.isCustom = (
        Math.abs(x - craneCalibration.defaultX) > 1e-6 ||
        Math.abs(z - craneCalibration.defaultZ) > 1e-6
    );
    saveStoredCalibration(x, z);
    applyPivotToAll(x, z);
}

export function resetCraneCalibration() {
    try { localStorage.removeItem(CALIBRATION_STORAGE_KEY); } catch {}
    craneCalibration.pivotX = craneCalibration.defaultX;
    craneCalibration.pivotZ = craneCalibration.defaultZ;
    craneCalibration.isCustom = false;
    applyPivotToAll(craneCalibration.defaultX, craneCalibration.defaultZ);
}

// ============= 模型加载 =============
const gltfLoader = new GLTFLoader();

export const models = {
    craneTemplate: null,
    siteModel: null
};

let loadedCount = 0;
const totalLoads = 2;

export function loadModels(onAllLoaded) {
    function checkDone() {
        loadedCount++;
        if (loadedCount >= totalLoads) {
            document.getElementById('loading').style.display = 'none';
            if (onAllLoaded) onAllLoaded();
        }
    }
    
    gltfLoader.load('./models/crane_25T.glb', (gltf) => {
        // GLB の原点とブーム下（旋回中心）が一致しないため、wrapper を被せて
        // 内側 gltf.scene を逆オフセットし wrapper 原点 = 旋回中心 に揃える。
        //
        // デフォルトは BB 長軸の 1/3 比率で推定。実際の位置はユーザーが
        // 「中心調整」UI で微調整 → localStorage で永続化される。
        const wrapper = new THREE.Group();
        const box = new THREE.Box3().setFromObject(gltf.scene);

        craneCalibration.defaultX = box.min.x + (box.max.x - box.min.x) * 0.33;
        craneCalibration.defaultZ = box.min.z + (box.max.z - box.min.z) * 0.5;

        // localStorage に校正値があれば優先、無ければデフォルト
        const stored = loadStoredCalibration();
        if (stored) {
            craneCalibration.pivotX = stored.x;
            craneCalibration.pivotZ = stored.z;
            craneCalibration.isCustom = true;
        } else {
            craneCalibration.pivotX = craneCalibration.defaultX;
            craneCalibration.pivotZ = craneCalibration.defaultZ;
        }

        gltf.scene.position.set(-craneCalibration.pivotX, 0, -craneCalibration.pivotZ);
        wrapper.add(gltf.scene);

        models.craneTemplate = wrapper;
        applyToonStyle(models.craneTemplate, { metallic: true });   // ⭐ クレーンだけ金属調トゥーン
        console.log(
            `✅ 吊车模板加载完成 — pivot=(${craneCalibration.pivotX.toFixed(2)}, ${craneCalibration.pivotZ.toFixed(2)})`
            + ` ${craneCalibration.isCustom ? '[カスタム / localStorage]' : '[デフォルト / BB 推定]'}`
            + ` URL=${location.origin}`
        );
        checkDone();
    });

    gltfLoader.load('./models/site.glb', (gltf) => {
        gltf.scene.position.set(0, 0, 0);
        gltf.scene.traverse(child => {
            if (child.isMesh) child.receiveShadow = true;
        });
        applyToonStyle(gltf.scene);
        models.siteModel = gltf.scene;
        scene.add(gltf.scene);
        fitShadowToSite(gltf.scene);
        console.log('✅ 场地加载完成');
        checkDone();
    });
}

// ============= 动画循环 =============
export function startAnimationLoop() {
    // 安全検定は main.js の runSafetyPipeline（変更時のみ実行）へ移した。
    // 描画ループは描画だけを担う。
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
    }
    animate();
}

// ============= 检测地面交点 =============
export function getGroundIntersect() {
    const targets = [];
    if (models.siteModel) {
        models.siteModel.traverse(child => {
            if (child.isMesh) targets.push(child);
        });
    }
    return raycaster.intersectObjects(targets);
}

export { CSS2DObject };
