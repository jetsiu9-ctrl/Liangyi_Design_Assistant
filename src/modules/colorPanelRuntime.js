/**
 * 颜色面板运行时模块
 * 负责前景色轮询与颜色变化订阅
 */

(function() {
    'use strict';

    console.log('[ColorPanelRuntime] 初始化中...');

    let foregroundColorChangeCallbacks = [];
    let lastKnownColor = null;
    let pollingInterval = null;
    let isPollingActive = false;
    const POLLING_INTERVAL_MS = 500;

    function parseRGBColor(colorObj) {
        if (!colorObj || typeof colorObj !== 'object') {
            return null;
        }

        if (colorObj.rgb) {
            const r = Math.round(colorObj.rgb.red || 0);
            const g = Math.round(colorObj.rgb.green || 0);
            const b = Math.round(colorObj.rgb.blue || 0);
            return 'rgb(' + r + ',' + g + ',' + b + ')';
        }

        if (typeof colorObj.red !== 'undefined') {
            const r = Math.round(colorObj.red);
            const g = Math.round(colorObj.green);
            const b = Math.round(colorObj.blue);
            return 'rgb(' + r + ',' + g + ',' + b + ')';
        }

        return null;
    }

    async function getColorPanelForegroundColor() {
        try {
            const photoshop = require('photoshop');
            const app = photoshop.app;
            const fgColor = app.foregroundColor;
            const colorStr = parseRGBColor(fgColor);
            return colorStr || 'rgb(0,0,0)';
        } catch (e) {
            console.error('[ColorPanelRuntime] Failed to get foreground color:', e);
            return null;
        }
    }

    async function fetchAndNotifyForegroundColor() {
        if (!isPollingActive) return;

        try {
            const color = await getColorPanelForegroundColor();
            if (color && color !== lastKnownColor) {
                lastKnownColor = color;
                foregroundColorChangeCallbacks.forEach(function(callback) {
                    try {
                        callback(color);
                    } catch (e) {
                        console.error('[ColorPanelRuntime] Callback error:', e);
                    }
                });
            }
        } catch (e) {
            console.error('[ColorPanelRuntime] Polling error:', e);
        }
    }

    function startColorPanelForegroundPolling() {
        if (pollingInterval) return;
        isPollingActive = true;
        pollingInterval = setInterval(fetchAndNotifyForegroundColor, POLLING_INTERVAL_MS);
        fetchAndNotifyForegroundColor();
    }

    function stopColorPanelForegroundPolling() {
        isPollingActive = false;
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    function onColorPanelForegroundColorChange(callback) {
        if (typeof callback !== 'function') return function() {};

        foregroundColorChangeCallbacks.push(callback);

        if (lastKnownColor) {
            setTimeout(function() { callback(lastKnownColor); }, 0);
        }

        return function() {
            var index = foregroundColorChangeCallbacks.indexOf(callback);
            if (index !== -1) {
                foregroundColorChangeCallbacks.splice(index, 1);
            }
        };
    }

    window.getColorPanelForegroundColor = getColorPanelForegroundColor;
    window.startColorPanelForegroundPolling = startColorPanelForegroundPolling;
    window.stopColorPanelForegroundPolling = stopColorPanelForegroundPolling;
    window.onColorPanelForegroundColorChange = onColorPanelForegroundColorChange;
})();
