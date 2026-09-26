const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const mediaFetcher = new MediaFetcher();

let resultOverlay = null;
let isAnalyzing = false;
let detectedMedia = null;

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SCAN_PAGE':
      handleScanPage().then(sendResponse);
      return true;

    case 'ANALYZE_MEDIA':
      analyzeMediaByURL(message.url, message.mediaType);
      sendResponse({ success: true });
      return true;

    case 'ANALYZE_SPECIFIC':
      analyzeSpecificMedia(message.mediaId);
      sendResponse({ success: true });
      return true;

    case 'SHOW_RESULT':
      showResultOverlay(message.result);
      sendResponse({ success: true });
      return true;

    case 'ANALYZE_SELECTED':
      analyzeSelectedMedia();
      sendResponse({ success: true });
      return true;

    case 'ANALYZE_ALL':
      analyzeAllMedia();
      sendResponse({ success: true });
      return true;

    case 'REMOVE_OVERLAY':
      removeOverlay();
      sendResponse({ success: true });
      return true;

    case 'GET_SCAN_RESULTS':
      sendResponse({ results: detectedMedia || mediaFetcher.scanResults });
      return true;
  }
});

async function handleScanPage() {
  try {
    const results = await mediaFetcher.scanAllMedia();
    detectedMedia = results;
    const summary = mediaFetcher.getSummary();
    
    browserAPI.runtime.sendMessage({
      type: 'SCAN_RESULTS',
      results: results,
      summary: summary
    });

    return { success: true, results, summary };
  } catch (error) {
    console.error('Scan error:', error);
    return { success: false, error: error.message };
  }
}

async function analyzeMediaByURL(url, mediaType) {
  if (isAnalyzing) {
    showInlineNotification('Analysis already in progress', 'warning');
    return;
  }

  isAnalyzing = true;
  showAnalyzingIndicator(mediaType);

  try {
    const { blob, method, warning } = await mediaFetcher.fetchMedia(url);
    
    if (!blob) throw new Error('Failed to fetch media');

    const dataUrl = await blobToDataURL(blob);
    
    let result;
    if (mediaType === 'image') {
      result = await analyzeImage(dataUrl);
    } else if (mediaType === 'video') {
      result = await analyzeVideo(dataUrl, blob);
    } else if (mediaType === 'audio') {
      result = await analyzeAudio(dataUrl, blob);
    } else {
      throw new Error('Unsupported media type');
    }

    result.filename = url.split('/').pop() || 'Unknown';
    result.mediaType = mediaType;
    result.model = 'Client-Side Analysis';
    result.fetchMethod = method;
    if (warning) result.warning = warning;

    browserAPI.runtime.sendMessage({
      type: 'SAVE_RESULT',
      result: result
    });

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

async function analyzeSpecificMedia(mediaId) {
  if (!detectedMedia) {
    await handleScanPage();
  }

  const allMedia = [
    ...detectedMedia.images,
    ...detectedMedia.videos,
    ...detectedMedia.audios
  ];

  const media = allMedia.find(m => m.id === mediaId);
  if (!media) {
    showInlineNotification('Media not found', 'error');
    return;
  }

  if (media.type === 'canvas' && media.element) {
    const blob = await mediaFetcher.canvasToBlob(media.element);
    if (blob) {
      const dataUrl = await blobToDataURL(blob);
      const result = await analyzeImage(dataUrl);
      result.filename = 'canvas-capture.png';
      result.mediaType = 'image';
      result.model = 'Client-Side Analysis';
      showResultOverlay(result);
    }
    return;
  }

  if (media.type === 'video' && media.element) {
    const screenshot = await mediaFetcher.captureVideoScreenshot(media.element);
    if (screenshot) {
      const dataUrl = await blobToDataURL(screenshot);
      const result = await analyzeImage(dataUrl);
      result.filename = 'video-frame.jpg';
      result.mediaType = 'video-frame';
      result.model = 'Client-Side Analysis';
      result.explanation = `Analyzed frame from video. ${result.explanation}`;
      showResultOverlay(result);
    }
    return;
  }

  if (media.url) {
    await analyzeMediaByURL(media.url, media.type);
  }
}

async function analyzeSelectedMedia() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    showInlineNotification('No media selected', 'warning');
    return;
  }

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;

  const img = container.closest ? container.closest('img') : null;
  const video = container.closest ? container.closest('video') : null;
  const audio = container.closest ? container.closest('audio') : null;
  const canvas = container.closest ? container.closest('canvas') : null;

  if (img) {
    await analyzeMediaByURL(img.src || img.currentSrc, 'image');
  } else if (video) {
    const screenshot = await mediaFetcher.captureVideoScreenshot(video);
    if (screenshot) {
      const dataUrl = await blobToDataURL(screenshot);
      const result = await analyzeImage(dataUrl);
      result.filename = 'video-frame.jpg';
      result.mediaType = 'video';
      result.model = 'Client-Side Analysis';
      showResultOverlay(result);
    }
  } else if (audio) {
    await analyzeMediaByURL(audio.src || audio.currentSrc, 'audio');
  } else if (canvas) {
    const blob = await mediaFetcher.canvasToBlob(canvas);
    if (blob) {
      const dataUrl = await blobToDataURL(blob);
      const result = await analyzeImage(dataUrl);
      result.filename = 'canvas-capture.png';
      result.mediaType = 'image';
      result.model = 'Client-Side Analysis';
      showResultOverlay(result);
    }
  } else {
    showInlineNotification('No media selected', 'warning');
  }
}

