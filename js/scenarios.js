import { serialize, deserialize } from './persistence.js';
import { clear } from './undo-stack.js';

const TAB_STORE_KEY = 'crane_scenarios';
const SAVED_STORE_KEY = 'crane_saved_scenes';
const ACTIVE_TAB_KEY = 'crane_active_tab';
const TAB_IDS = ['tabA', 'tabB', 'tabC'];

// Persisted across reloads. Without this the id resets to tabA while the tab
// store still holds the previous session's scenes, so the first switch after a
// reload would serialize the empty startup scene over whatever tabA had.
let activeTabId = (() => {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    return TAB_IDS.includes(saved) ? saved : 'tabA';
})();

function setActiveTabId(id) {
    activeTabId = id;
    localStorage.setItem(ACTIVE_TAB_KEY, id);
}

function loadTabStore() {
    try {
        return JSON.parse(localStorage.getItem(TAB_STORE_KEY)) || {};
    } catch {
        return {};
    }
}

function saveTabStore(store) {
    localStorage.setItem(TAB_STORE_KEY, JSON.stringify(store));
}

function loadSavedStore() {
    try {
        return JSON.parse(localStorage.getItem(SAVED_STORE_KEY)) || {};
    } catch {
        return {};
    }
}

function saveSavedStore(store) {
    localStorage.setItem(SAVED_STORE_KEY, JSON.stringify(store));
}

export function getActiveTabId() {
    return activeTabId;
}

export function switchTab(tabId) {
    if (!TAB_IDS.includes(tabId) || tabId === activeTabId) return;

    const store = loadTabStore();
    store[activeTabId] = serialize();
    saveTabStore(store);

    setActiveTabId(tabId);

    const tabData = store[tabId];
    deserialize(tabData && tabData.objects ? tabData : { objects: [] });
    clear();
}

// Load the persisted active tab's scene at startup. The caller is expected to
// call initSnapshot() afterwards, so this deliberately does not touch the undo stack.
export function restoreActiveTab() {
    const tabData = loadTabStore()[activeTabId];
    if (!tabData || !tabData.objects || tabData.objects.length === 0) return false;
    deserialize(tabData);
    return true;
}

// `data` lets callers pass an already-serialized payload (see startAutoSave)
// instead of paying for a second full serialize().
export function saveCurrentTab(data = null) {
    const store = loadTabStore();
    store[activeTabId] = data || serialize();
    saveTabStore(store);
}

export function listSavedScenes() {
    const store = loadSavedStore();
    return Object.values(store).sort((a, b) => {
        return new Date(b.savedAt) - new Date(a.savedAt);
    });
}

export function saveSceneAs(name) {
    if (!name) return false;
    try {
        const store = loadSavedStore();
        const data = serialize();
        store[name] = { ...data, _name: name };
        saveSavedStore(store);
        return true;
    } catch {
        return false;
    }
}

export function loadSceneByName(name) {
    const store = loadSavedStore();
    const sceneData = store[name];   // not `scene` — that name means the THREE scene everywhere else
    if (!sceneData) return false;
    deserialize(sceneData);
    clear();
    return true;
}

export function deleteSceneByName(name) {
    const store = loadSavedStore();
    delete store[name];
    saveSavedStore(store);
}

export function renameScene(oldName, newName) {
    if (!newName || oldName === newName) return;
    const store = loadSavedStore();
    if (!store[oldName]) return;
    store[newName] = { ...store[oldName], _name: newName };
    delete store[oldName];
    saveSavedStore(store);
}
