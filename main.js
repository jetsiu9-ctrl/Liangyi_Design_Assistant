/**
 * 凉意设计助理 - Photoshop UXP 插件入口
 * 统一入口文件，支持多面板
 */

const { entrypoints } = require("uxp");

// 动态加载 CSS
function loadCSS(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

// 动态加载 JS
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// 主面板 HTML 模板
function getMainPanelHTML() {
    return `
        <div id="app">
            <!-- 左侧功能图标区域 -->
            <div id="sidebar">
                <div class="nav-icons">
                    <div class="nav-icon active" data-panel="home" title="全部功能">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
                        </svg>
                    </div>
                    <div class="nav-icon" data-panel="export" title="快捷导出 (Ctrl+点击创建快捷方式)">
                        <span class="nav-icon-text">📤</span>
                    </div>
                    <div class="nav-icon" data-panel="button" title="生成按钮 (Ctrl+点击创建快捷方式)">
                        <span class="nav-icon-text">🎨</span>
                    </div>
                    <div class="nav-icon" data-panel="rename" title="批量重命名 (Ctrl+点击创建快捷方式)">
                        <span class="nav-icon-text">✏️</span>
                    </div>
                    <div class="nav-icon" data-panel="optimize" title="文档优化 (Ctrl+点击创建快捷方式)">
                        <span class="nav-icon-text">📋</span>
                    </div>
                    <div class="nav-icon" data-panel="font" title="字体管理 (Ctrl+点击创建快捷方式)">
                        <span class="nav-icon-text font-icon">Aa</span>
                    </div>
                    <div class="nav-icon" data-panel="translate" title="百度翻译">
                        <span class="nav-icon-text">🌐</span>
                    </div>
                    <div class="nav-icon" data-panel="guides" title="参考线 (Ctrl+点击创建快捷方式)">
                        <span class="nav-icon-text">📏</span>
                    </div>
                </div>
            </div>

            <!-- 右侧参数面板区域 -->
            <div id="mainContent">
                <!-- 全部功能面板 -->
                <div id="homePanel" class="panel-content active">
                    <h3 class="panel-title">全部功能</h3>
                    <div class="home-features">
                        <div class="feature-item" data-goto="export">
                            <div class="feature-icon">
                                <span class="feature-icon-text">📤</span>
                            </div>
                            <div class="feature-info">
                                <span class="feature-name">快捷导出</span>
                                <span class="feature-desc">快速导出图层/画布为图片</span>
                            </div>
                        </div>
                        <div class="feature-item" data-goto="button">
                            <div class="feature-icon">
                                <span class="feature-icon-text">🎨</span>
                            </div>
                            <div class="feature-info">
                                <span class="feature-name">生成按钮</span>
                                <span class="feature-desc">生成圆角按钮图层</span>
                            </div>
                        </div>
                        <div class="feature-item" data-goto="rename">
                            <div class="feature-icon">
                                <span class="feature-icon-text">✏️</span>
                            </div>
                            <div class="feature-info">
                                <span class="feature-name">批量重命名</span>
                                <span class="feature-desc">批量重命名选中的图层</span>
                            </div>
                        </div>
                        <div class="feature-item" data-goto="optimize">
                            <div class="feature-icon">
                                <span class="feature-icon-text">📋</span>
                            </div>
                            <div class="feature-info">
                                <span class="feature-name">文档优化</span>
                                <span class="feature-desc">智能对象、删除图层</span>
                            </div>
                        </div>
                        <div class="feature-item" data-goto="font">
                            <div class="feature-icon">
                                <span class="feature-icon-text font-icon">Aa</span>
                            </div>
                            <div class="feature-info">
                                <span class="feature-name">字体管理</span>
                                <span class="feature-desc">按字体家族快速切换文字图层字体</span>
                            </div>
                        </div>
                        <div class="feature-item" data-goto="translate">
                            <div class="feature-icon">
                                <span class="feature-icon-text">🌐</span>
                            </div>
                            <div class="feature-info">
                                <span class="feature-name">百度翻译</span>
                                <span class="feature-desc">翻译并替换选中的文字图层</span>
                            </div>
                        </div>
                        <div class="feature-item" data-goto="guides">
                            <div class="feature-icon">
                                <span class="feature-icon-text">📏</span>
                            </div>
                            <div class="feature-info">
                                <span class="feature-name">参考线</span>
                                <span class="feature-desc">按间隔生成/清除文档参考线</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 快捷导出面板 -->
                <div id="exportPanel" class="panel-content">
                    <h3 class="panel-title">快捷导出</h3>

                    <!-- 导出格式 -->
                    <div class="param-group">
                        <label class="param-label">导出格式</label>
                        <div class="format-selector">
                            <sp-radio-group id="exportFormat" selected="PNG">
                                <sp-radio value="PNG">PNG</sp-radio>
                                <sp-radio value="JPEG" style="margin-left: 20px;">JPEG</sp-radio>
                            </sp-radio-group>
                        </div>
                    </div>

                    <!-- PNG 位深 -->
                    <div id="pngBitDepthGroup" class="param-group">
                        <label class="param-label">PNG 位深</label>
                        <div class="format-selector">
                            <sp-radio-group id="pngBitDepth" selected="24">
                                <sp-radio value="24">PNG-24</sp-radio>
                                <sp-radio value="8" style="margin-left: 20px;">PNG-8</sp-radio>
                            </sp-radio-group>
                        </div>
                    </div>

                    <!-- JPEG 压缩质量 -->
                    <div id="jpegQualityGroup" class="param-group" style="display: none;">
                        <label class="param-label">JPEG 压缩质量</label>
                        <input type="number" id="jpegQuality" class="uxp-input-number" min="1" max="100" value="100">
                    </div>

                    <!-- 导出位置 -->
                    <div class="param-group">
                        <label class="param-label">导出位置</label>
                        <div class="location-control">
                            <sp-textfield id="exportPath" placeholder="点击选择导出位置..." readonly></sp-textfield>
                            <div id="selectPathBtn" class="btn-secondary" role="button" tabindex="0">选择</div>
                        </div>
                    </div>

                    <!-- 使用源文件路径 -->
                    <div class="param-group">
                        <label class="param-label">使用源文件路径</label>
                        <sp-switch id="useSourcePathSwitch"></sp-switch>
                    </div>

                    <!-- 源文件子文件夹名称 -->
                    <div id="sourceFolderNameGroup" class="param-group">
                        <sp-label class="param-label">子文件夹名称</sp-label>
                        <sp-textfield id="sourceFolderName" placeholder="输入子文件夹名称..."></sp-textfield>
                    </div>

                    <!-- 批量导出开关 -->
                    <div class="param-group">
                        <label class="param-label">批量导出</label>
                        <sp-switch id="batchExportSwitch"></sp-switch>
                    </div>

                    <!-- 批量导出选项 -->
                    <div id="batchOptions" class="param-group" style="display: none;">
                        <label class="param-label">导出一级图层</label>
                        <div class="batch-info">
                            <p class="info-text">导出活动画布的所有一级图层，默认排除"背景"图层。</p>
                        </div>
                    </div>

                    <!-- 导出按钮 -->
                    <div class="action-buttons">
                        <div id="exportBtn" class="quick-btn" role="button" tabindex="0">
                            <span>导出</span>
                        </div>
                    </div>
                </div>

                <!-- 按钮生成面板 -->
                <div id="buttonPanel" class="panel-content">
                    <h3 class="panel-title">生成按钮</h3>

                    <!-- 按钮颜色 -->
                    <div class="font-color-picker-panel button-color-picker-panel">
                        <div class="font-color-picker-top">
                            <div id="buttonColorField" class="font-color-field" role="slider" tabindex="0" aria-label="按钮颜色选区">
                                <div id="buttonColorFieldThumb" class="font-color-field-thumb"></div>
                            </div>
                            <div class="font-color-side-column">
                                <div id="buttonHueSlider" class="font-hue-slider" role="slider" tabindex="0" aria-label="按钮颜色色相" style="margin-right: 0px;">
                                    <div class="font-hue-gradient"></div>
                                    <div id="buttonHueThumb" class="font-hue-thumb"></div>
                                </div>
                                <div class="font-color-preview-stack">
                                    <div id="buttonColorPreview" class="color-preview-swatch font-color-preview-swatch"></div>
                                </div>
                            </div>
                        </div>
                        <div class="font-color-input-grid">
                            <label class="font-color-input-item">
                                <span>R</span>
                                <sp-textfield id="buttonColorR" inputmode="numeric"></sp-textfield>
                            </label>
                            <label class="font-color-input-item">
                                <span>G</span>
                                <sp-textfield id="buttonColorG" inputmode="numeric"></sp-textfield>
                            </label>
                            <label class="font-color-input-item">
                                <span>B</span>
                                <sp-textfield id="buttonColorB" inputmode="numeric"></sp-textfield>
                            </label>
                            <label class="font-color-input-item font-color-hex-item">
                                <span>#</span>
                                <sp-textfield id="buttonColorHex"></sp-textfield>
                            </label>
                        </div>
                    </div>

                    <!-- 偏移和圆角 -->
                    <div class="offset-row">
                        <div class="offset-item">
                            <label>宽度</label>
                            <input type="number" id="widthOffset" class="uxp-input-number" min="-100" max="200" value="0">
                        </div>
                        <div class="offset-item">
                            <label>高度</label>
                            <input type="number" id="heightOffset" class="uxp-input-number" min="-100" max="200" value="0">
                        </div>
                        <div class="offset-item">
                            <label>圆角</label>
                            <input type="number" id="cornerRadius" class="uxp-input-number" min="0" max="100" value="0">
                        </div>
                    </div>

                    <!-- 提示信息 -->
                    <div class="param-group">
                        <p class="info-text">请先选中文字图层，然后点击生成按钮</p>
                    </div>

                    <!-- 生成按钮 -->
                    <div class="action-buttons">
                        <div id="generateBtn" class="quick-btn btn-generate" role="button" tabindex="0">
                            <span>生成按钮</span>
                        </div>
                    </div>
                </div>

                <!-- 批量重命名面板 -->
                <div id="renamePanel" class="panel-content">
                    <h3 class="panel-title">批量重命名</h3>

                    <!-- 名称设置 -->
                    <div class="param-group">
                        <label class="param-label">名称</label>
                        <sp-textfield id="renameBaseName" placeholder="输入重命名名称..."></sp-textfield>
                    </div>

                    <!-- 序号选项 -->
                    <div id="sequenceOptions" class="param-group">
                        <div class="sequence-position">
                            <sp-radio-group id="namingPosition" selected="prefix">
                                <sp-radio value="prefix">序号在前</sp-radio>
                                <sp-radio value="suffix" style="margin-left: 20px;">序号在后</sp-radio>
                            </sp-radio-group>
                        </div>
                        <div class="sequence-start">
                            <label class="param-label">起始序号</label>
                            <input type="number" id="sequenceStart" class="uxp-input-number" min="0" max="9999" value="1">
                        </div>
                        <p class="info-text">排序从下往上，从起始序号开始编号</p>
                    </div>

                    <!-- 预览 -->
                    <div class="param-group">
                        <label class="param-label">预览</label>
                        <div id="renamePreview" class="rename-preview">
                            <p class="info-text">请在 Photoshop 中选中图层后查看预览</p>
                        </div>
                    </div>

                    <!-- 重命名按钮 -->
                    <div class="action-buttons">
                        <div id="renameBtn" class="quick-btn" role="button" tabindex="0">
                            <span>重命名选中图层</span>
                        </div>
                    </div>
                </div>

                <!-- 文档优化面板 -->
                <div id="optimizePanel" class="panel-content">
                    <h3 class="panel-title">文档优化</h3>

                    <div class="param-group optimize-smartobject-group">
                        <label class="checkbox-label optimize-inline-label">
                            <input type="checkbox" id="enableSmartObject">
                            <span class="checkbox-text">智能对象</span>
                        </label>
                        <div id="smartobjectDpiWrap" class="optimize-dpi-wrap" hidden>
                            <label class="param-label" for="smartobjectDpi">目标分辨率 (DPI)</label>
                            <input type="number" id="smartobjectDpi" class="uxp-input-number" min="1" max="9999" value="72">
                        </div>
                    </div>

                    <div class="param-group">
                        <div class="checkbox-group optimize-checkboxes">
                            <label class="checkbox-label optimize-inline-label">
                                <input type="checkbox" id="deleteEmptyLayers" checked>
                                <span class="checkbox-text">删除空白图层</span>
                            </label>
                            <label class="checkbox-label optimize-inline-label">
                                <input type="checkbox" id="deleteHiddenLayers" checked>
                                <span class="checkbox-text">删除隐藏图层</span>
                            </label>
                        </div>
                    </div>

                    <div class="param-group">
                        <label class="param-label">
                            扫描结果
                            <span id="selectAllBtn" class="inline-btn">全选</span>
                            <span id="deselectAllBtn" class="inline-btn">取消全选</span>
                        </label>
                        <div id="optimizeResult" class="result-list selectable">
                            <p class="info-text">点击\"扫描\"获取待处理内容</p>
                        </div>
                    </div>

                    <div class="action-buttons">
                        <div id="scanBtn" class="quick-btn" role="button" tabindex="0">
                            <span>扫描</span>
                        </div>
                        <div id="optimizeBtn" class="quick-btn" role="button" tabindex="0">
                            <span>优化文档</span>
                        </div>
                    </div>
                </div>

                <!-- 字体管理面板 -->
                <div id="fontPanel" class="panel-content">
                    <h3 class="panel-title">字体管理</h3>

                    <div class="param-group">
                        <label class="param-label">搜索字体家族</label>
                        <sp-textfield id="fontSearch" placeholder="输入字体名称筛选..."></sp-textfield>
                    </div>

                    <div class="param-group">
                        <label class="param-label">字体家族</label>
                        <sp-picker id="fontFamily" placeholder="选择字体家族...">
                            <sp-menu slot="options" id="fontFamilyOptions"></sp-menu>
                        </sp-picker>
                    </div>

                    <div class="param-group">
                        <label class="param-label">字重 / 样式</label>
                        <div id="fontStyleButtons" class="font-style-buttons"></div>
                    </div>

                    <div class="param-group">
                        <label class="param-label">当前选择</label>
                        <div id="fontSelectionInfo" class="font-selection-info">
                            <p class="info-text">请选择字体家族和字重样式</p>
                        </div>
                    </div>

                    <div class="param-group">
                        <label class="param-label">字号</label>
                        <sp-textfield id="fontSizeInput" placeholder="输入字号" type="number"></sp-textfield>
                    </div>

                    <div class="param-group">
                        <label class="param-label">文本对齐</label>
                        <div class="align-buttons">
                            <button id="alignLeftBtn" class="align-btn">左</button>
                            <button id="alignCenterBtn" class="align-btn">中</button>
                            <button id="alignRightBtn" class="align-btn">右</button>
                        </div>
                    </div>

                    <div class="param-group">
                        <label class="param-label">图层居中</label>
                        <div class="align-buttons">
                            <button id="alignHCenterBtn" class="align-btn">水平居中</button>
                            <button id="alignVCenterBtn" class="align-btn">垂直居中</button>
                        </div>
                    </div>

                    <div class="param-group">
                        <p class="info-text">将应用到当前选中的文字图层。系统字体来源于 Photoshop 当前可用字体集合。</p>
                    </div>

                    <div class="action-buttons font-action-row">
                        <label class="font-realtime-toggle">
                            <span class="font-realtime-label">实时</span>
                            <sp-switch id="fontRealtimeSwitch" checked></sp-switch>
                        </label>
                        <div id="applyFontBtn" class="quick-btn" role="button" tabindex="0">
                            <span>应用到选中文字图层</span>
                        </div>
                    </div>

                    <div class="param-group">
                        <label class="param-label">字符样式</label>
                        <div class="font-advanced-options">
                            <sp-checkbox id="chk-optical-kerning" checked>
                                <sp-label>视觉</sp-label>
                            </sp-checkbox>
                            <sp-checkbox id="chk-smooth-antialias" checked>
                                <sp-label>平滑</sp-label>
                            </sp-checkbox>
                        </div>
                    </div>
                </div>

                <!-- 百度翻译面板 -->
                <div id="translatePanel" class="panel-content">
                    <h3 class="panel-title">百度翻译</h3>

                    <div class="param-group">
                        <p class="info-text">请填写百度翻译开放平台的 APP ID 和 API KEY，然后点击保存。</p>
                    </div>

                    <div class="param-group">
                        <label class="param-label">APP ID</label>
                        <sp-textfield id="baiduAppId" placeholder="输入百度翻译 APP ID"></sp-textfield>
                    </div>

                    <div class="param-group">
                        <label class="param-label">API KEY / 密钥</label>
                        <sp-textfield id="baiduSecretKey" type="password" placeholder="输入百度翻译 API KEY"></sp-textfield>
                        <div class="translate-config-actions">
                            <div id="saveTranslateConfigBtn" class="btn-secondary btn-sm" role="button" tabindex="0">保存配置</div>
                            <div id="clearTranslateConfigBtn" class="btn-secondary btn-sm danger-btn" role="button" tabindex="0">清除配置</div>
                        </div>
                    </div>

                    <div class="param-group translate-settings-group">
                        <label class="param-label">翻译语言</label>
                        <div class="translate-lang-row">
                            <sp-picker id="translateFrom" placeholder="源语言">
                                <sp-menu slot="options">
                                    <sp-menu-item value="auto" selected>自动检测</sp-menu-item>
                                    <sp-menu-item value="zh">中文</sp-menu-item>
                                    <sp-menu-item value="en">英语</sp-menu-item>
                                    <sp-menu-item value="jp">日语</sp-menu-item>
                                    <sp-menu-item value="kor">韩语</sp-menu-item>
                                </sp-menu>
                            </sp-picker>
                            <span class="translate-arrow">→</span>
                            <sp-picker id="translateTo" placeholder="目标语言">
                                <sp-menu slot="options">
                                    <sp-menu-item value="zh" selected>中文</sp-menu-item>
                                    <sp-menu-item value="en">英语</sp-menu-item>
                                    <sp-menu-item value="jp">日语</sp-menu-item>
                                    <sp-menu-item value="kor">韩语</sp-menu-item>
                                </sp-menu>
                            </sp-picker>
                        </div>
                    </div>

                    <div class="param-group">
                        <label class="param-label">附文翻译</label>
                        <sp-switch id="appendTranslationSwitch"></sp-switch>
                        <p class="info-text">启用后不替换原文字，会额外创建一个译文字体图层并放到原文本下方。</p>
                    </div>

                    <div class="param-group">
                        <p class="info-text">选择 Photoshop 文字图层后点击翻译。未启用附文翻译时替换原文字；启用后保留原文字并在下方创建译文图层。</p>
                    </div>

                    <div class="action-buttons translate-action-row">
                        <div id="translateSelectedTextBtn" class="quick-btn" role="button" tabindex="0">
                            <span>翻译选中文字</span>
                        </div>
                    </div>
                </div>

                <!-- 参考线面板 -->
                <div id="guidesPanel" class="panel-content">
                        <sp-heading size="S">参考线</sp-heading>

                        <div class="guides-panel-section">
                            <sp-label id="guides-doc-height">当前文档高度: -- px</sp-label>
                            <sp-label id="guides-doc-width">当前文档宽度: -- px</sp-label>
                        </div>

                        <div class="guides-panel-section guides-options-column">
                            <div class="guide-option-row">
                                <sp-switch id="guideVerticalSwitch"></sp-switch>
                                <sp-label>纵向距离</sp-label>
                                <div class="guide-input-wrap">
                                    <sp-textfield id="guideIntervalVertical" type="number" placeholder="0"></sp-textfield>
                                    <sp-label class="unit-label">px</sp-label>
                                </div>
                            </div>

                            <div class="guide-option-row">
                                <sp-switch id="guideHorizontalSwitch"></sp-switch>
                                <sp-label>横向距离</sp-label>
                                <div class="guide-input-wrap">
                                    <sp-textfield id="guideIntervalHorizontal" type="number" placeholder="0"></sp-textfield>
                                    <sp-label class="unit-label">px</sp-label>
                                </div>
                            </div>
                        </div>

                        <div class="action-buttons guides-action-buttons">
                            <sp-button id="generateGuidesBtn" variant="accent">生成</sp-button>
                            <sp-button id="clearGuidesBtn" variant="secondary" class="danger-btn">清除</sp-button>
                        </div>

                        <div class="guides-panel-section guides-slice-section">
                            <sp-label>切片工具</sp-label>
                            <sp-button id="btn-slice-from-guides" variant="primary">从参考线创建切片</sp-button>
                        </div>
                </div>
            </div>
        </div>
    `;
}

// 快捷面板 HTML 模板
function getQuickPanelHTML() {
    return `
        <div id="quickApp">
            <div id="quickGrid" class="quick-grid"></div>
            <div id="emptyState" class="empty-state">
                <p>暂无快捷操作</p>
                <p class="hint">在主面板中，Ctrl+点击图标创建快捷方式</p>
            </div>
        </div>
    `;
}

// 颜色面板 HTML 模板
function getColorPanelHTML() {
    return `
        <div id="colorPanelApp" class="color-panel-app">
            <div id="foregroundGrid"></div>
            <div class="divider"></div>
            <div id="manualGrid"></div>
        </div>
    `;
}

// 导出面板 HTML 模板
function getExportPanelHTML() {
    return `
        <div id="exportApp">
            <div class="export-header">
                <h3>批量导出设置</h3>
            </div>
            <div class="export-content">
                <div class="form-group">
                    <label>导出路径</label>
                    <sp-textfield id="exportPath" placeholder="选择导出文件夹..."></sp-textfield>
                    <div id="browsePath" class="btn-secondary btn-sm" role="button" tabindex="0">浏览...</div>
                </div>
                <div class="form-group">
                    <label>格式</label>
                    <sp-dropdown id="exportFormat">
                        <sp-menu-item value="PNG">PNG</sp-menu-item>
                        <sp-menu-item value="JPEG">JPEG</sp-menu-item>
                    </sp-dropdown>
                </div>
                <div class="form-group">
                    <label>JPEG 质量</label>
                    <input type="number" id="jpegQuality" class="uxp-input-number" min="1" max="100" value="100">
                </div>
            </div>
        </div>
    `;
}

// 注册入口点
entrypoints.setup({
    plugin: {
        create() {
            console.log('[Plugin] 创建钩子');
        },
        destroy() {
            console.log('[Plugin] 销毁钩子');
        }
    },

    panels: {
        // 主面板
        HaimatiPanel: {
            create(rootNode) {
                console.log('[HaimatiPanel] 创建面板');
                loadCSS('src/styles/main.css');
                loadCSS('src/styles/quick.css');
                rootNode.innerHTML = getMainPanelHTML();
                return Promise.all([
                    loadScript('src/modules/quickStorage.js'),
                    loadScript('src/modules/exportStorage.js'),
                    loadScript('src/modules/exportModule.js'),
                    loadScript('src/modules/buttonModule.js'),
                    loadScript('src/modules/renameModule.js'),
                    loadScript('src/modules/smartObjectModule.js'),
                    loadScript('src/modules/deleteLayerModule.js'),
                    loadScript('src/modules/fontModule.js'),
                    loadScript('src/modules/translateModule.js'),
                    loadScript('src/modules/guidesModule.js'),
                    loadScript('src/modules/panel.js')
                ]).then(() => {
                    if (typeof window.initPanel === 'function') {
                        window.initPanel(rootNode);
                        console.log('[HaimatiPanel] 初始化完成');
                    }
                });
            },
            show(rootNode) {
                console.log('[HaimatiPanel] 显示面板');
                if (typeof window.refreshPanel === 'function') {
                    window.refreshPanel();
                }
            },
            hide(rootNode) {
                console.log('[HaimatiPanel] 隐藏面板');
            },
            destroy(rootNode) {
                console.log('[HaimatiPanel] 销毁面板');
                if (typeof window.cleanupPanel === 'function') {
                    window.cleanupPanel();
                }
            }
        },

        // 快捷操作面板
        QuickAccessPanel: {
            create(rootNode) {
                console.log('[QuickAccessPanel] 创建面板');
                loadCSS('src/styles/quick.css');
                rootNode.innerHTML = getQuickPanelHTML();
                return Promise.all([
                    loadScript('src/modules/quickStorage.js'),
                    loadScript('src/modules/exportStorage.js'),
                    loadScript('src/modules/exportModule.js'),
                    loadScript('src/modules/buttonModule.js'),
                    loadScript('src/modules/renameModule.js'),
                    loadScript('src/modules/smartObjectModule.js'),
                    loadScript('src/modules/deleteLayerModule.js'),
                    loadScript('src/modules/translateModule.js'),
                    loadScript('src/modules/guidesModule.js')
                ]).then(() => loadScript('src/modules/quickPanel.js')).then(() => {
                    if (typeof window.initQuickPanel === 'function') {
                        window.initQuickPanel(rootNode);
                        console.log('[QuickAccessPanel] 初始化完成');
                    }
                });
            },
            show(rootNode) {
                console.log('[QuickAccessPanel] 显示面板');
                if (typeof window.refreshQuickPanel === 'function') {
                    window.refreshQuickPanel();
                }
            },
            hide(rootNode) {
                console.log('[QuickAccessPanel] 隐藏面板');
            },
            destroy(rootNode) {
                console.log('[QuickAccessPanel] 销毁面板');
                if (typeof window.cleanupQuickPanel === 'function') {
                    window.cleanupQuickPanel();
                }
            }
        },

        // 颜色面板
        ColorPanel: {
            create(rootNode) {
                console.log('[ColorPanel] 创建面板');
                loadCSS('src/styles/colorPanel.css');
                rootNode.innerHTML = getColorPanelHTML();
                return Promise.all([
                    loadScript('src/modules/colorStorage.js'),
                    loadScript('src/modules/colorButton.js'),
                    loadScript('src/modules/colorPanelRuntime.js'),
                    loadScript('src/modules/colorPanel.js')
                ]).then(() => {
                    if (typeof window.initColorPanel === 'function') {
                        window.initColorPanel(rootNode);
                        console.log('[ColorPanel] 初始化完成');
                    }
                });
            },
            show(rootNode) {
                console.log('[ColorPanel] 显示面板');
                if (typeof window.refreshColorPanel === 'function') {
                    window.refreshColorPanel();
                }
            },
            hide(rootNode) {
                console.log('[ColorPanel] 隐藏面板');
            },
            destroy(rootNode) {
                console.log('[ColorPanel] 销毁面板');
                if (typeof window.cleanupColorPanel === 'function') {
                    window.cleanupColorPanel();
                }
            }
        }
    }
});

console.log('[凉意设计助理] 入口点已注册');
