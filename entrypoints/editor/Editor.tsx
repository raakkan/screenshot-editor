import React, { useEffect, useRef, useState, useCallback } from 'react';
import './editor.css';

type Tool = 'select' | 'pencil' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'text' | 'blur' | 'crop';

interface DrawingElement {
    id: string;
    type: Tool;
    points?: { x: number; y: number }[];
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    width?: number;
    height?: number;
    text?: string;
    color: string;
    lineWidth: number;
    filled?: boolean;
}

function Editor() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [imageData, setImageData] = useState<string | null>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tool, setTool] = useState<Tool>('select');
    const [color, setColor] = useState('#ff0000');
    const [lineWidth, setLineWidth] = useState(3);
    const [filled, setFilled] = useState(false);
    const [elements, setElements] = useState<DrawingElement[]>([]);
    const [history, setHistory] = useState<DrawingElement[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
    const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
    const [textValue, setTextValue] = useState('');
    const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [scale, setScale] = useState(1);
    const [zoom, setZoom] = useState(1);  // Manual zoom level
    const [fitScale, setFitScale] = useState(1);  // Auto-fit scale

    // Load image from storage on mount
    useEffect(() => {
        const loadImage = () => {
            console.log('Editor: Loading image from storage...');

            // Use chrome.storage directly for consistency with background script
            chrome.storage.local.get(['capturedImage'], (result) => {
                console.log('Editor: Storage callback received');
                console.log('Editor: Chrome runtime lastError:', chrome.runtime.lastError);

                if (chrome.runtime.lastError) {
                    console.error('Editor: Storage error:', chrome.runtime.lastError);
                    setError('Storage error: ' + chrome.runtime.lastError.message);
                    return;
                }

                console.log('Editor: Result keys:', Object.keys(result || {}));

                if (result?.capturedImage) {
                    console.log('Editor: Found image, length:', result.capturedImage.length);
                    setImageData(result.capturedImage);

                    const img = new Image();
                    img.onload = () => {
                        console.log('Editor: Image loaded, dimensions:', img.width, 'x', img.height);
                        setImage(img);
                    };
                    img.onerror = (e) => {
                        console.error('Editor: Image decode failed:', e);
                        setError('Failed to decode captured image');
                    };
                    img.src = result.capturedImage;
                } else {
                    console.log('Editor: No captured image found');
                    setError('No screenshot found. Please capture a screenshot first.');
                }
            });
        };

        // Delay to ensure storage is synced
        setTimeout(loadImage, 300);
    }, []);

    // Set canvas size when image loads
    useEffect(() => {
        if (!image || !canvasRef.current || !overlayCanvasRef.current || !containerRef.current) {
            console.log('Editor: Canvas setup skipped - missing refs or image');
            return;
        }

        console.log('Editor: Setting up canvas for image:', image.width, 'x', image.height);

        const container = containerRef.current;
        const maxWidth = container.clientWidth - 40;
        const maxHeight = container.clientHeight - 40;

        console.log('Editor: Container size:', maxWidth, 'x', maxHeight);

        let autoScale = 1;
        if (image.width > maxWidth || image.height > maxHeight) {
            autoScale = Math.min(maxWidth / image.width, maxHeight / image.height);
        }
        console.log('Editor: Auto-fit scale:', autoScale);
        setFitScale(autoScale);
        setScale(autoScale);  // Initial scale is fit-to-view
        setZoom(1);  // Reset zoom to 1x

        const canvas = canvasRef.current;
        const overlay = overlayCanvasRef.current;

        canvas.width = image.width;
        canvas.height = image.height;
        overlay.width = image.width;
        overlay.height = image.height;

        const displayWidth = image.width * autoScale;
        const displayHeight = image.height * autoScale;

        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        overlay.style.width = `${displayWidth}px`;
        overlay.style.height = `${displayHeight}px`;

        console.log('Editor: Canvas display size:', displayWidth, 'x', displayHeight);

        // Draw image directly here to ensure it happens
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
            console.log('Editor: Drawing image to canvas...');
            ctx.drawImage(image, 0, 0);
            console.log('Editor: Image drawn to canvas');
        } else {
            console.error('Editor: Failed to get canvas context');
        }
    }, [image]);

    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image) {
            console.log('Editor: Redraw skipped - no canvas or image');
            return;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            console.error('Editor: Could not get canvas 2d context');
            return;
        }

        console.log('Editor: Redrawing canvas with', elements.length, 'elements');

        // Clear and draw base image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);

        // Draw all elements
        elements.forEach((el, i) => {
            console.log(`Editor: Drawing element ${i}: type=${el.type}, color=${el.color}`);
            if (el.type === 'text') {
                console.log(`Editor: Text element details: text="${el.text}", x=${el.startX}, y=${el.startY}`);
            }
            drawElement(ctx, el);
        });
    }, [elements, image]);

    // Draw preview on overlay whenever currentElement changes
    useEffect(() => {
        const overlay = overlayCanvasRef.current;
        if (!overlay) return;

        const ctx = overlay.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (currentElement) {
            drawElement(ctx, currentElement);
        }
    }, [currentElement]);

    // Redraw canvas whenever elements change
    useEffect(() => {
        if (image) {
            console.log('Editor: Redrawing canvas due to elements change');
            redrawCanvas();
        }
    }, [elements, image, redrawCanvas]);

    const drawElement = (ctx: CanvasRenderingContext2D, el: DrawingElement) => {
        ctx.strokeStyle = el.color;
        ctx.fillStyle = el.color;
        ctx.lineWidth = el.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (el.type) {
            case 'pencil':
                if (!el.points || el.points.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(el.points[0].x, el.points[0].y);
                el.points.forEach(p => ctx.lineTo(p.x, p.y));
                ctx.stroke();
                break;

            case 'line':
                if (el.startX === undefined || el.startY === undefined || el.endX === undefined || el.endY === undefined) return;
                ctx.beginPath();
                ctx.moveTo(el.startX, el.startY);
                ctx.lineTo(el.endX, el.endY);
                ctx.stroke();
                break;

            case 'arrow':
                if (el.startX === undefined || el.startY === undefined || el.endX === undefined || el.endY === undefined) return;
                drawArrow(ctx, el.startX, el.startY, el.endX, el.endY, el.lineWidth);
                break;

            case 'rectangle':
                if (el.startX === undefined || el.startY === undefined || el.endX === undefined || el.endY === undefined || el.width === undefined || el.height === undefined) return;
                const rectX = Math.min(el.startX, el.endX);
                const rectY = Math.min(el.startY, el.endY);
                if (el.filled) {
                    ctx.globalAlpha = 0.3;
                    ctx.fillRect(rectX, rectY, el.width, el.height);
                    ctx.globalAlpha = 1;
                }
                ctx.strokeRect(rectX, rectY, el.width, el.height);
                break;

            case 'circle':
                if (el.startX === undefined || el.startY === undefined || el.endX === undefined || el.endY === undefined || el.width === undefined || el.height === undefined) return;
                const circX = Math.min(el.startX, el.endX);
                const circY = Math.min(el.startY, el.endY);
                const radiusX = el.width / 2;
                const radiusY = el.height / 2;
                const centerX = circX + radiusX;
                const centerY = circY + radiusY;
                ctx.beginPath();
                ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
                if (el.filled) {
                    ctx.globalAlpha = 0.3;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
                ctx.stroke();
                break;

            case 'text':
                if (el.startX === undefined || el.startY === undefined || !el.text) {
                    console.log('Editor: Skipping text element - missing data');
                    return;
                }
                const fontSize = Math.max(16, el.lineWidth * 6);
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textBaseline = 'top';
                console.log(`Editor: Drawing text "${el.text}" at (${el.startX}, ${el.startY}) with color ${el.color} and font ${ctx.font}`);
                ctx.fillText(el.text, el.startX, el.startY);
                break;

            case 'blur':
                if (el.startX === undefined || el.startY === undefined || el.endX === undefined || el.endY === undefined || el.width === undefined || el.height === undefined) return;

                // If it's the overlay context (preview), draw a dashed rectangle instead of blurring
                if (ctx.canvas === overlayCanvasRef.current) {
                    ctx.setLineDash([5, 5]);
                    ctx.strokeRect(Math.min(el.startX, el.endX), Math.min(el.startY, el.endY), el.width, el.height);
                    ctx.setLineDash([]);
                    return;
                }

                // Final application to main canvas
                const blurX = Math.floor(Math.min(el.startX, el.endX));
                const blurY = Math.floor(Math.min(el.startY, el.endY));
                const blurW = Math.ceil(el.width);
                const blurH = Math.ceil(el.height);
                applyBlur(ctx, blurX, blurY, blurW, blurH);
                break;
        }
    };

    const drawArrow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number) => {
        const headLength = width * 4;
        const angle = Math.atan2(y2 - y1, x2 - x1);

        // Draw line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Draw arrowhead
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    };

    const applyBlur = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
        if (w <= 0 || h <= 0) return;

        const pixelSize = 8;
        const imageData = ctx.getImageData(x, y, w, h);
        const data = imageData.data;

        for (let py = 0; py < h; py += pixelSize) {
            for (let px = 0; px < w; px += pixelSize) {
                let r = 0, g = 0, b = 0, count = 0;

                for (let dy = 0; dy < pixelSize && py + dy < h; dy++) {
                    for (let dx = 0; dx < pixelSize && px + dx < w; dx++) {
                        const idx = ((py + dy) * w + (px + dx)) * 4;
                        r += data[idx];
                        g += data[idx + 1];
                        b += data[idx + 2];
                        count++;
                    }
                }

                r = Math.round(r / count);
                g = Math.round(g / count);
                b = Math.round(b / count);

                for (let dy = 0; dy < pixelSize && py + dy < h; dy++) {
                    for (let dx = 0; dx < pixelSize && px + dx < w; dx++) {
                        const idx = ((py + dy) * w + (px + dx)) * 4;
                        data[idx] = r;
                        data[idx + 1] = g;
                        data[idx + 2] = b;
                    }
                }
            }
        }

        ctx.putImageData(imageData, x, y);
    };

    const getCanvasCoordinates = (e: React.MouseEvent): { x: number; y: number } => {
        const canvas = overlayCanvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / scale,
            y: (e.clientY - rect.top) / scale,
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const coords = getCanvasCoordinates(e);

        // Text tool shows floating editor
        if (tool === 'text') {
            console.log('Editor: Opening floating text input at', coords);
            setTextInput({ x: coords.x, y: coords.y, visible: true });
            setTextValue('');
            return;
        }

        // Crop tool - start selection
        if (tool === 'crop') {
            setIsDrawing(true);
            setCropRect({ x: coords.x, y: coords.y, width: 0, height: 0 });
            return;
        }

        setIsDrawing(true);

        const newElement: DrawingElement = {
            id: Date.now().toString(),
            type: tool,
            color,
            lineWidth,
            filled,
            startX: coords.x,
            startY: coords.y,
            endX: coords.x,
            endY: coords.y,
            width: 0,
            height: 0,
            points: tool === 'pencil' ? [{ x: coords.x, y: coords.y }] : undefined,
        };

        setCurrentElement(newElement);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing) return;

        const coords = getCanvasCoordinates(e);

        // Crop tool - update selection rectangle
        if (tool === 'crop') {
            setCropRect(prev => {
                if (!prev) return null;
                return {
                    x: Math.min(prev.x, coords.x),
                    y: Math.min(prev.y, coords.y),
                    width: Math.abs(coords.x - prev.x),
                    height: Math.abs(coords.y - prev.y),
                };
            });
            return;
        }

        setCurrentElement(prev => {
            if (!prev) return null;
            const updated = { ...prev };

            if (prev.type === 'pencil') {
                const newPoint = { x: Math.round(coords.x), y: Math.round(coords.y) };
                // Only add if coordinate changed significantly to reduce point float
                const lastPoint = prev.points?.[prev.points.length - 1];
                if (!lastPoint || Math.abs(lastPoint.x - newPoint.x) > 1 || Math.abs(lastPoint.y - newPoint.y) > 1) {
                    updated.points = [...(prev.points || []), newPoint];
                }
            } else {
                updated.endX = coords.x;
                updated.endY = coords.y;
                updated.width = Math.abs(coords.x - (prev.startX || 0));
                updated.height = Math.abs(coords.y - (prev.startY || 0));
            }

            return updated;
        });
    };

    const handleMouseUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        // Crop tool - don't add to elements, keep cropRect visible
        if (tool === 'crop') {
            // Clear overlay after drawing crop preview
            const overlay = overlayCanvasRef.current;
            if (overlay) {
                const ctx = overlay.getContext('2d', { willReadFrequently: true });
                if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
            }
            return;
        }

        // Clear overlay
        const overlay = overlayCanvasRef.current;
        if (overlay) {
            const ctx = overlay.getContext('2d', { willReadFrequently: true });
            if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
        }

        setCurrentElement(finalEl => {
            if (finalEl) {
                setElements(prev => {
                    const next = [...prev, finalEl];
                    addToHistory(next);
                    return next;
                });
            }
            return null;
        });
    };

    const addToHistory = useCallback((newElements: DrawingElement[]) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newElements);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, [history, historyIndex, history.length]);

    const handleTextSubmit = useCallback(() => {
        console.log('Editor: Submitting text:', textValue, 'at position:', textInput);

        if (!textValue.trim()) {
            console.log('Editor: Empty text, not adding element');
            setTextInput(prev => ({ ...prev, visible: false }));
            setTextValue('');
            return;
        }

        const newElement: DrawingElement = {
            id: Date.now().toString(),
            type: 'text',
            color,
            lineWidth,
            startX: textInput.x,
            startY: textInput.y,
            text: textValue.trim(),
            filled: false,
        };

        console.log('Editor: Creating text element:', newElement);

        setElements(prev => {
            const next = [...prev, newElement];
            addToHistory(next);
            console.log('Editor: Text element added, total elements:', next.length);
            return next;
        });

        setTextInput(prev => ({ ...prev, visible: false }));
        setTextValue('');
    }, [color, lineWidth, textValue, textInput, addToHistory]);

    const undo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
            setElements(history[historyIndex - 1]);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
            setElements(history[historyIndex + 1]);
        }
    };

    const handleDownload = (format: 'png' | 'jpeg') => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const link = document.createElement('a');
        link.download = `screenshot-${Date.now()}.${format}`;
        link.href = canvas.toDataURL(`image/${format}`, format === 'jpeg' ? 0.9 : undefined);
        link.click();
    };

    const handleCopyToClipboard = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create blob'));
                }, 'image/png');
            });

            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);

            alert('Copied to clipboard!');
        } catch (error) {
            console.error('Copy failed:', error);
            alert('Failed to copy to clipboard');
        }
    };

    const applyCrop = useCallback(() => {
        if (!cropRect || !canvasRef.current || !image) return;

        const { x, y, width, height } = cropRect;
        if (width < 10 || height < 10) {
            alert('Crop area too small');
            return;
        }

        // Create a new canvas with the cropped dimensions
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = width;
        croppedCanvas.height = height;
        const croppedCtx = croppedCanvas.getContext('2d', { willReadFrequently: true });
        if (!croppedCtx) return;

        // Draw from the main canvas (which includes all annotations)
        const mainCanvas = canvasRef.current;
        croppedCtx.drawImage(mainCanvas, x, y, width, height, 0, 0, width, height);

        // Create new image from cropped canvas
        const croppedDataUrl = croppedCanvas.toDataURL('image/png');
        const newImage = new Image();
        newImage.onload = () => {
            setImage(newImage);
            setElements([]);  // Clear all elements since they're baked in
            setHistory([[]]);  // Reset history
            setHistoryIndex(0);
            setCropRect(null);  // Clear crop selection
        };
        newImage.src = croppedDataUrl;
    }, [cropRect, image]);

    const cancelCrop = useCallback(() => {
        setCropRect(null);
    }, []);

    // Zoom controls
    const zoomIn = useCallback(() => {
        setZoom(z => z < 3 ? z + 0.25 : z + 0.5);  // Faster zoom at higher levels
    }, []);

    const zoomOut = useCallback(() => {
        setZoom(z => z > 3 ? z - 0.5 : Math.max(z - 0.25, 0.1));
    }, []);

    const resetZoom = useCallback(() => {
        setZoom(1);
    }, []);

    // Update canvas display size when zoom changes
    useEffect(() => {
        if (!image || !canvasRef.current || !overlayCanvasRef.current) return;

        const effectiveScale = fitScale * zoom;
        setScale(effectiveScale);

        const displayWidth = image.width * effectiveScale;
        const displayHeight = image.height * effectiveScale;

        const canvas = canvasRef.current;
        const overlay = overlayCanvasRef.current;

        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        overlay.style.width = `${displayWidth}px`;
        overlay.style.height = `${displayHeight}px`;
    }, [zoom, fitScale, image]);

    const tools: { id: Tool; icon: string; label: string }[] = [
        { id: 'crop', icon: '✂️', label: 'Crop' },
        { id: 'pencil', icon: '✏️', label: 'Pencil' },
        { id: 'line', icon: '/', label: 'Line' },
        { id: 'arrow', icon: '➔', label: 'Arrow' },
        { id: 'rectangle', icon: '▢', label: 'Rectangle' },
        { id: 'circle', icon: '○', label: 'Circle' },
        { id: 'text', icon: 'T', label: 'Text' },
        { id: 'blur', icon: '▒', label: 'Blur' },
    ];

    // Show error state
    if (error) {
        return (
            <div className="editor-loading">
                <p style={{ color: '#ff6b6b' }}>⚠️ {error}</p>
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        marginTop: '16px',
                        padding: '8px 16px',
                        background: '#6366f1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!imageData) {
        return (
            <div className="editor-loading">
                <div className="spinner"></div>
                <p>Loading screenshot...</p>
            </div>
        );
    }

    return (
        <div className="editor-container">
            <header className="editor-header">
                <h1>📸 Screenshot Editor</h1>
                <div className="header-actions">
                    <button onClick={zoomOut} title="Zoom Out">➖</button>
                    <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                    <button onClick={zoomIn} title="Zoom In">➕</button>
                    <button onClick={resetZoom} title="Reset Zoom">⟲</button>
                    <div className="divider"></div>
                    <button onClick={undo} disabled={historyIndex <= 0} title="Undo">↶ Undo</button>
                    <button onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo">↷ Redo</button>
                    <div className="divider"></div>
                    <button onClick={handleCopyToClipboard} className="primary">📋 Copy</button>
                    <button onClick={() => handleDownload('png')} className="primary">💾 PNG</button>
                    <button onClick={() => handleDownload('jpeg')}>💾 JPEG</button>
                </div>
            </header>

            <div className="editor-main">
                <aside className="toolbar">
                    <div className="tool-group">
                        <label>Tools</label>
                        {tools.map(t => (
                            <button
                                key={t.id}
                                className={`tool-btn ${tool === t.id ? 'active' : ''}`}
                                onClick={() => setTool(t.id)}
                                title={t.label}
                            >
                                <span className="icon">{t.icon}</span>
                                <span className="label">{t.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="tool-group">
                        <label>Color</label>
                        <div className="color-picker">
                            <input
                                type="color"
                                value={color}
                                onChange={e => setColor(e.target.value)}
                            />
                            <div className="preset-colors">
                                {['#ff0000', '#ff9500', '#ffcc00', '#00ff00', '#00ccff', '#0066ff', '#9933ff', '#ff00ff', '#000000', '#ffffff'].map(c => (
                                    <button
                                        key={c}
                                        className={`color-swatch ${color === c ? 'active' : ''}`}
                                        style={{ background: c, border: c === '#ffffff' ? '1px solid #ccc' : 'none' }}
                                        onClick={() => setColor(c)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="tool-group">
                        <label>Size: {lineWidth}px</label>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            value={lineWidth}
                            onChange={e => setLineWidth(parseInt(e.target.value))}
                        />
                    </div>

                    {(tool === 'rectangle' || tool === 'circle') && (
                        <div className="tool-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={filled}
                                    onChange={e => setFilled(e.target.checked)}
                                />
                                Fill shape
                            </label>
                        </div>
                    )}
                </aside>

                <div className="canvas-container" ref={containerRef}>
                    <div className="canvas-wrapper">
                        <canvas ref={canvasRef} />
                        <canvas
                            ref={overlayCanvasRef}
                            className={`overlay-canvas ${tool} ${isDrawing ? 'drawing' : ''}`}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        />
                        {/* Crop selection overlay */}
                        {cropRect && cropRect.width > 0 && cropRect.height > 0 && (
                            <>
                                <div
                                    className="crop-overlay"
                                    style={{
                                        left: cropRect.x * scale,
                                        top: cropRect.y * scale,
                                        width: cropRect.width * scale,
                                        height: cropRect.height * scale,
                                    }}
                                >
                                    <div className="crop-size-label">
                                        {Math.round(cropRect.width)} × {Math.round(cropRect.height)}
                                    </div>
                                </div>
                                <div className="crop-actions">
                                    <button onClick={applyCrop} className="crop-apply">✅ Apply Crop</button>
                                    <button onClick={cancelCrop} className="crop-cancel">❌ Cancel</button>
                                </div>
                            </>
                        )}
                        {textInput.visible && (
                            <div
                                className="floating-text-editor"
                                style={{
                                    left: textInput.x * scale,
                                    top: textInput.y * scale,
                                }}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Type here..."
                                    value={textValue}
                                    onChange={e => setTextValue(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleTextSubmit();
                                        if (e.key === 'Escape') setTextInput({ ...textInput, visible: false });
                                    }}
                                    style={{
                                        color: color,
                                        fontSize: Math.max(16, lineWidth * 4),
                                    }}
                                />
                                <div className="text-editor-actions">
                                    <button onClick={handleTextSubmit} title="Submit">✅</button>
                                    <button onClick={() => setTextInput({ ...textInput, visible: false })} title="Cancel">❌</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Editor;
