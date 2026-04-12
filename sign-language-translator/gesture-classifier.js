/**
 * gesture-classifier.js — Extended ASL Gesture Classification Engine
 * Supports: Letters A–Z, Numbers 0–9, Common Words & Phrases
 * Features: Motion tracking, two-hand detection, category system
 */

const WRIST = 0;
const THUMB = { CMC: 1, MCP: 2, IP: 3, TIP: 4 };
const INDEX = { MCP: 5, PIP: 6, DIP: 7, TIP: 8 };
const MIDDLE = { MCP: 9, PIP: 10, DIP: 11, TIP: 12 };
const RING = { MCP: 13, PIP: 14, DIP: 15, TIP: 16 };
const PINKY = { MCP: 17, PIP: 18, DIP: 19, TIP: 20 };

// ─── Vector Math ───
function vec(a, b) { return { x: b.x - a.x, y: b.y - a.y, z: (b.z||0) - (a.z||0) }; }
function magnitude(v) { return Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z); }
function dot(a, b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
function dist(a, b) { return magnitude(vec(a, b)); }
function angleDeg(a, b) {
    const d = dot(a, b), m = magnitude(a) * magnitude(b);
    if (m === 0) return 0;
    return (Math.acos(Math.max(-1, Math.min(1, d / m))) * 180) / Math.PI;
}

// ─── Feature Extraction ───
function extractFeatures(lm) {
    const handScale = dist(lm[WRIST], lm[MIDDLE.MCP]) || 0.001;
    const fingers = {
        thumb: isThumbExtended(lm), index: isFingerExtended(lm, INDEX),
        middle: isFingerExtended(lm, MIDDLE), ring: isFingerExtended(lm, RING),
        pinky: isFingerExtended(lm, PINKY),
    };
    const curls = {
        thumb: getThumbCurl(lm), index: getFingerCurl(lm, INDEX),
        middle: getFingerCurl(lm, MIDDLE), ring: getFingerCurl(lm, RING),
        pinky: getFingerCurl(lm, PINKY),
    };
    const td = {
        thumbToIndex: dist(lm[THUMB.TIP], lm[INDEX.TIP]) / handScale,
        thumbToMiddle: dist(lm[THUMB.TIP], lm[MIDDLE.TIP]) / handScale,
        thumbToRing: dist(lm[THUMB.TIP], lm[RING.TIP]) / handScale,
        thumbToPinky: dist(lm[THUMB.TIP], lm[PINKY.TIP]) / handScale,
        indexToMiddle: dist(lm[INDEX.TIP], lm[MIDDLE.TIP]) / handScale,
        middleToRing: dist(lm[MIDDLE.TIP], lm[RING.TIP]) / handScale,
        ringToPinky: dist(lm[RING.TIP], lm[PINKY.TIP]) / handScale,
        indexToPinky: dist(lm[INDEX.TIP], lm[PINKY.TIP]) / handScale,
    };
    const touchingThumb = {
        index: td.thumbToIndex < 0.35, middle: td.thumbToMiddle < 0.35,
        ring: td.thumbToRing < 0.35, pinky: td.thumbToPinky < 0.35,
    };
    const palmZ = (lm[INDEX.MCP].z + lm[MIDDLE.MCP].z + lm[RING.MCP].z + lm[PINKY.MCP].z) / 4;
    const palmFacing = palmZ < -0.03 ? 'toward' : palmZ > 0.03 ? 'away' : 'neutral';
    const indexDir = getFingerDirection(lm, INDEX);
    const thumbDir = getFingerDirection(lm, THUMB);
    const thumbTipAboveIndexPIP = lm[THUMB.TIP].y < lm[INDEX.PIP].y;
    const wristPos = { x: lm[WRIST].x, y: lm[WRIST].y };
    const palmCenter = {
        x: (lm[WRIST].x + lm[MIDDLE.MCP].x) / 2,
        y: (lm[WRIST].y + lm[MIDDLE.MCP].y) / 2,
    };
    // Count extended fingers
    const extCount = [fingers.thumb, fingers.index, fingers.middle, fingers.ring, fingers.pinky]
        .filter(Boolean).length;

    return { fingers, curls, tipDistances: td, touchingThumb, palmFacing,
        indexDirection: indexDir, thumbDirection: thumbDir, thumbTipAboveIndexPIP,
        handScale, lm, wristPos, palmCenter, extCount };
}

function isFingerExtended(lm, f) {
    const curl = getFingerCurl(lm, f);
    return dist(lm[f.TIP], lm[WRIST]) > dist(lm[f.PIP], lm[WRIST]) * 0.9 && curl < 0.6;
}
function isThumbExtended(lm) {
    const curl = getThumbCurl(lm);
    return dist(lm[THUMB.TIP], lm[WRIST]) > dist(lm[THUMB.IP], lm[WRIST]) * 0.85 && curl < 0.55;
}
function getFingerCurl(lm, f) {
    const angle = angleDeg(vec(lm[f.PIP], lm[f.MCP]), vec(lm[f.PIP], lm[f.DIP]));
    return Math.max(0, Math.min(1, (180 - angle) / 120));
}
function getThumbCurl(lm) {
    const angle = angleDeg(vec(lm[THUMB.IP], lm[THUMB.MCP]), vec(lm[THUMB.IP], lm[THUMB.TIP]));
    return Math.max(0, Math.min(1, (180 - angle) / 120));
}
function getFingerDirection(lm, f) {
    const tip = f.TIP || f.TIP;
    const base = f.MCP || f.MCP;
    const v = vec(lm[base], lm[tip]);
    return Math.abs(v.y) > Math.abs(v.x) ? (v.y < 0 ? 'up' : 'down') : (v.x < 0 ? 'left' : 'right');
}

// ─── Gesture Definitions with Categories ───
// { name, category, emoji, scorer(features) → confidence }

const GESTURE_DEFS = [
    // ══════ LETTERS A–Z ══════
    { name: 'A', cat: 'letter', emoji: '🅰️', fn: f => {
        let c = 0;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.5;
        if (f.fingers.thumb || f.thumbTipAboveIndexPIP) c += 0.3;
        if (f.tipDistances.thumbToIndex > 0.3) c += 0.2;
        return c;
    }},
    { name: 'B', cat: 'letter', emoji: '🅱️', fn: f => {
        let c = 0;
        if (f.fingers.index && f.fingers.middle && f.fingers.ring && f.fingers.pinky) c += 0.45;
        if (f.curls.thumb > 0.3) c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.35 && f.tipDistances.middleToRing < 0.35 && f.tipDistances.ringToPinky < 0.35) c += 0.35;
        return c;
    }},
    { name: 'C', cat: 'letter', emoji: '©️', fn: f => {
        let c = 0;
        if (f.curls.index > 0.2 && f.curls.index < 0.7) c += 0.25;
        if (f.curls.middle > 0.2 && f.curls.middle < 0.7) c += 0.2;
        if (f.curls.thumb < 0.5) c += 0.25;
        if (f.tipDistances.thumbToIndex > 0.4 && f.tipDistances.thumbToIndex < 1.2) c += 0.3;
        return c;
    }},
    { name: 'D', cat: 'letter', emoji: '🇩', fn: f => {
        let c = 0;
        if (f.fingers.index && f.curls.index < 0.3) c += 0.4;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.35;
        if (f.tipDistances.thumbToMiddle < 0.45) c += 0.25;
        return c;
    }},
    { name: 'E', cat: 'letter', emoji: '🇪', fn: f => {
        let c = 0;
        if (f.curls.index > 0.5 && f.curls.middle > 0.5 && f.curls.ring > 0.5 && f.curls.pinky > 0.5) c += 0.45;
        if (f.curls.thumb > 0.3) c += 0.25;
        if (f.tipDistances.thumbToIndex < 0.5) c += 0.3;
        return c;
    }},
    { name: 'F', cat: 'letter', emoji: '🇫', fn: f => {
        let c = 0;
        if (f.tipDistances.thumbToIndex < 0.3) c += 0.45;
        if (f.fingers.middle && f.fingers.ring && f.fingers.pinky) c += 0.4;
        if (f.curls.index > 0.3) c += 0.15;
        return c;
    }},
    { name: 'G', cat: 'letter', emoji: '🇬', fn: f => {
        let c = 0;
        if (f.fingers.index && (f.indexDirection === 'left' || f.indexDirection === 'right')) c += 0.35;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.3;
        if (f.fingers.thumb) c += 0.2;
        if (f.tipDistances.thumbToIndex < 0.6) c += 0.15;
        return c;
    }},
    { name: 'H', cat: 'letter', emoji: '🇭', fn: f => {
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.35;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.3;
        if (f.indexDirection === 'left' || f.indexDirection === 'right') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.35) c += 0.15;
        return c;
    }},
    { name: 'I', cat: 'letter', emoji: '🇮', fn: f => {
        let c = 0;
        if (f.fingers.pinky && !f.fingers.index && !f.fingers.middle && !f.fingers.ring) c += 0.65;
        if (f.curls.thumb > 0.2) c += 0.2;
        if (f.curls.index > 0.5) c += 0.15;
        return c;
    }},
    { name: 'J', cat: 'letter', emoji: '🇯', fn: f => {
        let c = 0;
        if (f.fingers.pinky && !f.fingers.index && !f.fingers.middle && !f.fingers.ring) c += 0.3;
        return c * 0.5;
    }},
    { name: 'K', cat: 'letter', emoji: '🇰', fn: f => {
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.35) c += 0.25;
        if (f.lm[THUMB.TIP].y < f.lm[MIDDLE.MCP].y) c += 0.2;
        return c;
    }},
    { name: 'L', cat: 'letter', emoji: '🇱', fn: f => {
        let c = 0;
        if (f.fingers.thumb && f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.3;
        if (f.tipDistances.thumbToIndex > 0.7) c += 0.2;
        if (f.indexDirection === 'up') c += 0.2;
        return c;
    }},
    { name: 'M', cat: 'letter', emoji: '🇲', fn: f => {
        let c = 0;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.5;
        if (f.curls.thumb > 0.3 && f.lm[THUMB.TIP].y > f.lm[RING.PIP].y) c += 0.3;
        if (f.tipDistances.thumbToRing < 0.4) c += 0.2;
        return c;
    }},
    { name: 'N', cat: 'letter', emoji: '🇳', fn: f => {
        let c = 0;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.5;
        if (f.curls.thumb > 0.3 && f.tipDistances.thumbToMiddle < 0.45) c += 0.3;
        if (f.tipDistances.thumbToRing > 0.3) c += 0.2;
        return c;
    }},
    { name: 'O', cat: 'letter', emoji: '🇴', fn: f => {
        let c = 0;
        if (f.curls.index > 0.25 && f.curls.middle > 0.25 && f.curls.ring > 0.25 && f.curls.pinky > 0.25) c += 0.3;
        if (f.tipDistances.thumbToIndex < 0.4) c += 0.35;
        if (f.tipDistances.thumbToMiddle < 0.5) c += 0.2;
        if (f.curls.thumb < 0.6) c += 0.15;
        return c;
    }},
    { name: 'P', cat: 'letter', emoji: '🇵', fn: f => {
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (f.indexDirection === 'down') c += 0.35;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.fingers.thumb) c += 0.15;
        return c;
    }},
    { name: 'Q', cat: 'letter', emoji: '🇶', fn: f => {
        let c = 0;
        if (f.fingers.index) c += 0.3;
        if (f.indexDirection === 'down') c += 0.35;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.fingers.thumb) c += 0.15;
        return c;
    }},
    { name: 'R', cat: 'letter', emoji: '🇷', fn: f => {
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.tipDistances.indexToMiddle < 0.2) c += 0.35;
        if (f.curls.thumb > 0.2) c += 0.1;
        return c;
    }},
    { name: 'S', cat: 'letter', emoji: '🇸', fn: f => {
        let c = 0;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.5;
        if (f.curls.thumb > 0.2 && f.lm[THUMB.TIP].y < f.lm[INDEX.PIP].y) c += 0.3;
        if (f.tipDistances.thumbToIndex < 0.5) c += 0.2;
        return c;
    }},
    { name: 'T', cat: 'letter', emoji: '🇹', fn: f => {
        let c = 0;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.5;
        if (f.tipDistances.thumbToIndex < 0.4 && f.tipDistances.thumbToMiddle < 0.5) c += 0.3;
        if (f.curls.thumb < 0.6) c += 0.2;
        return c;
    }},
    { name: 'U', cat: 'letter', emoji: '🇺', fn: f => {
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.35;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.25;
        if (f.indexDirection === 'up') c += 0.15;
        return c;
    }},
    { name: 'V', cat: 'letter', emoji: '✌️', fn: f => {
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.35;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.3) c += 0.25;
        if (f.indexDirection === 'up') c += 0.15;
        return c;
    }},
    { name: 'W', cat: 'letter', emoji: '🇼', fn: f => {
        let c = 0;
        if (f.fingers.index && f.fingers.middle && f.fingers.ring) c += 0.4;
        if (!f.fingers.pinky) c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.2 && f.tipDistances.middleToRing > 0.2) c += 0.2;
        if (f.curls.thumb > 0.2) c += 0.15;
        return c;
    }},
    { name: 'X', cat: 'letter', emoji: '🇽', fn: f => {
        let c = 0;
        if (f.curls.index > 0.3 && f.curls.index < 0.75) c += 0.4;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.3;
        if (!f.fingers.index) c += 0.15;
        if (f.curls.thumb > 0.2) c += 0.15;
        return c;
    }},
    { name: 'Y', cat: 'letter', emoji: '🤙', fn: f => {
        let c = 0;
        if (f.fingers.thumb && f.fingers.pinky) c += 0.45;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring) c += 0.35;
        if (f.tipDistances.thumbToPinky > 0.8) c += 0.2;
        return c;
    }},
    { name: 'Z', cat: 'letter', emoji: '🇿', fn: f => {
        let c = 0;
        if (f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.35;
        return c * 0.4;
    }},

    // ══════ NUMBERS 0–9 ══════
    { name: '0', cat: 'number', emoji: '0️⃣', fn: f => {
        // Same as O — circle shape
        let c = 0;
        if (f.curls.index > 0.25 && f.curls.middle > 0.25) c += 0.3;
        if (f.tipDistances.thumbToIndex < 0.35) c += 0.4;
        if (f.curls.thumb < 0.5) c += 0.15;
        if (f.tipDistances.thumbToMiddle < 0.5) c += 0.15;
        return c;
    }},
    { name: '1', cat: 'number', emoji: '1️⃣', fn: f => {
        let c = 0;
        if (f.fingers.index) c += 0.4;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.35;
        if (!f.fingers.thumb) c += 0.1;
        if (f.indexDirection === 'up') c += 0.15;
        return c;
    }},
    { name: '2', cat: 'number', emoji: '2️⃣', fn: f => {
        // Same as V
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.35;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.3) c += 0.25;
        if (f.indexDirection === 'up') c += 0.15;
        return c;
    }},
    { name: '3', cat: 'number', emoji: '3️⃣', fn: f => {
        // Thumb + index + middle extended
        let c = 0;
        if (f.fingers.thumb && f.fingers.index && f.fingers.middle) c += 0.45;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.35;
        if (f.tipDistances.indexToMiddle > 0.2) c += 0.2;
        return c;
    }},
    { name: '4', cat: 'number', emoji: '4️⃣', fn: f => {
        // Four fingers up, thumb tucked (same as B but spread)
        let c = 0;
        if (f.fingers.index && f.fingers.middle && f.fingers.ring && f.fingers.pinky) c += 0.4;
        if (!f.fingers.thumb || f.curls.thumb > 0.3) c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.15) c += 0.2;
        if (f.indexDirection === 'up') c += 0.15;
        return c;
    }},
    { name: '5', cat: 'number', emoji: '5️⃣', fn: f => {
        // All five fingers spread
        let c = 0;
        if (f.extCount === 5) c += 0.5;
        if (f.tipDistances.indexToMiddle > 0.2 && f.tipDistances.ringToPinky > 0.15) c += 0.3;
        if (f.indexDirection === 'up') c += 0.2;
        return c;
    }},
    { name: '6', cat: 'number', emoji: '6️⃣', fn: f => {
        // Thumb touches pinky, middle three up
        let c = 0;
        if (f.touchingThumb.pinky) c += 0.4;
        if (f.fingers.index && f.fingers.middle && f.fingers.ring) c += 0.35;
        if (!f.fingers.pinky || f.curls.pinky > 0.3) c += 0.15;
        return c * 0.9;
    }},
    { name: '7', cat: 'number', emoji: '7️⃣', fn: f => {
        // Thumb touches ring, index+middle+pinky up
        let c = 0;
        if (f.touchingThumb.ring) c += 0.4;
        if (f.fingers.index && f.fingers.middle && f.fingers.pinky) c += 0.35;
        if (!f.fingers.ring || f.curls.ring > 0.3) c += 0.15;
        return c * 0.9;
    }},
    { name: '8', cat: 'number', emoji: '8️⃣', fn: f => {
        // Thumb touches middle, index+ring+pinky up
        let c = 0;
        if (f.touchingThumb.middle) c += 0.4;
        if (f.fingers.index && f.fingers.ring && f.fingers.pinky) c += 0.35;
        if (!f.fingers.middle || f.curls.middle > 0.3) c += 0.15;
        return c * 0.9;
    }},
    { name: '9', cat: 'number', emoji: '9️⃣', fn: f => {
        // Thumb touches index (like F), others up
        let c = 0;
        if (f.touchingThumb.index) c += 0.4;
        if (f.fingers.middle && f.fingers.ring && f.fingers.pinky) c += 0.35;
        if (f.curls.index > 0.3) c += 0.15;
        return c * 0.9;
    }},

    // ══════ COMMON WORDS & PHRASES ══════
    { name: 'I Love You', cat: 'phrase', emoji: '🤟', fn: f => {
        // Thumb + index + pinky extended, middle + ring curled
        let c = 0;
        if (f.fingers.thumb && f.fingers.index && f.fingers.pinky) c += 0.45;
        if (!f.fingers.middle && !f.fingers.ring) c += 0.4;
        if (f.tipDistances.thumbToPinky > 0.7) c += 0.15;
        return c;
    }},
    { name: 'Yes', cat: 'word', emoji: '👍', fn: f => {
        // Thumbs up — fist with thumb pointing up
        let c = 0;
        if (f.fingers.thumb && f.thumbDirection === 'up') c += 0.4;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.35;
        if (f.curls.index > 0.5 && f.curls.middle > 0.5) c += 0.15;
        if (f.lm[THUMB.TIP].y < f.lm[THUMB.MCP].y) c += 0.1;
        return c;
    }},
    { name: 'No', cat: 'word', emoji: '👎', fn: f => {
        // Thumbs down
        let c = 0;
        if (f.fingers.thumb && f.thumbDirection === 'down') c += 0.4;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.35;
        if (f.curls.index > 0.5) c += 0.15;
        if (f.lm[THUMB.TIP].y > f.lm[THUMB.MCP].y) c += 0.1;
        return c;
    }},
    { name: 'Hello', cat: 'word', emoji: '👋', fn: f => {
        // Open hand, palm forward, all fingers extended and spread
        let c = 0;
        if (f.extCount === 5) c += 0.35;
        if (f.palmFacing === 'toward' || f.palmFacing === 'neutral') c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.2 && f.tipDistances.middleToRing > 0.15) c += 0.2;
        if (f.indexDirection === 'up') c += 0.2;
        return c;
    }},
    { name: 'Stop', cat: 'word', emoji: '✋', fn: f => {
        // Flat open hand, fingers together, palm forward
        let c = 0;
        if (f.extCount === 5) c += 0.3;
        if (f.palmFacing === 'toward') c += 0.3;
        if (f.tipDistances.indexToMiddle < 0.3 && f.tipDistances.middleToRing < 0.3) c += 0.25;
        if (f.indexDirection === 'up') c += 0.15;
        return c;
    }},
    { name: 'Thank You', cat: 'phrase', emoji: '🙏', fn: f => {
        // Flat hand from chin forward — open hand moving away
        let c = 0;
        if (f.extCount >= 4) c += 0.3;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.2;
        if (f.lm[WRIST].y > 0.3 && f.lm[WRIST].y < 0.6) c += 0.15; // Mid-face height
        if (f.curls.thumb < 0.4) c += 0.15;
        return c;
    }},
    { name: 'Please', cat: 'word', emoji: '🤲', fn: f => {
        // Flat hand on chest — open palm, low position
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.lm[WRIST].y > 0.6) c += 0.2; // Lower position (chest)
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.2;
        if (f.curls.thumb < 0.4) c += 0.15;
        return c;
    }},
    { name: 'Good', cat: 'word', emoji: '👌', fn: f => {
        // OK sign — thumb and index form circle
        let c = 0;
        if (f.tipDistances.thumbToIndex < 0.25) c += 0.45;
        if (f.fingers.middle && f.fingers.ring && f.fingers.pinky) c += 0.35;
        if (f.curls.index > 0.3) c += 0.2;
        return c;
    }},
    { name: 'Bad', cat: 'word', emoji: '😞', fn: f => {
        // Open hand from chin, palm down — approximated as flat hand facing away
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'away') c += 0.3;
        if (f.indexDirection === 'down') c += 0.25;
        if (f.curls.thumb < 0.5) c += 0.2;
        return c;
    }},
    { name: 'Help', cat: 'word', emoji: '🆘', fn: f => {
        // Fist on open palm — static: thumbs up on flat hand
        let c = 0;
        if (f.fingers.thumb) c += 0.2;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.3;
        if (f.thumbDirection === 'up') c += 0.25;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.7) c += 0.15;
        return c * 0.7;
    }},
    { name: 'Sorry', cat: 'word', emoji: '😔', fn: f => {
        // Fist circular on chest — static: fist in low center position
        let c = 0;
        if (f.extCount === 0) c += 0.3;
        if (f.curls.thumb > 0.2) c += 0.15;
        if (f.lm[WRIST].y > 0.6) c += 0.25; // Low position
        if (f.palmFacing === 'toward') c += 0.15;
        return c * 0.6;
    }},
    { name: 'More', cat: 'word', emoji: '➕', fn: f => {
        // Both hands: fingertips pinched together and touching
        // Single hand: all fingertips pinched to thumb
        let c = 0;
        if (f.touchingThumb.index && f.touchingThumb.middle) c += 0.4;
        if (f.curls.index > 0.3 && f.curls.middle > 0.3) c += 0.2;
        if (f.tipDistances.thumbToIndex < 0.25 && f.tipDistances.thumbToMiddle < 0.3) c += 0.25;
        if (f.indexDirection === 'up' || f.indexDirection === 'right') c += 0.15;
        return c;
    }},
    { name: 'Eat', cat: 'word', emoji: '🍽️', fn: f => {
        // Pinched fingers to mouth — all tips bunched together
        let c = 0;
        if (f.touchingThumb.index) c += 0.25;
        if (f.curls.index > 0.2 && f.curls.middle > 0.2) c += 0.2;
        if (f.lm[WRIST].y < 0.45) c += 0.25; // High position (near mouth)
        if (f.tipDistances.thumbToIndex < 0.3) c += 0.2;
        return c * 0.75;
    }},
    { name: 'Drink', cat: 'word', emoji: '🥤', fn: f => {
        // C-hand tilted toward mouth
        let c = 0;
        if (f.curls.index > 0.2 && f.curls.index < 0.65) c += 0.25;
        if (f.curls.thumb < 0.5) c += 0.15;
        if (f.tipDistances.thumbToIndex > 0.3 && f.tipDistances.thumbToIndex < 0.9) c += 0.2;
        if (f.lm[WRIST].y < 0.45) c += 0.25; // Near face
        if (f.indexDirection === 'up') c += 0.15;
        return c * 0.75;
    }},
    { name: 'Want', cat: 'word', emoji: '🫴', fn: f => {
        // Open curved hands pulling toward body — curved fingers
        let c = 0;
        if (f.curls.index > 0.15 && f.curls.index < 0.6) c += 0.25;
        if (f.curls.middle > 0.15 && f.curls.middle < 0.6) c += 0.2;
        if (f.fingers.thumb) c += 0.15;
        if (f.palmFacing === 'toward') c += 0.25;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.7) c += 0.15;
        return c * 0.65;
    }},
    { name: 'Wait', cat: 'word', emoji: '⏳', fn: f => {
        // Both hands open, wiggling — static: open spread hands
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.15) c += 0.2;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.curls.thumb < 0.4) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Understand', cat: 'word', emoji: '💡', fn: f => {
        // Index flicks up near temple — index pointing up near head
        let c = 0;
        if (f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.35;
        if (f.indexDirection === 'up') c += 0.2;
        if (f.lm[WRIST].y < 0.35) c += 0.25; // Near head
        if (f.curls.thumb > 0.2) c += 0.1;
        return c * 0.65;
    }},
    { name: 'Peace', cat: 'phrase', emoji: '✌️', fn: f => {
        // V sign — same as letter V
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.35;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.3) c += 0.25;
        if (f.indexDirection === 'up') c += 0.15;
        return c;
    }},
    { name: 'Rock On', cat: 'phrase', emoji: '🤘', fn: f => {
        // Index + pinky extended, middle + ring curled, thumb curled
        let c = 0;
        if (f.fingers.index && f.fingers.pinky) c += 0.4;
        if (!f.fingers.middle && !f.fingers.ring) c += 0.35;
        if (!f.fingers.thumb) c += 0.15;
        if (f.tipDistances.indexToPinky > 0.6) c += 0.1;
        return c;
    }},
    { name: 'Call Me', cat: 'phrase', emoji: '🤙', fn: f => {
        // Thumb + pinky out (same shape as Y)
        let c = 0;
        if (f.fingers.thumb && f.fingers.pinky) c += 0.4;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring) c += 0.35;
        if (f.tipDistances.thumbToPinky > 0.8) c += 0.15;
        // Near ear position (right side, high)
        if (f.lm[WRIST].y < 0.4 && f.lm[WRIST].x > 0.5) c += 0.1;
        return c;
    }},
    { name: 'Point/You', cat: 'word', emoji: '👉', fn: f => {
        // Index pointing forward/sideways
        let c = 0;
        if (f.fingers.index) c += 0.35;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.3;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.2;
        if (f.curls.thumb > 0.3) c += 0.15;
        return c;
    }},
    { name: 'Me/I', cat: 'word', emoji: '👆', fn: f => {
        let c = 0;
        if (f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.lm[WRIST].y > 0.55) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        return c * 0.7;
    }},

    // ══════ GREETINGS & SOCIAL ══════
    { name: 'Goodbye', cat: 'phrase', emoji: '👋', fn: f => {
        // Open hand waving — all fingers extended, palm away
        let c = 0;
        if (f.extCount >= 4) c += 0.3;
        if (f.palmFacing === 'away' || f.palmFacing === 'neutral') c += 0.25;
        if (f.tipDistances.indexToMiddle < 0.35) c += 0.2;
        if (f.indexDirection === 'up') c += 0.15;
        if (f.lm[WRIST].y < 0.5) c += 0.1;
        return c;
    }},
    { name: 'Welcome', cat: 'phrase', emoji: '🤗', fn: f => {
        // Open hand sweeping inward — palm toward, spread fingers
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.2) c += 0.2;
        if (f.lm[WRIST].x > 0.5) c += 0.15;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.15;
        return c * 0.7;
    }},
    { name: 'Nice To Meet You', cat: 'phrase', emoji: '🤝', fn: f => {
        // Index fingers pointing at each other — approximated
        let c = 0;
        if (f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.indexDirection === 'left' || f.indexDirection === 'right') c += 0.2;
        if (f.fingers.thumb) c += 0.1;
        return c * 0.6;
    }},
    { name: 'Excuse Me', cat: 'phrase', emoji: '🙋', fn: f => {
        // Flat hand brushing palm — extended fingers, low position
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.lm[WRIST].y > 0.5 && f.lm[WRIST].y < 0.75) c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.25) c += 0.2;
        return c * 0.6;
    }},
    { name: 'How Are You', cat: 'phrase', emoji: '💬', fn: f => {
        // Both hands thumbs up alternating — static: thumb up mid position
        let c = 0;
        if (f.fingers.thumb && f.thumbDirection === 'up') c += 0.3;
        if (!f.fingers.index && !f.fingers.middle) c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.65) c += 0.2;
        return c * 0.55;
    }},

    // ══════ EMOTIONS ══════
    { name: 'Happy', cat: 'word', emoji: '😊', fn: f => {
        // Flat hand brushing up on chest — open hand, upward near chest
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.indexDirection === 'up') c += 0.2;
        if (f.lm[WRIST].y > 0.45 && f.lm[WRIST].y < 0.7) c += 0.2;
        return c * 0.65;
    }},
    { name: 'Sad', cat: 'word', emoji: '😢', fn: f => {
        // Open hands sliding down face — spread fingers, downward
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.indexDirection === 'down') c += 0.3;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.lm[WRIST].y < 0.5) c += 0.15;
        return c * 0.65;
    }},
    { name: 'Angry', cat: 'word', emoji: '😠', fn: f => {
        // Claw hand in front of face — curved tense fingers
        let c = 0;
        if (f.curls.index > 0.2 && f.curls.index < 0.65) c += 0.25;
        if (f.curls.middle > 0.2 && f.curls.middle < 0.65) c += 0.2;
        if (f.lm[WRIST].y < 0.4) c += 0.25; // Near face
        if (f.palmFacing === 'toward') c += 0.2;
        return c * 0.65;
    }},
    { name: 'Scared', cat: 'word', emoji: '😨', fn: f => {
        // Both hands open, pushing away — open hands, palms out
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'toward' || f.palmFacing === 'neutral') c += 0.2;
        if (f.tipDistances.indexToMiddle > 0.15) c += 0.2;
        if (f.lm[WRIST].y > 0.3 && f.lm[WRIST].y < 0.6) c += 0.2;
        return c * 0.55;
    }},
    { name: 'Tired', cat: 'word', emoji: '😫', fn: f => {
        // Bent hands dropping from chest — curved fingers, downward
        let c = 0;
        if (f.curls.index > 0.2 && f.curls.middle > 0.2) c += 0.25;
        if (f.indexDirection === 'down') c += 0.25;
        if (f.lm[WRIST].y > 0.5) c += 0.2;
        if (f.palmFacing === 'toward') c += 0.15;
        return c * 0.6;
    }},
    { name: 'Love', cat: 'word', emoji: '❤️', fn: f => {
        // Crossed fists over chest — fist, low center
        let c = 0;
        if (f.extCount === 0) c += 0.3;
        if (f.lm[WRIST].y > 0.55) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.curls.thumb > 0.2) c += 0.15;
        return c * 0.6;
    }},
    { name: 'Hate', cat: 'word', emoji: '💢', fn: f => {
        // Flick middle finger off thumb — middle finger extended from pinch
        let c = 0;
        if (f.fingers.middle && !f.fingers.index && !f.fingers.ring) c += 0.4;
        if (f.curls.thumb < 0.5) c += 0.15;
        if (f.tipDistances.thumbToMiddle > 0.4) c += 0.2;
        return c * 0.55;
    }},
    { name: 'Surprised', cat: 'word', emoji: '😲', fn: f => {
        // C-hands popping open near eyes — curved to open near face
        let c = 0;
        if (f.extCount >= 3) c += 0.2;
        if (f.curls.index < 0.5 && f.curls.middle < 0.5) c += 0.2;
        if (f.lm[WRIST].y < 0.4) c += 0.3;
        if (f.tipDistances.indexToMiddle > 0.15) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Excited', cat: 'word', emoji: '🤩', fn: f => {
        // Open hands alternating up on chest — spread fingers mid
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.2) c += 0.2;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.2;
        if (f.palmFacing === 'toward') c += 0.15;
        return c * 0.55;
    }},

    // ══════ ACTIONS ══════
    { name: 'Go', cat: 'word', emoji: '🏃', fn: f => {
        // Both index fingers pointing and moving forward
        let c = 0;
        if (f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.25;
        if (f.fingers.thumb) c += 0.1;
        return c * 0.65;
    }},
    { name: 'Come', cat: 'word', emoji: '🫳', fn: f => {
        // Beckoning — index finger curling inward
        let c = 0;
        if (f.curls.index > 0.25 && f.curls.index < 0.7) c += 0.35;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.65) c += 0.1;
        return c * 0.65;
    }},
    { name: 'Sit', cat: 'word', emoji: '🪑', fn: f => {
        // H-hand (index+middle) bending down on other H-hand
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'down' || f.indexDirection === 'right') c += 0.2;
        if (f.curls.index < 0.4 && f.curls.middle < 0.4) c += 0.15;
        return c * 0.6;
    }},
    { name: 'Stand', cat: 'word', emoji: '🧍', fn: f => {
        // V-hand standing upright on flat palm
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'down') c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.2) c += 0.15;
        return c * 0.6;
    }},
    { name: 'Walk', cat: 'word', emoji: '🚶', fn: f => {
        // V-hand walking on palm — two fingers alternating
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'down') c += 0.2;
        if (f.tipDistances.indexToMiddle > 0.15 && f.tipDistances.indexToMiddle < 0.5) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Run', cat: 'word', emoji: '🏃‍♂️', fn: f => {
        // L-hands, index hooking thumb — thumb + index extended, hooking
        let c = 0;
        if (f.fingers.thumb && f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.tipDistances.thumbToIndex < 0.5) c += 0.2;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.15;
        return c * 0.55;
    }},
    { name: 'Open', cat: 'word', emoji: '📖', fn: f => {
        // Both flat hands opening like a book — flat hand, palm up
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.2;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.2;
        return c * 0.55;
    }},
    { name: 'Close', cat: 'word', emoji: '📕', fn: f => {
        // Flat hands closing together — flat hand closing
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.palmFacing === 'away') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.25) c += 0.2;
        if (f.indexDirection === 'down' || f.indexDirection === 'right') c += 0.15;
        return c * 0.55;
    }},
    { name: 'Give', cat: 'word', emoji: '🎁', fn: f => {
        // Flat hands pushing forward — open palm pushing away
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'away') c += 0.25;
        if (f.indexDirection === 'up') c += 0.15;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.7) c += 0.2;
        return c * 0.55;
    }},
    { name: 'Look', cat: 'word', emoji: '👀', fn: f => {
        // V-hand from eyes outward — two fingers pointing from eyes
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.lm[WRIST].y < 0.4) c += 0.25; // Near face
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.15;
        return c * 0.65;
    }},
    { name: 'Listen', cat: 'word', emoji: '👂', fn: f => {
        // Cupped hand behind ear — C-shape near ear
        let c = 0;
        if (f.curls.index > 0.15 && f.curls.index < 0.6) c += 0.25;
        if (f.curls.thumb < 0.5) c += 0.15;
        if (f.lm[WRIST].y < 0.4) c += 0.2;
        if (f.lm[WRIST].x > 0.55 || f.lm[WRIST].x < 0.35) c += 0.2; // Side of head
        return c * 0.6;
    }},
    { name: 'Think', cat: 'word', emoji: '🤔', fn: f => {
        // Index finger touching temple — pointing up near head
        let c = 0;
        if (f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.35;
        if (f.indexDirection === 'up') c += 0.2;
        if (f.lm[WRIST].y < 0.35) c += 0.25;
        if (f.lm[WRIST].x > 0.45) c += 0.1;
        return c * 0.65;
    }},
    { name: 'Know', cat: 'word', emoji: '🧠', fn: f => {
        // Flat hand tapping forehead — fingers together, near head
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.2;
        if (f.lm[WRIST].y < 0.3) c += 0.3; // Very high (forehead)
        if (f.palmFacing === 'toward') c += 0.15;
        return c * 0.65;
    }},
    { name: "Don't Know", cat: 'phrase', emoji: '🤷', fn: f => {
        // Flat hand flipping away from forehead — open hand moving away from head
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.palmFacing === 'away') c += 0.2;
        if (f.lm[WRIST].y < 0.4) c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Learn', cat: 'word', emoji: '📚', fn: f => {
        // Grabbing from palm to forehead — pinch moving up
        let c = 0;
        if (f.touchingThumb.index) c += 0.3;
        if (f.lm[WRIST].y < 0.4) c += 0.25;
        if (f.curls.middle > 0.3) c += 0.15;
        if (f.indexDirection === 'up') c += 0.15;
        return c * 0.6;
    }},
    { name: 'Teach', cat: 'word', emoji: '👨‍🏫', fn: f => {
        // Both O-hands moving forward from temples
        let c = 0;
        if (f.touchingThumb.index && f.touchingThumb.middle) c += 0.3;
        if (f.lm[WRIST].y < 0.45) c += 0.2;
        if (f.palmFacing === 'away') c += 0.2;
        return c * 0.55;
    }},
    { name: 'Work', cat: 'word', emoji: '💼', fn: f => {
        // S-hand (fist) tapping on other wrist — fist in mid position
        let c = 0;
        if (f.extCount === 0) c += 0.3;
        if (f.curls.thumb > 0.2) c += 0.15;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.2;
        if (f.palmFacing === 'away' || f.palmFacing === 'neutral') c += 0.15;
        return c * 0.6;
    }},
    { name: 'Play', cat: 'word', emoji: '🎮', fn: f => {
        // Y-hands shaking — thumb + pinky, mid position
        let c = 0;
        if (f.fingers.thumb && f.fingers.pinky) c += 0.35;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring) c += 0.25;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.7) c += 0.2;
        return c * 0.6;
    }},
    { name: 'Sleep', cat: 'word', emoji: '😴', fn: f => {
        // Open hand closing over face — fingers together, near face, closing
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.lm[WRIST].y < 0.4) c += 0.3; // Near face
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.25) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Read', cat: 'word', emoji: '📖', fn: f => {
        // V-hand scanning down palm — V pointing down
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'down') c += 0.2;
        if (f.lm[WRIST].y > 0.45) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Write', cat: 'word', emoji: '✏️', fn: f => {
        // Pinched fingers writing on palm — pinch gesture, mid position
        let c = 0;
        if (f.touchingThumb.index) c += 0.3;
        if (!f.fingers.middle || f.curls.middle > 0.3) c += 0.15;
        if (f.lm[WRIST].y > 0.45 && f.lm[WRIST].y < 0.7) c += 0.2;
        if (f.indexDirection === 'down' || f.indexDirection === 'right') c += 0.15;
        return c * 0.6;
    }},

    // ══════ QUESTION WORDS ══════
    { name: 'What', cat: 'word', emoji: '❓', fn: f => {
        // Index finger drawing down across flat palm — index extended sideways
        let c = 0;
        if (f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'down') c += 0.2;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Where', cat: 'word', emoji: '📍', fn: f => {
        // Index finger wagging side to side — index up, moving
        let c = 0;
        if (f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.35;
        if (f.indexDirection === 'up') c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.2;
        if (f.curls.thumb > 0.2) c += 0.1;
        return c * 0.55;
    }},
    { name: 'When', cat: 'word', emoji: '🕐', fn: f => {
        // Index circles around other index — index pointing, circular
        let c = 0;
        if (f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'up') c += 0.15;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.15;
        return c * 0.5;
    }},
    { name: 'Who', cat: 'word', emoji: '🔍', fn: f => {
        // Index finger circling around mouth — L-hand near face
        let c = 0;
        if (f.fingers.index) c += 0.3;
        if (f.curls.thumb < 0.5) c += 0.15;
        if (f.lm[WRIST].y < 0.4) c += 0.25; // Near face
        if (!f.fingers.middle && !f.fingers.ring) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Why', cat: 'word', emoji: '🤨', fn: f => {
        // Touching forehead then moving to Y-hand
        let c = 0;
        if (f.fingers.index && f.fingers.middle && f.fingers.ring) c += 0.2;
        if (f.lm[WRIST].y < 0.4) c += 0.25;
        if (f.curls.thumb < 0.5) c += 0.15;
        if (f.palmFacing === 'toward') c += 0.15;
        return c * 0.5;
    }},
    { name: 'How', cat: 'word', emoji: '💭', fn: f => {
        // Both fists rolling together — fists, knuckles touching
        let c = 0;
        if (f.extCount === 0) c += 0.3;
        if (f.palmFacing === 'away') c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.2;
        return c * 0.5;
    }},

    // ══════ TIME ══════
    { name: 'Now', cat: 'word', emoji: '⏰', fn: f => {
        // Both Y-hands dropping — curved hands dropping
        let c = 0;
        if (f.curls.index > 0.2 && f.curls.index < 0.65) c += 0.2;
        if (f.curls.middle > 0.2) c += 0.15;
        if (f.indexDirection === 'down') c += 0.25;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.2;
        return c * 0.55;
    }},
    { name: 'Later', cat: 'word', emoji: '⏳', fn: f => {
        // L-hand rotating forward — L shape with forward motion
        let c = 0;
        if (f.fingers.thumb && f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.2;
        if (f.tipDistances.thumbToIndex > 0.5) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Today', cat: 'word', emoji: '📅', fn: f => {
        // Both Y-hands dropping in front — Y shape dropping
        let c = 0;
        if (f.fingers.thumb && f.fingers.pinky) c += 0.3;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring) c += 0.2;
        if (f.indexDirection === 'down' || f.lm[INDEX.TIP].y > f.lm[INDEX.MCP].y) c += 0.2;
        return c * 0.5;
    }},
    { name: 'Tomorrow', cat: 'word', emoji: '🌅', fn: f => {
        // Thumb on cheek moving forward — thumb out, near face
        let c = 0;
        if (f.fingers.thumb && !f.fingers.index && !f.fingers.middle) c += 0.3;
        if (f.thumbDirection === 'right' || f.thumbDirection === 'up') c += 0.2;
        if (f.lm[WRIST].y < 0.45) c += 0.2;
        return c * 0.5;
    }},
    { name: 'Yesterday', cat: 'word', emoji: '📆', fn: f => {
        // Thumb on chin moving to cheek — thumb near face, backward
        let c = 0;
        if (f.fingers.thumb && !f.fingers.index && !f.fingers.middle) c += 0.3;
        if (f.thumbDirection === 'left' || f.thumbDirection === 'up') c += 0.2;
        if (f.lm[WRIST].y < 0.45) c += 0.2;
        return c * 0.5;
    }},
    { name: 'Morning', cat: 'word', emoji: '🌄', fn: f => {
        // Flat hand in crook of other arm rising — flat hand rising
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.indexDirection === 'up') c += 0.25;
        if (f.lm[WRIST].y > 0.45 && f.lm[WRIST].y < 0.7) c += 0.2;
        if (f.palmFacing === 'toward') c += 0.15;
        return c * 0.5;
    }},
    { name: 'Night', cat: 'word', emoji: '🌙', fn: f => {
        // Bent hand dropping over other flat hand — bent wrist downward
        let c = 0;
        if (f.curls.index > 0.25 && f.curls.index < 0.65) c += 0.25;
        if (f.indexDirection === 'down') c += 0.25;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.2;
        return c * 0.5;
    }},

    // ══════ PEOPLE ══════
    { name: 'Friend', cat: 'word', emoji: '🧑‍🤝‍🧑', fn: f => {
        // X-hands linking — hooked index fingers
        let c = 0;
        if (f.curls.index > 0.3 && f.curls.index < 0.75) c += 0.35;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.15;
        return c * 0.6;
    }},
    { name: 'Family', cat: 'word', emoji: '👨‍👩‍👧‍👦', fn: f => {
        // F-hands circling — thumb+index circle, rotating
        let c = 0;
        if (f.touchingThumb.index) c += 0.3;
        if (f.fingers.middle && f.fingers.ring && f.fingers.pinky) c += 0.25;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.2;
        return c * 0.55;
    }},
    { name: 'Baby', cat: 'word', emoji: '👶', fn: f => {
        // Rocking arms — flat hands together, rocking
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.lm[WRIST].y > 0.55) c += 0.2; // Low position
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.2;
        return c * 0.5;
    }},
    { name: 'Man', cat: 'word', emoji: '👨', fn: f => {
        // Thumb on forehead, open hand — thumb touching forehead area
        let c = 0;
        if (f.fingers.thumb && f.extCount >= 4) c += 0.2;
        if (f.lm[WRIST].y < 0.35) c += 0.3;
        if (f.palmFacing === 'toward') c += 0.15;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.15;
        return c * 0.5;
    }},
    { name: 'Woman', cat: 'word', emoji: '👩', fn: f => {
        // Thumb on chin, open hand — thumb near chin
        let c = 0;
        if (f.fingers.thumb && f.extCount >= 4) c += 0.2;
        if (f.lm[WRIST].y > 0.3 && f.lm[WRIST].y < 0.5) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.15;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.15;
        return c * 0.5;
    }},

    // ══════ DESCRIPTORS ══════
    { name: 'Big', cat: 'word', emoji: '🔵', fn: f => {
        // Both hands L-shape spreading apart — L hands wide
        let c = 0;
        if (f.fingers.thumb && f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.tipDistances.thumbToIndex > 0.7) c += 0.2;
        if (f.indexDirection === 'up') c += 0.15;
        return c * 0.55;
    }},
    { name: 'Small', cat: 'word', emoji: '🔹', fn: f => {
        // Both flat hands pushing together — hands close, palms facing
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.25) c += 0.2;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.6) c += 0.15;
        return c * 0.5;
    }},
    { name: 'Hot', cat: 'word', emoji: '🔥', fn: f => {
        // Claw hand from mouth outward — curved fingers from face
        let c = 0;
        if (f.curls.index > 0.15 && f.curls.index < 0.6) c += 0.25;
        if (f.lm[WRIST].y < 0.4) c += 0.2;
        if (f.palmFacing === 'away') c += 0.2;
        if (f.curls.middle > 0.15 && f.curls.middle < 0.6) c += 0.15;
        return c * 0.55;
    }},
    { name: 'Cold', cat: 'word', emoji: '🥶', fn: f => {
        // Both fists shaking near body — fists, shivering
        let c = 0;
        if (f.extCount === 0) c += 0.3;
        if (f.lm[WRIST].y > 0.45 && f.lm[WRIST].y < 0.7) c += 0.2;
        if (f.palmFacing === 'toward' || f.palmFacing === 'neutral') c += 0.15;
        if (f.curls.thumb > 0.2) c += 0.15;
        return c * 0.5;
    }},
    { name: 'Beautiful', cat: 'word', emoji: '✨', fn: f => {
        // Open hand circling face — spread fingers near face
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.tipDistances.indexToMiddle > 0.15) c += 0.15;
        if (f.lm[WRIST].y < 0.4) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        return c * 0.5;
    }},
    { name: 'Strong', cat: 'word', emoji: '💪', fn: f => {
        // Flexing bicep — fist near shoulder, flexing
        let c = 0;
        if (f.extCount === 0) c += 0.3;
        if (f.lm[WRIST].y > 0.3 && f.lm[WRIST].y < 0.55) c += 0.2;
        if (f.lm[WRIST].x > 0.55 || f.lm[WRIST].x < 0.35) c += 0.2; // Side position
        if (f.curls.thumb > 0.2) c += 0.1;
        return c * 0.55;
    }},
    { name: 'Right', cat: 'word', emoji: '✅', fn: f => {
        // Index fingers aligned — both pointing same direction
        let c = 0;
        if (f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'right') c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.15;
        return c * 0.5;
    }},
    { name: 'Wrong', cat: 'word', emoji: '❌', fn: f => {
        // Y-hand on chin — thumb+pinky, near chin
        let c = 0;
        if (f.fingers.thumb && f.fingers.pinky) c += 0.3;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring) c += 0.2;
        if (f.lm[WRIST].y > 0.3 && f.lm[WRIST].y < 0.5) c += 0.2;
        return c * 0.5;
    }},
    { name: 'Maybe', cat: 'word', emoji: '🤷‍♂️', fn: f => {
        // Both flat hands alternating up/down — flat hands seesawing
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.palmFacing === 'toward' || f.palmFacing === 'neutral') c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.2;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.15;
        return c * 0.5;
    }},
    { name: 'Same', cat: 'word', emoji: '🟰', fn: f => {
        // Both index fingers pointing together — index extended, together
        let c = 0;
        if (f.fingers.index) c += 0.3;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.2;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.15;
        return c * 0.5;
    }},
    { name: 'Different', cat: 'word', emoji: '↔️', fn: f => {
        // Both index fingers crossing and separating — index spread
        let c = 0;
        if (f.fingers.index) c += 0.25;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.2;
        if (f.fingers.middle) c += 0.1;
        if (f.tipDistances.indexToMiddle > 0.3) c += 0.15;
        return c * 0.5;
    }},
    { name: 'Finished', cat: 'phrase', emoji: '🏁', fn: f => {
        // Both open hands flipping — all fingers, palms rotating
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'away') c += 0.25;
        if (f.tipDistances.indexToMiddle > 0.15) c += 0.15;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.2;
        return c * 0.55;
    }},
    { name: 'Again', cat: 'word', emoji: '🔄', fn: f => {
        // Bent hand tapping flat palm — curved fingers tapping
        let c = 0;
        if (f.curls.index > 0.25 && f.curls.index < 0.7) c += 0.3;
        if (f.curls.middle > 0.25) c += 0.15;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.2;
        if (f.palmFacing === 'toward') c += 0.15;
        return c * 0.55;
    }},
    { name: 'Always', cat: 'word', emoji: '♾️', fn: f => {
        // Index finger circling — index up, circular motion
        let c = 0;
        if (f.fingers.index && !f.fingers.middle && !f.fingers.ring) c += 0.35;
        if (f.indexDirection === 'up') c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.2;
        return c * 0.45;
    }},
    { name: 'Never', cat: 'word', emoji: '🚫', fn: f => {
        // Flat hand zigzagging down — open flat hand slashing
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.palmFacing === 'away') c += 0.2;
        if (f.indexDirection === 'down') c += 0.25;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.15;
        return c * 0.45;
    }},

    // ══════ FOOD & NEEDS ══════
    { name: 'Hungry', cat: 'word', emoji: '🤤', fn: f => {
        // C-hand sliding down from throat — C shape at neck
        let c = 0;
        if (f.curls.index > 0.15 && f.curls.index < 0.65) c += 0.25;
        if (f.curls.thumb < 0.5) c += 0.15;
        if (f.lm[WRIST].y > 0.3 && f.lm[WRIST].y < 0.55) c += 0.25;
        if (f.indexDirection === 'down') c += 0.2;
        return c * 0.6;
    }},
    { name: 'Water', cat: 'word', emoji: '💧', fn: f => {
        // W-hand tapping chin — three fingers, near face
        let c = 0;
        if (f.fingers.index && f.fingers.middle && f.fingers.ring) c += 0.3;
        if (!f.fingers.pinky) c += 0.15;
        if (f.lm[WRIST].y < 0.45) c += 0.25;
        if (f.curls.thumb < 0.5) c += 0.1;
        return c * 0.6;
    }},
    { name: 'Food', cat: 'word', emoji: '🍔', fn: f => {
        // Pinched fingers to mouth repeatedly — bunched tips to face
        let c = 0;
        if (f.touchingThumb.index) c += 0.3;
        if (f.curls.middle > 0.2) c += 0.15;
        if (f.lm[WRIST].y < 0.45) c += 0.25;
        if (f.tipDistances.thumbToIndex < 0.3) c += 0.15;
        return c * 0.6;
    }},
    { name: 'Home', cat: 'word', emoji: '🏠', fn: f => {
        // Pinched hand from mouth to cheek — pinch near face
        let c = 0;
        if (f.touchingThumb.index) c += 0.3;
        if (f.lm[WRIST].y < 0.4) c += 0.25;
        if (f.lm[WRIST].x > 0.45) c += 0.15;
        if (f.curls.middle > 0.3) c += 0.15;
        return c * 0.55;
    }},
    { name: 'School', cat: 'word', emoji: '🏫', fn: f => {
        // Clapping hands — flat hands clapping
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'away') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.25) c += 0.2;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.15;
        return c * 0.5;
    }},

    // ══════ MORE PHRASES ══════
    { name: 'I Am Fine', cat: 'phrase', emoji: '😌', fn: f => {
        // Thumb on chest — thumb extended, touching chest
        let c = 0;
        if (f.fingers.thumb && f.extCount >= 4) c += 0.2;
        if (f.lm[WRIST].y > 0.5) c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.tipDistances.indexToMiddle > 0.1) c += 0.15;
        return c * 0.5;
    }},
    { name: 'I Am Sorry', cat: 'phrase', emoji: '🥺', fn: f => {
        // A-hand circling on chest — fist with thumb, circling
        let c = 0;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.3;
        if (f.fingers.thumb || f.thumbTipAboveIndexPIP) c += 0.2;
        if (f.lm[WRIST].y > 0.55) c += 0.2;
        if (f.palmFacing === 'toward') c += 0.15;
        return c * 0.5;
    }},
    { name: 'My Name Is', cat: 'phrase', emoji: '🏷️', fn: f => {
        // H-hand tapping H-hand — two fingers tapping
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.35) c += 0.15;
        return c * 0.5;
    }},
    { name: 'Good Morning', cat: 'phrase', emoji: '🌞', fn: f => {
        // Flat hand rising from arm — open hand rising upward
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.indexDirection === 'up') c += 0.25;
        if (f.palmFacing === 'toward') c += 0.2;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.15;
        return c * 0.45;
    }},
    { name: 'Good Night', cat: 'phrase', emoji: '🌜', fn: f => {
        // Bent hand closing over flat hand — curved fingers closing
        let c = 0;
        if (f.curls.index > 0.2 && f.curls.index < 0.65) c += 0.25;
        if (f.indexDirection === 'down') c += 0.25;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.2;
        return c * 0.45;
    }},
    { name: 'See You Later', cat: 'phrase', emoji: '👋', fn: f => {
        // Combination: V from eyes forward — V-hand from face
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.lm[WRIST].y < 0.45) c += 0.2;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.15;
        return c * 0.45;
    }},
    { name: 'No Problem', cat: 'phrase', emoji: '👌', fn: f => {
        // Flat hand brushing off — open hand swiping
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.palmFacing === 'away') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.2;
        if (f.indexDirection === 'right' || f.indexDirection === 'left') c += 0.2;
        return c * 0.45;
    }},
    { name: 'Slow Down', cat: 'phrase', emoji: '🐌', fn: f => {
        // Open hand sliding down other hand — flat hand going down
        let c = 0;
        if (f.extCount >= 4) c += 0.2;
        if (f.indexDirection === 'down') c += 0.25;
        if (f.palmFacing === 'away' || f.palmFacing === 'neutral') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.15;
        return c * 0.45;
    }},
    { name: 'Hurry Up', cat: 'phrase', emoji: '⚡', fn: f => {
        // Both H-hands shaking rapidly — two fingers shaking
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.35) c += 0.15;
        return c * 0.45;
    }},
    { name: 'Be Careful', cat: 'phrase', emoji: '⚠️', fn: f => {
        // V-hand tapping other wrist — V near wrist
        let c = 0;
        if (f.fingers.index && f.fingers.middle) c += 0.3;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.lm[WRIST].y > 0.5) c += 0.2;
        if (f.tipDistances.indexToMiddle > 0.2) c += 0.15;
        return c * 0.45;
    }},
    { name: 'Well Done', cat: 'phrase', emoji: '🎉', fn: f => {
        // Clapping / thumbs up — thumb up or open hand
        let c = 0;
        if (f.fingers.thumb && f.thumbDirection === 'up') c += 0.35;
        if (!f.fingers.index && !f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.25;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.6) c += 0.2;
        return c * 0.5;
    }},
    { name: 'Congratulations', cat: 'phrase', emoji: '🥳', fn: f => {
        // Clapping hands — flat hands together
        let c = 0;
        if (f.extCount >= 4) c += 0.25;
        if (f.palmFacing === 'toward' || f.palmFacing === 'neutral') c += 0.2;
        if (f.tipDistances.indexToMiddle < 0.3) c += 0.2;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.15;
        return c * 0.45;
    }},
    { name: 'Need Help', cat: 'phrase', emoji: '🙏', fn: f => {
        // Fist on open palm raising — fist lifting up
        let c = 0;
        if (f.extCount === 0) c += 0.25;
        if (f.lm[WRIST].y > 0.4 && f.lm[WRIST].y < 0.65) c += 0.2;
        if (f.palmFacing === 'toward') c += 0.15;
        if (f.curls.thumb > 0.2) c += 0.15;
        return c * 0.45;
    }},
    { name: 'Agree', cat: 'word', emoji: '🤝', fn: f => {
        // Index pointing then touching forehead — think + nod
        let c = 0;
        if (f.fingers.index) c += 0.25;
        if (!f.fingers.middle && !f.fingers.ring && !f.fingers.pinky) c += 0.2;
        if (f.indexDirection === 'down') c += 0.2;
        if (f.lm[WRIST].y > 0.35 && f.lm[WRIST].y < 0.55) c += 0.15;
        return c * 0.5;
    }},
    { name: 'Disagree', cat: 'word', emoji: '🙅', fn: f => {
        // Index fingers pointing together then apart — separating
        let c = 0;
        if (f.fingers.index) c += 0.25;
        if (!f.fingers.ring && !f.fingers.pinky) c += 0.15;
        if (f.indexDirection === 'left' || f.indexDirection === 'right') c += 0.2;
        if (f.palmFacing === 'away') c += 0.15;
        return c * 0.5;
    }},
];

