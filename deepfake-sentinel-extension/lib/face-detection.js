class FaceDetector {
    constructor() {
        this.isSupported = false;
        this.faceDetector = null;
        this.init();
    }

    async init() {
        try {
            // Try to use the built-in FaceDetector API (Chrome/Edge)
            if ('FaceDetector' in window) {
                this.faceDetector = new FaceDetector({
                    maxDetectedFaces: 5,
                    fastMode: true
                });
                this.isSupported = true;
                console.log('✅ Face detection initialized using built-in API');
            } else {
                console.log('ℹ️ Built-in face detection not available, using fallback');
                this.isSupported = false;
            }
        } catch (error) {
            console.log('⚠️ Face detection initialization failed:', error);
            this.isSupported = false;
        }
    }

    async detectFaces(imageData) {
        if (!this.isSupported || !this.faceDetector) {
            return this.fallbackDetection(imageData);
        }

        try {
            const faces = await this.faceDetector.detect(imageData);
            return faces.map(face => ({
                x: face.boundingBox.x,
                y: face.boundingBox.y,
                width: face.boundingBox.width,
                height: face.boundingBox.height,
                confidence: 0.9,
                landmarks: face.landmarks || []
            }));
        } catch (error) {
            console.warn('Face detection error:', error);
            return this.fallbackDetection(imageData);
        }
    }

    fallbackDetection(imageData) {
        // Simple fallback: detect faces using skin color detection
        // This is a very basic fallback for demonstration
        const faces = [];
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);

        // Simple face detection using skin color thresholds
        // This is not accurate but provides a fallback
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // Find skin-colored regions (simplified)
        for (let y = 0; y < height; y += 20) {
            for (let x = 0; x < width; x += 20) {
                const index = (y * width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                
                // Simple skin color detection (crude)
                if (r > 80 && g > 40 && b > 20 && 
                    r > g && r > b &&
                    Math.abs(r - g) > 15) {
                    // Found a potential face region
                    faces.push({
                        x: x,
                        y: y,
                        width: 80,
                        height: 80,
                        confidence: 0.3,
                        landmarks: []
                    });
                    break;
                }
            }
        }

        return faces;
    }

    drawFaceBoxes(ctx, faces) {
        faces.forEach(face => {
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 2;
            ctx.strokeRect(face.x, face.y, face.width, face.height);
            
            // Draw confidence
            ctx.fillStyle = 'rgba(102, 126, 234, 0.7)';
            ctx.font = '12px Arial';
            ctx.fillText(
                `Face ${(face.confidence * 100).toFixed(0)}%`,
                face.x,
                face.y - 5
            );
        });
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FaceDetector;
}