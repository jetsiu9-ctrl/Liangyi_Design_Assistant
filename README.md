readme_bilingual_content = """# 凉意设计助理 (Liangyi Design Assistant) - Photoshop UXP Plugin

[简体中文](#简体中文) | [English](#english)

---

## 简体中文

`凉意设计助理` 是一款专为 Adobe Photoshop（v25.0 及以上版本）打造的高级 **UXP (Unified Extensibility Platform)** 插件。它旨在极大地提升视觉设计师和修图师的工作效率，集成了文档优化、资产导出、文本管理、多语翻译以及前沿的 AI 图像生成等全方位功能。

本插件采用模块化的清晰架构，包含三个独立且可协同工作的专用面板：主助理面板、快捷面板与颜色面板。

### 🚀 核心功能

根据 `manifest.json` 配置，插件由以下三个独立入口（面板）组成：

#### 1. 主面板：设计助理 (`HaimatiPanel`)
尺寸固定（400x800px）的多功能集成面板。侧边导航栏可无缝切换以下核心功能：

* **📤 快捷导出 (Quick Export)**
  * 支持快速导出 PNG（24-bit / 8-bit）及 JPEG 格式。
  * 可手动设定 JPEG 压缩质量（1-100）。
  * 自动追踪当前文档的保存路径，或自主浏览指定目标文件夹。
  * 具备“图层组/第一层级图层”自动批量分割导出模式（可过滤背景图层）。
* **🪄 生成按钮 (Button Generator)**
  * 自动计算选中文字图层的尺寸与位置。
  * 内置高精度 RGB / HEX 颜色选择器。
  * 支持自定义宽高边距（Offset）及圆角半径（Corner Radius），一键在文字下方生成完美的按钮形状。
* **✏️ 批量重命名 (Batch Rename)**
  * 批量更改选中的多个图层名称。
  * 支持添加数字编号/索引（前缀或后缀），自定义起始序号。
  * 逻辑清晰，自动按照图层自下而上的顺序进行智能编号。
* **📋 文档优化 (Document Optimization)**
  * 智能扫描并精确定位文档中的“空白图层”和“隐藏图层”。
  * 列表化展示，支持单选或一键全选清理，保持图层树纯净。
  * 针对智能对象（Smart Object）提供指定目标 DPI 强度的优化转换。
* **Aa 字体管理 (Font Management)**
  * 快速检索并过滤 Photoshop 内部已启用的所有字体系列。
  * 精确调整字号、字距（Tracking）、水平/垂直缩放等核心排版度量。
  * 支持对齐方式（左/中/右）及画布水平/垂直居中对齐、对象等比例缩放。
  * 支持“实时应用”样式切换，一键开启光学字距、消除锯齿等高级属性。
* **🌐 百度翻译 (Baidu Translation)**
  * 集成百度翻译开放 API，实现图层文本一键国际化。
  * 支持源语言自动检测，支持中、英、日、韩等多语种互译。
  * 具备“附文翻译”模式：不覆盖原有文字，自动在原图层下方生成带有翻译结果的新文本图层。
* **📏 参考线管理 (Guides Management)**
  * 实时自动获取当前文档的精确宽高像素。
  * 依据设定的垂直/水平间距（像素值）自动创建网格参考线，或一键清除全部参考线。
  * 支持基于现有参考线一键自动切片（Create Slices）。
* **🎨 图像生成 & ⚙️ 连接设置 (AI Assistant)**
  * **生成模式**：支持 文生图 (Text-to-Image) 和 图生图/图像编辑 (Image-to-Image)。
  * **AI 模型库**：支持 `gpt-image-2`（标准、全功能、2K、4K 模式）及 `gemini-3 Pro / 3.1 Flash` 预览模型。
  * **高级控制**：可精确调整画面宽高比（1:1, 3:4, 9:16, 16:9等电商/社交主流比例）、分辨率（1k, 2k, 4k）、图像质量（高/中/低）及单次生成张数。
  * **任务管理**：支持后台异步生成，内置成果预览网格、分页查看、选择性导出/全部导出及历史清除功能。
  * **连接管理**：可配置自定义 AI 终结点（默认：`https://ai.t8star.org`）与多组 API 密钥。

#### 2. 快捷面板 (`QuickAccessPanel`)
专为紧凑工作流设计的轻量级悬浮窗（最小可调至 80x100px）。
* 在主面板上通过 `Ctrl + 左键点击` 任意功能图标，即可将其“钉”至快捷面板。
* 允许用户在不占用主屏幕空间的情况下，随时调用高频核心功能。

#### 3. 颜色面板 (`ColorPanel`)
极简调色专栏（最小可调至 24x60px），自适应水平或垂直布局。
* 实时同步 Photoshop 当前的前景色。
* 提供自定义色彩预设网格，方便高频吸取与统一设计规范。

### 🛠️ 技术栈与架构

* **平台底座**：Adobe Photoshop UXP (Manifest V6)
* **前端界面**：HTML5, CSS3, Adobe Spectrum UXP 原生组件
* **逻辑模式**：模块化 JavaScript (CommonJS `require` 规范)

---

## English

`Liangyi Design Assistant` is a high-performance **UXP (Unified Extensibility Platform)** plugin tailored for Adobe Photoshop (v25.0 and above). Built to revolutionize the workflows of visual designers and photo retouchers, it consolidates document optimization, asset exporting, typography control, translation, and cutting-edge AI image generation into a unified workspace.

The plugin utilizes a decoupled modular architecture, delivering three dedicated panels that function seamlessly together.

### 🚀 Core Features

Configured via `manifest.json`, the plugin comprises three independent entry points (panels):

#### 1. Main Panel: Design Assistant (`HaimatiPanel`)
A feature-rich, integrated panel with a fixed size (400x800px). The sidebar navigation enables instant access to the following core modules:

* **📤 Quick Export**
  * Rapidly exports assets in PNG (24-bit / 8-bit) and JPEG formats.
  * Adjust JPEG compression quality manually on a scale of 1-100.
  * Automatically follows the current active document path or allows browsing to a custom directory.
  * Supports a batch-splitting mode to export top-level layers or groups separately (with background layer filtering).
* **🪄 Button Generator**
  * Automatically measures the bound and positioning of selected text layers.
  * Implements a built-in precise RGB / HEX color picker.
  * Generates beautifully configured shape layers directly beneath texts based on custom padding offsets and corner radiuses.
* **✏️ Batch Rename**
  * Renames multiple chosen layers simultaneously using automated patterns.
  * Appends sequential indices/serial numbers as either prefixes or suffixes, with customizable starting values.
  * Applies numbering intelligently from the bottom of the layer stack upwards.
* **📋 Document Optimization**
  * Intelligently scans the active document to detect "empty layers" and "hidden layers".
  * Lists redundant items for individual cleanup or one-click total purging.
  * Standardizes Smart Objects by automatically applying targeted DPI optimizations.
* **Aa Font Management**
  * Instantly retrieves and filters all active font families available within Photoshop.
  * Direct adjustments for font size, tracking, and horizontal/vertical scales.
  * Controls paragraph alignment (left/center/right), centers items onto the canvas coordinates, and manages uniform object scaling.
  * Supports "Live Preview" toggling, optical kerning, and anti-aliasing configurations.
* **🌐 Baidu Translation**
  * Integrates Baidu Translation Open API to provide instantaneous multilingual localization.
  * Supports automatic source language detection, translating between Chinese, English, Japanese, and Korean.
  * Features an "Append Translation" option that places translated text layers perfectly underneath the original text without overwriting it.
* **📏 Guides Management**
  * Captures live document width and height coordinates in precise pixels.
  * Generates layout grids automatically based on specified vertical/horizontal intervals (in pixels) or clears all guidelines at once.
  * Provides a shortcut to instantly generate Photoshop user slices directly from active guides.
* **🎨 AI Image Generation & ⚙️ Connection Settings**
  * **Modes**: Supports Text-to-Image (Prompting) and Image-to-Image (Image editing).
  * **Model Support**: Fully compatible with `gpt-image-2` (Standard, Full, 2K, 4K modes) and `gemini-3 Pro / 3.1 Flash` preview engines.
  * **Granular Controls**: Configure custom aspect ratios (1:1, 3:4, 9:16, 16:9 for e-commerce/social formats), resolutions (1k, 2k, 4k), generation quality, and batch count.
  * **Task Pipeline**: Background asynchronous operations with an interactive preview grid, pagination, partial/full exports, and history deletion.
  * **Credentials Management**: Supports multiple custom AI endpoints (Default: `https://ai.t8star.org`) and unique API key profiles.

#### 2. Quick Access Panel (`QuickAccessPanel`)
A lightweight floating panel designed to save screen space (adjustable down to 80x100px).
* Use `Ctrl + Left Click` on any feature icon in the Main Panel to pin it directly to the Quick Access grid.
* Execute repetitive tasks quickly without needing the bulky Main UI visible.

#### 3. Color Panel (`ColorPanel`)
An ultra-slim color tracking workspace (adjustable down to 24x60px) supporting vertical or horizontal adaptive layouts.
* Automatically mirrors Photoshop's active foreground color.
* Displays a grid of user-saved color presets for maintaining strict design systems.

### 🛠️ Tech Stack & Architecture

* **Platform Baseline**: Adobe Photoshop UXP (Manifest V6)
* **Frontend Interface**: HTML5, CSS3, Native Adobe Spectrum UXP Web Components
* **Execution Logic**: Modular JavaScript utilizing CommonJS `require` structures

---

## 💻 插件安装与调试 / Installation & Debugging

### Prerequisites / 前提条件
* **Adobe Photoshop 2024** or higher (v25.0+)
* **Adobe UXP Developer Tool (UDT)** installed via Creative Cloud.

### Setup Steps / Steps
1. Open **Adobe UXP Developer Tool (UDT)**.
2. Click **"Add Plugin..."** and select the directory containing this project's `manifest.json`.
3. Locate `凉意设计助理` in the UDT list and click **"Load"**. The three design panels will instantly load into Photoshop.
4. Enable **"Watch"** or click **"Reload"** in UDT to see code modifications update live.
   
1. 打开 **Adobe UXP Developer Tool (UDT)**。
2. 点击 **"Add Plugin..."** 按钮，选择包含本插件 `manifest.json` 的项目根目录。
3. 在 UDT 列表中找到 `凉意设计助理` 并点击 **"Load"**。此时插件对应的三大面板将立即载入 Photoshop。
4. 在开发过程中可以开启 **"Watch"** 或手动点击 **"Reload"** 即可实现代码修改实时刷新。

---

## 🔒 权限声明 / Permissions

To function correctly across advanced pipelines, the plugin declares the following explicit system scopes inside `manifest.json`:
为保证各项高阶自动化工作流正常运行，插件在 `manifest.json` 中声明了以下明确的系统权限：

* `localFileSystem: "fullAccess"`: Used to write and export segmented assets directly to your local file directories. (用于将切片与各类资产直接导出至本地磁盘目录。)
* `network.domains: "all"`: Required to communicate with the Baidu Translation API and remote AI nodes (e.g., `ai.t8star.org`). (用于与百度翻译开放接口及远程 AI 图像引擎进行网络通信。)
* `ipc.enablePluginCommunication: true`: Allows the Main Panel and Quick Access Panel to securely pass runtime metadata to each other. (允许主面板与快捷面板跨边界进行实时数据共享与状态同步。)
* `document / layer read & write permissions`: Crucial for deep introspection and structure manipulations of the Photoshop document layer hierarchy. (深度遍历、修改及重组 Photoshop 文档图层树所需的读写权限。)
"""

with open("README-v2.md", "w", encoding="utf-8") as f:
    f.write(readme_bilingual_content)

print("Bilingual README-v2.md successfully generated without Japanese.")
