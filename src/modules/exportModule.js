/**
 * 导出功能模块
 * 处理快捷导出功能的逻辑
 */

(function() {
    'use strict';

    let selectedFolder = null; // 保存选中的文件夹对象

    function normalizeSettings(raw = {}) {
        const defaults = ExportStorage.defaults();
        return ExportStorage.normalize({
            ...defaults,
            ...raw,
            namingRule: {
                ...defaults.namingRule,
                ...(raw.namingRule || {})
            }
        });
    }

    const ExportModule = {
        settings: normalizeSettings(ExportStorage.getAll()),

        init() {
            this.settings = normalizeSettings(ExportStorage.getAll());
            return this.getState();
        },

        getState() {
            return normalizeSettings(this.settings);
        },

        setState(partial, options = {}) {
            this.settings = normalizeSettings({ ...this.settings, ...(partial || {}) });
            if (options.persist) {
                this.persist();
            }
            return this.getState();
        },

        replaceState(nextState, options = {}) {
            this.settings = normalizeSettings(nextState || ExportStorage.defaults());
            if (options.persist) {
                this.persist();
            }
            return this.getState();
        },

        resetState(options = {}) {
            this.settings = normalizeSettings(ExportStorage.defaults());
            if (options.persist) {
                this.persist();
            }
            return this.getState();
        },

        persist() {
            this.settings = normalizeSettings(ExportStorage.saveAll(this.settings));
            return this.getState();
        },

        execute(overrideSettings) {
            return this.doExecute(overrideSettings);
        },

        pickFolder() {
            return this.selectExportPath();
        },

        resolveFolder(overrideSettings) {
            return this.getExportFolder(overrideSettings);
        },

        // 选择导出位置
        async selectExportPath() {
            try {
                const { storage } = require('uxp');
                const fs = storage.localFileSystem;

                console.log('[ExportModule] 开始选择导出位置...');
                console.log('[ExportModule] fs:', fs);
                console.log('[ExportModule] fs.getFolder:', typeof fs.getFolder);

                // getFolder 需要在 executeAsModal 中调用
                const photoshop = require('photoshop');
                const { executeAsModal } = photoshop.core;

                console.log('[ExportModule] 准备调用 executeAsModal...');

                const result = await executeAsModal(async () => {
                    console.log('[ExportModule] executeAsModal 内部开始...');
                    try {
                        console.log('[ExportModule] 调用 fs.getFolder()...');
                        const folder = await fs.getFolder();
                        console.log('[ExportModule] getFolder 返回:', folder);
                        return folder;
                    } catch (innerErr) {
                        console.error('[ExportModule] getFolder 错误:', innerErr);
                        throw innerErr;
                    }
                }, { commandName: '选择文件夹' });

                console.log('[ExportModule] executeAsModal 完成, 结果:', result);

                if (result) {
                    console.log('[ExportModule] 已选择文件夹:', result.name);
                    console.log('[ExportModule] 文件夹路径:', result.nativePath);
                    
                    // 保存文件夹对象供后续使用
                    selectedFolder = result;
                    
                    // 创建并保存持久化 token
                    try {
                        const token = await fs.createPersistentToken(result);
                        console.log('[ExportModule] 创建持久化 token 成功:', token);
                        this.settings = normalizeSettings({ ...this.settings, persistentToken: token });
                    } catch (e) {
                        console.log('[ExportModule] 创建持久化 token 失败:', e.message);
                    }
                    
                    this.settings = normalizeSettings({ ...this.settings, exportPath: result.nativePath });
                    this.persist();
                    
                    return result.nativePath;
                } else {
                    console.log('[ExportModule] 用户取消了选择');
                    return null;
                }
            } catch (e) {
                console.error('[ExportModule] 选择导出位置失败:', e);
                console.error('[ExportModule] 错误堆栈:', e.stack);
                return null;
            }
        },

        async getExportFolder(overrideSettings) {
            const currentSettings = normalizeSettings(overrideSettings ? { ...this.settings, ...overrideSettings } : this.settings);
            const { storage } = require('uxp');
            const fs = storage.localFileSystem;

            console.log('[ExportModule] getExportFolder 开始');
            console.log('[ExportModule] exportPath:', currentSettings.exportPath);
            console.log('[ExportModule] selectedFolder:', selectedFolder);
            console.log('[ExportModule] persistentToken:', currentSettings.persistentToken);

            if (selectedFolder) {
                console.log('[ExportModule] 使用缓存的文件夹:', selectedFolder.nativePath);
                return selectedFolder;
            }

            if (currentSettings.persistentToken) {
                try {
                    console.log('[ExportModule] 尝试用持久化 token 获取文件夹...');
                    const folder = await fs.getEntryForPersistentToken(currentSettings.persistentToken);
                    if (folder && folder.isFolder) {
                        selectedFolder = folder;
                        console.log('[ExportModule] 从 token 恢复文件夹成功:', folder.nativePath);
                        return folder;
                    }
                } catch (e) {
                    console.log('[ExportModule] 从 token 恢复失败:', e.message);
                }
            }

            throw new Error('导出路径不可用，请重新选择导出目录');
        },

        async doExecute(overrideSettings) {
            const photoshop = require('photoshop');
            const { executeAsModal } = photoshop.core;
            const executionSettings = normalizeSettings(overrideSettings ? { ...this.settings, ...overrideSettings } : this.settings);

            try {
                return await executeAsModal(async () => {
                    return await this.doExport(executionSettings);
                }, { commandName: '快捷导出' });
            } catch (e) {
                console.error('[ExportModule] 导出失败:', e);
                throw e;
            }
        },

        // 实际执行导出逻辑
        async doExport(executionSettings) {
            const photoshop = require('photoshop');
            const app = photoshop.app;
            const activeDocument = app.activeDocument;
            const previousSettings = this.settings;
            this.settings = normalizeSettings(executionSettings || this.settings);

            try {
                if (!activeDocument) {
                    throw new Error('没有活动文档');
                }

                if (this.settings.useSourcePath) {
                    return await this.exportWithSourcePath(activeDocument);
                }

                const folder = await this.getExportFolder(this.settings);
                if (!folder) {
                    throw new Error('请先选择导出位置');
                }

                return this.settings.batchExport
                    ? await this.batchExportLayers(activeDocument, folder)
                    : await this.exportDocument(activeDocument, folder);
            } finally {
                this.settings = previousSettings;
            }
        },

        // 使用源文件路径导出
        async exportWithSourcePath(doc) {
            const { storage } = require('uxp');
            const fs = storage.localFileSystem;

            console.log('[ExportModule] 使用源文件路径导出');

            // 获取文档信息
            console.log('[ExportModule] 文档名称:', doc.name);
            console.log('[ExportModule] 是否云文档:', doc.cloudDocument);
            console.log('[ExportModule] 是否已保存:', doc.saved);
            console.log('[ExportModule] doc.path:', doc.path);
            console.log('[ExportModule] doc.fullName:', doc.fullName);

            // 获取文档的保存路径 - 优先使用 path 属性
            let sourcePath = null;

            // 方法1: 使用 path 属性（Photoshop 22.5+）
            if (doc.path) {
                sourcePath = doc.path;
                console.log('[ExportModule] 使用 doc.path 获取路径:', sourcePath);
            }

            // 方法2: 如果 path 为空，尝试 fullName（可能是 Promise）
            if (!sourcePath && doc.fullName) {
                try {
                    // fullName 可能返回 Promise 或直接值
                    const fullNameValue = typeof doc.fullName.then === 'function'
                        ? await doc.fullName
                        : doc.fullName;
                    sourcePath = fullNameValue.toString();
                    console.log('[ExportModule] 使用 doc.fullName 获取路径:', sourcePath);
                } catch (e) {
                    console.log('[ExportModule] fullName 获取失败:', e.message);
                }
            }

            // 如果是云文档，尝试获取云文档本地目录
            if (!sourcePath && doc.cloudDocument) {
                console.log('[ExportModule] 这是云文档，尝试获取云工作区目录');
                if (doc.cloudWorkAreaDirectory) {
                    sourcePath = doc.cloudWorkAreaDirectory;
                    console.log('[ExportModule] 使用云工作区目录:', sourcePath);
                }
            }

            if (!sourcePath) {
                throw new Error('无法获取文档路径，请确保文档已保存');
            }

            console.log('[ExportModule] 获取到的路径:', sourcePath);

            // 从完整路径中提取文件夹路径
            // 移除文件名称，保留文件夹路径
            const lastSep = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
            let sourceFolder = sourcePath;

            // 如果路径包含文件名（有点号扩展名），提取文件夹
            const hasFileExtension = /[^\\/]+\.[^\\/]+$/.test(sourcePath);
            if (hasFileExtension && lastSep > 0) {
                sourceFolder = sourcePath.substring(0, lastSep);
            }
            console.log('[ExportModule] 源文件夹:', sourceFolder);

            // 将反斜杠转换为正斜杠（保持一致）
            const normalizedPath = sourceFolder.replace(/\\/g, '/');
            console.log('[ExportModule] 标准化路径:', normalizedPath);

            // 转换为 UXP 可用的 URL
            const sourceFolderUrl = 'file:///' + normalizedPath;
            console.log('[ExportModule] 源文件夹 URL:', sourceFolderUrl);

            try {
                // 获取源文件夹 - 优先使用 getEntry 直接传入原生路径
                let folder;
                try {
                    // 尝试使用 getEntry 直接获取（更可靠）
                    folder = await fs.getEntry(normalizedPath);
                    console.log('[ExportModule] 使用 getEntry 获取文件夹成功:', folder.nativePath);
                } catch (e1) {
                    console.log('[ExportModule] getEntry 失败，尝试 getEntryWithUrl:', e1.message);
                    // 备选：使用 URL 方式
                    folder = await fs.getEntryWithUrl(sourceFolderUrl);
                    console.log('[ExportModule] 使用 getEntryWithUrl 获取文件夹成功:', folder.nativePath);
                }

                if (!folder) {
                    throw new Error('无法获取源文件夹');
                }

                // 创建子文件夹（如果指定了名称）
                let targetFolder = folder;
                if (this.settings.sourceFolderName && this.settings.sourceFolderName.trim()) {
                    const subFolderName = this.settings.sourceFolderName.trim();
                    console.log('[ExportModule] 创建子文件夹:', subFolderName);
                    targetFolder = await this.getOrCreateSubFolder(folder, subFolderName);
                    console.log('[ExportModule] 子文件夹创建成功:', targetFolder.nativePath);
                }

                // 执行导出
                if (this.settings.batchExport) {
                    return await this.batchExportLayers(doc, targetFolder);
                } else {
                    return await this.exportDocument(doc, targetFolder);
                }
            } catch (e) {
                console.error('[ExportModule] 源文件路径导出失败:', e);
                throw new Error('无法访问源文件路径: ' + e.message);
            }
        },

        // 根据命名规则生成文件名
        generateFileName(doc, layer = null, index = 0) {
            const isPng = this.settings.format === 'PNG';
            const ext = isPng ? 'png' : 'jpg';
            const namingRule = this.settings.namingRule || { pattern: 'layerName', separator: '_' };

            // 获取文档名称（不含扩展名）
            const docName = doc.name.replace(/\.[^.]+$/, '');
            const sanitizeName = (name, fallback) => {
                const cleaned = (name || '').replace(/[<>:"/\\|?*]/g, '_').trim();
                return cleaned || fallback;
            };

            // 默认使用图层名称
            let baseName = docName;
            if (layer) {
                baseName = sanitizeName(layer.name, `图层${index + 1}`);
            }

            return `${baseName}.${ext}`;
        },

        // 处理文件名重复，添加后缀或覆盖
        resolveDuplicateName(existingNames, fileName, index = 0) {
            // 如果没有重复，直接返回
            if (!existingNames.has(fileName)) {
                existingNames.add(fileName);
                return fileName;
            }

            // 批量导出始终直接覆盖同名文件，不再添加后缀避让。
            if (this.settings.batchExport || this.settings.overwrite) {
                return fileName;
            }

            // 获取文件名和扩展名
            const lastDot = fileName.lastIndexOf('.');
            let name = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
            let ext = lastDot > 0 ? fileName.substring(lastDot) : '.png';
            const sep = this.settings.namingRule?.separator || '_';

            let counter = Math.max(1, index);
            let newName;
            do {
                newName = `${name}${sep}${counter}${ext}`;
                counter++;
            } while (existingNames.has(newName));

            existingNames.add(newName);
            return newName;
        },

        // 构建普通保存格式参数
        buildSaveFormatOptions() {
            if (this.settings.format === 'PNG') {
                return {
                    _obj: 'PNGFormat',
                    PNGInterlaceType: {
                        _enum: 'PNGInterlaceType',
                        _value: 'PNGInterlaceNone'
                    },
                    PNGFilter: {
                        _enum: 'PNGFilter',
                        _value: 'PNGFilterAdaptive'
                    }
                };
            }

            return {
                _obj: 'JPEGFormat',
                quality: Math.round(this.settings.jpegQuality / 100 * 12)
            };
        },

        getSaveForWebJpegQuality() {
            const quality = parseInt(this.settings.jpegQuality, 10);
            if (!Number.isFinite(quality)) {
                return 100;
            }
            return Math.max(1, Math.min(100, quality));
        },

        // 是否使用 SaveForWeb 导出
        shouldUseSaveForWeb() {
            return this.settings.format === 'JPEG'
                || (this.settings.format === 'PNG' && this.settings.pngBitDepth === 8);
        },

        // 构建 SaveForWeb 导出描述符
        buildSaveForWebDescriptor(fileToken, nativeFilePath) {
            return {
                _obj: 'export',
                using: {
                    _obj: 'SaveForWeb',
                    format: {
                        _enum: '$IRFm',
                        _value: '$PNG8'
                    },
                    transparency: true,
                    interlaced: false,
                    colors: 256,
                    dither: {
                        _enum: '$IRDt',
                        _value: 'diffusion'
                    },
                    ditherAmount: 100,
                    matteColor: {
                        _obj: 'RGBColor',
                        red: 255,
                        grain: 255,
                        blue: 255
                    },
                    in: {
                        _path: fileToken,
                        _kind: 'local'
                    },
                    pathName: nativeFilePath
                },
                _options: {
                    dialogOptions: 'dontDisplay'
                }
            };
        },

        buildSaveForWebJpegDescriptor(folderToken, fileName) {
            return {
                _obj: 'export',
                using: {
                    _obj: 'SaveForWeb',
                    $Op: {
                        _enum: '$SWOp',
                        _value: '$OpSa'
                    },
                    $DIDr: true,
                    $EICC: false,
                    $Mtt: false,
                    $MttB: 255,
                    $MttG: 255,
                    $MttR: 255,
                    $Pass: 1,
                    $QCUI: 0,
                    $QChS: 0,
                    $QChT: false,
                    $QChV: false,
                    $SHTM: false,
                    $SImg: true,
                    $SWch: {
                        _enum: '$STch',
                        _value: '$CHsR'
                    },
                    $SWmd: {
                        _enum: '$STmd',
                        _value: '$MDCC'
                    },
                    $SWsl: {
                        _enum: '$STsl',
                        _value: '$SLAl'
                    },
                    $obCS: {
                        _enum: '$STcs',
                        _value: '$CS01'
                    },
                    $obIA: false,
                    $obIP: '',
                    $ohAA: true,
                    $ohAC: {
                        _enum: '$SToc',
                        _value: '$OC03'
                    },
                    $ohCA: false,
                    $ohEn: {
                        _enum: '$STen',
                        _value: '$EN00'
                    },
                    $ohIC: true,
                    $ohIZ: true,
                    $ohIn: -1,
                    $ohLE: {
                        _enum: '$STle',
                        _value: '$LE03'
                    },
                    $ohQA: true,
                    $ohTC: {
                        _enum: '$SToc',
                        _value: '$OC03'
                    },
                    $ohXH: false,
                    $olCS: false,
                    $olEC: {
                        _enum: '$STst',
                        _value: '$ST00'
                    },
                    $olNC: [
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC00' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC19' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC28' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC24' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC24' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC24' } }
                    ],
                    $olSH: {
                        _enum: '$STsp',
                        _value: '$SP04'
                    },
                    $olSV: {
                        _enum: '$STsp',
                        _value: '$SP04'
                    },
                    $olWH: {
                        _enum: '$STwh',
                        _value: '$WH01'
                    },
                    $ovCB: true,
                    $ovCM: false,
                    $ovCU: true,
                    $ovCW: true,
                    $ovFN: fileName,
                    $ovNC: [
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC01' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC20' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC02' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC19' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC06' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC24' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC24' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC24' } },
                        { _obj: '$SCnc', $ncTp: { _enum: '$STnc', _value: '$NC22' } }
                    ],
                    $ovSF: true,
                    $ovSN: 'images',
                    blur: 0,
                    format: {
                        _enum: '$IRFm',
                        _value: 'JPEG'
                    },
                    in: {
                        _path: folderToken,
                        _kind: 'local'
                    },
                    interfaceIconFrameDimmed: false,
                    optimized: true,
                    quality: this.getSaveForWebJpegQuality()
                },
                _options: {
                    dialogOptions: 'dontDisplay'
                }
            };
        },

        getBinaryByteLength(data) {
            return data ? (data.byteLength || data.length || 0) : 0;
        },

        async readFileBinary(fileEntry) {
            if (!fileEntry || typeof fileEntry.read !== 'function') {
                return null;
            }

            try {
                const { storage } = require('uxp');
                return await fileEntry.read({ format: storage.formats.binary });
            } catch (e) {
                return null;
            }
        },

        async createSaveForWebTempFile(folder, targetFileName) {
            const lastDot = targetFileName.lastIndexOf('.');
            const ext = lastDot > 0 ? targetFileName.substring(lastDot) : '.png';

            for (let i = 0; i < 50; i++) {
                const tempName = `uxp-sfw-${Date.now()}-${i}${ext}`;
                try {
                    return await folder.createFile(tempName, { overwrite: true });
                } catch (e) {
                    console.warn('[ExportModule] SaveForWeb temp file create failed:', tempName, e.message);
                }
            }

            throw new Error('Unable to create temporary SaveForWeb export file');
        },

        async createOverwriteFile(folder, fileName) {
            try {
                const existingEntry = await folder.getEntry(fileName);
                await this.deleteFileEntry(existingEntry);
            } catch (e) {
                // The target file does not exist yet.
            }

            return await folder.createFile(fileName, { overwrite: true });
        },

        async deleteExistingFile(folder, fileName) {
            try {
                const existingEntry = await folder.getEntry(fileName);
                await this.deleteFileEntry(existingEntry);
            } catch (e) {
                // The target file does not exist yet.
            }
        },

        async copyFileBinary(sourceEntry, targetEntry) {
            const { storage } = require('uxp');
            const data = await this.readFileBinary(sourceEntry);

            if (this.getBinaryByteLength(data) === 0) {
                throw new Error('SaveForWeb export did not produce file data');
            }

            await targetEntry.write(data, { format: storage.formats.binary });
        },

        async assertFileHasData(fileEntry, message) {
            const data = await this.readFileBinary(fileEntry);
            if (this.getBinaryByteLength(data) === 0) {
                throw new Error(message || 'SaveForWeb export did not produce file data');
            }
        },

        async resolveSaveForWebJpegOutput(folder, fileName) {
            let directEntry = null;
            try {
                directEntry = await folder.getEntry(fileName);
                const directData = await this.readFileBinary(directEntry);
                if (this.getBinaryByteLength(directData) > 0) {
                    return directEntry;
                }
            } catch (e) {
                // Save for Web may place image-only output into the configured images folder.
            }

            try {
                const imagesFolder = await folder.getEntry('images');
                const nestedEntry = await imagesFolder.getEntry(fileName);
                const nestedData = await this.readFileBinary(nestedEntry);

                if (this.getBinaryByteLength(nestedData) === 0) {
                    throw new Error('SaveForWeb JPEG export did not produce file data');
                }

                if (directEntry) {
                    await this.deleteFileEntry(directEntry);
                }

                const targetEntry = await this.createOverwriteFile(folder, fileName);
                const { storage } = require('uxp');
                await targetEntry.write(nestedData, { format: storage.formats.binary });
                await this.deleteFileEntry(nestedEntry);
                return targetEntry;
            } catch (e) {
                if (directEntry) {
                    throw new Error('SaveForWeb JPEG export did not produce file data');
                }
                throw new Error('SaveForWeb JPEG export did not create the target file');
            }
        },

        async deleteFileEntry(fileEntry) {
            try {
                if (fileEntry && typeof fileEntry.delete === 'function') {
                    await fileEntry.delete();
                }
            } catch (e) {
                console.warn('[ExportModule] file delete failed:', e.message);
            }
        },

        // 导出整个文档（使用存储为Web格式）
        async exportDocument(doc, folder) {
            const photoshop = require('photoshop');
            const { action } = photoshop;
            const { storage } = require('uxp');
            const fs = storage.localFileSystem;

            const saveFormatOptions = this.buildSaveFormatOptions();

            // 根据命名规则生成文件名（单图导出，layer为null）
            let filename = this.generateFileName(doc, null, 0);

            console.log('[ExportModule] 开始导出文档:', filename, '格式:', this.settings.format, this.settings.format === 'PNG' ? `位深: PNG-${this.settings.pngBitDepth}` : '');

            try {
                let nativeFilePath = '';

                if (this.settings.format === 'JPEG') {
                    await this.deleteExistingFile(folder, filename);
                    const folderToken = await fs.createSessionToken(folder);
                    const commands = [this.buildSaveForWebJpegDescriptor(folderToken, filename)];
                    console.log('[ExportModule] 使用 SaveForWeb 导出 JPEG:', folder.nativePath, filename, 'token:', folderToken);
                    await action.batchPlay(commands, {
                        "dialogOptions": "dontDisplay"
                    });

                    const fileEntry = await this.resolveSaveForWebJpegOutput(folder, filename);
                    nativeFilePath = fileEntry.nativePath;
                    await this.assertFileHasData(fileEntry, 'SaveForWeb JPEG export did not produce file data');
                } else if (this.shouldUseSaveForWeb()) {
                    const fileEntry = await this.createOverwriteFile(folder, filename);
                    const tempFileEntry = await this.createSaveForWebTempFile(folder, filename);
                    const token = await fs.createSessionToken(tempFileEntry);
                    const tempNativeFilePath = tempFileEntry.nativePath;
                    const commands = [this.buildSaveForWebDescriptor(token, tempNativeFilePath)];
                    console.log('[ExportModule] 使用 SaveForWeb 导出:', this.settings.format, tempNativeFilePath, 'token:', token);
                    await action.batchPlay(commands, {
                        "dialogOptions": "dontDisplay"
                    });
                    await this.copyFileBinary(tempFileEntry, fileEntry);
                    await this.deleteFileEntry(tempFileEntry);
                    nativeFilePath = fileEntry.nativePath;
                } else {
                    const fileEntry = await this.createOverwriteFile(folder, filename);
                    const token = await fs.createSessionToken(fileEntry);
                    nativeFilePath = fileEntry.nativePath;
                    console.log('[ExportModule] 文件 token:', token);

                    // 构建 save 命令 - 使用正确的 _obj: "save"
                    const commands = [{
                        "_obj": "save",
                        "as": saveFormatOptions,
                        "in": {
                            "_path": token,
                            "_kind": "local"
                        },
                        "documentID": doc.id,
                        "copy": true,
                        "lowerCase": true,
                        "saveStage": {
                            "_enum": "saveStageType",
                            "_value": "saveBegin"
                        }
                    }];

                    console.log('[ExportModule] 发送 batchPlay 命令...');
                    await action.batchPlay(commands, {
                        "dialogOptions": "dontDisplay"
                    });
                }

                console.log('[ExportModule] 文档导出成功:', filename);

                return {
                    success: true,
                    filename: filename,
                    path: nativeFilePath
                };
            } catch (e) {
                console.error('[ExportModule] 导出文档失败:', e);
                throw e;
            }
        },

        // 创建不重复的文件夹名
        async createUniqueFolder(parentFolder, baseName) {
            const fs = require('uxp').storage.localFileSystem;
            let folderName = baseName;
            let counter = 1;
            let newFolder;

            while (true) {
                try {
                    // 尝试获取文件夹
                    newFolder = await parentFolder.getEntry(folderName);
                    // 如果能获取到，说明已存在，需要换一个名字
                    console.log(`[ExportModule] 文件夹 ${folderName} 已存在，尝试创建新名称`);
                } catch (e) {
                    // getEntry 失败说明文件夹不存在，可以创建
                    try {
                        newFolder = await parentFolder.createFolder(folderName);
                        console.log(`[ExportModule] 创建文件夹成功: ${folderName}`);
                        return newFolder;
                    } catch (createErr) {
                        // 创建也失败，继续尝试
                        console.log(`[ExportModule] 创建文件夹失败: ${createErr.message}`);
                    }
                }

                // 生成新名称
                folderName = `${baseName}_${counter}`;
                counter++;

                // 防止无限循环
                if (counter > 1000) {
                    throw new Error('无法创建不重复的文件夹名');
                }
            }
        },

        // 获取或创建子文件夹（根据覆盖设置）
        async getOrCreateSubFolder(parentFolder, baseName) {
            const fs = require('uxp').storage.localFileSystem;
            
            // 如果开启覆盖模式，尝试直接获取已存在的文件夹
            if (this.settings.overwrite) {
                try {
                    const existingFolder = await parentFolder.getEntry(baseName);
                    console.log(`[ExportModule] 使用已存在的文件夹: ${baseName}`);
                    return existingFolder;
                } catch (e) {
                    // 文件夹不存在，需要创建
                    console.log(`[ExportModule] 文件夹 ${baseName} 不存在，将创建新文件夹`);
                }
            }
            
            // 使用唯一文件夹逻辑
            return await this.createUniqueFolder(parentFolder, baseName);
        },

        // 批量导出一级图层
        async batchExportLayers(doc, folder) {
            const photoshop = require('photoshop');
            const { action } = photoshop;
            const { storage } = require('uxp');
            const fs = storage.localFileSystem;

            const docName = doc.name.replace(/\.[^.]+$/, '');
            const timestamp = Date.now();
            const results = [];
            const existingNames = new Set(); // 用于追踪已使用的文件名

            // 获取所有图层
            const layers = doc.layers;
            if (!layers || layers.length === 0) {
                throw new Error('文档中没有图层');
            }

            // 筛选一级图层（图层面板从下往上顺序）
            const topLevelLayers = [];
            for (let i = layers.length - 1; i >= 0; i--) {
                const layer = layers[i];
                // 检查是否是背景图层
                const isBackground = layer.name === '背景' ||
                                     layer.kind === photoshop.constants.LayerKind.BACKGROUND;

                if (isBackground) {
                    continue;
                }
                // 从后往前遍历，即图层面板从下往上的顺序
                topLevelLayers.push(layer);
            }

            if (topLevelLayers.length === 0) {
                throw new Error('没有可导出的图层（已排除背景图层或无其他图层）');
            }

            console.log(`[ExportModule] 开始批量导出 ${topLevelLayers.length} 个图层`);

            const saveFormatOptions = this.buildSaveFormatOptions();
            const useSaveForWeb = this.shouldUseSaveForWeb();
            const saveForWebFolderToken = this.settings.format === 'JPEG'
                ? await fs.createSessionToken(folder)
                : null;

            // 用于保存原始可见性状态
            const originalVisibility = topLevelLayers.map(l => l.visible);

            for (let i = 0; i < topLevelLayers.length; i++) {
                const layer = topLevelLayers[i];

                // 隐藏所有图层（使用 DOM API）
                for (const l of topLevelLayers) {
                    l.visible = false;
                }

                // 显示当前图层
                layer.visible = true;

                // 根据图层名称生成文件名
                let fileName = this.generateFileName(doc, layer, i);

                // 处理文件名重复（相同图层名称添加序号后缀）
                fileName = this.resolveDuplicateName(existingNames, fileName, i);

                console.log(`[ExportModule] 批量导出图层 ${i+1}/${topLevelLayers.length}:`, fileName);

                try {
                    if (this.settings.format === 'JPEG') {
                        await this.deleteExistingFile(folder, fileName);
                        const commands = [this.buildSaveForWebJpegDescriptor(saveForWebFolderToken, fileName)];
                        console.log('[ExportModule] 使用 SaveForWeb 批量导出 JPEG:', folder.nativePath, fileName, 'token:', saveForWebFolderToken);
                        await action.batchPlay(commands, {
                            "dialogOptions": "dontDisplay"
                        });

                        const fileEntry = await this.resolveSaveForWebJpegOutput(folder, fileName);
                        await this.assertFileHasData(fileEntry, 'SaveForWeb JPEG export did not produce file data');
                    } else if (useSaveForWeb) {
                        const fileEntry = await this.createOverwriteFile(folder, fileName);
                        const tempFileEntry = await this.createSaveForWebTempFile(folder, fileName);
                        const token = await fs.createSessionToken(tempFileEntry);
                        const nativeFilePath = tempFileEntry.nativePath;
                        const commands = [this.buildSaveForWebDescriptor(token, nativeFilePath)];
                        console.log('[ExportModule] 使用 SaveForWeb 批量导出:', this.settings.format, nativeFilePath, 'token:', token);
                        await action.batchPlay(commands, {
                            "dialogOptions": "dontDisplay"
                        });
                        await this.copyFileBinary(tempFileEntry, fileEntry);
                        await this.deleteFileEntry(tempFileEntry);
                    } else {
                        const fileEntry = await this.createOverwriteFile(folder, fileName);
                        const token = await fs.createSessionToken(fileEntry);
                        // 构建 save 命令
                        const commands = [{
                            "_obj": "save",
                            "as": saveFormatOptions,
                            "in": {
                                "_path": token,
                                "_kind": "local"
                            },
                            "documentID": doc.id,
                            "copy": true,
                            "lowerCase": true,
                            "saveStage": {
                                "_enum": "saveStageType",
                                "_value": "saveBegin"
                            }
                        }];

                        await action.batchPlay(commands, {
                            "dialogOptions": "dontDisplay"
                        });
                    }

                    results.push({
                        success: true,
                        layerName: layer.name,
                        filename: fileName
                    });

                    console.log(`[ExportModule] 已导出图层: ${layer.name} -> ${fileName}`);
                } catch (e) {
                    console.error(`[ExportModule] 导出图层失败 ${layer.name}:`, e);
                    results.push({
                        success: false,
                        layerName: layer.name,
                        error: e.message
                    });
                }
            }
            
            // 恢复原始可见性
            for (let i = 0; i < topLevelLayers.length; i++) {
                topLevelLayers[i].visible = originalVisibility[i];
            }

            return {
                success: true,
                totalLayers: topLevelLayers.length,
                results: results
            };
        }
    };

    // 暴露到全局
    window.ExportModule = ExportModule;

})();
