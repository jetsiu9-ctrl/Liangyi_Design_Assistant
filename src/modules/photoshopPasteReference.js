(function() {
"use strict";
const { action, app, core, constants } = require("photoshop");
const { storage } = require("uxp");
const events = ["paste"];
const TILE_CLASS = "reference-add-tile";
const TILE_HINT = "点击优先读取当前选区，无选区时读取整个画布；也可把本地图片直接拖到这里；保持 Photoshop 画布焦点，悬浮于此按 Ctrl+V 可粘贴图层，上传成功后会撤销临时粘贴并恢复原选区";
// 悬浮期间定期重拍快照：用户可能在这期间新建或删除图层，旧快照会让恢复历史跳错位置。
const SNAPSHOT_REFRESH_MS = 1000;
// 超过这个时长的快照不再可信，不能再用它的历史状态去恢复。
const SNAPSHOT_TRUST_MS = 3000;
// 指针移出面板时 relatedTarget 为 null、无法判定是否离开「+」，用空闲时长兜底。
const HOVER_IDLE_MS = 30000;
let hovered = null;
let registration = null;
let timer = null;
let importing = false;
let disposed = false;
let panelPasteBound = false;
// 已绑定监听的容器。用模块内列表记录而不是元素属性，避免标记被对象展开一并复制。
const boundZones = [];

function isVisible(tile) {
  if (tile.isConnected === false) return false;
  for (let node = tile; node && node !== document; node = node.parentNode) {
    if (node.hidden || (node.classList && node.classList.contains("is-hidden"))) return false;
    if (typeof getComputedStyle === "function") {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
  }
  return true;
}

function hasTileClass(node) {
  return !!(node && node.classList && typeof node.classList.contains === "function" && node.classList.contains(TILE_CLASS));
}

// 监听挂在不会被重绘的容器上，所以必须判断事件落在「+」内部还是容器别处。
// 合成事件没有 target 时按“在「+」上”处理，保持对旧式直接绑定按钮的兼容。
function isAddTile(node, zone) {
  if (hasTileClass(zone)) return true;
  if (!node) return true;
  for (let current = node; current && current !== zone; current = current.parentNode) {
    if (hasTileClass(current)) return true;
  }
  return false;
}

// 「+」按钮每次重绘都会被重建，所以永远现取，不能缓存节点引用。
function tileOf(target) {
  if (!target) return null;
  const resolve = typeof target.resolveTile === "function" ? target.resolveTile : () => target.tile;
  try {
    return resolve() || null;
  } catch (_) {
    return null;
  }
}

function isEditable(node) {
  for (let current = node; current && current !== document; current = current.parentNode) {
    const tag = current.tagName ? String(current.tagName).toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "sp-textfield" || tag === "sp-textarea") return true;
    if (current.isContentEditable) return true;
  }
  return false;
}

// E：把键盘焦点从面板推回 Photoshop，否则 Ctrl+V 根本到不了 PS。
// 但正在输入的用户不该被打断，所以只对非输入类元素动手。
function releasePanelFocus() {
  try {
    const active = document.activeElement;
    if (!active || active === document.body) return;
    if (isEditable(active)) return;
    if (typeof active.blur === "function") active.blur();
  } catch (_) {
    // 焦点操作失败不影响粘贴本身。
  }
}

// 焦点留在面板时 Photoshop 根本不会派发 paste 通知，用户只会觉得“按了没反应”。
// 这里旁听面板内的 paste（不拦截、不阻止默认行为），明确告诉用户该先点一下画布。
function onPanelPaste(event) {
  if (disposed || !hovered || isEditable(event && event.target)) return;
  hovered.setStatus("键盘焦点还在面板上，Photoshop 收不到这次粘贴。请先点击一下画布，再悬浮 + 按 Ctrl+V。");
}


function allLayers(layers) {
  const result = [];
  for (const layer of Array.from(layers || [])) {
    result.push(layer);
    if (layer.layers) result.push(...allLayers(layer.layers));
  }
  return result;
}

function activeHistoryState(doc) {
  try {
    return doc && doc.activeHistoryState || null;
  } catch (_) {
    return null;
  }
}

function snapshot(target) {
  if (!app.documents.length) { target.before = null; return; }
  const doc = app.activeDocument;
  target.before = {
    at: Date.now(),
    documentId: doc.id,
    ids: new Set(allLayers(doc.layers).map(layer => layer.id)),
    historyState: activeHistoryState(doc)
  };
}

function pastedLayerId(target, doc, descriptor) {
  if (!target.before || target.before.documentId !== doc.id) {
    throw new Error("无法确认粘贴前的图层列表，请将鼠标移出 + 后重新悬浮再粘贴。");
  }
  const layers = allLayers(doc.layers);
  const rawId = descriptor && descriptor.layerID;
  const explicit = Number.isFinite(rawId) ? [rawId] : Array.isArray(rawId) ? rawId : [];
  const candidates = explicit.length ? explicit : Array.from(doc.activeLayers || [], layer => layer.id);
  const fresh = candidates.filter(id => Number.isFinite(id) && !target.before.ids.has(id) && layers.some(layer => layer.id === id));
  if (fresh.length !== 1 || candidates.length !== 1) {
    throw new Error("无法唯一确认本次粘贴的新图层，已保留图层，未导入或删除。");
  }
  return fresh[0];
}

function historyStateBeforePaste(doc) {
  try {
    const active = activeHistoryState(doc);
    const states = doc && doc.historyStates;
    const length = states && Number(states.length) || 0;
    if (!active || !length) return null;
    for (let index = 0; index < length; index += 1) {
      const state = states[index];
      if (state && state.id === active.id) return index > 0 ? states[index - 1] : null;
    }
  } catch (_) {
    // History access can be unavailable inside a Photoshop notification callback.
  }
  return null;
}

async function removePasteAndRestoreSelection(source, documentId, layerId, restoreState) {
  const stillPresent = allLayers(source.layers).find(item => item.id === layerId);
  if (!stillPresent) throw new Error("参考图已添加，但源图层状态已改变。");

  if (restoreState && (restoreState.docId === undefined || restoreState.docId === documentId)) {
    try {
      source.activeHistoryState = restoreState;
      if (allLayers(source.layers).some(item => item.id === layerId)) {
        throw new Error("Photoshop 未能回到粘贴前的历史状态。");
      }
      return { restored: true, fallbackDeleted: false };
    } catch (restoreError) {
      const fallbackLayer = allLayers(source.layers).find(item => item.id === layerId);
      if (fallbackLayer) await fallbackLayer.delete();
      const error = new Error("临时粘贴图层已删除，但原选区恢复失败：" + (restoreError.message || String(restoreError)));
      error.selectionRestoreFailed = true;
      throw error;
    }
  }

  await stillPresent.delete();
  return { restored: false, fallbackDeleted: true };
}

async function importPastedLayer(target, documentId, layerId, restoreState) {
  let file = null;
  let accepted = false;
  let cleaned = false;
  let selectionRestored = false;
  let importStarted = false;
  try {
    const folder = await storage.localFileSystem.getTemporaryFolder();
    file = await folder.createFile("liangyi-pasted-layer-" + Date.now() + ".png", { overwrite: false });
    // 导入期间锁住上传与拖入入口：它们会把 referenceAddInProgress 置真，导致下面 acceptImage 被拒，
    // 而抛错点在画布恢复之前，粘贴的图层会残留在画布上。
    if (typeof target.onImportStart === "function") {
      target.onImportStart();
      importStarted = true;
    }
    await core.executeAsModal(async context => {
      const activeTile = tileOf(target);
      if (disposed || !target.canAdd() || !activeTile || !isVisible(activeTile)) throw new Error("面板状态已改变，已取消导入。");
      if (!app.documents.length || app.activeDocument.id !== documentId) throw new Error("当前文档已切换，已取消导入。");
      const source = app.activeDocument;
      const layer = allLayers(source.layers).find(item => item.id === layerId);
      if (!layer) throw new Error("本次粘贴的图层已不存在。");
      let temporary = null;
      let tempId = null;
      let registered = false;
      try {
        // Duplicate only the pinned pasted layer. Existing canvas layers never enter the export.
        temporary = await app.documents.add({ name: "凉意粘贴参考图（临时）", width: 64, height: 64,
          resolution: source.resolution || 72, mode: "RGBColorMode", fill: "transparent", depth: 8 });
        tempId = temporary && temporary.id;
        if (!Number.isFinite(tempId) || tempId === documentId) throw new Error("无法创建独立图层导出文档。");
        if (context.hostControl && context.hostControl.registerAutoCloseDocument) {
          await context.hostControl.registerAutoCloseDocument(tempId);
          registered = true;
        }
        app.activeDocument = source;
        const copy = await layer.duplicate(temporary);
        if (!copy) throw new Error("粘贴图层复制失败。");
        app.activeDocument = temporary;
        copy.visible = true;
        const results = await action.batchPlay([{
          _obj: "get", _target: [{ _property: "bounds" }, { _ref: "layer", _id: copy.id }, { _ref: "document", _id: tempId }],
          _options: { dialogOptions: "silent" }
        }], {});
        const reply = results && results[0];
        if (!reply || reply._obj === "error" || !reply.bounds) throw new Error("无法读取粘贴图层的实际像素范围。");
        const numeric = value => typeof value === "number" ? value : Number(value && (value._value !== undefined ? value._value : value.value));
        const edges = [reply.bounds.left, reply.bounds.top, reply.bounds.right, reply.bounds.bottom].map(numeric);
        if (!edges.every(Number.isFinite) || edges[2] <= edges[0] || edges[3] <= edges[1]) throw new Error("粘贴图层为空，已停止导入。");
        // Translate the copy only, then size the temporary canvas to the complete layer bounds.
        const left = Math.floor(edges[0]), top = Math.floor(edges[1]);
        const width = Math.ceil(edges[2]) - left, height = Math.ceil(edges[3]) - top;
        await copy.translate(-left, -top);
        await temporary.resizeCanvas(width, height, constants.AnchorPosition.TOPLEFT);
        await temporary.saveAs.png(file, {}, true);
      } finally {
        try {
          if (temporary && Number.isFinite(tempId) && tempId !== documentId) {
            await temporary.close(constants.SaveOptions.DONOTSAVECHANGES);
            if (registered) await context.hostControl.unregisterAutoCloseDocument(tempId);
          }
        } finally {
          app.activeDocument = source;
        }
      }
      const bytes = await file.read({ format: storage.formats.binary });
      if (!bytes.byteLength) throw new Error("导出的粘贴图层图像为空。");
      if (disposed || !target.canAdd()) throw new Error("参考图列表已满或面板已关闭。");
      const acceptedImage = await target.acceptImage({ bytes, mimeType: "image/png", name: "pasted-layer-" + layerId + ".png" });
      if (acceptedImage !== true) throw new Error("参考图未成功加入列表。");
      accepted = true;
      // Returning to the exact pre-paste history state removes only this paste and restores
      // arbitrary, feathered, and multi-part selections without approximating their bounds.
      const cleanup = await removePasteAndRestoreSelection(source, documentId, layerId, restoreState);
      cleaned = cleanup.restored || cleanup.fallbackDeleted;
      selectionRestored = cleanup.restored;
    }, { commandName: "粘贴图层添加为参考图" });
    if (!accepted) throw new Error("导入被中断。");
    target.setStatus(selectionRestored
      ? "已添加粘贴图层为参考图，并恢复粘贴前的选区。"
      : "已添加粘贴图层为参考图，并删除画布中的临时图层。");
  } catch (error) {
    target.setStatus((accepted
      ? "参考图已添加，但粘贴后的画布恢复未完全完成："
      : "粘贴图层导入失败，原图层已保留：") + (error.message || String(error)));
  } finally {
    if (importStarted && typeof target.onImportEnd === "function") target.onImportEnd();
    if (file) {
      try { await file.delete(); } catch (_) { /* Temporary-file cleanup does not affect the imported image. */ }
    }
  }
  return accepted && cleaned;
}

function onPaste(eventName, descriptor) {
  if (eventName !== "paste" || disposed) return;
  if (descriptor && (descriptor._obj === "error" || descriptor.result < 0)) return;
  if (importing) {
    // 静默丢弃会让用户以为功能坏了，这里明确说明原因。
    if (hovered) hovered.setStatus("正在导入上一张参考图，请稍候再按 Ctrl+V。");
    return;
  }
  if (!hovered) return;
  const target = hovered;
  const tile = tileOf(target);
  if (!tile || tile.disabled || !isVisible(tile) || !target.canAdd()) return;
  // 指针移出面板时 relatedTarget 为 null、悬浮状态无法可靠清空，用空闲时长兜底。
  if (Date.now() - (target.hoveredAt || Date.now()) > HOVER_IDLE_MS) {
    hovered = null;
    target.setStatus("悬浮状态已超时，请重新把鼠标移到 + 上再按 Ctrl+V。");
    return;
  }
  if (!app.documents.length) return;
  const currentId = app.activeDocument.id;
  const eventId = descriptor && descriptor.documentID;
  if (!Number.isFinite(currentId) || (Number.isFinite(eventId) && eventId !== currentId)) return;
  // 快照足够新时才用它的历史状态。过期快照会跳到悬浮那一刻，把用户之后的图层操作一并回滚。
  const before = target.before;
  const trustworthy = before
    && before.documentId === currentId
    && before.at
    && (Date.now() - before.at) <= SNAPSHOT_TRUST_MS;
  const restoreState = trustworthy && before.historyState
    ? before.historyState
    : historyStateBeforePaste(app.activeDocument);
  let layerId;
  try {
    layerId = pastedLayerId(target, app.activeDocument, descriptor);
    snapshot(target);
  } catch (error) {
    target.setStatus(error.message || String(error));
    snapshot(target);
    return;
  }
  importing = true;
  target.setStatus("Photoshop 已粘贴，正在提取新增图层…");
  // Exit the Photoshop notification callback before requesting a modal export.
  timer = setTimeout(async () => {
    timer = null;
    try {
      if (disposed || !target.canAdd()) return;
      const activeTile = tileOf(target);
      if (!activeTile || !isVisible(activeTile)) return;
      if (!app.documents.length || app.activeDocument.id !== currentId) {
        throw new Error("当前文档已切换，粘贴图层已保留，未导入或删除。");
      }
      await importPastedLayer(target, currentId, layerId, restoreState);
    } catch (error) {
      target.setStatus("粘贴图层导入失败：" + (error.message || String(error)));
    } finally {
      importing = false;
    }
  }, 100);
}

async function start() {
  if (registration) {
    if (registration !== true) await registration;
    return;
  }
  disposed = false;
  if (!panelPasteBound && typeof document !== "undefined" && document && typeof document.addEventListener === "function") {
    document.addEventListener("paste", onPanelPaste);
    panelPasteBound = true;
  }
  try {
    const result = action.addNotificationListener(events, onPaste);
    // Photoshop builds differ here: some return Promise<void>, while others
    // register synchronously and return undefined despite the documented type.
    registration = result && typeof result.then === "function" ? result : true;
    if (registration !== true) await registration;
    registration = true;
  } catch (error) {
    registration = null;
    throw error;
  }
}

function bind(zone, options) {
  if (!zone) return;
  // 幂等：监听器挂在长期存在的容器上，重复绑定会叠加。
  if (boundZones.indexOf(zone) !== -1) return;
  boundZones.push(zone);

  const settings = options || {};
  const target = {
    zone,
    resolveTile: typeof settings.resolveTile === "function" ? settings.resolveTile : () => zone,
    canAdd: settings.canAdd || (() => true),
    acceptImage: settings.acceptImage,
    setStatus: settings.setStatus || (() => {}),
    onImportStart: typeof settings.onImportStart === "function" ? settings.onImportStart : null,
    onImportEnd: typeof settings.onImportEnd === "function" ? settings.onImportEnd : null
  };

  const tile = tileOf(target);
  if (tile && tile.setAttribute) tile.setAttribute("title", TILE_HINT);

  const enter = event => {
    if (!isAddTile(event && event.target, zone)) return;
    const active = tileOf(target);
    if (active && active.disabled) return;
    // E：趁悬浮把焦点从面板推回 Photoshop，否则 Ctrl+V 到不了 PS。
    releasePanelFocus();
    const now = Date.now();
    if (hovered !== target || now - ((target.before && target.before.at) || 0) > SNAPSHOT_REFRESH_MS) {
      snapshot(target);
    }
    target.hoveredAt = now;
    hovered = target;
  };

  // 只有在真实 DOM 容器上才能可靠判断指针是否仍落在「+」内。
  const domBound = !!(zone.classList && typeof zone.classList.contains === "function");
  const leave = event => {
    const related = event && event.relatedTarget;
    // 列表重绘会移除「+」，此时 relatedTarget 变成 null。若就此清空悬浮状态，
    // 用户每次粘贴成功（都会重绘）后都得重新移动鼠标才能继续。
    if (domBound && !related) return;
    if (related && isAddTile(related, zone)) return;
    if (hovered === target) hovered = null;
  };

  ["mouseenter", "mouseover", "mousemove", "pointerenter", "pointerover", "pointermove"].forEach(name => zone.addEventListener(name, enter));
  ["mouseleave", "mouseout", "pointerleave", "pointerout"].forEach(name => zone.addEventListener(name, leave));
  // Do not focus the zone or intercept keyboard/paste events: Photoshop owns the paste.
}

function resetTarget() {
  hovered = null;
  if (timer !== null) { clearTimeout(timer); timer = null; importing = false; }
}

async function stop() {
  disposed = true;
  resetTarget();
  if (panelPasteBound && typeof document !== "undefined" && document && typeof document.removeEventListener === "function") {
    document.removeEventListener("paste", onPanelPaste);
    panelPasteBound = false;
  }
  if (registration) {
    try {
      if (registration !== true) await registration;
      const result = action.removeNotificationListener(events, onPaste);
      if (result && typeof result.then === "function") await result;
    }
    finally { registration = null; }
  }
}

window.LiangyiPhotoshopPaste = { bind, start, stop, resetTarget };
})();
