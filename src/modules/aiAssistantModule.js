(function() {
"use strict";

const { app, core, action } = require("photoshop");
const { storage, shell } = require("uxp");

const DEFAULT_BASE_URL = "https://ai.t8star.org";
const DEFAULT_INTERFACE_NAME = "默认接口";
const CONFIG_FILE = "zhenzhen-ai-settings.json";
const MAX_POLL_ATTEMPTS = 120;
const MAX_REFERENCE_IMAGES = 8;
const DEFAULT_OUTPUT_FORMAT = "png";
const DEFAULT_BACKGROUND = "auto";
const DEFAULT_MODERATION = "auto";
const DEFAULT_POLL_INTERVAL_MS = 5000;
const GENERATION_TIMEOUT_MS = 200000;
const GENERATION_STATUS_INTERVAL_MS = 1000;
const PROMPT_MIN_ROWS = 6;
const PROMPT_MAX_ROWS = 16;
const SIZE_MAP = {
  "1:1": { "1k": "1024x1024", "2k": "2048x2048", "4k": "2880x2880" },
  "16:9": { "1k": "1280x720", "2k": "2560x1440", "4k": "3840x2160" },
  "9:16": { "1k": "720x1280", "2k": "1440x2560", "4k": "2160x3840" },
  "4:3": { "1k": "1152x864", "2k": "2304x1728", "4k": "3264x2448" },
  "3:4": { "1k": "864x1152", "2k": "1728x2304", "4k": "2448x3264" },
  "3:2": { "1k": "1248x832", "2k": "2496x1664", "4k": "3504x2336" },
  "2:3": { "1k": "832x1248", "2k": "1664x2496", "4k": "2336x3504" },
  "5:4": { "1k": "1120x896", "2k": "2240x1792", "4k": "3200x2560" },
  "4:5": { "1k": "896x1120", "2k": "1792x2240", "4k": "2560x3200" },
  "21:9": { "1k": "1456x624", "2k": "3024x1296", "4k": "3696x1584" },
  "9:21": { "1k": "624x1456", "2k": "1296x3024", "4k": "1584x3696" },
  "2:1": { "1k": "2048x1024", "2k": "2688x1344", "4k": "3840x1920" },
  "1:2": { "1k": "1024x2048", "2k": "1344x2688", "4k": "1920x3840" }
};
const GEMINI_IMAGE_MODELS = {
  "gemini-3-pro-image-preview": "/v1beta/models/gemini-3-pro-image-preview:generateContent",
  "gemini-3.1-flash-image-preview": "/v1beta/models/gemini-3.1-flash-image-preview:generateContent"
};
const GEMINI_IMAGE_SIZE_MAP = {
  "1k": "1K",
  "2k": "2K",
  "4k": "4K"
};

let settings = {
  baseUrl: DEFAULT_BASE_URL,
  apiKey: "",
  currentInterfaceId: "",
  interfaces: []
};
let editingInterfaceId = "";
let lastResultFiles = [];
let currentResultIndex = 0;
let currentPreviewUrl = "";
let referenceImages = [];
let activeGenerationCount = 0;
let resultFileSequence = 0;
let generationStatusSequence = 0;
let globalStatusMessage = "就绪。";
const generationStatusItems = new Map();

function element(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  globalStatusMessage = message;
  if (generationStatusItems.size > 0 && !hasActiveGenerationStatuses()) {
    generationStatusItems.clear();
    generationStatusSequence = 0;
  }
  renderStatus();
}

function hasActiveGenerationStatuses() {
  return Array.from(generationStatusItems.values()).some((item) => item.active);
}

function renderStatus() {
  const items = Array.from(generationStatusItems.values());
  element("statusText").textContent = items.length
    ? items.map(formatGenerationStatus).join("\n")
    : globalStatusMessage;
}

function getGenerationTimeoutSeconds() {
  return Math.ceil(GENERATION_TIMEOUT_MS / 1000);
}

function createGenerationTimeoutError() {
  return new Error(`图像生成已超时（${getGenerationTimeoutSeconds()} 秒），已停止等待。`);
}

function isAbortError(error) {
  return error && (error.name === "AbortError" || error.code === 20);
}

function assertGenerationNotTimedOut(timeoutState) {
  if (timeoutState && timeoutState.timedOut) {
    throw createGenerationTimeoutError();
  }
}

function formatGenerationStatus(timeoutState) {
  const elapsedSeconds = Math.min(
    getGenerationTimeoutSeconds(),
    Math.floor((Date.now() - timeoutState.startedAt) / 1000)
  );
  return `${timeoutState.label}：${timeoutState.message} 用时 ${elapsedSeconds}/${getGenerationTimeoutSeconds()} 秒`;
}

function refreshGenerationStatus(timeoutState, message) {
  if (!timeoutState) {
    if (message) {
      setStatus(message);
    }
    return;
  }
  if (message) {
    timeoutState.message = message;
  }
  if (!timeoutState.timedOut) {
    renderStatus();
  }
}

function startGenerationTimeout(message) {
  if (generationStatusItems.size > 0 && !hasActiveGenerationStatuses()) {
    generationStatusItems.clear();
    generationStatusSequence = 0;
  }
  generationStatusSequence += 1;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutState = {
    active: true,
    controller,
    id: `generation-${Date.now()}-${generationStatusSequence}`,
    intervalId: null,
    label: `第${generationStatusSequence}张`,
    message: message || "正在提交图像生成请求...",
    reject: null,
    startedAt: Date.now(),
    timedOut: false,
    timeoutId: null,
    timeoutPromise: null
  };

  timeoutState.timeoutPromise = new Promise((resolve, reject) => {
    timeoutState.reject = reject;
  });
  timeoutState.timeoutId = setTimeout(() => {
    timeoutState.timedOut = true;
    if (timeoutState.controller) {
      timeoutState.controller.abort();
    }
    timeoutState.message = `已超时（${getGenerationTimeoutSeconds()} 秒），已停止等待`;
    renderStatus();
    timeoutState.reject(createGenerationTimeoutError());
  }, GENERATION_TIMEOUT_MS);
  generationStatusItems.set(timeoutState.id, timeoutState);
  timeoutState.intervalId = setInterval(() => {
    refreshGenerationStatus(timeoutState);
  }, GENERATION_STATUS_INTERVAL_MS);
  refreshGenerationStatus(timeoutState);
  return timeoutState;
}

function stopGenerationTimeout(timeoutState) {
  if (!timeoutState) {
    return;
  }
  clearTimeout(timeoutState.timeoutId);
  clearInterval(timeoutState.intervalId);
  timeoutState.active = false;
  renderStatus();
}

function finishGenerationStatus(timeoutState, message) {
  if (!timeoutState) {
    return;
  }
  timeoutState.message = message;
  timeoutState.active = false;
  renderStatus();
}

function setBusy(isBusy) {
  element("generateButton").disabled = isBusy;
  element("clearReferencesButton").disabled = isBusy;
  updateResultButtons(isBusy);
  element("interfacePicker").disabled = isBusy;
  element("addInterfaceButton").disabled = isBusy;
  element("editInterfaceButton").disabled = isBusy;
  element("deleteInterfaceButton").disabled = isBusy;
  element("cancelInterfaceActionButton").disabled = isBusy;
  element("saveInterfaceButton").disabled = isBusy;
  element("cancelInterfaceButton").disabled = isBusy;
}

function setActiveModule(moduleName) {
  const connectionActive = moduleName === "connection";
  element("connectionModule").classList.toggle("is-active", connectionActive);
  element("generateModule").classList.toggle("is-active", !connectionActive);
  element("connectionModuleButton").classList.toggle("is-active", connectionActive);
  element("generateModuleButton").classList.toggle("is-active", !connectionActive);
}

function sleep(ms, timeoutState) {
  assertGenerationNotTimedOut(timeoutState);
  return new Promise((resolve, reject) => {
    const timerId = setTimeout(() => {
      assertGenerationNotTimedOut(timeoutState);
      resolve();
    }, ms);
    if (timeoutState) {
      timeoutState.timeoutPromise.catch((error) => {
        clearTimeout(timerId);
        reject(error);
      });
    }
  });
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return DEFAULT_BASE_URL;
  }
  return trimmed.replace(/\/+$/u, "").replace(/\/v1$/iu, "");
}

function createInterfaceId() {
  return `interface-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeInterface(item, index) {
  return {
    id: String(item?.id || createInterfaceId()),
    name: String(item?.name || `${DEFAULT_INTERFACE_NAME} ${index + 1}`).trim() || `${DEFAULT_INTERFACE_NAME} ${index + 1}`,
    baseUrl: normalizeBaseUrl(item?.baseUrl),
    apiKey: String(item?.apiKey || "")
  };
}

function normalizeSettingsData(value) {
  const interfaces = Array.isArray(value?.interfaces)
    ? value.interfaces.map(normalizeInterface)
    : [];
  if (!interfaces.length) {
    interfaces.push(normalizeInterface({
      id: "default-interface",
      name: DEFAULT_INTERFACE_NAME,
      baseUrl: value?.baseUrl || DEFAULT_BASE_URL,
      apiKey: value?.apiKey || ""
    }, 0));
  }

  const requestedId = String(value?.currentInterfaceId || "");
  const currentInterface = interfaces.find((item) => item.id === requestedId) || interfaces[0];
  return {
    baseUrl: currentInterface.baseUrl,
    apiKey: currentInterface.apiKey,
    currentInterfaceId: currentInterface.id,
    interfaces
  };
}

function getCurrentInterface() {
  if (!settings.interfaces.length) {
    settings = normalizeSettingsData(settings);
  }
  const current = settings.interfaces.find((item) => item.id === settings.currentInterfaceId) || settings.interfaces[0];
  settings.currentInterfaceId = current.id;
  return current;
}

function syncCurrentInterfaceFromFields() {
  const current = getCurrentInterface();
  current.baseUrl = normalizeBaseUrl(element("baseUrlInput").value);
  current.apiKey = String(element("apiKeyInput").value || "").trim();
  settings.baseUrl = current.baseUrl;
  settings.apiKey = current.apiKey;
}

function applyCurrentInterfaceToFields() {
  const current = getCurrentInterface();
  settings.baseUrl = current.baseUrl;
  settings.apiKey = current.apiKey;
  element("baseUrlInput").value = current.baseUrl;
  element("apiKeyInput").value = current.apiKey;
}

function renderInterfacePicker() {
  const menu = element("interfacePickerMenu");
  menu.textContent = "";
  settings.interfaces.forEach((item) => {
    const menuItem = document.createElement("sp-menu-item");
    menuItem.value = item.id;
    if (item.id === settings.currentInterfaceId) {
      menuItem.setAttribute("selected", "");
    }
    const label = document.createElement("sp-label");
    label.textContent = item.name;
    menuItem.appendChild(label);
    menu.appendChild(menuItem);
  });
  setPickerValue("interfacePicker", settings.currentInterfaceId);
}

function hideInterfaceActionMenu() {
  element("interfaceActionMenu").classList.add("is-hidden");
}

function showInterfaceActionMenu() {
  hideInterfaceForm();
  element("interfaceActionMenu").classList.remove("is-hidden");
}

function hideInterfaceForm() {
  editingInterfaceId = "";
  element("interfaceForm").classList.add("is-hidden");
}

function showInterfaceForm(interfaceId) {
  hideInterfaceActionMenu();
  const item = interfaceId
    ? settings.interfaces.find((entry) => entry.id === interfaceId)
    : null;
  editingInterfaceId = item ? item.id : "";
  element("interfaceNameInput").value = item ? item.name : "";
  element("interfaceBaseUrlInput").value = item ? item.baseUrl : DEFAULT_BASE_URL;
  element("interfaceApiKeyInput").value = item ? item.apiKey : "";
  element("interfaceForm").classList.remove("is-hidden");
}

function apiUrl(path, query) {
  const baseUrl = normalizeBaseUrl(element("baseUrlInput").value || settings.baseUrl);
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function isGeminiImageModel(model) {
  return Boolean(GEMINI_IMAGE_MODELS[model]);
}

function getApiKey() {
  const value = String(element("apiKeyInput").value || settings.apiKey || "").trim();
  if (!value) {
    throw new Error("请输入 API 密钥。");
  }
  return value;
}

function getPickerValue(id) {
  const picker = element(id);
  if (!picker) {
    return "";
  }
  const selectedItem = picker.querySelector("sp-menu-item[selected]");
  if (selectedItem && selectedItem.value) {
    return selectedItem.value;
  }
  if (picker.selectedItem && picker.selectedItem.value) {
    return picker.selectedItem.value;
  }
  if (picker.value) {
    return picker.value;
  }
  const firstItem = picker.querySelector("sp-menu-item");
  if (firstItem && firstItem.value) {
    return firstItem.value;
  }
  return picker.getAttribute("value") || "";
}

function readPickerDomValue(picker) {
  if (!picker) {
    return "";
  }
  if (picker.selectedItem && picker.selectedItem.value) {
    return picker.selectedItem.value;
  }
  if (picker.value) {
    return picker.value;
  }
  const selectedItem = picker.querySelector("sp-menu-item[selected]");
  if (selectedItem && selectedItem.value) {
    return selectedItem.value;
  }
  const firstItem = picker.querySelector("sp-menu-item");
  if (firstItem && firstItem.value) {
    return firstItem.value;
  }
  return "";
}

function setPickerValue(id, value) {
  const picker = element(id);
  if (!picker || !value) {
    return;
  }
  picker.querySelectorAll("sp-menu-item").forEach((item) => {
    if (item.value === value) {
      item.setAttribute("selected", "");
    } else {
      item.removeAttribute("selected");
    }
  });
}

function getImageCount() {
  const parsed = parseInteger(element("countInput").value, 1);
  return Math.min(4, Math.max(1, parsed));
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function getModelValue() {
  const customModel = String(element("customModelInput").value || "").trim();
  const model = customModel || getPickerValue("modelPicker");
  if (!model) {
    throw new Error("模型不能为空。");
  }
  return model;
}

function getActualSize() {
  const aspectRatio = getPickerValue("aspectRatioPicker");
  const resolution = getPickerValue("resolutionPicker");
  if (aspectRatio === "auto") {
    return "auto";
  }
  const size = SIZE_MAP[aspectRatio] && SIZE_MAP[aspectRatio][resolution];
  if (!size) {
    throw new Error(`不支持的画面比例和分辨率组合：${aspectRatio} x ${resolution}`);
  }
  return size;
}

function getGeminiAspectRatio() {
  const aspectRatio = getPickerValue("aspectRatioPicker");
  return aspectRatio === "auto" ? "1:1" : aspectRatio;
}

function getGeminiImageSize() {
  const resolution = getPickerValue("resolutionPicker");
  return GEMINI_IMAGE_SIZE_MAP[resolution] || "1K";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function appendCommonJsonPayload(payload) {
  payload.model = getModelValue();
  payload.quality = getPickerValue("qualityPicker");
  payload.size = getActualSize();
  payload.background = DEFAULT_BACKGROUND;
  payload.output_format = DEFAULT_OUTPUT_FORMAT;
  payload.moderation = DEFAULT_MODERATION;
  payload.n = getImageCount();
  return payload;
}

function appendCommonFormFields(form) {
  form.append("model", getModelValue());
  form.append("quality", getPickerValue("qualityPicker"));
  form.append("size", getActualSize());
  form.append("background", DEFAULT_BACKGROUND);
  form.append("output_format", DEFAULT_OUTPUT_FORMAT);
  form.append("moderation", DEFAULT_MODERATION);
  form.append("n", String(getImageCount()));
}

async function getSettingsFile(overwrite) {
  const dataFolder = await storage.localFileSystem.getDataFolder();
  return dataFolder.createFile(CONFIG_FILE, { overwrite: Boolean(overwrite) });
}

async function loadSettings() {
  try {
    const dataFolder = await storage.localFileSystem.getDataFolder();
    const file = await dataFolder.getEntry(CONFIG_FILE);
    const text = await file.read();
    const parsed = JSON.parse(text);
    settings = normalizeSettingsData(parsed);
  } catch (error) {
    settings = normalizeSettingsData({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: ""
    });
  }

  applyCurrentInterfaceToFields();
  renderInterfacePicker();
}

async function saveSettings() {
  syncCurrentInterfaceFromFields();

  const file = await getSettingsFile(true);
  await file.write(JSON.stringify(settings, null, 2));
  element("baseUrlInput").value = settings.baseUrl;
  renderInterfacePicker();
  setStatus("设置已保存。");
}

async function selectInterface(interfaceId) {
  if (!settings.interfaces.some((item) => item.id === interfaceId)) {
    return;
  }
  syncCurrentInterfaceFromFields();
  settings.currentInterfaceId = interfaceId;
  applyCurrentInterfaceToFields();
  renderInterfacePicker();
  hideInterfaceActionMenu();
  hideInterfaceForm();
  const file = await getSettingsFile(true);
  await file.write(JSON.stringify(settings, null, 2));
  setStatus(`已切换接口：${getCurrentInterface().name}`);
}

async function saveInterfaceFromForm() {
  const name = String(element("interfaceNameInput").value || "").trim();
  const baseUrl = normalizeBaseUrl(element("interfaceBaseUrlInput").value);
  const apiKey = String(element("interfaceApiKeyInput").value || "").trim();
  if (!name) {
    throw new Error("请输入接口名称。");
  }

  let item = editingInterfaceId
    ? settings.interfaces.find((entry) => entry.id === editingInterfaceId)
    : null;
  if (!item) {
    item = {
      id: createInterfaceId(),
      name,
      baseUrl,
      apiKey
    };
    settings.interfaces.push(item);
  } else {
    item.name = name;
    item.baseUrl = baseUrl;
    item.apiKey = apiKey;
  }

  settings.currentInterfaceId = item.id;
  applyCurrentInterfaceToFields();
  hideInterfaceForm();
  renderInterfacePicker();
  const file = await getSettingsFile(true);
  await file.write(JSON.stringify(settings, null, 2));
  setStatus(`已保存接口：${item.name}`);
}

async function deleteCurrentInterface() {
  if (settings.interfaces.length <= 1) {
    throw new Error("至少需要保留一个接口。");
  }
  const current = getCurrentInterface();
  settings.interfaces = settings.interfaces.filter((item) => item.id !== current.id);
  settings.currentInterfaceId = settings.interfaces[0].id;
  applyCurrentInterfaceToFields();
  renderInterfacePicker();
  hideInterfaceActionMenu();
  const file = await getSettingsFile(true);
  await file.write(JSON.stringify(settings, null, 2));
  setStatus(`已删除接口：${current.name}`);
}

function requestHeaders(contentType) {
  const headers = {
    Authorization: `Bearer ${getApiKey()}`
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

async function requestJson(url, options, timeoutState) {
  assertGenerationNotTimedOut(timeoutState);
  const requestOptions = { ...(options || {}) };
  if (timeoutState?.controller) {
    requestOptions.signal = timeoutState.controller.signal;
  }
  const response = await fetch(url, requestOptions);
  assertGenerationNotTimedOut(timeoutState);
  const text = await response.text();
  assertGenerationNotTimedOut(timeoutState);
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data.error?.message || data.message || text || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function extractTaskId(data) {
  if (!data || typeof data !== "object") {
    return "";
  }
  if (data.task_id) {
    return data.task_id;
  }
  if (data.id) {
    return data.id;
  }
  if (typeof data.data === "string") {
    return data.data;
  }
  if (data.data && typeof data.data === "object") {
    return data.data.task_id || data.data.id || "";
  }
  return "";
}

function collectImageItems(value, items) {
  if (!value) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageItems(item, items));
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  const inlineData = value.inlineData || value.inline_data;
  if (inlineData && inlineData.data) {
    items.push({
      b64_json: inlineData.data,
      mime_type: inlineData.mimeType || inlineData.mime_type || "image/png"
    });
  }
  if (value.url || value.b64_json) {
    items.push(value);
  }
  ["data", "images", "image", "output", "files", "candidates", "content", "parts"].forEach((key) => {
    if (value[key]) {
      collectImageItems(value[key], items);
    }
  });
}

function extractImageItems(data) {
  const items = [];
  collectImageItems(data, items);
  return items;
}

function taskIsDone(data) {
  const status = String(data?.data?.status || data?.status || "").toLowerCase();
  if (["success", "completed", "complete", "done", "finished"].includes(status)) {
    return true;
  }
  return extractImageItems(data).length > 0;
}

function taskFailed(data) {
  const status = String(data?.data?.status || data?.status || "").toLowerCase();
  return ["failed", "failure", "error", "cancelled", "canceled"].includes(status);
}

async function pollTask(taskId, timeoutState) {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    refreshGenerationStatus(timeoutState, `正在查询图像任务 ${taskId}：${attempt}/${MAX_POLL_ATTEMPTS}`);
    setStatus(`正在查询任务 ${taskId}：${attempt}/${MAX_POLL_ATTEMPTS}`);
    await sleep(DEFAULT_POLL_INTERVAL_MS, timeoutState);

    const data = await requestJson(apiUrl(`/v1/images/tasks/${encodeURIComponent(taskId)}`), {
      method: "GET",
      headers: requestHeaders("application/json")
    }, timeoutState);

    if (taskFailed(data)) {
      throw new Error(data?.error?.message || data?.message || "图像任务失败。");
    }

    if (taskIsDone(data)) {
      return data?.data?.data || data?.data || data;
    }
  }
  throw new Error("图像任务查询超时。");
}

async function captureCurrentCanvasReference() {
  if (!app.documents.length) {
    throw new Error("添加参考图前，请先打开 Photoshop 文档。");
  }
  if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
    throw new Error(`最多只能添加 ${MAX_REFERENCE_IMAGES} 张参考图。`);
  }

  const activeDocument = app.activeDocument;
  const tempFolder = await storage.localFileSystem.getTemporaryFolder();
  const file = await tempFolder.createFile(`zhenzhen-reference-${Date.now()}.jpg`, { overwrite: true });

  await core.executeAsModal(async () => {
    await activeDocument.saveAs.jpg(file, { quality: 10 }, true);
  }, { commandName: "Capture reference image" });

  const bytes = await file.read({ format: storage.formats.binary });
  try {
    await file.delete();
  } catch (error) {
    // Temporary cleanup failure is non-fatal.
  }

  const blob = new Blob([bytes], { type: "image/jpeg" });
  return {
    bytes,
    name: activeDocument.title || `reference-${referenceImages.length + 1}.jpg`,
    url: URL.createObjectURL(blob)
  };
}

async function addCurrentCanvasReference() {
  setBusy(true);
  try {
    setStatus("正在获取当前画布...");
    const reference = await captureCurrentCanvasReference();
    referenceImages.push(reference);
    renderReferences();
    setStatus(`已添加参考图：${referenceImages.length}/${MAX_REFERENCE_IMAGES}`);
  } finally {
    setBusy(false);
  }
}

function removeReferenceImage(index) {
  if (index < 0 || index >= referenceImages.length) {
    return;
  }
  const item = referenceImages[index];
  if (item && item.url) {
    URL.revokeObjectURL(item.url);
  }
  referenceImages.splice(index, 1);
  renderReferences();
  setStatus(`已移除参考图：${referenceImages.length}/${MAX_REFERENCE_IMAGES}`);
}

function clearReferenceImages() {
  referenceImages.forEach((item) => {
    if (item.url) {
      URL.revokeObjectURL(item.url);
    }
  });
  referenceImages = [];
  renderReferences();
}

function renderReferences() {
  const list = element("referenceList");
  list.textContent = "";
  element("referenceCountText").textContent = `${referenceImages.length}/${MAX_REFERENCE_IMAGES}`;

  referenceImages.forEach((item, index) => {
    const wrapper = document.createElement("section");
    wrapper.className = "reference-cell";

    const inner = document.createElement("section");
    inner.className = "reference-cell-inner";

    const image = document.createElement("img");
    image.className = "reference-thumb";
    image.src = item.url;
    image.alt = `参考图 ${index + 1}`;
    inner.appendChild(image);

    const indexLabel = document.createElement("sp-label");
    indexLabel.className = "reference-index";
    indexLabel.textContent = `图 ${index + 1}`;
    inner.appendChild(indexLabel);

    const removeButton = document.createElement("sp-action-button");
    removeButton.className = "reference-remove";
    removeButton.setAttribute("quiet", "");
    removeButton.setAttribute("title", "移除参考图");
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      removeReferenceImage(index);
    });

    const removeLabel = document.createElement("sp-label");
    removeLabel.textContent = "❌️";
    removeButton.appendChild(removeLabel);
    inner.appendChild(removeButton);

    wrapper.appendChild(inner);
    list.appendChild(wrapper);
  });

  if (referenceImages.length < MAX_REFERENCE_IMAGES) {
    const wrapper = document.createElement("section");
    wrapper.className = "reference-cell reference-add-cell";

    const addButton = document.createElement("sp-button");
    addButton.className = "reference-add-tile";
    addButton.setAttribute("variant", "secondary");
    addButton.addEventListener("click", async () => {
      try {
        await addCurrentCanvasReference();
      } catch (error) {
        setStatus(error.message);
      }
    });

    const addIcon = document.createElement("sp-label");
    addIcon.className = "reference-add-icon";
    addIcon.textContent = "+";
    addButton.appendChild(addIcon);

    const addText = document.createElement("sp-label");
    addText.className = "reference-add-text";
    addText.textContent = "添加";
    addButton.appendChild(addText);

    wrapper.appendChild(addButton);
    list.appendChild(wrapper);
  }
}

function updateModeUi() {
  const isEditMode = getPickerValue("modePicker") === "img2img";
  element("referenceSection").classList.toggle("is-hidden", !isEditMode);
}

function countPromptLineUnits(line) {
  let units = 0;
  Array.from(line || "").forEach((char) => {
    units += /[\u0000-\u00ff]/u.test(char) ? 0.55 : 1;
  });
  return Math.max(1, units);
}

function updatePromptRows() {
  const promptInput = element("promptInput");
  const width = promptInput.clientWidth || 320;
  const unitsPerRow = Math.max(14, Math.floor(width / 12));
  const lines = String(promptInput.value || "").split(/\r?\n/u);
  const estimatedRows = lines.reduce((total, line) => {
    return total + Math.ceil(countPromptLineUnits(line) / unitsPerRow);
  }, 0);
  const nextRows = Math.min(PROMPT_MAX_ROWS, Math.max(PROMPT_MIN_ROWS, estimatedRows));
  promptInput.setAttribute("rows", String(nextRows));
}

function bindPromptAutoRows() {
  const promptInput = element("promptInput");
  promptInput.addEventListener("input", updatePromptRows);
  window.addEventListener("resize", updatePromptRows);
  updatePromptRows();
}

async function submitTextToImage(prompt, timeoutState) {
  const payload = appendCommonJsonPayload({ prompt });
  refreshGenerationStatus(timeoutState, `正在提交生成请求：模型 ${payload.model}，尺寸 ${payload.size}`);
  setStatus(`正在提交生成请求：模型 ${payload.model}，尺寸 ${payload.size}`);

  if (isGeminiImageModel(payload.model)) {
    return submitGeminiImages(prompt, [], timeoutState);
  }

  const useAsync = Boolean(element("asyncCheckbox").checked);
  return requestJson(apiUrl("/v1/images/generations", useAsync ? { async: "true" } : {}), {
    method: "POST",
    headers: requestHeaders("application/json"),
    body: JSON.stringify(payload)
  }, timeoutState);
}

async function submitImageEdit(prompt, timeoutState) {
  if (!referenceImages.length) {
    throw new Error("使用编辑模式前，请至少添加一张当前画布参考图。");
  }

  const model = getModelValue();
  if (isGeminiImageModel(model)) {
    return submitGeminiImages(prompt, referenceImages, timeoutState);
  }

  const form = new FormData();
  form.append("prompt", prompt);
  appendCommonFormFields(form);
  refreshGenerationStatus(timeoutState, `正在提交图像编辑请求：模型 ${getModelValue()}，尺寸 ${getActualSize()}`);
  setStatus(`正在提交图像编辑请求：模型 ${getModelValue()}，尺寸 ${getActualSize()}`);

  referenceImages.forEach((item, index) => {
    form.append("image", new Blob([item.bytes], { type: "image/jpeg" }), `reference_${index + 1}.jpg`);
  });

  const useAsync = Boolean(element("asyncCheckbox").checked);
  return requestJson(apiUrl("/v1/images/edits", useAsync ? { async: "true" } : {}), {
    method: "POST",
    headers: requestHeaders(),
    body: form
  }, timeoutState);
}

async function submitGeminiImage(prompt, images, timeoutState) {
  const model = getModelValue();
  const parts = [];
  images.forEach((item) => {
    parts.push({
      inlineData: {
        data: arrayBufferToBase64(item.bytes),
        mimeType: "image/jpeg"
      }
    });
  });
  parts.push({ text: prompt });

  const payload = {
    contents: [{
      parts,
      role: "user"
    }],
    generationConfig: {
      imageConfig: {
        aspectRatio: getGeminiAspectRatio(),
        imageSize: getGeminiImageSize()
      },
      responseModalities: ["IMAGE"]
    }
  };

  return requestJson(apiUrl(GEMINI_IMAGE_MODELS[model]), {
    method: "POST",
    headers: requestHeaders("application/json"),
    body: JSON.stringify(payload)
  }, timeoutState);
}

async function submitGeminiImages(prompt, images, timeoutState) {
  const count = getImageCount();
  const model = getModelValue();
  const aspectRatio = getGeminiAspectRatio();
  const imageSize = getGeminiImageSize();
  refreshGenerationStatus(timeoutState, `正在并发提交 Gemini 图像请求：共 ${count} 次，模型 ${model}，比例 ${aspectRatio}，尺寸 ${imageSize}`);
  setStatus(`正在并发提交 Gemini 图像请求：共 ${count} 次，模型 ${model}，比例 ${aspectRatio}，尺寸 ${imageSize}`);

  const results = [];
  const requests = Array.from({ length: count }, async (_, index) => {
    const data = await submitGeminiImage(prompt, images, timeoutState);
    const imageItems = extractImageItems(data);
    if (!imageItems.length) {
      throw new Error(`第 ${index + 1} 次 Gemini 请求没有返回图像。`);
    }
    imageItems.forEach((item) => results.push(item));
  });
  await Promise.all(requests);
  return { data: results };
}

function getImageExtension(item) {
  const mimeType = String(item.mime_type || item.mimeType || "").toLowerCase();
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }
  if (mimeType.includes("webp")) {
    return "webp";
  }
  return DEFAULT_OUTPUT_FORMAT;
}

function createResultFileName(index, extension) {
  resultFileSequence += 1;
  return `zhenzhen-result-${Date.now()}-${resultFileSequence}-${index}.${extension}`;
}

async function fileFromBase64(item, index, timeoutState) {
  assertGenerationNotTimedOut(timeoutState);
  const b64 = String(item.b64_json || "").replace(/^data:image\/[a-z]+;base64,/iu, "");
  const bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
  assertGenerationNotTimedOut(timeoutState);
  const tempFolder = await storage.localFileSystem.getTemporaryFolder();
  const extension = getImageExtension(item);
  const file = await tempFolder.createFile(createResultFileName(index, extension), { overwrite: true });
  assertGenerationNotTimedOut(timeoutState);
  await file.write(bytes.buffer, { format: storage.formats.binary });
  assertGenerationNotTimedOut(timeoutState);
  return file;
}

async function fileFromUrl(item, index, timeoutState) {
  assertGenerationNotTimedOut(timeoutState);
  const requestOptions = timeoutState?.controller ? { signal: timeoutState.controller.signal } : {};
  const response = await fetch(item.url, requestOptions);
  assertGenerationNotTimedOut(timeoutState);
  if (!response.ok) {
    throw new Error(`无法下载生成图像：HTTP ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  assertGenerationNotTimedOut(timeoutState);
  const tempFolder = await storage.localFileSystem.getTemporaryFolder();
  const extension = DEFAULT_OUTPUT_FORMAT;
  const file = await tempFolder.createFile(createResultFileName(index, extension), { overwrite: true });
  assertGenerationNotTimedOut(timeoutState);
  await file.write(bytes, { format: storage.formats.binary });
  assertGenerationNotTimedOut(timeoutState);
  return file;
}

async function saveResultFiles(items, timeoutState) {
  const files = [];
  for (let index = 0; index < items.length; index += 1) {
    assertGenerationNotTimedOut(timeoutState);
    const item = items[index];
    if (item.b64_json) {
      files.push(await fileFromBase64(item, index, timeoutState));
    } else if (item.url) {
      files.push(await fileFromUrl(item, index, timeoutState));
    }
  }
  return files;
}

function updateResultButtons(isBusy) {
  const hasResults = lastResultFiles.length > 0;
  const hasMultipleResults = lastResultFiles.length > 1;
  element("exportCurrentButton").disabled = isBusy || !hasResults;
  element("exportAllButton").disabled = isBusy || !hasResults;
  element("deleteCurrentResultButton").disabled = isBusy || !hasResults;
  element("clearResultsButton").disabled = isBusy || !hasResults;
  element("resultPager").classList.toggle("is-hidden", !hasMultipleResults);
  element("prevResultButton").disabled = isBusy || !hasMultipleResults || currentResultIndex <= 0;
  element("nextResultButton").disabled = isBusy || !hasMultipleResults || currentResultIndex >= lastResultFiles.length - 1;
}

function clearResultPreview() {
  lastResultFiles = [];
  currentResultIndex = 0;
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = "";
  }
  element("previewImage").removeAttribute("src");
  element("resultPreviewSection").classList.add("is-hidden");
  element("resultPageText").textContent = "1/1";
  updateResultButtons(element("generateButton").disabled);
}

