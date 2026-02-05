// Content script for area selection
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let overlay: HTMLDivElement | null = null;
    let selectionBox: HTMLDivElement | null = null;
    let sizeLabel: HTMLDivElement | null = null;
    let hint: HTMLDivElement | null = null;
    let startX = 0;
    let startY = 0;
    let isSelecting = false;

    // Listen for start selection message
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'start-selection') {
        createSelectionOverlay();
      }
    });

    function createSelectionOverlay() {
      // Remove any existing overlay
      cleanup();

      // Create overlay
      overlay = document.createElement('div');
      overlay.className = 'screenshot-selection-overlay';
      document.body.appendChild(overlay);

      // Create hint
      hint = document.createElement('div');
      hint.className = 'screenshot-selection-hint';
      hint.textContent = 'Click and drag to select an area. Press Escape to cancel.';
      document.body.appendChild(hint);

      // Event listeners
      overlay.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('keydown', handleKeyDown);
    }

    function handleMouseDown(e: MouseEvent) {
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;

      // Create selection box
      selectionBox = document.createElement('div');
      selectionBox.className = 'screenshot-selection-box';
      selectionBox.style.left = `${startX}px`;
      selectionBox.style.top = `${startY}px`;
      document.body.appendChild(selectionBox);

      // Create size label
      sizeLabel = document.createElement('div');
      sizeLabel.className = 'screenshot-selection-size';
      document.body.appendChild(sizeLabel);

      // Hide hint
      if (hint) {
        hint.style.display = 'none';
      }
    }

    function handleMouseMove(e: MouseEvent) {
      if (!isSelecting || !selectionBox || !sizeLabel) return;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      selectionBox.style.left = `${left}px`;
      selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;

      // Update size label
      sizeLabel.textContent = `${width} × ${height}`;
      sizeLabel.style.left = `${left}px`;
      sizeLabel.style.top = `${top + height + 8}px`;
    }

    function handleMouseUp(e: MouseEvent) {
      if (!isSelecting) return;
      isSelecting = false;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const rect = {
        x: Math.min(startX, currentX),
        y: Math.min(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY),
      };

      // Require minimum selection size
      if (rect.width < 10 || rect.height < 10) {
        cleanup();
        browser.runtime.sendMessage({
          type: 'selection-complete',
          canceled: true,
        });
        return;
      }

      // Send selection to background script
      cleanup();
      browser.runtime.sendMessage({
        type: 'selection-complete',
        rect,
      });
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        browser.runtime.sendMessage({
          type: 'selection-complete',
          canceled: true,
        });
      }
    }

    function cleanup() {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
      if (selectionBox) {
        selectionBox.remove();
        selectionBox = null;
      }
      if (sizeLabel) {
        sizeLabel.remove();
        sizeLabel = null;
      }
      if (hint) {
        hint.remove();
        hint = null;
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      isSelecting = false;
    }
  },
});
