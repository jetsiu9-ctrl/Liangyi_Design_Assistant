const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real handlers without requiring the Photoshop host or real credentials.
function createHarness(options = {}) {
  // 允许用例自定义 /v1/models 的返回，用于验证拉取后的分池规则。
  const pullResponse = options.pullResponse
    || (() => [{ id: 'image-test' }, { id: 'text-test' }]);
  class Element {
    constructor() {
      this.children = [];
      this.attributes = {};
      this.listeners = {};
      this.value = '';
      this.disabled = false;
      this.style = {};
      this.rect = { left: 80, top: 180, right: 340, bottom: 212, width: 260, height: 32 };
      const classes = new Set();
      this.classList = {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle(name, enabled = !classes.has(name)) {
          enabled ? classes.add(name) : classes.delete(name);
        }
      };
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    appendChild(child) {
      if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child);
      child.parent = this;
      this.children.push(child);
    }
    getBoundingClientRect() {
      if (this.id === 'interfacePickerPopup') {
        const left = parseFloat(this.style.left) || 0;
        const top = parseFloat(this.style.top) || 0;
        const width = parseFloat(this.style.width) || 260;
        return { left, top, right: left + width, bottom: top + 104, width, height: 104 };
      }
      if (this.id === 'interfacePickerMenu') {
        const popup = document.getElementById('interfacePickerPopup').getBoundingClientRect();
        const height = Math.min(104, parseFloat(this.style.maxHeight) || 200);
        return { ...popup, bottom: popup.top + height, height };
      }
      return this.rect;
    }
    querySelectorAll() { return this.children; }
    querySelector() { return null; }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    contains(target) { return target === this || this.children.some((child) => child.contains(target)); }
    focus() { this.focused = true; }
    async primaryClick() {
      await this.fire('pointerdown', { button: 0, buttons: 1 });
      await this.fire('mousedown', { button: 0, buttons: 1 });
      await this.fire('mouseup', { button: 0, buttons: 0 });
      return this.fire('click', { button: 0 });
    }
    async fire(type, properties = {}) {
      const event = {
        target: this, currentTarget: this, button: 0,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        ...properties
      };
      for (const handler of this.listeners[type] || []) await handler(event);
      return event;
    }
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
  document.createElement = () => new Element();
  document.getElementById('app').rect = { left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800 };
  document.getElementById('interfacePicker').rect = { left: 80, top: 140, right: 340, bottom: 174, width: 260, height: 34 };
  document.getElementById('interfaceActionMenu').rect.height = 36;
  const popup = document.getElementById('interfacePickerPopup');
  popup.appendChild(document.getElementById('interfacePickerMenu'));
  popup.appendChild(document.getElementById('interfaceActionMenu'));
  const requests = [];
  let writes = 0;
  const context = {
    document, window: new Element(), require: () => ({}),
    setTimeout, clearTimeout, AbortController, URL,
    persist: async () => { writes++; },
    request: async (url, options) => {
      requests.push({ url, options });
      return { data: pullResponse() };
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/aiAssistantModule.js'), 'utf8');
  const hooks = `
    persistSettings = persist;
    requestJson = request;
    applyImageGenerationPreferences = () => {};
    notifyModelConsumers = () => {};
    setStatus = (message) => { window.status = message; };
    getPickerValue = () => '';
    settings = normalizeSettingsData({ currentInterfaceId: 'a', interfaces: [
      { id: 'a', name: '接口 A', baseUrl: 'https://a.example', apiKey: 'test-a' },
      { id: 'b', name: '接口 B', baseUrl: 'https://b.example', apiKey: 'test-b' }
    ] });
    window.testApi = { getSettings: () => settings, setBusy, deleteInterface };
    applyCurrentInterfaceToFields();
    renderInterfacePicker();
    hideInterfacePicker();
    hideInterfaceActionMenu();
    hideInterfaceForm();
    bindEvents();
  `;
  vm.runInNewContext(source.replace('window.LiangyiAIConfig = {', hooks + '\nwindow.LiangyiAIConfig = {'), context);
  const el = document.getElementById;
  return {
    el, document, requests, api: context.window.testApi,
    status: () => context.window.status,
    writes: () => writes,
    state: () => context.window.testApi.getSettings(),
    option: (id) => el('interfacePickerMenu').children.find((item) => item.getAttribute('data-interface-id') === id),
    open: () => el('interfacePicker').primaryClick()
  };
}

test('right-clicking an unselected option opens its actions without selecting or saving', async () => {
  const h = createHarness();
  await h.open();
  const event = await h.option('b').fire('contextmenu', { button: 2 });
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.el('interfaceActionMenu').getAttribute('aria-label'), '接口：接口 B');
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), false);
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), false);
  assert.equal(h.writes(), 0);
  await h.el('cancelInterfaceActionButton').fire('click');
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), false);
  assert.equal(h.state().currentInterfaceId, 'a');
});

