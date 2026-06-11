/**
 * 导出设置存储模块
 * 负责管理导出参数的本地存储
 */

(function() {
    'use strict';

    // #region agent log
    fetch('http://127.0.0.1:7548/ingest/7739f673-6ec0-4016-9b52-37f0bd3830c8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'88fcf4'},body:JSON.stringify({sessionId:'88fcf4',runId:'pre-fix',hypothesisId:'H1',location:'src/modules/exportStorage.js:9',message:'exportStorage script evaluated',data:{alreadyInitialized:Boolean(window._exportStorageInitialized),existingExportStorage:Boolean(window.ExportStorage)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (window._exportStorageInitialized) {
        // #region agent log
        fetch('http://127.0.0.1:7548/ingest/7739f673-6ec0-4016-9b52-37f0bd3830c8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'88fcf4'},body:JSON.stringify({sessionId:'88fcf4',runId:'pre-fix',hypothesisId:'H1',location:'src/modules/exportStorage.js:15',message:'exportStorage duplicate load skipped',data:{alreadyInitialized:true,existingExportStorage:Boolean(window.ExportStorage)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return;
    }
    window._exportStorageInitialized = true;

    const EXPORT_STORAGE_KEY = 'haimati_export_settings';

    function getDefaultSettings() {
        return {
            format: 'PNG',
            pngBitDepth: 24,
            jpegQuality: 100,
            exportPath: '',
            persistentToken: '',
            batchExport: false,
            excludeBackground: true,
            overwrite: false,
            useSourcePath: false,
            sourceFolderName: '',
            namingRule: {
                separator: '_'
            }
        };
    }

    function normalizeSettings(raw = {}) {
        const defaults = getDefaultSettings();
        const parsedQuality = parseInt(raw.jpegQuality, 10);
        return {
            ...defaults,
            ...raw,
            format: raw.format === 'JPG' || raw.format === 'JPEG' ? 'JPEG' : defaults.format,
            pngBitDepth: raw.pngBitDepth === 8 ? 8 : 24,
            jpegQuality: Number.isFinite(parsedQuality) ? parsedQuality : defaults.jpegQuality,
            batchExport: Boolean(raw.batchExport),
            excludeBackground: Boolean(raw.batchExport) ? true : raw.excludeBackground !== false,
            overwrite: Boolean(raw.overwrite),
            useSourcePath: Boolean(raw.useSourcePath),
            sourceFolderName: String(raw.sourceFolderName || ''),
            exportPath: String(raw.exportPath || ''),
            persistentToken: String(raw.persistentToken || ''),
            namingRule: {
                ...defaults.namingRule,
                ...(raw.namingRule || {})
            }
        };
    }

    function readStoredSettings() {
        try {
            const data = localStorage.getItem(EXPORT_STORAGE_KEY);
            if (data) {
                return normalizeSettings(JSON.parse(data));
            }
        } catch (e) {
            console.error('[ExportStorage] 加载设置失败:', e);
        }
        return normalizeSettings(getDefaultSettings());
    }

    function writeStoredSettings(settings) {
        const normalized = normalizeSettings(settings);
        try {
            localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(normalized));
        } catch (e) {
            console.error('[ExportStorage] 保存设置失败:', e);
        }
        return normalized;
    }

    const ExportStorage = {
        getAll() {
            return readStoredSettings();
        },

        saveAll(settings) {
            return writeStoredSettings(settings);
        },

        get(key) {
            const settings = this.getAll();
            return settings[key];
        },

        set(key, value) {
            const settings = this.getAll();
            settings[key] = value;
            return writeStoredSettings(settings);
        },

        update(newSettings) {
            const settings = this.getAll();
            return writeStoredSettings({ ...settings, ...newSettings });
        },

        reset() {
            return writeStoredSettings(getDefaultSettings());
        },

        normalize(settings) {
            return normalizeSettings(settings);
        },

        defaults() {
            return getDefaultSettings();
        }
    };

    window.ExportStorage = ExportStorage;
})();