async function deleteResultFile(file) {
  if (!file || typeof file.delete !== "function") {
    return;
  }
  try {
    await file.delete();
  } catch (error) {
    // Temporary cleanup failure is non-fatal.
  }
}

async function appendResultFiles(files) {
  if (!files.length) {
    return;
  }
  const wasEmpty = lastResultFiles.length === 0;
  files.forEach((file) => lastResultFiles.push(file));
  if (wasEmpty) {
    await showResultPreview(0);
    return;
  }
  element("resultPreviewSection").classList.remove("is-hidden");
  element("resultPageText").textContent = `${currentResultIndex + 1}/${lastResultFiles.length}`;
  updateResultButtons(element("generateButton").disabled);
}

async function deleteCurrentResult() {
  if (!lastResultFiles.length) {
    setStatus("还没有可删除的生成图像。");
    return;
  }
  const removedFiles = lastResultFiles.splice(currentResultIndex, 1);
  for (const file of removedFiles) {
    await deleteResultFile(file);
  }
  if (!lastResultFiles.length) {
    clearResultPreview();
    setStatus("结果预览已清空。");
    return;
  }
  await showResultPreview(Math.min(currentResultIndex, lastResultFiles.length - 1));
  setStatus(`已删除当前结果，剩余 ${lastResultFiles.length} 张。`);
}

