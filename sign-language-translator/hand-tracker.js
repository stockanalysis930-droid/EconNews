/**
 * hand-tracker.js
 * ================
 * MediaPipe HandLandmarker Wrapper
 *
 * Initializes and manages the MediaPipe Hand Landmarker for real-time
 * hand detection in video frames. Provides landmark drawing utilities
 * for canvas overlay rendering.
 */

import {
    FilesetResolver,
    HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs';

// ─── Hand Landmark Connections for drawing skeleton ───
const HAND_CONNECTIONS = [
    // Thumb
    [0, 1], [1, 2], [2, 3], [3, 4],
    // Index
    [0, 5], [5, 6], [6, 7], [7, 8],
    // Middle
    [0, 9], [9, 10], [10, 11], [11, 12],
    // Ring
    [0, 13], [13, 14], [14, 15], [15, 16],
    // Pinky
    [0, 17], [17, 18], [18, 19], [19, 20],
    // Palm connections
    [5, 9], [9, 13], [13, 17],
];

// ─── Landmark colors ───
const LANDMARK_COLORS = {
    thumb: '#f59e0b',    // Amber
    index: '#06b6d4',    // Cyan
    middle: '#8b5cf6',   // Purple
    ring: '#10b981',     // Emerald
    pinky: '#ef4444',    // Red
    wrist: '#ffffff',    // White
};

function getLandmarkColor(index) {
    if (index === 0) return LANDMARK_COLORS.wrist;
    if (index <= 4) return LANDMARK_COLORS.thumb;
    if (index <= 8) return LANDMARK_COLORS.index;
    if (index <= 12) return LANDMARK_COLORS.middle;
    if (index <= 16) return LANDMARK_COLORS.ring;
    return LANDMARK_COLORS.pinky;
}

// ─── Model configuration ───
const MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const WASM_URL =
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';

export class HandTracker {
    constructor() {
        this.handLandmarker = null;
        this.isReady = false;
        this.lastVideoTime = -1;

        // Callbacks
        this.onReady = null;
        this.onResults = null;
        this.onError = null;
        this.onProgress = null;
    }

    /**
     * Initialize the MediaPipe HandLandmarker
     */
    async initialize() {
        try {
            this._reportProgress(10, 'Loading WASM runtime…');

            // Initialize FilesetResolver for WASM
            const vision = await FilesetResolver.forVisionTasks(WASM_URL);

            this._reportProgress(50, 'Loading hand detection model…');

            // Create HandLandmarker
            this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: MODEL_URL,
                    delegate: 'GPU', // Use GPU acceleration if available
                },
                runningMode: 'VIDEO',
                numHands: 2,
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            this._reportProgress(100, 'Ready!');
            this.isReady = true;

            if (this.onReady) this.onReady();
        } catch (error) {
            console.error('HandTracker initialization failed:', error);
            if (this.onError) this.onError(error);
            throw error;
        }
    }

    /**
     * Detect hand landmarks in a video frame
     * @param {HTMLVideoElement} video - The video element to analyze
     * @returns {Object|null} Detection results
     */
    detect(video) {
        if (!this.isReady || !this.handLandmarker) return null;
        if (!video || video.readyState < 2) return null;

        const now = performance.now();

        // Skip if same frame
        if (video.currentTime === this.lastVideoTime) return null;
        this.lastVideoTime = video.currentTime;

        try {
            const results = this.handLandmarker.detectForVideo(video, now);
            return results;
        } catch (error) {
            console.warn('Detection error:', error);
            return null;
        }
    }

    /**
     * Draw hand landmarks and connections on a canvas
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} results - MediaPipe detection results
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     */
    drawResults(ctx, results, width, height) {
        ctx.clearRect(0, 0, width, height);

        if (!results || !results.landmarks || results.landmarks.length === 0) return;

        for (let handIdx = 0; handIdx < results.landmarks.length; handIdx++) {
            const landmarks = results.landmarks[handIdx];
            const handedness = results.handednesses?.[handIdx]?.[0]?.categoryName || 'Unknown';

            // Draw connections (bones)
            this._drawConnections(ctx, landmarks, width, height, handIdx);

            // Draw landmarks (joints)
            this._drawLandmarks(ctx, landmarks, width, height, handIdx);

            // Draw handedness label
            this._drawLabel(ctx, landmarks, width, height, handedness);
        }
    }

    _drawConnections(ctx, landmarks, width, height, handIdx) {
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        for (const [start, end] of HAND_CONNECTIONS) {
            const startPt = landmarks[start];
            const endPt = landmarks[end];

            // Gradient between landmark colors
            const startColor = getLandmarkColor(start);
            const endColor = getLandmarkColor(end);

            const x1 = startPt.x * width;
            const y1 = startPt.y * height;
            const x2 = endPt.x * width;
            const y2 = endPt.y * height;

            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
            gradient.addColorStop(0, startColor + 'AA');
            gradient.addColorStop(1, endColor + 'AA');

            ctx.strokeStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }

    _drawLandmarks(ctx, landmarks, width, height, handIdx) {
        for (let i = 0; i < landmarks.length; i++) {
            const lm = landmarks[i];
            const x = lm.x * width;
            const y = lm.y * height;
            const color = getLandmarkColor(i);

            // Outer glow
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = color + '40';
            ctx.fill();

            // Inner dot
            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

            // White center for fingertips (4, 8, 12, 16, 20)
            if (i % 4 === 0 && i > 0) {
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }
        }
    }

    _drawLabel(ctx, landmarks, width, height, handedness) {
        const wrist = landmarks[0];
        const x = wrist.x * width;
        const y = wrist.y * height + 25;

        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillStyle = 'rgba(6, 182, 212, 0.9)';
        ctx.textAlign = 'center';
        ctx.fillText(handedness, x, y);
    }

    _reportProgress(percent, message) {
        if (this.onProgress) {
            this.onProgress(percent, message);
        }
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.handLandmarker) {
            this.handLandmarker.close();
            this.handLandmarker = null;
        }
        this.isReady = false;
    }
}
