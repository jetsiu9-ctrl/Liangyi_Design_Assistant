(function() {
    'use strict';

    if (window._quickStorageInitialized) {
        return;
    }
    window._quickStorageInitialized = true;

    const QUICK_FILE_NAME = 'haimati_quick_actions.json';
    const MAX_ACTIONS = 20;
    const defaultState = {
        version: 1,
        actions: [],
        layout: {
            columns: 1
        }
    };

    let state = { ...defaultState, layout: { ...defaultState.layout } };

    function normalizeActions(actions) {
        return Array.isArray(actions) ? actions.filter(Boolean).slice(0, MAX_ACTIONS) : [];
    }

    function normalizeLayout(layout) {
        return layout && typeof layout === 'object' ? { columns: layout.columns || 1 } : { columns: 1 };
    }

    function normalizeState(raw = {}) {
        return {
            version: 1,
            actions: normalizeActions(raw.actions),
            layout: normalizeLayout(raw.layout)
        };
    }

    async function readStateFromDisk() {
        try {
            const { storage } = require('uxp');
            const folder = await storage.localFileSystem.getDataFolder();
            const file = await folder.getEntry(QUICK_FILE_NAME);
            const data = await file.read();
            return normalizeState(data ? JSON.parse(data) : defaultState);
        } catch (e) {
            return normalizeState(defaultState);
        }
    }

    async function writeStateToDisk() {
        try {
            const { storage } = require('uxp');
            const folder = await storage.localFileSystem.getDataFolder();
            const file = await folder.createFile(QUICK_FILE_NAME, { overwrite: true });
            await file.write(JSON.stringify(state));
            return true;
        } catch (e) {
            console.error('[QuickStorage] save persistent file failed:', e);
            return false;
        }
    }

    function getState() {
        return {
            version: state.version,
            actions: state.actions.slice(),
            layout: { ...state.layout }
        };
    }

    function setState(nextState) {
        state = normalizeState(nextState);
        return getState();
    }

    function updateState(partial) {
        state = normalizeState({ ...state, ...(partial || {}) });
        return getState();
    }

    async function init() {
        state = await readStateFromDisk();
        return getState();
    }

    async function persist() {
        return await writeStateToDisk();
    }

    async function addAction(action) {
        const nextActions = normalizeActions([action, ...state.actions]);
        updateState({ actions: nextActions });
        await persist();
        return nextActions;
    }

    async function replaceActions(actions) {
        const nextActions = normalizeActions(actions);
        updateState({ actions: nextActions });
        await persist();
        return nextActions;
    }

    async function removeAction(id) {
        const nextActions = state.actions.filter(action => action.id !== id);
        updateState({ actions: nextActions });
        await persist();
        return nextActions;
    }

    async function updateAction(id, updates) {
        const nextActions = state.actions.map(action => action.id === id ? { ...action, ...updates } : action);
        updateState({ actions: nextActions });
        await persist();
        return nextActions;
    }

    async function clearActions() {
        updateState({ actions: [] });
        await persist();
        return [];
    }

    async function setLayout(layout) {
        updateState({ layout: normalizeLayout(layout) });
        await persist();
        return { ...state.layout };
    }

    async function setLayoutColumns(columns) {
        return await setLayout({ ...state.layout, columns });
    }

    const QuickActionModule = {
        init,
        persist,
        getState,
        setState,
        updateState,
        getAction(id) {
            return state.actions.find(action => action.id === id) || null;
        },
        async addAction(action) {
            return await addAction(action);
        },
        async replaceActions(actions) {
            return await replaceActions(actions);
        },
        async removeAction(id) {
            return await removeAction(id);
        },
        async updateAction(id, updates) {
            return await updateAction(id, updates);
        },
        async clearActions() {
            return await clearActions();
        },
        async setLayout(layout) {
            return await setLayout(layout);
        },
        async setLayoutColumns(columns) {
            return await setLayoutColumns(columns);
        }
    };

    const QuickActionStorage = {
        getAll() {
            return state.actions.slice();
        },

        get(id) {
            return state.actions.find(action => action.id === id);
        },

        async add(action) {
            return await addAction(action);
        },

        async setAll(actions) {
            return await replaceActions(actions);
        },

        async remove(id) {
            return await removeAction(id);
        },

        async update(id, updates) {
            return await updateAction(id, updates);
        },

        async clear() {
            return await clearActions();
        },

        async loadPersistent() {
            const nextState = await init();
            return { actions: nextState.actions.slice(), layout: { ...nextState.layout } };
        },

        isPersistentLoaded() {
            return true;
        }
    };

    const QuickLayoutStorage = {
        get() {
            return { ...state.layout };
        },

        async set(layout) {
            return await setLayout(layout);
        },

        async setColumns(columns) {
            return await setLayoutColumns(columns);
        },

        async loadPersistent() {
            const nextState = await init();
            return { actions: nextState.actions.slice(), layout: { ...nextState.layout } };
        }
    };

    window.QuickActionModule = QuickActionModule;
    window.QuickActionStorage = QuickActionStorage;
    window.QuickLayoutStorage = QuickLayoutStorage;
})();
