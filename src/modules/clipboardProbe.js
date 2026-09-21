(function() {
"use strict";

// Temporary host probe. No clipboard writes, network requests or edits to existing documents.
let hovered = null;
let listening = false;
const probeStates = [];

function isEditable(node) {
  while (node && node !== document) {
    const tag = String(node.tagName || node.nodeName || "").toLowerCase();
    if (["input", "textarea", "sp-textfield", "sp-textarea"].includes(tag) ||
        node.isContentEditable || (node.getAttribute && node.getAttribute("contenteditable") === "true")) {
      return true;
    }
    node = node.parentNode;
  }
  return false;
}

function visible(node) {
  while (node && node !== document) {
    if (typeof getComputedStyle === "function" && getComputedStyle(node).display === "none") return false;
    if (node.hidden || (node.classList && node.classList.contains("is-hidden")) ||
        (node.style && node.style.display === "none")) return false;
    node = node.parentNode;
  }
  return true;
}

function describe(value) {
  if (value == null) return String(value);
  if (typeof value === "string") return "字符串（" + value.length + " 字符）";
  if (value.byteLength !== undefined) return "二进制（" + value.byteLength + " 字节）";
  if (value.size !== undefined) return "Blob（" + value.size + " 字节）";
  return Object.prototype.toString.call(value);
}

async function readProbe(clipboard, report, preview) {
  if (!clipboard) {
    report("当前宿主未提供 navigator.clipboard。");
    return;
  }
  const methods = ["read", "getContent"].filter(name => typeof clipboard[name] === "function");
  report("可用读取接口：" + (methods.join("、") || "无"));
  let foundImage = false;
  async function inspect(type, value) {
    report(type + "：" + describe(value));
    if (foundImage || !/^image\/(png|jpeg|jpg|webp|gif|bmp)$/i.test(type)) return;
    let blob;
    if (value instanceof Blob) {
      blob = value;
    } else if (value && typeof value.arrayBuffer === "function") {
      blob = new Blob([await value.arrayBuffer()], { type });
    } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      blob = new Blob([value], { type });
    } else if (typeof value === "string" && /^data:image\/[^;]+;base64,/i.test(value)) {
      const binary = atob(value.slice(value.indexOf(",") + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type });
    }
    if (blob && blob.size) {
      preview(blob);
      foundImage = true;
      report("已读取图像，正在验证预览解码。");
    }
  }
  for (const method of methods) {
    try {
      const content = await clipboard[method]();
      report(method + " 返回：" + describe(content));
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item && item.types && typeof item.getType === "function") {
            for (const type of Array.from(item.types)) {
              try { await inspect(type, await item.getType(type)); }
              catch (error) { report(type + " 读取失败：" + error.message); }
            }
          } else if (item && typeof item === "object") {
            for (const type of Object.keys(item)) await inspect(type, item[type]);
          }
        }
      } else if (content && typeof content === "object") {
        for (const type of Object.keys(content)) await inspect(type, content[type]);
      }
    } catch (error) {
      report(method + " 失败：" + error.message);
    }
  }
  if (!foundImage) report("未获得可直接预览的图像。请保留以上格式结果；文件复制是否可用仍需据此判断。");
}

let photoshopProbeBusy = false;

function probeError(error) {
  if (error && error.message) return String(error.message);
  if (typeof error === "string") return error;
  try { return JSON.stringify(error) || String(error); }
  catch (_) { return String(error); }
}

