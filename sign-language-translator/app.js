/**
 * app.js — Main Application Controller for SignSpeak
 * Supports extended gesture recognition: Letters, Numbers, Words, Phrases
 */

import { HandTracker } from './hand-tracker.js';
import { GestureClassifier } from './gesture-classifier.js';

// ─── DOM References ───
const DOM = {
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingProgressBar: document.getElementById('loading-progress-bar'),
    errorModal: document.getElementById('error-modal'),
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message'),
    errorRetryBtn: document.getElementById('error-retry-btn'),
    webcam: document.getElementById('webcam'),
    overlayCanvas: document.getElementById('overlay-canvas'),
    cameraContainer: document.getElementById('camera-container'),
    cameraPlaceholder: document.getElementById('camera-placeholder'),
    detectionIndicator: document.getElementById('detection-indicator'),
    toggleCameraBtn: document.getElementById('toggle-camera-btn'),
    cameraBtnIcon: document.getElementById('camera-btn-icon'),
    cameraBtnText: document.getElementById('camera-btn-text'),
    clearTextBtn: document.getElementById('clear-text-btn'),
    backspaceBtn: document.getElementById('backspace-btn'),
    spaceBtn: document.getElementById('space-btn'),
    speakBtn: document.getElementById('speak-btn'),
    statusBadge: document.getElementById('status-badge'),
    fpsValue: document.getElementById('fps-value'),
    fpsDot: document.querySelector('.fps-dot'),
    detectedLetter: document.getElementById('detected-letter'),
    detectedEmoji: document.getElementById('detected-emoji'),
    letterGlow: document.getElementById('letter-glow'),
    handLabel: document.getElementById('hand-label'),
    categoryBadge: document.getElementById('category-badge'),
    confidenceValue: document.getElementById('confidence-value'),
    confidenceBarFill: document.getElementById('confidence-bar-fill'),
    topResults: document.getElementById('top-results'),
    sentenceText: document.getElementById('sentence-text'),
    letterCount: document.getElementById('letter-count'),
    sentenceDisplay: document.getElementById('sentence-display'),
    referenceGrid: document.getElementById('reference-grid'),
    guideContent: document.getElementById('guide-content'),
    toggleGuideBtn: document.getElementById('toggle-guide-btn'),
    categoryTabs: document.getElementById('category-tabs'),
};

// ─── State ───
const state = {
    cameraActive: false,
    stream: null,
    animFrameId: null,
    sentence: '',
    lastCommitted: null,
    commitDelay: 1200,
    holdStart: 0,
    currentStable: null,
    frameCount: 0,
    lastFpsUpdate: 0,
    guideVisible: false,
    guideCat: 'all',
};

const tracker = new HandTracker();
const classifier = new GestureClassifier();
let canvasCtx;

// ─── Init ───
async function init() {
    canvasCtx = DOM.overlayCanvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    buildReferenceGrid('all');
    bindEvents();

    tracker.onProgress = (pct) => { DOM.loadingProgressBar.style.width = `${pct}%`; };
    tracker.onReady = () => setStatus('ready', 'Ready');
    tracker.onError = (e) => showError('Model Loading Failed', e.message);

    try {
        await tracker.initialize();
        setTimeout(() => DOM.loadingOverlay.classList.add('hidden'), 500);
    } catch (e) {
        DOM.loadingOverlay.classList.add('hidden');
        showError('Initialization Error', e.message);
    }
}

function resizeCanvas() {
    const r = DOM.cameraContainer.getBoundingClientRect();
    DOM.overlayCanvas.width = r.width;
    DOM.overlayCanvas.height = r.height;
}

// ─── Camera ───
async function startCamera() {
    try {
        state.stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 30 } },
        });
        DOM.webcam.srcObject = state.stream;
        await new Promise(r => { DOM.webcam.onloadedmetadata = () => { DOM.webcam.play(); r(); }; });
        state.cameraActive = true;
        DOM.cameraPlaceholder.classList.add('hidden');
        resizeCanvas();
        updateCameraButton(true);
        setStatus('active', 'Live');
        startLoop();
    } catch (err) {
        if (err.name === 'NotAllowedError') showError('Camera Access Denied', 'Please allow camera access in browser settings.');
        else if (err.name === 'NotFoundError') showError('No Camera Found', 'Connect a webcam and try again.');
        else showError('Camera Error', err.message);
    }
}

