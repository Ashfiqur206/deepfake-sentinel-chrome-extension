class MediaFetcher {
  constructor() {
    this.mediaCache = new Map();
    this.observers = [];
    this.isScanning = false;
    this.capturedMedia = new Map();
    this.scanResults = {
      images: [],
      videos: [],
      audios: [],
      canvasElements: [],
      iframes: []
    };
    this.pageBlobUrls = [];
  }

  async scanAllMedia() {
    if (this.isScanning) return this.scanResults;

    this.isScanning = true;
    this.scanResults = {
      images: [],
      videos: [],
      audios: [],
      canvasElements: [],
      iframes: []
    };

    try {
      this.scanDOM(document);
      this.scanShadowDOM(document);
      await this.scanIframes();
      this.scanBackgroundImages();
      this.scanLazyLoadedMedia();
      this.scanVideoPlayers();
      this.scanPerformanceEntries();
      this.scanSourceTags();
      this.scanJSONLD();
    } catch (error) {
      console.error('Media scan error:', error);
    }

    this.isScanning = false;
    return this.scanResults;
  }

  scanDOM(root) {
    const images = root.querySelectorAll('img, picture source, [role="img"], [style*="background-image"]');
    images.forEach((el, index) => {
      const url = this.getElementURL(el);
      if (url) {
        this.scanResults.images.push({
          id: `img_${index}_${Date.now()}`,
          element: el,
          url: url,
          type: 'image',
          width: el.naturalWidth || el.width || el.clientWidth,
          height: el.naturalHeight || el.height || el.clientHeight,
          alt: el.alt || el.getAttribute('aria-label') || '',
          source: 'dom'
        });
      }
    });

    const videos = root.querySelectorAll('video, [role="video"], .video-player, [class*="video"]');
    videos.forEach((el, index) => {
      if (el.tagName === 'VIDEO') {
        const url = this.getElementURL(el);
        this.scanResults.videos.push({
          id: `vid_${index}_${Date.now()}`,
          element: el,
          url: url,
          type: 'video',
          width: el.videoWidth || el.clientWidth,
          height: el.videoHeight || el.clientHeight,
          duration: el.duration || 0,
          poster: el.poster || '',
          source: 'dom',
          isStreaming: this.isStreamingVideo(el),
          currentSrc: el.currentSrc || el.src || '',
          sources: this.getVideoSources(el),
          canCapture: true
        });
      }
    });

    const audios = root.querySelectorAll('audio, [role="audio"]');
    audios.forEach((el, index) => {
      const url = this.getElementURL(el);
      this.scanResults.audios.push({
        id: `aud_${index}_${Date.now()}`,
        element: el,
        url: url,
        type: 'audio',
        duration: el.duration || 0,
        source: 'dom',
        currentSrc: el.currentSrc || el.src || '',
        sources: this.getAudioSources(el)
      });
    });

    const canvases = root.querySelectorAll('canvas');
    canvases.forEach((el, index) => {
      if (el.width > 50 && el.height > 50) {
        this.scanResults.canvasElements.push({
          id: `canvas_${index}_${Date.now()}`,
          element: el,
          type: 'canvas',
          width: el.width,
          height: el.height,
          source: 'dom',
          canCapture: true
        });
      }
    });
  }

  scanShadowDOM(root) {
    const elements = root.querySelectorAll('*');
    elements.forEach(el => {
      if (el.shadowRoot) {
        this.scanDOM(el.shadowRoot);
        this.scanShadowDOM(el.shadowRoot);
      }
    });
  }

  async scanIframes() {
    const iframes = document.querySelectorAll('iframe');
    
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          this.scanDOM(iframeDoc);
          this.scanShadowDOM(iframeDoc);
          this.scanResults.iframes.push({
            element: iframe,
            src: iframe.src,
            accessible: true
          });
        } else {
          this.scanResults.iframes.push({
            element: iframe,
            src: iframe.src,
            accessible: false
          });
        }
      } catch (e) {
        this.scanResults.iframes.push({
          element: iframe,
          src: iframe.src,
          accessible: false
        });
      }
    }
  }

  scanBackgroundImages() {
    const allElements = document.querySelectorAll('*');
    const bgUrls = new Set();

    allElements.forEach(el => {
      try {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        
        if (bgImage && bgImage !== 'none') {
          const urls = bgImage.match(/url\(["']?([^"')]+)["']?\)/g);
          if (urls) {
            urls.forEach(urlStr => {
              const url = urlStr.replace(/url\(["']?/, '').replace(/["']?\)$/, '');
              if (url && !bgUrls.has(url) && !url.startsWith('data:')) {
                bgUrls.add(url);
                this.scanResults.images.push({
                  id: `bg_${bgUrls.size}_${Date.now()}`,
                  element: el,
                  url: this.resolveURL(url),
                  type: 'image',
                  source: 'css-background',
                  alt: 'CSS background image'
                });
              }
            });
          }
        }
      } catch (e) {}
    });
  }

  scanLazyLoadedMedia() {
    const lazyImages = document.querySelectorAll(
      'img[data-src], img[data-srcset], img[data-lazy], img[data-original], img[loading="lazy"], source[data-srcset]'
    );
    
    lazyImages.forEach((el, index) => {
      const urls = [
        el.dataset.src,
        el.dataset.srcset,
        el.dataset.lazy,
        el.dataset.original,
        el.dataset.url,
        el.getAttribute('data-src'),
        el.getAttribute('data-lazy-src')
      ].filter(Boolean);

      urls.forEach(url => {
        if (url && !url.includes(' ')) {
          const resolved = this.resolveURL(url);
          if (!this.scanResults.images.find(i => i.url === resolved)) {
            this.scanResults.images.push({
              id: `lazy_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              element: el,
              url: resolved,
              type: 'image',
              source: 'lazy-loaded',
              alt: el.alt || 'Lazy-loaded image'
            });
          }
        }
      });
    });
  }

  scanVideoPlayers() {
    const allVideos = document.querySelectorAll('video');
    allVideos.forEach((el, index) => {
      const src = el.currentSrc || el.src;
      if (src && !this.scanResults.videos.find(v => v.url === src)) {
        let platform = 'generic';
        const hostname = window.location.hostname;
        
        if (hostname.includes('youtube')) platform = 'YouTube';
        else if (hostname.includes('vimeo')) platform = 'Vimeo';
        else if (hostname.includes('facebook')) platform = 'Facebook';
        else if (hostname.includes('instagram')) platform = 'Instagram';
        else if (hostname.includes('twitter') || hostname.includes('x.com')) platform = 'Twitter/X';
        else if (hostname.includes('tiktok')) platform = 'TikTok';
        else if (hostname.includes('netflix')) platform = 'Netflix';
        else if (hostname.includes('twitch')) platform = 'Twitch';

        this.scanResults.videos.push({
          id: `player_${index}_${Date.now()}`,
          element: el,
          url: src,
          type: 'video',
          source: platform.toLowerCase(),
          platform: platform,
          canCapture: true
        });
      }
    });
  }

  scanPerformanceEntries() {
    if (!window.performance || !window.performance.getEntriesByType) return;

    const entries = window.performance.getEntriesByType('resource');
    const mediaExtensions = {
      image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico'],
      video: ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m3u8', '.mpd', '.flv', '.wmv', '.m4v'],
      audio: ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.opus', '.wma']
    };

    entries.forEach(entry => {
      const url = entry.name;
      const urlLower = url.toLowerCase().split('?')[0];

      if (mediaExtensions.image.some(ext => urlLower.endsWith(ext) || urlLower.includes(ext))) {
        if (!this.scanResults.images.find(i => i.url === url)) {
          this.scanResults.images.push({
            id: `perf_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: url,
            type: 'image',
            source: 'network',
            size: entry.transferSize || 0
          });
        }
      }

      if (mediaExtensions.video.some(ext => urlLower.endsWith(ext) || urlLower.includes(ext))) {
        if (!this.scanResults.videos.find(v => v.url === url)) {
          this.scanResults.videos.push({
            id: `perf_vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: url,
            type: 'video',
            source: 'network',
            size: entry.transferSize || 0
          });
        }
      }

      if (mediaExtensions.audio.some(ext => urlLower.endsWith(ext) || urlLower.includes(ext))) {
        if (!this.scanResults.audios.find(a => a.url === url)) {
          this.scanResults.audios.push({
            id: `perf_aud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: url,
            type: 'audio',
            source: 'network',
            size: entry.transferSize || 0
          });
        }
      }
    });
  }

  scanSourceTags() {
    const sourceTags = document.querySelectorAll('source');
    sourceTags.forEach(source => {
      const src = source.src || source.getAttribute('src');
      const srcset = source.getAttribute('srcset');
      const type = source.type || '';
      
      if (src) {
        const mediaType = type.startsWith('video') ? 'video' : type.startsWith('audio') ? 'audio' : 'image';
        if (mediaType === 'video' && !this.scanResults.videos.find(v => v.url === src)) {
          this.scanResults.videos.push({
            id: `source_vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: this.resolveURL(src),
            type: 'video',
            source: 'source-tag'
          });
        } else if (mediaType === 'audio' && !this.scanResults.audios.find(a => a.url === src)) {
          this.scanResults.audios.push({
            id: `source_aud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: this.resolveURL(src),
            type: 'audio',
            source: 'source-tag'
          });
        } else if (mediaType === 'image' && !this.scanResults.images.find(i => i.url === src)) {
          this.scanResults.images.push({
            id: `source_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: this.resolveURL(src),
            type: 'image',
            source: 'source-tag'
          });
        }
      }

      if (srcset) {
        srcset.split(',').forEach(part => {
          const url = part.trim().split(' ')[0];
          if (url && !this.scanResults.images.find(i => i.url === url)) {
            this.scanResults.images.push({
              id: `srcset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              url: this.resolveURL(url),
              type: 'image',
              source: 'srcset'
            });
          }
        });
      }
    });
  }

  scanJSONLD() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    scripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        this.extractMediaFromJSON(data);
      } catch (e) {}
    });
  }

  extractMediaFromJSON(data) {
    if (!data) return;
    
    if (typeof data === 'string') {
      if (data.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|wav)/i)) {
        const mediaType = this.getMediaTypeFromURL(data);
        if (mediaType === 'image' && !this.scanResults.images.find(i => i.url === data)) {
          this.scanResults.images.push({
            id: `json_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: data,
            type: 'image',
            source: 'json-ld'
          });
        } else if (mediaType === 'video' && !this.scanResults.videos.find(v => v.url === data)) {
          this.scanResults.videos.push({
            id: `json_vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: data,
            type: 'video',
            source: 'json-ld'
          });
        }
      }
    } else if (Array.isArray(data)) {
      data.forEach(item => this.extractMediaFromJSON(item));
    } else if (typeof data === 'object') {
      Object.values(data).forEach(value => this.extractMediaFromJSON(value));
    }
  }

  getElementURL(el) {
    const urls = [
      el.currentSrc,
      el.src,
      el.dataset?.src,
      el.dataset?.lazy,
      el.dataset?.original,
      el.getAttribute?.('src'),
      el.getAttribute?.('data-src')
    ];

    for (const url of urls) {
      if (url && typeof url === 'string' && url.trim() !== '') {
        return this.resolveURL(url);
      }
    }
    return null;
  }

  resolveURL(url) {
    try {
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
      return new URL(url, window.location.href).href;
    } catch (e) {
      return url;
    }
  }

  getVideoSources(videoEl) {
    const sources = [];
    if (videoEl.currentSrc) sources.push({ src: videoEl.currentSrc, type: 'currentSrc' });
    if (videoEl.src && videoEl.src !== videoEl.currentSrc) sources.push({ src: videoEl.src, type: 'src' });
    
    videoEl.querySelectorAll('source').forEach(source => {
      if (source.src) {
        sources.push({ src: source.src, type: source.type || 'source' });
      }
    });
    return sources;
  }

  getAudioSources(audioEl) {
    const sources = [];
    if (audioEl.currentSrc) sources.push({ src: audioEl.currentSrc, type: 'currentSrc' });
    if (audioEl.src && audioEl.src !== audioEl.currentSrc) sources.push({ src: audioEl.src, type: 'src' });
    
    audioEl.querySelectorAll('source').forEach(source => {
      if (source.src) {
        sources.push({ src: source.src, type: source.type || 'source' });
      }
    });
    return sources;
  }

  isStreamingVideo(videoEl) {
    const src = videoEl.currentSrc || videoEl.src;
    if (!src) return false;
    return src.includes('.m3u8') || src.includes('.mpd') || src.startsWith('blob:');
  }

  // ============================================
  // MULTI-STRATEGY FETCH
  // ============================================

  async fetchMedia(url, options = {}) {
    const { timeout = 15000, retries = 2, element = null } = options;

    if (url.startsWith('data:')) {
      return { blob: this.dataURLToBlob(url), url, method: 'data-url' };
    }

    if (url.startsWith('blob:')) {
      const blob = await this.fetchBlobURL(url);
      if (blob) return { blob, url, method: 'blob-url' };
    }

    // Strategy 1: Direct CORS fetch
    try {
      const blob = await this.fetchWithCORS(url, timeout);
      if (blob) return { blob, url, method: 'cors-fetch' };
    } catch (e) {
      console.warn('CORS fetch failed:', e.message);
    }

    // Strategy 2: Fetch via background script
    try {
      const blob = await this.fetchViaBackground(url, timeout);
      if (blob) return { blob, url, method: 'background-fetch' };
    } catch (e) {
      console.warn('Background fetch failed:', e.message);
    }

    // Strategy 3: Capture from element (canvas/video)
    if (element) {
      try {
        const blob = await this.captureFromElement(element);
        if (blob) return { blob, url, method: 'element-capture' };
      } catch (e) {
        console.warn('Element capture failed:', e.message);
      }
    }

    // Strategy 4: Screenshot via background
    try {
      const blob = await this.captureScreenshot();
      if (blob) return { blob, url, method: 'screenshot' };
    } catch (e) {
      console.warn('Screenshot failed:', e.message);
    }

    // Strategy 5: No-CORS fetch (opaque but may work for some)
    try {
      const blob = await this.fetchNoCORS(url);
      if (blob && blob.size > 0) return { blob, url, method: 'no-cors-fetch' };
    } catch (e) {
      console.warn('No-CORS fetch failed:', e.message);
    }

    throw new Error('All fetch strategies failed. The site may have DRM protection.');
  }

  async fetchWithCORS(url, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async fetchViaBackground(url, timeout) {
    return new Promise((resolve, reject) => {
      const messageId = Date.now() + Math.random();

      const timeoutId = setTimeout(() => {
        reject(new Error('Background fetch timeout'));
      }, timeout);

      const handler = (message) => {
        if (message.type === 'FETCH_MEDIA_RESULT' && message.messageId === messageId) {
          clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(handler);

          if (message.success && message.dataUrl) {
            const blob = this.dataURLToBlob(message.dataUrl);
            resolve(blob);
          } else {
            reject(new Error(message.error || 'Background fetch failed'));
          }
        }
      };

      chrome.runtime.onMessage.addListener(handler);

      chrome.runtime.sendMessage({
        type: 'FETCH_MEDIA',
        url: url,
        messageId: messageId
      });
    });
  }

  async fetchNoCORS(url) {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors'
    });
    return await response.blob();
  }

  async fetchBlobURL(url) {
    try {
      const response = await fetch(url);
      return await response.blob();
    } catch (e) {
      return null;
    }
  }

  async captureFromElement(element) {
    const tagName = element.tagName;

    if (tagName === 'CANVAS') {
      return await this.canvasToBlob(element);
    }

    if (tagName === 'VIDEO') {
      return await this.captureVideoFrame(element);
    }

    if (tagName === 'IMG') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = element.naturalWidth || element.width;
        canvas.height = element.naturalHeight || element.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(element, 0, 0);
        return await this.canvasToBlob(canvas);
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  async captureVideoFrame(videoEl) {
    return new Promise((resolve) => {
      if (videoEl.readyState < 2) {
        resolve(null);
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth || 640;
        canvas.height = videoEl.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9);
      } catch (e) {
        console.error('Video frame capture error:', e);
        resolve(null);
      }
    });
  }

  async captureScreenshot() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (response) => {
        if (response && response.success && response.dataUrl) {
          const blob = this.dataURLToBlob(response.dataUrl);
          resolve(blob);
        } else {
          resolve(null);
        }
      });
    });
  }

  dataURLToBlob(dataURL) {
    try {
      const parts = dataURL.split(',');
      const header = parts[0];
      const data = parts[1];
      const mime = header.match(/:(.*?);/)[1];
      const binary = atob(data);
      const array = new Uint8Array(binary.length);
      
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      
      return new Blob([array], { type: mime });
    } catch (e) {
      console.error('Data URL conversion error:', e);
      return null;
    }
  }

  canvasToBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob(blob => resolve(blob), 'image/png');
    });
  }

  getMediaTypeFromURL(url) {
    if (!url) return null;
    
    const urlLower = url.toLowerCase().split('?')[0];
    
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico'];
    const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m3u8', '.mpd', '.flv', '.wmv'];
    const audioExts = ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.opus', '.wma'];

    if (imageExts.some(ext => urlLower.includes(ext))) return 'image';
    if (videoExts.some(ext => urlLower.includes(ext))) return 'video';
    if (audioExts.some(ext => urlLower.includes(ext))) return 'audio';

    if (url.startsWith('data:')) {
      if (url.includes('image/')) return 'image';
      if (url.includes('video/')) return 'video';
      if (url.includes('audio/')) return 'audio';
    }

    return null;
  }

  getSummary() {
    return {
      images: this.scanResults.images.length,
      videos: this.scanResults.videos.length,
      audios: this.scanResults.audios.length,
      canvas: this.scanResults.canvasElements.length,
      iframes: this.scanResults.iframes.length,
      total: this.scanResults.images.length + 
             this.scanResults.videos.length + 
             this.scanResults.audios.length + 
             this.scanResults.canvasElements.length
    };
  }

  clearCache() {
    this.mediaCache.clear();
    this.capturedMedia.clear();
    this.scanResults = {
      images: [],
      videos: [],
      audios: [],
      canvasElements: [],
      iframes: []
    };
  }
}

if (typeof window !== 'undefined') {
  window.MediaFetcher = MediaFetcher;
}