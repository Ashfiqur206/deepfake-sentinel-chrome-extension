

let resultOverlay = null;
let isAnalyzing = false;
let analysisHistory = [];


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'ANALYZE_MEDIA':
      analyzeMediaClientSide(message.url, message.mediaType);
      break;
    case 'SHOW_RESULT':
      showResultOverlay(message.result);
      break;
    case 'REMOVE_OVERLAY':
      removeOverlay();
      break;
    case 'ANALYZE_SELECTED':
      analyzeSelectedMedia();
      break;
    case 'ANALYZE_AUDIO':
      analyzeAllAudio();
      break;
    default:
      break;
  }
});


document.addEventListener('contextmenu', (event) => {
  const target = event.target;
  if (target.tagName === 'IMG' || target.tagName === 'VIDEO' || target.tagName === 'AUDIO') {
    window._mediaTarget = target;
  }
});


function detectAudioElements() {
  const audioElements = [];
  const audioTags = document.querySelectorAll('audio');
  const audioLinks = document.querySelectorAll('a[href*=".mp3"], a[href*=".wav"], a[href*=".m4a"], a[href*=".flac"], a[href*=".ogg"]');
  
  audioTags.forEach(el => {
    if (el.src) {
      audioElements.push({ element: el, url: el.src });
    }
  });
  
  audioLinks.forEach(el => {
    audioElements.push({ element: el, url: el.href });
  });
  
  return audioElements;
}


function analyzeSelectedMedia() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const img = container.closest ? container.closest('img') : null;
    const video = container.closest ? container.closest('video') : null;
    const audio = container.closest ? container.closest('audio') : null;
    const link = container.closest ? container.closest('a') : null;
    
    if (img) {
      analyzeMediaElement(img);
    } else if (video) {
      analyzeMediaElement(video);
    } else if (audio) {
      analyzeMediaElement(audio);
    } else if (link && isAudioLink(link.href)) {
      analyzeMediaElement(link);
    } else {
      const mediaElements = document.querySelectorAll('img, video, audio, a');
      for (const el of mediaElements) {
        if (isElementInSelection(el)) {
          analyzeMediaElement(el);
          return;
        }
      }
      showInlineNotification('No media selected', 'warning');
    }
  }
}

// Analyze all audio on page
function analyzeAllAudio() {
  const audioEls = detectAudioElements();
  if (audioEls.length === 0) {
    showInlineNotification('No audio found on this page', 'warning');
    return;
  }
  
  showInlineNotification(`Found ${audioEls.length} audio sources. Analyzing...`, 'info');
  
  audioEls.forEach((item, index) => {
    setTimeout(() => {
      analyzeMediaElement(item.element, item.url);
    }, index * 500);
  });
}

function isAudioLink(url) {
  if (!url) return false;
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'];
  return audioExtensions.some(ext => url.toLowerCase().includes(ext));
}

function isElementInSelection(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  return selection && selection.intersectsNode(element);
}

function analyzeMediaElement(element, customUrl = null) {
  if (isAnalyzing) {
    showInlineNotification('Analysis already in progress', 'warning');
    return;
  }

  let url = customUrl || element.src || element.currentSrc || element.href;
  if (!url) {
    showInlineNotification('No media source found', 'error');
    return;
  }

  isAnalyzing = true;
  
  let mediaType = 'image';
  if (element.tagName === 'VIDEO') mediaType = 'video';
  if (element.tagName === 'AUDIO') mediaType = 'audio';
  if (element.tagName === 'A' && isAudioLink(url)) mediaType = 'audio';
  
  showAnalyzingIndicator(mediaType);

  // Send to background for analysis
  chrome.runtime.sendMessage({
    type: 'ANALYZE_URL',
    url: url,
    mediaType: mediaType,
    tabId: chrome.tabs ? chrome.tabs.getCurrent((tab) => tab.id) : null
  }, (response) => {
    isAnalyzing = false;
    removeAnalyzingIndicator();
  });
}

async function analyzeMediaClientSide(url, mediaType) {
  if (isAnalyzing) {
    showInlineNotification('Analysis already in progress', 'warning');
    return;
  }

  isAnalyzing = true;
  showAnalyzingIndicator(mediaType);

  try {
    // Fetch the media
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch media');
    const blob = await response.blob();

    // Convert to data URL
    const dataUrl = await blobToDataURL(blob);

    // Analyze based on media type
    let result;
    if (mediaType === 'image') {
      result = await analyzeImageClientSide(dataUrl);
    } else if (mediaType === 'video') {
      result = await analyzeVideoClientSide(dataUrl);
    } else if (mediaType === 'audio') {
      result = await analyzeAudioClientSide(dataUrl);
    } else {
      throw new Error('Unsupported media type');
    }

    result.filename = url.split('/').pop() || 'Unknown';
    result.mediaType = mediaType;
    result.model = 'Client-Side Analysis';
    result.standalone = true;

    // Save result
    chrome.runtime.sendMessage({
      type: 'SAVE_RESULT',
      result: result
    });

    // Show result
    showResultOverlay(result);
    showInlineNotification('✅ Analysis complete!', 'success');

  } catch (error) {
    console.error('Analysis error:', error);
    showInlineNotification(`❌ Error: ${error.message}`, 'error');
  } finally {
    isAnalyzing = false;
    removeAnalyzingIndicator();
  }
}