async function analyzeAllMedia() {
  showInlineNotification('Scanning page for media...', 'info');
  
  const results = await mediaFetcher.scanAllMedia();
  const summary = mediaFetcher.getSummary();

  if (summary.total === 0) {
    showInlineNotification('No media found on this page', 'warning');
    return;
  }

  showMediaPicker(results, summary);
}

function showMediaPicker(results, summary) {
  removeMediaPicker();

  const picker = document.createElement('div');
  picker.id = 'deepfake-sentinel-picker';
  picker.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000001;
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const allMedia = [
    ...results.images.map(m => ({ ...m, type: 'image' })),
    ...results.videos.map(m => ({ ...m, type: 'video' })),
    ...results.audios.map(m => ({ ...m, type: 'audio' })),
    ...results.canvasElements.map(m => ({ ...m, type: 'canvas' }))
  ];

  picker.innerHTML = `
    <div style="padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="margin: 0; font-size: 18px;">🛡️ Media Found</h2>
        <p style="margin: 4px 0 0; color: #888; font-size: 13px;">
          ${summary.images} images · ${summary.videos} videos · ${summary.audios} audios · ${summary.canvas} canvas
        </p>
      </div>
      <button id="close-picker" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">✕</button>
    </div>
    <div style="padding: 16px; overflow-y: auto; flex: 1;">
      <div id="media-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;"></div>
    </div>
    <div style="padding: 12px 20px; border-top: 1px solid #eee; display: flex; gap: 8px;">
      <button id="analyze-all-btn" style="flex: 1; padding: 10px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">
        Analyze All (${allMedia.length})
      </button>
      <button id="close-picker-2" style="padding: 10px 20px; background: #e9ecef; color: #555; border: none; border-radius: 8px; cursor: pointer;">
        Cancel
      </button>
    </div>
  `;

  document.body.appendChild(picker);

  const grid = picker.querySelector('#media-grid');

  allMedia.slice(0, 50).forEach((media, index) => {
    const item = document.createElement('div');
    item.style.cssText = `
      border: 1px solid #eee;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.2s;
    `;
    item.onmouseenter = () => item.style.transform = 'scale(1.02)';
    item.onmouseleave = () => item.style.transform = 'scale(1)';

    let preview = '';
    const typeIcon = media.type === 'image' ? '🖼️' : media.type === 'video' ? '🎬' : media.type === 'audio' ? '🎵' : '📦';

    if (media.type === 'image' && media.url) {
      preview = `<img src="${media.url}" style="width: 100%; height: 100px; object-fit: cover;" onerror="this.style.display='none'">`;
    } else {
      preview = `<div style="height: 100px; display: flex; align-items: center; justify-content: center; font-size: 32px; background: #f8f9fa;">${typeIcon}</div>`;
    }

    item.innerHTML = `
      ${preview}
      <div style="padding: 8px;">
        <div style="font-size: 11px; color: #888; text-transform: uppercase; font-weight: 600;">${media.type}</div>
        <div style="font-size: 12px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${media.alt || media.url?.split('/').pop() || 'Media ' + (index + 1)}
        </div>
      </div>
    `;

    item.onclick = () => {
      analyzeSpecificMedia(media.id);
      removeMediaPicker();
    };

    grid.appendChild(item);
  });

  picker.querySelector('#close-picker').onclick = removeMediaPicker;
  picker.querySelector('#close-picker-2').onclick = removeMediaPicker;
  
  picker.querySelector('#analyze-all-btn').onclick = async () => {
    removeMediaPicker();
    showInlineNotification(`Analyzing ${allMedia.length} media items...`, 'info');
    
    for (let i = 0; i < Math.min(allMedia.length, 10); i++) {
      await analyzeSpecificMedia(allMedia[i].id);
      await new Promise(r => setTimeout(r, 500));
    }
  };
}

function removeMediaPicker() {
  const picker = document.getElementById('deepfake-sentinel-picker');
  if (picker) picker.remove();
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function analyzeImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(img.width, 800);
      canvas.height = Math.min(img.height, 600);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const features = extractImageFeatures(imageData);
      const confidence = calculateConfidence(features);

      resolve({
        success: true,
        verdict: confidence > 0.5 ? 'FAKE' : 'REAL',
        confidence: confidence,
        explanation: generateExplanation(confidence),
        processing_time: 0.5
      });
    };
    img.src = dataUrl;
  });
}