async function clearAllResults() {
  if (!lastResultFiles.length) {
    clearResultPreview();
    return;
  }
  const files = lastResultFiles.slice();
  clearResultPreview();
  for (const file of files) {
    await deleteResultFile(file);
  }
  setStatus("结果预览已清空。");
}

async function showResultPreview(index) {
  if (!lastResultFiles.length) {
    clearResultPreview();
    return;
  }
  currentResultIndex = Math.min(Math.max(index, 0), lastResultFiles.length - 1);
  const file = lastResultFiles[currentResultIndex];
  const bytes = await file.read({ format: storage.formats.binary });
  const extension = String(file.name || "").split(".").pop() || "png";
  const blob = new Blob([bytes], { type: `image/${extension === "jpg" ? "jpeg" : extension}` });
  const preview = element("previewImage");
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
  }
  currentPreviewUrl = URL.createObjectURL(blob);
  preview.src = currentPreviewUrl;
  element("resultPreviewSection").classList.remove("is-hidden");
  element("resultPageText").textContent = `${currentResultIndex + 1}/${lastResultFiles.length}`;
  updateResultButtons(element("generateButton").disabled);
}

async function showAdjacentResult(offset) {
  if (!lastResultFiles.length) {
    return;
  }
  await showResultPreview(currentResultIndex + offset);
}