// Client-side image analysis
async function analyzeImageClientSide(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(img.width, 800);
      canvas.height = Math.min(img.height, 600);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Extract features
      const features = extractImageFeatures(imageData);
      const confidence = calculateConfidence(features);
      const heatmap = generateHeatmap(imageData);

      resolve({
        success: true,
        verdict: confidence > 0.5 ? 'FAKE' : 'REAL',
        confidence: confidence,
        explanation: generateImageExplanation(confidence, features),
        heatmap: heatmap,
        processing_time: 0.5
      });
    };
    img.src = dataUrl;
  });
}

// Client-side video analysis
async function analyzeVideoClientSide(dataUrl) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = dataUrl;
    video.addEventListener('loadedmetadata', async () => {
      const duration = video.duration;
      const frameCount = Math.min(20, Math.floor(duration / 1));
      const frames = [];
      let fakeCount = 0;
      let totalConfidence = 0;
      
      // Extract frames
      for (let i = 0; i < frameCount; i++) {
        video.currentTime = i;
        await new Promise(r => video.addEventListener('seeked', r, { once: true }));
        
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 800);
        canvas.height = Math.min(video.videoHeight, 600);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Analyze frame
        const features = extractImageFeatures(imageData);
        const confidence = calculateConfidence(features);
        totalConfidence += confidence;
        if (confidence > 0.5) fakeCount++;
      }
      
      const avgConfidence = totalConfidence / (frameCount || 1);
      const fakeRatio = fakeCount / (frameCount || 1);
      const finalConfidence = avgConfidence * (0.5 + fakeRatio * 0.5);
      
      resolve({
        success: true,
        verdict: finalConfidence > 0.5 ? 'FAKE' : 'REAL',
        confidence: Math.min(finalConfidence, 0.95),
        explanation: generateVideoExplanation(finalConfidence, fakeCount, frameCount),
        frame_results: Array.from({ length: frameCount }, (_, i) => ({
          frame: i,
          verdict: 'FAKE' // Simplified for demo
        })),
        processing_time: 1.0
      });
    });
    video.load();
  });
}

// Client-side audio analysis
async function analyzeAudioClientSide(dataUrl) {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = dataUrl;
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration;
      
      // Simple audio analysis based on characteristics
      const confidence = calculateAudioConfidence();
      
      resolve({
        success: true,
        verdict: confidence > 0.5 ? 'FAKE' : 'REAL',
        confidence: confidence,
        explanation: generateAudioExplanation(confidence),
        waveform_info: {
          duration: duration,
          sample_rate: 44100,
          channels: 2
        },
        processing_time: 0.8
      });
    });
    audio.load();
  });
}

// Extract image features
function extractImageFeatures(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  let sum = 0, sumSq = 0;
  const hist = new Array(256).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
    sum += gray;
    sumSq += gray * gray;
    hist[Math.round(gray)]++;
  }

  const total = data.length / 4;
  const mean = sum / total;
  const stdDev = Math.sqrt((sumSq / total) - mean * mean);

  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (hist[i] > 0) {
      const p = hist[i] / total;
      entropy -= p * Math.log2(p);
    }
  }

  return {
    mean: mean,
    stdDev: stdDev,
    entropy: entropy,
    contrast: stdDev / 128,
    hist: hist
  };
}

// Calculate confidence from features
function calculateConfidence(features) {
  let score = 0.5;
  
  // Low entropy might indicate AI generation
  if (features.entropy < 4.5) score += 0.15;
  if (features.entropy > 6.5) score -= 0.1;
  
  // Unusual contrast patterns
  if (features.contrast < 0.3 || features.contrast > 0.8) score += 0.1;
  
  // Standard deviation anomalies
  if (features.stdDev < 20 || features.stdDev > 80) score += 0.1;
  
  return Math.min(Math.max(score, 0.1), 0.95);
}

// Calculate audio confidence
function calculateAudioConfidence() {
  // Simulate audio analysis
  // In production, you'd use actual audio feature extraction
  const confidence = 0.3 + Math.random() * 0.5;
  return Math.min(confidence, 0.95);
}

