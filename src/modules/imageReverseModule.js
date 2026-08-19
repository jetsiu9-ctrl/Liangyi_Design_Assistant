(function() {
"use strict";

const { app, core } = require("photoshop");
const { storage } = require("uxp");

const MAX_IMAGES = 8;
const MODULE_SETTINGS_KEY = "liangyi-image-reverse-settings";
const DEFAULT_PROVIDER = "gemini";
const MODEL_PRESETS = {
  openai: [
    { value: "gpt-5.6-sol", label: "gpt-5.6-sol" }
  ],
  gemini: [
    { value: "gemini-3.5-flash", label: "gemini-3.5-flash" },
    { value: "gemini-3.6-flash", label: "gemini-3.6-flash" }
  ]
};
const PRESET_FILES = {
  reverse: "src/prompts/image-reverse-preset.txt",
  edit: "src/prompts/image-edit-preset.txt"
};
const DEFAULT_USER_INSTRUCTIONS = {
  reverse: "请分析参考图，并严格按照系统预设输出有效 JSON。",
  edit: "请分析全部图片，并严格按照系统预设输出图像编辑提示词 JSON。",
  none: "请分析这些图片并返回可直接复制使用的文本结果。"
};

let root = null;
let images = [];
let presetCache = {};
let activeRequestCount = 0;
let requestSequence = 0;
let referenceFileSequence = 0;
let captureInProgress = false;
let resultHistory = [];
let currentResultIndex = 0;
let initialized = false;
let globalStatusMessage = "就绪。";
const requestStatusItems = new Map();

function element(id) {
  return root ? root.querySelector(`#${id}`) : document.getElementById(id);
}

function getPickerValue(id) {
  const picker = element(id);
  if (!picker) {
    return "";
  }
  if (picker.value) {
    return String(picker.value);
  }
  const selected = picker.querySelector("sp-menu-item[selected]");
  return selected ? String(selected.value || "") : "";
}

function setPickerValue(id, value) {
  const picker = element(id);
  if (!picker) {
    return;
  }
  picker.value = value;
  picker.querySelectorAll("sp-menu-item").forEach((item) => {
    if (String(item.value) === String(value)) {
      item.setAttribute("selected", "");
    } else {
      item.removeAttribute("selected");
    }
  });
}

function setStatus(message) {
  globalStatusMessage = message;
  if (requestStatusItems.size > 0 && !hasActiveRequestStatuses()) {
    requestStatusItems.clear();
  }
  renderStatus();
}

function hasActiveRequestStatuses() {
  return Array.from(requestStatusItems.values()).some((item) => item.active);
}

function formatRequestStatus(item) {
  const currentTime = item.finishedAt || Date.now();
  const elapsedSeconds = Math.min(
    item.timeoutSeconds,
    Math.floor((currentTime - item.startedAt) / 1000)
  );
  return `${item.label}：${item.message} 用时 ${elapsedSeconds}/${item.timeoutSeconds} 秒`;
}

function renderStatus() {
  const status = element("imageReverseStatusText");
  if (status) {
    const items = Array.from(requestStatusItems.values());
    status.textContent = items.length
      ? items.map(formatRequestStatus).join("\n")
      : globalStatusMessage;
  }
}

function startRequestStatus(requestId, timeoutSeconds, message) {
  if (requestStatusItems.size > 0 && !hasActiveRequestStatuses()) {
    requestStatusItems.clear();
  }
  const item = {
    active: true,
    finishedAt: null,
    id: `reverse-${Date.now()}-${requestId}`,
    intervalId: null,
    label: `请求 #${requestId}`,
    message,
    startedAt: Date.now(),
    timeoutSeconds
  };
  requestStatusItems.set(item.id, item);
  item.intervalId = setInterval(renderStatus, 1000);
  renderStatus();
  return item;
}

function finishRequestStatus(item, message) {
  if (!item) {
    return;
  }
  clearInterval(item.intervalId);
  item.active = false;
  item.finishedAt = Date.now();
  item.message = message;
  renderStatus();
}

function getConnectionSettings() {
  if (!window.LiangyiAIConfig || typeof window.LiangyiAIConfig.getCurrent !== "function") {
    throw new Error("连接设置尚未初始化，请重新打开插件面板。");
  }
  const config = window.LiangyiAIConfig.getCurrent();
  const baseUrl = String(config.baseUrl || "").trim().replace(/\/+$/u, "");
  const apiKey = String(config.apiKey || "").trim();
  if (!baseUrl) {
    throw new Error("请先在“连接设置”中填写接口地址。");
  }
  if (!apiKey) {
    throw new Error("请先在“连接设置”中填写并保存 API 密钥。");
  }
  return {
    baseUrl,
    apiKey,
    timeoutSeconds: Number(config.timeoutSeconds) > 0 ? Number(config.timeoutSeconds) : 300
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function revokePreview(item) {
  if (item && item.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function clearImages() {
  images.forEach(revokePreview);
  images = [];
  renderImages();
  saveModuleSettings();
}

function removeImage(index) {
  if (index < 0 || index >= images.length) {
    return;
  }
  revokePreview(images[index]);
  images.splice(index, 1);
  renderImages();
}

function renderImages() {
  const list = element("imageReverseImageList");
  const count = element("imageReverseImageCount");
  const clearButton = element("imageReverseClearImagesButton");
  if (!list || !count) {
    return;
  }
  list.textContent = "";
  images.forEach((item, index) => {
    const wrapper = document.createElement("section");
    wrapper.className = "reference-cell";

    const inner = document.createElement("section");
    inner.className = "reference-cell-inner";

    const preview = document.createElement("img");
    preview.className = "reference-thumb";
    preview.src = item.previewUrl;
    preview.alt = `参考图 ${index + 1}`;
    inner.appendChild(preview);

    const indexLabel = document.createElement("sp-label");
    indexLabel.className = "reference-index";
    indexLabel.textContent = `图 ${index + 1}`;
    inner.appendChild(indexLabel);

    const remove = document.createElement("sp-action-button");
    remove.className = "reference-remove";
    remove.setAttribute("quiet", "");
    remove.setAttribute("title", "移除参考图");
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeImage(index);
    });
    const removeLabel = document.createElement("sp-label");
    removeLabel.textContent = "❌️";
    remove.appendChild(removeLabel);
    inner.appendChild(remove);

    wrapper.appendChild(inner);
    list.appendChild(wrapper);
  });

  if (images.length < MAX_IMAGES) {
    const wrapper = document.createElement("section");
    wrapper.className = "reference-cell reference-add-cell";

    const addButton = document.createElement("sp-button");
    addButton.className = "reference-add-tile";
    addButton.setAttribute("variant", "secondary");
    addButton.disabled = captureInProgress;
    addButton.addEventListener("click", addCurrentCanvasReference);

    const addIcon = document.createElement("sp-label");
    addIcon.className = "reference-add-icon";
    addIcon.textContent = "+";
    addButton.appendChild(addIcon);

    const addText = document.createElement("sp-label");
    addText.className = "reference-add-text";
    addText.textContent = captureInProgress ? "获取中" : "添加";
    addButton.appendChild(addText);

    wrapper.appendChild(addButton);
    list.appendChild(wrapper);
  }

  count.textContent = `${images.length}/${MAX_IMAGES}`;
  if (clearButton) {
    clearButton.disabled = images.length === 0;
  }
}

async function captureCurrentCanvasReference() {
  if (!app.documents.length) {
    throw new Error("添加参考图前，请先打开 Photoshop 文档。");
  }
  if (images.length >= MAX_IMAGES) {
    throw new Error(`最多只能添加 ${MAX_IMAGES} 张参考图。`);
  }

  const activeDocument = app.activeDocument;
  const tempFolder = await storage.localFileSystem.getTemporaryFolder();
  referenceFileSequence += 1;
  const file = await tempFolder.createFile(
    `liangyi-reference-${Date.now()}-${referenceFileSequence}.jpg`,
    { overwrite: true }
  );

  await core.executeAsModal(async () => {
    await activeDocument.saveAs.jpg(file, { quality: 10 }, true);
  }, { commandName: "Capture reverse reference image" });

  const bytes = await file.read({ format: storage.formats.binary });
  try {
    await file.delete();
  } catch (error) {
    // Temporary cleanup failure is non-fatal.
  }

  return {
    name: activeDocument.title || `reference-${images.length + 1}.jpg`,
    mimeType: "image/jpeg",
    base64: arrayBufferToBase64(bytes),
    previewUrl: URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }))
  };
}

async function addCurrentCanvasReference() {
  if (captureInProgress) {
    return;
  }
  captureInProgress = true;
  renderImages();
  setStatus("正在获取当前 Photoshop 画布…");
  try {
    const reference = await captureCurrentCanvasReference();
    images.push(reference);
    renderImages();
    setStatus(`已添加当前画布：${images.length}/${MAX_IMAGES}`);
  } catch (error) {
    setStatus(`添加参考图失败：${error.message}`);
  } finally {
    captureInProgress = false;
    renderImages();
  }
}

async function loadPreset(preset) {
  if (preset === "none") {
    return "";
  }
  if (presetCache[preset]) {
    return presetCache[preset];
  }
  const path = PRESET_FILES[preset];
  if (!path) {
    throw new Error("未找到所选提示词预设。");
  }
  const pluginFolder = await storage.localFileSystem.getPluginFolder();
  const file = await pluginFolder.getEntry(path);
  const text = await file.read();
  presetCache[preset] = String(text || "").trim();
  return presetCache[preset];
}

function getModelName() {
  const modelChoice = getPickerValue("imageReverseModelPicker");
  if (modelChoice && modelChoice !== "custom") {
    return modelChoice;
  }
  return String(element("imageReverseCustomModelInput").value || "").trim();
}

function renderModelPicker(provider, preferredModel) {
  const menu = element("imageReverseModelPickerMenu");
  const presets = MODEL_PRESETS[provider] || MODEL_PRESETS[DEFAULT_PROVIDER];
  const validValues = presets.map((item) => item.value).concat("custom");
  const selectedValue = validValues.includes(preferredModel)
    ? preferredModel
    : presets[0].value;
  menu.textContent = "";
  presets.concat({ value: "custom", label: "使用自定义模型" }).forEach((preset) => {
    const item = document.createElement("sp-menu-item");
    item.value = preset.value;
    item.textContent = preset.label;
    if (preset.value === selectedValue) {
      item.setAttribute("selected", "");
    }
    menu.appendChild(item);
  });
  setPickerValue("imageReverseModelPicker", selectedValue);
  updateModelUi();
}

function updateModelUi() {
  const isCustom = getPickerValue("imageReverseModelPicker") === "custom";
  const input = element("imageReverseCustomModelInput");
  input.disabled = !isCustom;
  saveModuleSettings();
}

function buildOpenAiUrl(baseUrl) {
  if (/\/chat\/completions$/iu.test(baseUrl)) {
    return baseUrl;
  }
  if (/\/v1$/iu.test(baseUrl)) {
    return `${baseUrl}/chat/completions`;
  }
  return `${baseUrl}/v1/chat/completions`;
}

function buildGeminiUrl(baseUrl, model) {
  if (/:[a-z]+$/iu.test(baseUrl) && /\/models\//iu.test(baseUrl)) {
    return baseUrl;
  }
  const encodedModel = encodeURIComponent(String(model).replace(/^models\//iu, ""));
  if (/\/v1beta\/models$/iu.test(baseUrl)) {
    return `${baseUrl}/${encodedModel}:generateContent`;
  }
  if (/\/v1beta$/iu.test(baseUrl)) {
    return `${baseUrl}/models/${encodedModel}:generateContent`;
  }
  return `${baseUrl}/v1beta/models/${encodedModel}:generateContent`;
}

async function requestJson(url, options, timeoutSeconds) {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutSeconds * 1000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
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
  } catch (error) {
    if (didTimeout || error?.name === "AbortError") {
      throw new Error(`图像反推已超时（${timeoutSeconds} 秒），请求已停止。`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestOpenAi(config, model, systemPrompt, userPrompt, requestImages) {
  const content = [{ type: "text", text: userPrompt }];
  requestImages.forEach((item) => {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${item.mimeType};base64,${item.base64}`
      }
    });
  });
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content });
  const data = await requestJson(buildOpenAiUrl(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2
    })
  }, config.timeoutSeconds);
  const result = data.choices?.[0]?.message?.content;
  if (typeof result === "string") {
    return result;
  }
  if (Array.isArray(result)) {
    return result.map((part) => part?.text || part?.content || "").join("\n").trim();
  }
  throw new Error("OpenAI 接口未返回可识别的文本结果。");
}

async function requestGemini(config, model, systemPrompt, userPrompt, requestImages) {
  const parts = [{ text: userPrompt }];
  requestImages.forEach((item) => {
    parts.push({
      inlineData: {
        mimeType: item.mimeType,
        data: item.base64
      }
    });
  });
  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.2 }
  };
  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }
  const data = await requestJson(buildGeminiUrl(config.baseUrl, model), {
    method: "POST",
    headers: {
      "x-goog-api-key": config.apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, config.timeoutSeconds);
  const resultParts = data.candidates?.[0]?.content?.parts;
  if (!Array.isArray(resultParts)) {
    const reason = data.promptFeedback?.blockReason;
    throw new Error(reason ? `Gemini 拒绝了请求：${reason}` : "Gemini 接口未返回可识别的文本结果。");
  }
  const result = resultParts.map((part) => part?.text || "").join("\n").trim();
  if (!result) {
    throw new Error("Gemini 接口返回的文本结果为空。");
  }
  return result;
}

function formatResult(raw, preset) {
  let text = String(raw || "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  if (fenced) {
    text = fenced[1].trim();
  }
  if (preset !== "none") {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch (error) {
      return text;
    }
  }
  return text;
}

function renderCurrentResult() {
  const section = element("imageReverseResultSection");
  const output = element("imageReverseResultText");
  const copyButton = element("imageReverseCopyButton");
  const deleteButton = element("imageReverseDeleteResultButton");
  const clearButton = element("imageReverseClearResultButton");
  const previousButton = element("imageReversePrevResultButton");
  const nextButton = element("imageReverseNextResultButton");
  const pageText = element("imageReverseResultPageText");
  const hasResults = resultHistory.length > 0;

  if (!hasResults) {
    output.value = "";
    section.classList.add("is-hidden");
    copyButton.disabled = true;
    deleteButton.disabled = true;
    clearButton.disabled = true;
    previousButton.disabled = true;
    nextButton.disabled = true;
    pageText.textContent = "0/0";
    return;
  }

  currentResultIndex = Math.min(
    Math.max(0, currentResultIndex),
    resultHistory.length - 1
  );
  output.value = resultHistory[currentResultIndex].text;
  section.classList.remove("is-hidden");
  copyButton.disabled = false;
  deleteButton.disabled = false;
  clearButton.disabled = false;
  previousButton.disabled = currentResultIndex <= 0;
  nextButton.disabled = currentResultIndex >= resultHistory.length - 1;
  pageText.textContent = `${currentResultIndex + 1}/${resultHistory.length}`;
}

function appendResult(text, metadata) {
  resultHistory.push({
    text,
    requestId: metadata.requestId,
    provider: metadata.provider,
    model: metadata.model,
    completedAt: Date.now()
  });
  currentResultIndex = resultHistory.length - 1;
  renderCurrentResult();
}

function showPreviousResult() {
  if (currentResultIndex <= 0) {
    return;
  }
  currentResultIndex -= 1;
  renderCurrentResult();
}

function showNextResult() {
  if (currentResultIndex >= resultHistory.length - 1) {
    return;
  }
  currentResultIndex += 1;
  renderCurrentResult();
}

function deleteCurrentResult() {
  if (!resultHistory.length) {
    return;
  }
  resultHistory.splice(currentResultIndex, 1);
  if (currentResultIndex >= resultHistory.length) {
    currentResultIndex = Math.max(0, resultHistory.length - 1);
  }
  renderCurrentResult();
  setStatus(resultHistory.length
    ? `已删除当前结果，剩余 ${resultHistory.length} 条。`
    : "已删除最后一条文本结果。");
}

function clearAllResults() {
  resultHistory = [];
  currentResultIndex = 0;
  renderCurrentResult();
}

async function copyResult() {
  const current = resultHistory[currentResultIndex];
  if (!current || !current.text) {
    return;
  }
  const text = current.text;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
    } else if (navigator.clipboard && typeof navigator.clipboard.setContent === "function") {
      await navigator.clipboard.setContent({ "text/plain": text });
    } else {
      throw new Error("当前 UXP 版本不支持剪贴板写入。");
    }
    setStatus("结果已复制到剪贴板。");
  } catch (error) {
    setStatus(`复制失败：${error.message}`);
  }
}

function saveModuleSettings() {
  try {
    localStorage.setItem(MODULE_SETTINGS_KEY, JSON.stringify({
      preset: getPickerValue("imageReversePresetPicker") || "reverse",
      model: getPickerValue("imageReverseModelPicker") || "",
      customModel: String(element("imageReverseCustomModelInput").value || ""),
      prompt: String(element("imageReversePromptInput").value || "")
    }));
  } catch (error) {
    // Module preferences are optional; connection settings remain the source of truth.
  }
}

function loadModuleSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(MODULE_SETTINGS_KEY) || "{}");
  } catch (error) {
    saved = {};
  }
  setPickerValue("imageReverseProviderPicker", DEFAULT_PROVIDER);
  setPickerValue("imageReversePresetPicker", saved.preset || "reverse");
  element("imageReverseCustomModelInput").value = saved.customModel || "";
  element("imageReversePromptInput").value = saved.prompt || "";
  updateProviderUi(saved.model || (saved.customModel ? "custom" : ""));
  updatePresetUi();
}

function updateProviderUi(preferredModel) {
  const provider = getPickerValue("imageReverseProviderPicker") || DEFAULT_PROVIDER;
  const requestedModel = typeof preferredModel === "string"
    ? preferredModel
    : getPickerValue("imageReverseModelPicker");
  renderModelPicker(provider, requestedModel);
  saveModuleSettings();
}

function updatePresetUi() {
  const preset = getPickerValue("imageReversePresetPicker") || "reverse";
  const button = element("imageReverseStartButton");
  button.textContent = preset === "edit" ? "开始生成编辑提示词" : "开始反推";
  saveModuleSettings();
}

async function startReverse() {
  const model = getModelName();
  if (!model) {
    setStatus("请填写支持图像理解的自定义模型名称。");
    return;
  }
  const provider = getPickerValue("imageReverseProviderPicker") || DEFAULT_PROVIDER;
  const preset = getPickerValue("imageReversePresetPicker") || "reverse";
  const userInput = String(element("imageReversePromptInput").value || "").trim();
  if (preset === "none" && !userInput) {
    setStatus("不使用预设时，请填写提示词。");
    return;
  }

  saveModuleSettings();
  let config;
  try {
    config = getConnectionSettings();
  } catch (error) {
    setStatus(`反推失败：${error.message}`);
    return;
  }

  const requestId = ++requestSequence;
  const requestImages = images.map((item) => ({
    mimeType: item.mimeType,
    base64: item.base64
  }));
  activeRequestCount += 1;
  const requestStatus = startRequestStatus(
    requestId,
    config.timeoutSeconds,
    `正在通过 ${provider === "gemini" ? "Gemini" : "OpenAI"} / ${model} 处理` +
    `，参考图 ${requestImages.length} 张，当前进行中 ${activeRequestCount} 个`
  );

  let completionMessage = "";
  try {
    const systemPrompt = await loadPreset(preset);
    let userPrompt = userInput
      ? `${DEFAULT_USER_INSTRUCTIONS[preset]}\n\n用户补充要求：\n${userInput}`
      : DEFAULT_USER_INSTRUCTIONS[preset];
    if (!requestImages.length) {
      userPrompt += "\n\n当前未提供参考图，请直接依据系统预设和用户要求完成任务。";
    }
    const raw = provider === "gemini"
      ? await requestGemini(config, model, systemPrompt, userPrompt, requestImages)
      : await requestOpenAi(config, model, systemPrompt, userPrompt, requestImages);
    const result = formatResult(raw, preset);
    if (!result) {
      throw new Error("模型返回了空结果。");
    }
    appendResult(result, {
      requestId,
      provider,
      model
    });
    completionMessage = `请求 #${requestId} 完成，结果可直接选择或复制。`;
  } catch (error) {
    completionMessage = `请求 #${requestId} 失败：${error.message}`;
  } finally {
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    const remainingMessage = activeRequestCount > 0
      ? ` 当前仍有 ${activeRequestCount} 个请求进行中。`
      : "";
    finishRequestStatus(requestStatus, completionMessage + remainingMessage);
  }
}

function bindEvents() {
  element("imageReverseClearImagesButton").addEventListener("click", () => {
    clearImages();
    setStatus("已清空参考图。");
  });
  element("imageReverseStartButton").addEventListener("click", startReverse);
  element("imageReversePrevResultButton").addEventListener("click", showPreviousResult);
  element("imageReverseNextResultButton").addEventListener("click", showNextResult);
  element("imageReverseCopyButton").addEventListener("click", copyResult);
  element("imageReverseDeleteResultButton").addEventListener("click", deleteCurrentResult);
  element("imageReverseClearResultButton").addEventListener("click", () => {
    clearAllResults();
    setStatus("已清空全部文本结果。");
  });
  ["change", "input"].forEach((eventName) => {
    element("imageReverseProviderPicker").addEventListener(eventName, updateProviderUi);
    element("imageReverseModelPicker").addEventListener(eventName, updateModelUi);
    element("imageReversePresetPicker").addEventListener(eventName, updatePresetUi);
  });
  element("imageReverseCustomModelInput").addEventListener("change", saveModuleSettings);
  element("imageReversePromptInput").addEventListener("change", saveModuleSettings);
}

async function initImageReverse(rootNode) {
  if (initialized) {
    return;
  }
  root = rootNode || document;
  if (!element("imageReversePanel")) {
    return;
  }
  initialized = true;
  bindEvents();
  renderImages();
  renderCurrentResult();
  loadModuleSettings();
  setStatus("就绪。");
}

window.initImageReverse = initImageReverse;
})();
