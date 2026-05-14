/**
 * 吊车数据库
 * 数据来源：各厂商官方载荷表 PDF
 * 注意：仅供参考，作业前必须以实际负荷率表为准
 */

export const CRANE_DATABASE = {
    
    // ============= 16T クラス =============
    'TADANO_GR-160N': {
        // 基础识别
        id: 'TADANO_GR-160N',
        manufacturer: 'TADANO',
        model: 'GR-160N',
        displayName: 'TADANO GR-160N (16t)',
        category: 'rough_terrain',
        maxCapacity: 16,  // 吨
        
        // 尺寸（米）
        dimensions: {
            length: 9.5,
            width: 2.5,
            height: 3.4,
            weight: 21000  // kg
        },
        
        // 中心点（相对于模型原点的偏移）
        centerPoint: {
            offsetX: 0,
            offsetZ: 0
        },
        
        // ブーム（臂）
        boom: {
            minLength: 8.4,
            maxLength: 24.5,
            sections: 4
        },
        
        // アウトリガー
        outrigger: {
            // 3 种张出模式
            modes: {
                min: {
                    span: 3.5,           // 张出长度（左右总宽）
                    maxRadius: 8,        // 此模式下最大作业半径
                    description: '最小張出'
                },
                mid: {
                    span: 4.8,
                    maxRadius: 11,
                    description: '中間張出'
                },
                max: {
                    span: 5.4,
                    maxRadius: 14,
                    description: '全張出'
                }
            },
            
            // 4 个支腿的位置（相对吊车中心）
            positions: [
                { name: 'frontLeft',  x: -1.0, z: -1.5 },
                { name: 'frontRight', x:  1.0, z: -1.5 },
                { name: 'rearLeft',   x: -1.0, z:  1.5 },
                { name: 'rearRight',  x:  1.0, z:  1.5 }
            ]
        },
        
        // 载荷表（吨）
        // 格式：loadChart[模式][作业半径] = 最大吊重
        loadChart: {
            max: {  // 全張出
                3.0: 16.0,
                3.5: 14.5,
                4.0: 12.5,
                5.0: 9.8,
                6.0: 7.6,
                7.0: 6.0,
                8.0: 4.8,
                9.0: 3.9,
                10.0: 3.2,
                11.0: 2.7,
                12.0: 2.3,
                13.0: 2.0,
                14.0: 1.7
            },
            mid: {  // 中間張出
                3.0: 12.0,
                4.0: 10.5,
                5.0: 8.0,
                6.0: 6.2,
                7.0: 4.8,
                8.0: 3.8,
                9.0: 3.1,
                10.0: 2.5,
                11.0: 2.1
            },
            min: {  // 最小張出
                3.0: 8.0,
                4.0: 6.5,
                5.0: 4.8,
                6.0: 3.6,
                7.0: 2.8,
                8.0: 2.2
            }
        }
    }
    
    // 其他 3 款先留空，Week 11-12 录入
    // 'TADANO_GR-250N': { ... },
    // 'TADANO_GR-500N': { ... },
    // 'TADANO_GR-700N': { ... },
};

// ============= 工具函数 =============

/**
 * 根据 ID 获取吊车数据
 */
export function getCrane(id) {
    return CRANE_DATABASE[id];
}

/**
 * 获取所有吊车列表（UI 下拉用）
 */
export function getAllCranes() {
    return Object.values(CRANE_DATABASE).map(c => ({
        id: c.id,
        displayName: c.displayName,
        maxCapacity: c.maxCapacity
    }));
}

/**
 * 查载荷表：给定吊车、模式、距离 → 最大吊重
 */
export function queryLoadChart(craneId, outriggerMode, radius) {
    const crane = CRANE_DATABASE[craneId];
    if (!crane) return null;
    
    const chart = crane.loadChart[outriggerMode];
    if (!chart) return null;
    
    // 找最接近的两个半径值，插值
    const radii = Object.keys(chart).map(Number).sort((a, b) => a - b);
    
    // 超出范围
    if (radius < radii[0]) return chart[radii[0]];
    if (radius > radii[radii.length - 1]) return 0;  // 0 表示不能吊
    
    // 找两边的值
    for (let i = 0; i < radii.length - 1; i++) {
        if (radius >= radii[i] && radius <= radii[i + 1]) {
            const r1 = radii[i];
            const r2 = radii[i + 1];
            const l1 = chart[r1];
            const l2 = chart[r2];
            
            // 线性插值
            const ratio = (radius - r1) / (r2 - r1);
            return l1 + (l2 - l1) * ratio;
        }
    }
    
    return 0;
}

/**
 * 安全判定
 * @param {number} actualLoad 实际吊重 (吨)
 * @param {number} maxLoad 最大允许 (吨)
 * @returns {string} 'safe' | 'caution' | 'danger'
 */
export function evaluateSafety(actualLoad, maxLoad) {
    if (!maxLoad || maxLoad <= 0) return 'danger';
    
    const usage = actualLoad / maxLoad;
    
    if (usage <= 0.7) return 'safe';      // ≤70% 安全
    if (usage <= 0.9) return 'caution';   // 70-90% 注意
    return 'danger';                       // >90% 危险
}

/**
 * 安全颜色对应
 */
export const SAFETY_COLORS = {
    safe: 0x00aa00,      // 绿
    caution: 0xffaa00,   // 黄
    danger: 0xff0000     // 红
};