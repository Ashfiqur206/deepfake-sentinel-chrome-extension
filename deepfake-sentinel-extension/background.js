const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let extensionEnabled = true;

browserAPI.runtime.onInstalled.addListener(() => {
  createContextMenus();
  initializeStorage();
});

function createContextMenus() {
  browserAPI.contextMenus.create({
    id: 'deepfake-sentinel',
    title: '🛡️ DeepFake Sentinel',
    contexts: ['image', 'video', 'audio', 'link']
  });

  browserAPI.contextMenus.create({
    id: 'analyze-image',
    parentId: 'deepfake-sentinel',
    title: '🔍 Analyze Image',
    contexts: ['image']
  });

  browserAPI.contextMenus.create({
    id: 'analyze-video',
    parentId: 'deepfake-sentinel',
    title: '🔍 Analyze Video',
    contexts: ['video']
  });

  browserAPI.contextMenus.create({
    id: 'analyze-audio',
    parentId: 'deepfake-sentinel',
    title: '🔍 Analyze Audio',
    contexts: ['audio', 'link']
  });

  browserAPI.contextMenus.create({
    id: 'capture-visible',
    parentId: 'deepfake-sentinel',
    title: '📸 Capture & Analyze Visible Media',
    contexts: ['all']
  });

  browserAPI.contextMenus.create({
    id: 'scan-page',
    parentId: 'deepfake-sentinel',
    title: '📄 Scan Page for All Media',
    contexts: ['all']
  });

  browserAPI.contextMenus.create({
    id: 'open-standalone',
    parentId: 'deepfake-sentinel',
    title: '📱 Open Standalone Analyzer',
    contexts: ['all']
  });

  browserAPI.contextMenus.create({
    id: 'settings',
    parentId: 'deepfake-sentinel',
    title: '⚙️ Settings',
    contexts: ['all']
  });
}

function initializeStorage() {
  browserAPI.storage.sync.get(['enabled', 'historyLimit'], (result) => {
    browserAPI.storage.sync.set({
      enabled: result.enabled !== undefined ? result.enabled : true,
      historyLimit: result.historyLimit || 50,
      showNotifications: true,
      useClientSide: true,
      useBackgroundFetch: true,
      useScreenshot: true
    });
  });
}

browserAPI.contextMenus.onClicked.addListener((info, tab) => {
  if (!extensionEnabled) return;

  switch (info.menuItemId) {
    case 'analyze-image':
    case 'analyze-video':
    case 'analyze-audio':
      browserAPI.tabs.sendMessage(tab.id, {
        type: 'ANALYZE_MEDIA',
        url: info.srcUrl,
        mediaType: getMediaType(info)
      });
      break;
    case 'capture-visible':
      captureAndAnalyzeVisible(tab.id);
      break;
    case 'scan-page':
      browserAPI.tabs.sendMessage(tab.id, { type: 'ANALYZE_ALL' });
      break;
    case 'open-standalone':
      browserAPI.tabs.create({ url: browserAPI.runtime.getURL('standalone.html') });
      break;
    case 'settings':
      browserAPI.runtime.openOptionsPage();
      break;
  }
});

async function captureAndAnalyzeVisible(tabId) {
  try {
    const dataUrl = await browserAPI.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 95
    });

    if (!dataUrl) {
      console.error('Screenshot failed');
      return;
    }

    browserAPI.tabs.sendMessage(tabId, {
      type: 'ANALYZE_SCREENSHOT',
      dataUrl: dataUrl
    });
  } catch (error) {
    console.error('Capture error:', error);
  }
}

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

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'FETCH_MEDIA':
      fetchMediaInBackground(message.url, message.messageId);
      return true;

    case 'CAPTURE_SCREENSHOT':
      browserAPI.tabs.captureVisibleTab(null, {
        format: 'png',
        quality: 90
      }, (dataUrl) => {
        if (dataUrl) {
          sendResponse({ success: true, dataUrl });
        } else {
          sendResponse({ success: false, error: 'Screenshot failed' });
        }
      });
      return true;

    case 'GET_HISTORY':
      browserAPI.storage.sync.get(['history'], (data) => {
        sendResponse({ history: data.history || [] });
      });
      return true;

    case 'SAVE_RESULT':
      saveToHistory(message.result);
      sendResponse({ success: true });
      return true;

    case 'CLEAR_HISTORY':
      browserAPI.storage.sync.set({ history: [] }, () => {
        sendResponse({ success: true });
      });
      return true;

    case 'GET_SETTINGS':
      browserAPI.storage.sync.get(['enabled', 'showNotifications', 'historyLimit'], (data) => {
        sendResponse(data);
      });
      return true;

    case 'UPDATE_SETTINGS':
      browserAPI.storage.sync.set(message.settings, () => {
        if (message.settings.enabled !== undefined) {
          extensionEnabled = message.settings.enabled;
        }
        sendResponse({ success: true });
      });
      return true;

    case 'SCAN_RESULTS':
      browserAPI.storage.local.set({ lastScan: message.results });
      sendResponse({ success: true });
      return true;
  }
});

async function fetchMediaInBackground(url, messageId) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'User-Agent': navigator.userAgent
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataURL(blob);

    browserAPI.runtime.sendMessage({
      type: 'FETCH_MEDIA_RESULT',
      messageId: messageId,
      success: true,
      dataUrl: dataUrl
    });
  } catch (error) {
    console.error('Background fetch error:', error);
    browserAPI.runtime.sendMessage({
      type: 'FETCH_MEDIA_RESULT',
      messageId: messageId,
      success: false,
      error: error.message
    });
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function saveToHistory(result) {
  browserAPI.storage.sync.get(['history', 'historyLimit'], (data) => {
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
      fetchMethod: result.fetchMethod || 'unknown'
    };

    history.unshift(entry);
    if (history.length > limit) history = history.slice(0, limit);

    browserAPI.storage.sync.set({ history });
    browserAPI.storage.local.set({ lastResult: result });
  });
}

browserAPI.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.enabled) {
    extensionEnabled = changes.enabled.newValue;
  }
});

browserAPI.commands.onCommand.addListener((command) => {
  browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      if (command === 'analyze-selected') {
        browserAPI.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_SELECTED' });
      } else if (command === 'scan-page') {
        browserAPI.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_ALL' });
      }
    }
  });
});