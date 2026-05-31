const { ipcRenderer } = require('electron');

const defaultZoomFactor = 1;
const minimumZoomFactor = 0.75;
const maximumZoomFactor = 1.5;
const zoomStep = 0.1;
const zoomWheelCooldownMs = 80;
let currentZoomFactor = defaultZoomFactor;
let lastZoomWheelAt = 0;

/**
 * Limits a zoom factor to the supported renderer zoom range.
 * @param {number} zoomFactor - Requested zoom factor.
 * @returns {number} Clamped zoom factor rounded to two decimals.
 */
function clampZoomFactor(zoomFactor) {
  return Math.round(Math.min(maximumZoomFactor, Math.max(minimumZoomFactor, zoomFactor)) * 100) / 100;
}

/**
 * Finds the app content element that should be zoomed without affecting the Electron titlebar.
 * @returns {HTMLElement | null} The main content element when available.
 */
function getZoomTarget() {
  return document.querySelector('main');
}

/**
 * Applies the content zoom factor in the renderer.
 * @param {number} zoomFactor - Zoom factor to apply.
 * @returns {number} Applied clamped zoom factor.
 */
function applyContentZoom(zoomFactor) {
  currentZoomFactor = clampZoomFactor(zoomFactor);

  const target = getZoomTarget();

  if (target) {
    target.style.zoom = String(currentZoomFactor);
  }

  return currentZoomFactor;
}

/**
 * Applies zoom when the app main element becomes available.
 * @returns {void}
 */
function applyZoomWhenReady() {
  if (getZoomTarget()) {
    applyContentZoom(currentZoomFactor);
    return;
  }

  window.requestAnimationFrame(applyZoomWhenReady);
}

/**
 * Adjusts content zoom and notifies the main process for persistence.
 * @param {'in' | 'out'} direction - Requested zoom direction.
 * @returns {void}
 */
function adjustContentZoom(direction) {
  const delta = direction === 'in' ? zoomStep : -zoomStep;
  const nextZoomFactor = applyContentZoom(currentZoomFactor + delta);

  ipcRenderer.send('app-zoom-factor-changed', nextZoomFactor);
}

/**
 * Resets content zoom to the default factor and persists the reset.
 * @returns {void}
 */
function resetContentZoom() {
  const nextZoomFactor = applyContentZoom(defaultZoomFactor);

  ipcRenderer.send('app-zoom-factor-changed', nextZoomFactor);
}

/**
 * Handles Ctrl+mouse-wheel zoom gestures in the renderer.
 * @param {WheelEvent} event - Browser wheel event.
 * @returns {void}
 */
function handleWheel(event) {
  if (!event.ctrlKey || event.deltaY === 0) {
    return;
  }

  const now = Date.now();

  event.preventDefault();

  if (now - lastZoomWheelAt < zoomWheelCooldownMs) {
    return;
  }

  lastZoomWheelAt = now;
  adjustContentZoom(event.deltaY < 0 ? 'in' : 'out');
}

/**
 * Handles keyboard zoom reset shortcuts in the renderer.
 * @param {KeyboardEvent} event - Browser keyboard event.
 * @returns {void}
 */
function handleKeyDown(event) {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    return;
  }

  if (event.key !== '0') {
    return;
  }

  event.preventDefault();
  resetContentZoom();
}

ipcRenderer.on('app-zoom-factor', (_event, zoomFactor) => {
  if (Number.isFinite(zoomFactor)) {
    applyContentZoom(zoomFactor);
  }
});

window.addEventListener('DOMContentLoaded', applyZoomWhenReady);
window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
window.addEventListener('keydown', handleKeyDown, { capture: true });
