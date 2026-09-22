(function() {
"use strict";
const { storage } = require("uxp");

const DROP_HINT = "松开添加";

const MIME_BY_EXTENSION = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

function mimeTypeOf(name) {
  const parts = String(name || "").split(".");
  if (parts.length < 2) return null;
  return MIME_BY_EXTENSION[parts.pop().toLowerCase()] || null;
}

// Windows 的 nativePath 形如 F:\桌面\a.png，而 getEntryWithUrl 需要 URL 形式，
// 因此把几种等价写法都列出来逐个尝试，避免平台差异导致读取失败。
function urlCandidates(nativePath) {
  const raw = String(nativePath || "");
  if (!raw) return [];
  const slashed = raw.replace(/\\/g, "/");
  const candidates = ["file:" + raw, "file:" + slashed, "file://" + slashed, "file:///" + slashed];
  return candidates.filter((value, index) => candidates.indexOf(value) === index);
}

// uxpEntries 里的条目本身就是 UXP 的 File 对象（原型上有 read），优先直接读；
// 失败再退回到按 nativePath 重新打开，两条路都不通才报错。
async function readEntry(entry) {
  if (!entry) throw new Error("拖入的文件条目为空。");
  const name = entry.name || "拖入的文件";
  const attempts = [];
  if (typeof entry.read === "function") {
    attempts.push(() => entry.read({ format: storage.formats.binary }));
  }
  urlCandidates(entry.nativePath).forEach((url) => {
    attempts.push(async () => {
      const opened = await storage.localFileSystem.getEntryWithUrl(url);
      if (!opened || !opened.isFile) throw new Error("不是文件");
      return opened.read({ format: storage.formats.binary });
    });
  });
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const bytes = await attempt();
      if (bytes && bytes.byteLength) return bytes;
      lastError = new Error("文件内容为空");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("读取拖入文件失败：" + name + "（" + ((lastError && lastError.message) || lastError) + "）");
}

// 老版本 UXP 没有 uxpEntries，返回 null 以便调用方区分「不支持」和「拖了个空的」。
function entriesFrom(event) {
  const dataTransfer = event && event.dataTransfer;
  if (!dataTransfer) return null;
  let list = null;
  try {
    list = dataTransfer.uxpEntries;
  } catch (_) {
    list = null;
  }
  if (!list) return null;
  return Array.from(list);
}

function bind(zone, options) {
  if (!zone) return;
  const settings = options || {};
  const canAdd = settings.canAdd || (() => true);
  const onDrop = settings.onDrop;
  const setStatus = settings.setStatus || (() => {});
  let importing = false;
  let savedHint = null;

  const hintNode = () => {
    if (typeof zone.querySelector !== "function") return null;
    try {
      return zone.querySelector(".reference-add-text");
    } catch (_) {
      return null;
    }
  };

  // 拖拽时换掉「+」的文字，比任何静态说明都更早给出「松手即可」的确认。
  const showDropHint = () => {
    const node = hintNode();
    if (!node) return;
    if (savedHint === null) savedHint = node.textContent;
    node.textContent = DROP_HINT;
  };

  const restoreHint = () => {
    if (savedHint === null) return;
    const node = hintNode();
    if (node) node.textContent = savedHint;
    savedHint = null;
  };

  const activate = (event) => {
    // 必须阻止默认行为，否则 UXP 不会派发 drop 事件。
    event.preventDefault();
    if (event.dataTransfer) {
      try {
        event.dataTransfer.dropEffect = "copy";
      } catch (_) {
        // 只读的 dataTransfer 会抛错，忽略即可。
      }
    }
    zone.classList.add("is-drop-active");
    showDropHint();
  };

  const deactivate = (event) => {
    // 指针在 + 内部子元素之间移动也会触发 dragleave，需要按 relatedTarget 过滤。
    if (event && event.relatedTarget && zone.contains(event.relatedTarget)) return;
    zone.classList.remove("is-drop-active");
    restoreHint();
  };

  zone.addEventListener("dragenter", activate);
  zone.addEventListener("dragover", activate);
  zone.addEventListener("dragleave", deactivate);
  zone.addEventListener("drop", async (event) => {
    event.preventDefault();
    zone.classList.remove("is-drop-active");
    restoreHint();
    if (importing) return;
    if (!canAdd()) {
      setStatus("参考图数量已达上限，无法再添加。");
      return;
    }
    const entries = entriesFrom(event);
    if (entries === null) {
      setStatus("当前 UXP 版本不支持从系统拖入文件，请改用上传按钮，或悬浮于 + 后按 Ctrl+V。");
      return;
    }
    if (!entries.length) {
      setStatus("未从拖拽内容中读取到文件。");
      return;
    }
    importing = true;
    try {
      await onDrop(entries);
    } finally {
      importing = false;
    }
  });
}

window.LiangyiReferenceFileDrop = { bind, readEntry, mimeTypeOf, entriesFrom };
})();
