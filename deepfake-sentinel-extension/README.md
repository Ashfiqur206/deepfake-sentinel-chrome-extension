# 🛡️ DeepFake Sentinel Browser Extension

Detect deepfakes in images, videos, and audio directly in your browser.

## ✨ Features

- **Right-click Analysis** - Analyze any image, video, or audio from any webpage
- **Standalone Mode** - Works without any server (privacy-first)
- **Server Mode** - Optional backend for more accurate detection
- **History** - Keep track of all analyses
- **Keyboard Shortcuts** - Alt+Shift+D to analyze selected media
- **Privacy Focused** - Data stays in your browser in standalone mode

## 📦 Installation

### From Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store
2. Search for "DeepFake Sentinel"
3. Click "Add to Chrome"

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `browser-extension` folder

## 🚀 Usage

### Quick Start
1. Right-click any image, video, or audio on any webpage
2. Select "DeepFake Sentinel" → "Analyze..."
3. View the results as an overlay on the page

### Standalone Analyzer
1. Click the extension icon in the toolbar
2. Click "Standalone" button
3. Upload a file for analysis

### Keyboard Shortcuts
- `Alt+Shift+D` - Analyze selected media
- `Alt+Shift+A` - Analyze all audio on page

## ⚙️ Settings

Click the extension icon and select "Settings" to configure:
- Enable/disable extension
- Switch between standalone and server mode
- Configure API endpoint (server mode)
- Set confidence threshold
- Manage history limit

## 🔒 Privacy

- **Standalone Mode**: All analysis runs in your browser. No data is sent anywhere.
- **Server Mode**: Files are sent to your configured server. Use only with trusted servers.

## 🛠️ Development

### Prerequisites
- Python 3.8+ (for icon generation)
- Node.js (optional, for development)

### Generate Icons
```bash
pip install Pillow
python generate_icons.py