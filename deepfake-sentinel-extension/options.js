document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

function loadSettings() {
  chrome.storage.sync.get([
    'enabled',
    'showNotifications',
    'historyLimit',
    'maxFileSize'
  ], (data) => {
    document.getElementById('extension-enabled').checked = data.enabled !== false;
    document.getElementById('show-notifications').checked = data.showNotifications !== false;
    document.getElementById('history-limit').value = data.historyLimit || 50;
    document.getElementById('max-file-size').value = data.maxFileSize || 100;
  });
}

function setupEventListeners() {
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('reset-settings-btn').addEventListener('click', resetSettings);
  document.getElementById('clear-data-btn').addEventListener('click', clearData);
}

function saveSettings() {
  const settings = {
    enabled: document.getElementById('extension-enabled').checked,
    showNotifications: document.getElementById('show-notifications').checked,
    historyLimit: parseInt(document.getElementById('history-limit').value),
    maxFileSize: parseInt(document.getElementById('max-file-size').value)
  };

  chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: settings
  }, (response) => {
    if (response && response.success) {
      showStatus('✅ Settings saved!', 'success');
    }
  });
}

function resetSettings() {
  if (!confirm('Reset all settings to defaults?')) return;

  const defaultSettings = {
    enabled: true,
    showNotifications: true,
    historyLimit: 50,
    maxFileSize: 100
  };

  chrome.storage.sync.set(defaultSettings, () => {
    loadSettings();
    showStatus('✅ Settings reset', 'success');
  });
}

function clearData() {
  if (!confirm('Clear all stored data?')) return;

  chrome.storage.sync.clear(() => {
    chrome.storage.local.clear(() => {
      loadSettings();
      showStatus('✅ Data cleared', 'success');
    });
  });
}

function showStatus(message, type) {
  const statusEl = document.getElementById('clear-status');
  statusEl.textContent = message;
  statusEl.style.color = '#28a745';
  setTimeout(() => statusEl.textContent = '', 3000);
}