import * as THREE from 'three';
import { scene, models } from './scene.js';
import { state, bumpRevision } from './state.js';
import { updateCounters, showToast, getCraneCenter, disposeObject3D } from './tools.js';
import { CSS2DObject } from './scene.js';
import { circleIntersectsPolygonXZ } from './geometry-2d.js';


// ============= 地形 Y サンプラ：(x, z) → 地形高さ =============
// 下向きレイキャストで地形高さを取る。
//
// site.glb は 28MB あり BVH も無いので、1 本のレイでもメッシュ全三角形を
// 舐める。実測でおよそ 2.5ms/本。描画プレビューは点を打つたびに折れ線を
// 0.5m 刻みで作り直し、そのたびに「前回と同じ座標」を撃ち直していたため、
// 描けば描くほどクリックが重くなっていた。
//
// 座標を量子化したモジュール共有キャッシュを噛ませて、同じ場所への
// 撃ち直しを消す。地形は動かないのでキャッシュは安全。
const TERRAIN_CACHE_QUANT = 0.25;        // m。この粒度で丸めてキャッシュ
const TERRAIN_CACHE_MAX = 200000;        // 上限。超えたら捨てて作り直す
const _terrainCache = new Map();

export function clearTerrainCache() {
    _terrainCache.clear();
}

function makeTerrainSampler() {
    const siteMeshes = [];
    if (models.siteModel) {
        models.siteModel.traverse(c => { if (c.isMesh) siteMeshes.push(c); });
    }
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const origin = new THREE.Vector3();

    return function sample(x, z, fallback = 0) {
        if (siteMeshes.length === 0) return fallback;

        const qx = Math.round(x / TERRAIN_CACHE_QUANT);
        const qz = Math.round(z / TERRAIN_CACHE_QUANT);
        const key = qx * 100000 + qz;
        const cached = _terrainCache.get(key);
        if (cached !== undefined) return cached === null ? fallback : cached;

        origin.set(x, 500, z);
        ray.set(origin, down);
        const hits = ray.intersectObjects(siteMeshes, false);
        const y = hits.length > 0 ? hits[0].point.y : null;

        if (_terrainCache.size >= TERRAIN_CACHE_MAX) _terrainCache.clear();
        _terrainCache.set(key, y);
        return y === null ? fallback : y;
    };
}


// ============= 描画プレビューの破棄 =============
// プレビューは点を打つたびに丸ごと作り直しているため、scene.remove() だけだと
// クリック 1 回ごとに geometry / material が GPU に residual として溜まる。
export function clearDrawingPreview() {
    if (!state.drawingPreview) return;
    scene.remove(state.drawingPreview);
    disposeObject3D(state.drawingPreview);
    state.drawingPreview = null;
}


// ============= 提示栏控制 =============
export function showHint(text) {
    const hint = document.getElementById('drawing-hint');
    document.getElementById('hint-text').textContent = text;
    hint.classList.remove('hidden');
}

export function hideHint() {
    document.getElementById('drawing-hint').classList.add('hidden');
}

// ============= 绘制预览（虚线 + 端点小球）共用 =============
// 線分を 0.5m ステップで分割し、各点の地形 Y を採って起伏を反映させる。
function createDrawingPreview(points, color, dashSize, gapSize) {
    const sampler = makeTerrainSampler();
    const group = new THREE.Group();

    // 端点小球（クリック点の真上に乗せる）
    const ballGeom = new THREE.SphereGeometry(0.25, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({
        color, depthTest: false, transparent: true, opacity: 0.95
    });
    points.forEach(pt => {
        const ball = new THREE.Mesh(ballGeom, markerMat);
        ball.position.set(pt.x, sampler(pt.x, pt.z, pt.y) + 0.15, pt.z);
        ball.renderOrder = 999;
        group.add(ball);
    });

    // 地形追随の破線
    if (points.length >= 2) {
        const STEP = 0.5;
        const dense = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i], b = points[i + 1];
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            const steps = Math.max(1, Math.ceil(len / STEP));
            for (let s = 0; s <= (i === points.length - 2 ? steps : steps - 1); s++) {
                const t = s / steps;
                const x = a.x + (b.x - a.x) * t;
                const z = a.z + (b.z - a.z) * t;
                dense.push(new THREE.Vector3(x, sampler(x, z, 0) + 0.1, z));
            }
        }
        const geom = new THREE.BufferGeometry().setFromPoints(dense);
        const mat = new THREE.LineDashedMaterial({
            color, dashSize, gapSize, depthTest: false, transparent: true, opacity: 0.95
        });
        const line = new THREE.Line(geom, mat);
        line.computeLineDistances();
        line.renderOrder = 999;
        group.add(line);
    }

    return group;
}


