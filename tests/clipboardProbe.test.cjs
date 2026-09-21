const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(clipboard, modules = {}) {
  class Element {
    constructor(tag = 'section') {
      this.tagName = tag;
      this.children = [];
      this.listeners = {};
      this.style = {};
      this.attributes = {};
      this.className = '';
      this.classList = {
        contains: name => this.className.split(' ').includes(name),
        add: name => { this.className += ' ' + name; },
        remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); }
      };
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); }
    querySelector(selector) { return this.children.find(child => child.classList.contains(selector.slice(1))); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type, props = {}) {
      const event = { target: this, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...props };
      for (const fn of this.listeners[type] || []) fn(event);
      return event;
    }
  }
  const document = new Element('document');
  const window = new Element('window');
  const elements = new Map();
  document.getElementById = id => elements.get(id);
  document.createElement = tag => new Element(tag);
  const context = { require: name => modules[name], window, document, navigator: { clipboard }, Blob, ArrayBuffer, Uint8Array, atob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/clipboardProbe.js'), 'utf8');
  vm.runInNewContext(source.replace('window.LiangyiClipboardProbe = { attach };', 'window.LiangyiClipboardProbe = { attach, readProbe, readPhotoshopProbe };'), context);
  function addPanel(prefix) {
    const section = new Element();
    const list = new Element();
    const tile = new Element('sp-button');
    tile.className = 'reference-add-tile';
    document.appendChild(section);
    section.appendChild(list);
    list.appendChild(tile);
    elements.set(prefix + 'section', section);
    elements.set(prefix + 'list', list);
    window.LiangyiClipboardProbe.attach({ sectionId: prefix + 'section', listId: prefix + 'list' });
    return { section, list, tile, output: section.querySelector('.clipboard-probe').children[2] };
  }
  return { api: window.LiangyiClipboardProbe, document, window, addPanel, Element };
}

test('reads a UXP MIME map without exposing text or file paths', async () => {
  const { api } = harness();
  const lines = [], previews = [];
  await api.readProbe({ read: async () => ({ 'image/png': new Uint8Array([1, 2, 3]).buffer, 'text/plain': 'private-path' }) }, text => lines.push(text), blob => previews.push(blob));
  assert.equal(previews.length, 1);
  assert.equal(previews[0].type, 'image/png');
  assert.ok(lines.some(line => line.includes('text/plain')));
  assert.ok(!lines.join().includes('private-path'));
});

test('reads standard ClipboardItem blobs', async () => {
  const { api } = harness();
  const previews = [];
  await api.readProbe({ read: async () => [{ types: ['image/png'], getType: async () => new Blob(['image'], { type: 'image/png' }) }] }, () => {}, blob => previews.push(blob));
  assert.equal(previews.length, 1);
  assert.equal(previews[0].size, 5);
});

test('falls back to getContent and reports unavailable/read failure cases', async () => {
  const { api } = harness();
  const lines = [], previews = [];
  await api.readProbe({ read: async () => { throw new Error('unavailable'); }, getContent: async () => ({ 'image/png': new Uint8Array([1]) }) }, text => lines.push(text), blob => previews.push(blob));
  assert.equal(previews.length, 1);
  assert.ok(lines.some(line => line.includes('unavailable')));
  await api.readProbe(null, text => lines.push(text), () => {});
  assert.ok(lines.some(line => line.includes('未提供')));
});

test('file-only clipboard formats are reported without claiming image support', async () => {
  const { api } = harness();
  const lines = [];
  await api.readProbe({ read: async () => ({ 'text/uri-list': 'file:///private.png' }) }, text => lines.push(text), () => assert.fail('Unexpected image'));
  assert.ok(lines.some(line => line.includes('未获得可直接预览的图像')));
  assert.ok(!lines.join().includes('private.png'));
});

