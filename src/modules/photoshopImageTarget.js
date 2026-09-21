(function() {
"use strict";

const { action, app, core } = require("photoshop");
const { storage } = require("uxp");

function pixelValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const numeric = Number(value._value !== undefined ? value._value : value.value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeBounds(bounds) {
  if (!bounds) {
    return null;
  }
  const left = pixelValue(bounds.left);
  const top = pixelValue(bounds.top);
  const right = pixelValue(bounds.right);
  const bottom = pixelValue(bounds.bottom);
  if (left === null || top === null || right === null || bottom === null || right <= left || bottom <= top) {
    return null;
  }
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function commandError(result) {
  if (!result || typeof result !== "object") {
    return "Photoshop 未返回命令结果";
  }
  const resultCode = Number(result.result);
  if (result._obj === "error" || (Number.isFinite(resultCode) && resultCode < 0)) {
    return String(result.message || result.error || `Photoshop 错误 ${resultCode}`);
  }
  return "";
}

async function batchPlayChecked(commands, options, operation) {
  const results = await action.batchPlay(commands, options || {});
  const failed = Array.from(results || []).find(commandError);
  if (failed) {
    throw new Error(`${operation}失败：${commandError(failed)}`);
  }
  return results;
}

async function getSelectionBounds() {
  const results = await action.batchPlay([{
    _obj: "get",
    _target: [
      { _property: "selection" },
      { _ref: "document", _enum: "ordinal", _value: "targetEnum" }
    ],
    _options: { dialogOptions: "dontDisplay" }
  }], { synchronousExecution: true, modalBehavior: "execute" });
  const descriptor = results && results[0];
  if (!descriptor || descriptor._obj === "error") {
    return null;
  }
  return normalizeBounds(descriptor.selection);
}

async function getPlacementTarget(document) {
  if (!document) {
    throw new Error("当前没有可用的 Photoshop 文档。");
  }
  try {
    const selection = await getSelectionBounds();
    if (selection) {
      return { type: "selection", label: "选区", bounds: selection };
    }
  } catch (_) {
    // Photoshop reports an unavailable selection when no pixel selection exists.
  }

  const canvas = normalizeBounds({
    left: 0,
    top: 0,
    right: document.width,
    bottom: document.height
  });
  if (!canvas) {
    throw new Error("无法读取当前 Photoshop 画布尺寸。");
  }
  return { type: "canvas", label: "画布", bounds: canvas };
}

function documentIsOpen(documentId) {
  return Array.from(app.documents || []).some((document) => document.id === documentId);
}

async function closeWithoutSaving(document) {
  if (!document) {
    return;
  }
  if (typeof document.closeWithoutSaving === "function") {
    await document.closeWithoutSaving();
    return;
  }
  await batchPlayChecked([{
    _obj: "close",
    _target: [{ _ref: "document", _id: document.id }],
    saving: { _enum: "yesNo", _value: "no" },
    _options: { dialogOptions: "dontDisplay" }
  }], { synchronousExecution: true, modalBehavior: "execute" }, "关闭临时参考图文档");
}

async function captureReference(options) {
  const settings = options || {};
  if (!app.documents || app.documents.length === 0) {
    throw new Error("添加参考图前，请先打开 Photoshop 文档。");
  }

  const source = app.activeDocument;
  const sourceId = source.id;
  if (Number.isFinite(settings.expectedDocumentId) && sourceId !== settings.expectedDocumentId) {
    throw new Error("文档已切换，请在目标文档中点击 + 重新添加。");
  }

  const folder = await storage.localFileSystem.getTemporaryFolder();
  const suffix = String(settings.fileNameSuffix || Date.now()).replace(/[^a-z0-9_-]/gi, "");
  const file = await folder.createFile(`liangyi-reference-${suffix || Date.now()}.jpg`, { overwrite: true });
  let target = null;

  try {
    await core.executeAsModal(async (executionContext) => {
      if (!app.documents.length || app.activeDocument.id !== sourceId) {
        throw new Error("文档已切换，已取消获取参考图。");
      }

      target = await getPlacementTarget(source);
      let captureDocument = null;
      try {
        captureDocument = await source.duplicate();
        if (!captureDocument || captureDocument.id === sourceId) {
          throw new Error("无法创建参考图临时文档。");
        }
        if (executionContext.hostControl && executionContext.hostControl.registerAutoCloseDocument) {
          await executionContext.hostControl.registerAutoCloseDocument(captureDocument.id);
        }
        await captureDocument.flatten();
        if (target.type === "selection") {
          await captureDocument.crop({
            left: target.bounds.left,
            top: target.bounds.top,
            right: target.bounds.right,
            bottom: target.bounds.bottom
          });
        }
        await captureDocument.saveAs.jpg(file, { quality: settings.quality || 10 }, true);
      } finally {
        try {
          if (captureDocument && documentIsOpen(captureDocument.id)) {
            await closeWithoutSaving(captureDocument);
          }
        } finally {
          if (documentIsOpen(sourceId)) {
            app.activeDocument = source;
          }
        }
      }
    }, { commandName: settings.commandName || "获取画布或选区参考图" });

    const bytes = await file.read({ format: storage.formats.binary });
    const byteLength = bytes && bytes.byteLength !== undefined ? bytes.byteLength : bytes && bytes.length;
    if (!byteLength) {
      throw new Error("Photoshop 返回了空参考图。");
    }
    return {
      bytes,
      mimeType: "image/jpeg",
      documentId: sourceId,
      documentName: String(source.title || source.name || "Photoshop"),
      target: target.type,
      targetLabel: target.label,
      targetBounds: target.bounds
    };
  } finally {
    try {
      await file.delete();
    } catch (_) {
      // Temporary-file cleanup does not affect the captured reference.
    }
  }
}

async function getLayerBounds(layerId) {
  const results = await batchPlayChecked([{
    _obj: "get",
    _target: [{ _ref: "layer", _id: Number(layerId) }],
    _options: { dialogOptions: "dontDisplay" }
  }], { synchronousExecution: true, modalBehavior: "execute" }, "读取生成图层边界");
  const bounds = normalizeBounds(results && results[0] && results[0].bounds);
  if (!bounds) {
    throw new Error("生成图层没有有效的像素边界。");
  }
  return bounds;
}

async function fitLayerToTarget(layerId, targetBounds) {
  const target = normalizeBounds(targetBounds);
  if (!target) {
    throw new Error("目标选区或画布边界无效。");
  }
  const initialBounds = await getLayerBounds(layerId);
  const scale = Math.min(
    target.width / initialBounds.width,
    target.height / initialBounds.height
  ) * 100;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("无法计算生成图像的自适应缩放比例。");
  }

  if (Math.abs(scale - 100) > 0.01) {
    await batchPlayChecked([{
      _obj: "transform",
      _target: [{ _ref: "layer", _id: Number(layerId) }],
      freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" },
      width: { _unit: "percentUnit", _value: scale },
      height: { _unit: "percentUnit", _value: scale },
      linked: true,
      _options: { dialogOptions: "dontDisplay" }
    }], { synchronousExecution: true, modalBehavior: "execute" }, "缩放生成图像");
  }

  const scaledBounds = await getLayerBounds(layerId);
  const moveX = target.left + target.width / 2 - (scaledBounds.left + scaledBounds.width / 2);
  const moveY = target.top + target.height / 2 - (scaledBounds.top + scaledBounds.height / 2);
  if (Math.abs(moveX) > 0.05 || Math.abs(moveY) > 0.05) {
    await batchPlayChecked([{
      _obj: "move",
      _target: [{ _ref: "layer", _id: Number(layerId) }],
      to: {
        _obj: "offset",
        horizontal: { _unit: "pixelsUnit", _value: moveX },
        vertical: { _unit: "pixelsUnit", _value: moveY }
      },
      _options: { dialogOptions: "dontDisplay" }
    }], { synchronousExecution: true, modalBehavior: "execute" }, "定位生成图像");
  }

  return {
    scale,
    moveX,
    moveY,
    initialBounds,
    finalBounds: await getLayerBounds(layerId)
  };
}

async function placeFile(document, file, target, options) {
  if (!document || !documentIsOpen(document.id)) {
    throw new Error("目标 Photoshop 文档已经关闭。");
  }
  if (app.activeDocument.id !== document.id) {
    app.activeDocument = document;
  }
  const token = await storage.localFileSystem.createSessionToken(file);
  await batchPlayChecked([{
    _obj: "placeEvent",
    "null": { _path: token, _kind: "local" },
    linked: false,
    freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" },
    offset: {
      _obj: "offset",
      horizontal: { _unit: "pixelsUnit", _value: 0 },
      vertical: { _unit: "pixelsUnit", _value: 0 }
    },
    _options: { dialogOptions: "dontDisplay" }
  }], { synchronousExecution: true, modalBehavior: "execute" }, "置入生成图像");

  const layer = document.activeLayers && document.activeLayers[0];
  if (!layer || !Number.isFinite(layer.id)) {
    throw new Error("Photoshop 未返回新置入的生成图层。");
  }
  if (options && options.layerName) {
    layer.name = options.layerName;
  }
  const transformed = await fitLayerToTarget(layer.id, target.bounds);
  return { layer, target, ...transformed };
}

window.LiangyiPhotoshopImageTarget = {
  captureReference,
  fitLayerToTarget,
  getPlacementTarget,
  normalizeBounds,
  placeFile
};
})();
