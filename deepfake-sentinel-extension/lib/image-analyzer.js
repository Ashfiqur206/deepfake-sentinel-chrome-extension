class ImageAnalyzer {
    constructor() {
        this.faceDetector = null;
        this.initFaceDetector();
    }

    async initFaceDetector() {
        try {
            // Try to load face detection
            if (typeof FaceDetector !== 'undefined') {
                this.faceDetector = new FaceDetector();
            } else {
                // Try to load from window
                if (window.FaceDetector) {
                    this.faceDetector = new window.FaceDetector();
                }
            }
        } catch (error) {
            console.log('Face detector not available:', error);
        }
    }

    async analyzeImage(imageData) {
        const features = this.extractFeatures(imageData);
        const faces = await this.detectFaces(imageData);
        const confidence = this.calculateConfidence(features, faces);
        const heatmap = this.generateHeatmap(imageData);

        return {
            features: features,
            faces: faces,
            confidence: confidence,
            heatmap: heatmap,
            verdict: confidence > 0.5 ? 'FAKE' : 'REAL'
        };
    }

    extractFeatures(imageData) {
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

        // Edge detection (simple)
        const edges = this.detectEdges(imageData);
        
        // Color variance
        const colorVariance = this.calculateColorVariance(imageData);

        return {
            mean: mean,
            stdDev: stdDev,
            entropy: entropy,
            contrast: stdDev / 128,
            edges: edges,
            colorVariance: colorVariance
        };
    }

    detectEdges(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        let edgeCount = 0;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                const left = (y * width + (x - 1)) * 4;
                const right = (y * width + (x + 1)) * 4;
                const up = ((y - 1) * width + x) * 4;
                const down = ((y + 1) * width + x) * 4;

                const gx = data[right] - data[left];
                const gy = data[down] - data[up];
                const gradient = Math.sqrt(gx * gx + gy * gy);
                
                if (gradient > 30) edgeCount++;
            }
        }

        return edgeCount / (width * height);
    }

    calculateColorVariance(imageData) {
        const data = imageData.data;
        let rSum = 0, gSum = 0, bSum = 0;
        let rSq = 0, gSq = 0, bSq = 0;
        const total = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
            rSum += data[i];
            gSum += data[i+1];
            bSum += data[i+2];
            rSq += data[i] * data[i];
            gSq += data[i+1] * data[i+1];
            bSq += data[i+2] * data[i+2];
        }

        const rVar = (rSq / total) - (rSum / total) ** 2;
        const gVar = (gSq / total) - (gSum / total) ** 2;
        const bVar = (bSq / total) - (bSum / total) ** 2;

        return (rVar + gVar + bVar) / 3;
    }

    async detectFaces(imageData) {
        if (this.faceDetector && this.faceDetector.isSupported) {
            try {
                const faces = await this.faceDetector.detectFaces(imageData);
                return faces;
            } catch (error) {
                console.warn('Face detection error:', error);
                return [];
            }
        }
        return [];
    }

    calculateConfidence(features, faces) {
        let score = 0.5;
        
        // Entropy analysis
        if (features.entropy < 4.5) score += 0.15;
        if (features.entropy > 6.5) score -= 0.1;
        
        // Contrast analysis
        if (features.contrast < 0.3 || features.contrast > 0.8) score += 0.1;
        
        // Edge analysis - too many edges might indicate sharpening
        if (features.edges > 0.15) score += 0.1;
        
        // Color variance - low variance might indicate AI generation
        if (features.colorVariance < 500) score += 0.1;
        
        // Face detection confidence
        if (faces && faces.length > 0) {
            const avgConfidence = faces.reduce((sum, f) => sum + f.confidence, 0) / faces.length;
            if (avgConfidence > 0.7) score -= 0.1;
        }

        return Math.min(Math.max(score, 0.1), 0.95);
    }

    generateHeatmap(imageData) {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        
        const heatmapData = ctx.createImageData(canvas.width, canvas.height);
        const data = heatmapData.data;
        
        // Generate heatmap based on image features
        const imgData = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const x = (i / 4) % canvas.width;
            const y = Math.floor((i / 4) / canvas.width);
            
            // Calculate edge intensity
            const idx = (y * canvas.width + x) * 4;
            const gray = 0.299 * imgData[idx] + 0.587 * imgData[idx+1] + 0.114 * imgData[idx+2];
            
            // Create heatmap effect
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const dist = Math.sqrt(
                Math.pow(x - centerX, 2) + 
                Math.pow(y - centerY, 2)
            );
            const maxDist = Math.sqrt(
                Math.pow(canvas.width/2, 2) + 
                Math.pow(canvas.height/2, 2)
            );
            
            // Intensity based on distance from center and gray value
            const intensity = Math.max(0, 1 - (dist / maxDist)) * (1 - gray / 255);
            const intVal = Math.min(255, Math.round(intensity * 255));
            
            data[i] = intVal;
            data[i+1] = Math.round(intVal * 0.3);
            data[i+2] = Math.round(intVal * 0.1);
            data[i+3] = 150;
        }
        
        ctx.putImageData(heatmapData, 0, 0);
        
        // Overlay original image
        ctx.globalAlpha = 0.4;
        ctx.putImageData(imageData, 0, 0);
        
        return canvas.toDataURL();
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageAnalyzer;
}