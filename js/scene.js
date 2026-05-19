import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { checkSafety } from './safety-tools.js';


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
labelRenderer.domElement.style.pointerEvents = 'none';  // 不挡鼠标
document.body.appendChild(labelRenderer.domElement);



// ============= 光照（卡通光照，柔和对比） =============
const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
directionalLight.position.set(5, 20, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);


// ============= 卡通材质工具（SketchUp 风格 toon + 描边） =============
// 4 阶灰度渐变图 → MeshToonMaterial 的台阶式着色
const toonGradient = new THREE.DataTexture(
    new Uint8Array([140, 175, 215, 255]),       // 抬高暗部，避免死黑
    4, 1,
    THREE.RedFormat
);
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

function toToon(orig) {
    if (!orig) return new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient });
    const toon = new THREE.MeshToonMaterial({
        color: orig.color ? orig.color.clone() : new THREE.Color(0xffffff),
        map: orig.map || null,
        gradientMap: toonGradient,
        side: orig.side ?? THREE.FrontSide,
        transparent: orig.transparent ?? false,
        opacity: orig.opacity ?? 1
    });
    return toon;
}

export function applyToonStyle(root) {
    root.traverse(child => {
        if (!child.isMesh || child.userData._toonApplied) return;

        if (Array.isArray(child.material)) {
            child.material = child.material.map(toToon);
        } else {
            child.material = toToon(child.material);
        }

        // 黑色边缘描边（阈值 30°，只画明显折角）
        const edges = new THREE.EdgesGeometry(child.geometry, 30);
        const outline = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x000000 })
        );
        outline.userData._isOutline = true;
        child.add(outline);

        child.userData._toonApplied = true;
    });
}



// ============= Raycaster =============
export const raycaster = new THREE.Raycaster();
export const mouse = new THREE.Vector2();

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
    
    gltfLoader.load('./models/crane_TADANO_GR-250N.glb', (gltf) => {
        models.craneTemplate = gltf.scene;
        applyToonStyle(models.craneTemplate);
        console.log('✅ 吊车模板加载完成');
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
        console.log('✅ 场地加载完成');
        checkDone();
    });
}

// ============= 动画循环 =============
export function startAnimationLoop() {
    let lastSafetyCheck = 0;
    
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
        
        // 安全检测每 500ms 一次（不用每帧都查）
        const now = Date.now();
        if (now - lastSafetyCheck > 500) {
            checkSafety();
            lastSafetyCheck = now;
        }
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
