/**
 * 闂傚鍋勫ù鍌炲磻閸涱厾鏆ら幖娣妽椤ュ牓鏌曡箛濠傚⒉缂佽埖鐓″娲敃閿濆棭娼＄紓渚€顤傞崑鍕亽闂佺偨鍎村▍鏇㈠磻?
 * 缂傚倷鑳舵刊瀵告閺囥垹绠栧┑鐘叉噽閻も偓濡炪倖鍔х徊鐣岀矈瑜版帗鈷掗柛顐ｇ☉閻忣亝绻濋姀鈽呰€块柟?UI闂備線娼уΛ鏃堟倿閿旇姤娅犻柣锝呮湰閸嬫﹢鎮橀悙闈涘姦闁稿鎸婚幏鍛槹鎼达絾鍟板┑鐐村灦閹告悂顢栭崱娑樺嚑闁告劦鍠楅崵鏇熺節婵犲倸鏆欑紒鈧€ｎ喗鐓曟繝濠傚暞濠€浼存偨椤栨稒灏伴柟顖涙缁犳稓鈧急鍐у? */

(function() {
    'use strict';

    let rootNode = null;
    let resizeObserver = null;
    let draggingAction = false;
    let mouseDragActionId = null;
    let mouseDragStartX = 0;
    let mouseDragStartY = 0;
    let mouseDragStarted = false;
    let suppressNextClick = false;
    let contextMenuTriggered = false;
    let contextMenuTimer = null;

    function showToast(message) {
        let toast = rootNode?.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            rootNode?.appendChild(toast);
        }

        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function adjustColumns() {
        const grid = rootNode?.querySelector('#quickGrid');
        if (!grid) return;

        const containerWidth = grid.clientWidth;
        const btnHeight = 20;
        const minButtonWidth = 80;
        const horizontalMargin = 3;
        const cols = Math.max(1, Math.floor(containerWidth / (minButtonWidth + horizontalMargin)));
        const btnWidth = Math.floor((containerWidth - horizontalMargin * cols) / cols);

        grid.querySelectorAll('.quick-btn').forEach(btn => {
            btn.style.minHeight = `${btnHeight}px`;
            btn.style.height = `${btnHeight}px`;
            btn.style.minWidth = `${minButtonWidth}px`;
            btn.style.width = `${Math.max(btnWidth, minButtonWidth)}px`;
            btn.style.maxWidth = `${Math.max(btnWidth, minButtonWidth)}px`;
            btn.style.flex = `0 0 ${Math.max(btnWidth, minButtonWidth)}px`;
        });
    }

    function initResponsive() {
        const grid = rootNode?.querySelector('#quickGrid');
        if (!grid) return;

        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => adjustColumns());
            resizeObserver.observe(grid);
        }

        setTimeout(adjustColumns, 0);
    }

    async function reorderQuickActions(sourceId, targetId, placement = 'before') {
        if (!sourceId) return;

        const actions = QuickActionModule.getState().actions;
        const sourceIndex = actions.findIndex(item => item.id === sourceId);
        if (sourceIndex === -1) return;

        const nextActions = actions.slice();
        const [movedAction] = nextActions.splice(sourceIndex, 1);

        if (!targetId) {
            nextActions.push(movedAction);
        } else {
            const targetIndex = nextActions.findIndex(item => item.id === targetId);
            if (targetIndex === -1) return;
            const insertIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
            nextActions.splice(insertIndex, 0, movedAction);
        }

        await QuickActionModule.replaceActions(nextActions);
        renderQuickButtons();
        showToast('\u5feb\u6377\u987a\u5e8f\u5df2\u66f4\u65b0');
    }

    async function moveQuickActionByStep(actionId, step) {
        const actions = QuickActionModule.getState().actions;
        const index = actions.findIndex(item => item.id === actionId);
        const nextIndex = index + step;
        if (index === -1 || nextIndex < 0 || nextIndex >= actions.length) return;

        const nextActions = actions.slice();
        const [movedAction] = nextActions.splice(index, 1);
        nextActions.splice(nextIndex, 0, movedAction);
        await QuickActionModule.replaceActions(nextActions);
        renderQuickButtons();
        showToast('\u5feb\u6377\u987a\u5e8f\u5df2\u66f4\u65b0');
    }

    function clearMouseDropTargets() {
        rootNode?.querySelectorAll('.quick-btn.drop-target, .quick-btn.drop-top, .quick-btn.drop-bottom, .quick-btn.drop-left, .quick-btn.drop-right').forEach(node => {
            node.classList.remove('drop-target', 'drop-top', 'drop-bottom', 'drop-left', 'drop-right');
        });
    }

    function getQuickButtonFromPoint(clientX, clientY) {
        const buttons = Array.from(rootNode?.querySelectorAll('#quickGrid .quick-btn') || []);
        return buttons.find(btn => {
            const rect = btn.getBoundingClientRect();
            return clientX >= rect.left
                && clientX <= rect.right
                && clientY >= rect.top
                && clientY <= rect.bottom;
        }) || null;
    }

    function isPointInsideQuickGrid(clientX, clientY) {
        const grid = rootNode?.querySelector('#quickGrid');
        if (!grid) return false;
        const rect = grid.getBoundingClientRect();
        return clientX >= rect.left
            && clientX <= rect.right
            && clientY >= rect.top
            && clientY <= rect.bottom;
    }

    function getDropInfo(targetBtn, clientX, clientY) {
        if (!targetBtn) return { placement: 'before', direction: 'top' };
        const rect = targetBtn.getBoundingClientRect();
        const distances = [
            { direction: 'top', value: Math.abs(clientY - rect.top), placement: 'before' },
            { direction: 'bottom', value: Math.abs(clientY - rect.bottom), placement: 'after' },
            { direction: 'left', value: Math.abs(clientX - rect.left), placement: 'before' },
            { direction: 'right', value: Math.abs(clientX - rect.right), placement: 'after' }
        ];
        distances.sort((first, second) => first.value - second.value);
        const closest = distances[0];
        return { placement: closest.placement, direction: closest.direction };
    }

    function handleMouseDragMove(e) {
        if (!mouseDragActionId) return;

        const distanceX = Math.abs(e.clientX - mouseDragStartX);
        const distanceY = Math.abs(e.clientY - mouseDragStartY);
        if (!mouseDragStarted && distanceX < 4 && distanceY < 4) return;

        mouseDragStarted = true;
        draggingAction = true;
        const sourceBtn = rootNode?.querySelector(`[data-id="${mouseDragActionId}"]`);
        sourceBtn?.classList.add('dragging');

        clearMouseDropTargets();
        const targetBtn = getQuickButtonFromPoint(e.clientX, e.clientY);
        if (targetBtn && targetBtn.dataset.id !== mouseDragActionId) {
            const dropInfo = getDropInfo(targetBtn, e.clientX, e.clientY);
            targetBtn.classList.add('drop-target', `drop-${dropInfo.direction}`);
        }
    }

    function removeDirectDragListeners() {
        document.removeEventListener('mousemove', handleMouseDragMove);
        document.removeEventListener('mouseup', handleMouseDragEnd);
        document.removeEventListener('pointermove', handleMouseDragMove);
        document.removeEventListener('pointerup', handleMouseDragEnd);
        document.removeEventListener('pointercancel', handleMouseDragEnd);
    }

    function startDirectDrag(actionId, clientX, clientY, mode) {
        if (mouseDragActionId) return;

        mouseDragActionId = actionId;
        mouseDragStartX = clientX;
        mouseDragStartY = clientY;
        mouseDragStarted = false;

        removeDirectDragListeners();
        if (mode === 'pointer') {
            document.addEventListener('pointermove', handleMouseDragMove);
            document.addEventListener('pointerup', handleMouseDragEnd, { once: true });
            document.addEventListener('pointercancel', handleMouseDragEnd, { once: true });
        } else {
            document.addEventListener('mousemove', handleMouseDragMove);
            document.addEventListener('mouseup', handleMouseDragEnd, { once: true });
        }
    }

    function handleMouseDragEnd(e) {
        removeDirectDragListeners();

        const sourceId = mouseDragActionId;
        const didDrag = mouseDragStarted;
        const sourceBtn = sourceId ? rootNode?.querySelector(`[data-id="${sourceId}"]`) : null;
        sourceBtn?.classList.remove('dragging');
        clearMouseDropTargets();

        mouseDragActionId = null;
        mouseDragStarted = false;
        draggingAction = false;

        if (!sourceId || !didDrag) return;

        suppressNextClick = true;
        const targetBtn = getQuickButtonFromPoint(e.clientX, e.clientY);
        if (targetBtn && targetBtn.dataset.id !== sourceId) {
            const dropInfo = getDropInfo(targetBtn, e.clientX, e.clientY);
            reorderQuickActions(sourceId, targetBtn.dataset.id, dropInfo.placement);
        } else if (isPointInsideQuickGrid(e.clientX, e.clientY)) {
            reorderQuickActions(sourceId, null);
        }

        setTimeout(() => {
            suppressNextClick = false;
        }, 0);
    }

    function renderQuickButtons() {
        const grid = rootNode?.querySelector('#quickGrid');
        const emptyState = rootNode?.querySelector('#emptyState');
        if (!grid) return;

        const actions = QuickActionModule.getState().actions;
        grid.innerHTML = '';
        if (emptyState) {
            emptyState.classList.toggle('show', actions.length === 0);
        }
        grid.classList.toggle('hidden', actions.length === 0);

        actions.forEach(action => grid.appendChild(createQuickButton(action)));
        adjustColumns();
    }

    function createQuickButton(action) {
        const btn = document.createElement('div');
        btn.className = 'quick-btn';
        btn.dataset.id = action.id;
        btn.dataset.type = action.type;
        btn.style.cssText = 'cursor: pointer; user-select: none;';
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', '0');

        if (action.type === 'export') {
            btn.classList.add('export-btn');
        } else if (action.type === 'button') {
            btn.classList.add('button-btn');
        } else if (action.type === 'rename') {
            btn.classList.add('rename-btn');
        } else if (action.type === 'smartobject' || action.type === 'deletelayer') {
            btn.classList.add('optimize-btn');
        } else if (action.type === 'translate') {
            btn.classList.add('translate-btn');
        } else if (action.type === 'guides') {
            btn.classList.add('guides-btn');
        } else if (action.type === 'guidesSlice' || action.type === 'guidesClear') {
            btn.classList.add('guides-btn');
        }

        const label = document.createElement('span');
        label.className = 'btn-label';
        label.textContent = action.name;
        btn.appendChild(label);

        btn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                hideContextMenu();
                executeQuickAction(action);
            }
        });

        btn.addEventListener('pointerdown', e => {
            if (e.button !== undefined && e.button !== 0) return;
            startDirectDrag(action.id, e.clientX, e.clientY, 'pointer');
        });

        btn.addEventListener('mousedown', e => {
            if (e.button !== 0 || mouseDragActionId) return;
            startDirectDrag(action.id, e.clientX, e.clientY, 'mouse');
        });

        btn.addEventListener('click', e => {
            if (draggingAction || suppressNextClick) {
                suppressNextClick = false;
                e.preventDefault();
                return;
            }
            if (contextMenuTriggered) {
                contextMenuTriggered = false;
                return;
            }
            hideContextMenu();
            executeQuickAction(action);
        });

        btn.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            contextMenuTriggered = true;
            if (contextMenuTimer) clearTimeout(contextMenuTimer);
            contextMenuTimer = setTimeout(() => {
                contextMenuTriggered = false;
            }, 500);
            showContextMenu(e, action);
        });

        return btn;
    }

    async function executeQuickAction(action) {
        const btn = rootNode?.querySelector(`[data-id="${action.id}"]`);
        if (btn) btn.classList.add('loading');

        try {
            switch (action.type) {
                case 'export':
                    await executeExportAction(action.settings);
                    break;
                case 'button':
                    await executeButtonAction(action.settings);
                    break;
                case 'rename':
                    await executeRenameAction(action.settings);
                    break;
                case 'smartobject':
                    await executeSmartObjectAction(action.settings);
                    break;
                case 'deletelayer':
                    await executeDeleteLayerAction(action.settings);
                    break;
                case 'translate':
                    await executeTranslateAction(action.settings);
                    break;
                case 'guides':
                    await executeGuidesAction(action.settings);
                    break;
                case 'guidesSlice':
                    await executeGuidesSliceAction(action.settings);
                    break;
                case 'guidesClear':
                    await executeGuidesClearAction(action.settings);
                    break;
                default:
                    throw new Error('不支持的快捷类型');
            }
            showToast('\u6267\u884c\u6210\u529f');
        } catch (e) {
            showToast('\u6267\u884c\u5931\u8d25: ' + e.message);
        } finally {
            btn?.classList.remove('loading');
        }
    }

    async function executeExportAction(settings) {
        await window.ExportModule.execute(settings);
    }

    async function executeButtonAction(settings) {
        await window.ButtonModule.execute(settings);
    }

    async function executeRenameAction(settings) {
        await window.RenameModule.execute(settings);
    }

    async function executeSmartObjectAction(settings) {
        const result = await window.SmartObjectModule.querySmartObjects();
        if (result.length > 0) {
            await window.SmartObjectModule.execute(settings);
        }
    }

    async function executeDeleteLayerAction(settings) {
        await window.DeleteLayerModule.execute(settings);
    }

    async function executeTranslateAction(settings) {
        if (!window.TranslateModule) {
            throw new Error('\u7ffb\u8bd1\u6a21\u5757\u672a\u52a0\u8f7d');
        }
        await window.TranslateModule.execute(settings);
    }

    async function executeGuidesAction(settings) {
        const result = await window.GuidesModule.generateGuides(settings);
        if (result.verticalCount > 0 && result.horizontalCount > 0) {
            showToast(`成功生成 ${result.totalCount} 条参考线（纵向${result.verticalCount}条，横向${result.horizontalCount}条）`);
        } else if (result.verticalCount > 0) {
            showToast(`成功生成 ${result.verticalCount} 条纵向参考线`);
        } else {
            showToast(`成功生成 ${result.horizontalCount} 条横向参考线`);
        }
    }

    async function executeGuidesSliceAction(settings) {
        const result = await window.GuidesModule.createSlicesFromGuides();
        showToast(`已成功切出 ${result.sliceCount} 个切片`);
    }

    async function executeGuidesClearAction(settings) {
        await window.GuidesModule.clearGuides();
        showToast('已清空当前所有参考线');
    }

    async function deleteQuickAction(id) {
        await QuickActionModule.removeAction(id);
        renderQuickButtons();
        showToast('\u5df2\u5220\u9664');
    }

    function showContextMenu(e, action) {
        hideContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" data-action="move-up">上移</div>
            <div class="context-menu-item" data-action="move-down">下移</div>
            <div class="context-menu-item" data-action="rename">重命名</div>
            <div class="context-menu-item danger" data-action="delete">删除</div>
        `;

        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;

        menu.querySelector('[data-action="move-up"]').addEventListener('click', () => {
            hideContextMenu();
            moveQuickActionByStep(action.id, -1);
        });

        menu.querySelector('[data-action="move-down"]').addEventListener('click', () => {
            hideContextMenu();
            moveQuickActionByStep(action.id, 1);
        });

        menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
            hideContextMenu();
            renameQuickAction(action);
        });

        menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
            hideContextMenu();
            deleteQuickAction(action.id);
        });

        rootNode?.appendChild(menu);
        window._quickContextMenu = menu;
        window._menuAction = action;
    }

    function renameQuickAction(action) {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-modal';

        const dialog = document.createElement('dialog');
        dialog.innerHTML = `
            <div class="dialog-header">重命名快捷操作</div>
            <div class="dialog-body">
                <input type="text" id="renameInput" value="${action.name}" placeholder="请输入新的名称..." />
            </div>
            <div class="dialog-footer">
                <div class="quick-btn form-cancel-btn" role="button" tabindex="0" style="border-right-width: 2px;margin-right: 2px;">取消</div>
                <div class="quick-btn form-confirm-btn" role="button" tabindex="0" style="border-left-width: 2px;margin-left: 2px;">确认</div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#renameInput');
        const cancelBtn = dialog.querySelector('.form-cancel-btn');
        const confirmBtn = dialog.querySelector('.form-confirm-btn');

        input.focus();
        input.select();

        cancelBtn.addEventListener('click', () => overlay.remove());

        confirmBtn.addEventListener('click', async () => {
            const newName = input.value.trim();
            if (newName !== '' && newName !== action.name) {
                await QuickActionModule.updateAction(action.id, { name: newName });
                renderQuickButtons();
                showToast('\u5df2\u4fee\u6539');
            }
            overlay.remove();
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });

        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        dialog.showModal();
    }

    function hideContextMenu() {
        if (window._quickContextMenu) {
            window._quickContextMenu.remove();
            window._quickContextMenu = null;
            window._menuAction = null;
        }
    }

    async function initQuickPanel(root) {
        rootNode = root;
        draggingAction = false;
        mouseDragActionId = null;
        mouseDragStarted = false;
        suppressNextClick = false;

        if (window.QuickActionModule && typeof QuickActionModule.init === 'function') {
            await QuickActionModule.init();
        }

        rootNode.addEventListener('click', e => {
            if (window._quickContextMenu && !window._quickContextMenu.contains(e.target)) {
                hideContextMenu();
            }
        });


        initResponsive();
        renderQuickButtons();
    }

    function refreshQuickPanel() {
        renderQuickButtons();
    }

    function updateQuickPanel() {
        renderQuickButtons();
    }

    function cleanupQuickPanel() {
        resizeObserver?.disconnect();
        resizeObserver = null;
        removeDirectDragListeners();
        rootNode = null;
        draggingAction = false;
        mouseDragActionId = null;
        mouseDragStarted = false;
        suppressNextClick = false;
        hideContextMenu();
    }

    window.initQuickPanel = initQuickPanel;
    window.cleanupQuickPanel = cleanupQuickPanel;
    window.updateQuickPanel = updateQuickPanel;
    window.refreshQuickPanel = refreshQuickPanel;
})();
