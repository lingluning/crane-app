import { serialize, deserialize } from './persistence.js';
import { clear } from './undo-stack.js';

const TAB_STORE_KEY = 'crane_scenarios';
const SAVED_STORE_KEY = 'crane_saved_scenes';
const TAB_IDS = ['tabA', 'tabB', 'tabC'];

let activeTabId = 'tabA';

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
    if (!TAB_IDS.includes(tabId)) return;

    const store = loadTabStore();
    store[activeTabId] = serialize();
    saveTabStore(store);

    activeTabId = tabId;

    const tabData = store[tabId];
    deserialize(tabData && tabData.objects ? tabData : { objects: [] });
    clear();
}

export function saveCurrentTab() {
    const store = loadTabStore();
    store[activeTabId] = serialize();
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
    const scene = store[name];
    if (!scene) return false;
    deserialize(scene);
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
