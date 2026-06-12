/**
 * 批量重命名模块
 * 批量重命名用户选中的图层
 */

(function() {
    'use strict';

    // 默认设置
    const defaultSettings = {
        baseName: '',
        position: 'prefix',
        addSequence: true,
        sequenceStart: 1
    };

    function normalizeSettings(raw = {}) {
        return {
            baseName: String(raw.baseName || ''),
            position: raw.position === 'suffix' ? 'suffix' : 'prefix',
            addSequence: Boolean(raw.addSequence),
            sequenceStart: Number.isFinite(parseInt(raw.sequenceStart, 10)) ? parseInt(raw.sequenceStart, 10) : 1
        };
    }

    // 当前设置
    let settings = normalizeSettings(defaultSettings);

    function init() {
        try {
            const saved = localStorage.getItem('haimati_rename_settings');
            if (saved) {
                settings = normalizeSettings(JSON.parse(saved));
            } else {
                settings = normalizeSettings(defaultSettings);
            }
        } catch (e) {
            console.error('[RenameModule] 加载设置失败:', e);
            settings = normalizeSettings(defaultSettings);
        }
        return { ...settings };
    }

    function persist() {
        try {
            localStorage.setItem('haimati_rename_settings', JSON.stringify(settings));
        } catch (e) {
            console.error('[RenameModule] 保存设置失败:', e);
        }
        return { ...settings };
    }

    function setState(updates, options = {}) {
        settings = normalizeSettings({ ...settings, ...(updates || {}) });
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

    async function getSelectedLayers() {
        const photoshop = require('photoshop');
        const { app, action, core } = photoshop;
        const doc = app.activeDocument;
        if (!doc) {
            throw new Error('没有活动文档');
        }

        const selectedLayers = doc.activeLayers ? Array.from(doc.activeLayers) : [];
        if (selectedLayers.length === 0) {
            throw new Error('没有选中的图层');
        }

        const layerTreeInfo = await core.executeAsModal(async () => {
            return await getLayerTreeInfo(action, doc.id);
        }, {
            commandName: '读取选中图层结构'
        });

        const renameTargets = getRenameTargetLayers(selectedLayers, layerTreeInfo, true);

        if (renameTargets.length === 0) {
            throw new Error('没有可重命名的选中图层（组内的子图层会被忽略）');
        }

        return renameTargets;
    }

    async function getLayerTreeInfo(action, docId) {
        const [result] = await action.batchPlay([{
            _obj: 'multiGet',
            _target: [{ _ref: 'document', _id: docId }],
            extendedReference: [
                ['layerID', 'itemIndex', 'parentLayerID', 'name'],
                { _obj: 'layer', index: 0, count: -1, doc: docId }
            ],
            options: { failOnMissingProperty: false, failOnMissingElement: false }
        }], {
            synchronousExecution: true,
            modalBehavior: 'execute'
        });

        const list = Array.isArray(result?.list) ? result.list : [];
        const byId = new Map();

        for (const item of list) {
            const id = item?.layerID;
            if (!Number.isFinite(id)) continue;
            byId.set(id, {
                id,
                itemIndex: Number.isFinite(item?.itemIndex) ? item.itemIndex : 0,
                parentLayerID: Number.isFinite(item?.parentLayerID) ? item.parentLayerID : null,
                name: item?.name || ''
            });
        }

        return { byId };
    }

    function getAncestorLayerIds(layerId, layerTreeInfo) {
        const ancestors = [];
        const visited = new Set();
        let currentId = layerId;

        while (Number.isFinite(currentId)) {
            const node = layerTreeInfo?.byId?.get(currentId);
            const parentId = node?.parentLayerID;
            if (!Number.isFinite(parentId) || visited.has(parentId)) {
                break;
            }
            ancestors.push(parentId);
            visited.add(parentId);
            currentId = parentId;
        }

        return ancestors;
    }

    function isNestedInsideAnotherSelectedLayer(layer, selectedIdSet, layerTreeInfo) {
        if (!layer || !Number.isFinite(layer.id)) {
            return false;
        }

        const ancestors = getAncestorLayerIds(layer.id, layerTreeInfo);
        return ancestors.some(ancestorId => selectedIdSet.has(ancestorId));
    }

    // 获取本次参与重命名的图层
    function getRenameTargetLayers(allLayers, layerTreeInfo, ignoreChildLayers) {
        const renameTargets = [];
        const selectedIdSet = new Set(
            allLayers
                .map(layer => layer?.id)
                .filter(id => Number.isFinite(id))
        );

        for (const layer of allLayers) {
            if (!layer || !Number.isFinite(layer.id)) continue;

            if (ignoreChildLayers && isNestedInsideAnotherSelectedLayer(layer, selectedIdSet, layerTreeInfo)) {
                continue;
            }

            renameTargets.push(layer);
        }

        renameTargets.sort((a, b) => a.index - b.index);
        return renameTargets;
    }

    // 生成新名称
    function generateNewName(baseName, position, addSequence, sequenceStart, index) {
        const seq = sequenceStart + index;

        // 如果没有名称，只使用序号
        if (!baseName || baseName.trim() === '') {
            return String(seq);
        }

        let newName = baseName;

        if (addSequence) {
            if (position === 'prefix') {
                newName = `${seq}${baseName}`;
            } else {
                newName = `${baseName}${seq}`;
            }
        }

        return newName;
    }

    // 预览重命名结果
    async function previewRename() {
        try {
            const photoshop = require('photoshop');
            const { app, core } = photoshop;

            // 在 modal scope 内获取图层信息
            const result = await core.executeAsModal(async () => {
                const doc = app.activeDocument;
                if (!doc) {
                    return [];
                }

                const layers = await getSelectedLayers();

                if (layers.length === 0) {
                    return [];
                }

                const results = [];
                for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];
                    const newName = generateNewName(
                        settings.baseName,
                        settings.position,
                        settings.addSequence,
                        settings.sequenceStart,
                        i
                    );
                    results.push({
                        original: layer.name,
                        newName: newName
                    });
                }

                return results;
            }, {
                "commandName": "预览重命名"
            });

            return result;
        } catch (e) {
            console.error('[RenameModule] 预览失败:', e);
            return [];
        }
    }

    // 执行重命名
    async function doExecute(overrideSettings) {
        const previousSettings = settings;
        settings = normalizeSettings(overrideSettings ? { ...settings, ...overrideSettings } : settings);

        const photoshop = require('photoshop');
        const { app, action, core } = photoshop;

        try {
            // 核心修改点：传入 executionContext 参数
            const result = await core.executeAsModal(async (executionContext) => {
                const doc = app.activeDocument;
                if (!doc) {
                    throw new Error('没有活动文档');
                }

                const selectedLayers = await getSelectedLayers();
                console.log(`[RenameModule] 本次参与重命名图层数量: ${selectedLayers.length}`);

                if (selectedLayers.length === 0) {
                    throw new Error('没有可重命名的选中图层（组内的子图层会被忽略）');
                }

                // 核心修改点：挂起历史记录流，合并为单一状态点
                const historyName = '批量重命名图层';
                const historySuspension = await executionContext.hostControl.suspendHistory({
                    documentID: doc.id,
                    name: historyName
                });

                try {
                    console.log(`[RenameModule] 开始重命名 ${selectedLayers.length} 个图层`);

                    for (let i = 0; i < selectedLayers.length; i++) {
                        const layer = selectedLayers[i];
                        const newName = generateNewName(
                            settings.baseName.trim(),
                            settings.position,
                            settings.addSequence,
                            settings.sequenceStart,
                            i
                        );

                        await action.batchPlay([{
                            "_obj": "set",
                            "_target": [
                                {
                                    "_ref": "layer",
                                    "_id": layer.id
                                }
                            ],
                            "to": {
                                "_obj": "layer",
                                "name": newName
                            }
                        }], {
                            "dialogOptions": "dontDisplay"
                        });

                        console.log(`[RenameModule] 重命名图层: ${layer.name} -> ${newName}`);
                    }

                    // 核心修改点：执行成功，提交并合并
                    historySuspension.finalName = historyName;
                    await executionContext.hostControl.resumeHistory(historySuspension, true);

                    return {
                        success: true,
                        count: selectedLayers.length
                    };
                } catch (error) {
                    // 核心修改点：中途遭遇异常，彻底回滚挂起区间内的所有破坏性更名
                    await executionContext.hostControl.resumeHistory(historySuspension, false);
                    throw error;
                }
            }, {
                "commandName": "批量重命名图层"
            });

            return result;
        } catch (e) {
            console.error('[RenameModule] 重命名失败:', e);
            throw e;
        } finally {
            settings = previousSettings;
        }
    }

    // 暴露到全局
    window.RenameModule = {
        init,
        getState,
        setState,
        replaceState,
        resetState,
        persist,
        execute(overrideSettings) {
            return doExecute(overrideSettings);
        },
        getSelectedLayers,
        previewRename,
        doExecute
    };

})();
