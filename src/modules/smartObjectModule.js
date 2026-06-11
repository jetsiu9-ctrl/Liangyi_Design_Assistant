/**
 * 智能对象模块
 * 批量修改智能对象的原始分辨率
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'haimati_smartobject_settings';
    const defaultSettings = {
        enabled: true,
        targetDpi: 72
    };
    let _cachedSmartObjects = []; // 缓存查询到的智能对象
    let _currentSettings = { ...defaultSettings };

    function normalizeSettings(raw = {}) {
        const parsedDpi = parseInt(raw.targetDpi, 10);
        return {
            enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaultSettings.enabled,
            targetDpi: Number.isFinite(parsedDpi) && parsedDpi > 0 ? parsedDpi : defaultSettings.targetDpi
        };
    }

    function getEffectiveSettings(overrideSettings) {
        return normalizeSettings(overrideSettings ? { ..._currentSettings, ...overrideSettings } : _currentSettings);
    }

    function persistSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_currentSettings));
            return true;
        } catch (e) {
            console.error('[SmartObjectModule] 保存设置失败:', e);
            return false;
        }
    }

    const SmartObjectModule = {
        init() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    _currentSettings = normalizeSettings(JSON.parse(saved));
                } else {
                    _currentSettings = normalizeSettings(defaultSettings);
                }
            } catch (e) {
                console.error('[SmartObjectModule] 加载设置失败:', e);
                _currentSettings = normalizeSettings(defaultSettings);
            }
            return { ..._currentSettings };
        },

        getState() {
            return { ..._currentSettings };
        },

        setState(partial, options = {}) {
            _currentSettings = normalizeSettings({ ..._currentSettings, ...(partial || {}) });
            if (options.persist) {
                persistSettings();
            }
            return { ..._currentSettings };
        },

        replaceState(nextState, options = {}) {
            _currentSettings = normalizeSettings(nextState || defaultSettings);
            if (options.persist) {
                persistSettings();
            }
            return { ..._currentSettings };
        },

        resetState(options = {}) {
            _currentSettings = normalizeSettings(defaultSettings);
            if (options.persist) {
                persistSettings();
            }
            return { ..._currentSettings };
        },

        persist() {
            return persistSettings();
        },

        execute(overrideSettings) {
            return this.doExecute(overrideSettings);
        },

        getDefaultSettings() {
            return { ...defaultSettings };
        },

        // 查询当前文档的所有智能对象
        async querySmartObjects() {
            const photoshop = require('photoshop');
            const { app, core } = photoshop;
            const doc = app.activeDocument;

            if (!doc) {
                throw new Error('没有活动文档');
            }

            _cachedSmartObjects = [];

            try {
                return await core.executeAsModal(async () => {
                    // 递归遍历所有图层
                    const collectLayers = (layers, depth = 0) => {
                        const indent = '  '.repeat(depth);
                        for (const layer of layers) {
                            // kind 是字符串: "smartObject"
                            if (layer.kind === 'smartObject') {
                                _cachedSmartObjects.push({
                                    id: layer.id,
                                    name: layer.name,
                                    bounds: layer.bounds,
                                    dpi: 72
                                });
                                console.log(indent + '-> 发现智能对象:', layer.name);
                            }
                            // 递归处理图层组: typename === 'LayerSet' 或 kind === 'group'
                            if (layer.typename === 'LayerSet' || layer.kind === 'group') {
                                try {
                                    if (layer.layers && layer.layers.length > 0) {
                                        console.log(indent + '[进入图层组]', layer.name);
                                        collectLayers(layer.layers, depth + 1);
                                    }
                                } catch (e) {
                                    console.log(indent + '无法进入图层组:', e.message);
                                }
                            }
                        }
                    };

                    collectLayers(doc.layers);
                    console.log('[SmartObjectModule] 共找到', _cachedSmartObjects.length, '个智能对象');

                    return _cachedSmartObjects;
                }, { commandName: '查询智能对象' });
            } catch (e) {
                console.error('[SmartObjectModule] 查询智能对象失败:', e);
                throw e;
            }
        },

        // 从 batchPlay 结果中提取图层信息（递归处理图层组）
        _extractLayersFromResult(result, doc) {
            const layers = [];

            if (!result || !result[0] || !result[0].layers) {
                return layers;
            }

            const processLayerList = (layerList) => {
                for (const layerInfo of layerList) {
                    try {
                        // 获取对应的图层对象
                        const layer = doc.layers.find(l => l.id === layerInfo.id);
                        if (layer) {
                            layers.push(layer);
                        }
                        // 递归处理子图层（如果有）
                        if (layerInfo.layers && layerInfo.layers.length > 0) {
                            processLayerList(layerInfo.layers);
                        }
                    } catch (e) {
                        console.log('[SmartObjectModule] 无法获取图层:', layerInfo);
                    }
                }
            };

            processLayerList(result[0].layers);
            return layers;
        },

        // 获取缓存的智能对象列表
        getCachedSmartObjects() {
            return _cachedSmartObjects;
        },

        // 修改智能对象分辨率
        // 流程：placedLayerEditContents → imageSize(resolution) → save → close(内部文档)
        async doExecute(overrideSettings) {
            const settings = getEffectiveSettings(overrideSettings);
            const targetDpi = settings.targetDpi;

            if (_cachedSmartObjects.length === 0) {
                throw new Error('请先查询智能对象');
            }

            const photoshop = require('photoshop');
            const { app, action, core } = photoshop;

            try {
                    return await core.executeAsModal(async () => {
                    // 保存主文档 ID
                    const mainDocId = app.activeDocument.id;
                    let modifiedCount = 0;

                    for (const soInfo of _cachedSmartObjects) {
                        try {
                            // 用 batchPlay 直接选中图层，不依赖 DOM layers 缓存
                            await action.batchPlay([{
                                _obj: "select",
                                _target: [{ _ref: "layer", _id: soInfo.id }],
                                _enum: "ordinal",
                                _value: "targetEnum"
                            }], {});

                            // Step 1: 打开智能对象内容
                            await action.batchPlay([{
                                _obj: "placedLayerEditContents",
                                documentID: mainDocId,
                                layerID: soInfo.id
                            }], {});

                            // Step 2: 修改分辨率（不改尺寸）
                            await action.batchPlay([{
                                _obj: "imageSize",
                                constrainProportions: true,
                                resolution: { _unit: "densityUnit", _value: targetDpi },
                                scaleStyles: true,
                                interfaceIconFrameDimmed: {
                                    _enum: "interpolationType",
                                    _value: "automaticInterpolation"
                                }
                            }], {});

                            // Step 3: 保存
                            await action.batchPlay([{ _obj: "save" }], {});

                            // Step 4: 关闭内部文档
                            const innerDocId = app.activeDocument.id;
                            await action.batchPlay([{
                                _obj: "close",
                                documentID: innerDocId,
                                forceNotify: true
                            }], {});

                            modifiedCount++;
                            console.log('[SmartObjectModule] 已修改智能对象:', soInfo.name, '分辨率为', targetDpi + 'DPI');
                        } catch (e) {
                            console.error('[SmartObjectModule] 修改失败:', soInfo.name, e);
                        }
                    }

                    return { total: _cachedSmartObjects.length, modified: modifiedCount };
                }, { commandName: '修改智能对象分辨率' });
            } catch (e) {
                console.error('[SmartObjectModule] 修改分辨率失败:', e);
                throw e;
            }
        },

        // 只修改选中的智能对象
        async applyToSelected(selectedItems, overrideSettings) {
            const settings = getEffectiveSettings(overrideSettings);
            const targetDpi = settings.targetDpi;

            if (selectedItems.length === 0) {
                return { modified: 0 };
            }

            const photoshop = require('photoshop');
            const { app, action, core } = photoshop;

            try {
                    return await core.executeAsModal(async () => {
                    // 保存主文档 ID
                    const mainDocId = app.activeDocument.id;
                    let modifiedCount = 0;

                    for (const soInfo of _cachedSmartObjects) {
                        if (!selectedItems.find(item => item.id === soInfo.id)) continue;

                        try {
                            // 用 batchPlay 直接选中图层，不依赖 DOM layers 缓存
                            await action.batchPlay([{
                                _obj: "select",
                                _target: [{ _ref: "layer", _id: soInfo.id }],
                                _enum: "ordinal",
                                _value: "targetEnum"
                            }], {});

                            // Step 1: 打开智能对象内容
                            await action.batchPlay([{
                                _obj: "placedLayerEditContents",
                                documentID: mainDocId,
                                layerID: soInfo.id
                            }], {});

                            // Step 2: 修改分辨率（不改尺寸）
                            await action.batchPlay([{
                                _obj: "imageSize",
                                constrainProportions: true,
                                resolution: { _unit: "densityUnit", _value: targetDpi },
                                scaleStyles: true,
                                interfaceIconFrameDimmed: {
                                    _enum: "interpolationType",
                                    _value: "automaticInterpolation"
                                }
                            }], {});

                            // Step 3: 保存
                            await action.batchPlay([{ _obj: "save" }], {});

                            // Step 4: 关闭内部文档
                            const innerDocId = app.activeDocument.id;
                            await action.batchPlay([{
                                _obj: "close",
                                documentID: innerDocId,
                                forceNotify: true
                            }], {});

                            modifiedCount++;
                            console.log('[SmartObjectModule] 已修改智能对象:', soInfo.name, '分辨率为', targetDpi + 'DPI');
                        } catch (e) {
                            console.error('[SmartObjectModule] 修改失败:', soInfo.name, e);
                        }
                    }

                    return { modified: modifiedCount };
                }, { commandName: '修改选中智能对象分辨率' });
            } catch (e) {
                console.error('[SmartObjectModule] 修改分辨率失败:', e);
                throw e;
            }
        }
    };

    // 暴露到全局
    window.SmartObjectModule = SmartObjectModule;

})();
