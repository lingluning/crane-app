// XZ 平面（地面）上の 2D 幾何ヘルパー。Y（高さ）は無視する。
// 点は {x, z} を持つ任意のオブジェクト（THREE.Vector3 / 保存済みの素のオブジェクト）で良い。

// レイキャスト法による点の多角形内外判定
export function pointInPolygonXZ(px, pz, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, zi = polygon[i].z;
        const xj = polygon[j].x, zj = polygon[j].z;
        const intersect = ((zi > pz) !== (zj > pz)) &&
            (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// a1 → a2 へ短い方の弧で回るときの開始角と回転量（符号付き、|delta| <= π）
export function shortArcAngles(a1, a2) {
    let diff = ((a2 - a1) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    return { start: a1, delta: diff };
}

// 折れ線を step (m) 間隔で再サンプリングした点列（端点を含む）
export function samplePolylineXZ(points, step = 0.25) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.max(1, Math.ceil(len / step));
        for (let s = 0; s < n; s++) {
            const t = s / n;
            out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        }
    }
    if (points.length > 0) {
        const last = points[points.length - 1];
        out.push({ x: last.x, z: last.z });
    }
    return out;
}

// 旋回中心 c から見て、点 p が「角度 start→start+delta、半径 rMin〜rMax」の扇環内にあるか
export function pointInAnnularSectorXZ(p, c, rMin, rMax, start, delta) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const r = Math.hypot(dx, dz);
    if (r < rMin || r > rMax) return false;
    // start から見た p の角度を、delta と同じ向きに [0, 2π) で測る
    const a = Math.atan2(dz, dx);
    const TWO_PI = Math.PI * 2;
    if (delta >= 0) {
        const rel = ((a - start) % TWO_PI + TWO_PI) % TWO_PI;
        return rel <= delta;
    }
    const rel = ((start - a) % TWO_PI + TWO_PI) % TWO_PI;
    return rel <= -delta;
}
