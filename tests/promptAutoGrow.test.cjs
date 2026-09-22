const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 锁住提示词框的尺寸策略。
// UXP 的 sp-textarea 内部不滚动、内容超出后滚不了也够不着，只能靠 rows 把内层文本区撑高，
// 再把宿主外框显式设成内层高度，最后用面板自身的滚动条浏览。三条硬约束：
//   1) 估算偏低会让内容被裁掉且无法访问，所以只测「不许偏小」；
//   2) 必须纯函数式、每次先移除行内高度再量，否则量到上一次的值会棘轮式越撑越高；
//   3) 宿主必须与内层同高，否则内层偏移，正文跑到可视区之外（看不见正文、点不准光标）。
const ROW_PX = 20;
const CHROME = 24;

function createHarness() {
  class Element {
    constructor() {
      this.attributes = {};
      this.listeners = {};
      this.style = {};
      this.value = '';
      this.clientWidth = 300;
      this.selectionStart = 0;
      this.scrollTop = 0;
      this.parentNode = null;
      this.classList = { add() {}, remove() {}, contains: () => false, toggle() {} };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
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
  document.addEventListener = () => {};

  const context = {
    document, window: {}, require: () => ({}),
    setTimeout, clearTimeout, AbortController, URL, console
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/aiAssistantModule.js'), 'utf8');
  const hooks = `
    window.testApi = { autoGrowPrompt, countPromptLineUnits, MIN_ROWS: PROMPT_MIN_ROWS };
  `;
  vm.runInNewContext(
    source.replace('window.LiangyiAIConfig = {', hooks + '\nwindow.LiangyiAIConfig = {'),
    context
  );
  return context.window.testApi;
}

// 模拟 sp-textarea：
//   - 内层文本区高度由 rows 决定（实测有效）
//   - 宿主外框**不跟随** rows，只认行内 height，没有行内 height 时用组件自身默认高度
//   - scrollHeight = max(内层高度, 当前宿主高度)，因此「先移除行内高度再量」是防棘轮的关键
function makeInput(value, options = {}) {
  const naturalHeight = options.naturalHeight === undefined ? 160 : options.naturalHeight;
  const styleStore = {};
  const input = {
    value,
    clientWidth: options.clientWidth === undefined ? 300 : options.clientWidth,
    selectionStart: value.length,
    parentNode: null,
    attributes: {},
    setAttribute(name, next) { this.attributes[name] = String(next); }
  };
  input.style = {
    removeProperty(name) { delete styleStore[name]; },
    get height() { return styleStore.height; },
    set height(next) { styleStore.height = next; }
  };
  Object.defineProperty(input, 'scrollHeight', {
    get() {
      const rows = Number.parseInt(input.attributes.rows, 10);
      const inner = Number.isFinite(rows) ? rows * ROW_PX + CHROME : naturalHeight;
      const inline = Number.parseFloat(String(styleStore.height || ''));
      const host = Number.isFinite(inline) && inline > 0 ? inline : naturalHeight;
      return Math.max(inner, host);
    }
  });
  return input;
}

function rowsOf(input) {
  return Number.parseInt(input.attributes.rows, 10);
}

function heightOf(input) {
  return Number.parseFloat(String(input.style.height || '0'));
}

test('空提示词时行数落在下限', () => {
  const api = createHarness();
  const input = makeInput('');
  api.autoGrowPrompt(input);
  assert.equal(rowsOf(input), api.MIN_ROWS);
});

test('短提示词不超过下限', () => {
  const api = createHarness();
  const input = makeInput('一只橘猫');
  api.autoGrowPrompt(input);
  assert.equal(rowsOf(input), api.MIN_ROWS);
});

test('多行提示词按行数增高', () => {
  const api = createHarness();
  const value = Array.from({ length: 30 }, (_, index) => `第 ${index + 1} 行的提示词内容`).join('\n');
  const input = makeInput(value);
  api.autoGrowPrompt(input);
  assert.ok(rowsOf(input) >= 30, `期望至少 30 行，实际 ${rowsOf(input)}`);
  assert.ok(heightOf(input) > 160, `宿主应随内层长高，实际 ${heightOf(input)}`);
});

test('宿主高度必须等于内层高度（否则内层偏移，正文跑到可视区之外）', () => {
  const api = createHarness();
  const samples = [
    '',
    '短',
    '一行稍微长一点的提示词内容，用来触发折算',
    Array.from({ length: 12 }, () => '内容').join('\n'),
    Array.from({ length: 60 }, () => '内容').join('\n'),
    '猫'.repeat(500)
  ];
  samples.forEach((value) => {
    const input = makeInput(value);
    api.autoGrowPrompt(input);
    const expected = Math.max(rowsOf(input) * ROW_PX + CHROME, 160);
    assert.equal(
      heightOf(input),
      expected,
      `内容长度 ${value.length}：宿主 ${heightOf(input)} 应等于内层 ${expected}`
    );
  });
});

test('量高度前必须先移除行内高度，否则会棘轮式越撑越高', () => {
  const api = createHarness();
  const long = makeInput(Array.from({ length: 40 }, () => '内容').join('\n'));
  api.autoGrowPrompt(long);
  const tall = heightOf(long);
  // 内容变短：若不先移除行内高度，scrollHeight 会返回上一次的宿主高度而无法回落
  long.value = '短';
  api.autoGrowPrompt(long);
  assert.ok(heightOf(long) < tall, `内容变短后应回落，实际 ${heightOf(long)}（原 ${tall}）`);
  assert.equal(heightOf(long), Math.max(api.MIN_ROWS * ROW_PX + CHROME, 160));
});

test('重复调用同一内容不会让框持续长高', () => {
  const api = createHarness();
  const input = makeInput('一行提示词');
  api.autoGrowPrompt(input);
  const first = heightOf(input);
  for (let index = 0; index < 20; index += 1) {
    api.autoGrowPrompt(input);
  }
  assert.equal(heightOf(input), first);
});

test('单行超长文本也会被折算成多行', () => {
  const api = createHarness();
  const short = makeInput('猫');
  api.autoGrowPrompt(short);
  const long = makeInput('猫'.repeat(400));
  api.autoGrowPrompt(long);
  assert.ok(heightOf(long) > heightOf(short), '长单行应比短单行更高');
});

test('全角字符比半角占宽更多，估算高度也更大', () => {
  const api = createHarness();
  const cjk = makeInput('猫'.repeat(200));
  api.autoGrowPrompt(cjk);
  const ascii = makeInput('a'.repeat(200));
  api.autoGrowPrompt(ascii);
  assert.ok(heightOf(cjk) > heightOf(ascii), '同样 200 字符，全角应估得更高');
});

test('面板隐藏（宽度为 0）时不改动尺寸', () => {
  const api = createHarness();
  const input = makeInput('任意内容', { clientWidth: 0 });
  api.autoGrowPrompt(input);
  assert.equal(input.style.height, undefined);
  assert.equal(rowsOf(input), Number.NaN);
});

test('窄面板比宽面板估得更多行', () => {
  const api = createHarness();
  const value = '猫'.repeat(300);
  const narrow = makeInput(value, { clientWidth: 180 });
  api.autoGrowPrompt(narrow);
  const wide = makeInput(value, { clientWidth: 600 });
  api.autoGrowPrompt(wide);
  assert.ok(rowsOf(narrow) > rowsOf(wide), '同样内容，窄面板应估得更多行');
});