test('editing and saving another interface changes only that interface', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('editInterfaceButton').fire('click');
  assert.equal(h.el('interfaceNameInput').value, '接口 B');
  h.el('interfaceNameInput').value = 'B edited';
  h.el('interfaceBaseUrlInput').value = 'https://edited.example';
  await h.el('saveInterfaceButton').fire('click');
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.state().interfaces[1].name, 'B edited');
  assert.equal(h.state().interfaces[1].baseUrl, 'https://edited.example');
  assert.equal(h.el('baseUrlInput').value, 'https://a.example');
  assert.equal(h.writes(), 1);
});

test('cancelling an edit preserves saved configuration', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('editInterfaceButton').fire('click');
  h.el('interfaceNameInput').value = 'discard';
  await h.el('cancelInterfaceButton').fire('click');
  assert.equal(h.state().interfaces[1].name, '接口 B');
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.writes(), 0);
});

test('deleting an unselected interface preserves the current interface; last one is protected', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('deleteInterfaceButton').fire('click');
  assert.equal(h.state().interfaces.length, 1);
  assert.equal(h.state().currentInterfaceId, 'a');
  await assert.rejects(h.api.deleteInterface('a'), /至少需要保留一个接口/);
  assert.equal(h.state().interfaces.length, 1);
});

test('deleting the current interface selects a remaining interface', async () => {
  const h = createHarness();
  await h.open();
  await h.option('a').fire('contextmenu');
  await h.el('deleteInterfaceButton').fire('click');
  assert.equal(h.state().currentInterfaceId, 'b');
  assert.equal(h.el('baseUrlInput').value, 'https://b.example');
});

test('left-click selects; a right-button click never selects', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('click', { button: 2 });
  assert.equal(h.state().currentInterfaceId, 'a');
  await h.option('b').primaryClick();
  assert.equal(h.state().currentInterfaceId, 'b');
  assert.equal(h.el('interfacePickerLabel').textContent, '接口 B');
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), true);
});

test('model fetch uses the right-clicked interface URL and credentials without switching', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('pullModelsButton').fire('click');
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, 'https://b.example/v1/models');
  assert.equal(h.requests[0].options.headers.Authorization, 'Bearer test-b');
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.state().interfaces[0].imageModels.length, 0);
  assert.equal(h.state().interfaces[1].imageModels[0], 'image-test');
  assert.equal(h.state().interfaces[1].reverseModels[0], 'text-test');
  assert.equal(h.el('interfacePicker').disabled, false);
});

test('Escape and outside click dismiss menus; disabled picker blocks interactions', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.document.fire('keydown', { key: 'Escape' });
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), false);
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), true);
  await h.document.fire('keydown', { key: 'Escape' });
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), true);
  await h.open();
  await h.document.fire('click');
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), true);
  h.api.setBusy(true);
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.option('b').fire('click');
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), true);
  assert.equal(h.state().currentInterfaceId, 'a');
});


test('submenu is clamped inside the dropdown near right and bottom edges', async () => {
  const h = createHarness();
  await h.open();
  const list = h.el('interfacePickerMenu').getBoundingClientRect();
  h.option('b').rect = { left: list.left, right: list.right, top: list.bottom - 32, bottom: list.bottom, width: list.width, height: 32 };
  await h.option('b').fire('contextmenu', { clientX: 399 });
  const menu = h.el('interfaceActionMenu');
  const popup = h.el('interfacePickerPopup').getBoundingClientRect();
  const left = popup.left + parseFloat(menu.style.left);
  const top = popup.top + parseFloat(menu.style.top);
  assert.ok(left >= list.left);
  assert.ok(left + parseFloat(menu.style.width) <= list.right);
  assert.ok(top >= list.top);
  assert.ok(top + 36 <= list.bottom);
  assert.ok(top < h.option('b').rect.top);
});

test('dropdown opens upward when the trigger is near the panel bottom', async () => {
  const h = createHarness();
  h.el('interfacePicker').rect = { left: 80, right: 340, top: 750, bottom: 784, width: 260, height: 34 };
  await h.open();
  const list = h.el('interfacePickerMenu').getBoundingClientRect();
  assert.ok(list.top >= 6);
  assert.ok(list.bottom < 750);
});

test('scrolling the list closes only the submenu; scrolling the panel closes both', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('interfacePickerMenu').fire('scroll');
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), false);
  await h.el('mainContent').fire('scroll');
  assert.equal(h.el('interfacePickerPopup').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), true);
});

test('right-clicking another row updates the target and submenu clicks count as inside', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.option('a').fire('contextmenu');
  assert.equal(h.el('interfaceActionMenu').getAttribute('aria-label'), '接口：接口 A');
  assert.equal(h.option('b').classList.contains('is-context-target'), false);
  assert.equal(h.option('a').classList.contains('is-context-target'), true);
  await h.document.fire('click', { target: h.el('interfaceActionMenu') });
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), false);
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.writes(), 0);
});