// ─── Motion Tracker ───
class MotionTracker {
    constructor() {
        this.history = [];
        this.maxHistory = 15;
    }
    update(wristPos, palmCenter) {
        this.history.push({ wrist: {...wristPos}, palm: {...palmCenter}, t: Date.now() });
        if (this.history.length > this.maxHistory) this.history.shift();
    }
    getMotion() {
        if (this.history.length < 3) return { dx: 0, dy: 0, speed: 0, dir: 'none' };
        const recent = this.history.slice(-5);
        const first = recent[0], last = recent[recent.length - 1];
        const dx = last.wrist.x - first.wrist.x;
        const dy = last.wrist.y - first.wrist.y;
        const dt = (last.t - first.t) / 1000 || 0.001;
        const speed = Math.sqrt(dx*dx + dy*dy) / dt;
        let dir = 'none';
        if (speed > 0.3) {
            if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
            else dir = dy > 0 ? 'down' : 'up';
        }
        return { dx, dy, speed, dir };
    }
    reset() { this.history = []; }
}

// ─── Prediction Stabilizer ───
class PredictionStabilizer {
    constructor(opts = {}) {
        this.windowSize = opts.windowSize || 10;
        this.minConfidence = opts.minConfidence || 0.45;
        this.minConsensus = opts.minConsensus || 0.5;
        this.predictions = [];
    }
    update(name, confidence) {
        this.predictions.push({ name, confidence, t: Date.now() });
        if (this.predictions.length > this.windowSize) this.predictions.shift();
        const votes = {};
        let total = 0;
        for (const p of this.predictions) {
            if (p.confidence >= this.minConfidence) {
                votes[p.name] = (votes[p.name] || 0) + p.confidence;
                total += p.confidence;
            }
        }
        let best = null, bestScore = 0;
        for (const [n, s] of Object.entries(votes)) {
            if (s > bestScore) { bestScore = s; best = n; }
        }
        const ratio = total > 0 ? bestScore / total : 0;
        const avg = best ? bestScore / this.predictions.filter(p => p.name === best).length : 0;
        if (best && ratio >= this.minConsensus && avg >= this.minConfidence) {
            return { name: best, confidence: Math.min(1, avg), raw: name, consensus: ratio };
        }
        return { name: null, confidence: 0, raw: name, consensus: ratio };
    }
    reset() { this.predictions = []; }
}

