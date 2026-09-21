const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function harness(options = {}) {
  const callbacks = [], removed = [], jobs = new Map();
  let nextTimer = 0;
  const document = {};
  const app = { documents: [{}], activeDocument: { id: 41, layers: [{ id: 1 }], activeLayers: [] } };
  let layerSequence = 100;
  const action = {
    addNotificationListener(events, callback) {
      assert.deepEqual(Array.from(events), ['paste']);
      callbacks.push(callback);
      return options.synchronousListeners ? undefined : Promise.resolve();
    },
    removeNotificationListener(events, callback) {
      removed.push(callback);
      return options.synchronousListeners ? undefined : Promise.resolve();
    }
  };
  const context = {
    window: {}, document, require: name => name === 'uxp' ? { storage: {} } : { app, action },
    getComputedStyle: node => ({ display: node.hidden ? 'none' : 'block', visibility: 'visible' }),
    setTimeout: callback => { jobs.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => jobs.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/modules/photoshopPasteReference.js'), 'utf8').replace('window.LiangyiPhotoshopPaste =', 'importPastedLayer = async (target, docId, layerId) => target.acceptImage({ docId, layerId });\nwindow.LiangyiPhotoshopPaste ='), context);
  const api = context.window.LiangyiPhotoshopPaste;
  function target() {
    const handlers = {};
    const tile = { parentNode: document, disabled: false, isConnected: true, setAttribute() {},
      addEventListener(name, cb) { handlers[name] = cb; }, contains: node => node === tile };
    const calls = [], statuses = [];
    const config = { allowed: true, canAdd() { return config.allowed; },
      async acceptImage(image) { calls.push(image.docId); }, setStatus: message => statuses.push(message) };
    api.bind(tile, config);
    return { tile, calls, statuses, config, handlers,
      enter() { handlers.mouseenter({}); }, leave() { handlers.mouseleave({}); } };
  }
  return { api, app, target, callbacks, removed, jobs,
    paste(descriptor = {}) {
      if (app.documents.length && app.activeDocument.layers) {
        const layer = { id: ++layerSequence };
        app.activeDocument.layers.push(layer); app.activeDocument.activeLayers = [layer];
      }
      callbacks[0]('paste', descriptor);
    },
    async flush() { const batch = Array.from(jobs.values()); jobs.clear(); for (const callback of batch) await callback(); }
  };
}

test('registers once and captures only the hovered target after native paste completes', async () => {
  const h = harness();
  await h.api.start(); await h.api.start();
  assert.equal(h.callbacks.length, 1);
  const generation = h.target(), reverse = h.target();
  h.paste(); await h.flush();
  assert.equal(generation.calls.length + reverse.calls.length, 0);
  generation.enter(); h.paste({ documentID: 41 });
  assert.equal(generation.calls.length, 0);
  await h.flush();
  assert.deepEqual(generation.calls, [41]);
  reverse.enter(); h.paste(); await h.flush();
  assert.deepEqual(reverse.calls, [41]);
  reverse.leave(); h.paste(); await h.flush();
  assert.equal(reverse.calls.length, 1);
});

test('supports Photoshop builds whose notification listener API returns undefined', async () => {
  const h = harness({ synchronousListeners: true });
  await h.api.start();
  await h.api.start();
  assert.equal(h.callbacks.length, 1);
  const target = h.target();
  target.enter(); h.paste(); await h.flush();
  assert.deepEqual(target.calls, [41]);
  await h.api.stop();
  assert.equal(h.removed[0], h.callbacks[0]);
});

test('history access failures never block pasted-image import', async () => {
  const h = harness();
  Object.defineProperty(h.app.activeDocument, 'activeHistoryState', {
    get() { throw new Error('History is unavailable in this callback'); }
  });
  Object.defineProperty(h.app.activeDocument, 'historyStates', {
    get() { throw new Error('History collection is unavailable'); }
  });
  await h.api.start();
  const target = h.target();
  target.enter(); h.paste(); await h.flush();
  assert.deepEqual(target.calls, [41]);
});

test('does not install keyboard handlers or take keyboard focus', () => {
  const h = harness();
  const target = h.target();
  assert.ok(!target.handlers.keydown);
  assert.ok(!target.handlers.paste);
});

for (const state of ['disabled', 'hidden', 'detached', 'full', 'noDocument', 'failedPaste', 'otherDocument']) {
  test('ignores native paste for ' + state, async () => {
    const h = harness(); await h.api.start();
    const target = h.target(); target.enter();
    if (state === 'disabled') target.tile.disabled = true;
    if (state === 'hidden') target.tile.hidden = true;
    if (state === 'detached') target.tile.isConnected = false;
    if (state === 'full') target.config.allowed = false;
    if (state === 'noDocument') h.app.documents = [];
    h.paste(state === 'failedPaste' ? { _obj: 'error', result: -1 } : state === 'otherDocument' ? { documentID: 99 } : {});
    await h.flush();
    assert.equal(target.calls.length, 0);
  });
}

test('pins the event document and does not capture a newly selected document', async () => {
  const h = harness(); await h.api.start();
  const target = h.target(); target.enter(); h.paste();
  h.app.activeDocument = { id: 99 };
  await h.flush();
  assert.equal(target.calls.length, 0);
  assert.ok(target.statuses.some(message => message.includes('文档已切换')));
});

test('coalesces duplicate notifications and rechecks capacity before capture', async () => {
  const h = harness(); await h.api.start();
  const target = h.target(); target.enter(); h.paste(); h.paste();
  assert.equal(h.jobs.size, 1);
  target.config.allowed = false;
  await h.flush(); assert.equal(target.calls.length, 0);
  target.config.allowed = true; h.paste(); await h.flush();
  assert.deepEqual(target.calls, [41]);
});

test('hiding and destroying the panel cancel pending capture and remove the listener', async () => {
  const h = harness(); await h.api.start();
  const target = h.target(); target.enter(); h.paste();
  h.api.resetTarget(); await h.flush(); assert.equal(target.calls.length, 0);
  target.enter(); h.paste(); await h.api.stop(); await h.flush();
  assert.equal(target.calls.length, 0);
  assert.equal(h.removed[0], h.callbacks[0]);
});

test('capture errors are shown and subsequent paste can retry', async () => {
  const h = harness(); await h.api.start();
  const target = h.target();
  const brokenTile = h.target().tile;
  const messages = [];
  let attempts = 0;
  h.api.bind(brokenTile, { canAdd: () => true, acceptImage: async () => { attempts++; throw new Error('Host busy'); }, setStatus: message => messages.push(message) });
  // Use a directly recorded fresh binding so the test exercises the bound callback.
  let enter;
  const tile = { ...target.tile, addEventListener(name, handler) { if (name === 'mouseenter') enter = handler; } };
  h.api.bind(tile, { canAdd: () => true, acceptImage: async () => { attempts++; throw new Error('Host busy'); }, setStatus: message => messages.push(message) });
  enter(); h.paste(); await h.flush(); h.paste(); await h.flush();
  assert.equal(attempts, 2);
  assert.ok(messages.some(message => message.includes('Host busy')));
});


test('an event targeting an existing layer never imports or deletes it', async () => {
  const h = harness(); await h.api.start();
  const target = h.target(); target.enter();
  h.paste({ layerID: 1 }); await h.flush();
  assert.equal(target.calls.length, 0);
  assert.ok(target.statuses.some(message => message.includes('无法唯一确认')));
});

test('changing layer selection after the event does not change the pinned import layer', async () => {
  const h = harness(); await h.api.start();
  let enter;
  const ids = [];
  const tile = { setAttribute() {}, addEventListener(name, cb) { if(name === 'mouseenter') enter = cb; } };
  h.api.bind(tile, { canAdd: () => true, acceptImage: async image => ids.push(image.layerId), setStatus() {} });
  enter(); h.paste();
  const pastedId = h.app.activeDocument.activeLayers[0].id;
  h.app.activeDocument.activeLayers = [{ id: 1 }];
  await h.flush();
  assert.deepEqual(ids, [pastedId]);
});

function importHarness(failure) {
  const log = [], statuses = [];
  const unrelated = { id: 1, delete() { assert.fail('Existing layer must never be deleted'); } };
  const beforePaste = { id: 9, docId: 41, name: 'Before Paste' };
  const pastedState = { id: 10, docId: 41, name: 'Paste' };
  let activeHistoryState = pastedState;
  const source = { id: 41, resolution: 72, layers: [unrelated], activeLayers: [unrelated], historyStates: [beforePaste, pastedState] };
  const app = { documents: [], activeDocument: source };
  const copy = { id: 200, visible: true, async translate(x, y) { log.push('translate'); assert.equal(x, 120); assert.equal(y, 40); } };
  const pasted = { id: 100, async duplicate(doc) {
    assert.equal(doc.id, 42); log.push('duplicate');
    if(failure === 'duplicate') throw new Error('duplicate failed');
    return copy;
  }, async delete() { log.push('delete-source'); if(failure === 'delete') throw new Error('delete failed'); } };
  source.layers.push(pasted);
  Object.defineProperty(source, 'activeHistoryState', {
    get() { return activeHistoryState; },
    set(state) {
      log.push('restore-history');
      if(failure === 'restore') throw new Error('restore failed');
      activeHistoryState = state;
      source.layers = source.layers.filter(layer => layer.id !== pasted.id);
    }
  });
  const temp = { id: 42,
    async resizeCanvas(w,h,anchor) { log.push('resize'); assert.equal(w,800); assert.equal(h,600); assert.equal(anchor,'topLeft'); },
    saveAs: { async png() { log.push('export'); if(failure === 'export') throw new Error('export failed'); } },
    async close() { log.push('close'); }
  };
  app.documents = [source];
  app.documents.add = async () => { log.push('create'); app.activeDocument = temp; return temp; };
  const file = { async read() { log.push('read'); if(failure === 'read') throw new Error('read failed'); return new Uint8Array([1,2,3]).buffer; }, async delete() { log.push('cleanup'); } };
  const modules = {
    photoshop: { app, constants: { AnchorPosition:{TOPLEFT:'topLeft'}, SaveOptions:{DONOTSAVECHANGES:'discard'} },
      action: { async batchPlay(commands) {
        assert.equal(commands[0]._obj,'get');
        assert.equal(commands[0]._target[1]._id,200);
        assert.equal(commands[0]._target[2]._id,42);
        return [{bounds:{left:-120,top:-40,right:680,bottom:560}}];
      } },
      core: { async executeAsModal(callback) { return callback({hostControl:{async registerAutoCloseDocument(){},async unregisterAutoCloseDocument(){}}}); } }
    },
    uxp: {storage:{formats:{binary:'binary'},localFileSystem:{async getTemporaryFolder(){return {async createFile(){return file;}};}}}}
  };
  const context = {window:{},document:{},require:name=>modules[name],setTimeout,clearTimeout};
  const code=fs.readFileSync(path.join(__dirname,'../src/modules/photoshopPasteReference.js'),'utf8');
  vm.runInNewContext(code.replace('window.LiangyiPhotoshopPaste = {','window.LiangyiPhotoshopPaste = { importPastedLayer,'),context);
  const target = {tile:{},canAdd:()=>failure!=='full',setStatus:message=>statuses.push(message),async acceptImage(image){
    log.push('accept'); assert.equal(image.mimeType,'image/png'); assert.equal(image.bytes.byteLength,3);
    assert.equal(app.activeDocument,source);
    if(failure==='accept') throw new Error('accept failed');
    if(failure==='reject') return false;
    return true;
  }};
  return {log,statuses,app,source,run:()=>context.window.LiangyiPhotoshopPaste.importPastedLayer(target,41,100,beforePaste)};
}

test('exports only the pasted layer and restores the exact pre-paste history state after acceptance',async()=>{
  const h=importHarness(); assert.equal(await h.run(),true);
  assert.deepEqual(h.log,['create','duplicate','translate','resize','export','close','read','accept','restore-history','cleanup']);
  assert.equal(h.app.activeDocument,h.source);
  assert.ok(h.statuses.some(message=>message.includes('恢复粘贴前的选区')));
});
for(const failure of ['duplicate','export','read','accept','reject','full']) {
  test('preserves pasted layer when import fails at '+failure,async()=>{
    const h=importHarness(failure); assert.equal(await h.run(),false);
    assert.ok(!h.log.includes('delete-source'));
    assert.ok(h.log.includes('cleanup'));
    assert.equal(h.app.activeDocument,h.source);
  });
}
test('history restore failure deletes the pasted layer as fallback and reports the selection warning',async()=>{
  const h=importHarness('restore'); assert.equal(await h.run(),false);
  assert.ok(h.log.indexOf('accept')<h.log.indexOf('restore-history'));
  assert.ok(h.log.indexOf('restore-history')<h.log.indexOf('delete-source'));
  assert.ok(h.statuses.some(message=>message.includes('原选区恢复失败')));
});