function numericValue(value) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value.value === "number") {
    return value.value;
  }
  return Number(value) || 0;
}

async function insertFilesIntoPhotoshop(files) {
  await core.executeAsModal(async () => {
    const activeDocument = app.documents.length ? app.activeDocument : null;
    for (const file of files) {
      if (!activeDocument) {
        await app.open(file);
        continue;
      }

      const fileToken = await storage.localFileSystem.createSessionToken(file);
      await action.batchPlay([{
        _obj: "placeEvent",
        "null": { _path: fileToken, _kind: "local" }
      }], { synchronousExecution: true });

      const newLayer = activeDocument.activeLayers && activeDocument.activeLayers[0];
      if (!newLayer || !newLayer.bounds) {
        continue;
      }

      const bounds = newLayer.bounds;
      const boundsWidth = numericValue(bounds.right) - numericValue(bounds.left);
      const boundsHeight = numericValue(bounds.bottom) - numericValue(bounds.top);
      const docWidth = numericValue(activeDocument.width);
      const docHeight = numericValue(activeDocument.height);
      if (boundsWidth <= 0 || boundsHeight <= 0 || docWidth <= 0 || docHeight <= 0) {
        continue;
      }

      const scalePercent = Math.max(docWidth / boundsWidth, docHeight / boundsHeight) * 100;
      await newLayer.scale(scalePercent, scalePercent);
      const newBounds = newLayer.bounds;
      await newLayer.translate(-numericValue(newBounds.left), -numericValue(newBounds.top));
    }
  }, { commandName: "插入生成图像" });
}

