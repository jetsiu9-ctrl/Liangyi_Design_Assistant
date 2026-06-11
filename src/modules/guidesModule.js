/**
 * 参考线功能模块
 * 负责主面板与快捷面板的参考线/切片操作
 */

(function() {
    'use strict';

    function getPhotoshopModules() {
        const { app, core, action } = require('photoshop');
        return { app, core, action };
    }

    function getPixelValue(value) {
        return typeof value === 'object' && value !== null ? value.value : Number(value);
    }

    function getActiveDocumentDimensions() {
        const { app } = getPhotoshopModules();
        const doc = app.activeDocument;
        if (!doc) {
            return null;
        }

        return {
            width: getPixelValue(doc.width),
            height: getPixelValue(doc.height)
        };
    }

    function buildGuideDescriptors(settings, dimensions) {
        const guideDescriptors = [];
        const intervalByY = Number(settings.intervalVertical) || 0;
        const intervalByX = Number(settings.intervalHorizontal) || 0;

        if (settings.enableVertical && intervalByY > 0) {
            const count = Math.floor(dimensions.height / intervalByY);
            for (let index = 1; index <= count; index += 1) {
                const position = index * intervalByY;
                guideDescriptors.push({
                    _obj: 'make',
                    _target: [{ _ref: 'guide' }],
                    new: {
                        _obj: 'guide',
                        position: { _unit: 'pixelsUnit', _value: position },
                        orientation: { _enum: 'orientation', _value: 'horizontal' }
                    }
                });
            }
        }

        if (settings.enableHorizontal && intervalByX > 0) {
            const count = Math.floor(dimensions.width / intervalByX);
            for (let index = 1; index <= count; index += 1) {
                const position = index * intervalByX;
                guideDescriptors.push({
                    _obj: 'make',
                    _target: [{ _ref: 'guide' }],
                    new: {
                        _obj: 'guide',
                        position: { _unit: 'pixelsUnit', _value: position },
                        orientation: { _enum: 'orientation', _value: 'vertical' }
                    }
                });
            }
        }

        return guideDescriptors;
    }

    function getGuideSummary(settings, dimensions) {
        const intervalByY = Number(settings.intervalVertical) || 0;
        const intervalByX = Number(settings.intervalHorizontal) || 0;
        const verticalCount = settings.enableVertical && intervalByY > 0
            ? Math.floor(dimensions.height / intervalByY)
            : 0;
        const horizontalCount = settings.enableHorizontal && intervalByX > 0
            ? Math.floor(dimensions.width / intervalByX)
            : 0;

        return {
            verticalCount,
            horizontalCount,
            totalCount: verticalCount + horizontalCount
        };
    }

    function getSliceLinesFromGuides(doc) {
        const heightLines = [0, getPixelValue(doc.height)];
        const widthLines = [0, getPixelValue(doc.width)];

        Array.from(doc.guides || []).forEach((guide) => {
            const direction = guide.direction;
            const coordinate = guide.coordinate ? getPixelValue(guide.coordinate) : null;

            if (coordinate === null || Number.isNaN(coordinate)) {
                return;
            }

            if (direction === 'horizontal') {
                heightLines.push(coordinate);
            } else if (direction === 'vertical') {
                widthLines.push(coordinate);
            }
        });

        return {
            hLines: [...new Set(heightLines)].sort((left, right) => left - right),
            vLines: [...new Set(widthLines)].sort((left, right) => left - right)
        };
    }

    function buildSliceDescriptors(lines) {
        const descriptors = [];

        for (let row = 0; row < lines.hLines.length - 1; row += 1) {
            for (let column = 0; column < lines.vLines.length - 1; column += 1) {
                descriptors.push({
                    _obj: 'make',
                    _target: [{ _ref: 'slice' }],
                    using: {
                        _class: 'good',
                        bounds: {
                            _obj: 'rectangle',
                            top: lines.hLines[row],
                            left: lines.vLines[column],
                            bottom: lines.hLines[row + 1],
                            right: lines.vLines[column + 1]
                        }
                    }
                });
            }
        }

        return descriptors;
    }

    async function generateGuides(settings) {
        const { app, core, action } = getPhotoshopModules();
        const doc = app.activeDocument;
        if (!doc) {
            throw new Error('没有活动文档');
        }

        if (!settings.enableVertical && !settings.enableHorizontal) {
            throw new Error('请启用至少一个距离选项');
        }

        const dimensions = {
            width: getPixelValue(doc.width),
            height: getPixelValue(doc.height)
        };
        const descriptors = buildGuideDescriptors(settings, dimensions);

        if (descriptors.length === 0) {
            throw new Error('请输入有效的间隔距离');
        }

        await core.executeAsModal(async (executionContext) => {
            const historyName = '新建参考线';
            const historySuspension = await executionContext.hostControl.suspendHistory({
                documentID: doc.id,
                name: historyName
            });

            try {
                await action.batchPlay(descriptors, {});
                historySuspension.finalName = historyName;
                await executionContext.hostControl.resumeHistory(historySuspension, true);
            } catch (error) {
                await executionContext.hostControl.resumeHistory(historySuspension, false);
                throw error;
            }
        }, { commandName: '新建参考线' });

        return getGuideSummary(settings, dimensions);
    }

    async function clearGuides() {
        const { app, core, action } = getPhotoshopModules();
        if (!app.activeDocument) {
            throw new Error('没有活动文档');
        }

        await core.executeAsModal(async () => {
            await action.batchPlay([{ _obj: 'clearAllGuides' }], {});
        }, { commandName: '清除所有参考线' });
    }

    async function createSlicesFromGuides() {
        const { app, core, action } = getPhotoshopModules();
        const doc = app.activeDocument;
        if (!doc) {
            throw new Error('没有活动文档');
        }

        if (!doc.guides || doc.guides.length === 0) {
            throw new Error('当前画布上没有参考线，无法创建切片');
        }

        const lines = getSliceLinesFromGuides(doc);
        const descriptors = buildSliceDescriptors(lines);

        if (descriptors.length === 0) {
            throw new Error('未计算出有效切片区域');
        }

        await core.executeAsModal(async (executionContext) => {
            const historyName = '基于参考线的切片';
            const historySuspension = await executionContext.hostControl.suspendHistory({
                documentID: doc.id,
                name: historyName
            });

            try {
                await action.batchPlay(descriptors, {});
                historySuspension.finalName = historyName;
                await executionContext.hostControl.resumeHistory(historySuspension, true);
            } catch (error) {
                await executionContext.hostControl.resumeHistory(historySuspension, false);
                throw error;
            }
        }, { commandName: '基于参考线的切片' });

        return {
            sliceCount: descriptors.length
        };
    }

    window.GuidesModule = {
        getActiveDocumentDimensions,
        buildGuideDescriptors,
        getGuideSummary,
        generateGuides,
        clearGuides,
        createSlicesFromGuides
    };
})();