// ============= 立入禁止区 =============
export function addForbiddenPoint(point) {
    // 把当前点加入正在画的列表
    state.drawingPoints.push(point.clone());
    
    // 删掉旧的预览
    clearDrawingPreview();

    // 画端点 + 虚线（红色）
    state.drawingPreview = createDrawingPreview(state.drawingPoints, 0xff0000, 0.6, 0.3);
    scene.add(state.drawingPreview);

    showHint(`🚫 禁止区を作成中... (${state.drawingPoints.length} 点) Enter で確定 / ESC でキャンセル`);
}

export function finishForbiddenZone() {
    if (state.drawingPoints.length < 3) {
        showToast('3 点以上必要です', 'warning');
        return;
    }

    const points = state.drawingPoints.map(p => p.clone());
    const sampler = makeTerrainSampler();

    // 多角形 (XZ) を Shape に。ShapeGeometry は XY 平面のフラット三角分割。
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
    shape.closePath();

    const shapeGeom = new THREE.ShapeGeometry(shape);
    let positions = Array.from(shapeGeom.attributes.position.array);   // [x,y,0, ...] (XY 上)
    let indices = shapeGeom.index
        ? Array.from(shapeGeom.index.array)
        : positions.map((_, i) => i).filter((_, i) => i % 3 === 0);

    // 最大エッジ長がしきい値を超える三角形を 4 分割（中点分割）し、
    // 内側にも地形サンプル点を増やす。
    //
    // ⚠ 以前は「MAX_EDGE 0.5m 固定 / 最大 8 回」だけが条件だった。
    //   1 回で三角形が 4 倍になるので最悪 4^8 = 65536 倍まで膨らみ、しかも
    //   この後で頂点 1 つにつき 1 本ずつ 28MB のサイト地形へレイを撃つ。
    //   100m 角の禁止区を引くとブラウザが数万回の raycast で固まっていた。
    //   反復回数ではなく「頂点数の上限」で打ち切り、コストを実際に縛る。
    const MAX_EDGE = 0.5;
    const MAX_VERTICES = 3000;      // ≒ この数だけ地形 raycast が走る上限
    const MAX_ITERATIONS = 8;

    function edgeLen2D(i, j) {
        const dx = positions[i * 3]     - positions[j * 3];
        const dz = positions[i * 3 + 1] - positions[j * 3 + 1];
        return Math.hypot(dx, dz);
    }

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        // 次の 1 回で頂点数が上限を超えそうならそこで止める。
        // 中点分割は 1 回で概ね頂点数が 4 倍になるため、それを見込んで判定。
        if (positions.length / 3 * 4 > MAX_VERTICES) break;

        let changed = false;
        const midCache = new Map();
        const newIdx = [];
        function getMid(a, b) {
            const k = Math.min(a, b) + '_' + Math.max(a, b);
            if (midCache.has(k)) return midCache.get(k);
            const m = positions.length / 3;
            positions.push(
                (positions[a*3]     + positions[b*3])     / 2,
                (positions[a*3 + 1] + positions[b*3 + 1]) / 2,
                0
            );
            midCache.set(k, m);
            return m;
        }
        for (let t = 0; t < indices.length; t += 3) {
            const a = indices[t], b = indices[t + 1], c = indices[t + 2];
            const maxE = Math.max(edgeLen2D(a, b), edgeLen2D(b, c), edgeLen2D(c, a));
            if (maxE <= MAX_EDGE) {
                newIdx.push(a, b, c);
            } else {
                changed = true;
                const mab = getMid(a, b), mbc = getMid(b, c), mca = getMid(c, a);
                newIdx.push(a, mab, mca, mab, b, mbc, mca, mbc, c, mab, mbc, mca);
            }
        }
        indices = newIdx;
        if (!changed) break;
    }

    // XY → 世界 XZ 変換 + 各頂点を地形 Y に持ち上げ
    const nVerts = positions.length / 3;
    const worldVerts = new Float32Array(nVerts * 3);
    for (let i = 0; i < nVerts; i++) {
        const x = positions[i * 3];
        const z = positions[i * 3 + 1];
        worldVerts[i * 3]     = x;
        worldVerts[i * 3 + 1] = sampler(x, z, 0) + 0.05;
        worldVerts[i * 3 + 2] = z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(worldVerts, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
        color: 0xff0000, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, depthWrite: false
    });
    const zone = new THREE.Mesh(geometry, material);
    zone.userData = {
        type: 'forbidden',
        points: points.map(p => ({ x: p.x, y: p.y, z: p.z }))
    };
    scene.add(zone);
    state.placedObjects.push(zone);

    // 境界線：エッジをサンプリングして地形追随。
    // 刻みは周長に応じて粗くする（固定 0.5m だと 400m 周長で 800 点になり、
    // 半透明の輪郭線としては明らかに過剰）。
    const borderPts = [];
    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        perimeter += Math.hypot(b.x - a.x, b.z - a.z);
    }
    const STEP = Math.max(0.5, perimeter / 400);
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.ceil(len / STEP));
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const x = a.x + (b.x - a.x) * t;
            const z = a.z + (b.z - a.z) * t;
            borderPts.push(new THREE.Vector3(x, sampler(x, z, 0) + 0.06, z));
        }
    }
    const borderGeom = new THREE.BufferGeometry().setFromPoints(borderPts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const border = new THREE.LineLoop(borderGeom, lineMat);
    scene.add(border);
    zone.userData.border = border;

    cleanupDrawing();
    updateCounters();
    bumpRevision();
}

