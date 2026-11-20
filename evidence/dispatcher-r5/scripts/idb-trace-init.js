// Browser init script for the success-step diagnosis: logs, with page-relative times, every IndexedDB
// open/get/put/delete and every fetch of the draft door or of one application, so the order of the
// wizard store's own reads and writes can be read back from the console. Logs ids and two fields only.
(() => {
    const at = () => Math.round(performance.now());
    const log = (...parts) => console.log('[diag]', at(), ...parts);
    const summary = (value) => {
        if (typeof value !== 'string') { return value == null ? 'null' : typeof value; }
        try {
            const state = JSON.parse(value).state || {};
            return `plantId=${state.plantId} applicationId=${state.applicationId} epoch=${state.hydrationEpoch} step=${state.currentStep} sync=${state.syncStatus}`;
        } catch { return 'unparsable'; }
    };
    const caller = () => (new Error().stack || '').split('\n').slice(3, 9).map((line) => line.trim().replace(/^at /, '')).join(' <- ');
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function patchedOpen(name, version) {
        log('idb.open', name);
        const request = open.apply(this, arguments);
        request.addEventListener('upgradeneeded', () => log('idb.upgradeneeded', name));
        request.addEventListener('success', () => log('idb.open.ok', name, 'stores=' + Array.from(request.result.objectStoreNames).join(',')));
        request.addEventListener('error', () => log('idb.open.error', name, String(request.error)));
        return request;
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function patchedGet(key) {
        log('idb.get', String(key));
        const request = get.apply(this, arguments);
        request.addEventListener('success', () => log('idb.get.ok', String(key), summary(request.result)));
        request.addEventListener('error', () => log('idb.get.error', String(key), String(request.error)));
        return request;
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function patchedPut(value, key) {
        log('idb.put', String(key), summary(value));
        return put.apply(this, arguments);
    };
    const del = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function patchedDelete(key) {
        log('idb.delete', String(key), caller());
        return del.apply(this, arguments);
    };
    const fetchBefore = window.fetch;
    window.fetch = function patchedFetch(input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (/applications\/draft|applications\/[0-9a-f-]{36}(\?|$)/.test(url)) {
            log('fetch', (init && init.method) || 'GET', url.replace(/^https?:\/\/[^/]+/, ''), caller());
        }
        return fetchBefore.apply(this, arguments);
    };
    document.addEventListener('DOMContentLoaded', () => log('DOMContentLoaded'));
    window.addEventListener('load', () => log('load'));
})();