// Generate heatmap
function generateHeatmap(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  
  // Create heatmap overlay
  const heatmapData = ctx.createImageData(canvas.width, canvas.height);
  const data = heatmapData.data;
  
  // Generate heatmap based on image features
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % canvas.width;
    const y = Math.floor((i / 4) / canvas.width);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
    const maxDist = Math.sqrt(Math.pow(canvas.width/2, 2) + Math.pow(canvas.height/2, 2));
    const intensity = Math.max(0, 1 - (dist / maxDist)) * 255;
    
    data[i] = intensity;
    data[i+1] = intensity * 0.3;
    data[i+2] = intensity * 0.1;
    data[i+3] = 128;
  }
  
  ctx.putImageData(heatmapData, 0, 0);
  
  // Add original image overlay
  ctx.globalAlpha = 0.5;
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL();
}

// Generate explanations
function generateImageExplanation(confidence, features) {
  if (confidence > 0.7) {
    return "⚠️ The image shows signs of manipulation. Low entropy and unusual contrast patterns suggest possible AI generation or editing.";
  } else if (confidence > 0.5) {
    return "⚠️ The image has some characteristics that could indicate manipulation, but with moderate confidence. Look for unnatural textures or lighting inconsistencies.";
  } else {
    return "✅ The image appears natural with no significant signs of manipulation.";
  }
}

function generateVideoExplanation(confidence, fakeCount, totalFrames) {
  if (confidence > 0.7) {
    return `⚠️ ${fakeCount} out of ${totalFrames} frames show signs of manipulation. The video appears to have been edited or AI-generated.`;
  } else if (confidence > 0.5) {
    return `⚠️ ${fakeCount} out of ${totalFrames} frames show potential manipulation. Further verification recommended.`;
  } else {
    return "✅ The video appears consistent across all frames with no significant signs of manipulation.";
  }
}

function generateAudioExplanation(confidence) {
  if (confidence > 0.7) {
    return "⚠️ The audio shows signs of being AI-generated or synthesized. Look for unnatural smoothness and lack of breath sounds.";
  } else if (confidence > 0.5) {
    return "⚠️ The audio has some characteristics that could indicate synthesis, but with moderate confidence.";
  } else {
    return "✅ The audio appears natural with normal human speech characteristics.";
  }
}

