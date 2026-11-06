/**
 * Dev-only harness: mounts the Client half in jsdom with a fake directory so a
 * render/interaction regression is observable without the browser.
 *
 * Run: node scripts/harness.cjs
 * Not part of the shipped bundle (`files` excludes scripts/).
 */

const fs = require('node:fs');
const path = require('node:path');

const STORE_ROOT = '/Users/edy/deepseek-harness/node_modules/.pnpm';
const REACT = `${STORE_ROOT}/react@18.3.1/node_modules/react`;
const REACT_DOM = `${STORE_ROOT}/react-dom@18.3.1_react@18.3.1/node_modules/react-dom`;
const JSDOM_PATH = '/Users/edy/deepseek-harness/node_modules/jsdom';

const { JSDOM } = require(JSDOM_PATH);
const React = require(REACT);
const ReactDOMClient = require(REACT_DOM);
const ReactDOM = require(REACT_DOM);

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:3080/',
  pretendToBeVisual: true,
});

global.__MEC_TRACE = process.env.MEC_TRACE === '1';
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.MouseEvent = dom.window.MouseEvent;
global.Event = dom.window.Event;
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

/* ── fake directory ────────────────────────────────────────────────────── */

const EFFORTS = [
  { id: 'off', name: 'Off' },
  { id: 'low', name: 'Low' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max' },
];

let state = {
  current: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' },
  retainedEffort: undefined,
  routable: true,
  groups: [{
    id: 'deepseek-official',
    name: 'DeepSeek',
    models: [{
      id: 'deepseek-flash',
      name: 'DeepSeek V4.1 Flash',
      reasoning: { efforts: EFFORTS, defaultEffort: 'high' },
    }, {
      id: 'glm-5.3-flash',
      name: 'GLM 5.3 Flash',
    }],
  }],
  failures: [],
  status: 'ready',
  pending: null,
  error: null,
};

const listeners = new Set();
const store = {
  subscribe(fn) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  getSnapshot() {
    return state;
  },
};

function publish(patch) {
  // a real SnapshotStore hands out a fresh snapshot object; mutating in place
  // makes React bail out of the update, which hides ordering bugs
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

const selects = [];

const directory = {
  store,
  load: async () => state,
  select: async (selection) => {
    selects.push(selection);
    return { ok: true };
  },
};

/* ── fake cordis ctx ───────────────────────────────────────────────────── */

let registered;
let capturedEntry;
const cleanups = [];

dom.window.__ModuleLoader__ = {
  load(entry) {
    capturedEntry = entry;
  },
};

const clientSource = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
// The bundle body only touches window.__ModuleLoader__ at module scope.
new Function('window', 'document', clientSource)(dom.window, dom.window.document);

if (capturedEntry === undefined) throw new Error('client.js did not register a module entry');

const requireShim = (name) => {
  if (name === 'react') return React;
  if (name === 'react-dom') return ReactDOM;
  if (name === 'react-dom/client') return ReactDOMClient;
  throw new Error(`unexpected module request: ${name}`);
};

const plugin = capturedEntry.factory(requireShim);
console.log('module entry:', capturedEntry.id, '| plugin inject:', JSON.stringify(plugin.inject));

const dicts = {};
const ctx = {
  effect(fn) {
    const dispose = fn();
    cleanups.push(dispose);
    return dispose;
  },
  locale: {
    register(ns, d) {
      dicts[ns] = d;
      return () => { delete dicts[ns]; };
    },
    bind(ns) {
      return (key, params) => {
        const table = dicts[ns]?.zh ?? {};
        let text = table[key] ?? key;
        for (const [k, v] of Object.entries(params ?? {})) text = text.split(`{${k}}`).join(String(v));
        return text;
      };
    },
  },
  inject(deps, callback) {
    const scope = {
      modelDirectories: { directoryFor: () => directory },
      sessions: { subagentAddress: () => undefined },
      slots: {
        inject(name, effect) {
          console.log('slots.inject waiting on:', name);
          return effect();
        },
        register(options, Component) {
          console.log('register:', options.name, 'priority:', options.priority);
          registered = { options, Component };
          return () => {};
        },
      },
    };
    callback(scope);
    return () => {};
  },
};

plugin.apply(ctx);

if (registered === undefined) throw new Error('nothing registered onto the seat');

const injected = registered.options.inject('session-1');
const root = dom.window.document.getElementById('root');
const client = ReactDOMClient.createRoot(root);

const realError = console.error;
console.error = (...args) => { realError('[react]', ...args); };

function dump(label) {
  const trigger = dom.window.document.querySelector('.mec-trigger');
  const card = dom.window.document.querySelector('.mec-card');
  console.log(`\n=== ${label} ===`);
  console.log('trigger:', trigger === null ? 'MISSING' : trigger.textContent);
  console.log('card:', card === null ? 'absent' : card.textContent);
  console.log('card style:', card === null ? '-' : card.getAttribute('style'));
  console.log('dots:', dom.window.document.querySelectorAll('.mec-dot').length,
    '| range max:', dom.window.document.querySelector('.mec-range')?.getAttribute('max'));
  console.log('tier title:', dom.window.document.querySelector('.mec-tier-title')?.getAttribute('style'));
  console.log('splash nodes:', dom.window.document.querySelectorAll('.mec-splash').length);
  console.log('hero:', dom.window.document.querySelector('.mec-hero-img')?.getAttribute('src') ?? 'none');
  console.log('card class:', dom.window.document.querySelector('.mec-card')?.getAttribute('class'),
    '| sheen:', dom.window.document.querySelectorAll('.mec-sheen').length,
    '| badge:', dom.window.document.querySelector('.mec-badge')?.textContent);
  console.log('range style:', dom.window.document.querySelector('.mec-range')?.getAttribute('style'));
}

const wait = (ms = 30) => new Promise((resolve) => { setTimeout(resolve, ms); });

(async () => {
  client.render(React.createElement(registered.Component, {
    ...injected, locked: false, sessionId: 'session-1',
  }));
  await wait();
  dump('mounted');

  const trigger = dom.window.document.querySelector('.mec-trigger');
  trigger.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await wait();
  dump('after trigger click');

  const range = dom.window.document.querySelector('.mec-range');
  if (range !== null) {
    range.value = '3';
    range.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await wait();
    dom.window.dispatchEvent(new dom.window.Event('pointerup', { bubbles: true }));
    await wait();
    console.log('\nselect() calls:', JSON.stringify(selects));
    publish({ current: { ...state.current, reasoningEffort: 'max' } });
    await wait();
    dump('after commit max');
  }

  await wait(3300);
  dump('after splash resolves');

  const modelRow = dom.window.document.querySelector('.mec-model');
  if (modelRow !== null) {
    modelRow.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await wait();
    dump('model pane');
  }

  console.log('\nstyle tag present:', dom.window.document.querySelector('style[data-plugin-css]') !== null);
  process.exit(0);
})().catch((error) => {
  console.error('HARNESS FAILURE:', error);
  process.exit(1);
});
