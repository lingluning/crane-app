/**
 * 吊车数据库（v2 - 工程級）
 *
 * 数据结构：
 *   loadChart[outriggerMode] = [
 *     { boomLength, criticalAngle, points: [{ radius, capacity }, ...] },
 *     ...
 *   ]
 *
 * outriggerMode 通用 key:
 *   maxFull   - 最大張出
 *   mid61/mid50/mid38 - 中間張出
 *   minRetract / min  - 最縮小
 *
 * ⚠ 仅供参考。作业前必须以实际负荷率表为准。
 */

export const CRANE_DATABASE = {

    // ============= 25T クラス =============
    'KATO_CR-250RV': {
        id: 'KATO_CR-250RV',
        manufacturer: 'KATO',
        model: 'CR-250RV',
        displayName: 'KATO CR-250RV (25t)',
        category: 'roughTerrain',
        maxCapacity: 25.0,

        dimensions: {
            length: 10.5,
            width: 2.5,
            height: 3.5,
            weight: 28000
        },

        centerPoint: { offsetX: 0, offsetZ: 0 },

        boom: {
            availableLengths: [9.35, 16.4, 23.45, 30.5],
            sections: 5
        },

        hook: { capacity: 25.0, weight: 0.23 },

        ropeFalls: [
            { boomLength: 9.35,  falls: 7 },
            { boomLength: 16.4,  falls: 6 },
            { boomLength: 23.45, falls: 4 },
            { boomLength: 30.5,  falls: 4 }
        ],

        outrigger: {
            modes: {
                maxFull: {
                    id: 'maxFull',
                    label: 'アウトリガ最大張出',
                    extensionWidth: 6.6,
                    note: '最大能力。基本この状態で計画'
                },
                mid61: {
                    id: 'mid61',
                    label: 'アウトリガ中間張出 6.1m',
                    extensionWidth: 6.1
                },
                mid50: {
                    id: 'mid50',
                    label: 'アウトリガ中間張出 5.0m',
                    extensionWidth: 5.0
                },
                mid38: {
                    id: 'mid38',
                    label: 'アウトリガ中間張出 3.8m',
                    extensionWidth: 3.8
                },
                minRetract: {
                    id: 'minRetract',
                    label: 'アウトリガ最縮小張出',
                    extensionWidth: 2.31
                }
            },

            positions: [
                { name: 'frontLeft',  x: -1.2, z: -1.8 },
                { name: 'frontRight', x:  1.2, z: -1.8 },
                { name: 'rearLeft',   x: -1.2, z:  1.8 },
                { name: 'rearRight',  x:  1.2, z:  1.8 }
            ]
        },

        // ⭐ 载荷表（核心数据）
        loadChart: {
            maxFull: [
                {
                    boomLength: 9.35,
                    criticalAngle: null,
                    points: [
                        { radius: 2.5, capacity: 25.00 },
                        { radius: 3.0, capacity: 25.00 },
                        { radius: 3.5, capacity: 25.00 },
                        { radius: 4.0, capacity: 23.50 },
                        { radius: 4.5, capacity: 21.50 },
                        { radius: 5.0, capacity: 19.60 },
                        { radius: 5.5, capacity: 17.80 },
                        { radius: 6.0, capacity: 16.30 },
                        { radius: 6.5, capacity: 15.10 }
                    ]
                },
                { boomLength: 16.4,  criticalAngle: null, points: [] },  // TODO: 录入
                { boomLength: 23.45, criticalAngle: null, points: [] },  // TODO: 录入
                { boomLength: 30.5,  criticalAngle: null, points: [] }   // TODO: 录入
            ],
            mid61: [
                { boomLength: 9.35,  criticalAngle: null, points: [] },
                { boomLength: 16.4,  criticalAngle: null, points: [] },
                { boomLength: 23.45, criticalAngle: null, points: [] },
                { boomLength: 30.5,  criticalAngle: null, points: [] }
            ],
            mid50: [
                { boomLength: 9.35,  criticalAngle: null, points: [] },
                { boomLength: 16.4,  criticalAngle: null, points: [] },
                { boomLength: 23.45, criticalAngle: null, points: [] },
                { boomLength: 30.5,  criticalAngle: null, points: [] }
            ],
            mid38: [
                { boomLength: 9.35,  criticalAngle: null, points: [] },
                { boomLength: 16.4,  criticalAngle: null, points: [] },
                { boomLength: 23.45, criticalAngle: null, points: [] },
                { boomLength: 30.5,  criticalAngle: null, points: [] }
            ],
            minRetract: [
                { boomLength: 9.35,  criticalAngle: null, points: [] },
                { boomLength: 16.4,  criticalAngle: null, points: [] },
                { boomLength: 23.45, criticalAngle: null, points: [] },
                { boomLength: 30.5,  criticalAngle: null, points: [] }
            ]
        }
    },

    // ============= 16T クラス（迁移到新结构） =============
    'TADANO_GR-160N': {
        id: 'TADANO_GR-160N',
        manufacturer: 'TADANO',
        model: 'GR-160N',
        displayName: 'TADANO GR-160N (16t)',
        category: 'roughTerrain',
        maxCapacity: 16,

        dimensions: { length: 9.5, width: 2.5, height: 3.4, weight: 21000 },
        centerPoint: { offsetX: 0, offsetZ: 0 },

        boom: {
            availableLengths: [8.4, 14.0, 19.5, 24.5],
            sections: 4
        },

        hook: { capacity: 16.0, weight: 0.18 },

        ropeFalls: [
            { boomLength: 8.4,  falls: 6 },
            { boomLength: 14.0, falls: 4 },
            { boomLength: 19.5, falls: 4 },
            { boomLength: 24.5, falls: 4 }
        ],

        outrigger: {
            modes: {
                maxFull: {
                    id: 'maxFull',
                    label: 'アウトリガ最大張出',
                    extensionWidth: 5.4
                },
                mid: {
                    id: 'mid',
                    label: 'アウトリガ中間張出',
                    extensionWidth: 4.8
                },
                min: {
                    id: 'min',
                    label: 'アウトリガ最縮小',
                    extensionWidth: 3.5
                }
            },
            positions: [
                { name: 'frontLeft',  x: -1.0, z: -1.5 },
                { name: 'frontRight', x:  1.0, z: -1.5 },
                { name: 'rearLeft',   x: -1.0, z:  1.5 },
                { name: 'rearRight',  x:  1.0, z:  1.5 }
            ]
        },

        loadChart: {
            // 旧数据迁移：原来只有 1 条曲线（按半径），现在按 boomLength 区分
            // 暂时把旧数据放到 maxFull / 8.4m boom 下，作为参考
            maxFull: [
                {
                    boomLength: 8.4,
                    criticalAngle: null,
                    points: [
                        { radius: 3.0,  capacity: 16.0 },
                        { radius: 3.5,  capacity: 14.5 },
                        { radius: 4.0,  capacity: 12.5 },
                        { radius: 5.0,  capacity:  9.8 },
                        { radius: 6.0,  capacity:  7.6 },
                        { radius: 7.0,  capacity:  6.0 },
                        { radius: 8.0,  capacity:  4.8 }
                    ]
                },
                { boomLength: 14.0, criticalAngle: null, points: [] },
                { boomLength: 19.5, criticalAngle: null, points: [] },
                { boomLength: 24.5, criticalAngle: null, points: [] }
            ],
            mid: [
                {
                    boomLength: 8.4,
                    criticalAngle: null,
                    points: [
                        { radius: 3.0,  capacity: 12.0 },
                        { radius: 4.0,  capacity: 10.5 },
                        { radius: 5.0,  capacity:  8.0 },
                        { radius: 6.0,  capacity:  6.2 },
                        { radius: 7.0,  capacity:  4.8 }
                    ]
                },
                { boomLength: 14.0, criticalAngle: null, points: [] },
                { boomLength: 19.5, criticalAngle: null, points: [] },
                { boomLength: 24.5, criticalAngle: null, points: [] }
            ],
            min: [
                {
                    boomLength: 8.4,
                    criticalAngle: null,
                    points: [
                        { radius: 3.0, capacity: 8.0 },
                        { radius: 4.0, capacity: 6.5 },
                        { radius: 5.0, capacity: 4.8 },
                        { radius: 6.0, capacity: 3.6 }
                    ]
                },
                { boomLength: 14.0, criticalAngle: null, points: [] },
                { boomLength: 19.5, criticalAngle: null, points: [] },
                { boomLength: 24.5, criticalAngle: null, points: [] }
            ]
        }
    }
};

