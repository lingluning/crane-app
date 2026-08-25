/**
 * XZ 平面（俯瞰）の 2D 幾何ユーティリティ
 *
 * 立入禁止区の判定は safety-tools.js（作業半径円）と swing-check.js
 * （旋回軌跡）の両方で必要になるため、プリミティブをここに集約する。
 *
 * polygon は { x, z } を持つ点の配列（userData.points と同じ形）。
 */

const TWO_PI = Math.PI * 2;

/** 点が多角形の内側にあるか（ray casting） */
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

/** 点と線分の最短距離 */
export function distPointToSegmentXZ(px, pz, ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) return Math.hypot(px - ax, pz - az);

    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** 2 本の線分が交差するか */
export function segmentsIntersectXZ(ax, az, bx, bz, cx, cz, dx, dz) {
    const d1 = cross(dx - cx, dz - cz, ax - cx, az - cz);
    const d2 = cross(dx - cx, dz - cz, bx - cx, bz - cz);
    const d3 = cross(bx - ax, bz - az, cx - ax, cz - az);
    const d4 = cross(bx - ax, bz - az, dx - ax, dz - az);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;

    // 端点が相手の線分上に乗る退化ケース
    if (d1 === 0 && onSegment(cx, cz, dx, dz, ax, az)) return true;
    if (d2 === 0 && onSegment(cx, cz, dx, dz, bx, bz)) return true;
    if (d3 === 0 && onSegment(ax, az, bx, bz, cx, cz)) return true;
    if (d4 === 0 && onSegment(ax, az, bx, bz, dx, dz)) return true;
    return false;
}

function cross(ux, uz, vx, vz) {
    return ux * vz - uz * vx;
}

function onSegment(ax, az, bx, bz, px, pz) {
    return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) &&
           Math.min(az, bz) <= pz && pz <= Math.max(az, bz);
}

/**
 * 円板（中心 + 半径）と多角形が重なるか。
 *
 * AABB 同士の判定だと、半径円の外接正方形の角（半径の √2 倍まで）に
 * かかる禁止区まで「重複」と誤検出してしまうため、実形状で判定する。
 *
 * 重なる条件：
 *   - 中心が多角形の内側にある、または
 *   - いずれかの辺までの距離が半径以下（＝頂点が円内のケースも含む）
 */
export function circleIntersectsPolygonXZ(cx, cz, radius, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    if (pointInPolygonXZ(cx, cz, polygon)) return true;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const d = distPointToSegmentXZ(
            cx, cz,
            polygon[j].x, polygon[j].z,
            polygon[i].x, polygon[i].z
        );
        if (d <= radius) return true;
    }
    return false;
}

/** 折れ線（点列）が多角形と交差するか、または内部に入るか */
export function polylineIntersectsPolygonXZ(points, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3 || points.length === 0) return false;

    // 端点が内部にある場合（多角形を完全に跨がないケース）
    if (pointInPolygonXZ(points[0].x, points[0].z, polygon)) return true;

    for (let k = 0; k < points.length - 1; k++) {
        const a = points[k], b = points[k + 1];
        if (pointInPolygonXZ(b.x, b.z, polygon)) return true;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (segmentsIntersectXZ(
                a.x, a.z, b.x, b.z,
                polygon[j].x, polygon[j].z, polygon[i].x, polygon[i].z
            )) return true;
        }
    }
    return false;
}

/**
 * 点が「扇環（annular sector）」の内側にあるか。
 *
 * 旋回軌跡は起点半径 r1 から終点半径 r2 へ、start から delta だけ振れる
 * 掃引領域。半径は角度に比例して r1 → r2 へ変化する。
 *
 * 軌跡上の離散点しか見ないと、細い禁止区が採样点の間をすり抜けてしまう。
 * 多角形の頂点がこの掃引領域に入っていないかを併せて見ることで塞ぐ。
 */
export function pointInAnnularSectorXZ(px, pz, cx, cz, startAngle, delta, r1, r2) {
    const dx = px - cx;
    const dz = pz - cz;
    const r = Math.hypot(dx, dz);
    if (r === 0) return Math.min(r1, r2) === 0;

    const a = Math.atan2(dz, dx);

    // start から掃引方向に測った角度オフセット [0, 2π)
    let t;
    if (delta >= 0) {
        t = ((a - startAngle) % TWO_PI + TWO_PI) % TWO_PI;
        if (t > delta) return false;
        return withinInterpolatedRadius(r, r1, r2, delta === 0 ? 0 : t / delta);
    }
    t = ((startAngle - a) % TWO_PI + TWO_PI) % TWO_PI;
    if (t > -delta) return false;
    return withinInterpolatedRadius(r, r1, r2, t / -delta);
}

// 掃引の途中 (frac) における半径に対し、線幅ぶんの許容を持たせて内外判定
function withinInterpolatedRadius(r, r1, r2, frac) {
    const expected = r1 + (r2 - r1) * frac;
    const tolerance = Math.max(0.25, Math.abs(r2 - r1) * 0.02);
    return Math.abs(r - expected) <= tolerance;
}
