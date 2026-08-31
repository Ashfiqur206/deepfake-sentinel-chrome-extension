

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

function loadSettings() {
  chrome.storage.sync.get([
    'enabled',
    'apiUrl',
    'apiKey',
    'standaloneMode',
    'autoAnalyze',
    'showNotifications',
    'confidenceThreshold',
    'historyLimit',
    'maxFileSize',
    'maxAudioDuration',
    'collectAnalytics'
  ], (data) => {
    document.getElementById('extension-enabled').checked = data.enabled !== false;
    document.getElementById('standalone-mode').checked = data.standaloneMode !== false;
    document.getElementById('api-url').value = data.apiUrl || 'http://localhost:8000/api';
    document.getElementById('api-key').value = data.apiKey || '';
    document.getElementById('auto-analyze').checked = data.autoAnalyze || false;
    document.getElementById('show-notifications').checked = data.showNotifications !== false;
    document.getElementById('confidence-threshold').value = data.confidenceThreshold || 50;
    document.getElementById('threshold-value').textContent = `${data.confidenceThreshold || 50}%`;
    document.getElementById('history-limit').value = data.historyLimit || 50;
    document.getElementById('max-file-size').value = data.maxFileSize || 100;
    document.getElementById('max-audio-duration').value = data.maxAudioDuration || 300;
    document.getElementById('collect-analytics').checked = data.collectAnalytics || false;

    // Update UI based on standalone mode
    toggleApiFields(data.standaloneMode !== false);
  });
}

function toggleApiFields(standaloneMode) {
  const apiFields = document.querySelectorAll('#api-url, #api-key, #test-connection-btn');
  apiFields.forEach(field => {
    field.disabled = standaloneMode;
    field.style.opacity = standaloneMode ? '0.5' : '1';
  });
  if (standaloneMode) {
    document.querySelector('#api-url').placeholder = 'Disabled in standalone mode';
  }
}

function setupEventListeners() {
  // Confidence threshold slider
  document.getElementById('confidence-threshold').addEventListener('input', (e) => {
    document.getElementById('threshold-value').textContent = `${e.target.value}%`;
  });

  // Standalone mode toggle
  document.getElementById('standalone-mode').addEventListener('change', (e) => {
    toggleApiFields(e.target.checked);
  });

  // Save settings
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);

  // Reset settings
  document.getElementById('reset-settings-btn').addEventListener('click', resetSettings);

  // Test connection
  document.getElementById('test-connection-btn').addEventListener('click', testConnection);

  // Clear data
  document.getElementById('clear-data-btn').addEventListener('click', clearData);
}

function saveSettings() {
  const settings = {
    enabled: document.getElementById('extension-enabled').checked,
    standaloneMode: document.getElementById('standalone-mode').checked,
    apiUrl: document.getElementById('api-url').value,
    apiKey: document.getElementById('api-key').value,
    autoAnalyze: document.getElementById('auto-analyze').checked,
    showNotifications: document.getElementById('show-notifications').checked,
    confidenceThreshold: parseInt(document.getElementById('confidence-threshold').value),
    historyLimit: parseInt(document.getElementById('history-limit').value),
    maxFileSize: parseInt(document.getElementById('max-file-size').value),
    maxAudioDuration: parseInt(document.getElementById('max-audio-duration').value),
    collectAnalytics: document.getElementById('collect-analytics').checked
  };

  chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: settings
  }, (response) => {
    if (response && response.success) {
      showStatus('✅ Settings saved successfully!', 'success');
    } else {
      showStatus('❌ Failed to save settings', 'error');
    }
  });
}

function resetSettings() {
  if (!confirm('Reset all settings to defaults?')) return;

  const defaultSettings = {
    enabled: true,
    standaloneMode: true,
    apiUrl: 'http://localhost:8000/api',
    apiKey: '',
    autoAnalyze: false,
    showNotifications: true,
    confidenceThreshold: 50,
    historyLimit: 50,
    maxFileSize: 100,
    maxAudioDuration: 300,
    collectAnalytics: false
  };

  chrome.storage.sync.set(defaultSettings, () => {
    loadSettings();
    showStatus('✅ Settings reset to defaults', 'success');
  });
}

async function testConnection() {
  const statusEl = document.getElementById('connection-status');
  const apiUrl = document.getElementById('api-url').value;
  const apiKey = document.getElementById('api-key').value;

  statusEl.textContent = 'Testing...';
  statusEl.style.color = '#666';

  try {
    const headers = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      headers: headers
    });

    if (response.ok) {
      statusEl.textContent = '✅ Connected successfully!';
      statusEl.style.color = '#28a745';
    } else {
      statusEl.textContent = `❌ Connection failed: ${response.status}`;
      statusEl.style.color = '#dc3545';
    }
  } catch (error) {
    statusEl.textContent = `❌ Connection failed: ${error.message}`;
    statusEl.style.color = '#dc3545';
  }
}

function clearData() {
  if (!confirm('Clear all stored data (history, settings, etc.)?')) return;

  chrome.storage.sync.clear(() => {
    chrome.storage.local.clear(() => {
      loadSettings();
      document.getElementById('clear-status').textContent = '✅ Data cleared successfully';
      document.getElementById('clear-status').style.color = '#28a745';
      setTimeout(() => {
        document.getElementById('clear-status').textContent = '';
      }, 3000);
    });
  });
}

function showStatus(message, type) {
  const statusEl = document.getElementById('clear-status');
  statusEl.textContent = message;
  statusEl.style.color = type === 'success' ? '#28a745' : '#dc3545';
  setTimeout(() => {
    statusEl.textContent = '';
  }, 3000);
}