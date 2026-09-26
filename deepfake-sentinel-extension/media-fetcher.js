class MediaFetcher {
  constructor() {
    this.mediaCache = new Map();
    this.observers = [];
    this.isScanning = false;
    this.scanResults = {
      images: [],
      videos: [],
      audios: [],
      canvasElements: [],
      iframes: []
    };
  }

  async scanAllMedia() {
    if (this.isScanning) {
      return this.scanResults;
    }

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
    } catch (error) {
      console.error('Media scan error:', error);
    }

    this.isScanning = false;
    return this.scanResults;
  }

  scanDOM(root) {
    const images = root.querySelectorAll('img, picture source, [role="img"]');
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
          alt: el.alt || '',
          source: 'dom'
        });
      }
    });

    const videos = root.querySelectorAll('video, [role="video"]');
    videos.forEach((el, index) => {
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
        sources: this.getVideoSources(el)
      });
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
          source: 'dom'
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
                  url: url,
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
      'img[data-src], img[data-srcset], img[data-lazy], img[data-original], img[loading="lazy"]'
    );
    
    lazyImages.forEach((el, index) => {
      const urls = [
        el.dataset.src,
        el.dataset.srcset,
        el.dataset.lazy,
        el.dataset.original,
        el.dataset.url
      ].filter(Boolean);

      urls.forEach(url => {
        if (url && !this.scanResults.images.find(i => i.url === url)) {
          this.scanResults.images.push({
            id: `lazy_${index}_${Date.now()}`,
            element: el,
            url: url,
            type: 'image',
            source: 'lazy-loaded',
            alt: el.alt || 'Lazy-loaded image'
          });
        }
      });
    });

    const lazyVideos = document.querySelectorAll('video[data-src], video[data-lazy]');
    lazyVideos.forEach((el, index) => {
      const url = el.dataset.src || el.dataset.lazy;
      if (url) {
        this.scanResults.videos.push({
          id: `lazyvid_${index}_${Date.now()}`,
          element: el,
          url: url,
          type: 'video',
          source: 'lazy-loaded'
        });
      }
    });
  }

  scanVideoPlayers() {
    const youtubeVideos = document.querySelectorAll('video.html5-main-video, video.video-stream');
    youtubeVideos.forEach((el, index) => {
      if (el.src && !this.scanResults.videos.find(v => v.url === el.src)) {
        this.scanResults.videos.push({
          id: `yt_${index}_${Date.now()}`,
          element: el,
          url: el.src,
          type: 'video',
          source: 'youtube',
          platform: 'YouTube'
        });
      }
    });

    const vimeoVideos = document.querySelectorAll('video[src*="vimeocdn"]');
    vimeoVideos.forEach((el, index) => {
      if (el.src && !this.scanResults.videos.find(v => v.url === el.src)) {
        this.scanResults.videos.push({
          id: `vimeo_${index}_${Date.now()}`,
          element: el,
          url: el.src,
          type: 'video',
          source: 'vimeo',
          platform: 'Vimeo'
        });
      }
    });

    const genericVideos = document.querySelectorAll('video');
    genericVideos.forEach((el, index) => {
      const src = el.currentSrc || el.src;
      if (src && !this.scanResults.videos.find(v => v.url === src)) {
        this.scanResults.videos.push({
          id: `generic_${index}_${Date.now()}`,
          element: el,
          url: src,
          type: 'video',
          source: 'generic',
          platform: window.location.hostname
        });
      }
    });
  }

  scanPerformanceEntries() {
    if (!window.performance || !window.performance.getEntriesByType) return;

    const entries = window.performance.getEntriesByType('resource');
    const mediaExtensions = {
      image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif'],
      video: ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m3u8', '.mpd'],
      audio: ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.opus']
    };

    entries.forEach(entry => {
      const url = entry.name;
      const urlLower = url.toLowerCase();

      if (mediaExtensions.image.some(ext => urlLower.includes(ext))) {
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

      if (mediaExtensions.video.some(ext => urlLower.includes(ext))) {
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

      if (mediaExtensions.audio.some(ext => urlLower.includes(ext))) {
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

  getElementURL(el) {
    const urls = [
      el.currentSrc,
      el.src,
      el.dataset.src,
      el.dataset.lazy,
      el.dataset.original,
      el.getAttribute('src'),
      el.getAttribute('data-src')
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
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        return url;
      }
      return new URL(url, window.location.href).href;
    } catch (e) {
      return url;
    }
  }

  getVideoSources(videoEl) {
    const sources = [];
    
    if (videoEl.currentSrc) sources.push({ src: videoEl.currentSrc, type: videoEl.currentSrc.split('.').pop() });
    if (videoEl.src && videoEl.src !== videoEl.currentSrc) sources.push({ src: videoEl.src, type: 'src' });
    
    videoEl.querySelectorAll('source').forEach(source => {
      if (source.src) {
        sources.push({
          src: source.src,
          type: source.type || source.src.split('.').pop()
        });
      }
    });

    return sources;
  }

  getAudioSources(audioEl) {
    const sources = [];
    
    if (audioEl.currentSrc) sources.push({ src: audioEl.currentSrc, type: audioEl.currentSrc.split('.').pop() });
    if (audioEl.src && audioEl.src !== audioEl.currentSrc) sources.push({ src: audioEl.src, type: 'src' });
    
    audioEl.querySelectorAll('source').forEach(source => {
      if (source.src) {
        sources.push({
          src: source.src,
          type: source.type || source.src.split('.').pop()
        });
      }
    });

    return sources;
  }

  isStreamingVideo(videoEl) {
    const src = videoEl.currentSrc || videoEl.src;
    if (!src) return false;
    return src.includes('.m3u8') || src.includes('.mpd') || src.includes('blob:');
  }

  async fetchMedia(url, options = {}) {
    const { timeout = 30000, retries = 3 } = options;

    if (url.startsWith('data:')) {
      return { blob: this.dataURLToBlob(url), url, method: 'data-url' };
    }

    if (url.startsWith('blob:')) {
      return { blob: await this.fetchBlobURL(url), url, method: 'blob-url' };
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          signal: controller.signal,
          headers: {
            'Accept': '*/*'
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        return { blob, url, method: 'cors-fetch' };

      } catch (error) {
        console.warn(`Fetch attempt ${attempt} failed for ${url}:`, error.message);

        if (attempt === retries && error.name !== 'AbortError') {
          try {
            const response = await fetch(url, {
              method: 'GET',
              mode: 'no-cors'
            });
            const blob = await response.blob();
            return { blob, url, method: 'no-cors-fetch', warning: 'Limited CORS access' };
          } catch (noCorsError) {
            console.error('No-cors fetch also failed:', noCorsError);
          }
        }

        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        } else {
          throw error;
        }
      }
    }

    throw new Error('All fetch attempts failed');
  }

  dataURLToBlob(dataURL) {
    try {
      const [header, data] = dataURL.split(',');
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

  async fetchBlobURL(url) {
    try {
      const response = await fetch(url);
      return await response.blob();
    } catch (e) {
      console.error('Blob fetch error:', e);
      return null;
    }
  }

  async extractVideoFrame(videoEl, time = null) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;

      const capture = () => {
        try {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to extract frame'));
            }
          }, 'image/jpeg', 0.9);
        } catch (e) {
          reject(e);
        }
      };

      if (time !== null && videoEl.readyState >= 2) {
        const wasPaused = videoEl.paused;
        const currentTime = videoEl.currentTime;

        videoEl.currentTime = time;
        videoEl.addEventListener('seeked', () => {
          capture();
          videoEl.currentTime = currentTime;
          if (!wasPaused) videoEl.play();
        }, { once: true });
      } else if (videoEl.readyState >= 2) {
        capture();
      } else {
        videoEl.addEventListener('loadeddata', capture, { once: true });
        videoEl.addEventListener('error', reject, { once: true });
      }
    });
  }

  canvasToBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob(blob => resolve(blob), 'image/png');
    });
  }

  async captureVideoScreenshot(videoEl) {
    try {
      const blob = await this.extractVideoFrame(videoEl);
      return blob;
    } catch (e) {
      console.error('Screenshot error:', e);
      return null;
    }
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

  startWatching(callback) {
    const observer = new MutationObserver((mutations) => {
      let newMedia = [];

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (['IMG', 'VIDEO', 'AUDIO', 'CANVAS'].includes(node.tagName)) {
              newMedia.push(node);
            }

            if (node.querySelectorAll) {
              const media = node.querySelectorAll('img, video, audio, canvas');
              newMedia.push(...media);
            }
          }
        });
      });

      if (newMedia.length > 0) {
        callback(newMedia);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.observers.push(observer);
    return observer;
  }

  stopWatching() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
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