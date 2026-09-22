const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 锁住「自定义模型」从独立字段降级为下拉菜单项之后的行为：
// 平时收起、主动选中才展开、输入值可持久化、切回普通模型后不被重绘抢回。
const CUSTOM_VALUE = '__custom_model__';

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
      applyImageGenerationPreferences
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
    itemByValue(value).setAttribute('selected', '');
  };

  return {
    el, api: context.window.testApi, tick, selectOnly, itemByValue,
    writes: () => writes,
    hidden: () => el('customModelField').classList.contains('is-hidden'),
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

test('默认收起自定义模型输入框，并把下拉里的模型作为实际模型', () => {
  const h = createHarness([BASE_INTERFACE]);
  assert.equal(h.hidden(), true);
  assert.equal(h.api.getSelectedImageModelName(), 'gpt-image-1');
});

test('模型下拉里提供「使用自定义模型」这一项', () => {
  const h = createHarness([BASE_INTERFACE]);
  const values = h.el('modelPickerMenu').querySelectorAll('sp-menu-item')
    .map((item) => item.getAttribute('value'));
  assert.deepEqual(Array.from(values), ['__pull_models__', 'gpt-image-1', 'gpt-image-2', CUSTOM_VALUE]);
});

test('选中「使用自定义模型」后展开输入框，并以输入值作为实际模型', async () => {
  const h = createHarness([BASE_INTERFACE]);
  await h.chooseModel(CUSTOM_VALUE);
  assert.equal(h.hidden(), false);
  assert.equal(h.api.getSelectedImageModelName(), '');

  h.el('customModelInput').value = 'dall-e-3';
  assert.equal(h.api.getSelectedImageModelName(), 'dall-e-3');
  assert.equal(h.api.getModelValue(), 'dall-e-3');
});

test('已选择自定义模型但未填写名称时给出针对性错误', async () => {
  const h = createHarness([BASE_INTERFACE]);
  await h.chooseModel(CUSTOM_VALUE);
  let message = '';
  try {
    h.api.getModelValue();
  } catch (error) {
    message = String(error.message || error);
  }
  assert.match(message, /自定义模型名称/);
});

test('自定义模型名称会写回当前接口并持久化', async () => {
  const h = createHarness([BASE_INTERFACE]);
  await h.chooseModel(CUSTOM_VALUE);
  h.el('customModelInput').value = 'dall-e-3';
  await h.el('customModelInput').fire('change');
  await h.tick();

  h.api.syncCurrentInterfaceFromFields();
  const current = h.api.getCurrentInterface();
  assert.equal(current.customImageModel, 'dall-e-3');
  assert.equal(current.useCustomImageModel, true);
  assert.ok(h.writes() > 0);
});

test('切回普通模型后收起输入框，且重绘不会再抢回自定义选择', async () => {
  const h = createHarness([BASE_INTERFACE]);
  await h.chooseModel(CUSTOM_VALUE);
  h.el('customModelInput').value = 'dall-e-3';
  await h.el('customModelInput').fire('change');
  await h.tick();

  await h.chooseModel('gpt-image-2');
  assert.equal(h.hidden(), true);
  assert.equal(h.api.getSelectedImageModelName(), 'gpt-image-2');
  assert.equal(h.api.getCurrentInterface().useCustomImageModel, false);

  // 模拟切换接口或拉取模型后的重绘
  h.api.syncModelPickerSelection();
  assert.equal(h.hidden(), true);
  assert.equal(h.api.getSelectedImageModelName(), 'gpt-image-2');
  // 名称仍保留，便于用户再次切回自定义模型
  assert.equal(h.api.getCurrentInterface().customImageModel, 'dall-e-3');
});

test('重新载入时能恢复「使用自定义模型」的选择与名称', () => {
  const h = createHarness([Object.assign({}, BASE_INTERFACE, {
    customImageModel: 'flux-pro',
    useCustomImageModel: true
  })]);
  assert.equal(h.el('customModelInput').value, 'flux-pro');
  assert.equal(h.hidden(), false);
  assert.equal(h.api.getSelectedImageModelName(), 'flux-pro');
});

test('接口只记录自定义模型但未启用时，仍使用普通模型', () => {
  const h = createHarness([Object.assign({}, BASE_INTERFACE, {
    customImageModel: 'flux-pro',
    useCustomImageModel: false
  })]);
  assert.equal(h.el('customModelInput').value, 'flux-pro');
  assert.equal(h.hidden(), true);
  assert.equal(h.api.getSelectedImageModelName(), 'gpt-image-1');
});