test('hover routes Ctrl+V to the correct panel and leaves unrelated/text-input paste alone', async () => {
  let reads = 0;
  const h = harness({ read: async () => { reads++; return {}; } });
  const first = h.addPanel('generation');
  const second = h.addPanel('reverse');
  const paste = props => h.document.fire('keydown', { key: 'v', ctrlKey: true, ...props });
  assert.ok(!paste().prevented);
  first.list.fire('mouseover', { target: first.tile });
  assert.ok(paste().prevented);
  assert.equal(reads, 1);
  assert.ok(first.output.textContent.includes('插件已收到快捷键'));
  await new Promise(resolve => setImmediate(resolve));
  second.list.fire('mouseover', { target: second.tile });
  assert.ok(paste().prevented);
  assert.equal(reads, 2);
  assert.ok(second.output.textContent.includes('插件已收到快捷键'));
  h.document.activeElement = new h.Element('sp-textfield');
  assert.ok(!paste().prevented);
  assert.equal(reads, 2);
  h.document.activeElement = null;
  second.list.fire('mouseout', { target: second.tile, relatedTarget: null });
  assert.ok(!paste().prevented);
});

test('repeat keys do not reread; clicking the probe works without hover', async () => {
  let reads = 0;
  const h = harness({ read: async () => { reads++; return {}; } });
  const panel = h.addPanel('generation');
  panel.list.fire('mouseover', { target: panel.tile });
  h.document.fire('keydown', { ctrlKey: true, key: 'v', repeat: true });
  assert.equal(reads, 0);
  h.window.fire('blur');
  panel.section.querySelector('.clipboard-probe').children[1].fire('click');
  assert.equal(reads, 1);
});


function photoshopHarness(failure) {
  const calls = [];
  const original = { id: 1 };
  let closed = false;
  const temporary = {
    get id() { if (closed) throw new Error('Document no longer exists'); return failure === 'id' ? undefined : 2; }, width: 1600, height: 900,
    layers: [{ id: 10 }],
    async paste() { calls.push('paste'); if (failure === 'paste') throw new Error('Clipboard empty'); return { id: 3 }; },
    async revealAll() { calls.push('reveal'); },
    async trim() { calls.push('trim'); },
    async resizeImage() { calls.push('resize'); },
    saveAs: { async png() { calls.push('export'); if (failure === 'export') throw new Error('Export failed'); } },
    async close(option) { assert.equal(option, 'discard'); calls.push('close'); closed = true; }
  };
  const app = {
    activeDocument: original,
    documents: { length: 1, async add(options) {
      calls.push('create'); assert.equal(options.fill, 'transparent');
      if (failure === 'create') throw new Error('Create failed');
      app.activeDocument = temporary; return temporary;
    } }
  };
  const file = {
    async read() { calls.push('read'); return new Uint8Array([1, 2]).buffer; },
    async delete() { calls.push('deleteFile'); if (failure === 'missingFile') throw new Error('no such file or directory'); }
  };
  const modules = {
    photoshop: {
      action: { async batchPlay(commands) {
        if (commands[0]._obj === 'get') {
          assert.deepEqual(JSON.parse(JSON.stringify(commands[0]._target)), [
            { _property: 'boundsNoEffects' }, { _ref: 'layer', _id: 3 }, { _ref: 'document', _id: 2 }
          ]);
          calls.push('getBounds');
          if (failure === 'bounds') return [{ _obj: 'error', message: 'No bounds', result: -1 }];
          const dimension = number => ({ _unit: 'pixelsUnit', _value: number });
          return [{ boundsNoEffects: { left: dimension(0), top: dimension(0),
            right: dimension(failure === 'emptyLayer' ? 0 : 1600), bottom: dimension(failure === 'emptyLayer' ? 0 : 900) } }];
        }
        assert.equal(commands[0]._obj, 'paste');
        assert.equal(commands[0]._options.dialogOptions, 'silent');
        assert.equal(app.activeDocument, temporary);
        calls.push('paste');
        if (failure === 'paste') return [{ _obj: 'error', result: -25920, message: 'Clipboard empty' }];
        if (failure === 'plainError') throw { result: -1, reason: 'Native failure' };
        if (failure !== 'noLayer') temporary.layers.push({ id: 3, bounds: { left: 0, top: 0, right: ['emptyLayer', 'domBounds'].includes(failure) ? 0 : 1600, bottom: ['emptyLayer', 'domBounds'].includes(failure) ? 0 : 900 } });
        if (failure === 'clipped') { temporary.width = 64; temporary.height = 64; }
        return [{ _obj: 'paste', layerID: 3 }];
      } },
      app, constants: { TrimType: { TRANSPARENT: 'transparent' }, SaveOptions: { DONOTSAVECHANGES: 'discard' } },
      core: { async executeAsModal(callback) {
        if (failure === 'modal') return;
        await callback({ hostControl: {
          async registerAutoCloseDocument(id) { assert.equal(id, 2); calls.push('register'); },
          async unregisterAutoCloseDocument(id) { assert.equal(id, 2); calls.push('unregister'); }
        } });
      } }
    },
    uxp: { storage: { formats: { binary: 'binary' }, localFileSystem: {
      async getTemporaryFolder() { return { async createFile() { return file; } }; }
    } } }
  };
  return { ...harness(null, modules), calls, app, original };
}

