

class AudioProcessor {
  constructor() {
    this.sampleRate = 16000;
    this.audioContext = null;
  }

  async processAudioBlob(blob) {
    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      // Read blob as ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();
      
      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Extract audio features
      const features = this.extractFeatures(audioBuffer);
      
      // Close context to free resources
      await this.audioContext.close();
      
      return features;
    } catch (error) {
      console.error('Audio processing error:', error);
      return null;
    }
  }

  extractFeatures(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    const features = {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      rms: this.calculateRMS(data),
      peakAmplitude: this.calculatePeak(data),
      zeroCrossingRate: this.calculateZeroCrossingRate(data),
      spectralCentroid: this.calculateSpectralCentroid(data, audioBuffer.sampleRate)
    };
    
    return features;
  }

  calculateRMS(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }

  calculatePeak(data) {
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > max) max = abs;
    }
    return max;
  }

  calculateZeroCrossingRate(data) {
    let crossings = 0;
    for (let i = 1; i < data.length; i++) {
      if ((data[i] >= 0 && data[i-1] < 0) || (data[i] < 0 && data[i-1] >= 0)) {
        crossings++;
      }
    }
    return crossings / data.length;
  }

  calculateSpectralCentroid(data, sampleRate) {
    // Simple FFT-based spectral centroid
    // For simplicity, we use a rough estimate based on zero-crossing rate
    // In production, you'd use proper FFT
    const zcr = this.calculateZeroCrossingRate(data);
    return zcr * sampleRate / 2;
  }

  async extractMFCC(audioBuffer) {
    // Placeholder for MFCC extraction
    // In production, you'd use a library like librosa or ml5.js
    // This is a simplified version
    const data = audioBuffer.getChannelData(0);
    const mfccs = [];
    
    // Simple feature extraction (simplified)
    for (let i = 0; i < 13; i++) {
      const start = Math.floor(i * data.length / 13);
      const end = Math.floor((i + 1) * data.length / 13);
      let sum = 0;
      for (let j = start; j < end && j < data.length; j++) {
        sum += data[j] * data[j];
      }
      mfccs.push(sum / (end - start));
    }
    
    return mfccs;
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioProcessor;
}