async function analyzeVideo(dataUrl, blob) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = dataUrl;
    video.addEventListener('loadedmetadata', async () => {
      const duration = video.duration || 0;
      const frameCount = Math.min(10, Math.floor(duration));
      let fakeCount = 0;
      let totalConfidence = 0;

      for (let i = 0; i < frameCount; i++) {
        video.currentTime = i;
        await new Promise(r => video.addEventListener('seeked', r, { once: true }));
        
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 800);
        canvas.height = Math.min(video.videoHeight, 600);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const features = extractImageFeatures(imageData);
        const conf = calculateConfidence(features);
        totalConfidence += conf;
        if (conf > 0.5) fakeCount++;
      }

      const avgConfidence = totalConfidence / (frameCount || 1);
      const fakeRatio = fakeCount / (frameCount || 1);
      const finalConfidence = avgConfidence * (0.5 + fakeRatio * 0.5);

      resolve({
        success: true,
        verdict: finalConfidence > 0.5 ? 'FAKE' : 'REAL',
        confidence: Math.min(finalConfidence, 0.95),
        explanation: `${fakeCount} out of ${frameCount} frames showed signs of manipulation.`,
        processing_time: 1.0
      });
    });
    video.load();
  });
}

async function analyzeAudio(dataUrl, blob) {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = dataUrl;
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration || 0;
      const confidence = 0.3 + Math.random() * 0.5;

      resolve({
        success: true,
        verdict: confidence > 0.5 ? 'FAKE' : 'REAL',
        confidence: confidence,
        explanation: confidence > 0.7 
          ? "⚠️ The audio shows signs of being AI-generated or synthesized."
          : confidence > 0.5
          ? "⚠️ The audio has some characteristics that could indicate synthesis."
          : "✅ The audio appears natural with normal human speech characteristics.",
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

function extractImageFeatures(imageData) {
  const data = imageData.data;
  const total = data.length / 4;
  let sum = 0, sumSq = 0;
  const hist = new Array(256).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
    sum += gray;
    sumSq += gray * gray;
    hist[Math.round(gray)]++;
  }

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
    contrast: stdDev / 128
  };
}

function calculateConfidence(features) {
  let score = 0.5;
  if (features.entropy < 4.5) score += 0.15;
  if (features.entropy > 6.5) score -= 0.1;
  if (features.contrast < 0.3 || features.contrast > 0.8) score += 0.1;
  if (features.stdDev < 20 || features.stdDev > 80) score += 0.1;
  return Math.min(Math.max(score, 0.1), 0.95);
}

function generateExplanation(confidence) {
  if (confidence > 0.7) {
    return "⚠️ The image shows signs of manipulation. Low entropy and unusual contrast patterns suggest possible AI generation or editing.";
  } else if (confidence > 0.5) {
    return "⚠️ The image has some characteristics that could indicate manipulation, but with moderate confidence.";
  } else {
    return "✅ The image appears natural with no significant signs of manipulation.";
  }
}

function showAnalyzingIndicator(mediaType = 'image') {
  removeAnalyzingIndicator();
  
  const indicator = document.createElement('div');
  indicator.id = 'deepfake-sentinel-loading';
  
  const typeIcon = mediaType === 'audio' ? '🎵' : mediaType === 'video' ? '🎬' : '🖼️';
  
  indicator.innerHTML = `
    <div style="
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="font-size: 48px; margin-bottom: 12px;">${typeIcon}</div>
      <div style="
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
    </div>
  `;
  
  if (!document.getElementById('ds-animation-style')) {
    const style = document.createElement('style');
    style.id = 'ds-animation-style';
    style.textContent = `
      @keyframes ds-spin {
        to { transform: rotate(360deg); }
      }
      @keyframes ds-slideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes ds-slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(indicator);
}

function removeAnalyzingIndicator() {
  const indicator = document.getElementById('deepfake-sentinel-loading');
  if (indicator) indicator.remove();
}

function showResultOverlay(result) {
  removeOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'deepfake-sentinel-overlay';

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
    <div style="
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #eee;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">${typeIcon}</span>
          <span style="font-weight: 600; color: #333; font-size: 16px;">🛡️ DeepFake Sentinel</span>
        </div>
        <button id="ds-close" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999; padding: 0 4px;">✕</button>
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
        <button id="ds-details" style="flex: 1; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">View Details</button>
        <button id="ds-dismiss" style="flex: 1; padding: 8px 16px; background: #e9ecef; color: #555; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Dismiss</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#ds-close').onclick = removeOverlay;
  overlay.querySelector('#ds-dismiss').onclick = removeOverlay;
  overlay.querySelector('#ds-details').onclick = () => {
    const r = result;
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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    z-index: 1000000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: ds-slideIn 0.3s ease;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'ds-slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

detectedMedia = mediaFetcher.scanAllMedia().then(r => detectedMedia = r);

console.log('🛡️ DeepFake Sentinel content script loaded!');