test('Photoshop fallback closes only its temporary document and restores original before preview', async () => {
  const h = photoshopHarness();
  const previews = [], lines = [];
  await h.api.readPhotoshopProbe(text => lines.push(text), blob => {
    assert.equal(h.app.activeDocument, h.original);
    assert.ok(h.calls.includes('close'));
    previews.push(blob);
  });
  assert.equal(previews[0].type, 'image/png');
  assert.deepEqual(h.calls, ['create', 'register', 'paste', 'getBounds', 'reveal', 'trim', 'resize', 'export', 'close', 'unregister', 'read', 'deleteFile']);
  assert.ok(lines.some(line => line.includes('1600 × 900')));
});

for (const failure of ['create', 'paste', 'export']) {
  test('Photoshop fallback cleanup on ' + failure + ' failure', async () => {
    const h = photoshopHarness(failure);
    const lines = [];
    await h.api.readPhotoshopProbe(text => lines.push(text), () => assert.fail('Unexpected preview'));
    assert.equal(h.app.activeDocument, h.original);
    assert.ok(h.calls.includes('deleteFile'));
    assert.equal(h.calls.includes('close'), failure !== 'create');
    assert.ok(lines.some(line => line.includes('检测失败')));
  });
}


for (const failure of ['id', 'modal', 'plainError']) {
  test('Photoshop fallback stops safely and reports stage for ' + failure, async () => {
    const h = photoshopHarness(failure);
    const lines = [];
    await h.api.readPhotoshopProbe(text => lines.push(text), () => assert.fail('Unexpected preview'));
    assert.ok(!h.calls.includes('read'));
    assert.ok(!h.calls.includes('export'));
    assert.ok(lines.some(line => line.includes('检测失败阶段：')));
    assert.ok(!lines.some(line => line.includes('原因：undefined')));
    if (failure === 'id') assert.ok(!h.calls.includes('paste'));
    if (failure === 'plainError') assert.ok(lines.some(line => line.includes('Native failure')));
  });
}


for (const failure of ['noLayer', 'emptyLayer', 'clipped']) {
  test('Photoshop probe rejects false-success or clipped preview: ' + failure, async () => {
    const h = photoshopHarness(failure);
    const lines = [];
    await h.api.readPhotoshopProbe(text => lines.push(text), () => assert.fail('Unexpected preview'));
    assert.ok(!h.calls.includes('export'));
    assert.ok(!h.calls.includes('read'));
    assert.ok(h.calls.includes('close'));
    assert.ok(lines.some(line => line.includes('检测失败阶段：')));
  });
}


test('native bounds succeed even when DOM layer bounds are empty', async () => {
  const h = photoshopHarness('domBounds');
  const previews = [], lines = [];
  await h.api.readPhotoshopProbe(text => lines.push(text), blob => previews.push(blob));
  assert.equal(previews.length, 1);
  assert.ok(h.calls.includes('getBounds'));
  assert.ok(lines.some(line => line.includes('1600 × 900')));
});

test('native bounds query errors stop export with a specific diagnostic', async () => {
  const h = photoshopHarness('bounds');
  const lines = [];
  await h.api.readPhotoshopProbe(text => lines.push(text), () => assert.fail('Unexpected preview'));
  assert.ok(!h.calls.includes('export'));
  assert.ok(h.calls.includes('close'));
  assert.ok(lines.some(line => line.includes('No bounds')));
});

test('nonexistent temporary preview cleanup does not add misleading errors', async () => {
  const h = photoshopHarness('missingFile');
  const lines = [];
  await h.api.readPhotoshopProbe(text => lines.push(text), () => {});
  assert.ok(h.calls.includes('deleteFile'));
  assert.ok(!lines.some(line => line.includes('no such file')));
});
