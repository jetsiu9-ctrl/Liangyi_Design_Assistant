/**
 * 百度翻译模块
 * 负责配置保存、签名生成、调用百度通用翻译 API，并应用到选中文本图层。
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'haimati_translate_settings';
    const SETTINGS_FILE_NAME = 'haimati_translate_settings.json';
    const BAIDU_TRANSLATE_URL = 'https://fanyi-api.baidu.com/api/trans/vip/translate';

    const defaultSettings = {
        appId: '',
        secretKey: '',
        from: 'auto',
        to: 'zh',
        appendTranslation: false
    };

    let settings = { ...defaultSettings };

    function normalizeSettings(raw = {}) {
        return {
            appId: String(raw.appId || ''),
            secretKey: String(raw.secretKey || ''),
            from: String(raw.from || 'auto'),
            to: String(raw.to || 'zh'),
            appendTranslation: Boolean(raw.appendTranslation)
        };
    }

    function getEffectiveSettings(overrideSettings) {
        return normalizeSettings(overrideSettings ? { ...settings, ...overrideSettings } : settings);
    }

    async function persistSettingsToDisk(stateOverride) {
        const currentSettings = normalizeSettings(stateOverride || settings);
        try {
            const { storage } = require('uxp');
            const fs = storage.localFileSystem;
            const dataFolder = await fs.getDataFolder();
            const file = await dataFolder.createFile(SETTINGS_FILE_NAME, { overwrite: true });
            await file.write(JSON.stringify(currentSettings));
            settings = currentSettings;
            return true;
        } catch (e) {
            console.error('[TranslateModule] 持久化设置文件失败:', e);
            return false;
        }
    }

    async function init() {
        try {
            const { storage } = require('uxp');
            const fs = storage.localFileSystem;
            const dataFolder = await fs.getDataFolder();
            const file = await dataFolder.getEntry(SETTINGS_FILE_NAME);
            const data = await file.read();
            settings = normalizeSettings(data ? JSON.parse(data) : defaultSettings);
        } catch (e) {
            console.log('[TranslateModule] 未读取到持久化设置文件，使用默认配置:', e.message);
            settings = normalizeSettings(defaultSettings);
        }
        return { ...settings };
    }

    function resetState() {
        settings = normalizeSettings(defaultSettings);
        return { ...settings };
    }

    function setState(newSettings) {
        settings = getEffectiveSettings(newSettings);
        return { ...settings };
    }

    function replaceState(nextState) {
        settings = normalizeSettings(nextState || defaultSettings);
        return { ...settings };
    }

    function getState() {
        return { ...settings };
    }

    async function persist() {
        return await persistSettingsToDisk(settings);
    }

    async function clearPersisted() {
        settings = normalizeSettings(defaultSettings);
        try {
            const { storage } = require('uxp');
            const fs = storage.localFileSystem;
            const dataFolder = await fs.getDataFolder();
            const file = await dataFolder.getEntry(SETTINGS_FILE_NAME);
            if (file && typeof file.delete === 'function') {
                await file.delete();
            }
        } catch (e) {
            console.log('[TranslateModule] 清除持久化设置文件跳过:', e.message);
        }

        return { ...settings };
    }

    function rotateLeft(value, shift) {
        return (value << shift) | (value >>> (32 - shift));
    }

    function addUnsigned(first, second) {
        const firstHigh = first & 0x80000000;
        const secondHigh = second & 0x80000000;
        const firstLow = first & 0x40000000;
        const secondLow = second & 0x40000000;
        const result = (first & 0x3fffffff) + (second & 0x3fffffff);

        if (firstLow & secondLow) return result ^ 0x80000000 ^ firstHigh ^ secondHigh;
        if (firstLow | secondLow) {
            if (result & 0x40000000) return result ^ 0xc0000000 ^ firstHigh ^ secondHigh;
            return result ^ 0x40000000 ^ firstHigh ^ secondHigh;
        }
        return result ^ firstHigh ^ secondHigh;
    }

    function f(x, y, z) { return (x & y) | ((~x) & z); }
    function g(x, y, z) { return (x & z) | (y & (~z)); }
    function h(x, y, z) { return x ^ y ^ z; }
    function i(x, y, z) { return y ^ (x | (~z)); }

    function transform(fn, a, b, c, d, x, s, ac) {
        a = addUnsigned(a, addUnsigned(addUnsigned(fn(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function utf8Encode(value) {
        return unescape(encodeURIComponent(value));
    }

    function convertToWordArray(value) {
        const messageLength = value.length;
        const wordCount = (((messageLength + 8) - ((messageLength + 8) % 64)) / 64 + 1) * 16;
        const wordArray = new Array(wordCount - 1);
        let bytePosition = 0;
        let byteCount = 0;

        while (byteCount < messageLength) {
            const wordPosition = (byteCount - (byteCount % 4)) / 4;
            bytePosition = (byteCount % 4) * 8;
            wordArray[wordPosition] = (wordArray[wordPosition] || 0) | (value.charCodeAt(byteCount) << bytePosition);
            byteCount++;
        }

        const wordPosition = (byteCount - (byteCount % 4)) / 4;
        bytePosition = (byteCount % 4) * 8;
        wordArray[wordPosition] = (wordArray[wordPosition] || 0) | (0x80 << bytePosition);
        wordArray[wordCount - 2] = messageLength << 3;
        wordArray[wordCount - 1] = messageLength >>> 29;
        return wordArray;
    }

    function wordToHex(value) {
        let hex = '';
        for (let count = 0; count <= 3; count++) {
            const byte = (value >>> (count * 8)) & 255;
            const part = `0${byte.toString(16)}`;
            hex += part.substr(part.length - 2, 2);
        }
        return hex;
    }

    function md5(value) {
        const encoded = utf8Encode(value);
        const words = convertToWordArray(encoded);
        let a = 0x67452301;
        let b = 0xefcdab89;
        let c = 0x98badcfe;
        let d = 0x10325476;

        for (let k = 0; k < words.length; k += 16) {
            const aa = a;
            const bb = b;
            const cc = c;
            const dd = d;

            a = transform(f, a, b, c, d, words[k + 0], 7, 0xd76aa478);
            d = transform(f, d, a, b, c, words[k + 1], 12, 0xe8c7b756);
            c = transform(f, c, d, a, b, words[k + 2], 17, 0x242070db);
            b = transform(f, b, c, d, a, words[k + 3], 22, 0xc1bdceee);
            a = transform(f, a, b, c, d, words[k + 4], 7, 0xf57c0faf);
            d = transform(f, d, a, b, c, words[k + 5], 12, 0x4787c62a);
            c = transform(f, c, d, a, b, words[k + 6], 17, 0xa8304613);
            b = transform(f, b, c, d, a, words[k + 7], 22, 0xfd469501);
            a = transform(f, a, b, c, d, words[k + 8], 7, 0x698098d8);
            d = transform(f, d, a, b, c, words[k + 9], 12, 0x8b44f7af);
            c = transform(f, c, d, a, b, words[k + 10], 17, 0xffff5bb1);
            b = transform(f, b, c, d, a, words[k + 11], 22, 0x895cd7be);
            a = transform(f, a, b, c, d, words[k + 12], 7, 0x6b901122);
            d = transform(f, d, a, b, c, words[k + 13], 12, 0xfd987193);
            c = transform(f, c, d, a, b, words[k + 14], 17, 0xa679438e);
            b = transform(f, b, c, d, a, words[k + 15], 22, 0x49b40821);

            a = transform(g, a, b, c, d, words[k + 1], 5, 0xf61e2562);
            d = transform(g, d, a, b, c, words[k + 6], 9, 0xc040b340);
            c = transform(g, c, d, a, b, words[k + 11], 14, 0x265e5a51);
            b = transform(g, b, c, d, a, words[k + 0], 20, 0xe9b6c7aa);
            a = transform(g, a, b, c, d, words[k + 5], 5, 0xd62f105d);
            d = transform(g, d, a, b, c, words[k + 10], 9, 0x02441453);
            c = transform(g, c, d, a, b, words[k + 15], 14, 0xd8a1e681);
            b = transform(g, b, c, d, a, words[k + 4], 20, 0xe7d3fbc8);
            a = transform(g, a, b, c, d, words[k + 9], 5, 0x21e1cde6);
            d = transform(g, d, a, b, c, words[k + 14], 9, 0xc33707d6);
            c = transform(g, c, d, a, b, words[k + 3], 14, 0xf4d50d87);
            b = transform(g, b, c, d, a, words[k + 8], 20, 0x455a14ed);
            a = transform(g, a, b, c, d, words[k + 13], 5, 0xa9e3e905);
            d = transform(g, d, a, b, c, words[k + 2], 9, 0xfcefa3f8);
            c = transform(g, c, d, a, b, words[k + 7], 14, 0x676f02d9);
            b = transform(g, b, c, d, a, words[k + 12], 20, 0x8d2a4c8a);

            a = transform(h, a, b, c, d, words[k + 5], 4, 0xfffa3942);
            d = transform(h, d, a, b, c, words[k + 8], 11, 0x8771f681);
            c = transform(h, c, d, a, b, words[k + 11], 16, 0x6d9d6122);
            b = transform(h, b, c, d, a, words[k + 14], 23, 0xfde5380c);
            a = transform(h, a, b, c, d, words[k + 1], 4, 0xa4beea44);
            d = transform(h, d, a, b, c, words[k + 4], 11, 0x4bdecfa9);
            c = transform(h, c, d, a, b, words[k + 7], 16, 0xf6bb4b60);
            b = transform(h, b, c, d, a, words[k + 10], 23, 0xbebfbc70);
            a = transform(h, a, b, c, d, words[k + 13], 4, 0x289b7ec6);
            d = transform(h, d, a, b, c, words[k + 0], 11, 0xeaa127fa);
            c = transform(h, c, d, a, b, words[k + 3], 16, 0xd4ef3085);
            b = transform(h, b, c, d, a, words[k + 6], 23, 0x04881d05);
            a = transform(h, a, b, c, d, words[k + 9], 4, 0xd9d4d039);
            d = transform(h, d, a, b, c, words[k + 12], 11, 0xe6db99e5);
            c = transform(h, c, d, a, b, words[k + 15], 16, 0x1fa27cf8);
            b = transform(h, b, c, d, a, words[k + 2], 23, 0xc4ac5665);

            a = transform(i, a, b, c, d, words[k + 0], 6, 0xf4292244);
            d = transform(i, d, a, b, c, words[k + 7], 10, 0x432aff97);
            c = transform(i, c, d, a, b, words[k + 14], 15, 0xab9423a7);
            b = transform(i, b, c, d, a, words[k + 5], 21, 0xfc93a039);
            a = transform(i, a, b, c, d, words[k + 12], 6, 0x655b59c3);
            d = transform(i, d, a, b, c, words[k + 3], 10, 0x8f0ccc92);
            c = transform(i, c, d, a, b, words[k + 10], 15, 0xffeff47d);
            b = transform(i, b, c, d, a, words[k + 1], 21, 0x85845dd1);
            a = transform(i, a, b, c, d, words[k + 8], 6, 0x6fa87e4f);
            d = transform(i, d, a, b, c, words[k + 15], 10, 0xfe2ce6e0);
            c = transform(i, c, d, a, b, words[k + 6], 15, 0xa3014314);
            b = transform(i, b, c, d, a, words[k + 13], 21, 0x4e0811a1);
            a = transform(i, a, b, c, d, words[k + 4], 6, 0xf7537e82);
            d = transform(i, d, a, b, c, words[k + 11], 10, 0xbd3af235);
            c = transform(i, c, d, a, b, words[k + 2], 15, 0x2ad7d2bb);
            b = transform(i, b, c, d, a, words[k + 9], 21, 0xeb86d391);

            a = addUnsigned(a, aa);
            b = addUnsigned(b, bb);
            c = addUnsigned(c, cc);
            d = addUnsigned(d, dd);
        }

        return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
    }

    function buildFormBody(params) {
        return Object.keys(params)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
    }

    function getBaiduErrorMessage(errorCode, errorMessage) {
        const messages = {
            '52000': '翻译成功',
            '52001': '请求超时，请稍后重试',
            '52002': '系统错误，请稍后重试',
            '52003': '未授权用户，请检查 APP ID 或密钥',
            '54000': '必填参数为空，请检查配置',
            '54001': '签名错误，请检查密钥',
            '54003': '访问频率受限，请稍后重试',
            '54004': '账户余额不足',
            '54005': '长 query 请求频繁，请稍后重试',
            '58000': '客户端 IP 非法或服务未开通',
            '58001': '译文语言方向不支持',
            '90107': '认证未通过或未开通服务'
        };
        return messages[String(errorCode)] || errorMessage || `百度翻译错误：${errorCode}`;
    }

    async function translateText(text, overrideSettings) {
        const currentSettings = { ...settings, ...(overrideSettings || {}) };
        const query = String(text || '').trim();

        if (!query) {
            throw new Error('没有可翻译的文本');
        }
        if (!currentSettings.appId || !currentSettings.secretKey) {
            throw new Error('请先填写百度翻译 APP ID 和密钥');
        }

        const salt = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
        const sign = md5(`${currentSettings.appId}${query}${salt}${currentSettings.secretKey}`);
        const body = buildFormBody({
            q: query,
            from: currentSettings.from || 'auto',
            to: currentSettings.to || 'zh',
            appid: currentSettings.appId,
            salt,
            sign
        });

        const response = await fetch(BAIDU_TRANSLATE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        });

        if (!response.ok) {
            throw new Error(`百度翻译请求失败：HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.error_code) {
            throw new Error(getBaiduErrorMessage(data.error_code, data.error_msg));
        }
        if (!data.trans_result || !data.trans_result.length) {
            throw new Error('百度翻译没有返回译文');
        }

        return {
            from: data.from,
            to: data.to,
            source: data.trans_result.map(item => item.src).join('\n'),
            translated: data.trans_result.map(item => item.dst).join('\n')
        };
    }

    function getUnitValue(value) {
        if (value === undefined || value === null) return 0;
        if (typeof value === 'object') {
            if (value.value !== undefined) return parseFloat(value.value) || 0;
            if (value._value !== undefined) return parseFloat(value._value) || 0;
        }
        return parseFloat(value) || 0;
    }

    function getLayerHeight(layer) {
        try {
            const bounds = layer.bounds;
            if (!bounds) return 24;
            const top = getUnitValue(bounds.top);
            const bottom = getUnitValue(bounds.bottom);
            const height = Math.abs(bottom - top);
            return height > 0 ? height : 24;
        } catch (e) {
            return 24;
        }
    }

    async function selectLayerById(action, layerId) {
        await action.batchPlay([{
            _obj: 'select',
            _target: [{ _ref: 'layer', _id: layerId }],
            _enum: 'ordinal',
            _value: 'targetEnum',
            makeVisible: false
        }], {});
    }

    async function moveActiveLayerDown(action) {
        try {
            await action.batchPlay([{
                _obj: 'move',
                _target: [{
                    _enum: 'ordinal',
                    _ref: 'layer',
                    _value: 'targetEnum'
                }],
                to: {
                    _enum: 'ordinal',
                    _ref: 'layer',
                    _value: 'previous'
                }
            }], {});
        } catch (e) {
            console.warn('[TranslateModule] 调整附文图层顺序失败:', e);
        }
    }

    async function offsetActiveLayer(action, verticalOffset) {
        if (!verticalOffset) return;

        await action.batchPlay([{
            _obj: 'transform',
            _target: [{
                _enum: 'ordinal',
                _ref: 'layer',
                _value: 'targetEnum'
            }],
            freeTransformCenterState: {
                _enum: 'quadCenterState',
                _value: 'QCSAverage'
            },
            offset: {
                _obj: 'offset',
                horizontal: { _unit: 'pixelsUnit', _value: 0 },
                vertical: { _unit: 'pixelsUnit', _value: verticalOffset }
            },
            _options: {
                dialogOptions: 'dontDisplay'
            }
        }], {});
    }

    async function createAttachedTranslationLayer(item, photoshop) {
        const { app, action } = photoshop;
        const sourceLayer = item.layer;
        const verticalOffset = Math.max(getLayerHeight(sourceLayer) + 8, 24);

        await selectLayerById(action, sourceLayer.id);
        await action.batchPlay([{
            _obj: 'duplicate',
            _target: [{
                _enum: 'ordinal',
                _ref: 'layer',
                _value: 'targetEnum'
            }],
            name: `${sourceLayer.name || '文字'} 翻译`,
            version: 5,
            _options: {
                dialogOptions: 'dontDisplay'
            }
        }], {});

        const duplicateLayer = Array.from(app.activeDocument.activeLayers || [])[0];
        if (!duplicateLayer || duplicateLayer.kind !== photoshop.constants.LayerKind.TEXT) {
            throw new Error('创建附文图层失败');
        }

        duplicateLayer.name = `${sourceLayer.name || '文字'} 翻译`;
        duplicateLayer.textItem.contents = item.translatedText;
        await offsetActiveLayer(action, verticalOffset);
        await moveActiveLayerDown(action);
    }

    async function doExecute(overrideSettings) {
        const photoshop = require('photoshop');
        const { app, core } = photoshop;
        const doc = app.activeDocument;
        const currentSettings = getEffectiveSettings(overrideSettings);

        if (!doc) {
            throw new Error('没有活动文档');
        }

        const selectedLayers = Array.from(doc.activeLayers || []);
        const textLayers = selectedLayers.filter(layer => layer.kind === photoshop.constants.LayerKind.TEXT);

        if (textLayers.length === 0) {
            throw new Error('请先选择至少一个文字图层');
        }

        const translatedItems = [];
        for (const layer of textLayers) {
            const sourceText = layer.textItem?.contents || '';
            if (!sourceText.trim()) continue;

            const result = await translateText(sourceText, currentSettings);
            translatedItems.push({ layer, sourceText, translatedText: result.translated });
        }

        if (translatedItems.length === 0) {
            throw new Error('选中文字图层没有可翻译内容');
        }

        return await core.executeAsModal(async () => {
            let updatedCount = 0;
            for (const item of translatedItems) {
                try {
                    if (settings.appendTranslation) {
                        await createAttachedTranslationLayer(item, photoshop);
                    } else {
                        item.layer.textItem.contents = item.translatedText;
                    }
                    updatedCount++;
                } catch (e) {
                    console.error('[TranslateModule] 写入译文失败:', item.layer.name, e);
                }
            }

            if (updatedCount === 0) {
                throw new Error('译文写入失败');
            }

            return {
                updatedCount,
                appendTranslation: Boolean(settings.appendTranslation),
                preview: translatedItems.map(item => item.translatedText).join('\n')
            };
        }, { commandName: '百度翻译选中文字图层' });
    }

    window.TranslateModule = {
        init,
        getState,
        setState,
        replaceState,
        resetState,
        persist,
        clearPersisted,
        execute(overrideSettings) {
            return doExecute(overrideSettings);
        },
        translateText,
        doExecute
    };
})();
