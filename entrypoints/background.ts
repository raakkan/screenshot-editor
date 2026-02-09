// Background script for handling screenshot capture
export default defineBackground(() => {
  console.log('Screenshot Editor Pro background script loaded');

  // Broadcast a cleanup message to all tabs to ensure selector is gone
  async function broadcastCleanup() {
    try {
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          browser.tabs.sendMessage(tab.id, { type: 'cleanup-selection' }).catch(() => { });
        }
      }
    } catch (e) {
      console.error('Broadcast cleanup failed:', e);
    }
  }

  // Listen for messages from popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'capture') {
      handleCapture(message.mode)
        .then((result) => sendResponse(result))
        .catch((error: any) => {
          console.error('Capture error:', error);
          let errorMessage = error.message || 'Unknown error';
          if (errorMessage.includes('Cannot access') || errorMessage.includes('restricted')) {
            errorMessage = 'Browser restriction: Cannot capture internal browser pages.';
          }
          sendResponse({ success: false, error: errorMessage });
        });
      return true;
    }

    if (message.type === 'selection-complete') {
      return false; // Handled by waitForSelection
    }

    return false;
  });

  async function handleCapture(mode: string): Promise<{ success: boolean; error?: string }> {
    try {
      let imageDataUrl: string;

      switch (mode) {
        case 'visible':
          imageDataUrl = await captureVisibleTab();
          break;
        case 'selection':
          imageDataUrl = await captureWithSelection();
          break;
        case 'fullpage':
          imageDataUrl = await captureFullPage();
          break;
        default:
          throw new Error('Unknown capture mode');
      }

      await browser.storage.local.set({ capturedImage: imageDataUrl });
      await browser.tabs.create({ url: browser.runtime.getURL('/editor.html') });
      await broadcastCleanup();

      return { success: true };
    } catch (error) {
      console.error('Capture failed:', error);
      await broadcastCleanup();
      throw error;
    }
  }

  async function captureVisibleTab(): Promise<string> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    return await new Promise<string>((resolve, reject) => {
      chrome.tabs.captureVisibleTab(
        { format: 'png' },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(dataUrl);
          }
        }
      );
    });
  }

  async function captureWithSelection(): Promise<string> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    const possiblePaths = ['content-scripts/content.js', 'content.js'];
    let injected = false;
    for (const path of possiblePaths) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [path],
        });
        injected = true;
        break;
      } catch (e) { }
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      await browser.tabs.sendMessage(tab.id, { type: 'start-selection' });
    } catch (e) {
      throw new Error('Could not connect to the page. Please refresh and try again.');
    }

    const rect = await waitForSelection(tab.id);
    await new Promise(resolve => setTimeout(resolve, 300));

    const fullDataUrl = await new Promise<string>((resolve, reject) => {
      chrome.tabs.captureVisibleTab(
        { format: 'png' },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(dataUrl);
          }
        }
      );
    });

    return await cropImage(fullDataUrl, rect, tab.id);
  }

  function waitForSelection(tabId: number): Promise<{ x: number; y: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        browser.runtime.onMessage.removeListener(listener);
        reject(new Error('Selection timeout'));
      }, 60000);

      const listener = (message: any, sender: any) => {
        if (sender.tab?.id === tabId && message.type === 'selection-complete') {
          clearTimeout(timeout);
          browser.runtime.onMessage.removeListener(listener);
          if (message.canceled) {
            reject(new Error('Selection canceled'));
          } else {
            resolve(message.rect);
          }
        }
      };

      browser.runtime.onMessage.addListener(listener);
    });
  }

  interface TabRect {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  async function cropImage(dataUrl: string, rect: TabRect, tabId: number): Promise<string> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (dataUrl: string, rect: TabRect) => {
        return new Promise<string>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const dpr = window.devicePixelRatio || 1;
            const canvas = document.createElement('canvas');
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(
                img,
                rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr,
                0, 0, rect.width * dpr, rect.height * dpr
              );
              resolve(canvas.toDataURL('image/png'));
            } else {
              resolve(dataUrl);
            }
          };
          img.src = dataUrl;
        });
      },
      args: [dataUrl, rect],
    });
    // @ts-ignore
    return results[0].result;
  }

  async function captureFullPage(): Promise<string> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    const dimensions = await new Promise<any>((resolve) => {
      // @ts-ignore
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id! },
          func: () => ({
            scrollHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
            clientHeight: document.documentElement.clientHeight || window.innerHeight,
            clientWidth: document.documentElement.clientWidth || window.innerWidth,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            devicePixelRatio: window.devicePixelRatio,
          }),
        },
        // @ts-ignore
        (results) => resolve(results?.[0]?.result)
      );
    });

    if (!dimensions) throw new Error('Could not get page dimensions');

    const { scrollHeight, clientHeight, scrollX, scrollY, devicePixelRatio: dpr } = dimensions;
    const originalScrollX = scrollX;
    const originalScrollY = scrollY;

    const captures: { dataUrl: string; y: number }[] = [];
    let currentY = 0;

    try {
      let iteration = 0;
      while (currentY < scrollHeight) {
        iteration++;

        // Scroll to the next position
        const actualScrollY = await new Promise<number>((resolve) => {
          // @ts-ignore
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id! },
              func: (y: number) => {
                window.scrollTo(0, y);
                window.dispatchEvent(new Event('scroll'));
                return window.scrollY;
              },
              args: [currentY],
            },
            // @ts-ignore
            (results) => resolve(results?.[0]?.result ?? currentY)
          );
        });

        // Wait for page to settle (animations, lazy loads, and sticky transitions)
        await new Promise(resolve => setTimeout(resolve, 800));

        // On iteration 2+ we hide floating elements BEFORE we capture, in case they appeared during scroll
        if (iteration > 1) {
          await hideFloatingElements(tab.id!);
          // Small delay to ensure layout shift from hiding is complete
          await new Promise(resolve => setTimeout(resolve, 150));
        }

        // Capture the visible viewport
        const dataUrl = await new Promise<string>((resolve, reject) => {
          // @ts-ignore
          chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
            // @ts-ignore
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(dataUrl);
          });
        });

        captures.push({ dataUrl, y: actualScrollY });

        // IMPORTANT: Immediately AFTER the first frame is captured, we hide fixed elements 
        // that would otherwise overlap subsequent frames.
        if (iteration === 1) {
          await hideFloatingElements(tab.id!);
          // Wait briefly after initial hide
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        currentY += clientHeight;
        if (iteration > 50) break;
      }

      if (!captures.length) throw new Error('Capture failed: No frames received');

      const stitchedDataUrl = await stitchImages(captures, {
        totalHeight: scrollHeight,
        viewportHeight: clientHeight,
        width: dimensions.clientWidth,
        dpr,
      });

      return stitchedDataUrl;
    } finally {
      // @ts-ignore
      chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (x: number, y: number) => {
          const styleId = 'screenshot-hide-floating';
          const style = document.getElementById(styleId);
          if (style) style.remove();

          document.querySelectorAll('.wxt-screenshot-hidden').forEach(el => {
            el.classList.remove('wxt-screenshot-hidden');
            (el as HTMLElement).style.visibility = '';
            (el as HTMLElement).style.opacity = '';
            (el as HTMLElement).style.display = '';
          });
          window.scrollTo(x, y);
        },
        args: [originalScrollX, originalScrollY],
      });
    }
  }

  async function hideFloatingElements(tabId: number) {
    try {
      // @ts-ignore
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const styleId = 'screenshot-hide-floating';
          if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
              .wxt-screenshot-hidden {
                visibility: hidden !important;
                display: none !important;
                opacity: 0 !important;
                pointer-events: none !important;
              }
              .wxt-screenshot-hidden * {
                visibility: hidden !important;
                display: none !important;
              }
            `;
            document.head.appendChild(style);
          }

          const tags = [
            'header', 'nav', '.navbar', '.header', '.sticky',
            '#gb', '#searchform', '.RNNXbe', '.topbar', '.navigation',
            '#appbar', '[id*="search"]', '[class*="search"]',
            '[role="banner"]', '[role="navigation"]',
            '[id*="header"]', '[id*="navbar"]', '[class*="header"]', '[class*="navbar"]',
            '.tsf'
          ];

          tags.forEach(sel => {
            try {
              document.querySelectorAll(sel).forEach(el => {
                const s = getComputedStyle(el);
                if (s.position === 'fixed' || s.position === 'sticky') {
                  el.classList.add('wxt-screenshot-hidden');
                  // Hide children recursively to prevent "leakage"
                  el.querySelectorAll('*').forEach(child => (child as HTMLElement).classList.add('wxt-screenshot-hidden'));
                }
              });
            } catch (e) { }
          });

          // Broad scan for any fixed/sticky elements or high-zindex floating items
          document.querySelectorAll('*').forEach(el => {
            const s = getComputedStyle(el);
            const pos = s.position;
            const zIndex = parseInt(s.zIndex) || 0;

            if (pos === 'fixed' || pos === 'sticky') {
              el.classList.add('wxt-screenshot-hidden');
              el.querySelectorAll('*').forEach(child => (child as HTMLElement).classList.add('wxt-screenshot-hidden'));
            } else if (zIndex >= 50 && (pos === 'absolute' || pos === 'fixed')) {
              // Heuristic for elements moved by JS to mimic sticky/fixed
              const rect = el.getBoundingClientRect();
              if (rect.top <= 10 && rect.width > window.innerWidth * 0.45) {
                el.classList.add('wxt-screenshot-hidden');
                el.querySelectorAll('*').forEach(child => (child as HTMLElement).classList.add('wxt-screenshot-hidden'));
              }
            }
          });
        }
      });
    } catch (e) {
      console.error('Hiding floating elements failed:', e);
    }
  }

  async function stitchImages(
    captures: { dataUrl: string; y: number }[],
    opts: { totalHeight: number; viewportHeight: number; width: number; dpr: number }
  ): Promise<string> {
    const bitmaps: ImageBitmap[] = [];
    for (const capture of captures) {
      const response = await fetch(capture.dataUrl);
      const blob = await response.blob();
      bitmaps.push(await createImageBitmap(blob));
    }

    const canvasWidth = bitmaps[0].width;
    const viewportPixelHeight = bitmaps[0].height;

    // Increase SAFETY CAP to 30,000px for much longer page support
    const MAX_CANVAS_HEIGHT = 30000;
    const totalPixelHeight = Math.min(Math.ceil(opts.totalHeight * opts.dpr), MAX_CANVAS_HEIGHT);

    console.log(`Stitching ${captures.length} frames into ${canvasWidth}x${totalPixelHeight} canvas...`);

    let canvas: OffscreenCanvas;
    try {
      canvas = new OffscreenCanvas(canvasWidth, totalPixelHeight);
    } catch (e) {
      console.error('Canvas creation failed. Total height:', totalPixelHeight);
      throw new Error('Image too large: The screenshot exceeds browser limits. Try capturing a smaller area.');
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create stitching canvas context');

    for (let i = 0; i < bitmaps.length; i++) {
      const bitmap = bitmaps[i];
      const scrollY = captures[i].y * opts.dpr;

      // Stop drawing if we exceed the safety cap
      if (scrollY >= MAX_CANVAS_HEIGHT) break;

      if (i === 0) {
        // First frame: draw full viewport
        const drawHeight = Math.min(viewportPixelHeight, MAX_CANVAS_HEIGHT);
        ctx.drawImage(bitmap, 0, 0, bitmap.width, drawHeight, 0, 0, bitmap.width, drawHeight);
      } else {
        // Subsequent frames: anchor exactly at the end of the previous frame
        const prevScrollY = captures[i - 1].y * opts.dpr;
        const prevEndY = Math.round(prevScrollY + viewportPixelHeight);

        // Calculate how many pixels of current frame we already captured in previous frames
        // We use Math.ceil to ensure we cover any sub-pixel gaps
        const overlap = Math.max(0, Math.ceil(prevEndY - scrollY));

        // Final coordinates must be integers to prevent blurring
        // We anchor exactly where the previous frame ended
        const drawY = prevEndY;
        const availableHeight = Math.round(viewportPixelHeight - overlap);
        const drawHeight = Math.min(availableHeight, Math.round(MAX_CANVAS_HEIGHT - drawY));

        if (drawHeight > 0) {
          ctx.drawImage(
            bitmap,
            0, overlap, bitmap.width, drawHeight,
            0, drawY, bitmap.width, drawHeight
          );
        }
      }
    }

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return blobToDataUrl(blob);
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }
});
