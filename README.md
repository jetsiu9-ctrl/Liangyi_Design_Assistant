# Liangyi Design Assistant / 凉意设计助手

凉意设计助手是一个面向 Adobe Photoshop 的 UXP 插件，集合了设计交付中常用的图层导出、按钮生成、批量重命名、文档优化、字体管理、翻译、参考线、颜色面板、AI 图像生成与图像反推等工具。

Liangyi Design Assistant is an Adobe Photoshop UXP plugin that brings together common production tools for layer export, button generation, batch renaming, document cleanup, font management, translation, guide creation, color handling, AI image generation, and image-to-prompt analysis.

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
| 图像反推：通过 OpenAI 或 Gemini 接口分析当前 Photoshop 画布，使用反推/编辑预设生成可复制的结构化文本结果。 | Image Reverse: analyzes the current Photoshop canvas through OpenAI or Gemini and produces copyable structured text with reverse/edit presets. |

## 环境要求 / Requirements

中文：

- Adobe Photoshop，manifest 中目标宿主为 `PS`，最低版本为 `25.0`。
- Adobe UXP Developer Tool，用于本地加载和调试插件。
- Photoshop 需要先启动并连接到 UXP Developer Tool。
- 如需使用网络功能，需要允许插件访问网络；manifest 当前配置为 `network.domains: "all"`。
- 如需使用百度翻译、AI 图像生成或图像反推功能，需要自行准备对应服务的密钥或接口配置。

English:

- Adobe Photoshop. The manifest targets `PS` with a minimum version of `25.0`.
- Adobe UXP Developer Tool for local loading and debugging.
- Photoshop must be running and connected to UXP Developer Tool before loading the plugin.
- Network permission is required for online features. The current manifest uses `network.domains: "all"`.
- Baidu Translate, AI generation, and image reverse require your own service credentials or endpoint configuration.

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
- AI 图像生成需要先在连接设置中配置接口地址和密钥。在连接设置中点击“当前接口”展开接口列表，在列表中右键任意接口即可拉取模型、编辑或删除（按 Esc 或点击面板其他位置关闭菜单）；也可以使用两个模型下拉框顶部固定的“一键获取模型”拉取当前接口的模型。模型清单按接口分别保存，重载插件后不会丢失。生图模型按名称筛选（不区分大小写）：OpenAI 兼容仅显示同时包含 `gpt` 和 `image` 且不包含 `gemini` 的模型；Gemini 仅显示同时包含 `image` 和 `gemini`，或者包含 `banana` 的模型。图像反推仍使用名称不包含 `image` 的模型，并按是否包含 `gemini` 分别显示在 Gemini 和 OpenAI 兼容列表中。两个模块不再内置默认模型。
- 图像生成支持 OpenAI 兼容和 Gemini 两种接口类型。OpenAI 兼容模式可明确选择 `Generations` 或 `Edits`：前者支持文生图及中转站兼容的参考图生图，后者要求至少一张参考图；Gemini 统一使用 `generateContent`。
- 可在 AI 连接设置中选择生成图像保存目录；生成结果保留临时预览的同时，会额外保存一份永久副本。
- 生成结果导出到 Photoshop 时优先使用当前选区外接矩形，没有选区时使用整个画布；图像会等比完整容纳在目标矩形中，并按目标中心定位。
- AI 连接设置支持自定义任务超时时长；保存目录、接口和超时设置会保存在 `liangyi-ai-settings.json` 中。
- 图像反推支持 OpenAI/Gemini 请求格式、接口拉取模型、自定义模型，以及“反推 / 编辑 / 不使用预设”三种提示词模式。
- 图像生成与图像反推的“+”会优先抓取当前 Photoshop 选区的外接矩形，且不会取消源文档选区；没有选区时抓取整个画布。参考图不是必填项，可连续提交多个独立请求。
- 将图像粘贴到 Photoshop 作为参考图时，上传成功后会回到粘贴前的历史状态，从而移除临时粘贴图层并恢复原有选区，包括不规则、羽化和多块选区。
- 每个反推请求都会在状态区域实时显示已用时间和超时上限；文本结果可在插件内查看并复制。
- 同一次插件会话中的反推结果会按完成顺序保留，可使用上一条/下一条切换，并支持复制当前、删除当前和清空全部。

English:

- Use the icons on the left side of the main panel to switch between modules.
- In supported modules, hold `Ctrl` and click a feature icon to save the current setup to the Quick Access panel.
- Quick Export requires an export location. If source-path export is enabled, the plugin prefers the current document path.
- Select a text layer before using Button Generator.
- Select target layers and review the preview before running Batch Rename.
- Font Management uses the font list currently available to Photoshop.
- Baidu Translate requires saving your Baidu Translate APP ID and API KEY first.
- AI Image Generation requires an endpoint and API key in Connection Settings. Click the current endpoint in Connection Settings to open the list, then right-click any entry to pull models, edit, or delete it (press Escape or click elsewhere in the panel to dismiss the menu); the fixed `Fetch Models` action at the top of either model picker pulls models for the current entry. Model lists are stored per connection and survive a plugin reload. Names containing `image` (case-insensitive) are added to Image Generation, while all remaining names are added to Image Reverse. Each module then filters its picker by interface type: Gemini shows only model names containing `gemini`, while OpenAI-compatible mode shows all other models. Neither module includes built-in default models.
- Image Generation supports OpenAI-compatible and Gemini request types. OpenAI-compatible requests explicitly use either `Generations` or `Edits`: Generations supports text-only generation and relay-compatible reference-image generation, while Edits requires at least one reference image. Gemini uses `generateContent`.
- Choose an image output folder in the AI connection settings to keep a permanent copy while retaining the temporary preview workflow.
- When generated results are exported to Photoshop, the current selection bounds are preferred and the full canvas is used as fallback. Images are proportionally contained and centered inside that target rectangle.
- AI connection settings include a persistent task timeout. Output folder, endpoint, and timeout preferences are stored in `liangyi-ai-settings.json`.
- Image Reverse supports OpenAI/Gemini request formats, interface-provided models, custom models, and Reverse/Edit/No Preset prompt modes.
- The “+” tile in Image Generation and Image Reverse first captures the current Photoshop selection bounds without clearing the source selection, and falls back to the full canvas when no selection exists. References are optional, and multiple independent requests can run concurrently.
- When a pasted Photoshop layer is used as a reference, a successful upload returns the document to its exact pre-paste history state, removing the temporary pasted layer and restoring irregular, feathered, or multi-part selections.
- Each reverse request reports elapsed time and its timeout limit in the status area. Returned text can be reviewed and copied inside the plugin.
- Reverse results are retained in completion order for the current plugin session, with Previous/Next navigation plus Copy Current, Delete Current, and Clear All actions.

## 面板说明 / Panels

中文：

- `HaimatiPanel`：主功能面板，包含导出、按钮、重命名、优化、字体、翻译、参考线、AI 图像生成、图像反推和连接设置等模块。
- `QuickAccessPanel`：快捷操作面板，用于执行已保存的常用操作。
- `ColorPanel`：颜色面板，用于快速应用、保存、移除和交换颜色。

English:

- `HaimatiPanel`: the main panel containing export, button generation, rename, optimization, font, translation, guides, AI generation, image reverse, and connection settings.
- `QuickAccessPanel`: a quick-action panel for running saved workflows.
- `ColorPanel`: a color utility panel for applying, saving, removing, and swapping colors.

## 项目结构 / Project Structure

```text
Liangyi_Design_Assistant-1.0.5/
├─ manifest.json
├─ index.html
├─ main.js
└─ src/
   ├─ modules/
   │  ├─ aiAssistantModule.js
   │  ├─ imageReverseModule.js
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
   ├─ prompts/
   │  ├─ image-edit-preset.txt
   │  └─ image-reverse-preset.txt
   └─ styles/
      ├─ aiAssistant.css
      ├─ imageReverse.css
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

### 翻译或 AI 功能不可用 / Translation or AI features do not work

中文：

请确认网络权限、接口地址、密钥、模型名称和服务账号状态。百度翻译需要有效的 APP ID 与 API KEY。图像反推还需要选择与接口请求格式匹配的 OpenAI 或 Gemini 类型。

English:

Check network permission, endpoint URL, API key, model name, and service account status. Baidu Translate requires a valid APP ID and API KEY. Image Reverse also requires selecting the OpenAI or Gemini request format supported by the endpoint.

## 权限说明 / Permissions

中文：

manifest 当前声明了文档读写、图层读写、图层复制、本地文件系统、网络、剪贴板和插件通信权限。这些权限用于导出文件、保存配置、读取/修改图层、访问翻译或 AI 接口，以及复制图像反推文本结果。

English:

The current manifest declares permissions for document read/write, layer read/write, layer copy, local file system access, network access, clipboard access, and plugin communication. These permissions support file export, settings storage, layer operations, translation/AI requests, and copying Image Reverse results.

## 版本信息 / Version

中文：

- 插件 ID：`com.liangyi.designAssistant`
- manifest 版本号：`1.1.0`
- 当前目录名：`Liangyi_Design_Assistant-1.1.0`

English:

- Plugin ID: `com.liangyi.designAssistant`
- Manifest version: `1.1.0`
- Current folder name: `Liangyi_Design_Assistant-1.1.0`

## 许可 / License

中文：

本项目完全免费开源，可自由使用、学习、修改与分享。

English:

This project is completely free and open source. You may use, study, modify, and share it freely.
