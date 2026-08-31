// lib/audio-processor.js
// Audio processing functions for the browser extension

class AudioProcessor {
    constructor() {
        this.sampleRate = 16000;
        this.audioContext = null;
    }

    async processAudio(audioElement) {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });

            // Create a media element source
            const source = this.audioContext.createMediaElementSource(audioElement);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            
            source.connect(analyser);
            analyser.connect(this.audioContext.destination);

            // Extract features
            const features = await this.extractFeatures(analyser);
            
            // Calculate confidence
            const confidence = this.calculateConfidence(features);
            
            return {
                confidence: confidence,
                verdict: confidence > 0.5 ? 'FAKE' : 'REAL',
                features: features,
                duration: audioElement.duration || 0
            };
        } catch (error) {
            console.error('Audio processing error:', error);
            return {
                confidence: 0.5,
                verdict: 'UNKNOWN',
                features: null,
                duration: 0
            };
        }
    }

    async extractFeatures(analyser) {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate features
        const features = {
            spectralCentroid: 0,
            spectralRolloff: 0,
            spectralFlatness: 0,
            rms: 0,
            zeroCrossingRate: 0
        };

        // Spectral centroid
        let total = 0;
        let weightedSum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            weightedSum += i * dataArray[i];
            total += dataArray[i];
        }
        features.spectralCentroid = total > 0 ? weightedSum / total : 0;

        // Spectral rolloff (85%)
        let cumulativeEnergy = 0;
        const totalEnergy = dataArray.reduce((sum, val) => sum + val, 0);
        for (let i = 0; i < dataArray.length; i++) {
            cumulativeEnergy += dataArray[i];
            if (cumulativeEnergy >= totalEnergy * 0.85) {
                features.spectralRolloff = i;
                break;
            }
        }

        // RMS energy
        let rmsSum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            rmsSum += dataArray[i] * dataArray[i];
        }
        features.rms = Math.sqrt(rmsSum / dataArray.length);

        // Zero crossing rate (simplified)
        let crossings = 0;
        for (let i = 1; i < dataArray.length; i++) {
            if ((dataArray[i] >= 128 && dataArray[i-1] < 128) || 
                (dataArray[i] < 128 && dataArray[i-1] >= 128)) {
                crossings++;
            }
        }
        features.zeroCrossingRate = crossings / dataArray.length;

        // Spectral flatness (simplified)
        const geometricMean = dataArray.reduce((sum, val) => sum * (val || 1), 1) ** (1 / dataArray.length);
        const arithmeticMean = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
        features.spectralFlatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;

        return features;
    }

    calculateConfidence(features) {
        if (!features) return 0.5;
        
        let score = 0.5;
        
        // High spectral centroid might indicate synthesized audio
        if (features.spectralCentroid > 3000) score += 0.15;
        if (features.spectralCentroid < 1000) score -= 0.1;
        
        // Low spectral flatness might indicate synthetic audio
        if (features.spectralFlatness < 0.3) score += 0.15;
        if (features.spectralFlatness > 0.7) score -= 0.1;
        
        // Very low RMS might indicate noise
        if (features.rms < 10) score += 0.1;
        
        return Math.min(Math.max(score, 0.1), 0.95);
    }

    async processAudioURL(audioUrl) {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.crossOrigin = 'anonymous';
            audio.src = audioUrl;
            
            audio.addEventListener('loadedmetadata', async () => {
                try {
                    const result = await this.processAudio(audio);
                    resolve(result);
                } catch (error) {
                    console.error('Audio analysis error:', error);
                    resolve({
                        confidence: 0.5,
                        verdict: 'UNKNOWN',
                        features: null,
                        duration: 0
                    });
                }
                audio.remove();
            });
            
            audio.addEventListener('error', () => {
                console.error('Audio load error');
                resolve({
                    confidence: 0.5,
                    verdict: 'UNKNOWN',
                    features: null,
                    duration: 0
                });
                audio.remove();
            });
            
            audio.load();
        });
    }

    cleanup() {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioProcessor;
}