# Liangyi Design Assistant / 凉意设计助手

凉意设计助手是一个面向 Adobe Photoshop 的 UXP 插件，集合了设计交付中常用的图层导出、按钮生成、批量重命名、文档优化、字体管理、翻译、参考线、颜色面板与 AI 图像生成等工具。

Liangyi Design Assistant is an Adobe Photoshop UXP plugin that brings together common production tools for layer export, button generation, batch renaming, document cleanup, font management, translation, guide creation, color handling, and AI image generation.

## 功能概览 / Features

| 中文 | English |
| --- | --- |
| 快捷导出：支持 PNG/JPEG、PNG 位深、JPEG 质量、源文件路径和批量导出。 | Quick Export: supports PNG/JPEG, PNG bit depth, JPEG quality, source-folder export, and batch export. |
| 生成按钮：基于选中文字图层生成带颜色、尺寸偏移和圆角参数的按钮图层。 | Button Generator: creates button layers from selected text layers with color, offset, and corner-radius settings. |
| 批量重命名：按基础名称、序号位置和起始序号重命名选中图层。 | Batch Rename: renames selected layers with a base name, sequence position, and starting index. |
| 文档优化：扫描并处理智能对象、空白图层、隐藏图层等常见清理项。 | Document Optimization: scans and handles smart objects, empty layers, hidden layers, and other cleanup targets. |
| 字体管理：读取 Photoshop 可用字体，按字体家族和样式快速应用到文字图层。 | Font Management: reads available Photoshop fonts and applies family/style settings to selected text layers. |
| 百度翻译：配置百度翻译 APP ID 与 API KEY 后，翻译并替换或附加选中文字图层。 | Baidu Translate: translates selected text layers after configuring Baidu Translate APP ID and API KEY. |
| 参考线：按间隔生成纵向/横向参考线，清除参考线，并可基于参考线创建切片。 | Guides: creates vertical/horizontal guides by interval, clears guides, and can create slices from guides. |
| 快捷操作面板：在主面板中通过 Ctrl+点击功能图标创建常用操作快捷方式。 | Quick Access Panel: create reusable shortcuts from the main panel by Ctrl-clicking feature icons. |
| 颜色面板：管理前景色、手动颜色、图层填充/描边颜色以及颜色交换。 | Color Panel: manages foreground colors, manual swatches, layer fill/stroke colors, and color swapping. |
| AI 图像生成：配置接口后提交图像生成请求、预览结果、导出或置入 Photoshop 文档。 | AI Image Generation: submits generation requests after API configuration, previews results, exports them, or places them into Photoshop documents. |

## 环境要求 / Requirements

中文：

- Adobe Photoshop，manifest 中目标宿主为 `PS`，最低版本为 `25.0`。
- Adobe UXP Developer Tool，用于本地加载和调试插件。
- Photoshop 需要先启动并连接到 UXP Developer Tool。
- 如需使用网络功能，需要允许插件访问网络；manifest 当前配置为 `network.domains: "all"`。
- 如需使用百度翻译或 AI 生成功能，需要自行准备对应服务的密钥或接口配置。

English:

- Adobe Photoshop. The manifest targets `PS` with a minimum version of `25.0`.
- Adobe UXP Developer Tool for local loading and debugging.
- Photoshop must be running and connected to UXP Developer Tool before loading the plugin.
- Network permission is required for online features. The current manifest uses `network.domains: "all"`.
- Baidu Translate and AI generation require your own service credentials or endpoint configuration.

## 安装与加载 / Installation & Loading

中文：

正式使用：

1. 解压插件压缩包。
2. 将解压后的插件文件夹复制到 Photoshop 安装目录下的 `Plug-ins` 文件夹。
3. 本机示例路径：`C:\Program Files\Adobe\Adobe Photoshop (Beta)\Plug-ins`。
4. 启动或重启 Adobe Photoshop。
5. 在 Photoshop 的插件菜单中打开对应面板：设计助手、快捷操作或颜色面板。

开发调试：

1. 启动 Adobe Photoshop。
2. 启动 Adobe UXP Developer Tool。
3. 在 UXP Developer Tool 中点击 `Add Plugin`。
4. 选择本项目目录下的 `manifest.json`。
5. 确认左侧 `Connected Applications` 中能看到 Photoshop。
6. 点击 `Load` 加载插件。

English:

For normal use:

1. Extract the plugin package.
2. Copy the extracted plugin folder into Photoshop's `Plug-ins` folder.
3. Example local path: `C:\Program Files\Adobe\Adobe Photoshop (Beta)\Plug-ins`.
4. Launch or restart Adobe Photoshop.
5. Open the corresponding panel from the Photoshop plugin menu: Design Assistant, Quick Access, or Color Panel.

For development and debugging:

1. Launch Adobe Photoshop.
2. Launch Adobe UXP Developer Tool.
3. Click `Add Plugin` in UXP Developer Tool.
4. Select the `manifest.json` file in this project folder.
5. Make sure Photoshop appears under `Connected Applications`.
6. Click `Load` to load the plugin.

## 使用说明 / Usage

中文：

- 主面板左侧图标用于切换功能模块。
- 在支持快捷方式的模块中，按住 `Ctrl` 并点击左侧功能图标，可把当前配置保存到快捷操作面板。
- 快捷导出需要先选择导出位置；启用“使用源文件路径”后会优先使用当前文档所在路径。
- 生成按钮前，请先选中一个文字图层。
- 批量重命名前，请先选中需要处理的图层，并检查预览结果。
- 字体管理会使用 Photoshop 当前可用字体集合。
- 百度翻译需要先填写并保存百度翻译开放平台的 APP ID 与 API KEY。
- AI 图像生成需要先在连接设置中配置接口地址、密钥、模型等参数。