async function runGenerationFlow(prompt, timeoutState) {
  const mode = getPickerValue("modePicker");
  const submitResult = mode === "img2img"
    ? await submitImageEdit(prompt, timeoutState)
    : await submitTextToImage(prompt, timeoutState);
  assertGenerationNotTimedOut(timeoutState);

  const taskId = extractTaskId(submitResult);
  const directImages = extractImageItems(submitResult);
  if (!directImages.length && !taskId) {
    throw new Error("接口没有返回图像数据或 task_id。");
  }

  const finalResult = directImages.length > 0 ? submitResult : await pollTask(taskId, timeoutState);
  assertGenerationNotTimedOut(timeoutState);

  const images = extractImageItems(finalResult);
  if (!images.length) {
    throw new Error("接口没有返回图像 URL 或 base64 图像。");
  }

  refreshGenerationStatus(timeoutState, "正在保存生成图像...");
  const resultFiles = await saveResultFiles(images, timeoutState);
  assertGenerationNotTimedOut(timeoutState);

  await appendResultFiles(resultFiles);
  assertGenerationNotTimedOut(timeoutState);

  const elapsedSeconds = Math.floor((Date.now() - timeoutState.startedAt) / 1000);
  setStatus(`完成。已追加 ${resultFiles.length} 张图像，当前共 ${lastResultFiles.length} 张。总用时 ${elapsedSeconds} 秒`);
  finishGenerationStatus(timeoutState, `完成。已追加 ${resultFiles.length} 张图像，当前共 ${lastResultFiles.length} 张。总用时 ${elapsedSeconds} 秒`);
}

