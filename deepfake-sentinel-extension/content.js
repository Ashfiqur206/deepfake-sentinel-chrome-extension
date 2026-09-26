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
      const imageData = ctx.getImageData(0, 0, canvas