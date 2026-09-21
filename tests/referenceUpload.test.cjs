const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(reverse) {
  const state = { files: [], status: '', busy: false, picks: 0, revoked: [], blobs: [] };
  const storage = {
    formats: { binary: 'binary' },
    localFileSystem: { async getFileForOpening(options) {
      state.picks++;
      assert.equal(options.allowMultiple, true);
      assert.deepEqual(Array.from(options.types), ['png;*.jpg;*.jpeg;*.webp']);
      return state.files;
    } }
  };
  const list = reverse ? 'images' : 'referenceImages';
  const render = reverse ? 'renderImages' : 'renderReferences';
  const flag = reverse ? 'captureInProgress' : 'referenceAddInProgress';
  const hooks = `
    ${render} = () => {};
    setStatus = message => { state.status = message; };
    ${reverse ? '' : 'setBusy = busy => { state.busy = busy; };'}
    window.testApi = {
      upload: uploadReferenceImages,
      acceptPaste: acceptPastedReference,
      items: () => ${list},
      seed: items => { ${list} = items; },
      pending: () => ${flag}
    };
    ${reverse ? '' : `
      getModelValue = () => 'test-model';
      getActualSize = () => '1024x1024';
      getGeminiAspectRatio = () => '1:1';
      getGeminiImageSize = () => '1K';
      appendCommonFormFields = () => {};
      refreshGenerationStatus = () => {};
      requestHeaders = geminiRequestHeaders = () => ({});
      apiUrl = buildGeminiImageUrl = value => value;
      element = () => ({ checked: false });
      requestJson = async (url, options) => options.body;
      window.testApi.generations = () => submitTextToImage('test');
      window.testApi.edits = () => submitImageEdit('test');
      window.testApi.gemini = () => submitGeminiImage('test', referenceImages);
    `}
  `;
  const context = {
    window: {}, state, Blob, FormData, btoa, Uint8Array,
    require: name => name === 'uxp' ? { storage } : { app: { documents: [] } },
    URL: {
      createObjectURL(blob) { state.blobs.push(blob); return 'blob:' + state.blobs.length; },
      revokeObjectURL(url) { state.revoked.push(url); }
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/', reverse ? 'imageReverseModule.js' : 'aiAssistantModule.js'), 'utf8');
  vm.runInNewContext(source.slice(0, source.lastIndexOf('})();')) + hooks + '\n})();', context);
  return { state, api: context.window.testApi };
}

function file(name, read = async () => new Uint8Array([1, 2, 3]).buffer) {
  return { name, async read(options) { assert.equal(options.format, 'binary'); return read(); } };
}

for (const reverse of [false, true]) {
  const moduleName = reverse ? 'reverse' : 'generation';
  test(moduleName + ': local multi-select works without a Photoshop document and preserves formats', async () => {
    const { state, api } = harness(reverse);
    state.files = [file('A.PNG'), file('B.jpeg'), file('C.webp')];
    await api.upload();
    assert.deepEqual(Array.from(api.items(), item => item.mimeType), ['image/png', 'image/jpeg', 'image/webp']);
    assert.deepEqual(state.blobs.map(blob => blob.type), ['image/png', 'image/jpeg', 'image/webp']);
    if (reverse) assert.equal(api.items()[0].base64, 'AQID');
    assert.ok(state.status.includes("3/8"));
    assert.equal(api.pending(), false);
    assert.equal(state.busy, false);
  });
  test(moduleName + ': cancelling keeps existing references and status', async () => {
    const { state, api } = harness(reverse);
    const existing = { name: 'existing.jpg' };
    api.seed([existing]);
    state.status = 'ready';
    await api.upload();
    assert.equal(api.items()[0], existing);
    assert.equal(state.status, 'ready');
    assert.equal(api.pending(), false);
  });
  test(moduleName + ': rejects excess selection and blocks picker at capacity', async () => {
    const { state, api } = harness(reverse);
    api.seed(Array.from({ length: 7 }, () => ({})));
    state.files = [file('A.png'), file('B.png')];
    await api.upload();
    assert.equal(api.items().length, 7);
    assert.match(state.status, /还可添加 1 张/);
    api.seed(Array.from({ length: 8 }, () => ({})));
    await api.upload();
    assert.equal(state.picks, 1);
  });
  test(moduleName + ': failed reads release previews and allow retry', async () => {
    const { state, api } = harness(reverse);
    state.files = [file('A.png'), file('B.png', async () => { throw new Error('read failed'); })];
    await api.upload();
    assert.equal(api.items().length, 0);
    assert.deepEqual(state.revoked, ['blob:1']);
    assert.match(state.status, /read failed/);
    state.files = [file('C.jpg')];
    await api.upload();
    assert.equal(api.items().length, 1);
  });
  test(moduleName + ': duplicate clicks cannot start concurrent imports', async () => {
    const { state, api } = harness(reverse);
    let finish;
    state.files = [file('A.png', () => new Promise(resolve => { finish = resolve; }))];
    const first = api.upload();
    await Promise.resolve();
    await api.upload();
    assert.equal(state.picks, 1);
    finish(new Uint8Array([1]).buffer);
    await first;
    assert.equal(api.items().length, 1);
  });
}

test('generation: Generations, Edits and Gemini send the actual uploaded image formats', async () => {
  const { state, api } = harness(false);
  state.files = [file('A.png'), file('B.webp'), file('C.jpg')];
  await api.upload();
  for (const submit of [api.generations, api.edits]) {
    const body = await submit();
    const images = body.getAll('image');
    assert.deepEqual(images.map(image => image.type), ['image/png', 'image/webp', 'image/jpeg']);
    assert.deepEqual(images.map(image => image.name), ['reference_1.png', 'reference_2.webp', 'reference_3.jpg']);
  }
  const body = JSON.parse(await api.gemini());
  assert.deepEqual(body.contents[0].parts.slice(0, 3).map(part => part.inlineData.mimeType), ['image/png', 'image/webp', 'image/jpeg']);
});


for (const reverse of [false, true]) {
  test((reverse ? 'reverse' : 'generation') + ': accepts isolated pasted PNG and keeps original bytes/format', () => {
    const { api } = harness(reverse);
    const image = { name: 'pasted-layer-10.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]).buffer };
    assert.equal(api.acceptPaste(image), true);
    assert.equal(api.items().length, 1);
    assert.equal(api.items()[0].mimeType, 'image/png');
    if (reverse) assert.equal(api.items()[0].base64, 'AQID');
    else assert.equal(api.items()[0].bytes, image.bytes);
  });
  test((reverse ? 'reverse' : 'generation') + ': rejects pasted image when reference list is full', () => {
    const { api } = harness(reverse);
    api.seed(Array.from({ length: 8 }, () => ({})));
    assert.equal(api.acceptPaste({}), false);
    assert.equal(api.items().length, 8);
  });
}