async function generate() {
  const prompt = String(element("promptInput").value || "").trim();
  if (!prompt) {
    throw new Error("请输入提示词。");
  }

  activeGenerationCount += 1;
  const timeoutState = startGenerationTimeout(`正在提交图像请求... 当前进行中 ${activeGenerationCount} 个`);
  try {
    return await Promise.race([
      runGenerationFlow(prompt, timeoutState),
      timeoutState.timeoutPromise
    ]);
  } catch (error) {
    if (timeoutState.timedOut || isAbortError(error)) {
      finishGenerationStatus(timeoutState, `已超时（${getGenerationTimeoutSeconds()} 秒），已停止等待`);
      return;
    }
    finishGenerationStatus(timeoutState, `失败：${error.message}`);
    return;
  } finally {
    stopGenerationTimeout(timeoutState);
    activeGenerationCount = Math.max(0, activeGenerationCount - 1);
    updateResultButtons(element("generateButton").disabled);
  }
  setStatus(`正在提交图像请求... 当前进行中 ${activeGenerationCount} 个`);

  try {
    const mode = getPickerValue("modePicker");
    const submitResult = mode === "img2img"
      ? await submitImageEdit(prompt)
      : await submitTextToImage(prompt);

    const taskId = extractTaskId(submitResult);
    const directImages = extractImageItems(submitResult);
    if (!directImages.length && !taskId) {
      throw new Error("接口没有返回图像数据或 task_id。");
    }
    const finalResult = directImages.length > 0 ? submitResult : await pollTask(taskId);

    const images = extractImageItems(finalResult);
    if (!images.length) {
      throw new Error("接口没有返回图像 URL 或 base64 图像。");
    }

    setStatus("正在保存生成图像...");
    const resultFiles = await saveResultFiles(images);
    await appendResultFiles(resultFiles);
    setStatus(`完成。已追加 ${resultFiles.length} 张图像，当前共 ${lastResultFiles.length} 张。`);
  } finally {
    activeGenerationCount = Math.max(0, activeGenerationCount - 1);
    updateResultButtons(element("generateButton").disabled);
  }
}