// 描画中の状態をすべて破棄（中断・確定の両方から使う）。
// 以前は cancelDrawing / cleanupDrawing という完全に同一の関数が 2 本あった。
export function cancelDrawing() {
    state.drawingPoints = [];
    clearDrawingPreview();
    hideHint();
}

const cleanupDrawing = cancelDrawing;


// ============= 通路 =============
export function addPathPoint(point) {
    state.drawingPoints.push(point.clone());
    
    // 删掉旧的预览
    clearDrawingPreview();

    // 画端点 + 虚线（绿色）
    state.drawingPreview = createDrawingPreview(state.drawingPoints, 0x00ff00, 0.7, 0.35);
    scene.add(state.drawingPreview);

    showHint(`🟢 通路を作成中... (${state.drawingPoints.length} 点) Enter で確定 / ESC でキャンセル`);
}

export function finishPath() {
    if (state.drawingPoints.length < 2) {
        showToast('2 点以上必要です', 'warning');
        return;
    }

    const points = state.drawingPoints.map(p => p.clone());
    const sampler = makeTerrainSampler();
    const PATH_WIDTH = 1.0;
    const half = PATH_WIDTH / 2;
    const STEP = 0.5;   // 中心線をこの粒度で再サンプリング

    // 折れ線を 0.5m 刻みで再サンプリング（XZ のみ）
    const dense = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.ceil(len / STEP));
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            dense.push(new THREE.Vector3(
                a.x + (b.x - a.x) * t, 0,
                a.z + (b.z - a.z) * t
            ));
        }
    }
    dense.push(points[points.length - 1].clone());

    // 各中心点を地形 Y に持ち上げ（方向計算用）
    dense.forEach(p => { p.y = sampler(p.x, p.z, 0); });

    // リボン（左右の頂点）— 各エッジ位置で個別に地形 Y を採る
    const verts = [];
    for (let i = 0; i < dense.length; i++) {
        const p = dense[i];
        let dir;
        if (i === 0) {
            dir = dense[i + 1].clone().sub(p);
        } else if (i === dense.length - 1) {
            dir = p.clone().sub(dense[i - 1]);
        } else {
            const d1 = p.clone().sub(dense[i - 1]).normalize();
            const d2 = dense[i + 1].clone().sub(p).normalize();
            dir = d1.add(d2);
        }
        dir.y = 0;
        dir.normalize();

        const perpX = -dir.z * half;
        const perpZ =  dir.x * half;

        const lx = p.x - perpX, lz = p.z - perpZ;
        const rx = p.x + perpX, rz = p.z + perpZ;
        const ly = sampler(lx, lz, 0) + 0.04;
        const ry = sampler(rx, rz, 0) + 0.04;

        verts.push(lx, ly, lz, rx, ry, rz);
    }

    const indices = [];
    for (let i = 0; i < dense.length - 1; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 3);
        indices.push(a, a + 3, a + 2);
    }

    const tubeGeom = new THREE.BufferGeometry();
    tubeGeom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    tubeGeom.setIndex(indices);
    tubeGeom.computeVertexNormals();

    const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x00aa00, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide, depthWrite: false
    });
    const tube = new THREE.Mesh(tubeGeom, tubeMat);

    let totalLength = 0;
    for (let i = 0; i < points.length - 1; i++) {
        totalLength += points[i].distanceTo(points[i + 1]);
    }

    tube.userData = {
        type: 'path',
        points: state.drawingPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
        length: totalLength
    };
    scene.add(tube);
    state.placedObjects.push(tube);

    // 矢印（オリジナル各セグメントの中点に配置、地形 Y を採る）
    addPathArrows(tube, points, sampler);

    cleanupDrawing();
    updateCounters();
    bumpRevision();

    console.log(`通路長: ${totalLength.toFixed(1)} m`);
}


