/**
 * 面板主逻辑模块
 * 管理整个颜色面板的 UI 和交互
 */

(function() {
    'use strict';

    let rootNode = null;

    const PanelState = {
        foregroundColors: [],
        manualColors: [],
        selectedColor: null,
        lastForegroundColor: null,
        shapeToggleMemory: {}
    };

    function showToast(message) {
        return;
    }

    function rgbToHex(rgbString) {
        const match = rgbString.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (!match) return '#000000';

        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');

        return `#${r}${g}${b}`;
    }

    function isLight(hexColor) {
        const match = hexColor.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
        if (!match) return false;

        const r = parseInt(match[1], 16);
        const g = parseInt(match[2], 16);
        const b = parseInt(match[3], 16);

        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.7;
    }

    function parseColorValue(color, channel) {
        const match = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (!match) return 0;

        switch (channel) {
            case 'red': return parseInt(match[1]);
            case 'green': return parseInt(match[2]);
            case 'blue': return parseInt(match[3]);
            default: return 0;
        }
    }

    function classifyLayer(layer, photoshop) {
        const layerKind = layer.kind;

        if (layerKind === photoshop.constants.LayerKind.TEXT) {
            return 'text';
        }
        if (layerKind === photoshop.constants.LayerKind.GROUP) {
            return 'group';
        }
        if (layerKind === photoshop.constants.LayerKind.SMARTOBJECT) {
            return 'smartObject';
        }
        if (layerKind === photoshop.constants.LayerKind.NORMAL) {
            return 'pixel';
        }

        return 'shape';
    }

    function isDescriptorNone(value) {
        return !value || value._value === 'none';
    }

    function extractFillColor(style) {
        if (!style) {
            return null;
        }

        if (style.adjustment && style.adjustment.length > 0) {
            const adjustment = style.adjustment[0];
            if (adjustment && adjustment.color && !isDescriptorNone(adjustment.color)) {
                return adjustment.color;
            }
        }

        if (style.color && !isDescriptorNone(style.color)) {
            return style.color;
        }

        return null;
    }

    function isSameColor(left, right) {
        if (!left || !right) {
            return false;
        }

        const leftRed = typeof left.red === 'number' ? left.red : null;
        const leftGreen = typeof left.green === 'number' ? left.green : null;
        const leftBlue = typeof left.blue === 'number' ? left.blue : null;
        const rightRed = typeof right.red === 'number' ? right.red : null;
        const rightGreen = typeof right.green === 'number' ? right.green : null;
        const rightBlue = typeof right.blue === 'number' ? right.blue : null;

        if ([leftRed, leftGreen, leftBlue, rightRed, rightGreen, rightBlue].some((value) => value === null)) {
            return false;
        }

        return Math.abs(leftRed - rightRed) < 0.01
            && Math.abs(leftGreen - rightGreen) < 0.01
            && Math.abs(leftBlue - rightBlue) < 0.01;
    }

    function resolveShapeMode(fillEnabled, strokeEnabled, fillColor, strokeColor) {
        if (fillEnabled && !strokeEnabled) {
            return 'fillOnly';
        }

        if (!fillEnabled && strokeEnabled) {
            return 'strokeOnly';
        }

        if (!fillEnabled && !strokeEnabled) {
            return 'empty';
        }

        if (fillEnabled && strokeEnabled) {
            if (!fillColor && strokeColor) {
                return 'strokeOnly';
            }

            if (fillColor && !strokeColor) {
                return 'fillOnly';
            }

            if (fillColor && strokeColor && isSameColor(fillColor, strokeColor)) {
                return 'singleColorDual';
            }

            return 'fillAndStroke';
        }

        return 'unknown';
    }

    function normalizeShapeState(style, strokeInfo) {
        const strokeStyle = strokeInfo && (strokeInfo.strokeStyle || strokeInfo.AGMStrokeStyleInfo)
            ? (strokeInfo.strokeStyle || strokeInfo.AGMStrokeStyleInfo)
            : null;
        const fillColor = extractFillColor(style);
        const strokeColor = strokeStyle && strokeStyle.strokeStyleContent && strokeStyle.strokeStyleContent.color
            ? strokeStyle.strokeStyleContent.color
            : null;
        const fillEnabled = !!(
            (style && style.fillEnabled === true) ||
            fillColor ||
            (style && style.color && !isDescriptorNone(style.color))
        );
        const strokeEnabled = !!(strokeStyle && strokeStyle.strokeEnabled === true);
        const mode = resolveShapeMode(fillEnabled, strokeEnabled, fillColor, strokeColor);

        return {
            fillEnabled,
            fillColor,
            strokeEnabled,
            strokeColor,
            strokeWidth: strokeStyle && strokeStyle.strokeStyleLineWidth
                ? strokeStyle.strokeStyleLineWidth._value
                : 4,
            mode,
            style: style || null,
            strokeStyle
        };
    }

    async function readShapeState(layer, photoshop) {
        const [styleResult, strokeResult] = await Promise.all([
            photoshop.action.batchPlay([{
                _obj: 'get',
                _target: [{ _ref: 'layer', _id: layer.id }],
                _prop: 'layerStyle'
            }], {
                synchronousExecution: false,
                modalBehavior: 'execute'
            }),
            photoshop.action.batchPlay([{
                _obj: 'get',
                _target: [{ _ref: 'layer', _id: layer.id }],
                _prop: 'AGMStrokeStyleInfo'
            }], {
                synchronousExecution: false,
                modalBehavior: 'execute'
            })
        ]);

        return normalizeShapeState(
            styleResult && styleResult[0] ? styleResult[0] : null,
            strokeResult && strokeResult[0] ? strokeResult[0] : null
        );
    }

    function getRememberedToggleDirection(layerId) {
        return PanelState.shapeToggleMemory[layerId] || null;
    }

    function setRememberedToggleDirection(layerId, direction) {
        if (!layerId) {
            return;
        }

        PanelState.shapeToggleMemory[layerId] = direction;
    }

    function clearRememberedToggleDirection(layerId) {
        if (!layerId || !PanelState.shapeToggleMemory[layerId]) {
            return;
        }

        delete PanelState.shapeToggleMemory[layerId];
    }

    function buildShapeStyleDescriptor(shapeState, overrides) {
        return Object.assign({
            _obj: 'strokeStyle',
            fillEnabled: shapeState.fillEnabled,
            strokeEnabled: shapeState.strokeEnabled,
            strokeStyleLineWidth: {
                _unit: 'pixelsUnit',
                _value: shapeState.strokeWidth || 4
            },
            strokeStyleContent: shapeState.strokeColor ? {
                _obj: 'solidColorLayer',
                color: shapeState.strokeColor
            } : {
                _enum: 'color',
                _value: 'none'
            }
        }, overrides || {});
    }

    async function applyShapeState(layer, shapeState, photoshop) {
        if (shapeState.fillEnabled && !shapeState.strokeEnabled) {
            if (shapeState.fillColor) {
                await photoshop.action.batchPlay([{
                    _obj: 'set',
                    _target: [{ _ref: 'contentLayer', _id: layer.id }],
                    to: {
                        _obj: 'solidColorLayer',
                        color: shapeState.fillColor
                    }
                }], {
                    synchronousExecution: false,
                    modalBehavior: 'execute'
                });
            }

            await photoshop.action.batchPlay([{
                _obj: 'set',
                _target: [{ _ref: 'contentLayer', _id: layer.id }],
                to: {
                    _obj: 'shapeStyle',
                    strokeStyle: {
                        _obj: 'strokeStyle',
                        fillEnabled: true,
                        strokeEnabled: false,
                        strokeStyleLineWidth: {
                            _unit: 'pixelsUnit',
                            _value: shapeState.strokeWidth || 4
                        }
                    }
                }
            }], {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });
            return;
        }

        if (!shapeState.fillEnabled && shapeState.strokeEnabled) {
            await photoshop.action.batchPlay([{
                _obj: 'set',
                _target: [{ _ref: 'contentLayer', _id: layer.id }],
                to: {
                    _obj: 'shapeStyle',
                    strokeStyle: {
                        _obj: 'strokeStyle',
                        fillEnabled: false,
                        strokeEnabled: true,
                        strokeStyleLineWidth: {
                            _unit: 'pixelsUnit',
                            _value: shapeState.strokeWidth || 4
                        },
                        strokeStyleContent: shapeState.strokeColor ? {
                            _obj: 'solidColorLayer',
                            color: shapeState.strokeColor
                        } : {
                            _enum: 'color',
                            _value: 'none'
                        }
                    }
                }
            }], {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });
            return;
        }

        const commands = [];

        commands.push({
            _obj: 'set',
            _target: [{ _ref: 'contentLayer', _id: layer.id }],
            to: {
                _obj: 'shapeStyle',
                strokeStyle: buildShapeStyleDescriptor(shapeState)
            }
        });

        if (shapeState.fillColor) {
            commands.push({
                _obj: 'set',
                _target: [{ _ref: 'contentLayer', _id: layer.id }],
                to: {
                    _obj: 'solidColorLayer',
                    color: shapeState.fillColor
                }
            });
        }

        await photoshop.action.batchPlay(commands, {
            synchronousExecution: false,
            modalBehavior: 'execute'
        });
    }

    function buildSwapShapeState(layer, shapeState) {
        const rememberedDirection = getRememberedToggleDirection(layer.id);

        if (shapeState.mode === 'strokeOnly' && shapeState.strokeColor) {
            return {
                direction: 'toFill',
                nextState: {
                    fillEnabled: true,
                    fillColor: shapeState.strokeColor,
                    strokeEnabled: false,
                    strokeColor: null,
                    strokeWidth: shapeState.strokeWidth
                }
            };
        }

        if (shapeState.mode === 'fillOnly' && shapeState.fillColor) {
            return {
                direction: 'toStroke',
                nextState: {
                    fillEnabled: false,
                    fillColor: shapeState.fillColor,
                    strokeEnabled: true,
                    strokeColor: shapeState.fillColor,
                    strokeWidth: shapeState.strokeWidth
                }
            };
        }

        if (shapeState.mode === 'singleColorDual') {
            if (rememberedDirection === 'toFill' && shapeState.strokeColor) {
                return {
                    direction: 'toStroke',
                    nextState: {
                        fillEnabled: false,
                        fillColor: shapeState.strokeColor,
                        strokeEnabled: true,
                        strokeColor: shapeState.strokeColor,
                        strokeWidth: shapeState.strokeWidth
                    }
                };
            }

            if (shapeState.strokeColor) {
                return {
                    direction: 'toFill',
                    nextState: {
                        fillEnabled: true,
                        fillColor: shapeState.strokeColor,
                        strokeEnabled: false,
                        strokeColor: null,
                        strokeWidth: shapeState.strokeWidth
                    }
                };
            }
        }

        if (shapeState.mode === 'fillAndStroke') {
            if (rememberedDirection === 'toStroke' && shapeState.strokeColor) {
                return {
                    direction: 'toFill',
                    nextState: {
                        fillEnabled: true,
                        fillColor: shapeState.strokeColor,
                        strokeEnabled: false,
                        strokeColor: null,
                        strokeWidth: shapeState.strokeWidth
                    }
                };
            }

            if (shapeState.fillColor) {
                return {
                    direction: 'toStroke',
                    nextState: {
                        fillEnabled: false,
                        fillColor: shapeState.fillColor,
                        strokeEnabled: true,
                        strokeColor: shapeState.fillColor,
                        strokeWidth: shapeState.strokeWidth
                    }
                };
            }
        }

        if (shapeState.fillColor) {
            return {
                direction: 'toStroke',
                nextState: {
                    fillEnabled: false,
                    fillColor: shapeState.fillColor,
                    strokeEnabled: true,
                    strokeColor: shapeState.fillColor,
                    strokeWidth: shapeState.strokeWidth
                }
            };
        }

        if (shapeState.strokeColor) {
            return {
                direction: 'toFill',
                nextState: {
                    fillEnabled: true,
                    fillColor: shapeState.strokeColor,
                    strokeEnabled: false,
                    strokeColor: null,
                    strokeWidth: shapeState.strokeWidth
                }
            };
        }

        return null;
    }

    async function applyFillColor(layer, red, green, blue) {
        const photoshop = require('photoshop');
        try {
            const commands = [{
                _obj: 'set',
                _target: [
                    { _ref: 'contentLayer', _id: layer.id }
                ],
                to: {
                    _obj: 'solidColorLayer',
                    color: {
                        _obj: 'RGBColor',
                        red: red,
                        green: green,
                        blue: blue
                    }
                }
            }];

            await photoshop.action.batchPlay(commands, {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });
        } catch (err) {
            console.error('[ColorPanel] 填充色设置失败:', err);
        }
    }

    async function applyColorOverlay(layer, red, green, blue, opacityPercent = 100) {
        const photoshop = require('photoshop');
        try {
            const cmd = [{
                _obj: 'set',
                _target: [{ _ref: 'layer', _id: layer.id }],
                to: {
                    _obj: 'layerStyle',
                    layerEffects: {
                        _obj: 'layerEffects',
                        solidFillMulti: [{
                            _obj: 'solidFill',
                            enabled: true,
                            mode: { _enum: 'blendMode', _value: 'normal' },
                            opacity: { _unit: 'percentUnit', _value: opacityPercent },
                            color: {
                                _obj: 'RGBColor',
                                red: red,
                                green: green,
                                blue: blue
                            }
                        }]
                    }
                }
            }];

            await photoshop.action.batchPlay(cmd, {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });
        } catch (err) {
            console.error('[ColorPanel] 颜色叠加设置失败:', err);
        }
    }

    async function applyRasterColor(layer, red, green, blue) {
        const photoshop = require('photoshop');
        try {
            await photoshop.action.batchPlay([{
                _obj: 'select',
                _target: [{ _ref: 'layer', _id: layer.id }],
                makeVisible: false
            }], { synchronousExecution: false, modalBehavior: 'execute' });

            const SolidColor = photoshop.app.SolidColor;
            const oldFg = photoshop.app.foregroundColor;
            const newFg = new SolidColor();
            newFg.rgb.red = red;
            newFg.rgb.green = green;
            newFg.rgb.blue = blue;
            photoshop.app.foregroundColor = newFg;

            const commands = [
                {
                    _obj: 'set',
                    _target: [{ _property: 'selection', _ref: 'channel' }],
                    to: { _enum: 'channel', _ref: 'channel', _value: 'transparencyEnum' }
                },
                {
                    _obj: 'fill',
                    mode: { _enum: 'blendMode', _value: 'normal' },
                    opacity: { _unit: 'percentUnit', _value: 100.0 },
                    using: { _enum: 'fillContents', _value: 'foregroundColor' },
                    _options: { dialogOptions: 'dontDisplay' }
                },
                {
                    _obj: 'set',
                    _target: [{ _property: 'selection', _ref: 'channel' }],
                    to: { _enum: 'ordinal', _value: 'none' }
                }
            ];

            await photoshop.action.batchPlay(commands, {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });

            photoshop.app.foregroundColor = oldFg;
        } catch (err) {
            console.error('[ColorPanel] 栅格图层改色失败:', err);
        }
    }

    async function applyStrokeColor(layer, red, green, blue) {
        const photoshop = require('photoshop');
        try {
            const shapeState = await readShapeState(layer, photoshop);
            const existingStrokeWidth = shapeState.strokeEnabled ? shapeState.strokeWidth : 4;

            const commands = [{
                _obj: 'set',
                _target: [
                    { _ref: 'contentLayer', _id: layer.id }
                ],
                to: {
                    _obj: 'shapeStyle',
                    strokeStyle: {
                        _obj: 'strokeStyle',
                        strokeEnabled: true,
                        strokeStyleLineWidth: { _unit: 'pixelsUnit', _value: existingStrokeWidth },
                        strokeStyleContent: {
                            _obj: 'solidColorLayer',
                            color: {
                                _obj: 'RGBColor',
                                red: red,
                                green: green,
                                blue: blue
                            }
                        }
                    }
                }
            }];

            await photoshop.action.batchPlay(commands, {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });
        } catch (err) {
            console.error('[ColorPanel] 描边色设置失败:', err);
        }
    }

    async function applyTextStrokeColor(layer, red, green, blue) {
        const photoshop = require('photoshop');
        try {
            const getCmd = [{
                _obj: 'get',
                _target: [
                    { _ref: 'layer', _id: layer.id }
                ],
                _prop: 'layerStyle'
            }];

            const result = await photoshop.action.batchPlay(getCmd, {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });

            let existingStrokeSize = 2;
            let existingStrokeOpacity = 100;

            if (result && result[0] && result[0].layerEffects) {
                const layerEffects = result[0].layerEffects;
                const frameFX = layerEffects.frameFX || (layerEffects.frameFXMulti && layerEffects.frameFXMulti[0]);

                if (frameFX && frameFX.enabled) {
                    existingStrokeSize = frameFX.size ? frameFX.size._value : 2;
                    existingStrokeOpacity = frameFX.opacity ? frameFX.opacity._value : 100;
                }
            }

            const commands = [{
                _obj: 'set',
                _target: [
                    { _ref: 'layer', _id: layer.id }
                ],
                to: {
                    _obj: 'layerStyle',
                    layerEffects: {
                        _obj: 'layerEffects',
                        frameFX: {
                            _obj: 'frameFX',
                            enabled: true,
                            style: { _enum: 'frameStyle', _value: 'outsetFrame' },
                            paintType: { _enum: 'frameFill', _value: 'solidColor' },
                            size: { _unit: 'pixelsUnit', _value: existingStrokeSize },
                            opacity: { _unit: 'percentUnit', _value: existingStrokeOpacity },
                            color: {
                                _obj: 'RGBColor',
                                red: red,
                                green: green,
                                blue: blue
                            }
                        }
                    }
                }
            }];

            await photoshop.action.batchPlay(commands, {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });
        } catch (err) {
            console.error('[ColorPanel] 文字描边色设置失败:', err);
        }
    }

    async function applyTextColor(layer, red, green, blue) {
        try {
            const SolidColor = require('photoshop').app.SolidColor;
            const textColor = new SolidColor();
            textColor.rgb.red = red;
            textColor.rgb.green = green;
            textColor.rgb.blue = blue;

            const textItem = layer.textItem;
            if (textItem && textItem.characterStyle) {
                textItem.characterStyle.color = textColor;
            }
        } catch (err) {
            console.error('[ColorPanel] 文字颜色设置失败:', err);
        }
    }

    async function applyColorToLayer(color, containerType, event) {
        try {
            const photoshop = require('photoshop');
            const { executeAsModal } = photoshop.core;

            const red = parseColorValue(color, 'red');
            const green = parseColorValue(color, 'green');
            const blue = parseColorValue(color, 'blue');

            const shiftPressed = event && event.shiftKey;

            await executeAsModal(async () => {
                const app = photoshop.app;
                const activeDocument = app.activeDocument;

                if (!activeDocument) {
                    throw new Error('没有活动文档');
                }

                const selectedLayers = activeDocument.activeLayers;

                if (!selectedLayers || selectedLayers.length === 0) {
                    throw new Error('没有选中的图层');
                }

                const nonPixelLayers = [];
                const pixelLayers = [];

                for (const layer of selectedLayers) {
                    const layerType = classifyLayer(layer, photoshop);
                    if (layerType === 'pixel') {
                        pixelLayers.push(layer);
                    } else {
                        nonPixelLayers.push(layer);
                    }
                }

                for (const layer of nonPixelLayers) {
                    const layerType = classifyLayer(layer, photoshop);

                    if (layerType === 'group' || layerType === 'smartObject') {
                        if (shiftPressed) {
                            await applyTextStrokeColor(layer, red, green, blue);
                        } else {
                            await applyColorOverlay(layer, red, green, blue, 100);
                        }
                        continue;
                    }

                    if (layerType === 'text') {
                        if (shiftPressed) {
                            await applyTextStrokeColor(layer, red, green, blue);
                        } else {
                            await applyTextColor(layer, red, green, blue);
                        }
                        continue;
                    }

                    const shapeState = await readShapeState(layer, photoshop);
                    const targetStroke = shiftPressed || (!shapeState.fillEnabled && shapeState.strokeEnabled);

                    if (targetStroke) {
                        await applyStrokeColor(layer, red, green, blue);
                    } else {
                        await applyFillColor(layer, red, green, blue);
                    }
                }

                for (const layer of pixelLayers) {
                    if (shiftPressed) {
                        await applyTextStrokeColor(layer, red, green, blue);
                    } else {
                        await applyRasterColor(layer, red, green, blue);
                    }
                }
            }, { commandName: '设置图层颜色' });

            const hexColor = rgbToHex(color);
            PanelState.selectedColor = hexColor;
            const targetContainer = containerType === 'foreground'
                ? rootNode.querySelector('#foregroundGrid')
                : rootNode.querySelector('#manualGrid');
            updateSelectedStates(hexColor, targetContainer);

        } catch (e) {
            console.error('[ColorPanel] 应用颜色失败:', e);
            showToast('应用颜色失败: ' + e.message);
        }
    }

    function renderForegroundSection() {
        const container = rootNode.querySelector('#foregroundGrid');
        if (!container) return;

        PanelState.foregroundColors = ForegroundColorStorage.getAll();

        container.innerHTML = '';

        PanelState.foregroundColors.forEach((color) => {
            const btn = document.createElement('div');
            btn.className = 'color-btn';
            btn.innerHTML = '<div class="color-inner"></div>';
            const inner = btn.querySelector('.color-inner');
            inner.style.backgroundColor = rgbToHex(color);

            btn.title = color;
            btn.dataset.color = rgbToHex(color);
            btn.dataset.container = 'foreground';

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                applyColorToLayer(color, 'foreground', e);
            });

            container.appendChild(btn);
        });
    }

    function renderManualSection() {
        const container = rootNode.querySelector('#manualGrid');
        if (!container) return;

        PanelState.manualColors = ManualColorStorage.getAll();

        container.innerHTML = '';

        const listWrap = document.createElement('div');
        listWrap.id = 'manualListWrap';

        const bottomBar = document.createElement('div');
        bottomBar.id = 'bottomBar';

        PanelState.manualColors.forEach((color, index) => {
            const btn = document.createElement('div');
            btn.className = 'color-btn';
            btn.innerHTML = '<div class="color-inner"></div>';
            const inner = btn.querySelector('.color-inner');
            inner.style.backgroundColor = rgbToHex(color);

            btn.title = color;
            btn.dataset.color = rgbToHex(color);
            btn.dataset.container = 'manual';

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                applyColorToLayer(color, 'manual', e);
            });

            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                deleteManualColor(index);
            });

            listWrap.appendChild(btn);
        });

        const addBtn = document.createElement('div');
        addBtn.id = 'addColorBtn';
        addBtn.title = '添加当前前景色';
        addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';

        addBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await addCurrentForegroundColor();
        });

        listWrap.appendChild(addBtn);

        const removeBtn = document.createElement('div');
        removeBtn.id = 'removeColorBtn';
        removeBtn.title = '移除图层填充色';
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>';

        removeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.removeLayerFill(e.shiftKey);
        });

        const swapBtn = document.createElement('div');
        swapBtn.id = 'swapColorBtn';
        swapBtn.title = '交换填充和描边颜色';
        swapBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>';

        swapBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.swapFillAndStroke(e);
        });

        bottomBar.appendChild(removeBtn);
        bottomBar.appendChild(swapBtn);

        container.appendChild(listWrap);
        container.appendChild(bottomBar);
    }

    async function addCurrentForegroundColor() {
        try {
            const color = await window.getColorPanelForegroundColor();

            if (color) {
                PanelState.manualColors = ManualColorStorage.add(color);
                renderManualSection();
            } else {
                showToast('获取前景色失败');
            }
        } catch (e) {
            console.error('[ColorPanel] 添加颜色失败:', e);
            showToast('添加颜色失败');
        }
    }

    function deleteManualColor(index) {
        PanelState.manualColors = ManualColorStorage.remove(index);
        renderManualSection();
    }

    function updateSelectedStates(selectedColor, container) {
        return;
    }

    async function handleForegroundColorChange(color) {
        if (color === PanelState.lastForegroundColor) return;

        PanelState.lastForegroundColor = color;
        PanelState.foregroundColors = ForegroundColorStorage.add(color);

        renderForegroundSection();
    }

    async function initColorPanel(root) {
        rootNode = root;
        rootNode.classList.add('color-panel-root');

        PanelState.foregroundColors = ForegroundColorStorage.getAll();
        PanelState.manualColors = ManualColorStorage.getAll();

        renderForegroundSection();
        renderManualSection();

        if (typeof window.onColorPanelForegroundColorChange === 'function') {
            window.onColorPanelForegroundColorChange(handleForegroundColorChange);
        }

        if (typeof window.startColorPanelForegroundPolling === 'function') {
            window.startColorPanelForegroundPolling();
        }

        try {
            if (typeof window.getColorPanelForegroundColor === 'function') {
                const initialColor = await window.getColorPanelForegroundColor();
                if (initialColor) {
                    PanelState.lastForegroundColor = initialColor;
                    handleForegroundColorChange(initialColor);
                }
            }
        } catch (e) {
            console.error('[ColorPanel] 获取初始前景色失败:', e);
        }
    }

    function cleanupColorPanel() {
        PanelState.shapeToggleMemory = {};
        if (typeof window.stopColorPanelForegroundPolling === 'function') {
            window.stopColorPanelForegroundPolling();
        }
        if (rootNode) {
            rootNode.classList.remove('color-panel-root');
        }
        rootNode = null;
    }

    window.initColorPanel = initColorPanel;
    window.cleanupColorPanel = cleanupColorPanel;
    window.applyColorToLayer = applyColorToLayer;
    window.removeLayerFill = removeLayerFill;
    window.swapFillAndStroke = swapFillAndStroke;
    window.refreshColorPanel = function refreshColorPanel() {
        if (!rootNode) return;
        renderForegroundSection();
        renderManualSection();
    };

    async function removeLayerFill(shiftPressed) {
        try {
            const photoshop = require('photoshop');

            await photoshop.core.executeAsModal(async () => {
                const app = photoshop.app;
                const activeDocument = app.activeDocument;

                if (!activeDocument) {
                    throw new Error('没有活动文档');
                }

                const selectedLayers = activeDocument.activeLayers;

                if (!selectedLayers || selectedLayers.length === 0) {
                    throw new Error('没有选中的图层');
                }

                const nonPixelLayers = [];
                const pixelLayers = [];

                for (const layer of selectedLayers) {
                    if (classifyLayer(layer, photoshop) === 'pixel') {
                        pixelLayers.push(layer);
                    } else {
                        nonPixelLayers.push(layer);
                    }
                }

                for (const layer of nonPixelLayers) {
                    const layerType = classifyLayer(layer, photoshop);

                    if (layerType === 'text') {
                        if (shiftPressed) {
                            await removeTextLayerStyle(layer);
                        } else {
                            await removeTextColor(layer);
                        }
                    } else if (layerType === 'group' || layerType === 'smartObject') {
                        if (shiftPressed) {
                            await removeLayerStrokeFx(layer);
                        } else {
                            await removeLayerColorOverlay(layer);
                        }
                    } else {
                        if (shiftPressed) {
                            await removeStrokeColor(layer);
                        } else {
                            await removeFillColor(layer);
                        }
                    }
                }

                for (const layer of pixelLayers) {
                    if (shiftPressed) {
                        await removeLayerStrokeFx(layer);
                    } else {
                        await removeLayerColorOverlay(layer);
                    }
                }
            }, { commandName: '移除图层颜色' });
        } catch (e) {
            console.error('[ColorPanel] 移除颜色失败:', e);
            showToast('移除颜色失败: ' + e.message);
        }
    }

    async function removeTextColor(layer) {
        try {
            const SolidColor = require('photoshop').app.SolidColor;
            const textColor = new SolidColor();
            textColor.rgb.red = 0;
            textColor.rgb.green = 0;
            textColor.rgb.blue = 0;
            layer.textItem.characterStyle.color = textColor;
        } catch (err) {
            console.error('[ColorPanel] 移除文字颜色失败:', err);
        }
    }

    async function removeTextLayerStyle(layer) {
        try {
            await removeLayerStrokeFx(layer);
        } catch (err) {
            console.error('[ColorPanel] 移除图层样式失败:', err);
        }
    }

    async function removeLayerStrokeFx(layer) {
        const photoshop = require('photoshop');
        try {
            const getCmd = [{
                _obj: 'get',
                _target: [{ _ref: 'layer', _id: layer.id }],
                _prop: 'layerStyle'
            }];

            const res = await photoshop.action.batchPlay(getCmd, {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });

            const layerStyle = res && res[0] ? res[0] : null;
            const effects = layerStyle && layerStyle.layerEffects ? layerStyle.layerEffects : null;
            const hasFrameFx = !!(effects && (effects.frameFX || (effects.frameFXMulti && effects.frameFXMulti.length)));
            if (!hasFrameFx) return;

            const newEffects = Object.assign({}, effects);
            delete newEffects.frameFX;
            delete newEffects.frameFXMulti;

            const setCmd = [{
                _obj: 'set',
                _target: [{ _ref: 'layer', _id: layer.id }],
                to: {
                    _obj: 'layerStyle',
                    layerEffects: newEffects
                }
            }];

            await photoshop.action.batchPlay(setCmd, {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });
        } catch (err) {
            console.error('[ColorPanel] 移除描边(frameFX)失败:', err);
        }
    }

    async function removeLayerColorOverlay(layer) {
        const photoshop = require('photoshop');
        try {
            const cmd = [{
                _obj: 'set',
                _target: [{ _ref: 'layer', _id: layer.id }],
                to: {
                    _obj: 'layerStyle',
                    layerEffects: {
                        _obj: 'layerEffects',
                        solidFillMulti: [{
                            _obj: 'solidFill',
                            enabled: false
                        }]
                    }
                }
            }];

            await photoshop.action.batchPlay(cmd, {
                synchronousExecution: false,
                modalBehavior: 'execute'
            });
        } catch (err) {
            console.error('[ColorPanel] 移除颜色叠加(solidFill)失败:', err);
        }
    }

    async function removeFillColor(layer) {
        const photoshop = require('photoshop');
        try {
            const shapeState = await readShapeState(layer, photoshop);
            await applyShapeState(layer, {
                ...shapeState,
                fillEnabled: false,
                fillColor: null
            }, photoshop);
            clearRememberedToggleDirection(layer.id);
        } catch (err) {
            console.error('[ColorPanel] 移除填充色失败:', err);
        }
    }

    async function removeStrokeColor(layer) {
        const photoshop = require('photoshop');
        try {
            const shapeState = await readShapeState(layer, photoshop);
            await applyShapeState(layer, {
                ...shapeState,
                strokeEnabled: false,
                strokeColor: null
            }, photoshop);
            clearRememberedToggleDirection(layer.id);
        } catch (err) {
            console.error('[ColorPanel] 移除描边色失败:', err);
        }
    }

    async function swapFillAndStroke(e) {
        const shiftPressed = e && e.shiftKey;
        const photoshop = require('photoshop');
        try {
            await photoshop.core.executeAsModal(async () => {
                const app = photoshop.app;
                const activeDocument = app.activeDocument;

                if (!activeDocument) {
                    throw new Error('没有活动文档');
                }

                const selectedLayers = activeDocument.activeLayers;

                if (!selectedLayers || selectedLayers.length === 0) {
                    throw new Error('没有选中的图层');
                }

                const shapeLayers = [];

                for (const layer of selectedLayers) {
                    if (classifyLayer(layer, photoshop) === 'shape') {
                        shapeLayers.push(layer);
                    }
                }

                for (const layer of shapeLayers) {
                    if (shiftPressed) {
                        await swapFillStrokeState(layer);
                    } else {
                        await swapLayerColors(layer);
                    }
                }
            }, { commandName: shiftPressed ? '交换填充描边状态' : '交换填充描边颜色' });
        } catch (e) {
            console.error('[ColorPanel] 交换失败:', e);
            showToast('交换失败: ' + e.message);
        }
    }

    async function swapFillStrokeState(layer) {
        const photoshop = require('photoshop');
        try {
            const shapeState = await readShapeState(layer, photoshop);
            const swapPlan = buildSwapShapeState(layer, shapeState);

            if (!swapPlan) {
                clearRememberedToggleDirection(layer.id);
                return;
            }

            await applyShapeState(layer, swapPlan.nextState, photoshop);
            setRememberedToggleDirection(layer.id, swapPlan.direction);
        } catch (err) {
            console.error('[ColorPanel] 交换状态失败:', err);
        }
    }

    async function swapLayerColors(layer) {
        const photoshop = require('photoshop');
        try {
            const shapeState = await readShapeState(layer, photoshop);
            const nextFillColor = shapeState.strokeColor || null;
            const nextStrokeColor = shapeState.fillColor || null;

            await applyShapeState(layer, {
                fillEnabled: shapeState.strokeEnabled && !!nextFillColor,
                fillColor: nextFillColor,
                strokeEnabled: shapeState.fillEnabled && !!nextStrokeColor,
                strokeColor: nextStrokeColor,
                strokeWidth: shapeState.strokeWidth
            }, photoshop);
        } catch (err) {
            console.error('[ColorPanel] 交换图层颜色失败:', err);
        }
    }
})();