function stopCamera() {
    state.cameraActive = false;
    if (state.animFrameId) { cancelAnimationFrame(state.animFrameId); state.animFrameId = null; }
    if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
    DOM.webcam.srcObject = null;
    DOM.cameraPlaceholder.classList.remove('hidden');
    DOM.detectionIndicator.classList.add('hidden');
    if (canvasCtx) canvasCtx.clearRect(0, 0, DOM.overlayCanvas.width, DOM.overlayCanvas.height);
    updateCameraButton(false);
    setStatus('ready', 'Ready');
    updateDetection(null, 0, '—', null, '', []);
    DOM.fpsDot.classList.remove('active');
    DOM.fpsValue.textContent = '0';
    classifier.reset();
    state.currentStable = null;
}

function toggleCamera() { state.cameraActive ? stopCamera() : startCamera(); }

// ─── Detection Loop ───
function startLoop() {
    DOM.fpsDot.classList.add('active');
    state.lastFpsUpdate = performance.now();
    state.frameCount = 0;

    function loop() {
        if (!state.cameraActive) return;
        state.frameCount++;
        const now = performance.now();
        if (now - state.lastFpsUpdate >= 1000) {
            DOM.fpsValue.textContent = state.frameCount;
            state.frameCount = 0;
            state.lastFpsUpdate = now;
        }

        const results = tracker.detect(DOM.webcam);
        if (results) {
            if (DOM.overlayCanvas.width !== DOM.cameraContainer.clientWidth) resizeCanvas();
            tracker.drawResults(canvasCtx, results, DOM.overlayCanvas.width, DOM.overlayCanvas.height);

            if (results.landmarks && results.landmarks.length > 0) {
                DOM.detectionIndicator.classList.remove('hidden');
                const landmarks = results.landmarks[0];
                const handedness = results.handednesses?.[0]?.[0]?.categoryName || 'Unknown';
                const pred = classifier.classify(landmarks);

                updateDetection(pred.name, pred.confidence, handedness, pred.category, pred.emoji, pred.topResults || []);
                handleCommit(pred.name, pred.confidence, pred.category);
                highlightRef(pred.raw);
            } else {
                DOM.detectionIndicator.classList.add('hidden');
                updateDetection(null, 0, '—', null, '', []);
                state.currentStable = null;
                state.holdStart = 0;
            }
        }
        state.animFrameId = requestAnimationFrame(loop);
    }
    state.animFrameId = requestAnimationFrame(loop);
}

// ─── Sentence Building ───
function handleCommit(name, confidence, category) {
    const now = Date.now();
    if (!name || confidence <= 0.45) {
        state.currentStable = null;
        state.holdStart = 0;
        return;
    }
    if (name === state.currentStable) {
        if (now - state.holdStart >= state.commitDelay && name !== state.lastCommitted) {
            // For words/phrases, add with space; for letters/numbers, concatenate
            if (category === 'word' || category === 'phrase') {
                if (state.sentence.length > 0 && !state.sentence.endsWith(' ')) state.sentence += ' ';
                state.sentence += name;
                state.sentence += ' ';
            } else {
                state.sentence += name;
            }
            state.lastCommitted = name;
            state.holdStart = now;
            updateSentence();
        }
    } else {
        state.currentStable = name;
        state.holdStart = now;
    }
}

function addSpace() {
    if (state.sentence.length > 0 && !state.sentence.endsWith(' ')) {
        state.sentence += ' ';
        state.lastCommitted = null;
        updateSentence();
    }
}
function backspace() {
    if (state.sentence.length > 0) {
        // If last committed was a word, remove the whole word
        const trimmed = state.sentence.trimEnd();
        const lastSpace = trimmed.lastIndexOf(' ');
        const lastPart = trimmed.slice(lastSpace + 1);
        if (lastPart.length > 1) {
            // Remove the whole word
            state.sentence = lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : '';
        } else {
            state.sentence = state.sentence.slice(0, -1);
        }
        state.lastCommitted = null;
        updateSentence();
    }
}
function clearSentence() {
    state.sentence = '';
    state.lastCommitted = null;
    state.currentStable = null;
    updateSentence();
}

// ─── UI Updates ───
function updateDetection(name, confidence, handedness, category, emoji, topResults) {
    const display = name || '?';
    if (DOM.detectedLetter.textContent !== display) {
        DOM.detectedLetter.textContent = display;
        DOM.detectedLetter.style.fontSize = display.length > 3 ? '2.5rem' : display.length > 1 ? '3.5rem' : '5.5rem';
        if (name) {
            DOM.detectedLetter.classList.remove('pop');
            void DOM.detectedLetter.offsetWidth;
            DOM.detectedLetter.classList.add('pop');
        }
    }

    DOM.detectedEmoji.textContent = emoji || '';
    DOM.letterGlow.classList.toggle('active', !!(name && confidence > 0.4));

    // Category badge
    if (category) {
        DOM.categoryBadge.textContent = category;
        DOM.categoryBadge.setAttribute('data-cat', category);
    } else {
        DOM.categoryBadge.textContent = '—';
        DOM.categoryBadge.removeAttribute('data-cat');
    }

    // Confidence
    const pct = Math.round(confidence * 100);
    DOM.confidenceValue.textContent = `${pct}%`;
    DOM.confidenceBarFill.style.width = `${pct}%`;
    DOM.confidenceBarFill.classList.remove('low', 'medium', 'high');
    DOM.confidenceBarFill.classList.add(pct < 40 ? 'low' : pct < 70 ? 'medium' : 'high');

    DOM.handLabel.textContent = handedness;

    // Top results
    DOM.topResults.innerHTML = '';
    const top = (topResults || []).filter(r => r.score > 0.25).slice(0, 4);
    for (const r of top) {
        const el = document.createElement('span');
        el.className = 'top-result-item';
        el.innerHTML = `${r.emoji || ''} ${r.name} <span class="top-result-score">${Math.round(r.score * 100)}%</span>`;
        DOM.topResults.appendChild(el);
    }
}

