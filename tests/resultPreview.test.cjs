const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(options = {}) {
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, {
      disabled: false, textContent: '', src: '',
      classList: { add() {}, remove() {}, toggle() {} },
      removeAttribute(name) { if (name === 'src') this.src = ''; }
    });
    return elements.get(id);
  };
  const events = { opens: [], sizes: [], saves: [], reads: [], deleted: [], tokens: [], revoked: [], warnings: [], maxModals: 0 };
  let fileId = 0;
  let failSave = !!options.failSave;
  const originals = [];
  function file(name, kind, width = 3840, height = 2160) {
    return {
      name, kind, width, height, id: ++fileId,
      async read() {
        events.reads.push(this);
        assert.equal(this.kind, 'thumbnail', 'panel must never read full originals');
        return new Uint8Array([this.id]).buffer;
      },
      async delete() { events.deleted.push(this); },
      async copyTo(folder) {
        assert.equal(this.kind, 'original');
        const copy = file(this.name, 'work', this.width, this.height);
        folder.children.push(copy);
        return copy;
      }
    };
  }
  function original(name, width, height) {
    const item = file(name, 'original', width, height);
    originals.push(item);
    return item;
  }
  const tempFolder = {
    async createFolder(name) {
      return { name, kind: 'folder', children: [], async delete() {
        events.deleted.push(...this.children, this);
      } };
    },
    async createFile(name) { return file(name, 'thumbnail'); }
  };
  const userDocument = { id: 900, width: 1000, height: 1000 };
  const app = { documents: [userDocument], activeDocument: userDocument,
    async open(entry) {
      assert.equal(entry.kind, 'work', 'thumbnail must open an isolated copy');
      events.opens.push(entry);
      if (options.openGate) await options.openGate.promise;
      const doc = {
        id: entry.id, width: entry.width, height: entry.height,
        async resizeImage(width, height) { events.sizes.push([width, height]); this.width = width; this.height = height; },
        saveAs: { async png(output, settings, asCopy) {
          assert.equal(asCopy, true);
          if (options.cancelSave) { executionContext.isCancelled = true; throw new Error('cancelled'); }
          if (failSave) { failSave = false; throw new Error('save failed'); }
          events.saves.push(output);
        } },
        async closeWithoutSaving() { app.documents = app.documents.filter((item) => item !== doc); }
      };
      app.documents.push(doc);
      app.activeDocument = doc;
      return doc;
    }
  };
  let modalCount = 0;
  const autoCloseIds = new Set();
  const executionContext = { isCancelled: false, hostControl: {
    async registerAutoCloseDocument(id) { autoCloseIds.add(id); },
    async unregisterAutoCloseDocument(id) { autoCloseIds.delete(id); }
  } };
  const core = { async executeAsModal(callback) {
    modalCount++;
    events.maxModals = Math.max(events.maxModals, modalCount);
    try { return await callback(executionContext); } finally {
      app.documents = app.documents.filter((doc) => !autoCloseIds.has(doc.id));
      autoCloseIds.clear();
      if (!app.documents.includes(app.activeDocument)) app.activeDocument = app.documents[0];
      modalCount--;
    }
  } };
  const storage = {
    formats: { binary: 'binary' },
    localFileSystem: {
      async getTemporaryFolder() { return tempFolder; },
      async createSessionToken(entry) { events.tokens.push(entry); return entry.name; }
    }
  };
  const context = {
    document: { getElementById: el }, window: {}, Blob,
    console: { warn: (...args) => events.warnings.push(args) },
    URL: {
      createObjectURL(blob) { return 'blob:preview-' + (++fileId); },
      revokeObjectURL(url) { events.revoked.push(url); }
    },
    require(name) {
      return name === 'photoshop' ? { app, core, action: { async batchPlay() {} } } : { storage };
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/aiAssistantModule.js'), 'utf8');
  const hooks = "window.testApi = {\n  setFiles: (files) => { lastResultFiles = files; }, files: () => lastResultFiles,\n  show: showResultPreview, clear: clearAllResults, append: appendResultFiles,\n  exportCurrent: exportCurrentResult, cacheSize: () => resultThumbnailCache.size,\n  idle: () => thumbnailQueue\n};";
  vm.runInNewContext(source.replace('window.LiangyiAIConfig = {', hooks + '\nwindow.LiangyiAIConfig = {'), context);
  return { api: context.window.testApi, el, events, original, app, userDocument };
}

test('generates one bounded PNG, reuses it, reads only thumbnails, and leaves original intact', async () => {
  const h = harness();
  const source = h.original('large.png');
  h.api.setFiles([source]);
  await Promise.all([h.api.show(0), h.api.show(0)]);
  await h.api.show(0);
  assert.equal(h.events.opens.length, 1);
  assert.equal(h.events.saves.length, 1);
  assert.deepEqual(h.events.sizes, [[800, 450]]);
  assert.ok(h.events.reads.every((item) => item.kind === 'thumbnail'));
  assert.equal(h.app.activeDocument, h.userDocument);
  assert.deepEqual(h.app.documents, [h.userDocument]);
  assert.ok(!h.events.deleted.includes(source));
  assert.equal(h.events.revoked.length, 1);
});

test('portrait previews fit the height limit and small images are not enlarged', async () => {
  const h = harness();
  const tall = h.original('tall.jpg', 2160, 3840);
  const small = h.original('small.png', 120, 80);
  h.api.setFiles([tall, small]);
  await h.api.show(0);
  await h.api.show(1);
  assert.deepEqual(h.events.sizes, [[293, 520]]);
  assert.equal(h.events.saves.length, 2);
});

test('thumbnail host work is serialized and stale requests do not read or display images', async () => {
  const gate = deferred();
  const h = harness({ openGate: gate });
  h.api.setFiles([h.original('a.png'), h.original('b.png')]);
  const first = h.api.show(0);
  const second = h.api.show(1);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(h.events.maxModals, 1);
  assert.equal(h.events.reads.length, 1);
  assert.equal(h.events.reads[0], h.events.saves[1]);
  assert.equal(h.el('resultPageText').textContent, '2/2');
});

test('clearing while preview is pending disposes work and prevents preview resurrection', async () => {
  const gate = deferred();
  const h = harness({ openGate: gate });
  const source = h.original('pending.png');
  h.api.setFiles([source]);
  const preview = h.api.show(0);
  // Wait until host opening has started, without a timing-dependent sleep.
  while (!h.events.opens.length) await Promise.resolve();
  const clearing = h.api.clear();
  gate.resolve();
  await Promise.all([preview, clearing]);
  assert.equal(h.el('previewImage').src, '');
  assert.equal(h.api.files().length, 0);
  assert.equal(h.api.cacheSize(), 0);
  assert.equal(h.events.reads.length, 0);
  assert.ok(h.events.deleted.includes(source));
  assert.ok(h.events.deleted.some((entry) => entry.kind === 'work'));
  assert.deepEqual(h.app.documents, [h.userDocument]);
});

test('clear removes cached thumbnails and original files and revokes preview URL', async () => {
  const h = harness();
  const source = h.original('clear.png');
  h.api.setFiles([source]);
  await h.api.show(0);
  await h.api.clear();
  assert.ok(h.events.deleted.includes(h.events.saves[0]));
  assert.ok(h.events.deleted.includes(source));
  assert.equal(h.events.revoked.length, 1);
  assert.equal(h.api.cacheSize(), 0);
});

test('thumbnail failure cleans up, keeps original exportable, and can retry', async () => {
  const h = harness({ failSave: true });
  const source = h.original('retry.png');
  h.api.setFiles([source]);
  await h.api.show(0);
  assert.match(h.el('resultPreviewStatus').textContent, /预览暂不可用/);
  assert.equal(h.events.reads.length, 0);
  assert.ok(!h.events.deleted.includes(source));
  assert.ok(h.events.deleted.some((entry) => entry.kind === 'thumbnail'));
  assert.deepEqual(h.app.documents, [h.userDocument]);
  await h.api.exportCurrent();
  assert.equal(h.events.tokens[0], source);
  await h.api.show(0);
  assert.equal(h.events.saves.length, 1);
  assert.equal(h.el('resultPreviewStatus').textContent, '');
});

test('generation result registration does not wait on thumbnail preparation', async () => {
  const gate = deferred();
  const h = harness({ openGate: gate });
  const source = h.original('result.png');
  await h.api.append([source]);
  assert.equal(h.api.files()[0], source);
  gate.resolve();
  await h.api.idle();
});

test('export waits for temporary preview document to close and uses original file', async () => {
  const gate = deferred();
  const h = harness({ openGate: gate });
  const source = h.original('export.png');
  h.api.setFiles([source]);
  const preview = h.api.show(0);
  const exporting = h.api.exportCurrent();
  gate.resolve();
  await Promise.all([preview, exporting]);
  assert.equal(h.events.maxModals, 1);
  assert.equal(h.events.tokens[0], source);
  assert.equal(h.app.activeDocument, h.userDocument);
});

test('cancelling host work auto-closes the temporary document and preserves original', async () => {
  const h = harness({ cancelSave: true });
  const source = h.original('cancel.png');
  h.api.setFiles([source]);
  await h.api.show(0);
  assert.deepEqual(h.app.documents, [h.userDocument]);
  assert.equal(h.app.activeDocument, h.userDocument);
  assert.ok(!h.events.deleted.includes(source));
  assert.ok(h.events.deleted.some((entry) => entry.kind === 'thumbnail'));
  assert.equal(h.events.reads.length, 0);
});