// ─── Main Classifier ───
export class GestureClassifier {
    constructor() {
        this.stabilizer = new PredictionStabilizer({ windowSize: 8, minConfidence: 0.4, minConsensus: 0.4 });
        this.motion = new MotionTracker();
        this.gestures = GESTURE_DEFS;
        this.activeCategory = 'all'; // 'all', 'letter', 'number', 'word', 'phrase'
    }

    setCategory(cat) { this.activeCategory = cat; }

    classify(landmarks) {
        if (!landmarks || landmarks.length < 21) {
            return { name: null, confidence: 0, raw: null, category: null, allScores: [], topResults: [] };
        }
        const features = extractFeatures(landmarks);
        this.motion.update(features.wristPos, features.palmCenter);
        features.motion = this.motion.getMotion();

        // Score all gestures (or filtered by category)
        const scored = [];
        for (const g of this.gestures) {
            if (this.activeCategory !== 'all' && g.cat !== this.activeCategory) continue;
            try {
                const score = Math.max(0, Math.min(1, g.fn(features)));
                scored.push({ name: g.name, category: g.cat, emoji: g.emoji, score });
            } catch (e) { scored.push({ name: g.name, category: g.cat, emoji: g.emoji, score: 0 }); }
        }

        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, 5);
        const best = scored[0] || { name: '?', score: 0, category: null, emoji: '' };

        const stabilized = this.stabilizer.update(best.name, best.score);

        // Find the stabilized gesture's category/emoji
        const matchedGesture = this.gestures.find(g => g.name === stabilized.name);

        return {
            name: stabilized.name,
            confidence: stabilized.confidence,
            raw: best.name,
            rawConfidence: best.score,
            category: matchedGesture?.cat || null,
            emoji: matchedGesture?.emoji || '',
            topResults: top,
            allScores: scored,
            motion: features.motion,
        };
    }

    reset() { this.stabilizer.reset(); this.motion.reset(); }

    getGestures() { return this.gestures.map(g => ({ name: g.name, cat: g.cat, emoji: g.emoji })); }
    getCategories() { return ['all', 'letter', 'number', 'word', 'phrase']; }
    // Backwards-compatible
    getSupportedLetters() { return this.gestures.map(g => g.name); }
}