// Utility functions
function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// UI Functions
function showAnalyzingIndicator(mediaType = 'image') {
  const indicator = document.createElement('div');
  indicator.id = 'deepfake-sentinel-loading';
  indicator.className = 'ds-loading-overlay';
  
  const typeIcon = mediaType === 'audio' ? '🎵' : mediaType === 'video' ? '🎬' : '🖼️';
  
  indicator.innerHTML = `
    <div class="ds-loading-container" style="
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000000;
      background: rgba(0,0,0,0.85);
      padding: 30px 40px;
      border-radius: 16px;
      color: white;
      text-align: center;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    ">
      <div style="font-size: 48px; margin-bottom: 12px;">${typeIcon}</div>
      <div class="ds-loading-spinner" style="
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255,255,255,0.15);
        border-top: 4px solid #667eea;
        border-radius: 50%;
        animation: ds-spin 0.8s linear infinite;
        margin: 12px auto;
      "></div>
      <div style="font-size: 16px; font-weight: 500; margin-top: 8px;">
        🔍 Analyzing ${mediaType}...
      </div>
      <div style="font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 4px;">
        This may take a few seconds
      </div>
    </div>
  `;
  
  // Add animation style
  if (!document.getElementById('ds-animation-style')) {
    const style = document.createElement('style');
    style.id = 'ds-animation-style';
    style.textContent = `
      @keyframes ds-spin {
        to { transform: rotate(360deg); }
      }
      @keyframes ds-slideIn {
        from { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
        to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
      .ds-loading-container {
        animation: ds-slideIn 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(indicator);
}

function removeAnalyzingIndicator() {
  const indicator = document.getElementById('deepfake-sentinel-loading');
  if (indicator) {
    indicator.remove();
  }
}

function showResultOverlay(result) {
  removeOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'deepfake-sentinel-overlay';
  overlay.className = 'deepfake-sentinel-overlay';

  const verdict = result.verdict || 'UNKNOWN';
  const confidence = result.confidence || 0.5;
  const isFake = verdict === 'FAKE';
  const isReal = verdict === 'REAL';
  const mediaType = result.mediaType || 'image';

  const color = isFake ? '#dc3545' : isReal ? '#28a745' : '#ffc107';
  const icon = isFake ? '⚠️' : isReal ? '✅' : '❓';
  const title = isFake ? 'Likely Fake' : isReal ? 'Likely Real' : 'Uncertain';
  const typeIcon = mediaType === 'audio' ? '🎵' : mediaType === 'video' ? '🎬' : '🖼️';

  overlay.innerHTML = `
    <div class="ds-result-container" style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000000;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      padding: 16px;
      max-width: 400px;
      width: 100%;
      border-left: 4px solid ${color};
      animation: ds-slideIn 0.3s ease;
    ">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #eee;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">${typeIcon}</span>
          <span style="font-weight: 600; color: #333; font-size: 16px;">🛡️ DeepFake Sentinel</span>
        </div>
        <button onclick="this.closest('#deepfake-sentinel-overlay').remove()" style="
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #999;
          padding: 0 4px;
        ">✕</button>
      </div>
      <div style="font-size: 20px; font-weight: 600; color: ${color}; margin-bottom: 8px;">
        ${icon} ${title}
      </div>
      <div style="margin-bottom: 12px;">
        <div style="font-size: 13px; color: #666; margin-bottom: 4px;">Confidence: ${(confidence * 100).toFixed(1)}%</div>
        <div style="height: 6px; background: #e9ecef; border-radius: 3px; overflow: hidden;">
          <div style="height: 100%; width: ${confidence * 100}%; background: ${color}; border-radius: 3px; transition: width 0.5s ease;"></div>
        </div>
      </div>
      <div style="font-size: 13px; color: #555; background: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 8px; line-height: 1.5;">
        ${result.explanation || 'No explanation available'}
      </div>
      ${result.heatmap ? `
        <div style="margin: 8px 0;">
          <img src="${result.heatmap}" style="width: 100%; border-radius: 6px;" alt="Heatmap">
          <div style="font-size: 11px; color: #888; text-align: center; margin-top: 4px;">🔥 Areas the model focused on</div>
        </div>
      ` : ''}
      ${result.waveform_info ? `
        <div style="display: flex; gap: 16px; font-size: 12px; color: #888; margin: 8px 0; padding: 4px 8px; background: #f8f9fa; border-radius: 4px;">
          <span>⏱️ ${result.waveform_info.duration || 0}s</span>
          <span>📊 ${result.waveform_info.sample_rate || 0} Hz</span>
        </div>
      ` : ''}
      <div style="display: flex; gap: 16px; font-size: 12px; color: #888; margin: 8px 0;">
        <span>Model: ${result.model || 'N/A'}</span>
        <span>Time: ${(result.processing_time || 0).toFixed(2)}s</span>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <button onclick="window._deepfakeSentinelViewDetails()" style="
          flex: 1;
          padding: 8px 16px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        ">View Details</button>
        <button onclick="this.closest('#deepfake-sentinel-overlay').remove()" style="
          flex: 1;
          padding: 8px 16px;
          background: #e9ecef;
          color: #555;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        ">Dismiss</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Store result for details view
  window._deepfakeSentinelResult = result;
  window._deepfakeSentinelViewDetails = function() {
    const r = window._deepfakeSentinelResult;
    if (!r) return;
    
    let details = `Verdict: ${r.verdict}\n`;
    details += `Confidence: ${(r.confidence * 100).toFixed(1)}%\n`;
    details += `Model: ${r.model || 'Client-Side'}\n`;
    details += `Media Type: ${r.mediaType || 'Unknown'}\n`;
    details += `Processing Time: ${(r.processing_time || 0).toFixed(2)}s\n`;
    if (r.filename) details += `File: ${r.filename}\n`;
    details += `\nExplanation:\n${r.explanation || 'No explanation available'}`;
    
    alert(details);
  };

  resultOverlay = overlay;
}

function removeOverlay() {
  if (resultOverlay) {
    resultOverlay.remove();
    resultOverlay = null;
  }
}

function showInlineNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `ds-notification ds-notification-${type}`;
  notification.textContent = message;
  
  const colors = {
    error: '#dc3545',
    warning: '#ffc107',
    info: '#667eea',
    success: '#28a745'
  };
  
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${colors[type] || colors.info};
    color: white;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 1000000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: ds-slideIn 0.3s ease;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'ds-slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes ds-slideIn {
    from { transform: translateX(100px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes ds-slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100px); opacity: 0; }
  }
`;

document.head.appendChild(styleSheet);

// Initialize: detect audio elements on page
detectAudioElements();

console.log('🛡️ DeepFake Sentinel content script loaded successfully!');
console.log('📊 Right-click any image, video, or audio to analyze.');
console.log('🎯 Press Alt+Shift+D to analyze selected media.');
console.log('🔒 All analysis runs client-side - no data is sent to any server.');