test('a click with no button information after contextmenu must not select the edited configuration', async () => {
  const h = createHarness();
  await h.open();
  const option = h.option('b');
  await option.fire('mousedown', { button: 2, buttons: 2 });
  await option.fire('contextmenu', { button: 2 });
  await option.fire('mouseup', { button: 2 });
  await option.fire('click', { button: undefined });
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.writes(), 0);
  await h.el('editInterfaceButton').fire('click');
  assert.equal(h.el('interfaceNameInput').value, '接口 B');
  await h.el('saveInterfaceButton').fire('click');
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.state().interfaces.length, 2);
});

test('a right-button gesture cannot switch even if click reports button zero before contextmenu', async () => {
  const h = createHarness();
  await h.open();
  const option = h.option('b');
  await option.fire('pointerdown', { button: 2, buttons: 2 });
  await option.fire('mousedown', { button: 2, buttons: 2 });
  await option.fire('mouseup', { button: 2 });
  await option.fire('click', { button: 0 });
  await option.fire('contextmenu', { button: 2 });
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.writes(), 0);
  assert.equal(h.el('interfaceActionMenu').getAttribute('aria-label'), '接口：接口 B');
});

test('right-clicking the closed trigger never opens a configuration submenu', async () => {
  const h = createHarness();
  await h.el('interfacePicker').fire('mousedown', { button: 2, buttons: 2 });
  await h.el('interfacePicker').fire('contextmenu', { button: 2 });
  await h.el('interfacePicker').fire('click', { button: undefined });
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfacePickerPopup').classList.contains('is-hidden'), true);
  await h.open();
  await h.option('a').fire('contextmenu');
  assert.equal(h.el('interfaceActionMenu').getAttribute('aria-label'), '接口：接口 A');
});

test('a duplicate save event must not turn editing B into adding and selecting a new configuration', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('editInterfaceButton').fire('click');
  await h.el('saveInterfaceButton').fire('click');
  await h.el('saveInterfaceButton').fire('click');
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.state().interfaces.length, 2);
  assert.equal(h.writes(), 1);
});


test('mouse-only primary press still selects after cancelling a context menu', async () => {
  const h = createHarness();
  await h.open();
  const option = h.option('b');
  await option.fire('mousedown', { button: 2, buttons: 2 });
  await option.fire('contextmenu');
  await h.el('cancelInterfaceActionButton').fire('click');
  await option.fire('mousedown', { button: 0, buttons: 1 });
  await option.fire('mouseup', { button: 0 });
  await option.fire('click', { button: undefined });
  assert.equal(h.state().currentInterfaceId, 'b');
  assert.equal(h.writes(), 1);
});

test('keyboard activation selects once and ignores the following synthetic click', async () => {
  const h = createHarness();
  await h.el('interfacePicker').fire('keydown', { key: 'Enter' });
  await h.el('interfacePicker').fire('click', { button: 0 });
  assert.equal(h.el('interfacePickerPopup').classList.contains('is-hidden'), false);
  const option = h.option('b');
  await option.fire('keydown', { key: ' ' });
  await option.fire('click', { button: 0 });
  assert.equal(h.state().currentInterfaceId, 'b');
  assert.equal(h.writes(), 1);
});

test('a delayed option click while the edit form is open cannot change the active connection', async () => {
  const h = createHarness();
  await h.open();
  const option = h.option('b');
  await option.fire('contextmenu');
  await h.el('editInterfaceButton').fire('click');
  await option.primaryClick();
  await h.el('cancelInterfaceButton').fire('click');
  await h.el('saveInterfaceButton').fire('click');
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.state().interfaces.length, 2);
  assert.equal(h.writes(), 0);
});

test('editing the active connection applies its new credentials; adding a configuration still selects it', async () => {
  const h = createHarness();
  await h.open();
  await h.option('a').fire('contextmenu');
  await h.el('editInterfaceButton').fire('click');
  h.el('interfaceApiKeyInput').value = 'updated-a';
  await h.el('saveInterfaceButton').fire('click');
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.el('apiKeyInput').value, 'updated-a');
  await h.el('addInterfaceButton').fire('click');
  h.el('interfaceNameInput').value = 'new configuration';
  await h.el('saveInterfaceButton').fire('click');
  assert.equal(h.state().interfaces.length, 3);
  assert.equal(h.state().currentInterfaceId, h.state().interfaces[2].id);
});


