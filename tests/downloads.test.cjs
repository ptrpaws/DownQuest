const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function contentContext(overrides = {}) {
  const messages = [];
  const context = vm.createContext({
    console: { info() {}, warn() {}, error() {}, log() {} },
    URL, URLSearchParams, TextDecoder,
    document: { addEventListener() {} },
    chrome: { runtime: {
      onMessage: { addListener() {} },
      sendMessage(message, callback) { messages.push(message); callback({ ok: true, id: 1 }); },
    } },
    fetch() { throw new Error('CDN HEAD rejected'); },
    window: { open() { throw new Error('Unexpected tab'); } },
    ...overrides,
  });
  vm.runInContext(fs.readFileSync('DownQuest.js', 'utf8'), context);
  return { context, messages };
}

test('a signed download starts even when cross-origin fetch fails, without opening a tab', async () => {
  const { context, messages } = contentContext();
  const uri = 'https://securecdn-ber1-1.oculus.com/binaries/download/?id=1&signature=a%2Fb';
  await context.openURI(uri, { type: 'asset', filename: 'data.bundle', size: 42 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].url, uri);
  assert.equal(messages[0].filename, 'data.bundle');
});

function plain(value) { return JSON.parse(JSON.stringify(value)); }

function useToken(context) {
  vm.runInContext('accessToken = "token/+&"; applicationID = "app";', context);
}

test('collects selected APK, distinct OBB and assets once, retaining metadata', () => {
  const { context } = contentContext();
  useToken(context);
  const node = (id, file_name) => ({ node: { id, file_name, size: 123,
    uri: `https://securecdn-ber1-1.oculus.com/binaries/download/?id=${id}&signature=a%2Fb` } });
  const files = plain(context.collectMobileDownloads('apk', 'obb', { asset_files: { edges: [
    node('obb', 'main.42.game.obb'), node('asset', 'level.bundle'),
    node('asset', 'level.bundle'), null,
  ] } }));
  assert.equal(files.length, 3);
  assert.deepEqual(files.map(file => file.type), ['apk', 'obb', 'asset']);
  assert.equal(files[1].filename, 'main.42.game.obb');
  assert.equal(files[2].filename, 'level.bundle');
  assert.equal(files[2].size, 123);
  assert.ok(files[2].url.includes('signature=a%2Fb&access_token=token%2F%2B%26'));
});

test('authentication preserves exact existing signed URL and appends safely when needed', () => {
  const { context } = contentContext();
  useToken(context);
  const signed = 'https://securecdn.oculus.com/binaries/download/?access_token=original%2f&sig=%2f+%20';
  assert.equal(context.authenticatedAssetURI(signed), signed);
  const base = 'https://securecdn.oculus.com/binaries/download/';
  assert.equal(context.authenticatedAssetURI(base), `${base}?access_token=token%2F%2B%26`);
  assert.equal(context.authenticatedAssetURI(`${base}?id=1#fragment`), `${base}?id=1&access_token=token%2F%2B%26#fragment`);
});

test('metadata for a different binary cannot replace the selected APK or add unrelated assets', async () => {
  const { context, messages } = contentContext();
  useToken(context);
  const notices = [];
  context.showModal = (...args) => notices.push(args);
  context.sendGraphQLRequest = async () => ({ data: { app_binary_info: { info: [{ binary: {
    id: 'other', asset_files: { edges: [{ node: {
      uri: 'https://securecdn.oculus.com/binaries/download/?id=unrelated',
    } }] },
  } }] } } });
  await context.downloadMobileBuild('selected', 42, 'obb');
  assert.equal(messages.length, 2);
  assert.equal(new URL(messages[0].url).searchParams.get('id'), 'selected');
  assert.equal(new URL(messages[1].url).searchParams.get('id'), 'obb');
  assert.equal(notices.length, 1);
});

test('matching metadata includes assets; standalone DLC skips the Android lookup', async () => {
  const { context, messages } = contentContext();
  useToken(context);
  let lookups = 0;
  context.sendGraphQLRequest = async () => {
    lookups++;
    return { data: { app_binary_info: { info: [{ binary: {
      id: 'selected', asset_files: { edges: [{ node: {
        file_name: 'data.bundle', size: 42,
        uri: 'https://securecdn.oculus.com/binaries/download/?id=asset',
      } }] },
    } }] } } };
  };
  await context.downloadMobileBuild('selected', 42, null);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].filename, 'data.bundle');
  assert.equal(messages[1].type, 'asset');
  await context.downloadMobileBuild('dlc');
  assert.equal(lookups, 1);
  assert.equal(messages.length, 3);
  assert.equal(messages[2].type, 'asset');
});