function updateSentence() {
    DOM.sentenceText.textContent = state.sentence;
    DOM.letterCount.textContent = `${state.sentence.length} chars`;
    DOM.sentenceDisplay.scrollTop = DOM.sentenceDisplay.scrollHeight;
}

function updateCameraButton(active) {
    DOM.cameraBtnIcon.textContent = active ? '⏹' : '▶';
    DOM.cameraBtnText.textContent = active ? 'Stop Camera' : 'Start Camera';
    DOM.toggleCameraBtn.classList.toggle('recording', active);
}

function setStatus(type, text) {
    DOM.statusBadge.textContent = text;
    DOM.statusBadge.classList.remove('active', 'ready');
    if (type === 'active') DOM.statusBadge.classList.add('active');
    if (type === 'ready') DOM.statusBadge.classList.add('ready');
}

function showError(title, msg) {
    DOM.errorTitle.textContent = title;
    DOM.errorMessage.textContent = msg;
    DOM.errorModal.classList.remove('hidden');
}

// ─── Text-to-Speech ───
function speakSentence() {
    if (!state.sentence.trim() || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(state.sentence.trim());
    u.rate = 0.9;
    const voices = speechSynthesis.getVoices();
    const en = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
    if (en) u.voice = en;
    speechSynthesis.speak(u);
}

// ─── Reference Grid ───
function buildReferenceGrid(cat) {
    const gestures = classifier.getGestures();
    DOM.referenceGrid.innerHTML = '';
    for (const g of gestures) {
        if (cat !== 'all' && g.cat !== cat) continue;
        const el = document.createElement('div');
        el.className = 'ref-letter' + (g.name.length > 2 ? ' wide' : '');
        el.id = `ref-${g.name}`;
        el.title = `${g.cat}: ${g.name}`;
        el.innerHTML = `<span class="ref-emoji">${g.emoji}</span>${g.name}`;
        DOM.referenceGrid.appendChild(el);
    }
}

let lastHighlighted = null;
function highlightRef(name) {
    if (lastHighlighted) {
        const prev = document.getElementById(`ref-${lastHighlighted}`);
        if (prev) prev.classList.remove('highlighted');
    }
    if (name) {
        const el = document.getElementById(`ref-${name}`);
        if (el) el.classList.add('highlighted');
    }
    lastHighlighted = name;
}

// ─── Events ───
function bindEvents() {
    DOM.toggleCameraBtn.addEventListener('click', toggleCamera);
    DOM.clearTextBtn.addEventListener('click', clearSentence);
    DOM.backspaceBtn.addEventListener('click', backspace);
    DOM.spaceBtn.addEventListener('click', addSpace);
    DOM.speakBtn.addEventListener('click', speakSentence);
    DOM.errorRetryBtn.addEventListener('click', () => { DOM.errorModal.classList.add('hidden'); startCamera(); });

    DOM.toggleGuideBtn.addEventListener('click', () => {
        state.guideVisible = !state.guideVisible;
        DOM.guideContent.classList.toggle('hidden', !state.guideVisible);
        DOM.toggleGuideBtn.textContent = state.guideVisible ? 'Hide' : 'Show';
    });

    // Category tabs
    DOM.categoryTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.cat-tab');
        if (!tab) return;
        const cat = tab.dataset.cat;
        state.guideCat = cat;
        DOM.categoryTabs.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        buildReferenceGrid(cat);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        switch (e.code) {
            case 'Space': e.preventDefault(); e.shiftKey ? addSpace() : toggleCamera(); break;
            case 'Backspace': e.preventDefault(); backspace(); break;
            case 'Escape': e.preventDefault(); clearSentence(); break;
            case 'Enter': e.preventDefault(); speakSentence(); break;
        }
    });

    if ('speechSynthesis' in window) {
        speechSynthesis.getVoices();
        speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
}

init();
