/**
 * 颜色存储模块
 * 负责管理前景色记录和手动添加颜色的本地存储
 */

const STORAGE_KEY_FOREGROUND = 'haimati_foreground_colors';
const STORAGE_KEY_MANUAL = 'haimati_manual_colors';
const MAX_FOREGROUND_COLORS = 10;
const MAX_MANUAL_COLORS = 50;

function loadColors(key) {
    try {
        const data = localStorage.getItem(key);
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[ColorStorage] Failed to load colors:', e);
    }
    return [];
}

function saveColors(key, colors) {
    try {
        localStorage.setItem(key, JSON.stringify(colors));
    } catch (e) {
        console.error('[ColorStorage] Failed to save colors:', e);
    }
}

const ForegroundColorStorage = {
    getAll() {
        return loadColors(STORAGE_KEY_FOREGROUND);
    },

    add(color) {
        let colors = this.getAll();

        const normalizedColor = color.toLowerCase().replace(/\s/g, '');
        const normalizedColors = colors.map(c => c.toLowerCase().replace(/\s/g, ''));
        const existingIndex = normalizedColors.indexOf(normalizedColor);

        if (existingIndex !== -1) {
            colors.splice(existingIndex, 1);
        }

        colors.unshift(color);

        if (colors.length > MAX_FOREGROUND_COLORS) {
            colors = colors.slice(0, MAX_FOREGROUND_COLORS);
        }

        saveColors(STORAGE_KEY_FOREGROUND, colors);
        return colors;
    },

    clear() {
        saveColors(STORAGE_KEY_FOREGROUND, []);
    }
};

const ManualColorStorage = {
    getAll() {
        return loadColors(STORAGE_KEY_MANUAL);
    },

    add(color) {
        let colors = this.getAll();

        const normalizedColor = color.toLowerCase().replace(/\s/g, '');
        const normalizedColors = colors.map(c => c.toLowerCase().replace(/\s/g, ''));

        if (normalizedColors.includes(normalizedColor)) {
            return colors;
        }

        colors.unshift(color);

        if (colors.length > MAX_MANUAL_COLORS) {
            colors = colors.slice(0, MAX_MANUAL_COLORS);
        }

        saveColors(STORAGE_KEY_MANUAL, colors);
        return colors;
    },

    remove(index) {
        let colors = this.getAll();
        if (index >= 0 && index < colors.length) {
            colors.splice(index, 1);
            saveColors(STORAGE_KEY_MANUAL, colors);
        }
        return colors;
    },

    clear() {
        saveColors(STORAGE_KEY_MANUAL, []);
    }
};