test('failed metadata still queues APK/OBB; start failures do not stop later assets', async () => {
  const { context, messages } = contentContext();
  useToken(context);
  const notices = [];
  context.showModal = (...args) => notices.push(args);
  context.sendGraphQLRequest = async () => { throw new Error('expired'); };
  context.chrome.runtime.sendMessage = (message, callback) => {
    messages.push(message); callback({ ok: messages.length !== 1 });
  };
  await context.downloadMobileBuild('selected', 42, 'obb');
  assert.equal(messages.length, 2);
  assert.equal(notices.length, 1);
});

function workerContext() {
  const listeners = [], changes = [], calls = [], logs = [];
  const context = vm.createContext({
    URL,
    console: Object.fromEntries(['info', 'warn', 'error'].map(method => [method, (...args) => logs.push(args)])),
    chrome: {
      runtime: { id: 'extension', onMessage: { addListener(fn) { listeners.push(fn); } } },
      downloads: {
        download(options, callback) { calls.push(options); callback(7); },
        onChanged: { addListener(fn) { changes.push(fn); } },
        search(query, callback) { callback([]); },
      },
    },
  });
  vm.runInContext(fs.readFileSync('DownloadManager.js', 'utf8'), context);
  return { context, listener: listeners[0], changed: changes[0], calls, logs };
}
const sender = { id: 'extension', tab: { id: 1 }, url: 'https://www.meta.com/experiences/game/123/' };
const uri = 'https://securecdn-ber1-1.oculus.com/binaries/download/?id=1&access_token=secret%2f';

test('worker downloads exact signed URL, preserves filename, logs metadata without credentials', () => {
  const { listener, calls, logs } = workerContext();
  let response;
  assert.equal(listener({ action: 'downloadBinary', url: uri, filename: 'level.bundle', type: 'asset', size: 42 }, sender, value => { response = value; }), true);
  assert.deepEqual(plain(calls), [{ url: uri, filename: 'level.bundle', conflictAction: 'uniquify' }]);
  assert.equal(response.id, 7);
  assert.ok(JSON.stringify(logs).includes('level.bundle'));
  assert.ok(!JSON.stringify(logs).includes('secret'));
});

test('unknown APK/OBB filename is omitted so Chrome can use server filename', () => {
  const { listener, calls } = workerContext();
  listener({ action: 'downloadBinary', url: uri, type: 'obb' }, sender, () => {});
  assert.equal('filename' in calls[0], false);
});

test('download filenames cannot escape Downloads and keep normal basenames', () => {
  const { context } = workerContext();
  assert.equal(context.downloadFilename('../../main.42.game.obb'), 'main.42.game.obb');
  assert.equal(context.downloadFilename('dir\\level.bundle'), 'level.bundle');
  assert.equal(context.downloadFilename('bad:name?.bundle'), 'bad_name_.bundle');
  assert.equal(context.downloadFilename('..'), undefined);
});

test('worker rejects foreign origins and URLs before invoking Chrome downloads', () => {
  const { listener, calls } = workerContext();
  for (const url of ['https://oculus.com.evil.test/binaries/download/', 'http://securecdn.oculus.com/binaries/download/', 'https://securecdn.oculus.com/other', 'javascript:alert(1)']) {
    listener({ action: 'downloadBinary', url }, sender, response => assert.equal(response.ok, false));
  }
  listener({ action: 'downloadBinary', url: uri }, { ...sender, url: 'https://evil.test/' }, response => assert.equal(response.ok, false));
  assert.equal(calls.length, 0);
});

test('start failures redact raw errors and return a safe failure', () => {
  const { context, listener, logs } = workerContext();
  context.chrome.downloads.download = (options, callback) => {
    context.chrome.runtime.lastError = { message: `Failed ${uri}` };
    callback();
    delete context.chrome.runtime.lastError;
  };
  listener({ action: 'downloadBinary', url: uri }, sender, response => assert.equal(response.ok, false));
  assert.ok(!JSON.stringify(logs).includes('secret'));
});

test('interruption monitoring survives worker restart and ignores other downloads', () => {
  const { context, changed, logs } = workerContext();
  context.chrome.downloads.search = (query, callback) => callback([{
    id: query.id, byExtensionId: 'extension', filename: '/Downloads/level.bundle',
    mime: 'application/octet-stream', totalBytes: 42, state: 'interrupted',
    error: 'SERVER_FORBIDDEN', url: uri, finalUrl: uri,
  }]);
  changed({ id: 7, state: { current: 'interrupted' }, error: { current: 'SERVER_FORBIDDEN' } });
  assert.ok(JSON.stringify(logs).includes('SERVER_FORBIDDEN'));
  assert.ok(!JSON.stringify(logs).includes('secret'));
  const count = logs.length;
  context.chrome.downloads.search = (query, callback) => callback([{ byExtensionId: 'other' }]);
  changed({ id: 8, state: { current: 'complete' } });
  assert.equal(logs.length, count);
});

