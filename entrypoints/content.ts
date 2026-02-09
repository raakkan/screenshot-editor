import './selection.css';

const SELECTION_CSS = `
.screenshot-selection-overlay {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  background: transparent !important;
  z-index: 2147483640 !important;
  cursor: crosshair !important;
}
.screenshot-selection-box {
  position: fixed !important;
  border: 2px dashed #0066ff !important;
  background: transparent !important;
  z-index: 2147483645 !important;
  pointer-events: auto !important;
  cursor: move !important;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.3) !important;
}
.screenshot-selection-size {
  position: fixed !important;
  background: #333 !important;
  color: #fff !important;
  padding: 4px 10px !important;
  border-radius: 4px !important;
  font-size: 12px !important;
  z-index: 2147483646 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  white-space: nowrap !important;
  pointer-events: none !important;
  box-shadow: 0 2px 5px rgba(0,0,0,0.3) !important;
}
.screenshot-selection-handle {
  position: absolute !important;
  width: 12px !important;
  height: 12px !important;
  background: #fff !important;
  border: 2px solid #0066ff !important;
  z-index: 2147483647 !important;
  pointer-events: auto !important;
  border-radius: 50% !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
}
.screenshot-selection-handle:hover {
  transform: scale(1.2) !important;
  background: #0066ff !important;
}
.screenshot-selection-handle.nw { top: -7px; left: -7px; cursor: nw-resize; }
.screenshot-selection-handle.n  { top: -7px; left: 50%; transform: translateX(-50%); cursor: n-resize; }
.screenshot-selection-handle.ne { top: -7px; right: -7px; cursor: ne-resize; }
.screenshot-selection-handle.e  { top: 50%; right: -7px; transform: translateY(-50%); cursor: e-resize; }
.screenshot-selection-handle.se { bottom: -7px; right: -7px; cursor: se-resize; }
.screenshot-selection-handle.s  { bottom: -7px; left: 50%; transform: translateX(-50%); cursor: s-resize; }
.screenshot-selection-handle.sw { bottom: -7px; left: -7px; cursor: sw-resize; }
.screenshot-selection-handle.w  { top: 50%; left: -7px; transform: translateY(-50%); cursor: w-resize; }

.screenshot-selection-actions {
  position: absolute !important;
  bottom: -50px !important;
  right: 0 !important;
  display: flex !important;
  gap: 10px !important;
  z-index: 2147483647 !important;
  padding: 8px !important;
  background: #fff !important;
  border-radius: 10px !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2) !important;
  pointer-events: auto !important;
}
.screenshot-selection-btn {
  padding: 8px 16px !important;
  border-radius: 6px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  border: none !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  transition: all 0.2s !important;
}
.screenshot-selection-btn.confirm { background: #0066ff !important; color: white !important; }
.screenshot-selection-btn.confirm:hover { background: #0052cc !important; }
.screenshot-selection-btn.cancel { background: #f1f1f2 !important; color: #333 !important; }
.screenshot-selection-btn.cancel:hover { background: #e2e2e4 !important; }
`;

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Use a global flag to prevent multiple listeners
    if ((window as any).__screenshot_selection_active) return;
    (window as any).__screenshot_selection_active = true;

    let overlay: HTMLDivElement | null = null;
    let selectionBox: HTMLDivElement | null = null;
    let sizeLabel: HTMLDivElement | null = null;
    let hint: HTMLDivElement | null = null;
    let styleElement: HTMLStyleElement | null = null;
    let actions: HTMLDivElement | null = null;

    let isSelecting = false;
    let isResizing = false;
    let isMoving = false;
    let activeHandle: string | null = null;

    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;
    let selectRect = { x: 0, y: 0, w: 0, h: 0 };

    function applyStyles() {
      let existingStyle = document.getElementById('screenshot-selection-styles');
      if (!existingStyle) {
        styleElement = document.createElement('style');
        styleElement.id = 'screenshot-selection-styles';
        styleElement.textContent = SELECTION_CSS;
        document.head.appendChild(styleElement);
      } else {
        styleElement = existingStyle as HTMLStyleElement;
      }
    }

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'start-selection') {
        applyStyles();
        createSelectionOverlay();
      } else if (message.type === 'cleanup-selection') {
        cleanup();
      }
    });

    function createSelectionOverlay() {
      cleanup();

      overlay = document.createElement('div');
      overlay.className = 'screenshot-selection-overlay';
      overlay.id = 'screenshot-selection-root';
      document.body.appendChild(overlay);

      hint = document.createElement('div');
      hint.className = 'screenshot-selection-hint';
      hint.textContent = 'Drag to select area. Drag box to move. Use handles to resize.';
      overlay.appendChild(hint);

      overlay.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('keydown', handleKeyDown);
    }

    function createHandles() {
      if (!selectionBox) return;
      const types = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
      types.forEach(type => {
        const handle = document.createElement('div');
        handle.className = `screenshot-selection-handle ${type}`;
        handle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          isResizing = true;
          activeHandle = type;
        });
        selectionBox!.appendChild(handle);
      });
    }

    function createActions() {
      if (!selectionBox || actions) return;
      actions = document.createElement('div');
      actions.className = 'screenshot-selection-actions';
      actions.addEventListener('mousedown', (e) => e.stopPropagation()); // Prevent moving when clicking buttons

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'screenshot-selection-btn confirm';
      confirmBtn.textContent = '✓ Edit';
      confirmBtn.onclick = (e) => {
        console.log('Edit button clicked');
        e.stopPropagation();
        const rect = { x: selectRect.x, y: selectRect.y, width: selectRect.w, height: selectRect.h };
        cleanup();
        browser.runtime.sendMessage({ type: 'selection-complete', rect });
      };

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'screenshot-selection-btn cancel';
      cancelBtn.textContent = '✕ Cancel';
      cancelBtn.onclick = (e) => {
        console.log('Cancel button clicked');
        e.stopPropagation();
        cleanup();
        browser.runtime.sendMessage({ type: 'selection-complete', canceled: true });
      };

      actions.appendChild(confirmBtn);
      actions.appendChild(cancelBtn);
      selectionBox.appendChild(actions);
    }

    function handleMouseDown(e: MouseEvent) {
      if (actions) return; // Don't restart if we already have a selection
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;

      selectionBox = document.createElement('div');
      selectionBox.className = 'screenshot-selection-box';
      selectionBox.style.left = `${startX}px`;
      selectionBox.style.top = `${startY}px`;
      overlay?.appendChild(selectionBox);

      // Add listener to selectionBox for moving later
      selectionBox.addEventListener('mousedown', (e) => {
        if (actions && !isResizing) {
          e.stopPropagation();
          isMoving = true;
          offsetX = e.clientX - selectRect.x;
          offsetY = e.clientY - selectRect.y;
        }
      });

      sizeLabel = document.createElement('div');
      sizeLabel.className = 'screenshot-selection-size';
      overlay?.appendChild(sizeLabel);

      if (hint) hint.style.setProperty('display', 'none', 'important');
    }

    function handleMouseMove(e: MouseEvent) {
      if (!isSelecting && !isResizing && !isMoving) return;
      if (!selectionBox || !sizeLabel) return;

      if (isSelecting) {
        const curX = e.clientX;
        const curY = e.clientY;
        selectRect.x = Math.min(startX, curX);
        selectRect.y = Math.min(startY, curY);
        selectRect.w = Math.max(1, Math.abs(curX - startX));
        selectRect.h = Math.max(1, Math.abs(curY - startY));
      } else if (isResizing && activeHandle) {
        const curX = e.clientX;
        const curY = e.clientY;
        const r = { ...selectRect };

        if (activeHandle.includes('w')) { r.w += r.x - curX; r.x = curX; }
        if (activeHandle.includes('e')) { r.w = curX - r.x; }
        if (activeHandle.includes('n')) { r.h += r.y - curY; r.y = curY; }
        if (activeHandle.includes('s')) { r.h = curY - r.y; }

        if (r.w < 1) { r.x += r.w - 1; r.w = 1; }
        if (r.h < 1) { r.y += r.h - 1; r.h = 1; }

        selectRect = r;
      } else if (isMoving) {
        selectRect.x = e.clientX - offsetX;
        selectRect.y = e.clientY - offsetY;
      }

      selectionBox.style.left = `${selectRect.x}px`;
      selectionBox.style.top = `${selectRect.y}px`;
      selectionBox.style.width = `${selectRect.w}px`;
      selectionBox.style.height = `${selectRect.h}px`;

      sizeLabel.textContent = `${Math.round(selectRect.w)} × ${Math.round(selectRect.h)}`;
      sizeLabel.style.left = `${selectRect.x}px`;
      sizeLabel.style.top = `${selectRect.y + selectRect.h + 8}px`;
    }

    function handleMouseUp() {
      if (isSelecting) {
        isSelecting = false;
        if (selectRect.w > 5 && selectRect.h > 5) {
          createHandles();
          createActions();
        } else {
          cleanup();
        }
      }
      isResizing = false;
      isMoving = false;
      activeHandle = null;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        browser.runtime.sendMessage({ type: 'selection-complete', canceled: true });
      } else if (e.key === 'Enter' && actions) {
        const rect = { x: selectRect.x, y: selectRect.y, width: selectRect.w, height: selectRect.h };
        cleanup();
        browser.runtime.sendMessage({ type: 'selection-complete', rect });
      }
    }

    function cleanup() {
      console.log('Running robust cleanup...');

      // Remove via ID-based root first
      const root = document.getElementById('screenshot-selection-root');
      if (root) {
        root.remove();
        console.log('Removed selection root');
      }

      // Remove style tag by ID
      const style = document.getElementById('screenshot-selection-styles');
      if (style) {
        style.remove();
        console.log('Removed selection styles');
      }

      // Fallback: Remove anything with our class prefix
      const strayElements = document.querySelectorAll(
        '[class*="screenshot-selection-"]'
      );
      if (strayElements.length > 0) {
        console.log(`Cleaning up ${strayElements.length} stray elements`);
        strayElements.forEach(el => el.remove());
      }

      // Reset variables
      overlay = null;
      selectionBox = null;
      sizeLabel = null;
      hint = null;
      styleElement = null;
      actions = null;

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);

      isSelecting = false;
      isResizing = false;
      isMoving = false;
      activeHandle = null;

      console.log('Cleanup complete');
    }
  },
});
