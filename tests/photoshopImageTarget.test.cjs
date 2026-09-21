const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApi({ action, app, core, storage }) {
  const context = {
    window: {},
    require(name) {
      return name === 'uxp' ? { storage } : { action, app, core };
    }
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/modules/photoshopImageTarget.js'), 'utf8'),
    context
  );
  return context.window.LiangyiPhotoshopImageTarget;
}

test('selection bounds take priority and canvas bounds are the fallback', async () => {
  const app = { documents: [{}], activeDocument: {} };
  const storage = { localFileSystem: {}, formats: { binary: 'binary' } };
  const core = {};
  let selection = {
    left: { _value: 30 }, top: { _value: 40 },
    right: { _value: 430 }, bottom: { _value: 340 }
  };
  const action = {
    async batchPlay() {
      return selection ? [{ selection }] : [{ _obj: 'error', message: 'no selection' }];
    }
  };
  const api = loadApi({ action, app, core, storage });

  const selected = await api.getPlacementTarget({ id: 1, width: 1000, height: 800 });
  assert.equal(selected.type, 'selection');
  assert.deepEqual(
    { ...selected.bounds },
    { left: 30, top: 40, right: 430, bottom: 340, width: 400, height: 300 }
  );

  selection = null;
  const canvas = await api.getPlacementTarget({ id: 1, width: { value: 1000 }, height: { value: 800 } });
  assert.equal(canvas.type, 'canvas');
  assert.deepEqual(
    { ...canvas.bounds },
    { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }
  );
});

test('placed layer uses contain scaling and is centered in an offset selection', async () => {
  let bounds = { left: 0, top: 0, right: 200, bottom: 400 };
  const commands = [];
  const action = {
    async batchPlay(batch) {
      const command = batch[0];
      commands.push(command);
      if (command._obj === 'get') {
        return [{ bounds: { ...bounds }, layerID: 77 }];
      }
      if (command._obj === 'transform') {
        const ratio = command.width._value / 100;
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;
        const width = (bounds.right - bounds.left) * ratio;
        const height = (bounds.bottom - bounds.top) * ratio;
        bounds = {
          left: centerX - width / 2,
          top: centerY - height / 2,
          right: centerX + width / 2,
          bottom: centerY + height / 2
        };
        return [{}];
      }
      if (command._obj === 'move') {
        const x = command.to.horizontal._value;
        const y = command.to.vertical._value;
        bounds = {
          left: bounds.left + x,
          top: bounds.top + y,
          right: bounds.right + x,
          bottom: bounds.bottom + y
        };
        return [{}];
      }
      throw new Error(`Unexpected command: ${command._obj}`);
    }
  };
  const api = loadApi({
    action,
    app: { documents: [{}], activeDocument: {} },
    core: {},
    storage: { localFileSystem: {}, formats: { binary: 'binary' } }
  });

  const result = await api.fitLayerToTarget(77, {
    left: 100, top: 50, right: 500, bottom: 350
  });

  assert.equal(result.scale, 75);
  assert.equal(result.moveX, 200);
  assert.equal(result.moveY, 0);
  assert.deepEqual(
    { ...result.finalBounds },
    { left: 225, top: 50, right: 375, bottom: 350, width: 150, height: 300 }
  );
  assert.equal(commands.find(command => command._obj === 'transform').width._value, 75);
  assert.equal(commands.find(command => command._obj === 'move').to.horizontal._value, 200);
});

test('capturing a selection crops only a duplicate and never changes the source selection', async () => {
  const selection = { left: 12, top: 34, right: 212, bottom: 184 };
  const actionCommands = [];
  const action = {
    async batchPlay(batch) {
      actionCommands.push(batch[0]);
      return [{ selection: { ...selection } }];
    }
  };
  const file = {
    deleted: false,
    async read(options) {
      assert.equal(options.format, 'binary');
      return new Uint8Array([1, 2, 3]).buffer;
    },
    async delete() { this.deleted = true; }
  };
  const storage = {
    formats: { binary: 'binary' },
    localFileSystem: {
      async getTemporaryFolder() {
        return { async createFile() { return file; } };
      }
    }
  };
  let duplicateCrop = null;
  let duplicateSaved = false;
  const app = { documents: [], activeDocument: null };
  const duplicate = {
    id: 2,
    async flatten() {},
    async crop(bounds) { duplicateCrop = { ...bounds }; },
    saveAs: { async jpg() { duplicateSaved = true; } },
    async closeWithoutSaving() {
      app.documents = app.documents.filter(document => document.id !== this.id);
    }
  };
  const source = {
    id: 1,
    title: 'Source.psd',
    width: 1000,
    height: 800,
    async duplicate() {
      app.documents.push(duplicate);
      app.activeDocument = duplicate;
      return duplicate;
    }
  };
  app.documents = [source];
  app.activeDocument = source;
  const core = {
    async executeAsModal(callback) {
      return callback({ hostControl: { async registerAutoCloseDocument() {} } });
    }
  };
  const api = loadApi({ action, app, core, storage });

  const result = await api.captureReference({ expectedDocumentId: 1 });

  assert.equal(result.target, 'selection');
  assert.deepEqual(duplicateCrop, selection);
  assert.equal(duplicateSaved, true);
  assert.equal(app.activeDocument, source);
  assert.deepEqual(selection, { left: 12, top: 34, right: 212, bottom: 184 });
  assert.equal(actionCommands.some(command => command._obj === 'set' || command._obj === 'delete'), false);
  assert.equal(file.deleted, true);
});
