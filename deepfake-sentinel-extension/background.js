
let extensionEnabled = true;
let analysisHistory = [];

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
  initializeStorage();
});

function createContextMenus() {
  chrome.contextMenus.create({
    id: 'deepfake-sentinel',
    title: '🛡️ DeepFake Sentinel',
    contexts: ['image', 'video', 'audio', 'link']
  });

  chrome.contextMenus.create({
    id: 'analyze-image',
    parentId: 'deepfake-sentinel',
    title: '🔍 Analyze Image',
    contexts: ['image']
  });

  chrome.contextMenus.create({
    id: 'analyze-video',
    parentId: 'deepfake-sentinel',
    title: '🔍 Analyze Video',
    contexts: ['video']
  });

  chrome.contextMenus.create({
    id: 'analyze-audio',
    parentId: 'deepfake-sentinel',
    title: '🔍 Analyze Audio',
    contexts: ['audio', 'link']
  });

  chrome.contextMenus.create({
    id: 'open-standalone',
    parentId: 'deepfake-sentinel',
    title: '📱 Open Standalone Analyzer',
    contexts: ['all']
  });

  chrome.contextMenus.create({
    id: 'settings',
    parentId: 'deepfake-sentinel',
    title: '⚙️ Settings',
    contexts: ['all']
  });
}

function initializeStorage() {
  chrome.storage.sync.get(['enabled', 'historyLimit', 'standaloneMode'], (result) => {
    chrome.storage.sync.set({
      enabled: result.enabled !== undefined ? result.enabled : true,
      historyLimit: result.historyLimit || 50,
      standaloneMode: result.standaloneMode !== undefined ? result.standaloneMode : true,
      autoAnalyze: false,
      showNotifications: true,
      useClientSide: true
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!extensionEnabled) return;

  switch (info.menuItemId) {
    case 'analyze-image':
    case 'analyze-video':
    case 'analyze-audio':
      // Use client-side analysis
      chrome.tabs.sendMessage(tab.id, {
        type: 'ANALYZE_MEDIA',
        url: info.srcUrl,
        mediaType: getMediaType(info),
        clientSide: true
      });
      break;
    case 'open-standalone':
      chrome.tabs.create({ url: chrome.runtime.getURL('standalone.html') });
      break;
    case 'settings':
      chrome.runtime.openOptionsPage();
      break;
    default:
      break;
  }
});

function getMediaType(info) {
  if (info.mediaType === 'image') return 'image';
  if (info.mediaType === 'video') return 'video';
  if (info.mediaType === 'audio') return 'audio';

  if (info.linkUrl) {
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'];
    if (audioExtensions.some(ext => info.linkUrl.toLowerCase().includes(ext))) {
      return 'audio';
    }
  }

  return null;
}

// Handle messages from content and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_HISTORY':
      chrome.storage.sync.get(['history'], (data) => {
        sendResponse({ history: data.history || [] });
      });
      return true;

    case 'SAVE_RESULT':
      saveToHistory(message.result);
      sendResponse({ success: true });
      return true;

    case 'CLEAR_HISTORY':
      chrome.storage.sync.set({ history: [] }, () => {
        sendResponse({ success: true });
      });
      return true;

    case 'GET_SETTINGS':
      chrome.storage.sync.get([
        'enabled', 'standaloneMode', 'autoAnalyze',
        'showNotifications', 'historyLimit', 'useClientSide'
      ], (data) => {
        sendResponse(data);
      });
      return true;

    case 'UPDATE_SETTINGS':
      chrome.storage.sync.set(message.settings, () => {
        if (message.settings.enabled !== undefined) {
          extensionEnabled = message.settings.enabled;
        }
        sendResponse({ success: true });
      });
      return true;

    case 'SHOW_NOTIFICATION':
      showNotification(message.message, message.type);
      sendResponse({ success: true });
      return true;

    case 'GET_STANDALONE_URL':
      sendResponse({ url: chrome.runtime.getURL('standalone.html') });
      return true;
  }
});

function saveToHistory(result) {
  chrome.storage.sync.get(['history', 'historyLimit'], (data) => {
    let history = data.history || [];
    const limit = data.historyLimit || 50;

    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      verdict: result.verdict,
      confidence: result.confidence,
      mediaType: result.mediaType || 'unknown',
      filename: result.filename || 'Unknown',
      model: 'Client-Side Analysis',
      standalone: true
    };

    history.unshift(entry);
    if (history.length > limit) {
      history = history.slice(0, limit);
    }

    chrome.storage.sync.set({ history });

    // Also save to local for quick access
    chrome.storage.local.set({ lastResult: result });
  });
}

function showNotification(message, type = 'info') {
  chrome.storage.sync.get(['showNotifications'], (data) => {
    if (data.showNotifications !== false) {
      const icon = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '🛡️ DeepFake Sentinel',
        message: `${icon} ${message}`,
        priority: 1
      });
    }
  });
}

// Update extension state when settings change
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.enabled) {
    extensionEnabled = changes.enabled.newValue;
  }
});