test('manifest enables downloads and background worker loads its handler', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(manifest.permissions.includes('downloads'));
  assert.ok(fs.readFileSync(manifest.background.service_worker, 'utf8').includes('importScripts("DownloadManager.js")'));
});

test('downloadBuild mobile fallback queues APK, OBB and assets through the real call path', async () => {
  const { context, messages } = contentContext();
  const fetches = [];
  let cookieTask;
  context.fetch = async (url, options) => {
    fetches.push({ url, options });
    assert.ok(url.includes('get_manifest=1'));
    return { status: 404 };
  };
  context.chrome.runtime.sendMessage = (message, callback) => {
    if (message === 'Me want cookie!') {
      cookieTask = callback('session-token');
    } else {
      messages.push(message);
      callback({ ok: true, id: messages.length });
    }
  };
  context.sendGraphQLRequest = async () => ({ data: { app_binary_info: { info: [{ binary: {
    id: 'selected', asset_files: { edges: [{ node: {
      id: 'asset', file_name: 'level.bundle', size: 42,
      uri: 'https://securecdn-ber1-1.oculus.com/binaries/download/?id=asset&sig=%2f',
    } }] },
  } }] } } });
  await context.downloadBuild('selected', 42, 'obb');
  await cookieTask;
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].options, undefined);
  assert.deepEqual(messages.map(file => file.type), ['apk', 'obb', 'asset']);
  assert.equal(messages[2].filename, 'level.bundle');
});

test('malformed asset metadata does not prevent the selected binary and OBB', async () => {
  const { context, messages } = contentContext();
  useToken(context);
  context.showModal = () => {};
  context.sendGraphQLRequest = async () => ({ data: { app_binary_info: { info: [{ binary: {
    id: 'selected', asset_files: { edges: {} },
  } }] } } });
  await context.downloadMobileBuild('selected', 42, 'obb');
  assert.equal(messages.length, 2);
  assert.equal(new URL(messages[0].url).searchParams.get('access_token'), 'token/+&');
});

test('asset lookup uses the established asset fields and encodes form authentication', () => {
  const { context } = contentContext();
  useToken(context);
  const body = new URLSearchParams(context.buildAppBinaryInfoRequestData('app', 42));
  assert.equal(body.get('access_token'), 'token/+&');
  assert.match(body.get('doc'), /on AssetFile \{ file_name uri size \}/);
  assert.equal(JSON.parse(body.get('variables')).params.app_params[0].version_code, '42');
});

test('app-scoped lookup accepts a unique matching version even if Meta returns another binary ID', async () => {
  const { context, messages } = contentContext();
  context.showModal = () => assert.fail('metadata should be available');
  context.sendGraphQLRequest = async () => ({ data: { app_binary_info: { info: [{ binary: {
    id: 'variant', version_code: 42, asset_files: { edges: [{ node: {
      file_name: 'level.bundle', uri: 'https://securecdn.oculus.com/binaries/download/?id=asset',
    } }] },
  } }] } } });
  await context.downloadMobileBuild('selected', 42, null);
  assert.equal(messages.length, 2);
  assert.equal(new URL(messages[0].url).searchParams.get('id'), 'selected');
  assert.equal(messages[1].filename, 'level.bundle');
});

test('ambiguous version matches do not download assets from an arbitrary variant', async () => {
  const { context, messages } = contentContext();
  let notice;
  context.showModal = (title, content) => { const header = {}; content(header); notice = header.textContent; };
  context.sendGraphQLRequest = async () => ({ data: { app_binary_info: { info: ['one', 'two'].map(id => ({ binary: {
    id, version_code: 42, asset_files: { edges: [{ node: {
      uri: `https://securecdn.oculus.com/binaries/download/?id=${id}`,
    } }] },
  } })) } } });
  await context.downloadMobileBuild('selected', 42, null);
  assert.equal(messages.length, 1);
  assert.match(notice, /AMBIGUOUS_BUILD/);
});

test('GraphQL errors produce a useful reason without logging raw response credentials', async () => {
  const logs = [];
  const { context, messages } = contentContext({ console: {
    info(...args) { logs.push(args); }, warn(...args) { logs.push(args); }, error() {},
  } });
  let notice;
  context.showModal = (title, content) => { const header = {}; content(header); notice = header.textContent; };
  context.sendGraphQLRequest = async () => ({ errors: [{ message: 'bad https://cdn/?access_token=secret' }] });
  await context.downloadMobileBuild('selected', 42, null);
  assert.equal(messages.length, 1);
  assert.match(notice, /GRAPHQL_ERROR/);
  assert.ok(JSON.stringify(logs).includes('Asset lookup summary'));
  assert.ok(!JSON.stringify(logs).includes('secret'));
});

