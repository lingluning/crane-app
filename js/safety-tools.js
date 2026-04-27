import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';
import { updateCounters } from './tools.js';
import { CSS2DObject } from './scene.js';


// ============= 提示栏控制 =============
export function showHint(text) {
    const hint = document.getElementById('drawing-hint');
    document.getElementById('hint-text').textContent = text;
    hint.classList.remove('hidden');
}

export function hideHint() {
    document.getElementById('drawing-hint').classList.add('hidden');
}

// ============= 立入禁止区 =============
export function addForbiddenPoint(point) {
    // 把当前点加入正在画的列表
    state.drawingPoints.push(point.clone());
    
    // 删掉旧的预览
    if (state.drawingPreview) {
        scene.remove(state.drawingPreview);
        state.drawingPreview = null;
    }
    
    // 画虚线连接所有点
    if (state.drawingPoints.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(state.drawingPoints);
        const material = new THREE.LineDashedMaterial({
            color: 0xff0000,
            dashSize: 0.3,
            gapSize: 0.2
        });
        state.drawingPreview = new THREE.Line(geometry, material);
        state.drawingPreview.computeLineDistances();
        scene.add(state.drawingPreview);
    }
    
    showHint(`🚫 禁止区を作成中... (${state.drawingPoints.length} 点) Enter で確定 / ESC でキャンセル`);
}

export function finishForbiddenZone() {
    if (state.drawingPoints.length < 3) {
        alert('⚠️ 3 点以上必要です');
        return;
    }
    
    // 创建 Shape（多边形）
    const shape = new THREE.Shape();
    const firstPoint = state.drawingPoints[0];
    shape.moveTo(firstPoint.x, firstPoint.z);  // 注意 X 和 Z（俯视图）
    
    for (let i = 1; i < state.drawingPoints.length; i++) {
        const p = state.drawingPoints[i];
        shape.lineTo(p.x, p.z);
    }
    shape.closePath();
    
    // ExtrudeGeometry 把多边形拉伸成 3D
    const extrudeSettings = {
        depth: 0.05,         // 厚度 5cm
        bevelEnabled: false
    };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(Math.PI / 2);   // 平躺
    geometry.translate(0, 0.05, 0);  // 略高于地面
    
    // 半透明红色
    const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });
    const zone = new THREE.Mesh(geometry, material);
    zone.userData = {
        type: 'forbidden',
        points: state.drawingPoints.map(p => ({ x: p.x, y: p.y, z: p.z }))
    };
    scene.add(zone);
    state.placedObjects.push(zone);
    
    // 加红色边框
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
    const border = new THREE.LineSegments(edges, lineMat);
    border.position.copy(zone.position);
    scene.add(border);
    zone.userData.border = border;
    
    cleanupDrawing();
    updateCounters();
}

export function cancelDrawing() {
    state.drawingPoints = [];
    if (state.drawingPreview) {
        scene.remove(state.drawingPreview);
        state.drawingPreview = null;
    }
    hideHint();
}

function cleanupDrawing() {
    state.drawingPoints = [];
    if (state.drawingPreview) {
        scene.remove(state.drawingPreview);
        state.drawingPreview = null;
    }
    hideHint();
}


// ============= 通路 =============
export function addPathPoint(point) {
    state.drawingPoints.push(point.clone());
    
    // 删掉旧的预览
    if (state.drawingPreview) {
        scene.remove(state.drawingPreview);
        state.drawingPreview = null;
    }
    
    // 画虚线
    if (state.drawingPoints.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(state.drawingPoints);
        const material = new THREE.LineDashedMaterial({
            color: 0x00ff00,
            dashSize: 0.5,
            gapSize: 0.3
        });
        state.drawingPreview = new THREE.Line(geometry, material);
        state.drawingPreview.computeLineDistances();
        scene.add(state.drawingPreview);
    }
    
    showHint(`🟢 通路を作成中... (${state.drawingPoints.length} 点) Enter で確定 / ESC でキャンセル`);
}

export function finishPath() {
    if (state.drawingPoints.length < 2) {
        alert('⚠️ 2 点以上必要です');
        return;
    }
    
    // 主路径线（粗一点）
    const points = state.drawingPoints.map(p => p.clone());
    points.forEach(p => p.y += 0.05);  // 稍微抬起来
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: 0x00aa00,
        linewidth: 4   // 注意: WebGL 不一定支持线宽
    });
    
    // 用 TubeGeometry 让路径变粗（更明显）
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0);
    const tubeGeom = new THREE.TubeGeometry(curve, points.length * 4, 0.15, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x00aa00,
        transparent: true,
        opacity: 0.7
    });
    const tube = new THREE.Mesh(tubeGeom, tubeMat);
    
    // 计算总长度
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
    
    // 加方向箭头（每段中点）
    addPathArrows(tube, points);
    
    cleanupDrawing();
    updateCounters();
    
    console.log(`通路長: ${totalLength.toFixed(1)} m`);
}

function addPathArrows(tube, points) {
    const arrows = [];
    
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        
        // 中点
        const mid = new THREE.Vector3()
            .addVectors(start, end)
            .multiplyScalar(0.5);
        mid.y += 0.3;  // 浮在路径上方
        
        // 方向
        const direction = new THREE.Vector3()
            .subVectors(end, start)
            .normalize();
        
        // 圆锥（箭头）
        const arrowGeom = new THREE.ConeGeometry(0.2, 0.5, 8);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const arrow = new THREE.Mesh(arrowGeom, arrowMat);
        arrow.position.copy(mid);
        
        // 让圆锥指向 direction（圆锥默认朝 +Y，要旋转到水平方向）
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
    
    // 检测 1: 作业半径 vs 禁止区
    let radiusOK = true;
    cranes.forEach(crane => {
        if (!crane.userData.radiusCircle) return;
        
        const radiusBox = new THREE.Box3().setFromObject(crane.userData.radiusCircle);
        
        forbiddens.forEach(zone => {
            const zoneBox = new THREE.Box3().setFromObject(zone);
            if (radiusBox.intersectsBox(zoneBox)) {
                radiusOK = false;
                // 半径圆变红
                crane.userData.radiusCircle.material.color.setHex(0xff0000);
                crane.userData.radiusCircle.material.opacity = 0.7;
            } else {
                // 恢复
                if (radiusOK) {
                    crane.userData.radiusCircle.material.color.setHex(0xff0000);
                    crane.userData.radiusCircle.material.opacity = 0.5;
                }
            }
        });
    });
    
    // 更新 UI
    const radiusEl = document.getElementById('safety-radius');
    if (radiusOK) {
        radiusEl.innerHTML = '作業半径: <span class="text-green-400">✅ OK</span>';
    } else {
        radiusEl.innerHTML = '作業半径: <span class="text-red-400">⚠️ 禁止区と重複</span>';
    }
}