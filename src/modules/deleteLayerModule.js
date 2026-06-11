/**
 * 删除图层模块
 * 删除空白图层和隐藏图层
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'haimati_delete_layer_settings';
    const defaultSettings = {
        deleteEmpty: true,
        deleteHidden: true
    };

    let _currentSettings = { ...defaultSettings };

    let _cachedLayers = [];

    function normalizeSettings(raw = {}) {
        return {
            deleteEmpty: typeof raw.deleteEmpty === 'boolean' ? raw.deleteEmpty : defaultSettings.deleteEmpty,
            deleteHidden: typeof raw.deleteHidden === 'boolean' ? raw.deleteHidden : defaultSettings.deleteHidden
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
            console.error('[DeleteLayerModule] 保存设置失败:', e);
            return false;
        }
    }

    const DeleteLayerModule = {
        init() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    _currentSettings = normalizeSettings(JSON.parse(saved));
                } else {
                    _currentSettings = normalizeSettings(defaultSettings);
                }
            } catch (e) {
                console.error('[DeleteLayerModule] 加载设置失败:', e);
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

        scan(overrideSettings) {
            return this.doScan(overrideSettings);
        },

        // 扫描需要删除的图层
        async doScan(overrideSettings) {
            const settings = getEffectiveSettings(overrideSettings);

            if (!settings.deleteEmpty && !settings.deleteHidden) {
                return [];
            }

            const photoshop = require('photoshop');
            const { app, core } = photoshop;
            const doc = app.activeDocument;

            if (!doc) {
                throw new Error('没有活动文档');
            }

            _cachedLayers = [];

            try {
                return await core.executeAsModal(async () => {
                    const photoshop = require('photoshop');
                    const { action } = photoshop;

                    // 用 batchPlay 一次性获取所有图层的真实 boundsNoEffects
                    // 避免 layer.bounds 返回 NaN 的问题
                    const allLayers = [];
                    const collectAllLayerIds = (layers) => {
                        for (const layer of layers) {
                            allLayers.push(layer);
                            if (layer.typename === 'LayerSet' || layer.kind === 'group') {
                                try {
                                    if (layer.layers) {
                                        collectAllLayerIds(layer.layers);
                                    }
                                } catch (e) {}
                            }
                        }
                    };
                    collectAllLayerIds(doc.layers);

                    // 用 multiGet 一次性获取所有图层属性 (官方推荐方式)
                    // extendedReference 第二参数 doc 指定文档ID，count:-1 递归获取所有图层
                    let boundsResults = [];
                    try {
                        const multiGetCmd = {
                            _obj: 'multiGet',
                            _target: { _ref: [{ _ref: 'document', _id: doc.id }] },
                            extendedReference: [
                                ['name', 'layerID', 'opacity', 'fillOpacity', 'bounds', 'boundsNoEffects'],
                                { _obj: 'layer', index: 0, count: -1, doc: doc.id }
                            ],
                            options: { failOnMissingProperty: false, failOnMissingElement: false }
                        };
                        const bpResult = await action.batchPlay([multiGetCmd], {
                            synchronousExecution: false,
                            modalBehavior: 'execute'
                        });
                        // multiGet 返回结构: [{list: [{...}, {...}]}]
                        if (bpResult && bpResult[0] && bpResult[0].list) {
                            boundsResults = bpResult[0].list;
                        }
                        console.log('[DeleteLayerModule] multiGet 获取到', boundsResults.length, '个图层结果');
                    } catch (e) {
                        console.log('[DeleteLayerModule] multiGet 获取失败:', e.message);
                    }

                    // 解析每个图层的 bounds - 用 layerID 匹配
                    const boundsMap = new Map(); // layerId -> {width, height, opacity, fillOpacity}
                    // 按 layerID 重新组织 batchPlay 结果
                    boundsResults.forEach((r, ri) => {
                        if (!r || !r.layerID) {
                            return;
                        }
                        const b = r.boundsNoEffects || r.bounds;
                        if (!b) {
                            return;
                        }
                        const getVal = (v) => {
                            if (v === undefined || v === null) return 0;
                            // batchPlay 返回 {"_unit":"pixelsUnit","_value":38}，DOM 返回纯数字
                            if (typeof v === 'object') {
                                if (v._value !== undefined) return v._value;
                                if (v.value !== undefined) return v.value;
                                return 0;
                            }
                            return parseFloat(v) || 0;
                        };
                        // 优先用 width/height 字段，其次用 right-left / bottom-top
                        const w = getVal(b.width);
                        const h = getVal(b.height);
                        const finalWidth = w > 0 ? w : (getVal(b.right) - getVal(b.left));
                        const finalHeight = h > 0 ? h : (getVal(b.bottom) - getVal(b.top));
                        // opacity/fillOpacity 在 batchPlay 中是 0-255
                        const opacity = r.opacity !== undefined ? (r.opacity / 255) * 100 : 100;
                        const fillOpacity = r.fillOpacity !== undefined ? (r.fillOpacity / 255) * 100 : 100;
                        boundsMap.set(r.layerID, { width: finalWidth, height: finalHeight, opacity, fillOpacity });
                    });

                    const collectLayers = (layers, depth = 0) => {
                        const indent = '  '.repeat(depth);
                        for (const layer of layers) {
                            let shouldCollect = false;
                            let layerType = '';

                            const b = boundsMap.get(layer.id);
                            const width = b ? b.width : 0;
                            const height = b ? b.height : 0;
                            const opacity = b ? b.opacity : 100;
                            const fillOpacity = b ? b.fillOpacity : 100;

                            // 通用调试日志
                            console.log(indent + 'Layer:', layer.name,
                                '| id:', layer.id,
                                '| kind:', layer.kind,
                                '| visible:', layer.visible,
                                '| bounds:', width.toFixed(2) + 'x' + height.toFixed(2),
                                '| opacity:', opacity.toFixed(0),
                                '| fillOpacity:', fillOpacity.toFixed(0));

                            // 隐藏图层
                            if (settings.deleteHidden && !layer.visible) {
                                shouldCollect = true;
                                layerType = '隐藏图层';
                            }

                            // 空白文字图层 kind === 'text'
                            if (settings.deleteEmpty && layer.kind === 'text') {
                                try {
                                    const text = layer.textItem.contents;
                                    if (!text || text.trim() === '') {
                                        shouldCollect = true;
                                        layerType = '空白文字';
                                    }
                                } catch (e) {}
                            }

                            // 空白图层通用检测 (solidColor / shape / pixel / smartObject)
                            // 判定条件: bounds 为 0 OR opacity/fillOpacity 为 0 (已转 0-100)
                            const boundsEmpty = (width < 0.1 && height < 0.1);
                            const fullyTransparent = opacity < 1 || fillOpacity < 1;

                            if (settings.deleteEmpty && boundsEmpty) {
                                shouldCollect = true;
                                if (layer.kind === 'solidColor') layerType = '空白纯色';
                                else if (layer.kind === 'shape') layerType = '空白形状';
                                else if (layer.kind === 'pixel') layerType = '空白像素';
                                else if (layer.kind === 'smartObject') layerType = '空白智能对象';
                            } else if (settings.deleteEmpty && fullyTransparent && layer.kind !== 'group') {
                                shouldCollect = true;
                                if (layer.kind === 'solidColor') layerType = '全透明纯色';
                                else if (layer.kind === 'shape') layerType = '全透明形状';
                                else if (layer.kind === 'pixel') layerType = '全透明像素';
                                else if (layer.kind === 'smartObject') layerType = '全透明智能对象';
                                else if (layer.kind === 'text') layerType = '全透明文字';
                            }

                            if (shouldCollect) {
                                // 不收集组本身，只收集组内的具体图层
                                if (layer.kind !== 'group') {
                                    console.log(indent + '发现待删除:', layer.name, layerType);
                                    _cachedLayers.push({
                                        id: layer.id,
                                        name: layer.name,
                                        layerType: layerType,
                                        depth: depth  // 记录深度，删除时按深度排序
                                    });
                                }
                            }

                            // 递归处理图层组
                            if (layer.typename === 'LayerSet' || layer.kind === 'group') {
                                try {
                                    if (layer.layers && layer.layers.length > 0) {
                                        console.log(indent + '[进入图层组]', layer.name);
                                        collectLayers(layer.layers, depth + 1);
                                    }
                                } catch (e) {}
                            }
                        }
                    };

                    collectLayers(doc.layers);
                    console.log('[DeleteLayerModule] 扫描到', _cachedLayers.length, '个待删除图层');

                    return _cachedLayers;
                }, { commandName: '扫描图层' });
            } catch (e) {
                console.error('[DeleteLayerModule] 扫描图层失败:', e);
                throw e;
            }
        },

        // 检查图层是否为空（使用 batchPlay 获取真实 bounds）
        async _isLayerEmpty(layer) {
            try {
                const photoshop = require('photoshop');
                const { action } = photoshop;

                // 用 batchPlay 获取图层真实的 bounds
                const result = await action.batchPlay([{
                    _obj: 'get',
                    _target: [{ _ref: 'layer', _id: layer.id }],
                    _property: 'boundsNoEffects'
                }], {
                    synchronousExecution: false,
                    modalBehavior: 'execute'
                });

                if (!result || !result[0]) return false;

                const b = result[0];
                // boundsNoEffects 可能是 {top, left, bottom, right} 或 {top: {value}, ...}
                const getVal = (v) => {
                    if (v === undefined || v === null) return 0;
                    if (typeof v === 'object' && v.value !== undefined) return v.value;
                    return v;
                };

                const top = getVal(b.top);
                const left = getVal(b.left);
                const bottom = getVal(b.bottom);
                const right = getVal(b.right);

                const width = right - left;
                const height = bottom - top;

                // 检查 opacity (0-100)
                let opacity = 100;
                try { opacity = layer.opacity; } catch (e) {}

                // 检查 fillOpacity (0-100)
                let fillOpacity = 100;
                try { fillOpacity = layer.fillOpacity; } catch (e) {}

                const boundsEmpty = (width < 0.1 && height < 0.1) ||
                                    (top === 0 && left === 0 && bottom === 0 && right === 0);
                const fullyTransparent = opacity === 0 || fillOpacity === 0;

                if (boundsEmpty || fullyTransparent) {
                    console.log('  [空图层]', layer.name,
                        'bounds:', width.toFixed(2) + 'x' + height.toFixed(2),
                        'opacity:', opacity,
                        'fillOpacity:', fillOpacity);
                    return true;
                }
                return false;
            } catch (e) {
                console.log('  _isLayerEmpty 异常:', layer.name, e.message);
                return false;
            }
        },

        // 同步检查（适用于已缓存好 bounds 信息的情况）
        _isLayerEmptySync(layer, width, height, opacity, fillOpacity) {
            const boundsEmpty = (width < 0.1 && height < 0.1) ||
                                (width === 0 && height === 0);
            const fullyTransparent = opacity === 0 || fillOpacity === 0;
            return boundsEmpty || fullyTransparent;
        },

        // 删除选中的图层
        async deleteSelected(selectedItems) {
            const selectedIds = selectedItems.map(item => item.id);

            if (selectedIds.length === 0) {
                return { deleted: 0 };
            }

            const photoshop = require('photoshop');
            const { app, core } = photoshop;
            const doc = app.activeDocument;

            if (!doc) {
                throw new Error('没有活动文档');
            }

            try {
                return await core.executeAsModal(async () => {
                    let deletedCount = 0;

                    // 按深度从大到小排序，先删深层图层，再删浅层
                    const sortedItems = [...selectedItems].sort((a, b) => (b.depth || 0) - (a.depth || 0));

                    for (const item of sortedItems) {
                        try {
                            const layerId = item.id;
                            // 递归查找图层（包括组内图层）
                            const findLayer = (layers) => {
                                for (const layer of layers) {
                                    if (layer.id === layerId) return layer;
                                    if (layer.layers && layer.layers.length > 0) {
                                        const found = findLayer(layer.layers);
                                        if (found) return found;
                                    }
                                }
                                return null;
                            };
                            const layer = findLayer(doc.layers);
                            if (layer) {
                                console.log('[DeleteLayerModule] 删除图层:', layer.name, '| id:', layerId);
                                layer.delete();
                                deletedCount++;
                            } else {
                                console.error('[DeleteLayerModule] 未找到图层 ID:', layerId);
                            }
                        } catch (e) {
                            console.error('[DeleteLayerModule] 删除图层失败:', item.name, e);
                        }
                    }

                    return { deleted: deletedCount };
                }, { commandName: '删除选中图层' });
            } catch (e) {
                console.error('[DeleteLayerModule] 删除图层失败:', e);
                throw e;
            }
        },

        // 删除图层
        async doExecute(overrideSettings) {
            const currentSettings = getEffectiveSettings(overrideSettings);

            if (!currentSettings.deleteEmpty && !currentSettings.deleteHidden) {
                return { total: 0, deletedEmpty: 0, deletedHidden: 0 };
            }

            const photoshop = require('photoshop');
            const { app, core } = photoshop;
            const doc = app.activeDocument;

            if (!doc) {
                throw new Error('没有活动文档');
            }

            try {
                return await core.executeAsModal(async () => {
                    let deletedEmpty = 0;
                    let deletedHidden = 0;
                    const { action } = photoshop;

                    // 用 batchPlay 一次性获取所有图层的真实 bounds
                    const allLayers = [];
                    const collectAllLayerIds = (layers) => {
                        for (const layer of layers) {
                            allLayers.push(layer);
                            if (layer.typename === 'LayerSet' || layer.kind === 'group') {
                                try {
                                    if (layer.layers) collectAllLayerIds(layer.layers);
                                } catch (e) {}
                            }
                        }
                    };
                    collectAllLayerIds(doc.layers);

                    const commands = allLayers.map(layer => ({
                        _obj: 'get',
                        _target: [{ _ref: 'layer', _id: layer.id }],
                        extendedReference: ['boundsNoEffects']
                    }));

                    let boundsResults = [];
                    try {
                        boundsResults = await action.batchPlay(commands, {
                            synchronousExecution: false,
                            modalBehavior: 'execute'
                        });
                    } catch (e) {}

                    const boundsMap = new Map(); // layerId -> {width, height, opacity, fillOpacity}
                    // 用 layerID 匹配，因为 batchPlay 返回顺序不一定和 allLayers 一致
                    const resultByLayerId = new Map();
                    boundsResults.forEach((r) => {
                        if (!r || !r.layerID) return;
                        resultByLayerId.set(r.layerID, r);
                    });
                    allLayers.forEach((layer) => {
                        const r = resultByLayerId.get(layer.id);
                        if (!r || !r.boundsNoEffects) return;
                        const b = r.boundsNoEffects;
                        const getVal = (v) => {
                            if (v === undefined || v === null) return 0;
                            if (typeof v === 'object' && v.value !== undefined) return v.value;
                            return parseFloat(v) || 0;
                        };
                        const width = getVal(b.width) || (getVal(b.right) - getVal(b.left));
                        const height = getVal(b.height) || (getVal(b.bottom) - getVal(b.top));
                        const opacity = r.opacity !== undefined ? (r.opacity / 255) * 100 : 100;
                        const fillOpacity = r.fillOpacity !== undefined ? (r.fillOpacity / 255) * 100 : 100;
                        boundsMap.set(layer.id, { width, height, opacity, fillOpacity });
                    });

                    const processLayers = (layers) => {
                        const layersToDelete = [];

                        for (const layer of layers) {
                            let shouldDelete = false;
                            let isHidden = false;

                            if (currentSettings.deleteHidden && !layer.visible) {
                                shouldDelete = true;
                                isHidden = true;
                            }

                            if (currentSettings.deleteEmpty && layer.kind === 'text') {
                                try {
                                    const text = layer.textItem.contents;
                                    if (!text || text.trim() === '') {
                                        shouldDelete = true;
                                    }
                                } catch (e) {}
                            }

                            // 通用空白检测: bounds 为 0 OR 全透明
                            const b = boundsMap.get(layer.id);
                            const width = b ? b.width : 0;
                            const height = b ? b.height : 0;
                            const opacity = b ? b.opacity : 100;
                            const fillOpacity = b ? b.fillOpacity : 100;

                            const boundsEmpty = width < 0.1 && height < 0.1;
                            const fullyTransparent = opacity < 1 || fillOpacity < 1;

                            if (currentSettings.deleteEmpty && layer.kind !== 'group' && (boundsEmpty || fullyTransparent)) {
                                shouldDelete = true;
                            }

                            if (shouldDelete) {
                                layersToDelete.push({ layer, isHidden });
                            }

                            if (layer.typename === 'LayerSet' || layer.kind === 'group') {
                                try {
                                    if (layer.layers) {
                                        processLayers(layer.layers);
                                    }
                                } catch (e) {}
                            }
                        }

                        for (const item of layersToDelete) {
                            try {
                                item.layer.delete();
                                if (item.isHidden) deletedHidden++;
                                else deletedEmpty++;
                            } catch (e) {
                                console.error('[DeleteLayerModule] 删除图层失败:', item.layer.name, e);
                            }
                        }
                    };

                    processLayers(doc.layers);

                    return { deletedEmpty, deletedHidden, total: deletedEmpty + deletedHidden };
                }, { commandName: '删除图层' });
            } catch (e) {
                console.error('[DeleteLayerModule] 删除图层失败:', e);
                throw e;
            }
        }
    };

    window.DeleteLayerModule = DeleteLayerModule;

})();