test('click-only UXP events open the list and switch the clicked saved configuration', async () => {
  const h = createHarness();
  await h.el('interfacePicker').fire('click', { button: undefined });
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), false);
  await h.option('b').fire('click', { button: undefined });
  assert.equal(h.state().currentInterfaceId, 'b');
  assert.equal(h.el('interfacePickerLabel').textContent, '接口 B');
  assert.equal(h.writes(), 1);
});

test('missing press metadata and a focus change do not prevent a normal selection', async () => {
  const h = createHarness();
  await h.open();
  const option = h.option('b');
  await option.fire('pointerdown', { button: undefined, buttons: undefined });
  await option.fire('mousedown', { button: undefined, buttons: undefined });
  await option.fire('blur');
  await option.fire('click', { button: undefined });
  assert.equal(h.state().currentInterfaceId, 'b');
});

test('contextmenu cancels an earlier ambiguous click before it can switch or persist', async () => {
  const h = createHarness();
  await h.open();
  const option = h.option('b');
  const pendingClick = option.fire('click', { button: undefined });
  await option.fire('contextmenu', { button: undefined });
  await pendingClick;
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.writes(), 0);
  assert.equal(h.el('interfaceActionMenu').getAttribute('aria-label'), '接口：接口 B');
});

test('only expanded configuration rows open their submenu, not list padding or hidden rows', async () => {
  const h = createHarness();
  await h.option('b').fire('contextmenu');
  assert.equal(h.el('interfacePickerPopup').classList.contains('is-hidden'), true);
  await h.open();
  await h.el('interfacePickerMenu').fire('contextmenu');
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), true);
  await h.option('b').fire('contextmenu');
  assert.equal(h.el('interfaceActionMenu').getAttribute('aria-label'), '接口：接口 B');
  assert.equal(h.state().currentInterfaceId, 'a');
});

test('a subsequent click-only selection still works after cancelling a submenu', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('cancelInterfaceActionButton').fire('click');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await h.option('b').fire('click', { button: undefined });
  assert.equal(h.state().currentInterfaceId, 'b');
});

test('opening the edit form closes the interface list so it cannot overlap the form', async () => {
  const h = createHarness();
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('editInterfaceButton').fire('click');
  assert.equal(h.el('interfacePickerPopup').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfaceActionMenu').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfaceForm').classList.contains('is-hidden'), false);
  assert.equal(h.state().currentInterfaceId, 'a');
  assert.equal(h.el('interfaceNameInput').value, '接口 B');
});

test('opening the add form from the plus button closes the interface list too', async () => {
  const h = createHarness();
  await h.open();
  await h.el('addInterfaceButton').fire('click');
  assert.equal(h.el('interfacePickerPopup').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfacePickerMenu').classList.contains('is-hidden'), true);
  assert.equal(h.el('interfaceForm').classList.contains('is-hidden'), false);
  assert.equal(h.el('interfaceFormTitle').textContent, '新增接口');
});

// banana 系列（nano-banana 等）属于图像生成，必须在拉取分池时就进 imageModels。
// 否则它会落进 reverseModels，被反推模块的两个接口排除后彻底从 UI 上消失。
// 注意：池子经过 normalizeModelNames 处理，按小写字母序排列，故断言用 join 比较。
test('拉取模型时 banana 归入图像生成池而非反推池', async () => {
  const h = createHarness({
    pullResponse: () => [
      { id: 'nano-banana' },
      { id: 'gemini-2.5-flash-image' },
      { id: 'gemini-2.5-flash' },
      { id: 'gpt-image-1' },
      { id: 'gpt-4o' }
    ]
  });
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('pullModelsButton').fire('click');

  const iface = h.state().interfaces[1];
  assert.equal(iface.imageModels.join(','), 'gemini-2.5-flash-image,gpt-image-1,nano-banana');
  assert.equal(iface.reverseModels.join(','), 'gemini-2.5-flash,gpt-4o');
  assert.equal(iface.reverseModels.includes('nano-banana'), false, 'banana 不应出现在反推池');
  // 没有任何模型因为两条规则同时被挡而丢失
  assert.equal(iface.imageModels.length + iface.reverseModels.length, 5);
});

test('banana 判定大小写不敏感，且 image 规则不受影响', async () => {
  const h = createHarness({
    pullResponse: () => [
      { id: 'Nano-Banana' },
      { id: 'gemini-3-pro-banana-preview' },
      { id: 'flux-banana-pro' },
      { id: 'gemini-2.5-flash' }
    ]
  });
  await h.open();
  await h.option('b').fire('contextmenu');
  await h.el('pullModelsButton').fire('click');

  const iface = h.state().interfaces[1];
  // 排序按小写比较，'Nano-Banana' 视为 'nano-banana' 排在最后；原始大小写被保留
  assert.equal(iface.imageModels.join(','), 'flux-banana-pro,gemini-3-pro-banana-preview,Nano-Banana');
  assert.equal(iface.reverseModels.join(','), 'gemini-2.5-flash');
});
