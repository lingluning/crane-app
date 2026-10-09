// 重機・車両の簡易 3D モデル（プリミティブの組み合わせ）。
// GLB モデルが無い機種用。後で実モデルに差し替えるときは buildEquipmentBody の分岐だけ変えればよい。
//
// 規約：長手方向 = ローカル +X（前方）、幅 = Z、原点 = 接地面の中心、単位 m。
// ジオメトリ・マテリアルはインスタンスごとに新規作成する（削除時に dispose しても他に影響しない）。

import * as THREE from 'three';
import { applyToonStyle } from './scene.js';

const COLOR = {
    yellow: 0xf2b705, darkYellow: 0xc79300, steel: 0x5b6470, dark: 0x2b2f35,
    track: 0x1f2328, glass: 0x8fc3e6, white: 0xeef1f3, grey: 0x9aa4ad,
    red: 0xd33f1f, blue: 0x2f5d9e, orange: 0xf97316, bedGrey: 0x7a8b99,
};

function mesh(group, geometry, color, x, y, z) {
    const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1 }));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
}

// 中心 (x, y, z) の直方体
const box = (g, lx, ly, lz, color, x, y, z) => mesh(g, new THREE.BoxGeometry(lx, ly, lz), color, x, y, z);

// XY 平面上の 2 点を結ぶ角材（ブーム・アーム用）
function beam(g, x1, y1, x2, y2, z, thick, color, depth = thick) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const m = box(g, len, thick, depth, color, (x1 + x2) / 2, (y1 + y2) / 2, z);
    m.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    return m;
}

function wheel(g, x, z, r = 0.5, w = 0.35) {
    const m = mesh(g, new THREE.CylinderGeometry(r, r, w, 18), COLOR.track, x, r, z);
    m.rotation.x = Math.PI / 2;
    return m;
}

// 左右の履帯
function tracks(g, length, width, trackW = 0.6, h = 0.9) {
    const z = width / 2 - trackW / 2;
    box(g, length, h, trackW, COLOR.track, 0, h / 2, z);
    box(g, length, h, trackW, COLOR.track, 0, h / 2, -z);
    box(g, length * 0.8, 0.5, width - trackW * 2, COLOR.steel, 0, 0.6, 0);
}

function cabin(g, lx, ly, lz, x, y, z, color = COLOR.yellow) {
    box(g, lx, ly, lz, color, x, y, z);
    box(g, 0.05, ly * 0.45, lz * 0.8, COLOR.glass, x + lx / 2 + 0.01, y + ly * 0.15, z);   // 前面ガラス
}

// トラック共通：シャシー・キャブ（前方 +X）・タイヤ。荷台側の x 範囲を返す
function truck(g, { L, W, cabLen = 1.9, cabH = 1.8, cabColor = COLOR.white, rearAxles = 2 }) {
    box(g, L - 0.2, 0.35, W - 0.5, COLOR.dark, 0, 0.95, 0);
    cabin(g, cabLen, cabH, W, L / 2 - cabLen / 2, 1.1 + cabH / 2, 0, cabColor);
    const zw = W / 2 - 0.25;
    const front = L / 2 - cabLen * 0.6;
    [front, ...Array.from({ length: rearAxles }, (_, i) => -L / 2 + 1.3 + i * 1.3)].forEach(x => {
        wheel(g, x, zw);
        wheel(g, x, -zw);
    });
    return { rearStart: -L / 2, rearEnd: L / 2 - cabLen };
}

