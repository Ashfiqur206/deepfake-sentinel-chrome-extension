

class VideoAnalyzer {
    constructor() {
        this.imageAnalyzer = null;
        this.initImageAnalyzer();
    }

    async initImageAnalyzer() {
        try {
            if (typeof ImageAnalyzer !== 'undefined') {
                this.imageAnalyzer = new ImageAnalyzer();
            } else if (window.ImageAnalyzer) {
                this.imageAnalyzer = new window.ImageAnalyzer();
            }
        } catch (error) {
            console.log('Image analyzer not available:', error);
        }
    }

    async analyzeVideo(videoElement, maxFrames = 10) {
        const results = [];
        const duration = videoElement.duration || 10;
        const frameInterval = Math.max(1, Math.floor(duration / maxFrames));
        
        // Create canvas for frame extraction
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Store original state
        const wasPaused = videoElement.paused;
        
        // Pause video for frame extraction
        if (!wasPaused) {
            videoElement.pause();
        }
        
        try {
            for (let i = 0; i < Math.min(maxFrames, Math.floor(duration)); i++) {
                const time = i * frameInterval;
                if (time < duration) {
                    videoElement.currentTime = time;
                    await new Promise(resolve => {
                        videoElement.addEventListener('seeked', resolve, { once: true });
                    });
                    
                    // Extract frame
                    canvas.width = videoElement.videoWidth || 640;
                    canvas.height = videoElement.videoHeight || 480;
                    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    
                    // Analyze frame
                    if (this.imageAnalyzer) {
                        const result = await this.imageAnalyzer.analyzeImage(imageData);
                        results.push({
                            frame: i,
                            time: time,
                            confidence: result.confidence,
                            verdict: result.verdict
                        });
                    } else {
                        // Fallback
                        results.push({
                            frame: i,
                            time: time,
                            confidence: 0.5,
                            verdict: 'UNKNOWN'
                        });
                    }
                }
            }
        } finally {
            // Restore video state
            if (!wasPaused) {
                videoElement.play();
            }
        }
        
        // Aggregate results
        const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
        const avgConfidence = totalConfidence / (results.length || 1);
        const fakeCount = results.filter(r => r.verdict === 'FAKE').length;
        const fakeRatio = fakeCount / (results.length || 1);
        const finalConfidence = avgConfidence * (0.5 + fakeRatio * 0.5);

        return {
            frames: results,
            totalFrames: results.length,
            fakeCount: fakeCount,
            averageConfidence: avgConfidence,
            finalConfidence: Math.min(finalConfidence, 0.95),
            verdict: finalConfidence > 0.5 ? 'FAKE' : 'REAL'
        };
    }

    async analyzeVideoURL(videoUrl, maxFrames = 10) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.src = videoUrl;
            
            video.addEventListener('loadedmetadata', async () => {
                try {
                    const result = await this.analyzeVideo(video, maxFrames);
                    resolve(result);
                } catch (error) {
                    console.error('Video analysis error:', error);
                    resolve({
                        frames: [],
                        totalFrames: 0,
                        fakeCount: 0,
                        averageConfidence: 0.5,
                        finalConfidence: 0.5,
                        verdict: 'UNKNOWN'
                    });
                }
                video.remove();
            });
            
            video.addEventListener('error', () => {
                console.error('Video load error');
                resolve({
                    frames: [],
                    totalFrames: 0,
                    fakeCount: 0,
                    averageConfidence: 0.5,
                    finalConfidence: 0.5,
                    verdict: 'UNKNOWN'
                });
                video.remove();
            });
            
            video.load();
        });
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VideoAnalyzer;
}