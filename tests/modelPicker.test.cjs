const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 「使用自定义模型」下拉项与配套输入框已移除：模型只能来自一键拉取的结果。
// 本文件锁住移除后的行为：下拉只含拉取项与模型项、选择模型即持久化、无模型时报错。
function createHarness(interfaces) {
  class Element {
    constructor(tag = '') {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.attributes = {};
      this.listeners = {};
      this.disabled = false;
      this.style = {};
      this.rect = { left: 0, top: 0, right: 300, bottom: 30, width: 300, height: 30 };
      this._value = undefined;
      this._text = '';
      const classes = new Set();
      this.classList = {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle(name, enabled) {
          (enabled === undefined ? !classes.has(name) : enabled) ? classes.add(name) : classes.delete(name);
        }
      };
    }
    get value() { return this._value !== undefined ? this._value : (this.attributes.value || ''); } 
    set value(next) { this._value = next; }
    get textContent() { return this._text; }
    set textContent(next) { this._text = next; this.children = []; }
    setAttribute(name, next) { this.attributes[name] = String(next); }
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    }
    removeAttribute(name) { delete this.attributes[name]; }
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    contains(target) { return target === this || this.children.some((child) => child.contains(target)); }
    querySelectorAll(selector) { return collect(this, selector); }
    querySelector(selector) { return collect(this, selector)[0] || null; }
    getBoundingClientRect() { return this.rect; }
    focus() { this.focused = true; }
    async fire(type, properties = {}) {
      const event = {
        target: this, currentTarget: this,
        preventDefault() {}, stopPropagation() {},
        ...properties
      };
      for (const handler of this.listeners[type] || []) await handler(event);
      return event;
    }
  }

  function collect(root, selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) { found.push(child); walk(child); }
    };
    walk(root);
    const withAttr = /^([a-z-]+)\[([a-z-]+)\]$/.exec(selector);
    if (withAttr) {
      return found.filter((node) => node.tagName === withAttr[1].toUpperCase() && node.hasAttribute(withAttr[2]));
    }
    return found.filter((node) => node.tagName === selector.toUpperCase());
  }

  const elements = new Map();
  const document = new Element();
  document.getElementById = (id) => {
    if (!elements.has(id)) {
      const item = new Element();
      item.id = id;
      elements.set(id, item);
    }
    return elements.get(id);
  };
  document.createElement = (tag) => new Element(tag);

  const el = document.getElementById;
  const buildPicker = (pickerId, menuId, values) => {
    const picker = el(pickerId);
    const menu = new Element('sp-menu');
    values.forEach((value) => {
      const item = new Element('sp-menu-item');
      item.setAttribute('value', value);
      menu.appendChild(item);
    });
    picker.appendChild(menu);
    if (menuId) { el(menuId).appendChild(new Element('sp-menu-item')); }
    return picker;
  };
  el('modelPicker').appendChild(el('modelPickerMenu'));
  buildPicker('imageProviderPicker', null, ['openai', 'gemini']);
  buildPicker('imageEndpointPicker', null, ['generations', 'edits']);

  const requests = [];
  let writes = 0;
  const context = {
    document,
    window: new Element(),
    require: () => ({}),
    setTimeout, clearTimeout, AbortController, URL, console
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/aiAssistantModule.js'), 'utf8');
  const hooks = `
    persistSettings = async () => { persist(); };
    requestJson = async (url, options) => { request(url, options); return { data: [] }; };
    setStatus = (message) => { window.status = message; };
    settings = normalizeSettingsData({
      currentInterfaceId: 'a',
      interfaces: ${JSON.stringify(interfaces)}
    });
    window.testApi = {
      getSettings: () => settings,
      getCurrentInterface,
      getSelectedImageModelName,
      getModelValue,
      syncCurrentInterfaceFromFields,
      syncModelPickerSelection,
      applyImageGenerationPreferences,
      matchesImageProvider,
      renderImageModelPicker,
      getImageModelsForProvider
    };
    applyImageGenerationPreferences();
    bindEvents();
  `;
  vm.runInNewContext(
    source.replace('window.LiangyiAIConfig = {', hooks + '\nwindow.LiangyiAIConfig = {'),
    Object.assign(context, {
      persist: () => { writes++; },
      request: (url, options) => { requests.push({ url, options }); }
    })
  );

  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const modelItems = () => el('modelPickerMenu').querySelectorAll('sp-menu-item');
  const itemByValue = (value) => modelItems().find((item) => item.getAttribute('value') === value);
  const selectOnly = (value) => {
    modelItems().forEach((item) => item.removeAttribute('selected'));
    const target = itemByValue(value);
    if (target) { target.setAttribute('selected', ''); }
  };

  return {
    el, api: context.window.testApi, tick, selectOnly, itemByValue,
    writes: () => writes,
    menuValues: () => modelItems().map((item) => item.getAttribute('value')),
    chooseModel: async (value) => {
      selectOnly(value);
      await el('modelPicker').fire('change');
      await tick();
    }
  };
}

const BASE_INTERFACE = {
  id: 'a',
  name: '接口 A',
  baseUrl: 'https://a.example',
  apiKey: 'test-key',
  imageModels: ['gpt-image-1', 'gpt-image-2']
};