async function readPhotoshopProbe(report, preview) {
  if (photoshopProbeBusy) {
    report("另一个面板正在进行 Photoshop 粘贴检测，请稍后再试。");
    return;
  }
  photoshopProbeBusy = true;
  let file = null;
  let stage = "初始化";
  let exported = false;
  function step(message) { stage = message; report(message + "…"); }
  try {
    const { app, core, constants, action } = require("photoshop");
    const { storage } = require("uxp");
    report("检测版本：PS-Paste-4；Photoshop " + (app.version || "未知"));
    step("1/7 准备临时文件");
    const folder = await storage.localFileSystem.getTemporaryFolder();
    file = await folder.createFile("liangyi-clipboard-probe-" + Date.now() + ".png", { overwrite: false });
    await core.executeAsModal(async context => {
      const original = app.documents.length ? app.activeDocument : null;
      let temporary = null;
      let temporaryId = null;
      let registered = false;
      try {
        step("2/7 创建临时文档");
        const created = await app.documents.add({
          name: "凉意剪贴板检测（临时）", width: 64, height: 64,
          resolution: 72, mode: "RGBColorMode", fill: "transparent", depth: 8
        });
        if (!created || !Number.isFinite(created.id) || (original && created.id === original.id)) {
          throw new Error("创建操作未返回有效的新文档 ID，已停止，未执行粘贴。");
        }
        temporary = created;
        temporaryId = created.id;
        report("临时文档 ID：" + temporaryId);
        if (context.hostControl && context.hostControl.registerAutoCloseDocument && context.hostControl.unregisterAutoCloseDocument) {
          await context.hostControl.registerAutoCloseDocument(temporaryId);
          registered = true;
        }
        app.activeDocument = temporary;
        if (!app.activeDocument || app.activeDocument.id !== temporaryId) throw new Error("临时文档未激活，已停止粘贴。");
        const previousLayerIds = new Set(Array.from(temporary.layers, layer => layer.id));
        step("3/7 执行 Photoshop 原生粘贴命令");
        const result = await action.batchPlay([{
          _obj: "paste", _options: { dialogOptions: "silent" }
        }], {});
        const response = result && result[0];
        if (!response || response._obj === "error" || (typeof response.result === "number" && response.result < 0)) {
          throw new Error(response ? probeError(response) : "原生粘贴命令未返回结果。");
        }
        report("原生粘贴命令已完成。");
        const pastedLayers = Array.from(temporary.layers).filter(layer => !previousLayerIds.has(layer.id));
        if (!pastedLayers.length) throw new Error("命令返回成功，但没有新增图层；不能将临时画布当成截图。");
        function pixels(value) {
          return typeof value === "number" ? value : Number(value && (value._value !== undefined ? value._value : value.value));
        }
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        stage = "3/7 查询新增图层的原生边界";
        for (const layer of pastedLayers) {
          const layerId = layer.id;
          if (!Number.isFinite(layerId)) throw new Error("新增图层 ID 无效。");
          const replies = await action.batchPlay([{
            _obj: "get",
            _target: [
              { _property: "boundsNoEffects" },
              { _ref: "layer", _id: layerId },
              { _ref: "document", _id: temporaryId }
            ],
            _options: { dialogOptions: "silent" }
          }], {});
          const reply = replies && replies[0];
          if (!reply || reply._obj === "error") throw new Error("原生边界查询失败：" + probeError(reply));
          const bounds = reply.boundsNoEffects;
          report("图层 ID：" + layerId + "；原生边界：" + JSON.stringify(bounds || null));
          if (!bounds) throw new Error("Photoshop 未返回原生图层边界。");
          const edges = [bounds.left, bounds.top, bounds.right, bounds.bottom].map(pixels);
          if (!edges.every(Number.isFinite)) throw new Error("粘贴图层边界无效。");
          left = Math.min(left, edges[0]); top = Math.min(top, edges[1]);
          right = Math.max(right, edges[2]); bottom = Math.max(bottom, edges[3]);
        }
        const pastedWidth = Math.ceil(right) - Math.floor(left);
        const pastedHeight = Math.ceil(bottom) - Math.floor(top);
        if (!(pastedWidth > 0 && pastedHeight > 0)) throw new Error("Photoshop 原生查询确认新增图层边界为空；本次未取得截图像素，已停止导出。");
        report("新增图层：" + pastedLayers.length + "；粘贴内容尺寸：" + pastedWidth + " × " + pastedHeight + " 像素。");
        step("4/7 展开并裁切图像");
        await temporary.revealAll();
        await temporary.trim(constants.TrimType.TRANSPARENT);
        const width = temporary.width;
        const height = temporary.height;
        if (!(width > 0 && height > 0)) throw new Error("未获得有效的图像尺寸。");
        report("展开后的画布尺寸：" + width + " × " + height + " 像素。");
        if (width < pastedWidth || height < pastedHeight) {
          throw new Error("展开后的画布小于粘贴内容，存在裁切风险，已停止导出。");
        }
        if (width === 64 && height === 64) report("注意：仍为 64×64，请确认预览确实是复制的图片，并用大于 64×64 的截图复测。");
        step("5/7 缩小检测预览");
        const scale = Math.min(1, 512 / Math.max(width, height));
        if (scale < 1) await temporary.resizeImage(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
        step("6/7 导出 PNG 预览");
        await temporary.saveAs.png(file, {}, true);
        exported = true;
      } finally {
        try {
          if (temporary && temporaryId !== null) {
            await temporary.close(constants.SaveOptions.DONOTSAVECHANGES);
            // Keep the ID captured while the document was open; do not read a closed document.
            if (registered) await context.hostControl.unregisterAutoCloseDocument(temporaryId);
            report("临时检测文档已关闭。");
          }
        } catch (error) {
          report("临时文档清理未完成：" + probeError(error));
        }
        try {
          if (original) app.activeDocument = original;
        } catch (error) {
          report("恢复原文档焦点失败：" + probeError(error));
        }
      }
    }, { commandName: "检测剪贴板图像" });
    if (!exported) throw new Error("检测被中断，未成功导出预览；已跳过文件读取。");
    step("7/7 读取 PNG 预览");
    const bytes = await file.read({ format: storage.formats.binary });
    if (!bytes.byteLength) throw new Error("导出的检测图像为空。");
    preview(new Blob([bytes], { type: "image/png" }));
    report("已取得 Photoshop 粘贴预览；尚未添加到参考图列表。");
  } catch (error) {
    report("检测失败阶段：【" + stage + "】；原因：" + probeError(error));
  } finally {
    if (file) {
      try { await file.delete(); }
      catch (error) {
        const message = probeError(error);
        // UXP createFile may return an entry before bytes exist on disk.
        if (!/no such file or directory|ENOENT|file.*not found/i.test(message)) {
          report("临时预览文件清理提示：" + message);
        }
      }
    }
    photoshopProbeBusy = false;
  }
}

function attach(options) {
  const section = document.getElementById(options.sectionId);
  if (!section || section.querySelector(".clipboard-probe")) return;
  const list = document.getElementById(options.listId);
  const panel = document.createElement("section");
  panel.className = "clipboard-probe";
  const hint = document.createElement("sp-body");
  hint.className = "info-text";
  hint.textContent = "剪贴板验证：复制图片后，悬浮在“+ 添加”上按 Ctrl+V。无响应时可点击检测按钮。";
  const button = document.createElement("sp-button");
  button.className = "clipboard-probe-button";
  button.setAttribute("variant", "secondary");
  button.textContent = "检测剪贴板";
  const output = document.createElement("sp-body");
  output.className = "clipboard-probe-output";
  output.textContent = "等待验证（仅检测预览，不添加参考图）。";
  const image = document.createElement("img");
  image.className = "clipboard-probe-preview is-hidden";
  image.alt = "剪贴板检测预览";
  panel.appendChild(hint);
  panel.appendChild(button);
  panel.appendChild(output);
  panel.appendChild(image);
  const interaction = document.createElement("sp-body");
  interaction.className = "clipboard-probe-output";
  interaction.textContent = "交互检测：鼠标尚未进入 + 添加。";
  panel.appendChild(interaction);
  const photoshopButton = document.createElement("sp-button");
  photoshopButton.className = "clipboard-probe-button";
  photoshopButton.setAttribute("variant", "secondary");
  photoshopButton.textContent = "通过 Photoshop 粘贴检测";
  panel.appendChild(photoshopButton);
  const photoshopHint = document.createElement("sp-body");
  photoshopHint.className = "info-text";
  photoshopHint.textContent = "会短暂创建临时文档，检测完成后关闭；仅显示预览。";
  panel.appendChild(photoshopHint);
  section.appendChild(panel);
  const state = { section, list, button, busy: false, url: null, lines: [], output };
  state.interaction = interaction;
  probeStates.push(state);
  function report(message) {
    state.lines.push(message);
    output.textContent = state.lines.join("\n");
  }
  image.addEventListener("load", () => report("图像预览成功。"));
  image.addEventListener("error", () => report("图像预览解码失败；请反馈上面的格式信息。"));
  state.run = async function(trigger, usePhotoshop = false) {
    if (state.busy) return;
    state.busy = true;
    button.disabled = true;
    photoshopButton.disabled = true;
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = null;
    image.classList.add("is-hidden");
    image.removeAttribute("src");
    state.lines = [];
    if (usePhotoshop) interaction.textContent = "正在运行 Photoshop 粘贴检测，本次无需按 Ctrl+V。";
    report("触发：" + trigger);
    try {
      const showPreview = blob => {
        state.url = URL.createObjectURL(blob);
        image.src = state.url;
        image.classList.remove("is-hidden");
      };
      if (usePhotoshop) await readPhotoshopProbe(report, showPreview);
      else await readProbe(typeof navigator !== "undefined" ? navigator.clipboard : null, report, showPreview);
    } catch (error) {
      report("检测失败：" + error.message);
    } finally {
      state.busy = false;
      button.disabled = false;
      photoshopButton.disabled = false;
    }
  };
  photoshopButton.addEventListener("click", () => state.run("Photoshop 粘贴检测", true));
  button.addEventListener("click", () => state.run("检测按钮"));
  function isAddTile(target) {
    while (target && target !== list) {
      if (target.classList && target.classList.contains("reference-add-tile")) return !target.disabled;
      target = target.parentNode;
    }
    return false;
  }
  function over(event) {
    if (isAddTile(event.target)) {
      hovered = state;
      if (!state.overTile) {
        interaction.textContent = isEditable(document.activeElement)
          ? "悬浮已识别；焦点仍在输入框。请点击检测按钮后，再移回 + 添加测试。"
          : "悬浮已识别；请按 Ctrl+V，等待插件收到按键。";
      }
      state.overTile = true;
      if (!state.busy && !state.lines.length) output.textContent = "已识别悬浮，等待 Ctrl+V（仅检测预览）。";
    } else if (hovered === state) {
      hovered = null;
      state.overTile = false;
    }
  }
  function out(event) {
    if (hovered === state && !isAddTile(event.relatedTarget)) {
      hovered = null;
      state.overTile = false;
    }
  }
  list.addEventListener("mouseover", over);
  list.addEventListener("pointerover", over);
  list.addEventListener("mousemove", over);
  list.addEventListener("pointermove", over);
  list.addEventListener("mouseout", out);
  list.addEventListener("pointerout", out);
  if (!listening) {
    listening = true;
    document.addEventListener("keydown", event => {
      const receiver = hovered && visible(hovered.section) ? hovered : null;
      probeStates.filter(item => visible(item.section)).forEach(item => {
        item.interaction.textContent = receiver === item
          ? "插件已收到按键；悬浮已识别。"
          : "插件已收到按键，但未识别到悬浮在本面板的 + 添加。";
      });
      if (!receiver) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey ||
          !(String(event.key || "").toLowerCase() === "v" || event.code === "KeyV" || event.keyCode === 86)) return;
      if (isEditable(event.target) || isEditable(document.activeElement)) {
        hovered.interaction.textContent = "当前焦点在输入框，保留正常文字粘贴。请点击面板空白处后再悬浮测试。";
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      hovered.interaction.textContent = "Ctrl+V 已识别，正在检测剪贴板。";
      if (!event.repeat) hovered.run("悬浮 + Ctrl+V（插件已收到快捷键）");
    }, true);
    window.addEventListener("blur", () => {
      if (hovered) {
        hovered.overTile = false;
        hovered.interaction.textContent = "面板已失去焦点；请先点击检测按钮，再移回 + 添加测试。";
      }
      hovered = null;
    });
  }
}

window.LiangyiClipboardProbe = { attach };
})();
