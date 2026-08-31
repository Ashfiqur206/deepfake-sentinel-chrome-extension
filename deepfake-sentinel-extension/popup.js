// popup.js - Standalone version

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadHistory();
  await loadLastResult();
  setupEventListeners();
});

async function loadSettings() {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
    if (response) {
      const statusBadge = document.getElementById('status-badge');
      if (response.enabled) {
        statusBadge.textContent = 'Active (Standalone)';
        statusBadge.className = 'badge badge-success';
      } else {
        statusBadge.textContent = 'Disabled';
        statusBadge.className = 'badge badge-danger';
      }
    }
  });
}

async function loadHistory() {
  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (response) => {
    const historyList = document.getElementById('history-list');
    const history = response.history || [];

    if (history.length === 0) {
      historyList.innerHTML = '<p class="empty-message">No history yet</p>';
      return;
    }

    historyList.innerHTML = '';
    history.slice(0, 10).forEach((item) => {
      const entry = document.createElement('div');
      entry.className = 'history-item';
      const isFake = item.verdict === 'FAKE';
      const color = isFake ? '#dc3545' : '#28a745';
      const icon = isFake ? '⚠️' : '✅';
      const typeEmoji = item.mediaType === 'audio' ? '🎵' : item.mediaType === 'video' ? '🎬' : '🖼️';
      const date = new Date(item.timestamp);

      entry.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: ${color}; font-weight: 600;">${icon} ${item.verdict}</span>
          <span style="font-size: 12px; color: #888;">${typeEmoji}</span>
        </div>
        <div style="flex: 1; margin: 0 8px; overflow: hidden;">
          <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px;">
            ${item.filename || 'Unknown'}
          </div>
          <div style="font-size: 10px; color: #888;">${date.toLocaleTimeString()}</div>
        </div>
        <div style="font-weight: 600; color: #555; font-size: 12px;">
          ${(item.confidence * 100).toFixed(0)}%
        </div>
      `;
      historyList.appendChild(entry);
    });
  });
}

async function loadLastResult() {
  chrome.storage.local.get(['lastResult'], (data) => {
    if (data.lastResult) {
      displayResult(data.lastResult);
    }
  });
}

function displayResult(result) {
  const container = document.getElementById('result-container');
  container.style.display = 'block';

  const verdictDisplay = document.getElementById('verdict-display');
  const confidenceFill = document.getElementById('confidence-fill');
  const confidenceText = document.getElementById('confidence-text');
  const explanationText = document.getElementById('explanation-text');
  const detailsText = document.getElementById('details-text');

  const isFake = result.verdict === 'FAKE';
  const color = isFake ? '#dc3545' : '#28a745';
  const icon = isFake ? '⚠️' : '✅';
  const typeEmoji = result.mediaType === 'audio' ? '🎵' : result.mediaType === 'video' ? '🎬' : '🖼️';

  verdictDisplay.textContent = `${typeEmoji} ${icon} ${isFake ? 'Fake' : 'Real'}`;
  verdictDisplay.style.color = color;

  const confidence = result.confidence || 0.5;
  confidenceFill.style.width = `${confidence * 100}%`;
  confidenceFill.style.background = color;
  confidenceText.textContent = `${(confidence * 100).toFixed(1)}%`;

  explanationText.textContent = result.explanation || 'No explanation available';
  detailsText.textContent = `Model: ${result.model || 'Client-Side'} | Time: ${(result.processing_time || 0).toFixed(2)}s`;
}

function setupEventListeners() {
  document.getElementById('analyze-page-btn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_SELECTED' });
        window.close();
      }
    });
  });

  document.getElementById('open-standalone-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('standalone.html') });
    window.close();
  });

  document.getElementById('clear-history-btn').addEventListener('click', () => {
    if (confirm('Clear all history?')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
        loadHistory();
      });
    }
  });

  document.getElementById('settings-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SHOW_RESULT') {
      displayResult(message.result);
      loadHistory();
    }
  });
}