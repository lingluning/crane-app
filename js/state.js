// 全局共享状态
export const state = {
    placedObjects: [],
    currentTool: 'crane',
    selectedObject: null,
    selectedObjects: [],     // 多選用（Ctrl+左クリックで敷鉄板を追加 / プレート group 全員）
    ghost: null,
    currentPlateSize: { x: 1.5, z: 3 },
    drawingPoints: [],        // 正在画的点
    drawingPreview: null,     // 预览的虚线

    showCenterPoints: true,   // 是否显示中心点

    // ⭐ Week 11: 吊车型号 / boom / アウトリガー
    currentCraneId: 'KATO_CR-250RV',
    currentBoomLength: 9.35,            // 当前选择的ブーム长度（m）
    currentOutriggerMode: 'maxFull',    // 当前张出模式 key

    actualLoad: 5.0,
};
