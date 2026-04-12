# SignSpeak — ASL Sign Language Translator

Real-time American Sign Language (ASL) alphabet translator using webcam hand tracking and gesture recognition. Runs entirely in the browser — no backend required.

## Features

- 🎥 Live webcam hand detection with **MediaPipe HandLandmarker**
- 🤟 **ASL alphabet recognition** (A–Z) using geometric gesture classification
- 🎯 Real-time confidence scoring and prediction stabilization
- ✨ Colored hand skeleton overlay (each finger a different color)
- 📝 Cumulative sentence builder with auto-commit
- 🔊 Text-to-Speech for translated text
- 🌙 Dark mode UI with glassmorphism design
- ⌨️ Keyboard shortcuts for quick control
- 📱 Responsive layout (desktop + mobile)

## Quick Start

### Option 1: Using npx serve (recommended)
```bash
npx -y serve ./sign-language-translator
```
Then open `http://localhost:3000` in Chrome or Edge.

### Option 2: Using Python
```bash
cd sign-language-translator
python -m http.server 8080
```
Then open `http://localhost:8080` in Chrome or Edge.

### Option 3: Using VS Code Live Server
1. Install the "Live Server" extension in VS Code
2. Right-click `index.html` → "Open with Live Server"

> **Note:** The app requires HTTPS or localhost for camera access. It won't work via `file://` protocol.

## How to Use

1. Click **Start Camera** (or press `Space`)
2. Hold your hand up to the camera showing an ASL letter
3. Hold the sign steady for ~1.2 seconds to commit the letter to the sentence
4. Use **Space** button (or `Shift+Space`) to add a space between words
5. Click **Speak** (or press `Enter`) to hear the translated text

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Toggle camera on/off |
| `Shift+Space` | Add a space to sentence |
| `Backspace` | Delete last character |
| `Escape` | Clear entire sentence |
| `Enter` | Speak translated text |

## Supported ASL Letters

### High Accuracy (distinct hand shapes)
**A, B, C, D, F, I, L, S, U, V, W, Y** — These letters have very distinctive hand poses that are well-detected.

### Moderate Accuracy
**E, K, O, R, X** — These work well but may occasionally be confused with similar shapes.

### Orientation-Dependent
**G, H, P, Q** — Accuracy depends on how your hand is angled relative to the camera.

### Limited (requires motion in real ASL)
**J, Z** — These letters involve hand motion in ASL, so only static approximations are detected.

### Subtle Finger Positions
**M, N, T** — These have very similar finger-over-thumb configurations and may be confused with each other.

## Project Structure

```
sign-language-translator/
├── index.html              # Main page structure
├── styles.css              # Dark mode UI styles
├── app.js                  # Main application controller
├── hand-tracker.js         # MediaPipe HandLandmarker wrapper
├── gesture-classifier.js   # ASL rule-based classification engine
└── README.md               # This file
```

## How to Add More Gestures

The classifier is designed to be easily extensible. To add a new gesture:

1. Open `gesture-classifier.js`
2. Add a new entry to the `ASL_DEFINITIONS` object:

```javascript
ASL_DEFINITIONS['THUMBS_UP'] = (features) => {
    // Define geometric conditions
    const thumbUp = features.fingers.thumb && features.indexDirection === 'up';
    const othersCurled = !features.fingers.index && !features.fingers.middle;
    
    let confidence = 0;
    if (thumbUp) confidence += 0.5;
    if (othersCurled) confidence += 0.5;
    return confidence;
};
```

3. The gesture will automatically appear in the reference grid and detection loop.

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome 90+ | ✅ Full support |
| Edge 90+ | ✅ Full support |
| Firefox 90+ | ⚠️ Partial (MediaPipe WASM may have issues) |
| Safari 15+ | ⚠️ Partial (WebGPU availability varies) |

## Technical Details

- **Hand Tracking:** MediaPipe Tasks Vision HandLandmarker (float16 model)
- **Classification:** Geometric rule-based analysis of 21 hand landmarks
- **Features extracted:** Finger extension states, curl angles, inter-finger distances, palm orientation
- **Stabilization:** Rolling window (8 frames) with confidence-weighted majority voting
- **Performance:** GPU-accelerated WASM, ~30 FPS on modern hardware

## License

MIT License — Free to use, modify, and distribute.