// ============= 工具函数 =============

export function getCrane(id) {
    return CRANE_DATABASE[id];
}

export function getAllCranes() {
    return Object.values(CRANE_DATABASE)
        .filter(c => c.id)
        .map(c => ({
            id: c.id,
            displayName: c.displayName,
            maxCapacity: c.maxCapacity
        }));
}

/**
 * 获取某 アウトリガー模式 + ブーム长度 的载荷曲线
 */
export function getBoomLoadCurve(craneId, outriggerMode, boomLength) {
    const crane = CRANE_DATABASE[craneId];
    if (!crane) return null;

    const modeData = crane.loadChart[outriggerMode];
    if (!modeData) return null;

    return modeData.find(curve => curve.boomLength === boomLength);
}

/**
 * 作業半径からブーム起伏角を概算し、危険角度域に入っているか判定する。
 *
 * 起伏角 θ ≈ acos(作業半径 / ブーム長)。ブームフット位置やブームヘッドの
 * オフセットを無視した近似で、計画時の目安として使う。
 * criticalAngle は「これ以下になると危険」な最小起伏角（度）を想定。
 *
 * criticalAngle が未設定（null / undefined）のデータでは常に false。
 */
function isBelowCriticalAngle(curve, radius) {
    const critical = curve.criticalAngle;
    if (critical == null) return false;

    const boomLength = curve.boomLength;
    if (!boomLength || radius > boomLength) return false;

    const angleDeg = Math.acos(radius / boomLength) * (180 / Math.PI);
    return angleDeg <= critical;
}