function fakeDocument() {
  const createElement = (tag) => ({
    tag, children: [], handlers: {}, textContent: '',
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this[key] = value; },
    addEventListener(event, fn) { this.handlers[event] = fn; },
  });
  return { createElement, createTextNode: text => ({ textContent: text }), addEventListener() {} };
}
function descendants(element) {
  return [element, ...(element.children || []).flatMap(descendants)];
}
function largeBatch(context) {
  return plain(context.collectMobileDownloads('selected', null, { asset_files: { edges:
    Array.from({ length: 531 }, (_, i) => ({ node: {
      file_name: `textures${i}.bundle`, size: 123,
      uri: `https://securecdn.oculus.com/binaries/download/?id=asset${i}`,
    } })),
  } }));
}

test('531 matching assets are reviewed before any transfer instead of auto-downloading', async () => {
  const { context, messages } = contentContext();
  const plan = largeBatch(context);
  let reviewed;
  context.showMobileDownloadPicker = downloads => { reviewed = downloads; };
  context.sendGraphQLRequest = async () => ({ data: { app_binary_info: { info: [{ binary: {
    id: 'selected', asset_files: { edges: plan.slice(1).map(file => ({ node: {
      file_name: file.filename, size: file.size, uri: file.url,
    } })) },
  } }] } } });
  await context.downloadMobileBuild('selected', 42, null);
  assert.equal(messages.length, 0);
  assert.equal(reviewed.length, 532);
});

test('review defaults to all assets; only checked files queue, with no signed URLs in UI', async () => {
  const document = fakeDocument();
  const { context, messages } = contentContext({ document });
  let content;
  context.showModal = (title, render, closeable, onClose) => {
    content = document.createElement('div');
    render(document.createElement('div'), content, onClose);
  };
  context.showMobileDownloadPicker(largeBatch(context));
  assert.equal(messages.length, 0);
  const nodes = descendants(content);
  const checks = nodes.filter(node => node.type === 'checkbox');
  assert.equal(checks.length, 533); // select-all plus APK and 531 assets
  assert.ok(checks.every(node => node.checked));
  assert.ok(!nodes.map(node => node.textContent).join(' ').includes('access_token'));
  checks[0].checked = false;
  checks[0].handlers.change();
  checks[1].checked = true;
  checks[2].checked = true;
  checks[2].handlers.change();
  const start = nodes.find(node => node.tag === 'button' && node.textContent.startsWith('Download selected'));
  assert.equal(start.textContent, 'Download selected (2)');
  await start.handlers.click();
  assert.equal(messages.length, 2);
  assert.equal(messages[1].filename, 'textures0.bundle');
  await start.handlers.click();
  assert.equal(messages.length, 2); // no duplicate start
});

test('closing review cancels before start and stops further additions during queuing', async () => {
  const document = fakeDocument();
  const { context, messages } = contentContext({ document });
  let content, close;
  context.showModal = (title, render, closeable, onClose) => {
    content = document.createElement('div');
    close = onClose;
    render(document.createElement('div'), content, onClose);
  };
  context.showMobileDownloadPicker(largeBatch(context));
  close();
  let start = descendants(content).find(node => node.tag === 'button' && node.textContent.startsWith('Download selected'));
  await start.handlers.click();
  assert.equal(messages.length, 0);
  context.showMobileDownloadPicker(largeBatch(context));
  context.chrome.runtime.sendMessage = (message, callback) => {
    messages.push(message);
    close();
    callback({ ok: true, id: 1 });
  };
  start = descendants(content).find(node => node.tag === 'button' && node.textContent.startsWith('Download selected'));
  await start.handlers.click();
  assert.equal(messages.length, 1);
});

test('extension reload during cookie lookup shows a refresh notice instead of throwing', async () => {
  const { context } = contentContext();
  const notices = [];
  context.showModal = (title, render) => { const header = {}; render(header); notices.push(header.textContent); };
  context.chrome.runtime.sendMessage = () => { throw new Error('Extension context invalidated.'); };
  await assert.doesNotReject(context.downloadBuild('selected', 42, null));
  assert.equal(notices.length, 1);
  assert.match(notices[0], /refresh.*Meta/i);
});

test('extension reload stops a pending batch and reports it without repeated dialogs', async () => {
  const { context } = contentContext();
  const notices = [];
  let calls = 0;
  context.showModal = (title, render) => { const header = {}; render(header); notices.push(header.textContent); };
  context.chrome.runtime.sendMessage = () => { calls++; throw new Error('Extension context invalidated.'); };
  const result = await context.queueMobileDownloads(largeBatch(context));
  assert.equal(calls, 1);
  assert.equal(result.stopped, true);
  assert.equal(notices.length, 1);
});