English:

- Use the icons on the left side of the main panel to switch between modules.
- In supported modules, hold `Ctrl` and click a feature icon to save the current setup to the Quick Access panel.
- Quick Export requires an export location. If source-path export is enabled, the plugin prefers the current document path.
- Select a text layer before using Button Generator.
- Select target layers and review the preview before running Batch Rename.
- Font Management uses the font list currently available to Photoshop.
- Baidu Translate requires saving your Baidu Translate APP ID and API KEY first.
- AI Image Generation requires endpoint, key, model, and related settings in the connection panel.

## 面板说明 / Panels

中文：

- `HaimatiPanel`：主功能面板，包含导出、按钮、重命名、优化、字体、翻译、参考线、AI 等模块。
- `QuickAccessPanel`：快捷操作面板，用于执行已保存的常用操作。
- `ColorPanel`：颜色面板，用于快速应用、保存、移除和交换颜色。

English:

- `HaimatiPanel`: the main panel containing export, button generation, rename, optimization, font, translation, guides, and AI modules.
- `QuickAccessPanel`: a quick-action panel for running saved workflows.
- `ColorPanel`: a color utility panel for applying, saving, removing, and swapping colors.

## 项目结构 / Project Structure

```text
Liangyi_Design_Assistant-1.0.4/
├─ manifest.json
├─ index.html
├─ main.js
└─ src/
   ├─ modules/
   │  ├─ aiAssistantModule.js
   │  ├─ buttonModule.js
   │  ├─ colorPanel.js
   │  ├─ colorPanelRuntime.js
   │  ├─ deleteLayerModule.js
   │  ├─ exportModule.js
   │  ├─ fontModule.js
   │  ├─ guidesModule.js
   │  ├─ panel.js
   │  ├─ quickPanel.js
   │  ├─ renameModule.js
   │  ├─ smartObjectModule.js
   │  └─ translateModule.js
   └─ styles/
      ├─ aiAssistant.css
      ├─ colorPanel.css
      ├─ main.css
      └─ quick.css
```

中文：

- `manifest.json` 定义插件 ID、宿主应用、面板入口和权限。
- `index.html` 是 UXP 插件入口页面。
- `main.js` 注册入口点并动态加载样式与模块。
- `src/modules` 存放各功能模块。
- `src/styles` 存放面板样式。

English:

- `manifest.json` defines the plugin ID, host app, panel entrypoints, and permissions.
- `index.html` is the UXP entry page.
- `main.js` registers entrypoints and dynamically loads styles/modules.
- `src/modules` contains feature modules.
- `src/styles` contains panel styles.

## 开发说明 / Development Notes

中文：

- 本项目是原生 UXP 插件源码目录，不需要额外构建步骤即可通过 UXP Developer Tool 加载。
- 修改源码后，可在 UXP Developer Tool 中点击 `Reload` 重新加载。
- 涉及 Photoshop 文档状态变更的操作应放在 `core.executeAsModal` 中执行。
- 文件访问应使用 `require("uxp").storage` 提供的 UXP Storage API。
- Photoshop 操作应使用 `require("photoshop")` 提供的 `app`、`core`、`action` 等 API。

English:

- This is a native UXP plugin source folder and can be loaded directly through UXP Developer Tool without an additional build step.
- After editing source files, click `Reload` in UXP Developer Tool.
- Operations that modify the Photoshop document state should run inside `core.executeAsModal`.
- File access should use the UXP Storage API from `require("uxp").storage`.
- Photoshop operations should use APIs from `require("photoshop")`, such as `app`, `core`, and `action`.

## 常见问题 / Troubleshooting

### Plugin Load Failed: No applications are connected to the service

中文：

这通常表示 UXP Developer Tool 没有连接到 Photoshop。请先启动 Photoshop，再启动或刷新 UXP Developer Tool，并确认 `Connected Applications` 中出现 Photoshop。

English:

This usually means UXP Developer Tool is not connected to Photoshop. Launch Photoshop first, then start or refresh UXP Developer Tool, and confirm that Photoshop appears under `Connected Applications`.

### 加载后找不到面板 / Panel does not appear after loading

中文：

请检查插件是否处于 `Loaded` 状态，然后在 Photoshop 的插件菜单中查找设计助手、快捷操作或颜色面板。必要时点击 `Reload`。

English:

Check that the plugin is marked as `Loaded`, then open the Design Assistant, Quick Access, or Color Panel from the Photoshop plugin menu. Click `Reload` if needed.

### 翻译或 AI 功能不可用 / Translation or AI generation does not work

中文：

请确认网络权限、接口地址、密钥和服务账号状态。百度翻译需要有效的 APP ID 与 API KEY。

English:

Check network permission, endpoint URL, API key, and service account status. Baidu Translate requires a valid APP ID and API KEY.

## 权限说明 / Permissions

中文：

manifest 当前声明了文档读写、图层读写、图层复制、本地文件系统、网络和插件通信权限。这些权限用于导出文件、保存配置、读取/修改图层、访问翻译或 AI 接口。

English:

The current manifest declares permissions for document read/write, layer read/write, layer copy, local file system access, network access, and plugin communication. These permissions support file export, settings storage, layer operations, and translation/AI requests.

## 版本信息 / Version

中文：

- 插件 ID：`com.liangyi.designAssistant`
- manifest 版本号：`1.0.4`
- 当前目录名：`Liangyi_Design_Assistant-1.0.4`

English:

- Plugin ID: `com.liangyi.designAssistant`
- Manifest version: `1.0.4`
- Current folder name: `Liangyi_Design_Assistant-1.0.4`

## 许可 / License

中文：

本项目完全免费开源，可自由使用、学习、修改与分享。

English:

This project is completely free and open source. You may use, study, modify, and share it freely.