function addPathArrows(tube, points, sampler) {
    const arrows = [];

    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i], end = points[i + 1];

        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        mid.y = sampler(mid.x, mid.z, mid.y) + 0.3;   // 地面 0.3m 上に浮かす

        const direction = new THREE.Vector3().subVectors(end, start).normalize();

        const arrowGeom = new THREE.ConeGeometry(0.2, 0.5, 8);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const arrow = new THREE.Mesh(arrowGeom, arrowMat);
        arrow.position.copy(mid);

        const axis = new THREE.Vector3(0, 1, 0);
        arrow.quaternion.setFromUnitVectors(axis, direction);

        scene.add(arrow);
        arrows.push(arrow);
    }

    tube.userData.arrows = arrows;
}

// ============= 测距 =============
let measureFirstPoint = null;

export function addMeasurePoint(point) {
    if (!measureFirstPoint) {
        // 第一个点
        measureFirstPoint = point.clone();
        showHint('📏 もう 1 点をクリックしてください');
    } else {
        // 第二个点 → 完成测量
        const second = point.clone();
        const distance = measureFirstPoint.distanceTo(second);
        
        // 画线
        const geometry = new THREE.BufferGeometry().setFromPoints([measureFirstPoint, second]);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        
        // 标签（在中点）
        const mid = new THREE.Vector3().addVectors(measureFirstPoint, second).multiplyScalar(0.5);
        mid.y += 0.5;
        
        const labelDiv = document.createElement('div');
        labelDiv.style.background = 'rgba(0, 0, 0, 0.7)';
        labelDiv.style.color = '#ffff00';
        labelDiv.style.padding = '4px 10px';
        labelDiv.style.borderRadius = '4px';
        labelDiv.style.fontSize = '14px';
        labelDiv.style.fontWeight = 'bold';
        labelDiv.textContent = `📏 ${distance.toFixed(2)} m`;
        
        const label = new CSS2DObject(labelDiv);
        label.position.copy(mid);
        scene.add(label);
        
        // 端点圆球
        const ballGeom = new THREE.SphereGeometry(0.1);
        const ballMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const ball1 = new THREE.Mesh(ballGeom, ballMat);
        ball1.position.copy(measureFirstPoint);
        scene.add(ball1);
        const ball2 = new THREE.Mesh(ballGeom.clone(), ballMat.clone());
        ball2.position.copy(second);
        scene.add(ball2);
        
        // 把整个组合作为一个对象
        line.userData = {
            type: 'measure',
            label: label,
            balls: [ball1, ball2],
            distance: distance,
            from: { x: measureFirstPoint.x, y: measureFirstPoint.y, z: measureFirstPoint.z },
            to: { x: second.x, y: second.y, z: second.z }
        };
        state.placedObjects.push(line);
        
        // 重置，准备下一次测量
        measureFirstPoint = null;
        showHint('📏 2 点をクリックして距離を測定');
        updateCounters();
        bumpRevision();
        
        console.log(`距離: ${distance.toFixed(2)} m`);
    }
}

export function cancelMeasure() {
    measureFirstPoint = null;
}


// ============= 安全检测 =============
export function checkSafety() {
    const cranes = state.placedObjects.filter(o => o.userData.type === 'crane');
    const forbiddens = state.placedObjects.filter(o => o.userData.type === 'forbidden');

    let anyDanger = false;

    cranes.forEach(crane => {
        if (!crane.userData.radiusCircle) return;

        // 作業半径の円板と禁止区多角形を実形状で判定する。
        // 以前は Box3 同士（＝半径円の外接正方形）で見ていたため、
        // 円の外側でも外接正方形の角にかかる禁止区を「重複」と誤検出した
        // （最悪で半径の √2 倍まで）。安全警告の空振りは警告自体を
        // 信用されなくするので、実形状で判定する。
        const center = getCraneCenter(crane);
        const radius = crane.userData.workRadius || 10;

        const craneDanger = forbiddens.some(zone =>
            circleIntersectsPolygonXZ(center.x, center.z, radius, zone.userData.points)
        );

        if (craneDanger) anyDanger = true;

        // ⭐ 円の色はここでは触らない。
        //   以前は checkSafety（500ms）と safety-display（200ms）が
        //   同じ material.color を別々の基準で書き合っていて、禁止区と
        //   吊点が同時にあると色が点滅していた。判定結果だけ残し、
        //   実際の着色は safety-display.js に一本化する。
        crane.userData.zoneConflict = craneDanger;
    });

    const radiusEl = document.getElementById('safety-radius');
    if (!radiusEl) return;
    if (anyDanger) {
        radiusEl.innerHTML = '<span class="pill danger">⚠️ 禁止区と重複</span>';
    } else {
        radiusEl.innerHTML = '<span class="pill ok">✅ OK</span>';
    }
}