test('默认把下拉里的第一个模型作为实际模型', () => {
  const h = createHarness([BASE_INTERFACE]);
  assert.equal(h.api.getSelectedImageModelName(), 'gpt-image-1');
});

test('下拉只包含「一键获取模型」和拉取到的模型，不含自定义模型项', () => {
  const h = createHarness([BASE_INTERFACE]);
  assert.deepEqual(
    Array.from(h.menuValues()),
    ['__pull_models__', 'gpt-image-1', 'gpt-image-2']
  );
});

test('选择某个模型后它成为实际模型并写回接口', async () => {
  const h = createHarness([BASE_INTERFACE]);
  await h.chooseModel('gpt-image-2');
  assert.equal(h.api.getSelectedImageModelName(), 'gpt-image-2');
  assert.equal(h.api.getModelValue(), 'gpt-image-2');
  assert.equal(h.api.getCurrentInterface().imageModel, 'gpt-image-2');
});

test('模型变更会持久化', async () => {
  const h = createHarness([BASE_INTERFACE]);
  await h.chooseModel('gpt-image-2');
  h.api.syncCurrentInterfaceFromFields();
  assert.equal(h.api.getCurrentInterface().imageModel, 'gpt-image-2');
  assert.ok(h.writes() > 0);
});

test('没有可用模型时给出引导性错误，而不是自定义模型提示', () => {
  const h = createHarness([Object.assign({}, BASE_INTERFACE, { imageModels: [] })]);
  assert.equal(h.api.getSelectedImageModelName(), '');
  let message = '';
  try {
    h.api.getModelValue();
  } catch (error) {
    message = String(error.message || error);
  }
  assert.match(message, /一键获取模型/);
  assert.doesNotMatch(message, /自定义模型/);
});

test('重绘下拉后仍保留当前模型选择', async () => {
  const h = createHarness([BASE_INTERFACE]);
  await h.chooseModel('gpt-image-2');
  h.api.syncModelPickerSelection();
  assert.equal(h.api.getSelectedImageModelName(), 'gpt-image-2');
});

test('未拉取到模型时下拉只剩「一键获取模型」一项', () => {
  const h = createHarness([Object.assign({}, BASE_INTERFACE, { imageModels: [] })]);
  assert.deepEqual(Array.from(h.menuValues()), ['__pull_models__']);
});

// 带 banana 的模型（nano-banana / gemini-*-banana 等）一律归 gemini 图像生成通道，
// 且不得漏进 openai 通道，否则在 openai 下会被 gpt/image 条件挡掉而整个消失。
test('带 banana 的模型归类到 gemini 通道，而非 openai 通道', () => {
  const h = createHarness([BASE_INTERFACE]);
  const banana = ['nano-banana', 'gemini-3-pro-banana-preview', 'flux-banana-pro'];
  banana.forEach((model) => {
    assert.equal(h.api.matchesImageProvider(model, 'gemini'), true, `${model} 应属于 gemini 通道`);
    assert.equal(h.api.matchesImageProvider(model, 'openai'), false, `${model} 不应属于 openai 通道`);
  });
});

test('banana 判定大小写不敏感，且不影响既有 gemini / openai 规则', () => {
  const h = createHarness([BASE_INTERFACE]);
  assert.equal(h.api.matchesImageProvider('Nano-Banana', 'gemini'), true);
  assert.equal(h.api.matchesImageProvider('NANO-BANANA', 'gemini'), true);
  assert.equal(h.api.matchesImageProvider('gemini-2.5-flash-image', 'gemini'), true);
  assert.equal(h.api.matchesImageProvider('gpt-image-1', 'openai'), true);
  assert.equal(h.api.matchesImageProvider('gemini-2.5-flash', 'gemini'), false);
  assert.equal(h.api.matchesImageProvider('seedream-image', 'openai'), false);
  assert.equal(h.api.matchesImageProvider('', 'gemini'), false);
  assert.equal(h.api.matchesImageProvider(undefined, 'openai'), false);
});

test('gemini 下拉渲染包含 banana 模型，openai 下拉不含', () => {
  const h = createHarness([Object.assign({}, BASE_INTERFACE, {
    imageModels: ['nano-banana', 'gemini-2.5-flash-image', 'gpt-image-1']
  })]);

  // provider 通过下拉里被标记 selected 的菜单项读取，直接改元素 value 不生效。
  const selectProvider = (value) => {
    h.el('imageProviderPicker').querySelectorAll('sp-menu-item').forEach((item) => {
      item.removeAttribute('selected');
      if (item.getAttribute('value') === value) {
        item.setAttribute('selected', '');
      }
    });
  };

  selectProvider('gemini');
  h.api.renderImageModelPicker('');
  assert.ok(h.menuValues().includes('nano-banana'), 'gemini 下拉应包含 nano-banana');
  assert.deepEqual(
    Array.from(h.api.getImageModelsForProvider('gemini')),
    ['gemini-2.5-flash-image', 'nano-banana']
  );

  selectProvider('openai');
  h.api.renderImageModelPicker('');
  assert.equal(h.menuValues().includes('nano-banana'), false, 'openai 下拉不应包含 nano-banana');
  assert.deepEqual(Array.from(h.api.getImageModelsForProvider('openai')), ['gpt-image-1']);
});
