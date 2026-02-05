// Background script for handling screenshot capture
export default defineBackground(() => {
  console.log('Screenshot Editor background script loaded');

  // Listen for messages from popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'capture') {
      // Handle capture asynchronously
      handleCapture(message.mode)
        .then((result) => {
          sendResponse(result);
        })
        .catch((error: any) => {
          console.error('Capture error:', error);
          let errorMessage = error.message || 'Unknown error';

          if (errorMessage.includes('Cannot access') || errorMessage.includes('restricted')) {
            errorMessage = 'Browser restriction: Cannot capture internal browser pages (chrome://, edge://, or extension pages). Please try on a regular website.';
          } else if (errorMessage.includes('Could not establish connection')) {
            errorMessage = 'Injection failed: Browser blocked the script. This often happens on protected pages or internal browser tabs.';
          }

          sendResponse({ success: false, error: errorMessage });
        });

      // Return true to indicate async response
      return true;
    }

    // Handle selection complete message from content script
    if (message.type === 'selection-complete') {
      return false; // Handled by waitForSelection listener
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

      console.log('Captured image, length:', imageDataUrl.length);

      // Store the captured image
      await browser.storage.local.set({ capturedImage: imageDataUrl });
      console.log('Image stored in local storage');

      // Open editor in new tab
      await browser.tabs.create({
        url: browser.runtime.getURL('/editor.html'),
      });

      return { success: true };
    } catch (error) {
      console.error('Capture failed:', error);
      throw error;
    }
  }

  // Capture visible tab - simplest mode, no extra APIs needed
  async function captureVisibleTab(): Promise<string> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    console.log('Capturing visible tab:', tab.id);

    // Use chrome API directly for MV3 compatibility
    const dataUrl = await new Promise<string>((resolve, reject) => {
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

    console.log('Captured data URL length:', dataUrl?.length);
    return dataUrl;
  }

  // Capture with user selection
  async function captureWithSelection(): Promise<string> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    // Dynamically inject content script to ensure it's loaded
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/content.js'],
      });
      console.log('Content script injected successfully');
    } catch (e) {
      console.log('Content script may already be injected or page is protected:', e);
    }

    // Small delay to ensure script is ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send message to content script to start selection
    await browser.tabs.sendMessage(tab.id, { type: 'start-selection' });

    // Wait for user to make selection
    const rect = await waitForSelection(tab.id);

    // Small delay to ensure overlay is removed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Capture the visible tab using chrome API
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

    // Crop the image to selection
    const croppedDataUrl = await cropImage(fullDataUrl, rect, tab.id);
    return croppedDataUrl;
  }

  // Wait for selection from content script
  function waitForSelection(tabId: number): Promise<{ x: number; y: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        browser.runtime.onMessage.removeListener(listener);
        reject(new Error('Selection timeout'));
      }, 60000); // 1 minute timeout

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

  // Crop image to selection rectangle
  async function cropImage(
    dataUrl: string,
    rect: { x: number; y: number; width: number; height: number },
    tabId: number
  ): Promise<string> {
    // Get device pixel ratio from the tab using chrome API
    const dpr = await new Promise<number>((resolve) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => window.devicePixelRatio,
        },
        (results) => {
          resolve(results?.[0]?.result || 1);
        }
      );
    });

    // Create offscreen canvas for cropping
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(rect.width * dpr, rect.height * dpr);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create canvas context');

    ctx.drawImage(
      bitmap,
      rect.x * dpr,
      rect.y * dpr,
      rect.width * dpr,
      rect.height * dpr,
      0,
      0,
      rect.width * dpr,
      rect.height * dpr
    );

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return blobToDataUrl(croppedBlob);
  }

  // Capture full page with scrolling
  async function captureFullPage(): Promise<string> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    console.log('Full page: Triggering lazy loading by scrolling through page...');

    // First, scroll through the entire page to trigger lazy loading
    // This is necessary for sites like Flipkart that only load content as you scroll
    await new Promise<void>((resolve) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id! },
          func: async () => {
            const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
            const viewportHeight = window.innerHeight;
            let currentY = 0;
            let lastHeight = 0;
            let sameHeightCount = 0;

            // Scroll incrementally to trigger lazy loading
            while (sameHeightCount < 3) {  // Stop when height stabilizes
              window.scrollTo(0, currentY);
              await delay(200);  // Wait for content to load

              const newHeight = Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
              );

              if (newHeight === lastHeight) {
                sameHeightCount++;
              } else {
                sameHeightCount = 0;
                lastHeight = newHeight;
              }

              currentY += viewportHeight;

              // Safety limit
              if (currentY > 100000) break;
            }

            // Scroll back to top
            window.scrollTo(0, 0);
          },
        },
        () => resolve()
      );
    });

    // Wait for any final lazy content to settle
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get page dimensions using chrome.scripting
    const dimensions = await new Promise<any>((resolve) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id! },
          func: () => ({
            scrollHeight: Math.max(
              document.body.scrollHeight,
              document.documentElement.scrollHeight,
              document.body.offsetHeight,
              document.documentElement.offsetHeight
            ),
            scrollWidth: document.documentElement.scrollWidth,
            clientHeight: window.innerHeight,
            clientWidth: window.innerWidth,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            devicePixelRatio: window.devicePixelRatio,
          }),
        },
        (results) => {
          resolve(results?.[0]?.result);
        }
      );
    });

    if (!dimensions) throw new Error('Could not get page dimensions');

    const { scrollHeight, clientHeight, scrollX, scrollY, devicePixelRatio: dpr } = dimensions;

    console.log('Full page capture dimensions:', {
      scrollHeight,
      clientHeight,
      viewports: Math.ceil(scrollHeight / clientHeight),
      dpr
    });

    // Store original scroll position
    const originalScrollX = scrollX;
    const originalScrollY = scrollY;

    const captures: { dataUrl: string; y: number }[] = [];
    let currentY = 0;

    try {
      // Capture each viewport
      let iteration = 0;
      while (currentY < scrollHeight) {
        iteration++;

        // Scroll to position
        const actualScrollY = await new Promise<number>((resolve) => {
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id! },
              func: (y: number) => {
                window.scrollTo(0, y);
                return window.scrollY;  // Return actual scroll position (may be capped by browser)
              },
              args: [currentY],
            },
            (results) => resolve(results?.[0]?.result ?? currentY)
          );
        });

        console.log(`Full page: Capturing viewport ${iteration}, requested=${currentY}, actual=${actualScrollY}, scrollHeight=${scrollHeight}`);

        // Wait for render (500ms to avoid Chrome's rate limit on captureVisibleTab)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Capture visible portion (specify windowId to avoid capturing DevTools)
        const dataUrl = await new Promise<string>((resolve, reject) => {
          chrome.tabs.captureVisibleTab(
            tab.windowId,
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

        captures.push({ dataUrl, y: actualScrollY });  // Use actual scroll position
        currentY += clientHeight;

        // After first capture, hide fixed/sticky elements to avoid duplicate headers
        if (iteration === 1) {
          await new Promise<void>((resolve) => {
            chrome.scripting.executeScript(
              {
                target: { tabId: tab.id! },
                func: () => {
                  // Create a style tag to hide fixed/sticky elements
                  const style = document.createElement('style');
                  style.id = 'screenshot-hide-fixed';
                  style.textContent = `
                    [style*="position: fixed"], [style*="position:fixed"],
                    [style*="position: sticky"], [style*="position:sticky"] {
                      visibility: hidden !important;
                    }
                  `;
                  document.head.appendChild(style);

                  // Also hide elements with computed fixed/sticky position
                  document.querySelectorAll('*').forEach(el => {
                    const pos = getComputedStyle(el).position;
                    if (pos === 'fixed' || pos === 'sticky') {
                      (el as HTMLElement).dataset.screenshotHidden = 'true';
                      (el as HTMLElement).style.visibility = 'hidden';
                    }
                  });
                },
              },
              () => resolve()
            );
          });
        }

        // Safety limit to prevent infinite loops
        if (iteration > 50) {
          console.warn('Full page: Hit safety limit of 50 viewports');
          break;
        }
      }

      console.log(`Full page: Captured ${captures.length} viewports`);

      // Stitch images together
      const stitchedDataUrl = await stitchImages(captures, {
        totalHeight: scrollHeight,
        viewportHeight: clientHeight,
        width: dimensions.clientWidth,  // Use clientWidth, not scrollWidth
        dpr,
      });

      return stitchedDataUrl;
    } finally {
      // Restore fixed/sticky elements and scroll position
      chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (x: number, y: number) => {
          // Remove the hide style
          const style = document.getElementById('screenshot-hide-fixed');
          if (style) style.remove();

          // Restore hidden elements
          document.querySelectorAll('[data-screenshot-hidden="true"]').forEach(el => {
            (el as HTMLElement).style.visibility = '';
            delete (el as HTMLElement).dataset.screenshotHidden;
          });

          // Restore scroll position
          window.scrollTo(x, y);
        },
        args: [originalScrollX, originalScrollY],
      });
    }
  }

  // Stitch multiple captures into one image
  async function stitchImages(
    captures: { dataUrl: string; y: number }[],
    opts: { totalHeight: number; viewportHeight: number; width: number; dpr: number }
  ): Promise<string> {
    if (captures.length === 0) throw new Error('No captures to stitch');

    // First, load all bitmaps to get actual dimensions
    const bitmaps: ImageBitmap[] = [];
    for (const capture of captures) {
      const response = await fetch(capture.dataUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      bitmaps.push(bitmap);
    }

    // Use first bitmap's dimensions
    const canvasWidth = bitmaps[0].width;
    const viewportPixelHeight = bitmaps[0].height;
    const totalPixelHeight = Math.ceil(opts.totalHeight * opts.dpr);

    console.log('Stitching:', captures.length, 'captures, canvas size:', canvasWidth, 'x', totalPixelHeight);

    const canvas = new OffscreenCanvas(canvasWidth, totalPixelHeight);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not create canvas context');

    for (let i = 0; i < bitmaps.length; i++) {
      const bitmap = bitmaps[i];
      const scrollY = captures[i].y * opts.dpr;  // Scroll position in pixels

      if (i === bitmaps.length - 1 && captures.length > 1) {
        // Last capture - may overlap with previous capture
        // Draw only the non-overlapping portion at the bottom
        const previousEndY = (captures[i - 1].y + opts.viewportHeight) * opts.dpr;
        const overlapPixels = previousEndY - scrollY;

        if (overlapPixels > 0 && overlapPixels < bitmap.height) {
          // Draw only the portion below the overlap
          const sourceY = overlapPixels;
          const sourceHeight = bitmap.height - overlapPixels;
          const destY = previousEndY;

          ctx.drawImage(
            bitmap,
            0, sourceY, bitmap.width, sourceHeight,  // Source: skip overlapping top
            0, destY, bitmap.width, sourceHeight     // Dest: continue from where previous ended
          );
        } else {
          // No overlap or full overlap, draw at scroll position
          const remainingHeight = totalPixelHeight - scrollY;
          ctx.drawImage(
            bitmap,
            0, 0, bitmap.width, Math.min(bitmap.height, remainingHeight),
            0, scrollY, bitmap.width, Math.min(bitmap.height, remainingHeight)
          );
        }
      } else {
        // First or middle captures - draw full viewport
        ctx.drawImage(
          bitmap,
          0, 0, bitmap.width, viewportPixelHeight,
          0, scrollY, bitmap.width, viewportPixelHeight
        );
      }
    }

    const stitchedBlob = await canvas.convertToBlob({ type: 'image/png' });
    return blobToDataUrl(stitchedBlob);
  }

  // Helper to convert blob to data URL
  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
});
