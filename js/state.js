// 全局共享状态
export const state = {
    placedObjects: [],
    currentTool: 'crane',
    selectedObject: null,
    ghost: null,
    currentPlateSize: { x: 1.5, z: 3 },
    drawingPoints: [],        // 正在画的点
    drawingPreview: null,     // 预览的虚线


    showCenterPoints: true,   // 是否显示中心点
    currentCraneId: 'TADANO_GR-160N',  // 当前选择的吊车型号
    actualLoad: 5.0,
};