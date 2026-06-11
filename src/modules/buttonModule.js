/**
 * 按钮生成模块
 * 使用PS矩形工具绘制形状图层作为文字图层的底色按钮
 * 该实现为 Photoshop UXP API 实现，不使用 CEP / JSX / CSInterface
 */

(function() {
    'use strict';

    const defaultSettings = {
        buttonColor: { r: 0, g: 0, b: 0, a: 1 },
        widthOffset: 0,
        heightOffset: 0,
        cornerRadius: 0
    };

    function normalizeButtonSettings(raw = {}) {
        return {
            buttonColor: raw.buttonColor || defaultSettings.buttonColor,
            widthOffset: typeof raw.widthOffset === 'number' ? raw.widthOffset : (parseInt(raw.widthOffset, 10) || 0),
            heightOffset: typeof raw.heightOffset === 'number' ? raw.heightOffset : (parseInt(raw.heightOffset, 10) || 0),
            cornerRadius: typeof raw.cornerRadius === 'number' ? raw.cornerRadius : (parseInt(raw.cornerRadius, 10) || 0)
        };
    }

    const ButtonModule = {
        settings: normalizeButtonSettings(defaultSettings),

        init() {
            this.settings = normalizeButtonSettings(ButtonStorage.getAll());
            return this.getState();
        },

        setState(partial, options = {}) {
            this.settings = normalizeButtonSettings({ ...this.settings, ...(partial || {}) });
            if (options.persist) {
                this.persist();
            }
            return this.getState();
        },

        replaceState(nextState, options = {}) {
            this.settings = normalizeButtonSettings(nextState || defaultSettings);
            if (options.persist) {
                this.persist();
            }
            return this.getState();
        },

        resetState(options = {}) {
            this.settings = normalizeButtonSettings(defaultSettings);
            if (options.persist) {
                this.persist();
            }
            return this.getState();
        },

        persist() {
            ButtonStorage.update(this.settings);
            return this.getState();
        },

        execute(overrideSettings) {
            return this.doGenerateButton(overrideSettings);
        },

        getState() {
            return normalizeButtonSettings(this.settings);
        },

        // 实际执行逻辑
        async doGenerateButton(overrideSettings) {
            const photoshop = require('photoshop');
            const { core } = photoshop;
            const previousSettings = this.settings;
            const executionSettings = normalizeButtonSettings(overrideSettings ? { ...this.settings, ...overrideSettings } : this.settings);

            try {
                this.settings = executionSettings;
                console.log('[ButtonModule] 执行使用设置:', this.settings);

                return await core.executeAsModal(async () => {
                    return await this.executeButtonGeneration();
                }, { commandName: '生成按钮' });
            } catch (e) {
                console.error('[ButtonModule] 生成按钮失败:', e);
                throw e;
            } finally {
                this.settings = previousSettings;
            }
        },

        // 在 modal scope 内执行按钮生成
        async executeButtonGeneration() {
            const photoshop = require('photoshop');
            const { action } = photoshop;
            const app = photoshop.app;
            const activeDocument = app.activeDocument;

            if (!activeDocument) {
                throw new Error('没有活动文档');
            }

            // 获取选中的图层
            const selectedLayers = activeDocument.activeLayers;
            if (!selectedLayers || selectedLayers.length === 0) {
                throw new Error('请先选择文字图层');
            }

            console.log('[ButtonModule] 选中的图层数量:', selectedLayers.length);

            const results = [];

            for (const textLayer of selectedLayers) {
                try {
                    // 检查是否是文字图层
                    if (textLayer.kind !== photoshop.constants.LayerKind.TEXT) {
                        console.log('[ButtonModule] 图层不是文字图层，跳过:', textLayer.name);
                        continue;
                    }

                    console.log('[ButtonModule] 处理文字图层:', textLayer.name);

                    // 获取文字图层的边界
                    const bounds = textLayer.bounds;
                    const layerX = bounds.left;
                    const layerY = bounds.top;
                    const layerWidth = bounds.right - bounds.left;
                    const layerHeight = bounds.bottom - bounds.top;

                    console.log('[ButtonModule] 文字图层边界:', { layerX, layerY, layerWidth, layerHeight });

                    // 计算按钮大小
                    const buttonWidth = layerWidth + this.settings.widthOffset * 2;
                    const buttonHeight = layerHeight + this.settings.heightOffset * 2;

                    // 按钮位置 - 按钮底边对齐文字底边
                    const buttonX = layerX - this.settings.widthOffset;
                    const buttonY = layerY - this.settings.heightOffset;

                    console.log('[ButtonModule] 按钮尺寸:', { buttonX, buttonY, buttonWidth, buttonHeight });

                    // 颜色值 (0-255 范围)
                    const r = Math.round(this.settings.buttonColor.r * 255);
                    const g = Math.round(this.settings.buttonColor.g * 255);
                    const b = Math.round(this.settings.buttonColor.b * 255);

                    const textLayerName = textLayer.name;
                    const textLayerId = textLayer.id;

                    // 使用 batchPlay 创建矩形形状图层（圆角先设为0）
                    await action.batchPlay([{
                        "_obj": "make",
                        "_target": [
                            {
                                "_ref": "contentLayer"
                            }
                        ],
                        "using": {
                            "_obj": "contentLayer",
                            "type": {
                                "_obj": "solidColorLayer",
                                "color": {
                                    "_obj": "RGBColor",
                                    "red": r,
                                    "grain": g,
                                    "blue": b
                                }
                            },
                            "shape": {
                                "_obj": "rectangle",
                                "top": buttonY,
                                "left": buttonX,
                                "bottom": buttonY + buttonHeight,
                                "right": buttonX + buttonWidth,
                                "topLeftRadius": 0,
                                "topRightRadius": 0,
                                "bottomLeftRadius": 0,
                                "bottomRightRadius": 0
                            }
                        },
                        "name": textLayerName + '_按钮底色'
                    }], {});

                    console.log('[ButtonModule] 形状图层创建完成');

                    // 使用 changePathDetails 设置圆角
                    if (this.settings.cornerRadius > 0) {
                        await action.batchPlay([{
                            "_obj": "changePathDetails",
                            "keyActionChangeAllCorners": true,
                            "keyActionRadiiSource": 0,
                            "keyOriginRRectRadii": {
                                "_obj": "radii",
                                "bottomLeft": {
                                    "_unit": "pixelsUnit",
                                    "_value": this.settings.cornerRadius
                                },
                                "bottomRight": {
                                    "_unit": "pixelsUnit",
                                    "_value": this.settings.cornerRadius
                                },
                                "topLeft": {
                                    "_unit": "pixelsUnit",
                                    "_value": this.settings.cornerRadius
                                },
                                "topRight": {
                                    "_unit": "pixelsUnit",
                                    "_value": this.settings.cornerRadius
                                },
                                "unitValueQuadVersion": 1
                            },
                            "keyOriginResolution": 72.0,
                            "keyOriginType": 1
                        }], {});
                        console.log('[ButtonModule] 圆角设置完成:', this.settings.cornerRadius);
                    }

                    // 使用 batchPlay 将新图层向下移动一层
                    await action.batchPlay([{
                        "_obj": "move",
                        "_target": [
                            {
                                "_enum": "ordinal",
                                "_ref": "layer",
                                "_value": "targetEnum"
                            }
                        ],
                        "to": {
                            "_enum": "ordinal",
                            "_ref": "layer",
                            "_value": "previous"
                        }
                    }], {});

                    console.log('[ButtonModule] 图层向下移动一层完成');

                    results.push({
                        success: true,
                        textLayerName: textLayerName,
                        buttonBounds: { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight }
                    });

                    console.log('[ButtonModule] 按钮生成成功:', textLayerName);

                } catch (e) {
                    console.error('[ButtonModule] 处理图层失败:', e);
                    results.push({
                        success: false,
                        textLayerName: textLayer.name,
                        error: e.message
                    });
                }
            }

            return {
                success: results.some(r => r.success),
                results: results
            };
        }
    };

    // 按钮设置存储
    const ButtonStorage = {
        STORAGE_KEY: 'buttonSettings',

        getAll() {
            try {
                const data = localStorage.getItem(this.STORAGE_KEY);
                return data ? JSON.parse(data) : {};
            } catch (e) {
                console.error('[ButtonStorage] 读取失败:', e);
                return {};
            }
        },

        get(key) {
            const all = this.getAll();
            return all[key];
        },

        set(key, value) {
            const all = this.getAll();
            all[key] = value;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
        },

        update(newSettings) {
            const all = this.getAll();
            Object.assign(all, newSettings);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
        }
    };

    // 暴露到全局
    window.ButtonModule = ButtonModule;
    window.ButtonStorage = ButtonStorage;

})();
