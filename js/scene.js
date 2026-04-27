import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { checkSafety } from './safety-tools.js';


// ============= 场景基础 =============
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 200);


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
document.body.appendChild(renderer.domElement);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;


// ============= 标签渲染器 =============
export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';  // 不挡鼠标
document.body.appendChild(labelRenderer.domElement);



// ============= 光照 =============
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 20, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);



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
        console.log('✅ 吊车模板加载完成');
        checkDone();
    });
    
    gltfLoader.load('./models/site.glb', (gltf) => {
        gltf.scene.position.set(0, 0, 0);
        gltf.scene.traverse(child => {
            if (child.isMesh) child.receiveShadow = true;
        });
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
