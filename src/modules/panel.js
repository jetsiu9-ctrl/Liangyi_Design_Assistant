/**
 * 面板主逻辑模块
 * 管理主面板的 UI 和交互
 */

(function() {
    'use strict';

    let rootNode = null;
    let translateSettingsLoaded = false;
    const preActionSyncRegistry = [];

    // Toast 显示函数
    function showToast(message) {
        let toast = rootNode.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            rootNode.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }

    // 从导出面板收集表单状态
    function collectExportFormState() {
        const currentSettings = ExportModule.getState();
        const nextSettings = {
            ...currentSettings,
            namingRule: {
                ...(currentSettings.namingRule || {
                    enabled: false,
                    pattern: 'layerName',
                    separator: '_'
                })
            }
        };

        // 格式选择
        const formatRadio = rootNode.querySelector('#exportFormat sp-radio[checked]');
        if (formatRadio) {
            nextSettings.format = formatRadio.value;
        }

        // PNG 位深
        const pngBitDepthRadio = rootNode.querySelector('#pngBitDepth sp-radio[checked]');
        if (pngBitDepthRadio) {
            nextSettings.pngBitDepth = parseInt(pngBitDepthRadio.value, 10);
        }

        // JPEG 质量
        const qualityInput = rootNode.querySelector('#jpegQuality');
        if (qualityInput) {
            let value = parseInt(qualityInput.value, 10);
            value = Math.max(1, Math.min(100, value || 100));
            nextSettings.jpegQuality = value;
        }

        // 导出路径
        const pathInput = rootNode.querySelector('#exportPath');
        if (pathInput) {
            nextSettings.exportPath = pathInput.value.trim();
        }

        // 批量导出
        const batchSwitch = rootNode.querySelector('#batchExportSwitch');
        if (batchSwitch) {
            nextSettings.batchExport = batchSwitch.checked;
            if (nextSettings.batchExport) {
                nextSettings.excludeBackground = true;
                nextSettings.overwrite = true;
            }
        }

        // 使用源文件路径
        const sourcePathSwitch = rootNode.querySelector('#useSourcePathSwitch');
        if (sourcePathSwitch) {
            nextSettings.useSourcePath = sourcePathSwitch.checked;
        }

        // 源文件子文件夹名称
        const sourceFolderNameInput = rootNode.querySelector('#sourceFolderName');
        if (sourceFolderNameInput) {
            nextSettings.sourceFolderName = sourceFolderNameInput.value.trim();
        }

        return nextSettings;
    }

    function commitExportFormState(options = {}) {
        const { persist = true } = options;
        return ExportModule.setState(collectExportFormState(), { persist });
    }

    // 从按钮面板收集表单状态
    function collectButtonFormState() {
        if (!window.ButtonModule) return null;

        const currentSettings = ButtonModule.getState();
        const nextSettings = { ...currentSettings };

        const widthInput = rootNode.querySelector('#widthOffset');
        if (widthInput) {
            nextSettings.widthOffset = parseInt(widthInput.value, 10) || 0;
        }

        const heightInput = rootNode.querySelector('#heightOffset');
        if (heightInput) {
            nextSettings.heightOffset = parseInt(heightInput.value, 10) || 0;
        }

        const radiusInput = rootNode.querySelector('#cornerRadius');
        if (radiusInput) {
            nextSettings.cornerRadius = parseInt(radiusInput.value, 10) || 0;
        }

        return nextSettings;
    }

    function commitButtonFormState(options = {}) {
        if (!window.ButtonModule) return null;
        const { persist = true } = options;
        const nextSettings = collectButtonFormState();
        return ButtonModule.setState(nextSettings, { persist });
    }

    // 从重命名面板收集表单状态
    function collectRenameFormState() {
        if (!window.RenameModule) return null;

        const currentSettings = RenameModule.getState();
        const nextSettings = { ...currentSettings };

        const baseNameInput = rootNode.querySelector('#renameBaseName');
        if (baseNameInput) {
            nextSettings.baseName = baseNameInput.value;
        }

        const positionRadio = rootNode.querySelector('#namingPosition sp-radio[checked]');
        if (positionRadio) {
            nextSettings.position = positionRadio.value;
        }

        // 序号始终启用
        nextSettings.addSequence = true;

        const sequenceStartInput = rootNode.querySelector('#sequenceStart');
        if (sequenceStartInput) {
            nextSettings.sequenceStart = parseInt(sequenceStartInput.value, 10) || 1;
        }

        return nextSettings;
    }

    function commitRenameFormState(options = {}) {
        if (!window.RenameModule) return null;
        const { persist = true } = options;
        const nextSettings = collectRenameFormState();
        return RenameModule.setState(nextSettings, { persist });
    }

    // 从文档优化面板收集表单状态
    function collectOptimizeFormState() {
        const nextState = {};

        if (window.SmartObjectModule) {
            const smartObjectEnabledCheckbox = rootNode.querySelector('#enableSmartObject');
            const dpiInput = rootNode.querySelector('#smartobjectDpi');
            nextState.smartObject = {
                enabled: smartObjectEnabledCheckbox ? smartObjectEnabledCheckbox.checked : SmartObjectModule.getDefaultSettings().enabled,
                targetDpi: dpiInput ? (parseInt(dpiInput.value, 10) || 72) : SmartObjectModule.getDefaultSettings().targetDpi
            };
        }

        if (window.DeleteLayerModule) {
            const deleteEmptyCheckbox = rootNode.querySelector('#deleteEmptyLayers');
            const deleteHiddenCheckbox = rootNode.querySelector('#deleteHiddenLayers');
            const currentDeleteSettings = DeleteLayerModule.getState();
            nextState.deleteLayer = {
                deleteEmpty: deleteEmptyCheckbox ? deleteEmptyCheckbox.checked : currentDeleteSettings.deleteEmpty,
                deleteHidden: deleteHiddenCheckbox ? deleteHiddenCheckbox.checked : currentDeleteSettings.deleteHidden
            };
        }

        return nextState;
    }

    function commitOptimizeFormState(options = {}) {
        const { persist = true } = options;
        const nextState = collectOptimizeFormState();

        if (window.SmartObjectModule && nextState.smartObject) {
            SmartObjectModule.setState(nextState.smartObject, { persist });
        }

        if (window.DeleteLayerModule && nextState.deleteLayer) {
            DeleteLayerModule.setState(nextState.deleteLayer, { persist });
        }

        return nextState;
    }

    // 从字体管理面板收集表单状态
    function collectFontFormState() {
        if (!window.FontModule) return null;

        const familyPicker = rootNode.querySelector('#fontFamily');
        const searchInput = rootNode.querySelector('#fontSearch');
        const selectedFamilyItem = familyPicker?.querySelector('sp-menu-item[selected]');
        const familyValue = selectedFamilyItem ? selectedFamilyItem.value || '' : '';
        const realtimeSwitch = rootNode.querySelector('#fontRealtimeSwitch');
        const realtime = realtimeSwitch ? Boolean(realtimeSwitch.checked) : false;

        const selectedBtn = rootNode.querySelector('#fontStyleButtons .font-style-btn.selected');
        const selectedPostScriptName = selectedBtn ? selectedBtn.dataset.postscript || '' : '';
        const styles = FontModule.getStylesByFamily(familyValue);
        const selectedStyle = styles.find(item => item.postScriptName === selectedPostScriptName);

        let fontSize = null;
        const fontSizeInput = rootNode.querySelector('#fontSizeInput');
        if (fontSizeInput) {
            const inputValue = parseInt(fontSizeInput.value, 10);
            if (inputValue >= 1 && inputValue <= 999) {
                fontSize = inputValue;
            }
        }

        return {
            family: familyValue,
            style: selectedStyle ? selectedStyle.style : '',
            postScriptName: selectedPostScriptName,
            searchKeyword: searchInput ? searchInput.value.trim() : '',
            realtime,
            fontSize
        };
    }

    function commitFontFormState(options = {}) {
        if (!window.FontModule) return null;
        const { persist = true } = options;
        const nextSettings = collectFontFormState();
        return FontModule.setState(nextSettings, { persist });
    }

    // 从百度翻译收集表单状态
    function collectTranslateFormState() {
        if (!window.TranslateModule) return null;

        const appIdInput = rootNode.querySelector('#baiduAppId');
        const secretKeyInput = rootNode.querySelector('#baiduSecretKey');
        const fromPicker = rootNode.querySelector('#translateFrom');
        const toPicker = rootNode.querySelector('#translateTo');
        const appendSwitch = rootNode.querySelector('#appendTranslationSwitch');
        const selectedFromItem = fromPicker?.querySelector('sp-menu-item[selected]');
        const selectedToItem = toPicker?.querySelector('sp-menu-item[selected]');
        const currentSettings = TranslateModule.getState();
        const appIdValue = appIdInput ? appIdInput.value.trim() : '';
        const secretKeyValue = secretKeyInput ? secretKeyInput.value.trim() : '';

        if (!translateSettingsLoaded && !appIdValue && !secretKeyValue) {
            return null;
        }

        return {
            appId: appIdValue || currentSettings.appId || '',
            secretKey: secretKeyValue || currentSettings.secretKey || '',
            from: selectedFromItem ? selectedFromItem.value || 'auto' : 'auto',
            to: selectedToItem ? selectedToItem.value || 'zh' : 'zh',
            appendTranslation: appendSwitch ? Boolean(appendSwitch.checked) : false
        };
    }

    function commitTranslateFormState(options = {}) {
        if (!window.TranslateModule) return null;
        const { persist = false } = options;
        const nextSettings = collectTranslateFormState();
        if (!nextSettings) return null;
        return TranslateModule.setState(nextSettings, { persist });
    }

    function setPickerSelected(pickerSelector, value) {
        const picker = rootNode.querySelector(pickerSelector);
        if (!picker) return;

        picker.querySelectorAll('sp-menu-item').forEach(item => {
            if (item.value === value) {
                item.setAttribute('selected', '');
            } else {
                item.removeAttribute('selected');
            }
        });
    }

    function commitCurrentPanelFormStates() {
        commitExportFormState({ persist: true });
        commitButtonFormState({ persist: true });
        commitRenameFormState({ persist: true });
        commitOptimizeFormState({ persist: true });
        commitFontFormState({ persist: true });
        commitTranslateFormState({ persist: false });
    }

    function registerPreActionSync(syncFn) {
        if (typeof syncFn === 'function' && !preActionSyncRegistry.includes(syncFn)) {
            preActionSyncRegistry.push(syncFn);
        }
    }

    function syncAllUIToSettings() {
        commitCurrentPanelFormStates();
        preActionSyncRegistry.forEach((syncFn) => {
            try {
                syncFn();
            } catch (e) {
                console.error('[PreActionUISync] 同步失败:', e);
            }
        });
    }

    async function runWithPreActionSync(action) {
        syncAllUIToSettings();
        return await action();
    }

    function runWithPreActionSyncSync(action) {
        syncAllUIToSettings();
        return action();
    }

    // 获取当前活动面板类型
    function getCurrentPanelType() {
        const activeNav = rootNode.querySelector('.nav-icon.active');
        return activeNav ? activeNav.dataset.panel : 'export';
    }

    // 创建按钮快捷方式表单（模态对话框）
    function createButtonQuickActionForm() {
        // 创建模态对话框
        const overlay = document.createElement('div');
        overlay.className = 'dialog-modal';

        const dialog = document.createElement('dialog');
        dialog.innerHTML = `
            <div class="dialog-header">添加到快捷面板</div>
            <div class="dialog-body">
                <input type="text" id="quickActionName" placeholder="输入名称..." />
            </div>
            <div class="dialog-footer">
                <div class="quick-btn form-cancel-btn" role="button" tabindex="0" style="border-right-width: 2px;margin-right: 2px;">取消</div>
                <div class="quick-btn form-confirm-btn" role="button" tabindex="0" style="border-left-width: 2px;margin-left: 2px;">确定</div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#quickActionName');
        const btnCancel = dialog.querySelector('.form-cancel-btn');
        const btnConfirm = dialog.querySelector('.form-confirm-btn');

        // 默认名称
        const settings = ButtonModule.getState();

        // 等待渲染完成后再设置值
        requestAnimationFrame(() => {
            const colorR = Math.round(settings.buttonColor.r * 255).toString(16).padStart(2, '0');
            const colorG = Math.round(settings.buttonColor.g * 255).toString(16).padStart(2, '0');
            const colorB = Math.round(settings.buttonColor.b * 255).toString(16).padStart(2, '0');
            const colorHex = `#${colorR}${colorG}${colorB}`;
            input.value = `按钮-${colorHex}-${settings.widthOffset}-${settings.heightOffset}-r${settings.cornerRadius}`;
            input.focus();
            input.select();
        });

        // 关闭函数
        const closeForm = () => {
            overlay.remove();
        };

        // 确认函数
        const confirmAction = async () => {
            const customName = input.value.trim();

            try {
                commitCurrentPanelFormStates();
                const settings = ButtonModule.getState();

                const name = customName || `按钮`;

                const quickAction = {
                    id: Date.now().toString(),
                    type: 'button',
                    name: name,
                    icon: 'button',
                    settings: { ...settings },
                    createdAt: new Date().toISOString()
                };

                await QuickActionStorage.add(quickAction);

                if (window.updateQuickPanel) {
                    window.updateQuickPanel();
                }

                showToast('已添加到快捷面板');
                closeForm();
            } catch (e) {
                console.error('[Panel] 创建快捷动作失败:', e);
                showToast('创建快捷动作失败');
            }
        };

        // 事件绑定
        btnCancel.addEventListener('click', closeForm);
        btnConfirm.addEventListener('click', confirmAction);

        // 键盘支持
        btnCancel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeForm();
            }
        });
        btnConfirm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                confirmAction();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmAction();
            if (e.key === 'Escape') closeForm();
        });

        // 点击遮罩关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeForm();
            }
        });

        // 显示对话框
        dialog.showModal();
    }

    // 创建文档优化快捷方式表单（模态对话框）
    function createOptimizeQuickActionForm() {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-modal';

        const dialog = document.createElement('dialog');
        dialog.innerHTML = `
            <div class="dialog-header">添加到快捷面板</div>
            <div class="dialog-body">
                <input type="text" id="quickActionName" placeholder="输入名称..." />
                <div class="tool-select-group">
                    <label class="tool-select-label">选择工具：</label>
                    <div class="tool-select-options">
                        <label class="tool-radio-label">
                            <input type="radio" name="toolType" value="smartobject" checked>
                            <span>智能对象</span>
                        </label>
                        <label class="tool-radio-label">
                            <input type="radio" name="toolType" value="deletelayer">
                            <span>删除图层</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="dialog-footer">
                <div class="quick-btn form-cancel-btn" role="button" tabindex="0" style="border-right-width: 2px;margin-right: 2px;">取消</div>
                <div class="quick-btn form-confirm-btn" role="button" tabindex="0" style="border-left-width: 2px;margin-left: 2px;">确定</div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#quickActionName');
        const toolRadios = dialog.querySelectorAll('input[name="toolType"]');
        const btnCancel = dialog.querySelector('.form-cancel-btn');
        const btnConfirm = dialog.querySelector('.form-confirm-btn');

        // 默认值
        requestAnimationFrame(() => {
                const settings = SmartObjectModule.getState();
                if (settings.enabled) {
                    input.value = `文档优化-智能对象-${settings.targetDpi}DPI`;
                } else {
                    input.value = '文档优化-智能对象';
                }
                input.focus();
            input.select();
        });

        // 工具选择变化时更新名称建议
        toolRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.value === 'smartobject') {
                    const settings = SmartObjectModule.getState();
                    if (settings.enabled) {
                        input.value = `文档优化-智能对象-${settings.targetDpi}DPI`;
                    } else {
                        input.value = '文档优化-智能对象';
                    }
                } else {
                    const settings = DeleteLayerModule.getState();
                    const options = [];
                    if (settings.deleteEmpty) options.push('空白');
                    if (settings.deleteHidden) options.push('隐藏');
                    input.value = `文档优化-删除-${options.join('+') || '全部'}`;
                }
            });
        });

        const closeForm = () => {
            overlay.remove();
        };

        const confirmAction = async () => {
            const customName = input.value.trim();
            const selectedTool = dialog.querySelector('input[name="toolType"]:checked').value;

            try {
                commitCurrentPanelFormStates();
                let settings, type;
                if (selectedTool === 'smartobject') {
                settings = SmartObjectModule.getState();
                    type = 'smartobject';
                } else {
                    settings = DeleteLayerModule.getState();
                    type = 'deletelayer';
                }

                const name = customName || (selectedTool === 'smartobject' ? '文档优化-智能对象' : '文档优化-删除');

                if (selectedTool === 'smartobject' && settings && !settings.enabled) {
                    showToast('请先启用智能对象');
                    return;
                }

                const quickAction = {
                    id: Date.now().toString(),
                    type: type,
                    name: name,
                    icon: 'optimize',
                    settings: { ...settings },
                    createdAt: new Date().toISOString()
                };

                await QuickActionStorage.add(quickAction);

                if (window.updateQuickPanel) {
                    window.updateQuickPanel();
                }

                showToast('已添加到快捷面板');
                closeForm();
            } catch (e) {
                console.error('[Panel] 创建快捷动作失败:', e);
                showToast('创建快捷动作失败');
            }
        };

        btnCancel.addEventListener('click', closeForm);
        btnConfirm.addEventListener('click', confirmAction);

        btnCancel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeForm();
            }
        });
        btnConfirm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                confirmAction();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmAction();
            if (e.key === 'Escape') closeForm();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeForm();
            }
        });

        dialog.showModal();
    }

    // 创建重命名快捷方式表单（模态对话框）
    function createRenameQuickActionForm() {
        // 创建模态对话框
        const overlay = document.createElement('div');
        overlay.className = 'dialog-modal';

        const dialog = document.createElement('dialog');
        dialog.innerHTML = `
            <div class="dialog-header">添加到快捷面板</div>
            <div class="dialog-body">
                <input type="text" id="quickActionName" placeholder="输入名称..." />
            </div>
            <div class="dialog-footer">
                <div class="quick-btn form-cancel-btn" role="button" tabindex="0" style="border-right-width: 2px;margin-right: 2px;">取消</div>
                <div class="quick-btn form-confirm-btn" role="button" tabindex="0" style="border-left-width: 2px;margin-left: 2px;">确定</div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#quickActionName');
        const btnCancel = dialog.querySelector('.form-cancel-btn');
        const btnConfirm = dialog.querySelector('.form-confirm-btn');

        // 默认名称
        const settings = RenameModule.getState();

        // 等待渲染完成后再设置值
        requestAnimationFrame(() => {
            const seqText = `序${settings.sequenceStart}`;
            const posText = settings.position === 'prefix' ? '前' : '后';
            input.value = `重命名-${settings.baseName || '未命名'}-${posText}${seqText}`;
            input.focus();
            input.select();
        });

        // 关闭函数
        const closeForm = () => {
            overlay.remove();
        };

        // 确认函数
        const confirmAction = async () => {
            const customName = input.value.trim();

            try {
                commitCurrentPanelFormStates();
                const settings = RenameModule.getState();

                const name = customName || `重命名`;

                const quickAction = {
                    id: Date.now().toString(),
                    type: 'rename',
                    name: name,
                    icon: 'rename',
                    settings: { ...settings },
                    createdAt: new Date().toISOString()
                };

                await QuickActionStorage.add(quickAction);

                if (window.updateQuickPanel) {
                    window.updateQuickPanel();
                }

                showToast('已添加到快捷面板');
                closeForm();
            } catch (e) {
                console.error('[Panel] 创建快捷动作失败:', e);
                showToast('创建快捷动作失败');
            }
        };

        // 事件绑定
        btnCancel.addEventListener('click', closeForm);
        btnConfirm.addEventListener('click', confirmAction);

        // 键盘支持
        btnCancel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeForm();
            }
        });
        btnConfirm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                confirmAction();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmAction();
            if (e.key === 'Escape') closeForm();
        });

        // 点击遮罩关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeForm();
            }
        });

        // 显示对话框
        dialog.showModal();
    }

    // 添加快捷方式 - 根据当前面板类型
    function createQuickAction() {
        const panelType = getCurrentPanelType();

        // "全部功能"面板不允许添加快捷方式
        if (panelType === 'home') {
            return;
        }

        if (panelType === 'button') {
            createButtonQuickActionForm();
        } else if (panelType === 'rename') {
            createRenameQuickActionForm();
        } else if (panelType === 'tools' || panelType === 'optimize') {
            createOptimizeQuickActionForm();
        } else if (panelType === 'font') {
            showToast('字体管理暂不支持创建快捷方式');
        } else if (panelType === 'translate') {
            createTranslateQuickActionForm();
        } else if (panelType === 'guides') {
            createGuidesQuickActionForm();
        } else {
            createExportQuickActionForm();
        }
    }

    // 创建参考线快捷方式表单（模态对话框）
    function createGuidesQuickActionForm() {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-modal';

        const switchVertical = rootNode.querySelector('#guideVerticalSwitch');
        const switchHorizontal = rootNode.querySelector('#guideHorizontalSwitch');
        const inputIntervalVertical = rootNode.querySelector('#guideIntervalVertical');
        const inputIntervalHorizontal = rootNode.querySelector('#guideIntervalHorizontal');

        const enableVertical = switchVertical && switchVertical.checked;
        const enableHorizontal = switchHorizontal && switchHorizontal.checked;
        const intervalV = parseFloat(inputIntervalVertical.value);
        const intervalH = parseFloat(inputIntervalHorizontal.value);

        let defaultName = '参考线';
        if (enableVertical && !isNaN(intervalV) && intervalV > 0) {
            defaultName += `-纵向${intervalV}px`;
        }
        if (enableHorizontal && !isNaN(intervalH) && intervalH > 0) {
            defaultName += `-横向${intervalH}px`;
        }

        const dialog = document.createElement('dialog');
        dialog.innerHTML = `
            <div class="dialog-header">添加到快捷面板</div>
            <div class="dialog-body">
                <input type="text" id="quickActionName" placeholder="输入名称..." />
                <div class="guide-action-type-group">
                    <label class="tool-select-label">操作类型：</label>
                    <div class="tool-select-options">
                        <label class="tool-radio-label">
                            <input type="radio" name="guideActionType" value="generate" checked>
                            <span>生成参考线</span>
                        </label>
                        <label class="tool-radio-label">
                            <input type="radio" name="guideActionType" value="slice">
                            <span>基于参考线切片</span>
                        </label>
                        <label class="tool-radio-label">
                            <input type="radio" name="guideActionType" value="clear">
                            <span>清除</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="dialog-footer">
                <div class="quick-btn form-cancel-btn" role="button" tabindex="0" style="border-right-width: 2px;margin-right: 2px;">取消</div>
                <div class="quick-btn form-confirm-btn" role="button" tabindex="0" style="border-left-width: 2px;margin-left: 2px;">确定</div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#quickActionName');
        const actionRadios = dialog.querySelectorAll('input[name="guideActionType"]');
        const btnCancel = dialog.querySelector('.form-cancel-btn');
        const btnConfirm = dialog.querySelector('.form-confirm-btn');

        requestAnimationFrame(() => {
            input.value = defaultName;
            input.focus();
            input.select();
        });

        actionRadios.forEach((radio) => {
            radio.addEventListener('change', function() {
                if (this.value === 'generate') {
                    input.value = defaultName;
                } else if (this.value === 'slice') {
                    input.value = `${defaultName}-切片`;
                } else {
                    input.value = '清除参考线';
                }
            });
        });

        const closeForm = () => {
            overlay.remove();
        };

        const confirmAction = async () => {
            const customName = input.value.trim();
            const selectedAction = dialog.querySelector('input[name="guideActionType"]:checked').value;

            try {
                if (selectedAction === 'generate' && !enableVertical && !enableHorizontal) {
                    showToast('请先启用至少一个距离选项');
                    return;
                }

                const fallbackName = selectedAction === 'generate'
                    ? defaultName
                    : (selectedAction === 'slice' ? `${defaultName}-切片` : '清除参考线');
                const name = customName || fallbackName;
                const quickAction = {
                    id: Date.now().toString(),
                    type: selectedAction === 'clear'
                        ? 'guidesClear'
                        : (selectedAction === 'slice' ? 'guidesSlice' : 'guides'),
                    name,
                    icon: 'guides',
                    settings: {
                        enableVertical,
                        enableHorizontal,
                        intervalVertical: Number.isNaN(intervalV) ? 0 : intervalV,
                        intervalHorizontal: Number.isNaN(intervalH) ? 0 : intervalH
                    },
                    createdAt: new Date().toISOString()
                };

                await QuickActionStorage.add(quickAction);

                if (window.updateQuickPanel) {
                    window.updateQuickPanel();
                }

                showToast('已添加到快捷面板');
                closeForm();
            } catch (e) {
                console.error('[Panel] 创建快捷动作失败:', e);
                showToast('创建快捷动作失败');
            }
        };

        btnCancel.addEventListener('click', closeForm);
        btnConfirm.addEventListener('click', confirmAction);

        btnCancel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeForm();
            }
        });
        btnConfirm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                confirmAction();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmAction();
            if (e.key === 'Escape') closeForm();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeForm();
            }
        });

        dialog.showModal();
    }

    // 创建百度翻译快捷方式表单（模态对话框）
    function createTranslateQuickActionForm() {
        if (!window.TranslateModule) return;

        const overlay = document.createElement('div');
        overlay.className = 'dialog-modal';

        const dialog = document.createElement('dialog');
        dialog.innerHTML = `
            <div class="dialog-header">添加到快捷面板</div>
            <div class="dialog-body">
                <input type="text" id="quickActionName" placeholder="输入名称..." />
            </div>
            <div class="dialog-footer">
                <div class="quick-btn form-cancel-btn" role="button" tabindex="0" style="border-right-width: 2px;margin-right: 2px;">取消</div>
                <div class="quick-btn form-confirm-btn" role="button" tabindex="0" style="border-left-width: 2px;margin-left: 2px;">确定</div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#quickActionName');
        const btnCancel = dialog.querySelector('.form-cancel-btn');
        const btnConfirm = dialog.querySelector('.form-confirm-btn');

        const settings = TranslateModule.getState();
        requestAnimationFrame(() => {
            input.value = settings.appendTranslation ? '百度翻译-附文' : '百度翻译-替换';
            input.focus();
            input.select();
        });

        const closeForm = () => {
            overlay.remove();
        };

        const confirmAction = async () => {
            const customName = input.value.trim();

            try {
                commitCurrentPanelFormStates();
                const currentSettings = TranslateModule.getState();
                const quickAction = {
                    id: Date.now().toString(),
                    type: 'translate',
                    name: customName || (currentSettings.appendTranslation ? '百度翻译-附文' : '百度翻译-替换'),
                    icon: 'translate',
                    settings: {
                        from: currentSettings.from,
                        to: currentSettings.to,
                        appendTranslation: Boolean(currentSettings.appendTranslation)
                    },
                    createdAt: new Date().toISOString()
                };

                await QuickActionStorage.add(quickAction);

                if (window.updateQuickPanel) {
                    window.updateQuickPanel();
                }

                showToast('已添加到快捷面板');
                closeForm();
            } catch (e) {
                console.error('[Panel] 创建百度翻译快捷动作失败:', e);
                showToast('创建快捷动作失败');
            }
        };

        btnCancel.addEventListener('click', closeForm);
        btnConfirm.addEventListener('click', confirmAction);
        btnCancel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeForm();
            }
        });
        btnConfirm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                confirmAction();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmAction();
            if (e.key === 'Escape') closeForm();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeForm();
        });

        dialog.showModal();
    }

    // 创建导出快捷方式表单（模态对话框）
    function createExportQuickActionForm() {
        // 创建模态对话框
        const overlay = document.createElement('div');
        overlay.className = 'dialog-modal';

        const dialog = document.createElement('dialog');
        dialog.innerHTML = `
            <div class="dialog-header">添加到快捷面板</div>
            <div class="dialog-body">
                <input type="text" id="quickActionName" placeholder="输入名称..." />
            </div>
            <div class="dialog-footer">
                <div class="quick-btn form-cancel-btn" role="button" tabindex="0" style="border-right-width: 2px;margin-right: 2px;">取消</div>
                <div class="quick-btn form-confirm-btn" role="button" tabindex="0" style="border-left-width: 2px;margin-left: 2px;">确定</div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#quickActionName');
        const btnCancel = dialog.querySelector('.form-cancel-btn');
        const btnConfirm = dialog.querySelector('.form-confirm-btn');

        // 默认名称
        const settings = ExportModule.getState();

        // 等待渲染完成后再设置值
        requestAnimationFrame(() => {
            input.value = `导出-${settings.format}${settings.batchExport ? '(批量)' : ''}`;
            input.focus();
            input.select();
        });

        // 关闭函数
        const closeForm = () => {
            overlay.remove();
        };

        // 确认函数
        const confirmAction = async () => {
            const customName = input.value.trim();

            try {
                commitCurrentPanelFormStates();
                const settings = ExportModule.getState();

                // 验证：如果不使用源文件路径，则需要验证导出路径
                if (!settings.useSourcePath && !settings.exportPath) {
                    showToast('请先选择导出位置');
                    return;
                }

                const name = customName || `导出-${settings.format}${settings.batchExport ? '(批量)' : ''}`;

                const quickAction = {
                    id: Date.now().toString(),
                    type: 'export',
                    name: name,
                    icon: 'export',
                    settings: { ...settings },
                    createdAt: new Date().toISOString()
                };

                await QuickActionStorage.add(quickAction);

                if (window.updateQuickPanel) {
                    window.updateQuickPanel();
                }

                showToast('已添加到快捷面板');
                closeForm();
            } catch (e) {
                console.error('[Panel] 创建快捷动作失败:', e);
                showToast('创建快捷动作失败');
            }
        };

        // 事件绑定
        btnCancel.addEventListener('click', closeForm);
        btnConfirm.addEventListener('click', confirmAction);

        // 键盘支持
        btnCancel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeForm();
            }
        });
        btnConfirm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                confirmAction();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmAction();
            if (e.key === 'Escape') closeForm();
        });

        // 点击遮罩关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeForm();
            }
        });

        // 显示对话框
        dialog.showModal();
    }

// 初始化面板
    async function initPanel(root) {
        // #region agent log
        fetch('http://127.0.0.1:7327/ingest/718b66d4-bc81-4a98-a2c5-efd7b668dd07',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'896df9'},body:JSON.stringify({sessionId:'896df9',runId:'syntax-fix-1',hypothesisId:'H4',location:'src/modules/panel.js:897',message:'initPanel parsed and entered',data:{phase:'startup'},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        console.log('[Panel] 开始初始化主面板...');
        rootNode = root;

        try {
            // 加载设置
            ExportModule.init();

            // 初始化 UI 控件
            initControls();

            // 绑定事件
            bindEvents();

            // 设置图层选择变化监听
            setupLayerSelectionListener();

            // 确保初始显示全部功能面板
            switchPanel('home');

            // 初始化功能项选中状态
            rootNode.querySelectorAll('.feature-item').forEach(item => {
                item.classList.toggle('active', item.dataset.goto === 'home');
            });

            console.log('[Panel] 主面板初始化完成');
        } catch (e) {
            console.error('[Panel] 主面板初始化失败:', e);
        }
    }

    // 设置图层选择变化监听
    function setupLayerSelectionListener() {
        try {
            const photoshop = require('photoshop');
            const { action } = photoshop;

            // 监听图层选择变化事件
            action.addNotificationListener(['select'], async (event) => {
                console.log('[Panel] 检测到图层选择变化:', event);

                // 延迟执行，确保图层选择已完成
                setTimeout(async () => {
                    await checkAndAutoDetectFont();
                }, 100);
            });

            console.log('[Panel] 已设置图层选择监听');
        } catch (e) {
            console.error('[Panel] 设置图层监听失败:', e);
        }
    }

    // 检查并自动检测字体
    async function checkAndAutoDetectFont() {
        if (!window.FontModule) return;

        // 获取当前面板类型
        const activePanel = rootNode.querySelector('.panel-content.active');
        if (!activePanel || activePanel.id !== 'fontPanel') return;

        // 如果当前在字体管理面板，自动检测
        await autoDetectLayerFont();
    }

    // 刷新面板
    function refreshPanel() {
        console.log('[Panel] 刷新主面板');
        if (!rootNode) {
            console.log('[Panel] refreshPanel - rootNode 为空，跳过');
            return;
        }
        // 重新加载设置
        ExportModule.init();
        // 重新初始化控件
        initControls();
    }

        // 初始化控件
    function initControls() {
        // 初始化导出控件
        initExportControls();

        // 初始化按钮生成控件
        initButtonControls();

        // 初始化重命名控件
        initRenameControls();

        // 初始化文档优化控件
        initOptimizeControls();

        // 初始化字体管理控件
        initFontControls();

        // 初始化百度翻译控件
        initTranslateControls();
    }

    // 初始化导出控件
    function initExportControls() {
        ExportModule.init();
        const exportSettings = ExportModule.getState();

        // 格式选择
        const formatRadio = rootNode.querySelector('#exportFormat');
        if (formatRadio) {
            formatRadio.selected = exportSettings.format;
        }

        // PNG 位深
        const pngBitDepthRadio = rootNode.querySelector('#pngBitDepth');
        if (pngBitDepthRadio) {
            pngBitDepthRadio.selected = String(exportSettings.pngBitDepth || 24);
        }

        // JPEG 质量
        const qualityInput = rootNode.querySelector('#jpegQuality');
        if (qualityInput) {
            qualityInput.value = exportSettings.jpegQuality || 100;
        }

        // 导出路径
        const pathInput = rootNode.querySelector('#exportPath');
        if (pathInput && exportSettings.exportPath) {
            pathInput.value = exportSettings.exportPath;
        }
        if (pathInput) {
            pathInput.addEventListener('blur', function(e) {
                const path = this.value.trim();
                if (path && path !== exportSettings.exportPath) {
                    ExportModule.setState({ exportPath: path }, { persist: true });
                    console.log('[Panel] 已保存输入的路径:', path);
                }
            });
        }

        // 批量导出开关
        const batchSwitch = rootNode.querySelector('#batchExportSwitch');
        if (batchSwitch) {
            batchSwitch.checked = exportSettings.batchExport;
        }

        // 使用源文件路径开关
        const sourcePathSwitch = rootNode.querySelector('#useSourcePathSwitch');
        if (sourcePathSwitch) {
            sourcePathSwitch.checked = exportSettings.useSourcePath;
            updateSourcePathVisibility();
        }

        // 源文件子文件夹名称
        const sourceFolderNameInput = rootNode.querySelector('#sourceFolderName');
        if (sourceFolderNameInput && exportSettings.sourceFolderName) {
            sourceFolderNameInput.value = exportSettings.sourceFolderName;
        }

        // 更新 JPEG 质量组显示
        updateJpegQualityVisibility();
        updatePngBitDepthVisibility();
    }

        // 初始化按钮生成控件
    function initButtonControls() {
        if (!window.ButtonModule) return;

        const settings = ButtonModule.init();
        const widthInput = rootNode.querySelector('#widthOffset');
        const heightInput = rootNode.querySelector('#heightOffset');
        const radiusInput = rootNode.querySelector('#cornerRadius');

        requestAnimationFrame(() => {
            setButtonColorUIFromRgb(settings.buttonColor);
        });

        // 更新数值框显示（确保显示的是模块设置的值）
        if (widthInput) widthInput.value = settings.widthOffset;
        if (heightInput) heightInput.value = settings.heightOffset;
        if (radiusInput) radiusInput.value = settings.cornerRadius;
    }

    // 初始化重命名控件
    function initRenameControls() {
        if (!window.RenameModule) return;

        const settings = RenameModule.init();
        const baseNameInput = rootNode.querySelector('#renameBaseName');
        const positionRadio = rootNode.querySelector('#namingPosition');
        const sequenceStartInput = rootNode.querySelector('#sequenceStart');

        // 更新 UI 控件显示
        if (baseNameInput) baseNameInput.value = settings.baseName || '';
        if (positionRadio) positionRadio.selected = settings.position || 'prefix';
        if (sequenceStartInput) sequenceStartInput.value = settings.sequenceStart || 1;

        // 更新预览
        updateRenamePreview();
    }

    // 初始化文档优化控件
    function initOptimizeControls() {
        if (window.SmartObjectModule) {
            const saved = SmartObjectModule.init();
            const smartObjectEnabledCheckbox = rootNode.querySelector('#enableSmartObject');
            const dpiWrap = rootNode.querySelector('#smartobjectDpiWrap');
            const dpiInput = rootNode.querySelector('#smartobjectDpi');
            const smartObjectEnabled = typeof saved.enabled === 'boolean'
                ? saved.enabled
                : SmartObjectModule.getDefaultSettings().enabled;

            if (smartObjectEnabledCheckbox) {
                smartObjectEnabledCheckbox.checked = smartObjectEnabled;
            }
            if (dpiWrap) {
                dpiWrap.hidden = !smartObjectEnabled;
            }
            if (dpiInput) {
                dpiInput.value = saved.targetDpi || SmartObjectModule.getDefaultSettings().targetDpi;
            }
        }

        if (window.DeleteLayerModule) {
            const deleteSettings = DeleteLayerModule.init();
            const deleteEmptyCheckbox = rootNode.querySelector('#deleteEmptyLayers');
            const deleteHiddenCheckbox = rootNode.querySelector('#deleteHiddenLayers');

            if (deleteEmptyCheckbox) {
                deleteEmptyCheckbox.checked = Boolean(deleteSettings.deleteEmpty);
            }
            if (deleteHiddenCheckbox) {
                deleteHiddenCheckbox.checked = Boolean(deleteSettings.deleteHidden);
            }
        }
    }

    // 初始化字体管理控件
    function initFontControls() {
        if (!window.FontModule) return;

        const settings = FontModule.init();
        const familyPicker = rootNode.querySelector('#fontFamily');
        const familyOptions = rootNode.querySelector('#fontFamilyOptions');
        const searchInput = rootNode.querySelector('#fontSearch');
        const realtimeSwitch = rootNode.querySelector('#fontRealtimeSwitch');

        if (searchInput) {
            searchInput.value = settings.searchKeyword || '';
        }

        if (realtimeSwitch) {
            realtimeSwitch.checked = Boolean(settings.realtime);
        }

        if (settings.fontSize) {
            const fontSizeInput = rootNode.querySelector('#fontSizeInput');
            if (fontSizeInput) {
                fontSizeInput.value = settings.fontSize;
            }
        }

        const availableGroups = FontModule.filterGroupedFonts(settings.searchKeyword || '');
        const currentFamilyExists = availableGroups.some(group => group.family === settings.family);
        const nextFamily = currentFamilyExists ? settings.family : (availableGroups[0]?.family || '');

        renderFontFamilyOptions(settings.searchKeyword || '', nextFamily);
        renderFontStyleButtons(nextFamily, settings.postScriptName || '');
        updateFontSelectionInfo();
    }

    // 初始化百度翻译控件
    function applyTranslateSettingsToUI(translateSettings) {
        if (translateSettings) {
            const appIdInput = rootNode.querySelector('#baiduAppId');
            const secretKeyInput = rootNode.querySelector('#baiduSecretKey');
            const appendSwitch = rootNode.querySelector('#appendTranslationSwitch');

            if (appIdInput) appIdInput.value = translateSettings.appId || '';
            if (secretKeyInput) secretKeyInput.value = translateSettings.secretKey || '';
            if (appendSwitch) appendSwitch.checked = Boolean(translateSettings.appendTranslation);
            setPickerSelected('#translateFrom', translateSettings.from || 'auto');
            setPickerSelected('#translateTo', translateSettings.to || 'zh');
        }
    }

    // 初始化百度翻译控件
    async function initTranslateControls() {
        if (!window.TranslateModule) return;
        const translateSettings = await TranslateModule.init();
        applyTranslateSettingsToUI(translateSettings);
        translateSettingsLoaded = true;
    }

    function renderFontFamilyOptions(keyword, selectedFamily) {
        const familyOptions = rootNode.querySelector('#fontFamilyOptions');
        if (!familyOptions || !window.FontModule) return;

        const groups = FontModule.filterGroupedFonts(keyword || '');
        familyOptions.innerHTML = groups.map(group => {
            const selectedAttr = group.family === selectedFamily ? ' selected' : '';
            return `<sp-menu-item value="${escapeHtml(group.family)}"${selectedAttr}>${escapeHtml(group.displayName)}</sp-menu-item>`;
        }).join('');
    }

    // 渲染字体样式按钮（强制两行排列：第一行5个，其余第二行）
    function renderFontStyleButtons(family, preferredPostScriptName) {
        const container = rootNode.querySelector('#fontStyleButtons');
        if (!container || !window.FontModule) return;

        const styles = FontModule.getStylesByFamilySorted(family);
        
        if (styles.length === 0) {
            container.innerHTML = '<p class="info-text">请先选择字体家族</p>';
            return;
        }

        const maxFirstRow = 5;
        const firstRow = styles.slice(0, maxFirstRow);
        const secondRow = styles.slice(maxFirstRow);

        let html = '<div class="font-style-row">';
        firstRow.forEach(styleItem => {
            const isSelected = styleItem.postScriptName === preferredPostScriptName;
            const selectedClass = isSelected ? ' selected' : '';
            html += `<button class="font-style-btn${selectedClass}" data-postscript="${escapeHtml(styleItem.postScriptName)}" data-style="${escapeHtml(styleItem.style)}">${escapeHtml(styleItem.style)}</button>`;
        });
        html += '</div>';

        if (secondRow.length > 0) {
            html += '<div class="font-style-row">';
            secondRow.forEach(styleItem => {
                const isSelected = styleItem.postScriptName === preferredPostScriptName;
                const selectedClass = isSelected ? ' selected' : '';
                html += `<button class="font-style-btn${selectedClass}" data-postscript="${escapeHtml(styleItem.postScriptName)}" data-style="${escapeHtml(styleItem.style)}">${escapeHtml(styleItem.style)}</button>`;
            });
            html += '</div>';
        }
        
        container.innerHTML = html;

        // 绑定点击事件
        container.querySelectorAll('.font-style-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                container.querySelectorAll('.font-style-btn').forEach(b => b.classList.remove('selected'));
                this.classList.add('selected');
                commitFontFormState({ persist: true });
                updateFontSelectionInfo();
                triggerRealtimeFontApply();
            });
        });
    }

    function normalizeFontSizeValue(value) {
        const rawValue = typeof value === 'number'
            ? value
            : (value?._value ?? value?.value ?? value);
        const numericValue = Number(rawValue);
        return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
    }

    function normalizeDescriptorNumber(value) {
        const rawValue = typeof value === 'number'
            ? value
            : (value?._value ?? value?.value ?? value);
        const numericValue = Number(rawValue);
        return Number.isFinite(numericValue) ? numericValue : null;
    }

    function getTextLayerVerticalScale(textKey) {
        const transform = textKey?.transform;
        if (!transform) return 1;

        const xy = normalizeDescriptorNumber(transform.xy) || 0;
        const yy = normalizeDescriptorNumber(transform.yy);
        const scale = yy === null ? 1 : Math.sqrt((xy * xy) + (yy * yy));

        return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }

    function scaleFontSizeFromTextTransform(fontSize, textKey) {
        const scale = getTextLayerVerticalScale(textKey);
        return Math.abs(scale - 1) > 0.0001 ? fontSize * scale : fontSize;
    }

    function getEffectiveFontSizeFromStyle(textStyle, textKey) {
        const impliedFontSize = normalizeFontSizeValue(textStyle?.impliedFontSize);
        if (impliedFontSize) return impliedFontSize;

        const size = normalizeFontSizeValue(textStyle?.size);
        return size ? scaleFontSizeFromTextTransform(size, textKey) : null;
    }

    function formatFontSizeValue(value) {
        const fontSize = normalizeFontSizeValue(value);
        if (!fontSize) return '未识别';
        return Number.isInteger(fontSize)
            ? String(fontSize)
            : String(Number(fontSize.toFixed(2)));
    }

    function extractFontSizeFromTextKey(textKey) {
        const textStyleRange = Array.isArray(textKey?.textStyleRange) ? textKey.textStyleRange : [];

        for (const rangeItem of textStyleRange) {
            const textStyle = rangeItem?.textStyle || rangeItem;
            const effectiveFontSize = getEffectiveFontSizeFromStyle(textStyle, textKey);
            if (effectiveFontSize) return effectiveFontSize;
        }

        return getEffectiveFontSizeFromStyle(textKey?.baseParentStyle, textKey)
            || getEffectiveFontSizeFromStyle(textKey?.defaultStyle, textKey)
            || getEffectiveFontSizeFromStyle(textKey?.textStyle, textKey);
    }

    function readDomFontSize(textItem) {
        return normalizeFontSizeValue(textItem?.size)
            || normalizeFontSizeValue(textItem?.characterStyle?.size);
    }

    function updateFontSelectionInfo() {
        const infoNode = rootNode.querySelector('#fontSelectionInfo');
        if (!infoNode) return;

        infoNode.innerHTML = `<sp-label class="font-selection-meta current-font-size-label">当前字号：${escapeHtml(formatFontSizeValue(rootNode.__detectedFontSize))}</sp-label>`;
    }

    async function triggerRealtimeFontApply() {
        if (!window.FontModule) return;

        const settings = FontModule.getState();
        const isOpticalKerning = rootNode.querySelector('#chk-optical-kerning')?.checked || false;
        const isSmoothAntialias = rootNode.querySelector('#chk-smooth-antialias')?.checked || false;
        const shouldApplyFont = Boolean(settings.postScriptName || settings.fontSize);
        const shouldApplyTextStyle = Boolean(isOpticalKerning || isSmoothAntialias);

        if (!settings.realtime || (!shouldApplyFont && !shouldApplyTextStyle)) {
            return;
        }

        const applyFontBtn = rootNode.querySelector('#applyFontBtn');
        if (!applyFontBtn || applyFontBtn.hasAttribute('loading')) {
            return;
        }

        const originalText = applyFontBtn.textContent;
        applyFontBtn.setAttribute('loading', '');
        applyFontBtn.textContent = '实时应用中...';

        try {
            if (shouldApplyFont) {
                const result = await runWithPreActionSync(() => FontModule.execute());
                if (settings.fontSize) {
                    rootNode.__detectedFontSize = settings.fontSize;
                    updateFontSelectionInfo();
                }
                showToast(`已应用到 ${result.updatedCount} 个文字图层`);
            }

            if (shouldApplyTextStyle) {
                if (typeof FontModule.applyTextStyleOptions === 'function') {
                    await FontModule.applyTextStyleOptions(isOpticalKerning, isSmoothAntialias);
                }
            }
        } catch (e) {
            console.error('[Panel] 实时应用字体失败:', e);
            const silentMessages = [
                '请先选择文字图层',
                '选中项中没有可修改的文字图层'
            ];
            if (!silentMessages.includes(e.message)) {
                showToast('实时应用失败: ' + e.message);
            }
        } finally {
            applyFontBtn.removeAttribute('loading');
            applyFontBtn.textContent = originalText;
        }
    }

    function rgbToHsv(color) {
        const r = Math.min(1, Math.max(0, color?.r ?? 0));
        const g = Math.min(1, Math.max(0, color?.g ?? 0));
        const b = Math.min(1, Math.max(0, color?.b ?? 0));
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        let h = 0;

        if (delta > 0) {
            if (max === r) {
                h = ((g - b) / delta) % 6;
            } else if (max === g) {
                h = (b - r) / delta + 2;
            } else {
                h = (r - g) / delta + 4;
            }
            h *= 60;
            if (h < 0) {
                h += 360;
            }
        }

        const s = max === 0 ? 0 : delta / max;
        const v = max;

        return { h, s, v };
    }

    function hsvToRgb(h, s, v) {
        const hue = ((Number.isFinite(h) ? h : 0) % 360 + 360) % 360;
        const sat = Math.min(1, Math.max(0, Number.isFinite(s) ? s : 0));
        const val = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
        const c = val * sat;
        const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
        const m = val - c;
        let rPrime = 0;
        let gPrime = 0;
        let bPrime = 0;

        if (hue < 60) {
            rPrime = c; gPrime = x; bPrime = 0;
        } else if (hue < 120) {
            rPrime = x; gPrime = c; bPrime = 0;
        } else if (hue < 180) {
            rPrime = 0; gPrime = c; bPrime = x;
        } else if (hue < 240) {
            rPrime = 0; gPrime = x; bPrime = c;
        } else if (hue < 300) {
            rPrime = x; gPrime = 0; bPrime = c;
        } else {
            rPrime = c; gPrime = 0; bPrime = x;
        }

        return {
            r: rPrime + m,
            g: gPrime + m,
            b: bPrime + m,
            a: 1
        };
    }

    function rgbToHex(color) {
        const toHex = (value) => Math.round(Math.min(1, Math.max(0, value || 0)) * 255).toString(16).padStart(2, '0').toUpperCase();
        return `${toHex(color?.r)}${toHex(color?.g)}${toHex(color?.b)}`;
    }

    function parseHexColor(value) {
        const sanitized = (value || '').trim().replace(/^#/, '');
        if (!/^[0-9a-fA-F]{6}$/.test(sanitized)) {
            return null;
        }

        return {
            r: parseInt(sanitized.slice(0, 2), 16) / 255,
            g: parseInt(sanitized.slice(2, 4), 16) / 255,
            b: parseInt(sanitized.slice(4, 6), 16) / 255,
            a: 1
        };
    }

    function clampRgb8(value) {
        const numeric = Number.parseInt(String(value ?? '').trim(), 10);
        if (Number.isNaN(numeric)) {
            return null;
        }
        return Math.max(0, Math.min(255, numeric));
    }

    function getFontPickerState() {
        if (!rootNode.__fontPickerState) {
            rootNode.__fontPickerState = { h: 0, s: 1, v: 1 };
        }
        return rootNode.__fontPickerState;
    }

    function setFontPickerState(nextState) {
        const pickerState = getFontPickerState();
        if (Number.isFinite(nextState?.h)) pickerState.h = ((nextState.h % 360) + 360) % 360;
        if (Number.isFinite(nextState?.s)) pickerState.s = Math.max(0, Math.min(1, nextState.s));
        if (Number.isFinite(nextState?.v)) pickerState.v = Math.max(0, Math.min(1, nextState.v));
        return pickerState;
    }

    function getButtonPickerState() {
        if (!rootNode.__buttonPickerState) {
            rootNode.__buttonPickerState = { h: 0, s: 0, v: 0 };
        }
        return rootNode.__buttonPickerState;
    }

    function setButtonPickerState(nextState) {
        const pickerState = getButtonPickerState();
        if (Number.isFinite(nextState?.h)) pickerState.h = ((nextState.h % 360) + 360) % 360;
        if (Number.isFinite(nextState?.s)) pickerState.s = Math.max(0, Math.min(1, nextState.s));
        if (Number.isFinite(nextState?.v)) pickerState.v = Math.max(0, Math.min(1, nextState.v));
        return pickerState;
    }

    function renderButtonPickerUI(syncInputs = true) {
        const pickerState = getButtonPickerState();
        const field = rootNode.querySelector('#buttonColorField');
        const fieldThumb = rootNode.querySelector('#buttonColorFieldThumb');
        const hueThumb = rootNode.querySelector('#buttonHueThumb');
        const preview = rootNode.querySelector('#buttonColorPreview');
        const inputR = rootNode.querySelector('#buttonColorR');
        const inputG = rootNode.querySelector('#buttonColorG');
        const inputB = rootNode.querySelector('#buttonColorB');
        const inputHex = rootNode.querySelector('#buttonColorHex');
        const hueColor = hsvToRgb(pickerState.h, 1, 1);
        const finalColor = hsvToRgb(pickerState.h, pickerState.s, pickerState.v);
        const finalHex = rgbToHex(finalColor);
        const hueCss = `rgb(${Math.round(hueColor.r * 255)}, ${Math.round(hueColor.g * 255)}, ${Math.round(hueColor.b * 255)})`;
        const finalCss = `rgb(${Math.round(finalColor.r * 255)}, ${Math.round(finalColor.g * 255)}, ${Math.round(finalColor.b * 255)})`;

        if (field) {
            field.style.background = `linear-gradient(to top, #000000 0%, rgba(0, 0, 0, 0) 100%), linear-gradient(to right, #ffffff 0%, rgba(255, 255, 255, 0) 100%), ${hueCss}`;
            field.style.backgroundColor = hueCss;
        }
        if (fieldThumb) {
            fieldThumb.style.left = `${pickerState.s * 100}%`;
            fieldThumb.style.top = `${(1 - pickerState.v) * 100}%`;
        }
        if (hueThumb) {
            hueThumb.style.top = `${(pickerState.h / 360) * 100}%`;
        }
        if (preview) {
            preview.style.backgroundColor = finalCss;
        }
        if (syncInputs) {
            if (inputR) inputR.value = String(Math.round(finalColor.r * 255));
            if (inputG) inputG.value = String(Math.round(finalColor.g * 255));
            if (inputB) inputB.value = String(Math.round(finalColor.b * 255));
            if (inputHex) inputHex.value = finalHex;
        }
    }

    function getButtonColorFromUI() {
        const pickerState = getButtonPickerState();
        return hsvToRgb(pickerState.h, pickerState.s, pickerState.v);
    }

    function setButtonColorUIFromRgb(color) {
        if (window.ButtonModule && color) {
            ButtonModule.setState({ buttonColor: color }, { persist: true });
        }
        setButtonPickerState(rgbToHsv(color || { r: 0, g: 0, b: 0, a: 1 }));
        renderButtonPickerUI();
    }

    function bindFontSizeEvents() {
        const fontSizeInput = rootNode.querySelector('#fontSizeInput');
        if (fontSizeInput) {
            const applyFontSize = () => {
                const size = parseInt(fontSizeInput.value, 10);
                if (size >= 1 && size <= 999) {
                    commitFontFormState({ persist: true });
                    updateFontSelectionInfo();
                    triggerRealtimeFontApply();
                    fontSizeInput.value = '';
                }
            };

            fontSizeInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyFontSize();
                }
            });

            fontSizeInput.addEventListener('blur', function() {
                applyFontSize();
            });
        }
    }

    // 绑定文本段落格式对齐并精确定位恢复事件（完美支持单图层及多图层逐个隔离处理）
    function bindAlignEvents() {
        const alignLeftBtn = rootNode.querySelector('#alignLeftBtn');
        const alignCenterBtn = rootNode.querySelector('#alignCenterBtn');
        const alignRightBtn = rootNode.querySelector('#alignRightBtn');

        console.log('[Panel] 独立对齐与位置恢复按钮查询结果:', {
            alignLeftBtn: alignLeftBtn,
            alignCenterBtn: alignCenterBtn,
            alignRightBtn: alignRightBtn
        });

        /**
         * 核心处理函数
         * @param {string} alignment 'left' | 'center' | 'right'
         */
        const applyTextAlignmentWithRestoration = async (alignment) => {
            try {
                const photoshop = require('photoshop');
                const { app, core, action } = photoshop;
                const Justify = photoshop.constants.Justification;

                const justificationMap = {
                    'left': Justify.LEFT,
                    'center': Justify.CENTER,
                    'right': Justify.RIGHT
                };

                const doc = app.activeDocument;
                if (!doc) {
                    showToast('没有活动文档');
                    return;
                }

                // 1. 备份用户最初选择的所有图层（包含多选状态）
                const originalActiveLayers = Array.from(doc.activeLayers || []);
                if (originalActiveLayers.length === 0) {
                    showToast('请先选择文字图层');
                    return;
                }

                // 2. 筛选出其中所有的文字图层
                const textLayers = originalActiveLayers.filter(layer => layer.kind === photoshop.constants.LayerKind.TEXT);
                if (textLayers.length === 0) {
                    showToast('选中的图层中没有文字图层');
                    return;
                }

                const targetJustification = justificationMap[alignment];

                // 3. 严格遵循 UXP 铁律，将所有改变文档状态的操作包裹在 executeAsModal 中
                await core.executeAsModal(async (context) => {
                    const getValue = (v) => typeof v === 'object' && v !== null ? v.value : Number(v);

                    // 4. 开始逐个迭代隔离处理
                    for (const layer of textLayers) {
                        
                        // 【关键修复点】：强制在 PS 界面中"独占选中"当前这一个图层，阻断多选联动误伤
                        await action.batchPlay([{
                            _obj: 'select',
                            _target: [{ _ref: 'layer', _id: layer.id }],
                            makeVisible: false
                        }], {});

                        // 5. 记录对齐前该图层的绝对坐标
                        const oldLeft = getValue(layer.bounds.left);
                        const oldTop = getValue(layer.bounds.top);

                        // 6. 修改文字内部段落格式对齐属性
                        layer.textItem.paragraphStyle.justification = targetJustification;

                        // 7. 再次获取改变对齐点后产生漂移的新坐标
                        const newLeft = getValue(layer.bounds.left);
                        const newTop = getValue(layer.bounds.top);

                        // 8. 计算精确的物理像素位移差值（反向拉回量）
                        const deltaX = oldLeft - newLeft;
                        const deltaY = oldTop - newTop;

                        // 9. 如果发生了物理位置偏移，将其精准平移回原位
                        if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
                            await action.batchPlay([{
                                _obj: 'transform',
                                _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }], // 此时只有单图层被选中，100% 安全
                                freeTransformCenterState: {
                                    _enum: 'quadCenterState',
                                    _value: 'QCSAverage'
                                },
                                offset: {
                                    _obj: 'offset',
                                    horizontal: { _unit: 'pixelsUnit', _value: deltaX },
                                    vertical: { _unit: 'pixelsUnit', _value: deltaY }
                                },
                                _options: { dialogOptions: 'dontDisplay' }
                            }], {});
                        }
                    }

                    // 10. 【完美收尾】：循环全部结束后，一次性把最初的多选图层重新全部选中，还原用户交互界面
                    if (originalActiveLayers.length > 0) {
                        await action.batchPlay([{
                            _obj: 'select',
                            _target: originalActiveLayers.map(l => ({ _ref: 'layer', _id: l.id })),
                            makeVisible: false
                        }], {});
                    }

                }, { commandName: `精确定位文字段落对齐: ${alignment}` });

                showToast(`已完成 ${textLayers.length} 个图层的原位段落对齐`);

            } catch (e) {
                console.error('[Panel] 复合隔离对齐失败:', e);
                showToast('对齐失败: ' + e.message);
            }
        };

        // 绑定按钮原位属性
        if (alignLeftBtn) {
            alignLeftBtn.onclick = () => {
                console.log('[Panel] alignLeftBtn 触发隔离原位左对齐');
                applyTextAlignmentWithRestoration('left');
            };
        }

        if (alignCenterBtn) {
            alignCenterBtn.onclick = () => {
                console.log('[Panel] alignCenterBtn 触发隔离原位居中对齐');
                applyTextAlignmentWithRestoration('center');
            };
        }

        if (alignRightBtn) {
            alignRightBtn.onclick = () => {
                console.log('[Panel] alignRightBtn 触发隔离原位右对齐');
                applyTextAlignmentWithRestoration('right');
            };
        }

        // ==========================================
        // 以下为你原始保留的图层画布居中对齐逻辑（未修改）
        // ==========================================
        const alignHCenterBtn = rootNode.querySelector('#alignHCenterBtn');
        const alignVCenterBtn = rootNode.querySelector('#alignVCenterBtn');

        const alignLayerToCanvas = async (direction) => {
            try {
                const photoshop = require('photoshop');
                const { app, core, action } = photoshop;
                const doc = app.activeDocument;
                if (!doc) { showToast('没有活动文档'); return; }
                const selectedLayers = Array.from(doc.activeLayers || []);
                if (selectedLayers.length === 0) { showToast('请先选择图层'); return; }
                const movedLayerIds = [];

                await core.executeAsModal(async (context) => {
                    const canvasWidth = typeof doc.width === 'object' ? doc.width.value : Number(doc.width);
                    const canvasHeight = typeof doc.height === 'object' ? doc.height.value : Number(doc.height);

                    for (const layer of selectedLayers) {
                        if (layer.isBackgroundLayer) continue;

                        await action.batchPlay([{
                            _obj: 'select',
                            _target: [{ _ref: 'layer', _id: layer.id }],
                            _enum: 'ordinal', _value: 'targetEnum', makeVisible: false
                        }], {});

                        const bounds = layer.bounds;
                        const getValue = (v) => typeof v === 'object' ? v.value : Number(v);
                        
                        const layerLeft = getValue(bounds.left);
                        const layerTop = getValue(bounds.top);
                        const layerRight = getValue(bounds.right);
                        const layerBottom = getValue(bounds.bottom);
                        
                        const layerWidth = layerRight - layerLeft;
                        const layerHeight = layerBottom - layerTop;

                        let deltaX = 0; let deltaY = 0;

                        if (direction === 'horizontal') { deltaX = (canvasWidth - layerWidth) / 2 - layerLeft; } 
                        else if (direction === 'vertical') { deltaY = (canvasHeight - layerHeight) / 2 - layerTop; }

                        await action.batchPlay([{
                            _obj: 'transform',
                            _target: [{ _enum: 'ordinal', _ref: 'layer', _value: 'targetEnum' }],
                            freeTransformCenterState: { _enum: 'quadCenterState', _value: 'QCSAverage' },
                            offset: {
                                _obj: 'offset',
                                horizontal: { _unit: 'pixelsUnit', _value: deltaX },
                                vertical: { _unit: 'pixelsUnit', _value: deltaY }
                            },
                            _options: { dialogOptions: 'dontDisplay' }
                        }], {});

                        movedLayerIds.push(layer.id);
                    }

                    if (movedLayerIds.length > 0) {
                        await action.batchPlay([{
                            _obj: 'select',
                            _target: movedLayerIds.map(id => ({ _ref: 'layer', _id: id })),
                            _enum: 'ordinal', _value: 'targetEnum', makeVisible: false
                        }], {});
                    }
                }, { commandName: '图层居中对齐' });

                showToast(direction === 'horizontal' ? '已水平居中对齐' : '已垂直居中对齐');
            } catch (e) {
                console.error('[Panel] 图层居中失败:', e);
                showToast('居中对齐失败: ' + e.message);
            }
        };

        if (alignHCenterBtn) { alignHCenterBtn.addEventListener('click', () => alignLayerToCanvas('horizontal')); }
        if (alignVCenterBtn) { alignVCenterBtn.addEventListener('click', () => alignLayerToCanvas('vertical')); }
    }

    // 绑定事件
    function bindEvents() {
        // 导航图标点击 (包含 Ctrl+点击创建快捷方式)
        rootNode.querySelectorAll('.nav-icon').forEach(icon => {
            icon.addEventListener('click', function(e) {
                console.log('[Panel] 图标点击事件, ctrlKey:', e.ctrlKey, 'metaKey:', e.metaKey);
                // Ctrl+点击创建快捷方式
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Panel] Ctrl+点击，调用 createQuickAction');
                    createQuickAction();
                } else {
                    // 普通点击切换面板
                    const panel = this.dataset.panel;
                    switchPanel(panel);
                }
            });
        });

        // 全部功能面板 - 功能项点击跳转
        rootNode.querySelectorAll('.feature-item').forEach(item => {
            item.addEventListener('click', function() {
                const goto = this.dataset.goto;
                if (goto) {
                    switchPanel(goto);
                }
            });
        });

        // 字体管理搜索
        const fontSearchInput = rootNode.querySelector('#fontSearch');
        if (fontSearchInput) {
            fontSearchInput.addEventListener('input', function() {
                const keyword = this.value.trim();
                const currentSettings = FontModule.getState();
                const groups = FontModule.filterGroupedFonts(keyword);
                const currentFamily = currentSettings.family || '';
                const nextFamily = groups.some(group => group.family === currentFamily)
                    ? currentFamily
                    : (groups[0]?.family || '');

                renderFontFamilyOptions(keyword, nextFamily);
                renderFontStyleButtons(nextFamily, '');
                commitFontFormState({ persist: true });
                updateFontSelectionInfo();
            });
        }

        // 字体家族选择
        const fontFamilyPicker = rootNode.querySelector('#fontFamily');
        if (fontFamilyPicker) {
            fontFamilyPicker.addEventListener('change', function() {
                const selectedFamilyItem = this.querySelector('sp-menu-item[selected]');
                const family = selectedFamilyItem ? selectedFamilyItem.value || '' : '';
                renderFontStyleButtons(family, '');
                commitFontFormState({ persist: true });
                updateFontSelectionInfo();
            });
        }

        // 实时应用开关
        const fontRealtimeSwitch = rootNode.querySelector('#fontRealtimeSwitch');
        if (fontRealtimeSwitch) {
            fontRealtimeSwitch.addEventListener('change', function() {
                commitFontFormState({ persist: true });
            });
        }

        ['#chk-optical-kerning', '#chk-smooth-antialias'].forEach(selector => {
            const checkbox = rootNode.querySelector(selector);
            if (checkbox) {
                checkbox.addEventListener('change', function() {
                    triggerRealtimeFontApply();
                });
            }
        });

        // 百度翻译配置
        ['#baiduAppId', '#baiduSecretKey'].forEach(selector => {
            const input = rootNode.querySelector(selector);
            if (input) {
                input.addEventListener('input', function() {
                    syncTranslateUIToSettings();
                });
            }
        });

        ['#translateFrom', '#translateTo'].forEach(selector => {
            const picker = rootNode.querySelector(selector);
            if (picker) {
                picker.addEventListener('change', function() {
                    syncTranslateUIToSettings();
                });
            }
        });

        const appendTranslationSwitch = rootNode.querySelector('#appendTranslationSwitch');
        if (appendTranslationSwitch) {
            appendTranslationSwitch.addEventListener('change', function() {
                syncTranslateUIToSettings();
            });
        }

        const saveTranslateConfigBtn = rootNode.querySelector('#saveTranslateConfigBtn');
        if (saveTranslateConfigBtn) {
            saveTranslateConfigBtn.addEventListener('click', async function() {
                syncTranslateUIToSettings();
                if (window.TranslateModule && typeof TranslateModule.persist === 'function') {
                    await TranslateModule.persist();
                }
                showToast('配置已保存');
            });

            saveTranslateConfigBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    saveTranslateConfigBtn.click();
                }
            });
        }

        const clearTranslateConfigBtn = rootNode.querySelector('#clearTranslateConfigBtn');
        if (clearTranslateConfigBtn) {
            clearTranslateConfigBtn.addEventListener('click', async function() {
                if (!window.TranslateModule || typeof TranslateModule.clearPersisted !== 'function') return;
                const clearedSettings = await TranslateModule.clearPersisted();
                applyTranslateSettingsToUI(clearedSettings);
                showToast('配置已清除');
            });

            clearTranslateConfigBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    clearTranslateConfigBtn.click();
                }
            });
        }

        // 翻译选中文字按钮
        const translateSelectedTextBtn = rootNode.querySelector('#translateSelectedTextBtn');
        if (translateSelectedTextBtn) {
            translateSelectedTextBtn.addEventListener('click', async function() {
                if (this.hasAttribute('loading')) return;
                if (!window.TranslateModule) {
                    showToast('翻译模块未加载');
                    return;
                }

                const originalText = this.textContent;
                this.setAttribute('loading', '');
                this.textContent = '翻译中...';

                try {
                    const result = await runWithPreActionSync(() => TranslateModule.execute());
                    showToast(result.appendTranslation
                        ? `已创建 ${result.updatedCount} 个译文图层`
                        : `已翻译 ${result.updatedCount} 个文字图层`);
                } catch (e) {
                    console.error('[Panel] 百度翻译失败:', e);
                    showToast('百度翻译失败: ' + e.message);
                } finally {
                    this.removeAttribute('loading');
                    this.textContent = originalText;
                }
            });

            translateSelectedTextBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    translateSelectedTextBtn.click();
                }
            });
        }

        // 参考线功能
        bindGuidesEvents();

        // 应用字体按钮
        const applyFontBtn = rootNode.querySelector('#applyFontBtn');
        if (applyFontBtn) {
            applyFontBtn.addEventListener('click', async function() {
                if (this.hasAttribute('loading')) return;
                const originalText = this.textContent;
                this.setAttribute('loading', '');
                this.textContent = '应用中...';
                try {
                    commitFontFormState({ persist: true });
                    const settings = FontModule.getState();
                    const isOpticalKerning = rootNode.querySelector('#chk-optical-kerning')?.checked || false;
                    const isSmoothAntialias = rootNode.querySelector('#chk-smooth-antialias')?.checked || false;
                    const shouldApplyFont = Boolean(settings.postScriptName || settings.fontSize);
                    const shouldApplyTextStyle = Boolean(isOpticalKerning || isSmoothAntialias);

                    if (!shouldApplyFont && !shouldApplyTextStyle) {
                        throw new Error('请先选择字体样式、字号或字符样式选项');
                    }

                    if (shouldApplyFont) {
                        const result = await runWithPreActionSync(() => FontModule.execute());
                        if (settings.fontSize) {
                            rootNode.__detectedFontSize = settings.fontSize;
                            updateFontSelectionInfo();
                        }
                        showToast(`已应用到 ${result.updatedCount} 个文字图层`);
                    }

                    if (shouldApplyTextStyle) {
                        if (typeof FontModule.applyTextStyleOptions === 'function') {
                            const styleResult = await FontModule.applyTextStyleOptions(isOpticalKerning, isSmoothAntialias);
                            if (!shouldApplyFont && styleResult?.updatedCount) {
                                showToast(`已应用字符样式到 ${styleResult.updatedCount} 个文字图层`);
                            }
                        }
                    }
                } catch (e) {
                    console.error('[Panel] 应用字体失败:', e);
                    showToast('应用字体失败: ' + e.message);
                } finally {
                    this.removeAttribute('loading');
                    this.textContent = originalText;
                }
            });

            applyFontBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    applyFontBtn.click();
                }
            });
        }

        // 格式选择变化
        rootNode.querySelectorAll('#exportFormat sp-radio').forEach(radio => {
            radio.addEventListener('click', function(e) {
                const value = this.value;
                if (value) {
                    ExportModule.setState({ format: value }, { persist: true });
                    updateJpegQualityVisibility();
                    updatePngBitDepthVisibility();
                }
            });
        });

        // PNG 位深选择
        rootNode.querySelectorAll('#pngBitDepth sp-radio').forEach(radio => {
            radio.addEventListener('click', function() {
                const value = parseInt(this.value, 10);
                if (!Number.isNaN(value)) {
                    ExportModule.setState({ pngBitDepth: value }, { persist: true });
                }
            });
        });

        // JPEG 质量输入框
        const qualityInput = rootNode.querySelector('#jpegQuality');
        if (qualityInput) {
            qualityInput.addEventListener('input', function(e) {
                let value = parseInt(this.value, 10);
                if (Number.isNaN(value)) {
                    value = 100;
                }
                value = Math.max(1, Math.min(100, value));
                ExportModule.setState({ jpegQuality: value }, { persist: true });
            });
            qualityInput.addEventListener('blur', function(e) {
                let value = parseInt(this.value, 10);
                if (Number.isNaN(value)) {
                    value = 100;
                }
                value = Math.max(1, Math.min(100, value));
                this.value = value;
                ExportModule.setState({ jpegQuality: value }, { persist: true });
            });
        }

        // 选择导出位置
        const selectPathBtn = rootNode.querySelector('#selectPathBtn');
        if (selectPathBtn) {
            selectPathBtn.addEventListener('click', async function() {
                const path = await ExportModule.selectExportPath();
                if (path) {
                    const pathInput = rootNode.querySelector('#exportPath');
                    if (pathInput) {
                        pathInput.value = path;
                    }
                }
            });

            // 键盘支持
            selectPathBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectPathBtn.click();
                }
            });
        }

        // 批量导出开关
        const batchSwitch = rootNode.querySelector('#batchExportSwitch');
        if (batchSwitch) {
            batchSwitch.addEventListener('change', function(e) {
                const enabled = this.checked;
                ExportModule.setState({
                    batchExport: enabled,
                    excludeBackground: enabled ? true : ExportModule.getState().excludeBackground,
                    overwrite: enabled ? true : ExportModule.getState().overwrite
                }, { persist: true });
                updateBatchOptionsVisibility();
            });
        }

        // 使用源文件路径开关
        const sourcePathSwitch = rootNode.querySelector('#useSourcePathSwitch');
        if (sourcePathSwitch) {
            sourcePathSwitch.addEventListener('change', function(e) {
                ExportModule.setState({ useSourcePath: this.checked }, { persist: true });
                updateSourcePathVisibility();
            });
        }

        // 源文件子文件夹名称
        const sourceFolderNameInput = rootNode.querySelector('#sourceFolderName');
        if (sourceFolderNameInput) {
            sourceFolderNameInput.addEventListener('blur', function(e) {
                const name = this.value.trim();
                if (name !== ExportModule.getState().sourceFolderName) {
                    ExportModule.setState({ sourceFolderName: name }, { persist: true });
                    console.log('[Panel] 已保存子文件夹名称:', name);
                }
            });
        }

        // 导出按钮
        const exportBtn = rootNode.querySelector('#exportBtn');
        if (exportBtn) {
            // 强制设置内联样式以确保覆盖任何宿主样式
            exportBtn.style.cssText = `
                border: 1px solid rgba(255, 255, 255, 0.9) !important;
                background: var(--highlight) !important;
                box-shadow: none !important;
            `;

            exportBtn.addEventListener('click', async function() {
                if (this.hasAttribute('loading')) return;
                const originalText = this.textContent;
                this.setAttribute('loading', '');
                this.textContent = '导出中...';
                try {
                    await runWithPreActionSync(() => ExportModule.execute());
                    showToast('导出成功');
                } catch (e) {
                    console.error('[Panel] 导出失败:', e);
                    showToast('导出失败: ' + e.message);
                } finally {
                    this.removeAttribute('loading');
                    this.textContent = originalText;
                }
            });

            // 键盘支持
            exportBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    exportBtn.click();
                }
            });
        }

        // 按钮颜色同步
        bindButtonColorEvents();

        // 偏移和圆角事件
        bindOffsetEvents();

        // 生成按钮
        const generateBtn = rootNode.querySelector('#generateBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', async function() {
                if (this.hasAttribute('loading')) return;
                const originalText = this.textContent;
                this.setAttribute('loading', '');
                this.textContent = '生成中...';
                try {
                    await runWithPreActionSync(async () => {
                        await ButtonModule.execute();
                    });
                    showToast('按钮生成成功');
                } catch (e) {
                    console.error('[Panel] 生成按钮失败:', e);
                    showToast('生成失败: ' + e.message);
                } finally {
                    this.removeAttribute('loading');
                    this.textContent = originalText;
                }
            });

            // 键盘支持
            generateBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    generateBtn.click();
                }
            });
        }

        // 重命名控件事件
        bindRenameEvents();

        // 文档优化控件事件
        bindOptimizeEvents();

        // 字号按钮事件
        bindFontSizeEvents();

        // 文本对齐按钮事件
        bindAlignEvents();
    }

    // 绑定按钮颜色事件
    function bindButtonColorEvents() {
        const field = rootNode.querySelector('#buttonColorField');
        const hueSlider = rootNode.querySelector('#buttonHueSlider');
        const inputR = rootNode.querySelector('#buttonColorR');
        const inputG = rootNode.querySelector('#buttonColorG');
        const inputB = rootNode.querySelector('#buttonColorB');
        const inputHex = rootNode.querySelector('#buttonColorHex');
        let draggingTarget = null;
        let dragRect = null;
        let pendingDragPoint = null;
        let dragRafId = 0;

        const syncColorSettingFromUI = () => {
            const color = getButtonColorFromUI();
            ButtonModule.setState({ buttonColor: color }, { persist: true });
            return color;
        };

        const commitColorChange = () => {
            syncColorSettingFromUI();
            renderButtonPickerUI();
        };

        const handleDirectColorUpdate = (color, syncInputs = true) => {
            if (!color) return;
            ButtonModule.setState({ buttonColor: color }, { persist: true });
            setButtonPickerState(rgbToHsv(color));
            renderButtonPickerUI(syncInputs);
        };

        const updateFieldFromPoint = (clientX, clientY, rect = dragRect) => {
            if (!field || !rect) return;
            const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
            const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
            setButtonPickerState({
                s: rect.width ? x / rect.width : 0,
                v: rect.height ? 1 - (y / rect.height) : 0
            });
            renderButtonPickerUI(false);
        };

        const updateHueFromPoint = (clientY, rect = dragRect) => {
            if (!hueSlider || !rect) return;
            const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
            setButtonPickerState({
                h: rect.height ? (y / rect.height) * 360 : 0
            });
            renderButtonPickerUI(false);
        };

        const flushDragFrame = () => {
            dragRafId = 0;
            if (!draggingTarget || !pendingDragPoint) return;
            if (draggingTarget === 'field') {
                updateFieldFromPoint(pendingDragPoint.x, pendingDragPoint.y);
            } else if (draggingTarget === 'hue') {
                updateHueFromPoint(pendingDragPoint.y);
            }
            syncColorSettingFromUI();
            pendingDragPoint = null;
        };

        const scheduleDragFrame = () => {
            if (dragRafId) return;
            dragRafId = requestAnimationFrame(flushDragFrame);
        };

        const getClientPoint = (event) => {
            const point = event.touches?.[0] || event.changedTouches?.[0] || event;
            return {
                x: point?.clientX ?? 0,
                y: point?.clientY ?? 0
            };
        };

        if (field) {
            const startFieldDrag = (event) => {
                draggingTarget = 'field';
                dragRect = field.getBoundingClientRect();
                pendingDragPoint = getClientPoint(event);
                flushDragFrame();
            };
            field.addEventListener('mousedown', startFieldDrag);
            field.addEventListener('touchstart', startFieldDrag);
        }

        if (hueSlider) {
            const startHueDrag = (event) => {
                draggingTarget = 'hue';
                dragRect = hueSlider.getBoundingClientRect();
                pendingDragPoint = getClientPoint(event);
                flushDragFrame();
            };
            hueSlider.addEventListener('mousedown', startHueDrag);
            hueSlider.addEventListener('touchstart', startHueDrag);
        }

        document.addEventListener('mousemove', (event) => {
            if (!draggingTarget) return;
            pendingDragPoint = getClientPoint(event);
            scheduleDragFrame();
        });

        document.addEventListener('touchmove', (event) => {
            if (!draggingTarget) return;
            pendingDragPoint = getClientPoint(event);
            scheduleDragFrame();
        });

        const stopDrag = () => {
            if (!draggingTarget) return;
            if (dragRafId) {
                cancelAnimationFrame(dragRafId);
                dragRafId = 0;
            }
            if (pendingDragPoint) {
                flushDragFrame();
            }
            draggingTarget = null;
            dragRect = null;
            pendingDragPoint = null;
            commitColorChange();
        };

        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);

        const commitRgbInputs = () => {
            const r = clampRgb8(inputR?.value);
            const g = clampRgb8(inputG?.value);
            const b = clampRgb8(inputB?.value);
            if (r === null || g === null || b === null) {
                renderButtonPickerUI();
                return;
            }
            handleDirectColorUpdate({ r: r / 255, g: g / 255, b: b / 255, a: 1 });
        };

        [inputR, inputG, inputB].forEach((input) => {
            if (!input) return;
            input.addEventListener('change', commitRgbInputs);
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRgbInputs();
                }
            });
        });

        if (inputHex) {
            const commitHexInput = (valueOverride) => {
                const color = parseHexColor(valueOverride ?? inputHex.value);
                if (!color) {
                    renderButtonPickerUI();
                    return;
                }
                handleDirectColorUpdate(color);
            };

            inputHex.addEventListener('change', () => commitHexInput());
            inputHex.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commitHexInput();
                }
            });
        }
    }
    // 绑定偏移和圆角事件
    function bindOffsetEvents() {
        const widthInput = rootNode.querySelector('#widthOffset');
        const heightInput = rootNode.querySelector('#heightOffset');
        const radiusInput = rootNode.querySelector('#cornerRadius');

        if (widthInput) {
            widthInput.addEventListener('input', function() {
                const value = parseInt(this.value) || 0;
                ButtonModule.setState({ widthOffset: value }, { persist: true });
            });
            widthInput.addEventListener('blur', function() {
                let v = parseInt(this.value) || 0;
                v = Math.max(-100, Math.min(200, v));
                this.value = v;
            });
        }

        if (heightInput) {
            heightInput.addEventListener('input', function() {
                const value = parseInt(this.value) || 0;
                ButtonModule.setState({ heightOffset: value }, { persist: true });
            });
            heightInput.addEventListener('blur', function() {
                let v = parseInt(this.value) || 0;
                v = Math.max(-100, Math.min(200, v));
                this.value = v;
            });
        }

        if (radiusInput) {
            radiusInput.addEventListener('input', function() {
                const value = parseInt(this.value) || 0;
                ButtonModule.setState({ cornerRadius: value }, { persist: true });
            });
            radiusInput.addEventListener('blur', function() {
                let v = parseInt(this.value) || 0;
                v = Math.max(0, Math.min(100, v));
                this.value = v;
            });
        }
    }

    // 切换面板
    function switchPanel(panelId) {
        // 更新导航图标状态
        rootNode.querySelectorAll('.nav-icon').forEach(icon => {
            icon.classList.toggle('active', icon.dataset.panel === panelId);
        });

        // 更新内容区域显示
        rootNode.querySelectorAll('.panel-content').forEach(panel => {
            panel.classList.toggle('active', panel.id === panelId + 'Panel');
        });

        // 更新全部功能面板中的选中状态（只有非 home 面板时）
        rootNode.querySelectorAll('.feature-item').forEach(item => {
            item.classList.toggle('active', panelId !== 'home' && item.dataset.goto === panelId);
        });

        // 切换到字体管理面板时，自动识别选中图层的字体
        if (panelId === 'font') {
            autoDetectLayerFont();
        }
    }

    // 自动检测选中图层的字体并更新UI
    async function autoDetectLayerFont() {
        if (!window.FontModule) return;

        try {
            const photoshop = require('photoshop');
            const { app, action } = photoshop;

            const doc = app.activeDocument;
            if (!doc) {
                rootNode.__detectedFontSize = null;
                updateFontSelectionInfo();
                return;
            }

            const selectedLayers = Array.from(doc.activeLayers || []);
            if (selectedLayers.length !== 1) {
                rootNode.__detectedFontSize = null;
                updateFontSelectionInfo();
                return;
            }

            const layer = selectedLayers[0];
            if (layer.kind !== photoshop.constants.LayerKind.TEXT) {
                rootNode.__detectedFontSize = null;
                updateFontSelectionInfo();
                return;
            }

            let detectedFont = {
                postScriptName: '',
                fontSize: null
            };

            try {
                const [layerDescriptor] = await action.batchPlay([{
                    _obj: 'get',
                    _target: [
                        { _property: 'textKey' },
                        { _ref: 'layer', _id: layer.id }
                    ],
                    _options: { dialogOptions: 'dontDisplay' }
                }], {});

                detectedFont.fontSize = extractFontSizeFromTextKey(layerDescriptor?.textKey);
            } catch (batchPlayError) {
                console.warn('[Panel] batchPlay 读取文本字号失败，准备使用 DOM 兜底:', batchPlayError);
            }

            const textItem = layer.textItem;
            const characterStyle = textItem.characterStyle;
            detectedFont.postScriptName = characterStyle.font || '';
            detectedFont.fontSize = detectedFont.fontSize || readDomFontSize(textItem);

            if (!detectedFont.fontSize && !detectedFont.postScriptName) {
                rootNode.__detectedFontSize = null;
                updateFontSelectionInfo();
                return;
            }

            // 查找匹配的字体家族
            const groups = FontModule.getGroupedFonts();
            let matchedFamily = '';
            let matchedPostScriptName = '';

            for (const group of groups) {
                const matchedStyle = group.styles.find(s => s.postScriptName === detectedFont.postScriptName);
                if (matchedStyle) {
                    matchedFamily = group.family;
                    matchedPostScriptName = matchedStyle.postScriptName;
                    break;
                }
            }

            // 更新 FontModule 状态
            FontModule.setState({
                family: matchedFamily,
                postScriptName: matchedPostScriptName,
                fontSize: detectedFont.fontSize
            }, { persist: false });

            // 更新 UI
            const searchInput = rootNode.querySelector('#fontSearch');
            if (searchInput) {
                searchInput.value = '';
            }

            if (matchedFamily) {
                renderFontFamilyOptions('', matchedFamily);
                renderFontStyleButtons(matchedFamily, matchedPostScriptName);
            }

            rootNode.__detectedFontSize = detectedFont.fontSize;
            updateFontSelectionInfo();

            console.log('[Panel] 已自动识别图层字号:', detectedFont.fontSize);

        } catch (e) {
            console.error('[Panel] 自动识别字体失败:', e);
        }
    }

    // 更新 PNG 位深可见性
    function updatePngBitDepthVisibility() {
        const pngGroup = rootNode.querySelector('#pngBitDepthGroup');
        if (pngGroup) {
            const isPng = ExportModule.getState().format === 'PNG';
            pngGroup.style.display = isPng ? 'block' : 'none';
        }
    }

    // 更新 JPEG 质量可见性
    function updateJpegQualityVisibility() {
        const jpegGroup = rootNode.querySelector('#jpegQualityGroup');
        if (jpegGroup) {
            const isJpeg = ExportModule.getState().format === 'JPEG' || ExportModule.getState().format === 'JPG';
            jpegGroup.style.display = isJpeg ? 'block' : 'none';
        }
    }

    // 更新批量导出选项可见性
    function updateBatchOptionsVisibility() {
        const batchOptions = rootNode.querySelector('#batchOptions');
        if (batchOptions) {
            batchOptions.style.display = ExportModule.getState().batchExport ? 'block' : 'none';
        }
    }

    // 更新源文件路径选项可见性
    function updateSourcePathVisibility() {
        const sourceFolderGroup = rootNode.querySelector('#sourceFolderNameGroup');
        if (sourceFolderGroup) {
            sourceFolderGroup.style.display = ExportModule.getState().useSourcePath ? 'block' : 'none';
        }
    }

    // 清理函数
    function cleanupPanel() {
        console.log('[Panel] 清理主面板...');
        rootNode = null;
    }

    // 绑定参考线功能事件
    function bindGuidesEvents() {
        const lblDocHeight = rootNode.querySelector('#guides-doc-height');
        const lblDocWidth = rootNode.querySelector('#guides-doc-width');
        const btnClearAll = rootNode.querySelector('#clearGuidesBtn');
        const btnGenerate = rootNode.querySelector('#generateGuidesBtn');
        const btnSliceFromGuides = rootNode.querySelector('#btn-slice-from-guides');

        function readGuideSettings() {
            const switchVertical = rootNode.querySelector('#guideVerticalSwitch');
            const switchHorizontal = rootNode.querySelector('#guideHorizontalSwitch');
            const inputIntervalVertical = rootNode.querySelector('#guideIntervalVertical');
            const inputIntervalHorizontal = rootNode.querySelector('#guideIntervalHorizontal');

            return {
                enableVertical: Boolean(switchVertical?.checked),
                enableHorizontal: Boolean(switchHorizontal?.checked),
                intervalVertical: parseFloat(inputIntervalVertical?.value || '0') || 0,
                intervalHorizontal: parseFloat(inputIntervalHorizontal?.value || '0') || 0
            };
        }

        function updateGuidesDocumentHint() {
            const dimensions = window.GuidesModule?.getActiveDocumentDimensions();
            if (dimensions) {
                if (lblDocHeight) lblDocHeight.textContent = `当前文档高度: ${dimensions.height} px`;
                if (lblDocWidth) lblDocWidth.textContent = `当前文档宽度: ${dimensions.width} px`;
            } else {
                if (lblDocHeight) lblDocHeight.textContent = '未找到活动文档';
                if (lblDocWidth) lblDocWidth.textContent = '';
            }
        }

        updateGuidesDocumentHint();

        if (btnClearAll) {
            btnClearAll.addEventListener('click', async () => {
                try {
                    await window.GuidesModule.clearGuides();
                    showToast('已清空当前所有参考线');
                    updateGuidesDocumentHint();
                } catch (err) {
                    console.error('[Guides] 清除参考线失败:', err);
                    showToast('清除参考线失败: ' + err.message);
                }
            });
        }

        if (btnGenerate) {
            btnGenerate.addEventListener('click', async () => {
                try {
                    const result = await window.GuidesModule.generateGuides(readGuideSettings());
                    if (result.verticalCount > 0 && result.horizontalCount > 0) {
                        showToast(`成功生成 ${result.totalCount} 条参考线（纵向${result.verticalCount}条，横向${result.horizontalCount}条）`);
                    } else if (result.verticalCount > 0) {
                        showToast(`成功生成 ${result.verticalCount} 条纵向参考线`);
                    } else {
                        showToast(`成功生成 ${result.horizontalCount} 条横向参考线`);
                    }
                    updateGuidesDocumentHint();
                } catch (err) {
                    console.error('[Guides] 生成参考线失败:', err);
                    showToast('生成参考线失败: ' + err.message);
                }
            });
        }

        if (btnSliceFromGuides) {
            btnSliceFromGuides.addEventListener('click', async () => {
                try {
                    const result = await window.GuidesModule.createSlicesFromGuides();
                    showToast(`已成功切出 ${result.sliceCount} 个切片`);
                } catch (err) {
                    console.error('[Guides] 生成切片失败:', err);
                    showToast('生成切片失败: ' + err.message);
                }
            });
        }
    }

    // 绑定文档优化控件事件
    function bindOptimizeEvents() {
        // DPI 输入
        const dpiInput = rootNode.querySelector('#smartobjectDpi');
        if (dpiInput) {
            dpiInput.addEventListener('input', function() {
                const value = parseInt(this.value, 10) || 72;
                const currentSettings = SmartObjectModule.getState();
                SmartObjectModule.setState({
                    ...currentSettings,
                    targetDpi: value
                });
            });
        }

        const enableSmartObjectCheckbox = rootNode.querySelector('#enableSmartObject');
        const smartobjectDpiWrap = rootNode.querySelector('#smartobjectDpiWrap');
        if (enableSmartObjectCheckbox) {
            enableSmartObjectCheckbox.addEventListener('change', function() {
                const currentSettings = SmartObjectModule.getState();
                SmartObjectModule.setState({
                    ...currentSettings,
                    enabled: this.checked
                });
                if (smartobjectDpiWrap) {
                    smartobjectDpiWrap.hidden = !this.checked;
                }
            });
        }

        // 全选按钮
        const selectAllBtn = rootNode.querySelector('#selectAllBtn');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', function() {
                const container = rootNode.querySelector('#optimizeResult');
                if (container) {
                    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        cb.checked = true;
                    });
                }
            });
        }

        // 取消全选按钮
        const deselectAllBtn = rootNode.querySelector('#deselectAllBtn');
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', function() {
                const container = rootNode.querySelector('#optimizeResult');
                if (container) {
                    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        cb.checked = false;
                    });
                }
            });
        }

        // 扫描按钮
        const scanBtn = rootNode.querySelector('#scanBtn');
        if (scanBtn) {
            scanBtn.addEventListener('click', async function() {
                if (this.hasAttribute('loading')) return;
                const originalText = this.querySelector('span').textContent;
                this.setAttribute('loading', '');
                this.querySelector('span').textContent = '扫描中...';

                try {
                    await runWithPreActionSync(async () => {
                        // #region agent log
                        fetch('http://127.0.0.1:7327/ingest/718b66d4-bc81-4a98-a2c5-efd7b668dd07',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'896df9'},body:JSON.stringify({sessionId:'896df9',runId:'syntax-fix-1',hypothesisId:'H1',location:'src/modules/panel.js:2483',message:'scan wrapper entered',data:{handler:'scanBtn'},timestamp:Date.now()})}).catch(()=>{});
                        // #endregion
                        const smartObjectSettings = SmartObjectModule.getState();
                        const deleteSettings = DeleteLayerModule.getState();
                        const results = [];

                        if (smartObjectSettings.enabled) {
                            const soResults = await SmartObjectModule.querySmartObjects();
                            for (const so of soResults) {
                                results.push({
                                    type: 'smartobject',
                                    id: so.id,
                                    name: so.name,
                                    operationLabel: '分辨率修正',
                                    checked: true
                                });
                            }
                        }

                        if (deleteSettings.deleteEmpty || deleteSettings.deleteHidden) {
                            const deleteResults = await DeleteLayerModule.scan();
                            for (const layer of deleteResults) {
                                results.push({
                                    type: 'deletelayer',
                                    id: layer.id,
                                    name: layer.name,
                                    layerType: layer.layerType,
                                    operationLabel: layer.layerType || '删除图层',
                                    depth: layer.depth,
                                    checked: true
                                });
                            }
                        }

                        // 显示扫描结果
                        updateOptimizeResult(results);

                        if (results.length === 0) {
                            showToast('未找到需要处理的内容');
                        } else {
                            showToast(`扫描完成，找到 ${results.length} 个待处理项`);
                        }
                    });
                } catch (e) {
                    console.error('[Panel] 扫描失败:', e);
                    showToast('扫描失败: ' + e.message);
                } finally {
                    this.removeAttribute('loading');
                    this.querySelector('span').textContent = originalText;
                }
            });
        }

        // 优化文档按钮 - 只处理选中的项目
        const optimizeBtn = rootNode.querySelector('#optimizeBtn');
        if (optimizeBtn) {
            optimizeBtn.addEventListener('click', async function() {
                if (this.hasAttribute('loading')) return;
                const originalText = this.querySelector('span').textContent;
                this.setAttribute('loading', '');
                this.querySelector('span').textContent = '优化中...';

                try {
                    await runWithPreActionSync(async () => {
                        // #region agent log
                        fetch('http://127.0.0.1:7327/ingest/718b66d4-bc81-4a98-a2c5-efd7b668dd07',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'896df9'},body:JSON.stringify({sessionId:'896df9',runId:'syntax-fix-1',hypothesisId:'H2',location:'src/modules/panel.js:2545',message:'optimize wrapper entered',data:{handler:'optimizeBtn'},timestamp:Date.now()})}).catch(()=>{});
                        // #endregion
                        // 获取选中的项目
                        const selectedItems = getSelectedOptimizeItems();

                        if (selectedItems.length === 0) {
                            showToast('请先扫描并选择要处理的内容');
                            return;
                        }

                        // 分别处理智能对象和删除图层
                        const selectedSO = selectedItems.filter(item => item.type === 'smartobject');
                        const selectedDelete = selectedItems.filter(item => item.type === 'deletelayer');

                        let msg = '';

                        // 处理选中的智能对象
                        if (selectedSO.length > 0) {
                            await SmartObjectModule.applyToSelected(selectedSO);
                            msg += `已修改 ${selectedSO.length} 个智能对象`;
                        }

                        // 处理选中的删除图层
                        if (selectedDelete.length > 0) {
                            const deleteResult = await DeleteLayerModule.deleteSelected(selectedDelete);
                            if (msg) msg += '，';
                            msg += `已删除 ${deleteResult.deleted} 个图层`;
                        }

                        if (!msg) {
                            msg = '未处理任何内容';
                        }
                        showToast(msg);

                        // 清空结果列表
                        updateOptimizeResult([]);
                    });
                } catch (e) {
                    console.error('[Panel] 优化失败:', e);
                    showToast('优化失败: ' + e.message);
                } finally {
                    this.removeAttribute('loading');
                    this.querySelector('span').textContent = originalText;
                }
            });
        }
    }

    // 更新优化扫描结果（可选择的列表）
    function updateOptimizeResult(results) {
        const container = rootNode.querySelector('#optimizeResult');
        if (!container) return;

        if (results.length === 0) {
            container.innerHTML = '<p class="info-text">点击"扫描"获取待处理内容</p>';
            return;
        }

        // 直接在容器内生成 items，不嵌套额外的 div
        container.innerHTML = '';
        for (const item of results) {
            const icon = item.type === 'smartobject'
                ? '<span class="result-icon so-icon">智</span>'
                : '<span class="result-icon del-icon">删</span>';
            const operationLabel = item.operationLabel || (item.type === 'smartobject' ? '分辨率修正' : '删除图层');
            const div = document.createElement('div');
            div.className = 'result-item selectable-item';
            div.innerHTML = `
                <input type="checkbox" data-id="${item.id}" data-type="${item.type}" data-depth="${item.depth || 0}" ${item.checked ? 'checked' : ''}>
                ${icon}
                <span class="result-name">${escapeHtml(item.name)}</span>
                <span class="result-type optimize-operation-tag">${escapeHtml(operationLabel)}</span>
            `;
            container.appendChild(div);
        }

        // 点击整行切换选中
        container.querySelectorAll('.result-item').forEach(item => {
            item.addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') {
                    const checkbox = this.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                    }
                }
            });
        });
    }

    // 获取选中的优化项目
    function getSelectedOptimizeItems() {
        const container = rootNode.querySelector('#optimizeResult');
        if (!container) return [];

        const items = [];
        container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            items.push({
                id: parseInt(cb.dataset.id) || 0,
                type: cb.dataset.type,
                depth: parseInt(cb.dataset.depth) || 0,
                name: cb.closest('.result-item').querySelector('.result-name')?.textContent || ''
            });
        });
        return items;
    }

    // 更新智能对象查询结果
    function updateSmartObjectResult(results) {
        const container = rootNode.querySelector('#smartobjectResult');
        if (!container) return;

        if (results.length === 0) {
            container.innerHTML = '<p class="info-text">点击"优化文档"获取列表</p>';
            return;
        }

        let html = '<div class="result-list">';
        for (const item of results) {
            html += `<div class="result-item">
                <span class="result-name">${escapeHtml(item.name)}</span>
            </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    }

    // 绑定重命名控件事件
    function bindRenameEvents() {
        if (!window.RenameModule) return;

        // 基础名称输入
        const baseNameInput = rootNode.querySelector('#renameBaseName');
        if (baseNameInput) {
            baseNameInput.addEventListener('input', function() {
                RenameModule.setState({ baseName: this.value }, { persist: true });
                updateRenamePreview();
            });
        }

        // 名称位置选择
        rootNode.querySelectorAll('#namingPosition sp-radio').forEach(radio => {
            radio.addEventListener('click', function() {
                const value = this.value;
                if (value) {
                    RenameModule.setState({ position: value }, { persist: true });
                    updateRenamePreview();
                }
            });
        });

        // 起始序号
        const sequenceStartInput = rootNode.querySelector('#sequenceStart');
        if (sequenceStartInput) {
            sequenceStartInput.addEventListener('input', function() {
                const value = parseInt(this.value) || 1;
                RenameModule.setState({ sequenceStart: value }, { persist: true });
                updateRenamePreview();
            });
            sequenceStartInput.addEventListener('blur', function() {
                let v = parseInt(this.value) || 1;
                v = Math.max(0, Math.min(9999, v));
                this.value = v;
            });
        }

        // 重命名按钮
        const renameBtn = rootNode.querySelector('#renameBtn');
        if (renameBtn) {
            renameBtn.addEventListener('click', async function() {
                if (this.hasAttribute('loading')) return;
                const originalText = this.textContent;
                this.setAttribute('loading', '');
                this.textContent = '重命名中...';
                try {
                    await runWithPreActionSync(async () => {
                        await RenameModule.execute();
                        showToast('重命名成功');
                        updateRenamePreview();
                    });
                } catch (e) {
                    console.error('[Panel] 重命名失败:', e);
                    showToast('重命名失败: ' + e.message);
                } finally {
                    this.removeAttribute('loading');
                    this.textContent = originalText;
                }
            });

            // 键盘支持
            renameBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    renameBtn.click();
                }
            });
        }
    }

    // 更新重命名预览
    async function updateRenamePreview() {
        const previewContainer = rootNode.querySelector('#renamePreview');
        if (!previewContainer) return;

        try {
            if (!window.RenameModule) {
                previewContainer.innerHTML = '<p class="info-text">模块加载中...</p>';
                return;
            }

            const results = await runWithPreActionSync(() => RenameModule.previewRename());

            if (results.length === 0) {
                previewContainer.innerHTML = '<p class="info-text">请在 Photoshop 中选中图层后查看预览</p>';
                return;
            }

            let html = '<div class="preview-list">';
            for (const item of results) {
                html += `<div class="preview-item">
                    <span class="preview-original">${escapeHtml(item.original)}</span>
                    <span class="preview-arrow">→</span>
                    <span class="preview-new">${escapeHtml(item.newName)}</span>
                </div>`;
            }
            html += '</div>';
            previewContainer.innerHTML = html;
        } catch (e) {
            console.error('[Panel] 更新预览失败:', e);
            previewContainer.innerHTML = '<p class="info-text">预览失败: ' + escapeHtml(e.message) + '</p>';
        }
    }

    // HTML 转义
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 暴露到全局
    window.initPanel = initPanel;
    window.cleanupPanel = cleanupPanel;
    window.refreshPanel = refreshPanel;
    window.showToast = showToast;

})();
