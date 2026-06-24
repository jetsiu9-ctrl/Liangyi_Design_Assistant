/**
 * 字体管理模块
 * 基于 Photoshop UXP app.fonts 构建字体家族/字重选择，并应用到选中文字图层
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'haimati_font_settings';

    const defaultSettings = {
        family: '',
        style: '',
        postScriptName: '',
        searchKeyword: '',
        realtime: true,
        fontSize: null,
        tracking: null,
        horizontalScale: null,
        verticalScale: null
    };

    let settings = { ...defaultSettings };
    let groupedFontsCache = [];

    function normalizeSettings(raw = {}) {
        return {
            family: String(raw.family || ''),
            style: String(raw.style || ''),
            postScriptName: String(raw.postScriptName || ''),
            searchKeyword: String(raw.searchKeyword || ''),
            realtime: raw.realtime === undefined ? true : Boolean(raw.realtime),
            fontSize: Number.isFinite(raw.fontSize) ? raw.fontSize : null,
            tracking: Number.isFinite(raw.tracking) ? raw.tracking : null,
            horizontalScale: Number.isFinite(raw.horizontalScale) ? raw.horizontalScale : null,
            verticalScale: Number.isFinite(raw.verticalScale) ? raw.verticalScale : null
        };
    }

    function init() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            settings = saved ? normalizeSettings(JSON.parse(saved)) : normalizeSettings(defaultSettings);
        } catch (e) {
            console.error('[FontModule] 加载设置失败:', e);
            settings = normalizeSettings(defaultSettings);
        }
        return { ...settings };
    }

    function persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('[FontModule] 保存设置失败:', e);
        }
        return { ...settings };
    }

    function setState(newSettings, options = {}) {
        settings = normalizeSettings({ ...settings, ...(newSettings || {}) });
        if (options.persist) {
            persist();
        }
        return { ...settings };
    }

    function replaceState(nextState, options = {}) {
        settings = normalizeSettings(nextState || defaultSettings);
        if (options.persist) {
            persist();
        }
        return { ...settings };
    }

    function resetState(options = {}) {
        settings = normalizeSettings(defaultSettings);
        if (options.persist) {
            persist();
        }
        return { ...settings };
    }

    function getState() {
        return { ...settings };
    }

    function getAllFonts() {
        const photoshop = require('photoshop');
        const { app } = photoshop;
        const fonts = app.fonts || [];
        return Array.from(fonts);
    }

    function getGroupedFonts() {
        const fonts = getAllFonts();
        const familyMap = new Map();

        fonts.forEach(font => {
            const family = (font.family || font.name || '').trim();
            if (!family) return;

            const item = {
                family,
                displayName: family,
                name: font.name || family,
                style: (font.style || 'Regular').trim() || 'Regular',
                postScriptName: font.postScriptName || ''
            };

            if (!familyMap.has(family)) {
                familyMap.set(family, {
                    family,
                    displayName: family,
                    styles: []
                });
            }

            const group = familyMap.get(family);
            if (!group.styles.some(styleItem => styleItem.postScriptName === item.postScriptName)) {
                group.styles.push(item);
            }
        });

        groupedFontsCache = Array.from(familyMap.values())
            .map(group => ({
                ...group,
                styles: group.styles.sort((a, b) => a.style.localeCompare(b.style, 'zh-CN'))
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'));

        return groupedFontsCache;
    }

    // 字重排序权重
    const styleWeightOrder = {
        'thin': 1,
        'hairline': 1,
        'extralight': 2,
        'ultralight': 2,
        'light': 3,
        'regular': 4,
        'normal': 4,
        'book': 4,
        'medium': 5,
        'demibold': 6,
        'semibold': 6,
        'bold': 7,
        'extrabold': 8,
        'ultrabold': 8,
        'black': 9,
        'heavy': 9,
        'extrablack': 10,
        'ultrablack': 10
    };

    function getStyleWeight(styleName) {
        if (!styleName) return 100;
        const lower = styleName.toLowerCase();
        // 匹配字重关键字
        for (const [key, weight] of Object.entries(styleWeightOrder)) {
            if (lower.includes(key)) {
                return weight;
            }
        }
        return 100;
    }

    function getStylesByFamilySorted(family) {
        const styles = getStylesByFamily(family);
        return styles.sort((a, b) => {
            const weightA = getStyleWeight(a.style);
            const weightB = getStyleWeight(b.style);
            if (weightA !== weightB) {
                return weightA - weightB;
            }
            return a.style.localeCompare(b.style, 'zh-CN');
        });
    }

    function filterGroupedFonts(keyword) {
        const normalizedKeyword = (keyword || '').trim().toLowerCase();
        const groups = groupedFontsCache.length ? groupedFontsCache : getGroupedFonts();

        if (!normalizedKeyword) {
            return groups;
        }

        return groups.filter(group => {
            if (group.displayName.toLowerCase().includes(normalizedKeyword)) {
                return true;
            }
            return group.styles.some(styleItem => {
                return (styleItem.name || '').toLowerCase().includes(normalizedKeyword)
                    || (styleItem.style || '').toLowerCase().includes(normalizedKeyword)
                    || (styleItem.postScriptName || '').toLowerCase().includes(normalizedKeyword);
            });
        });
    }

    function getStylesByFamily(family) {
        if (!family) return [];
        const groups = groupedFontsCache.length ? groupedFontsCache : getGroupedFonts();
        const group = groups.find(item => item.family === family);
        return group ? group.styles : [];
    }

    async function applyTrackingWithBatchPlay(action, layer, tracking) {
        await action.batchPlay([
            {
                _obj: 'select',
                _target: [{ _ref: 'layer', _id: layer.id }],
                makeVisible: false
            },
            {
                _obj: 'set',
                _target: [
                    {
                        _property: 'textStyle',
                        _ref: 'property'
                    },
                    {
                    _enum: 'ordinal',
                    _ref: 'textLayer',
                    _value: 'targetEnum'
                    }
                ],
                to: {
                    _obj: 'textStyle',
                    textOverrideFeatureName: 808465465,
                    tracking,
                    typeStyleOperationType: 3
                }
            }
        ], {
            dialogOptions: 'dontDisplay'
        });
    }

    async function restoreActiveLayers(action, layers) {
        const targets = Array.from(layers || [])
            .filter(layer => layer && layer.id)
            .map(layer => ({ _ref: 'layer', _id: layer.id }));

        if (!targets.length) {
            return;
        }

        await action.batchPlay([{
            _obj: 'select',
            _target: targets,
            makeVisible: false
        }], {
            dialogOptions: 'dontDisplay'
        });
    }

    async function doExecute(overrideSettings) {
        const previousSettings = settings;
        settings = normalizeSettings(overrideSettings ? { ...settings, ...overrideSettings } : settings);

        if (
            !settings.postScriptName
            && !settings.fontSize
            && settings.tracking === null
            && settings.horizontalScale === null
            && settings.verticalScale === null
        ) {
            settings = previousSettings;
            throw new Error('请先选择字体样式、字号、字距或缩放');
        }

        const photoshop = require('photoshop');
        const { app, core, action } = photoshop;

        const doc = app.activeDocument;
        if (!doc) {
            throw new Error('没有活动文档');
        }

        const selectedLayers = Array.from(doc.activeLayers || []);
        if (selectedLayers.length === 0) {
            throw new Error('请先选择文字图层');
        }

        return await core.executeAsModal(async (executionContext) => {
            const historyName = '应用字体参数';
            const historySuspension = await executionContext.hostControl.suspendHistory({
                documentID: doc.id,
                name: historyName
            });
            let updatedCount = 0;

            try {
                for (const layer of selectedLayers) {
                    if (layer.kind !== photoshop.constants.LayerKind.TEXT) {
                        continue;
                    }

                    try {
                        if (settings.postScriptName) {
                            layer.textItem.characterStyle.font = settings.postScriptName;
                        }
                        if (settings.fontSize) {
                            layer.textItem.characterStyle.size = settings.fontSize;
                        }
                        if (settings.tracking !== null) {
                            await applyTrackingWithBatchPlay(action, layer, settings.tracking);
                        }
                        if (settings.horizontalScale !== null) {
                            layer.textItem.characterStyle.horizontalScale = settings.horizontalScale;
                        }
                        if (settings.verticalScale !== null) {
                            layer.textItem.characterStyle.verticalScale = settings.verticalScale;
                        }
                        updatedCount++;
                    } catch (e) {
                        console.error('[FontModule] 应用字体失败:', layer.name, e);
                    }
                }

                if (updatedCount === 0) {
                    throw new Error('选中项中没有可修改的文字图层');
                }

                try {
                    await restoreActiveLayers(action, selectedLayers);
                } catch (restoreError) {
                    console.warn('[FontModule] 恢复图层选区失败:', restoreError);
                }

                historySuspension.finalName = historyName;
                await executionContext.hostControl.resumeHistory(historySuspension, true);
                return { updatedCount };
            } catch (error) {
                await executionContext.hostControl.resumeHistory(historySuspension, false);
                throw error;
            }
        }, { commandName: '应用字体到文字图层' });
    }

    // 应用文本图层批处理选项（字距微调和消除锯齿）
    async function applyTextStyleOptions(isOpticalKerning, isSmoothAntialias) {
        if (!isOpticalKerning && !isSmoothAntialias) {
            return;
        }

        const photoshop = require('photoshop');
        const { app, core, constants } = photoshop;

        const doc = app.activeDocument;
        if (!doc) {
            throw new Error('没有活动文档');
        }

        const selectedLayers = Array.from(doc.activeLayers || []);
        const textLayers = selectedLayers.filter(layer => layer.kind === photoshop.constants.LayerKind.TEXT);

        if (textLayers.length === 0) {
            throw new Error('没有选中任何文本图层');
        }

        const targetLayers = textLayers.filter((layer) => {
            try {
                const characterStyle = layer.textItem.characterStyle;
                const needsOpticalKerning = isOpticalKerning
                    && characterStyle.autoKerning !== constants.AutoKernType.OPTICAL;
                const needsSmoothAntialias = isSmoothAntialias
                    && characterStyle.antiAliasMethod !== constants.AntiAlias.SMOOTH;
                return needsOpticalKerning || needsSmoothAntialias;
            } catch (e) {
                console.error('[FontModule] 检查文本样式状态失败:', layer.name, e);
                return true;
            }
        });

        if (targetLayers.length === 0) {
            return {
                updatedCount: 0,
                skippedCount: textLayers.length,
                alreadyApplied: true
            };
        }

        return await core.executeAsModal(async () => {
            let updatedCount = 0;

            for (const layer of targetLayers) {
                try {
                    const characterStyle = layer.textItem.characterStyle;
                    let didUpdate = false;

                    if (isOpticalKerning && characterStyle.autoKerning !== constants.AutoKernType.OPTICAL) {
                        characterStyle.autoKerning = constants.AutoKernType.OPTICAL;
                        didUpdate = true;
                    }
                    if (isSmoothAntialias && characterStyle.antiAliasMethod !== constants.AntiAlias.SMOOTH) {
                        characterStyle.antiAliasMethod = constants.AntiAlias.SMOOTH;
                        didUpdate = true;
                    }

                    if (didUpdate) {
                        updatedCount++;
                    }
                } catch (e) {
                    console.error('[FontModule] 应用文本样式失败:', layer.name, e);
                }
            }

            if (updatedCount === 0) {
                throw new Error('选中项中没有可修改的文本图层');
            }

            return {
                updatedCount,
                skippedCount: textLayers.length - updatedCount,
                alreadyApplied: updatedCount === 0
            };
        }, { commandName: '一键优化文本图层属性' });
    }

    window.FontModule = {
        init,
        getState,
        setState,
        replaceState,
        resetState,
        persist,
        execute(overrideSettings) {
            return doExecute(overrideSettings);
        },
        getAllFonts,
        getGroupedFonts,
        filterGroupedFonts,
        getStylesByFamily,
        getStylesByFamilySorted,
        doExecute,
        applyTextStyleOptions
    };
})();
