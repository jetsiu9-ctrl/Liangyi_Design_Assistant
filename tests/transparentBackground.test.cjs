const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 锁住 OpenAI 兼容接口的两个参数：
//   1) 新增「透明背景」复选，勾选时 background=transparent，未勾选回落 auto；
//      JSON 与 multipart 两条提交路径必须一致。
//   2) 质量档位由「自动/高/中/低」扩展为「自动/最高/极高/高/中/低」，
//      value 必须与 OpenAI 的 max/xhigh/high/medium/low 枚举一一对应。
const QUALITY_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'max', label: '最高' },
  { value: 'xhigh', label: '极高' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' }
];

class El {
  constructor(tag = '') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.checked = false;
    this.disabled = false;
    this.style = {};
    this._value = undefined;
  }
  get value() { return this._value !== undefined ? this._value : (this.attributes.value || ''); }
  set value(next) { this._value = next; }
  set textContent(next) { this._text = next; this.children = []; }
  get textContent() { return this._text || ''; }
  setAttribute(name, next) { this.attributes[name] = String(next); }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  contains() { return false; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 30 }; }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => { for (const child of node.children) { found.push(child); walk(child); } };
    walk(this);
    const withAttr = /^([a-z-]+)\[([a-z-]+)\]$/.exec(selector);
    return withAttr
      ? found.filter((node) => node.tagName === withAttr[1].toUpperCase() && node.hasAttribute(withAttr[2]))
      : found.filter((node) => node.tagName === selector.toUpperCase());
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function harness() {
  const table = new Map();
  const document = {
    getElementById(id) {
      if (!table.has(id)) {
        const item = new El();
        item.id = id;
        table.set(id, item);
      }
      return table.get(id);
    },
    createElement: (tag) => new El(tag),
    addEventListener() {}
  };

  // 模型下拉：默认选中 gpt-image-1
  const modelPicker = document.getElementById('modelPicker');
  const modelMenu = new El('sp-menu');
  const modelItem = new El('sp-menu-item');
  modelItem.setAttribute('value', 'gpt-image-1');
  modelItem.setAttribute('selected', '');
  modelMenu.appendChild(modelItem);
  modelPicker.appendChild(modelMenu);

  // 尺寸与数量
  [['aspectRatioPicker', '1:1'], ['resolutionPicker', '1k']].forEach(([id, value]) => {
    const picker = document.getElementById(id);
    const menu = new El('sp-menu');
    const item = new El('sp-menu-item');
    item.setAttribute('value', value);
    menu.appendChild(item);
    picker.appendChild(menu);
  });
  document.getElementById('countInput').value = '1';

  const context = {
    document,
    window: {},
    require: () => ({}),
    setTimeout, clearTimeout, AbortController, URL, console,
    btoa: (value) => Buffer.from(value).toString('base64'),
    FormData: class { constructor() { this.map = {}; } append(key, value) { this.map[key] = value; } }
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/aiAssistantModule.js'), 'utf8');
  const hooks = `
    settings = normalizeSettingsData({ currentInterfaceId: 'a', interfaces: [
      { id: 'a', name: 'A', baseUrl: 'https://a.example', apiKey: 'k', imageModels: ['gpt-image-1'] }
    ] });
    window.testApi = {
      getBackgroundValue,
      jsonPayload: () => appendCommonJsonPayload({ prompt: 'test' }),
      formFields: () => { const form = new FormData(); appendCommonFormFields(form); return form.map; },
      transparentCheckbox: () => document.getElementById('transparentBackgroundCheckbox')
    };
  `;
  vm.runInNewContext(source.replace('window.LiangyiAIConfig = {', hooks + '\nwindow.LiangyiAIConfig = {'), context);
  return { api: context.window.testApi, el: document.getElementById };
}

test('质量档位扩展为六档，value 与 OpenAI 枚举一致', () => {
  const h = harness();
  const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const block = /<sp-picker id="qualityPicker">([\s\S]*?)<\/sp-picker>/.exec(mainSource);
  assert.ok(block, '应能在标记中找到 qualityPicker');

  const parsed = Array.from(block[1].matchAll(/<sp-menu-item value="([^"]+)"[^>]*>([^<]+)<\/sp-menu-item>/g))
    .map((match) => ({ value: match[1], label: match[2] }));
  assert.deepEqual(parsed, QUALITY_OPTIONS);
});

test('质量下拉的 value 不含 dall-e 专属的 standard / hd', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const block = /<sp-picker id="qualityPicker">([\s\S]*?)<\/sp-picker>/.exec(mainSource);
  assert.equal(/value="standard"/.test(block[1]), false);
  assert.equal(/value="hd"/.test(block[1]), false);
});

test('透明背景默认未勾选，background 回落 auto', () => {
  const h = harness();
  assert.equal(h.api.transparentCheckbox().checked, false);
  assert.equal(h.api.getBackgroundValue(), 'auto');
  assert.equal(h.api.jsonPayload().background, 'auto');
  assert.equal(h.api.formFields().background, 'auto');
});

test('勾选透明背景后 background=transparent，两条提交路径一致', () => {
  const h = harness();
  h.api.transparentCheckbox().checked = true;
  assert.equal(h.api.getBackgroundValue(), 'transparent');
  assert.equal(h.api.jsonPayload().background, 'transparent');
  assert.equal(h.api.formFields().background, 'transparent');
});

test('取消勾选后 background 恢复 auto', () => {
  const h = harness();
  const checkbox = h.api.transparentCheckbox();
  checkbox.checked = true;
  assert.equal(h.api.formFields().background, 'transparent');
  checkbox.checked = false;
  assert.equal(h.api.formFields().background, 'auto');
});

test('透明背景不影响同批次其它参数', () => {
  const h = harness();
  h.api.transparentCheckbox().checked = true;
  const payload = h.api.jsonPayload();
  assert.equal(payload.model, 'gpt-image-1');
  assert.equal(payload.size, '1024x1024');
  assert.equal(payload.output_format, 'png');
  assert.equal(payload.moderation, 'auto');
  assert.equal(payload.n, 1);
});

test('透明背景必须搭配 png 输出格式', () => {
  const h = harness();
  h.api.transparentCheckbox().checked = true;
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/aiAssistantModule.js'), 'utf8');
  assert.match(source, /const DEFAULT_OUTPUT_FORMAT = "png";/);
  assert.equal(h.api.jsonPayload().output_format, 'png');
});

test('标记里透明背景与异步任务处于同一行且靠左对齐', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const row = /<section class="check-row[^"]*">([\s\S]*?)<\/section>/.exec(
    mainSource.slice(mainSource.indexOf('transparentBackgroundCheckbox') - 200)
  );
  assert.ok(row, '应能找到包含透明背景的复选行');
  assert.match(row[0], /transparentBackgroundCheckbox/);
  assert.match(row[0], /asyncCheckbox/);
  assert.match(row[0], /check-row-end/, '复选行应带对齐类');

  const css = fs.readFileSync(path.join(__dirname, '../src/styles/aiAssistant.css'), 'utf8');
  assert.match(css, /\.check-row-end\s*\{[^}]*justify-content:\s*flex-start/);
});