const BUILDERS = {
    excavator(g) {
        tracks(g, 4.5, 2.8);
        box(g, 3.0, 1.1, 2.6, COLOR.yellow, -0.3, 1.55, 0);                  // 上部旋回体
        box(g, 0.7, 1.0, 2.6, COLOR.steel, -1.65, 1.5, 0);                    // カウンタウェイト
        cabin(g, 1.0, 1.4, 0.9, 0.75, 2.8, 0.8);
        beam(g, 1.0, 2.1, 4.2, 4.6, -0.2, 0.45, COLOR.yellow);                // ブーム
        beam(g, 4.2, 4.6, 6.2, 1.4, -0.2, 0.35, COLOR.yellow);                // アーム
        box(g, 0.8, 0.7, 1.0, COLOR.dark, 6.3, 0.9, -0.2);                    // バケット
    },
    pileDriver(g) {
        tracks(g, 6.0, 4.0, 0.8);
        box(g, 4.0, 1.4, 3.0, COLOR.yellow, -0.6, 1.6, 0);
        box(g, 0.8, 1.2, 3.0, COLOR.steel, -2.9, 1.5, 0);
        cabin(g, 1.1, 1.5, 1.0, 0.6, 3.0, 1.1);
        box(g, 0.7, 18, 0.7, COLOR.red, 2.6, 0.9 + 9, 0);                      // リーダ
        box(g, 0.9, 2.5, 0.9, COLOR.dark, 2.6, 8, 0);                          // オーガ / ハンマ
        [0.9, -0.9].forEach(z => beam(g, -1.2, 2.4, 2.4, 14, z, 0.2, COLOR.grey));   // バックステー
    },
    dozer(g) {
        tracks(g, 3.4, 2.6);
        box(g, 2.6, 1.3, 2.2, COLOR.yellow, -0.2, 1.45, 0);
        cabin(g, 1.3, 1.4, 1.5, -0.6, 2.8, 0);
        box(g, 0.35, 1.2, 3.2, COLOR.darkYellow, 2.4, 0.7, 0);                 // ブレード
        [1.0, -1.0].forEach(z => beam(g, 1.0, 1.0, 2.25, 0.6, z, 0.18, COLOR.dark));
    },
    dump(g) {
        const L = 7.6, W = 2.5;
        const { rearStart, rearEnd } = truck(g, { L, W });
        const len = rearEnd - rearStart - 0.3;
        box(g, len, 1.3, W - 0.1, COLOR.bedGrey, rearStart + len / 2 + 0.1, 1.8, 0);
    },
    lowboy(g) {
        const L = 16.5, W = 2.5, tractorLen = 6.5;
        const tx = L / 2 - tractorLen / 2;                                     // トラクタ中心
        box(g, tractorLen, 0.35, W - 0.5, COLOR.dark, tx, 0.95, 0);
        cabin(g, 2.2, 2.0, W, L / 2 - 1.1, 2.1, 0, COLOR.blue);
        [L / 2 - 1.3, tx - 1.6, tx - 2.9].forEach(x => { wheel(g, x, W / 2 - 0.25); wheel(g, x, -(W / 2 - 0.25)); });
        box(g, 2.6, 0.6, W, COLOR.dark, tx - 2.6, 1.5, 0);                      // グースネック
        const deckLen = L - tractorLen - 1.2;
        box(g, deckLen, 0.35, W, COLOR.dark, -L / 2 + deckLen / 2, 0.75, 0);   // 低床デッキ
        [-L / 2 + 0.8, -L / 2 + 1.7, -L / 2 + 2.6].forEach(x => { wheel(g, x, W / 2 - 0.25, 0.4); wheel(g, x, -(W / 2 - 0.25), 0.4); });
    },
    mixer(g) {
        const L = 7.9, W = 2.5;
        truck(g, { L, W });
        const drum = mesh(g, new THREE.CylinderGeometry(1.1, 0.65, 4.4, 22), COLOR.white, -0.9, 2.45, 0);
        drum.rotation.z = Math.PI / 2 + 0.2;
        const band = mesh(g, new THREE.TorusGeometry(0.98, 0.07, 6, 24), COLOR.orange, -1.3, 2.4, 0);
        band.rotation.y = Math.PI / 2;
        band.rotation.x = 0.2;
    },
    pump(g) {
        const L = 10.5, W = 2.5;
        truck(g, { L, W, cabLen: 2.0, cabH: 1.9, rearAxles: 3 });
        box(g, 7.6, 0.9, W - 0.2, COLOR.white, -1.2, 1.6, 0);
        mesh(g, new THREE.CylinderGeometry(0.5, 0.6, 0.6, 16), COLOR.grey, -3.6, 2.35, 0);
        [2.75, 3.15, 3.55].forEach((y, i) => box(g, 7.4 - i * 0.6, 0.3, 0.45, COLOR.white, -0.3 - i * 0.3, y, 0));   // 折畳みブーム
        [[2.3, 1], [2.3, -1], [-3.0, 1], [-3.0, -1]].forEach(([x, s]) => box(g, 0.3, 0.3, 1.2, COLOR.yellow, x, 0.9, s * (W / 2 + 0.5)));   // アウトリガ（収納）
    },
    aerial(g) {
        const L = 7.0, W = 2.2;
        truck(g, { L, W, cabLen: 1.8 });
        box(g, 4.6, 0.5, W - 0.2, COLOR.white, -1.0, 1.35, 0);
        mesh(g, new THREE.CylinderGeometry(0.45, 0.55, 0.5, 16), COLOR.grey, -2.2, 1.85, 0);
        beam(g, -2.2, 2.0, 1.8, 6.4, 0, 0.32, COLOR.white);
        box(g, 0.9, 1.0, 1.4, COLOR.orange, 2.1, 6.7, 0);                      // バケット
    },
};

// 本体（スケール対象）だけを組み立てる
function buildEquipmentBody(def) {
    const body = new THREE.Group();
    const build = BUILDERS[def.model];
    if (build) build(body);
    else box(body, def.footprint.length, 2, def.footprint.width, COLOR.grey, 0, 1, 0);
    if (def.scale) body.scale.set(def.scale.x, def.scale.y, def.scale.z);
    return body;
}

// 旋回・転倒・ブーム到達などの範囲を地面に示すリング（選択・レイキャストの対象外）
function buildHazardRing(def) {
    const r = def.hazard.radius;
    const group = new THREE.Group();
    const noRay = () => {};
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.07, r + 0.07, 128),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide })
    );
    const fill = new THREE.Mesh(
        new THREE.CircleGeometry(r, 96),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.06, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
    );
    [fill, ring].forEach((m, i) => {
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.15;
        m.renderOrder = 4 + i;
        m.raycast = noRay;
        group.add(m);
    });
    group.userData._isHazardRing = true;
    return group;
}

// 配置用の完成モデル（トゥーン調 + 範囲リング）
export function buildEquipmentModel(def) {
    const root = new THREE.Group();
    root.add(buildEquipmentBody(def));
    applyToonStyle(root);
    if (def.hazard) root.add(buildHazardRing(def));
    return root;
}

// 配置前のゴースト（半透明）
export function buildEquipmentGhost(def) {
    const root = new THREE.Group();
    root.add(buildEquipmentBody(def));
    root.traverse(o => {
        if (o.isMesh) {
            o.material.transparent = true;
            o.material.opacity = 0.45;
            o.material.depthWrite = false;
            o.castShadow = false;
        }
    });
    if (def.hazard) root.add(buildHazardRing(def));
    return root;
}