async function exportCurrentResult() {
  if (!lastResultFiles.length) {
    setStatus("还没有可导出的生成图像。");
    return;
  }
  await insertFilesIntoPhotoshop([lastResultFiles[currentResultIndex]]);
  setStatus(`已导出第 ${currentResultIndex + 1} 张图像到 Photoshop。`);
}

async function exportAllResults() {
  if (!lastResultFiles.length) {
    setStatus("还没有可导出的生成图像。");
    return;
  }
  await insertFilesIntoPhotoshop(lastResultFiles);
  setStatus(`已导出全部 ${lastResultFiles.length} 张图像到 Photoshop。`);
}

function bindEvents() {
  element("connectionModuleButton").addEventListener("click", () => {
    setActiveModule("connection");
  });

  element("generateModuleButton").addEventListener("click", () => {
    setActiveModule("generate");
  });

  const syncInterfacePicker = () => {
    setTimeout(async () => {
      try {
        const nextId = readPickerDomValue(element("interfacePicker"));
        if (nextId && nextId !== settings.currentInterfaceId) {
          await selectInterface(nextId);
        }
      } catch (error) {
        setStatus(error.message);
      }
    }, 0);
  };

  element("interfacePicker").addEventListener("change", syncInterfacePicker);
  element("interfacePicker").addEventListener("input", syncInterfacePicker);

  element("interfacePicker").addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showInterfaceActionMenu();
  });

  element("interfacePickerRow").addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showInterfaceActionMenu();
  });

  element("addInterfaceButton").addEventListener("click", () => {
    showInterfaceForm("");
  });

  element("editInterfaceButton").addEventListener("click", () => {
    showInterfaceForm(settings.currentInterfaceId);
  });

  element("deleteInterfaceButton").addEventListener("click", async () => {
    try {
      await deleteCurrentInterface();
    } catch (error) {
      setStatus(error.message);
    }
  });

  element("cancelInterfaceActionButton").addEventListener("click", () => {
    hideInterfaceActionMenu();
  });

  element("saveInterfaceButton").addEventListener("click", async () => {
    try {
      await saveInterfaceFromForm();
    } catch (error) {
      setStatus(error.message);
    }
  });

  element("cancelInterfaceButton").addEventListener("click", () => {
    hideInterfaceForm();
  });

  element("generateButton").addEventListener("click", async () => {
    try {
      await saveSettings();
      await generate();
    } catch (error) {
      setStatus(error.message);
    }
  });

  element("clearReferencesButton").addEventListener("click", () => {
    clearReferenceImages();
    setStatus("参考图已清空。");
  });

  element("deleteCurrentResultButton").addEventListener("click", async () => {
    setBusy(true);
    try {
      await deleteCurrentResult();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  });

  element("clearResultsButton").addEventListener("click", async () => {
    setBusy(true);
    try {
      await clearAllResults();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  });

  element("prevResultButton").addEventListener("click", async (event) => {
    try {
      await showAdjacentResult(-1);
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.currentTarget.blur();
    }
  });

  element("nextResultButton").addEventListener("click", async (event) => {
    try {
      await showAdjacentResult(1);
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.currentTarget.blur();
    }
  });

  element("exportCurrentButton").addEventListener("click", async () => {
    setBusy(true);
    try {
      await exportCurrentResult();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  });

  element("exportAllButton").addEventListener("click", async () => {
    setBusy(true);
    try {
      await exportAllResults();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  });
}

function bindPicker(id) {
  const picker = element(id);
  if (!picker) {
    return;
  }
  const sync = () => {
    setTimeout(() => {
      const value = readPickerDomValue(picker);
      if (value) {
        setPickerValue(id, value);
        if (id === "modePicker") {
          updateModeUi();
        }
      }
    }, 0);
  };
  picker.addEventListener("change", sync);
  picker.addEventListener("input", sync);
}

function bindPickers() {
  [
    "modePicker",
    "modelPicker",
    "aspectRatioPicker",
    "resolutionPicker",
    "qualityPicker"
  ].forEach(bindPicker);
}

function setPickerDefault(id, value) {
  if (!getPickerValue(id)) {
    setPickerValue(id, value);
  }
}

function initializePickerDefaults() {
  setPickerDefault("modePicker", "text2img");
  setPickerDefault("modelPicker", "gpt-image-2");
  setPickerDefault("aspectRatioPicker", "auto");
  setPickerDefault("resolutionPicker", "1k");
  setPickerDefault("qualityPicker", "auto");
}

let aiAssistantInitialized = false;

async function initAIAssistant() {
  if (aiAssistantInitialized) {
    return;
  }
  aiAssistantInitialized = true;
  bindEvents();
  bindPickers();
  bindPromptAutoRows();
  initializePickerDefaults();
  renderReferences();
  clearResultPreview();
  updateModeUi();
  await loadSettings();
  setStatus("就绪。");
}

window.initAIAssistant = initAIAssistant;
})();