/**
 * 查询载荷
 * @returns { capacity, isInRange, isCriticalAngle, message }
 */
export function queryLoadChart(craneId, outriggerMode, boomLength, radius) {
    const curve = getBoomLoadCurve(craneId, outriggerMode, boomLength);

    if (!curve) {
        return {
            capacity: 0,
            isInRange: false,
            isCriticalAngle: false,
            message: '該当データなし'
        };
    }

    const points = curve.points;
    if (!points || points.length === 0) {
        return {
            capacity: 0,
            isInRange: false,
            isCriticalAngle: false,
            message: 'データ未入力'
        };
    }

    const minR = points[0].radius;
    const maxR = points[points.length - 1].radius;

    if (radius < minR) {
        return {
            capacity: points[0].capacity,
            isInRange: false,
            isCriticalAngle: false,
            message: `最小半径 ${minR}m 未満`
        };
    }

    if (radius > maxR) {
        return {
            capacity: 0,
            isInRange: false,
            isCriticalAngle: false,
            message: `最大半径 ${maxR}m 超過`
        };
    }

    for (let i = 0; i < points.length - 1; i++) {
        if (radius >= points[i].radius && radius <= points[i + 1].radius) {
            const r1 = points[i].radius;
            const r2 = points[i + 1].radius;
            const c1 = points[i].capacity;
            const c2 = points[i + 1].capacity;

            const ratio = (radius - r1) / (r2 - r1);
            const capacity = c1 + (c2 - c1) * ratio;

            // この半径におけるブーム起伏角と criticalAngle を比較する。
            // 以前は「curve.criticalAngle が null でなければ常に true」で、
            // 半径を一切見ずに全域を危険角度として扱っていた（現在は
            // 全データが null のため表面化していないが、実データを入れた
            // 瞬間に表全体が誤警告になる）。
            const isCriticalAngle = isBelowCriticalAngle(curve, radius);

            return {
                capacity,
                isInRange: true,
                isCriticalAngle,
                message: isCriticalAngle ? '⚠️ 危険角度範囲' : ''
            };
        }
    }

    return {
        capacity: 0,
        isInRange: false,
        isCriticalAngle: false,
        message: 'エラー'
    };
}

/**
 * 获取某模式 + boom 的最大可用半径（用于半径滑杆上限）
 *
 * 載荷データが無い組み合わせでは null を返す。
 * 以前は 15 を返していたため、points が空（多くの boom 長は "TODO: 录入"
 * のまま）でも滑杆が 15m まで動き、実際に引くと「データ未入力」になる、
 * という架空の作業範囲を提示していた。呼び出し側は null を
 * 「この構成は選べない」として扱うこと。
 */
export function getMaxRadius(craneId, outriggerMode, boomLength) {
    const curve = getBoomLoadCurve(craneId, outriggerMode, boomLength);
    if (!curve || !curve.points || curve.points.length === 0) return null;
    return curve.points[curve.points.length - 1].radius;
}

/**
 * 综合安全判定
 */
export function evaluateSafety(actualLoad, maxLoad) {
    if (!maxLoad || maxLoad <= 0) return 'danger';

    const usage = actualLoad / maxLoad;

    if (usage <= 0.7) return 'safe';
    if (usage <= 0.9) return 'caution';
    return 'danger';
}

export const SAFETY_COLORS = {
    safe: 0x00aa00,
    caution: 0xffaa00,
    danger: 0xff0000
};
