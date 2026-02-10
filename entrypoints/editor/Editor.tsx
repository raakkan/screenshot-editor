import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Arrow, Rect, Ellipse, Text, Transformer } from 'react-konva';
import Konva from 'konva';
import './editor.css';
import logo from '../../assets/logo.png';
import {
    IconUndo, IconRedo, IconCopy, IconSave, IconDownload,
    IconCrop, IconPencil, IconLine, IconArrow, IconSquare,
    IconCircle, IconType, IconBlur, IconTrash, IconEye,
    IconEyeOff, IconPlus, IconMinus, IconRotateCcw, IconCheck, IconClose,
    IconAlert, IconAlignLeft, IconAlignCenter, IconAlignRight, IconCase,
    IconBookmark, IconLayers, IconSettings, IconRefresh, IconImage
} from './Icons';

type Tool = 'crop' | 'pencil' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'text' | 'blur' | 'image';

interface DrawingElement {
    id: string;
    type: Tool;
    points?: number[];
    x: number;
    y: number;
    width?: number;
    height?: number;
    text?: string;
    color: string;
    strokeWidth: number;
    filled?: boolean;
    visible: boolean;
    name: string;
    // Advanced properties
    opacity?: number;
    dash?: number[] | null;
    pointerAtStart?: boolean;
    fontFamily?: string;
    fontSize?: number;
    bgColor?: string;
    strokeColor?: string;
    shadowBlur?: number;
    shadowOffset?: number;
    shadowColor?: string;
    letterSpacing?: number;
    lineHeight?: number;
    textCase?: 'none' | 'uppercase' | 'capitalize';
    align?: string;
    imageSrc?: string;
}

interface Preset {
    id: string;
    name: string;
    elements: DrawingElement[];
}

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'info' | 'error';
}

const AVAILABLE_FONTS = [
    { name: 'Inter', category: 'sans-serif' },
    { name: 'Roboto', category: 'sans-serif' },
    { name: 'Open Sans', category: 'sans-serif' },
    { name: 'Lato', category: 'sans-serif' },
    { name: 'Montserrat', category: 'sans-serif' },
    { name: 'Poppins', category: 'sans-serif' },
    { name: 'Playfair Display', category: 'serif' },
    { name: 'Merriweather', category: 'serif' },
    { name: 'Lora', category: 'serif' },
    { name: 'Fira Code', category: 'monospace' },
    { name: 'Source Code Pro', category: 'monospace' },
    { name: 'JetBrains Mono', category: 'monospace' },
    { name: 'Bangers', category: 'display' },
    { name: 'Bebas Neue', category: 'display' },
    { name: 'Anton', category: 'display' },
    { name: 'Luckiest Guy', category: 'display' },
    { name: 'Permanent Marker', category: 'handwriting' },
    { name: 'Pacifico', category: 'handwriting' },
    { name: 'Lobster', category: 'handwriting' },
];

const PixelatedBlur: React.FC<{
    image: HTMLImageElement;
    x: number;
    y: number;
    width: number;
    height: number;
    pixelSize?: number;
    commonProps: any;
}> = ({ image, x, y, width, height, pixelSize = 10, commonProps }) => {
    const [blurredImage, setBlurredImage] = React.useState<HTMLImageElement | null>(null);

    React.useEffect(() => {
        if (!image || width <= 0 || height <= 0) return;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(image, x, y, width, height, 0, 0, width, height);

        const smallWidth = Math.max(1, Math.ceil(width / pixelSize));
        const smallHeight = Math.max(1, Math.ceil(height / pixelSize));

        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = smallWidth;
        smallCanvas.height = smallHeight;
        const smallCtx = smallCanvas.getContext('2d');
        if (!smallCtx) return;

        smallCtx.drawImage(canvas, 0, 0, width, height, 0, 0, smallWidth, smallHeight);

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(smallCanvas, 0, 0, smallWidth, smallHeight, 0, 0, width, height);

        const img = new Image();
        img.onload = () => setBlurredImage(img);
        img.src = canvas.toDataURL();
    }, [image, x, y, width, height, pixelSize]);

    if (!blurredImage) {
        return <Rect {...commonProps} width={width} height={height} fill="rgba(128, 128, 128, 0.9)" />;
    }

    return <KonvaImage {...commonProps} image={blurredImage} width={width} height={height} />;
};

const ImageElement: React.FC<{
    src: string;
    commonProps: any;
    width?: number;
    height?: number;
}> = ({ src, commonProps, width, height }) => {
    const [img, setImg] = React.useState<HTMLImageElement | null>(null);

    React.useEffect(() => {
        const image = new Image();
        image.src = src;
        image.onload = () => {
            setImg(image);
        };
    }, [src]);

    if (!img) return null;

    return <KonvaImage {...commonProps} image={img} width={width} height={height} />;
};

function Editor() {
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    const textInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const activeFontLoads = useRef<Set<string>>(new Set());

    const [imageData, setImageData] = useState<string | null>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

    const [tool, setTool] = useState<Tool>('crop');
    const [color, setColor] = useState('#6366f1');
    const [strokeWidth, setStrokeWidth] = useState(3);
    const [filled, setFilled] = useState(false);

    const [opacity, setOpacity] = useState(1);
    const [dashEnabled, setDashEnabled] = useState(false);
    const [dashStyle, setDashStyle] = useState<number[]>([10, 5]);
    const [pointerAtStart, setPointerAtStart] = useState(false);

    const [fontFamily, setFontFamily] = useState('Inter');
    const [fontSize, setFontSize] = useState(24);
    const [bgColor, setBgColor] = useState('#ffffff');
    const [strokeColor, setStrokeColor] = useState('#000000');
    const [shadowBlur, setShadowBlur] = useState(0);
    const [shadowOffset, setShadowOffset] = useState(0);
    const [shadowColor, setShadowColor] = useState('#000000');
    const [letterSpacing, setLetterSpacing] = useState(0);
    const [lineHeight, setLineHeight] = useState(1.2);
    const [textCase, setTextCase] = useState<'none' | 'uppercase' | 'capitalize'>('none');
    const [align, setAlign] = useState<'left' | 'center' | 'right'>('left');

    const [loadedFonts, setLoadedFonts] = useState<string[]>(['Inter', 'Arial', 'Verdana']);
    const [loadingFont, setLoadingFont] = useState<string | null>(null);

    const [elements, setElements] = useState<DrawingElement[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);

    const [history, setHistory] = useState<DrawingElement[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean; editingId: string | null }>({
        x: 0, y: 0, visible: false, editingId: null
    });
    const [textValue, setTextValue] = useState('');

    const [zoom, setZoom] = useState(0.5); // Start with 0.5 to ensure visibility
    const [elementCounter, setElementCounter] = useState(1);

    const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [isCropping, setIsCropping] = useState(false);
    const [redrawCounter, setRedrawCounter] = useState(0);

    const [presets, setPresets] = useState<Preset[]>([]);
    const [activePresetId, setActivePresetId] = useState<string | null>(null);
    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
    const [presetNameInput, setPresetNameInput] = useState('');
    const [toasts, setToasts] = useState<Toast[]>([]);

    const templatesRef = useRef<HTMLDivElement>(null);

    const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    useEffect(() => {
        const loadImage = () => {
            console.log('Editor: Attempting to load captured image...');
            (window as any).chrome.storage.local.get(['capturedImage', 'stylePresets'], (result: { capturedImage?: string; stylePresets?: Preset[] }) => {
                if ((window as any).chrome.runtime.lastError) {
                    console.error('Editor: Storage retrieval failed:', (window as any).chrome.runtime.lastError);
                    setError('Storage retrieval failed');
                    return;
                }

                if (result?.stylePresets) {
                    setPresets(result.stylePresets);
                }

                if (result?.capturedImage) {
                    const dataLength = result.capturedImage.length;
                    console.log(`Editor: Image found, Data URL length: ${dataLength} characters (~${Math.round(dataLength / 1024 / 1024)} MB)`);

                    setImageData(result.capturedImage);
                    const img = new window.Image();

                    img.onload = () => {
                        console.log(`Editor: Image rendered successfully (${img.width}x${img.height})`);
                        setImage(img);

                        setStageSize({ width: img.width, height: img.height });
                        setTimeout(() => {
                            if (canvasContainerRef.current) {
                                const containerWidth = canvasContainerRef.current.clientWidth - 40;
                                const containerHeight = canvasContainerRef.current.clientHeight - 40;

                                if (img.width > 0 && img.height > 0) {
                                    const fitZoom = Math.min(containerWidth / img.width, containerHeight / img.height, 1);
                                    setZoom(Math.max(0.1, Number.isFinite(fitZoom) ? fitZoom : 0.5));
                                    console.log('Editor: Initial zoom set to:', fitZoom);
                                }
                            }
                        }, 100);
                    };

                    img.onerror = (err) => {
                        console.error('Editor: Failed to decode image element.', err);
                        setError('Failed to render captured image. The screenshot might be too large for the browser to process. Try a smaller area or shorter page.');
                    };

                    img.src = result.capturedImage;
                }
                else {
                    console.warn('Editor: No capturedImage found in storage');
                    setError('No screenshot found. Please try capturing again.');
                }
            });
        };
        // Increased delay to 1000ms for stable loading of massive full-page data urls
        setTimeout(loadImage, 1000);
    }, []);

    // Proactive Font Loading
    useEffect(() => {
        const fontsToLoad = new Set<string>();

        // Load fonts for existing elements
        elements.forEach(el => {
            if (el.type === 'text' && el.fontFamily && !loadedFonts.includes(el.fontFamily)) {
                fontsToLoad.add(el.fontFamily);
            }
        });

        // Load currently selected font for new text
        if (tool === 'text' && !loadedFonts.includes(fontFamily)) {
            fontsToLoad.add(fontFamily);
        }

        fontsToLoad.forEach(fontName => {
            if (activeFontLoads.current.has(fontName) || loadedFonts.includes(fontName)) return;

            activeFontLoads.current.add(fontName);
            const linkId = `font-${fontName.replace(/ /g, '-')}`;

            const processLoad = () => {
                (document as any).fonts.load(`1em ${fontName}`).then(() => {
                    setLoadedFonts(prev => Array.from(new Set([...prev, fontName])));
                    activeFontLoads.current.delete(fontName);
                    // Final verification and redraw
                    (document as any).fonts.ready.then(() => {
                        setRedrawCounter(prev => prev + 1);
                        stageRef.current?.batchDraw();
                    });
                }).catch(() => {
                    activeFontLoads.current.delete(fontName);
                });
            };

            if (!document.getElementById(linkId)) {
                const link = document.createElement('link');
                link.id = linkId;
                link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;700&display=swap`;
                link.rel = 'stylesheet';
                link.onload = processLoad;
                link.onerror = () => activeFontLoads.current.delete(fontName);
                document.head.appendChild(link);
            } else {
                processLoad();
            }

            // Safety timeout
            setTimeout(() => {
                if (activeFontLoads.current.has(fontName)) {
                    activeFontLoads.current.delete(fontName);
                }
            }, 5000);
        });
    }, [elements, loadedFonts, tool, fontFamily]);

    useEffect(() => {
        if (!activePresetId) return;
        const preset = presets.find(p => p.id === activePresetId);
        if (!preset || !preset.elements.length) return;

        // Find the best match for the current tool in the template
        const match = preset.elements.find(el => el.type === tool) || preset.elements[0];

        if (match) {
            // Force template styles into the global tool state for new elements
            setColor(match.color);
            setStrokeWidth(match.strokeWidth || strokeWidth);
            setOpacity(match.opacity ?? opacity);
            setFilled(match.filled ?? filled);
            if (match.fontFamily) setFontFamily(match.fontFamily);
            if (match.fontSize) setFontSize(match.fontSize);
            if (match.bgColor) setBgColor(match.bgColor);
            if (match.strokeColor) setStrokeColor(match.strokeColor);
            if (match.shadowBlur !== undefined) setShadowBlur(match.shadowBlur);
            if (match.shadowOffset !== undefined) setShadowOffset(match.shadowOffset);
            if (match.shadowColor) setShadowColor(match.shadowColor);
            if (match.textCase) setTextCase(match.textCase);
            if (match.letterSpacing !== undefined) setLetterSpacing(match.letterSpacing);
            if (match.lineHeight !== undefined) setLineHeight(match.lineHeight);
            if (match.align) setAlign(match.align as any);
        }
    }, [tool, activePresetId]);

    useEffect(() => {
        if (!transformerRef.current || !stageRef.current) return;
        if (selectedId) {
            const selectedNode = stageRef.current.findOne('#' + selectedId);
            if (selectedNode) {
                transformerRef.current.nodes([selectedNode]);
                transformerRef.current.getLayer()?.batchDraw();
            }
        } else {
            transformerRef.current.nodes([]);
            transformerRef.current.getLayer()?.batchDraw();
        }
    }, [selectedId, elements]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (templatesRef.current && !templatesRef.current.contains(event.target as Node)) {
                setIsTemplatesOpen(false);
            }
        };

        if (isTemplatesOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isTemplatesOpen]);

    useEffect(() => {
        if (textInput.visible && textInputRef.current) {
            setTimeout(() => {
                textInputRef.current?.focus();
                textInputRef.current?.select();
            }, 50);
        }
    }, [textInput.visible]);

    useEffect(() => {
        if (tool !== 'crop') {
            setCropRect(null);
            setIsCropping(false);
        }
    }, [tool]);

    const updateElementProperty = (id: string, updates: Partial<DrawingElement>, saveToHistory = true) => {
        const newElements = elements.map(el =>
            el.id === id ? { ...el, ...updates } : el
        );

        // Sync global state for brand consistency
        if (updates.color) setColor(updates.color);
        if (updates.opacity !== undefined) setOpacity(updates.opacity);
        if (updates.strokeWidth !== undefined) setStrokeWidth(updates.strokeWidth);
        if (updates.fontFamily) setFontFamily(updates.fontFamily);
        if (updates.fontSize) setFontSize(updates.fontSize);
        if (updates.bgColor) setBgColor(updates.bgColor);
        if (updates.strokeColor) setStrokeColor(updates.strokeColor);
        if (updates.shadowBlur !== undefined) setShadowBlur(updates.shadowBlur);
        if (updates.shadowOffset !== undefined) setShadowOffset(updates.shadowOffset);
        if (updates.shadowColor) setShadowColor(updates.shadowColor);
        if (updates.textCase) setTextCase(updates.textCase);
        if (updates.letterSpacing !== undefined) setLetterSpacing(updates.letterSpacing);
        if (updates.lineHeight !== undefined) setLineHeight(updates.lineHeight);
        if (updates.align) setAlign(updates.align as any);
        if (updates.filled !== undefined) setFilled(updates.filled);

        // Clear active template on manual style override
        const styleKeys = ['color', 'opacity', 'strokeWidth', 'fontFamily', 'fontSize', 'bgColor', 'strokeColor', 'shadowBlur', 'shadowOffset', 'shadowColor', 'textCase', 'letterSpacing', 'lineHeight', 'filled', 'align'];
        if (Object.keys(updates).some(k => styleKeys.includes(k))) {
            setActivePresetId(null);
        }

        setElements(newElements);
        if (saveToHistory) addToHistory(newElements);
    };

    const addToHistory = useCallback((newElements: DrawingElement[]) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push([...newElements]);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, [history, historyIndex]);

    const getPointerPosition = () => {
        const stage = stageRef.current;
        if (!stage) return { x: 0, y: 0 };
        const pointer = stage.getPointerPosition();
        if (!pointer) return { x: 0, y: 0 };

        // Use Konva's transformation matrix to precisely map container pixels to layer coordinates
        const transform = stage.getAbsoluteTransform().copy().invert();
        const pos = transform.point(pointer);
        return { x: pos.x, y: pos.y };
    };

    const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const pos = getPointerPosition();
        const clickedOnEmpty = e.target === e.target.getStage() || e.target.attrs.id === 'background-image';

        if (tool === 'crop') {
            if (clickedOnEmpty) {
                setSelectedId(null);
                setIsCropping(true);
                setCropRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
            }
            return;
        }

        if (tool === 'text') {
            if (clickedOnEmpty) {
                setTextInput({ x: pos.x, y: pos.y, visible: true, editingId: null });
                setTextValue('');
            }
            return;
        }

        if (['pencil', 'line', 'arrow', 'rectangle', 'circle', 'blur'].includes(tool)) {
            setIsDrawing(true);
            const newElement: DrawingElement = {
                id: `element-${Date.now()}`,
                type: tool,
                x: pos.x,
                y: pos.y,
                points: tool === 'pencil' ? [0, 0] : [0, 0, 0, 0],
                width: 0,
                height: 0,
                color,
                strokeWidth,
                filled,
                align,
                visible: true,
                name: `${tool.charAt(0).toUpperCase() + tool.slice(1)} ${elementCounter}`,
                opacity,
                dash: dashEnabled ? dashStyle : null,
                pointerAtStart: tool === 'arrow' ? pointerAtStart : undefined,
            };
            setCurrentElement(newElement);
        }
    };

    const handleStageMouseMove = () => {
        if (!isDrawing || !currentElement) return;
        const pos = getPointerPosition();
        const startX = currentElement.x;
        const startY = currentElement.y;

        if (currentElement.type === 'pencil') {
            const newPoints = [...(currentElement.points || []), pos.x - startX, pos.y - startY];
            setCurrentElement({ ...currentElement, points: newPoints });
        } else {
            const width = pos.x - startX;
            const height = pos.y - startY;
            setCurrentElement({
                ...currentElement,
                points: [0, 0, width, height],
                width: Math.abs(width),
                height: Math.abs(height),
            });
        }
    };

    const handleCropMouseMove = () => {
        if (!isCropping || !cropRect) return;
        const pos = getPointerPosition();
        setCropRect({
            ...cropRect,
            width: pos.x - cropRect.x,
            height: pos.y - cropRect.y,
        });
    };

    const handleCropMouseUp = () => {
        if (isCropping) setIsCropping(false);
    };

    const handleStageMouseUp = () => {
        if (!isDrawing || !currentElement) return;
        setIsDrawing(false);
        const hasSize = currentElement.type === 'pencil'
            ? (currentElement.points?.length || 0) > 4
            : (currentElement.width || 0) > 5 || (currentElement.height || 0) > 5;

        if (hasSize) {
            const newElements = [...elements, currentElement];
            setElements(newElements);
            addToHistory(newElements);
            setElementCounter(prev => prev + 1);
        }
        setCurrentElement(null);
    };

    const handleTextSubmit = useCallback(() => {
        if (!textValue.trim()) {
            setTextInput(prev => ({ ...prev, visible: false }));
            return;
        }

        if (textInput.editingId) {
            updateElementProperty(textInput.editingId, { text: textValue.trim(), color });
        } else {
            const newElement: DrawingElement = {
                id: `element-${Date.now()}`,
                type: 'text',
                x: textInput.x,
                y: textInput.y,
                text: textValue.trim(),
                color,
                strokeWidth,
                visible: true,
                name: `Text ${elementCounter}`,
                fontFamily, fontSize, bgColor, strokeColor, shadowBlur, shadowOffset, shadowColor, letterSpacing, lineHeight, textCase, align,
            };
            const newElements = [...elements, newElement];
            setElements(newElements);
            addToHistory(newElements);
            setElementCounter(prev => prev + 1);
        }
        setTextInput(prev => ({ ...prev, visible: false, editingId: null }));
        setTextValue('');
    }, [textValue, textInput, elements, color, strokeWidth, elementCounter, addToHistory, fontFamily, fontSize, bgColor, strokeColor, shadowBlur, shadowOffset, shadowColor, letterSpacing, lineHeight, textCase, align]);

    const handleElementClick = (id: string) => {
        const el = elements.find(e => e.id === id);
        if (el) {
            setSelectedId(id);
            setTool(el.type);

            // Sync current tool states with element properties for editing consistency
            if (el.type === 'text') {
                if (el.fontFamily) setFontFamily(el.fontFamily);
                if (el.fontSize) setFontSize(el.fontSize);
                if (el.textCase) setTextCase(el.textCase);
                if (el.align) setAlign(el.align as any);
            }
            setColor(el.color);
            setFilled(el.filled || false);

            if (el.type === 'text' && tool === 'text') {
                setTextInput({ x: el.x, y: el.y, visible: true, editingId: id });
                setTextValue(el.text || '');
            }
        }
    };

    const handleDragEnd = (id: string, e: Konva.KonvaEventObject<DragEvent>) => {
        updateElementProperty(id, { x: e.target.x(), y: e.target.y() });
    };

    const handleTransformEnd = (id: string, e: Konva.KonvaEventObject<Event>) => {
        const node = e.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        const newElements = elements.map(el => {
            if (el.id === id) {
                if (el.type === 'pencil' || el.type === 'line' || el.type === 'arrow') {
                    return { ...el, x: node.x(), y: node.y(), points: el.points?.map((p, i) => i % 2 === 0 ? p * scaleX : p * scaleY) };
                } else if (el.type === 'text') {
                    const scale = Math.max(scaleX, scaleY);
                    return { ...el, x: node.x(), y: node.y(), fontSize: Math.max(8, Math.round((el.fontSize || 24) * scale)), strokeWidth: Math.max(1, Math.round(el.strokeWidth * scale)) };
                } else {
                    return { ...el, x: node.x(), y: node.y(), width: Math.abs((el.width || 0) * scaleX), height: Math.abs((el.height || 0) * scaleY) };
                }
            }
            return el;
        });

        node.scaleX(1); node.scaleY(1);
        setElements(newElements);
        addToHistory(newElements);
    };

    const deleteElement = (id: string) => {
        const newElements = elements.filter(el => el.id !== id);
        setElements(newElements);
        addToHistory(newElements);
        if (selectedId === id) setSelectedId(null);
    };

    const toggleVisibility = (id: string) => {
        setElements(elements.map(el => el.id === id ? { ...el, visible: !el.visible } : el));
    };

    const saveCurrentAsPreset = () => {
        const name = presetNameInput.trim();
        if (elements.length === 0) {
            showToast('Add some elements before saving a template!', 'error');
            return;
        }
        if (!name) return;

        const newPreset: Preset = {
            id: `template-${Date.now()}`,
            name: name,
            elements: elements.map(el => ({
                ...el,
                id: `tpl-${Math.random().toString(36).substr(2, 9)}`
            }))
        };

        const updatedPresets = [newPreset, ...presets];
        setPresets(updatedPresets);
        setActivePresetId(newPreset.id);

        // Persistence
        if ((window as any).chrome?.storage?.local) {
            (window as any).chrome.storage.local.set({ stylePresets: updatedPresets }, () => {
                showToast('Template saved!', 'success');
            });
        }

        setPresetNameInput('');
        setIsSavingPreset(false);
    };

    const deletePreset = (id: string) => {
        const updatedPresets = presets.filter(p => p.id !== id);
        setPresets(updatedPresets);
        if ((window as any).chrome?.storage?.local) {
            (window as any).chrome.storage.local.set({ stylePresets: updatedPresets });
        }
    };

    const updatePreset = (id: string) => {
        if (elements.length === 0) {
            showToast('Add elements before updating a template!', 'error');
            return;
        }

        const updatedPresets = presets.map(p => {
            if (p.id === id) {
                return {
                    ...p,
                    elements: elements.map(el => ({
                        ...el,
                        id: `tpl-${Math.random().toString(36).substr(2, 9)}`
                    }))
                };
            }
            return p;
        });

        setPresets(updatedPresets);
        setActivePresetId(id);
        if ((window as any).chrome?.storage?.local) {
            (window as any).chrome.storage.local.set({ stylePresets: updatedPresets }, () => {
                showToast('Template updated!', 'success');
            });
        }
    };

    const applyPreset = (preset: Preset) => {
        // 1. Element Synchronization (only if elements exist)
        if (elements.length > 0) {
            const newElements = elements.map((el, index) => {
                // Find a template element that matches by type and position
                const tplMatch = preset.elements.find((t, tIndex) => t.type === el.type && tIndex === index)
                    || preset.elements.find(t => t.type === el.type);

                if (tplMatch) {
                    return {
                        ...el,
                        color: tplMatch.color,
                        strokeWidth: tplMatch.strokeWidth,
                        opacity: tplMatch.opacity,
                        fontFamily: tplMatch.fontFamily,
                        fontSize: tplMatch.fontSize,
                        bgColor: tplMatch.bgColor,
                        strokeColor: tplMatch.strokeColor,
                        shadowBlur: tplMatch.shadowBlur,
                        shadowOffset: tplMatch.shadowOffset,
                        shadowColor: tplMatch.shadowColor,
                        textCase: tplMatch.textCase,
                        letterSpacing: tplMatch.letterSpacing,
                        lineHeight: tplMatch.lineHeight,
                        filled: tplMatch.filled,
                        align: tplMatch.align
                    };
                }
                return el;
            });
            setElements(newElements);
            addToHistory(newElements);
        }

        // 2. State Propagation (Always do this)
        setActivePresetId(preset.id);

        // Pick style from template that matches current tool (or fallback to first element)
        const match = preset.elements.find(el => el.type === tool) || preset.elements[0];

        if (match) {
            setColor(match.color);
            setStrokeWidth(match.strokeWidth || strokeWidth);
            setOpacity(match.opacity ?? opacity);
            setFilled(match.filled ?? filled);
            if (match.fontFamily) setFontFamily(match.fontFamily);
            if (match.fontSize) setFontSize(match.fontSize);
            if (match.bgColor) setBgColor(match.bgColor);
            if (match.strokeColor) setStrokeColor(match.strokeColor);
            if (match.shadowBlur !== undefined) setShadowBlur(match.shadowBlur);
            if (match.shadowOffset !== undefined) setShadowOffset(match.shadowOffset);
            if (match.shadowColor) setShadowColor(match.shadowColor);
            if (match.textCase) setTextCase(match.textCase);
            if (match.letterSpacing !== undefined) setLetterSpacing(match.letterSpacing);
            if (match.lineHeight !== undefined) setLineHeight(match.lineHeight);
            if (match.align) setAlign(match.align as any);
        }

        showToast(`Template "${preset.name}" active`, 'success');
    };

    const triggerImageUpload = () => {
        fileInputRef.current?.click();
    };

    const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const src = event.target?.result as string;
            const img = new Image();
            img.onload = () => {
                const newElement: DrawingElement = {
                    id: `element-${Date.now()}`,
                    type: 'image',
                    x: 50,
                    y: 50,
                    width: img.width > 500 ? 500 : img.width,
                    height: img.width > 500 ? (img.height * (500 / img.width)) : img.height,
                    imageSrc: src,
                    visible: true,
                    name: `Image ${elementCounter}`,
                    color: '#000',
                    strokeWidth: 0,
                    opacity: 1,
                };
                const newElements = [...elements, newElement];
                setElements(newElements);
                setElementCounter(prev => prev + 1);
                addToHistory(newElements);
                showToast('Image added', 'success');
            };
            img.src = src;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const undo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
            setElements([...history[historyIndex - 1]]);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
            setElements([...history[historyIndex + 1]]);
        }
    };

    const handleDownload = (format: 'png' | 'jpeg') => {
        const stage = stageRef.current;
        if (!stage) return;
        setSelectedId(null);
        setTimeout(() => {
            const link = document.createElement('a');
            link.download = `screenshot-${Date.now()}.${format}`;
            link.href = stage.toDataURL({ mimeType: `image/${format}`, quality: 0.9 });
            link.click();
        }, 100);
    };

    const handleCopy = async () => {
        const stage = stageRef.current;
        if (!stage) return;
        setSelectedId(null);
        setTimeout(async () => {
            try {
                const blob = await (await fetch(stage.toDataURL())).blob();
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showToast('Copied to clipboard!', 'success');
            } catch (err) { }
        }, 100);
    };

    const applyCrop = () => {
        if (!cropRect || !image) return;
        const x = cropRect.width < 0 ? cropRect.x + cropRect.width : cropRect.x;
        const y = cropRect.height < 0 ? cropRect.y + cropRect.height : cropRect.y;
        const width = Math.abs(cropRect.width);
        const height = Math.abs(cropRect.height);

        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(image, x, y, width, height, 0, 0, width, height);

        const newImg = new Image();
        newImg.onload = () => {
            setImage(newImg);
            setStageSize({ width, height });
            setCropRect(null);
            setElements([]); setHistory([[]]); setHistoryIndex(0);
        };
        newImg.src = canvas.toDataURL();
    };

    const cancelCrop = () => { setCropRect(null); setIsCropping(false); };

    const getElementIcon = (type: Tool) => {
        switch (type) {
            case 'crop': return <IconCrop />;
            case 'pencil': return <IconPencil />;
            case 'line': return <IconLine />;
            case 'arrow': return <IconArrow />;
            case 'rectangle': return <IconSquare />;
            case 'circle': return <IconCircle />;
            case 'text': return <IconType />;
            case 'blur': return <IconBlur />;
            case 'image': return <IconImage />;
            default: return null;
        }
    };

    const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
        { id: 'crop', icon: <IconCrop />, label: 'Crop' },
        { id: 'pencil', icon: <IconPencil />, label: 'Pencil' },
        { id: 'line', icon: <IconLine />, label: 'Line' },
        { id: 'arrow', icon: <IconArrow />, label: 'Arrow' },
        { id: 'rectangle', icon: <IconSquare />, label: 'Rectangle' },
        { id: 'circle', icon: <IconCircle />, label: 'Circle' },
        { id: 'text', icon: <IconType />, label: 'Text' },
        { id: 'blur', icon: <IconBlur />, label: 'Blur' },
        { id: 'image', icon: <IconImage />, label: 'Image' },
    ];

    if (error) return <div className="editor-loading"><p><IconAlert /> {error}</p></div>;
    // Note: imageData is cleared after load to save memory, so we only need to check for image
    if (!image) return <div className="editor-loading"><div className="spinner"></div><p>Loading...</p></div>;

    const transformText = (text: string, caseType?: 'none' | 'uppercase' | 'capitalize') => {
        if (!text) return '';
        if (caseType === 'uppercase') return text.toUpperCase();
        if (caseType === 'capitalize') return text.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return text;
    };

    const renderElement = (el: DrawingElement) => {
        if (!el.visible) return null;
        const commonProps: any = {
            key: el.id, id: el.id, x: el.x, y: el.y, draggable: true, opacity: el.opacity ?? 1, dash: el.dash,
            onMouseDown: (e: any) => { e.cancelBubble = true; handleElementClick(el.id); },
            onDragEnd: (e: any) => handleDragEnd(el.id, e),
            onTransformEnd: (e: any) => handleTransformEnd(el.id, e),
        };

        switch (el.type) {
            case 'pencil': return <Line {...commonProps} points={el.points} stroke={el.color} strokeWidth={el.strokeWidth} lineCap="round" lineJoin="round" />;
            case 'line': return <Line {...commonProps} points={el.points} stroke={el.color} strokeWidth={el.strokeWidth} lineCap="round" />;
            case 'arrow': return <Arrow {...commonProps} points={el.points} stroke={el.color} fill={el.color} strokeWidth={el.strokeWidth} pointerLength={el.strokeWidth * 4} pointerWidth={el.strokeWidth * 3} pointerAtBeginning={el.pointerAtStart} />;
            case 'rectangle': return <Rect {...commonProps} width={el.width} height={el.height} stroke={el.color} strokeWidth={el.strokeWidth} fill={el.filled ? el.color + '4D' : 'rgba(0,0,0,0.05)'} />;
            case 'blur': return <PixelatedBlur image={image} x={el.x} y={el.y} width={el.width || 0} height={el.height || 0} pixelSize={12} commonProps={commonProps} />;
            case 'circle': return <Ellipse {...commonProps} radiusX={(el.width || 0) / 2} radiusY={(el.height || 0) / 2} stroke={el.color} strokeWidth={el.strokeWidth} fill={el.filled ? el.color + '4D' : 'rgba(0,0,0,0.05)'} offsetX={-(el.width || 0) / 2} offsetY={-(el.height || 0) / 2} />;
            case 'text': return <Text {...commonProps} key={`${el.id}-${el.fontFamily}-${el.fontSize}-${loadedFonts.includes(el.fontFamily || 'Inter')}`} text={transformText(el.text || '', el.textCase)} fontSize={el.fontSize || 24} fontFamily={el.fontFamily || 'Inter'} fontStyle="bold" fill={el.color} stroke={el.strokeColor} strokeWidth={el.strokeWidth > 1 ? el.strokeWidth / 5 : 0} shadowColor={el.shadowColor} shadowBlur={el.shadowBlur} shadowOffsetX={el.shadowOffset} shadowOffsetY={el.shadowOffset} letterSpacing={el.letterSpacing} lineHeight={el.lineHeight} align={el.align} />;
            case 'image': return <ImageElement src={el.imageSrc || ''} commonProps={commonProps} width={el.width} height={el.height} />;
            default: return null;
        }
    };

    return (
        <div className="editor-container">
            <header className="editor-header">
                <div className="header-left">
                    <img src={logo} alt="Screenshot Editor Pro" className="brand-logo" />
                </div>
                <div className="header-actions">
                    <div className="templates-menu-wrapper" ref={templatesRef}>
                        <button
                            className={`btn-toolbar templates-trigger ${isTemplatesOpen ? 'active' : ''}`}
                            onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                            title="Manage Templates"
                        >
                            <IconBookmark />
                            <span>Templates</span>
                        </button>

                        {isTemplatesOpen && (
                            <div className="templates-dropdown">
                                <div className="dropdown-header">My Templates</div>
                                <div className="dropdown-list">
                                    {presets.length === 0 ? (
                                        <div className="dropdown-empty">No templates saved</div>
                                    ) : (
                                        presets.map(p => (
                                            <div key={p.id} className={`dropdown-item ${activePresetId === p.id ? 'active' : ''}`}>
                                                <button className="apply-btn" onClick={() => applyPreset(p)}>
                                                    <span className="apply-label">
                                                        {activePresetId === p.id && <IconCheck />}
                                                        {p.name}
                                                    </span>
                                                </button>
                                                <button className="update-btn" onClick={(e) => { e.stopPropagation(); updatePreset(p.id); }} title="Update Template"><IconRefresh /></button>
                                                <button className="del-btn" onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }} title="Delete Template">&times;</button>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="dropdown-divider"></div>
                                <div className="dropdown-footer">
                                    {!isSavingPreset ? (
                                        <button className="btn-save-trigger" onClick={() => setIsSavingPreset(true)}>
                                            <IconPlus /> Save Current Board
                                        </button>
                                    ) : (
                                        <div className="inline-save-form">
                                            <input
                                                type="text"
                                                placeholder="Name..."
                                                value={presetNameInput}
                                                onChange={(e) => setPresetNameInput(e.target.value)}
                                                autoFocus
                                                onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsPreset()}
                                            />
                                            <div className="form-actions">
                                                <button className="btn-cancel" onClick={() => setIsSavingPreset(false)} title="Cancel"><IconClose /></button>
                                                <button className="btn-confirm" onClick={saveCurrentAsPreset} title="Save Template"><IconSave /></button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="header-divider"></div>
                    <div className="action-group">
                        <button onClick={undo} disabled={historyIndex <= 0} title="Undo"><IconUndo /></button>
                        <button onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo"><IconRedo /></button>
                    </div>
                    <div className="header-divider"></div>
                    <button onClick={handleCopy} title="Copy Content"><IconCopy /></button>
                    <button className="btn-primary" onClick={() => handleDownload('png')}>Download</button>
                </div>
            </header>

            <main className="editor-main">
                <aside className="editor-left-toolbar">
                    <div className="center-toolbar">
                        {tools.map(t => (
                            <button key={t.id} className={`tool-btn ${tool === t.id ? 'active' : ''}`} onClick={() => t.id === 'image' ? triggerImageUpload() : setTool(t.id)} title={t.label}>
                                <span className="icon">{t.icon}</span>
                                <span className="btn-label">{t.label}</span>
                            </button>
                        ))}
                        <div className="v-divider"></div>
                        {tool !== 'blur' && tool !== 'crop' && (
                            <div className="color-tool">
                                <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setActivePresetId(null); }} className="color-input" />
                                <div className="color-preview" style={{ backgroundColor: color }}></div>
                            </div>
                        )}
                        {['rectangle', 'circle'].includes(tool) && (
                            <button className={`side-tool-btn ${filled ? 'active' : ''}`} onClick={() => { setFilled(!filled); setActivePresetId(null); }} title="Fill Shape">
                                <IconCheck />
                            </button>
                        )}
                    </div>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleImageFileChange} />
                </aside>
                <div className="canvas-area">
                    <div className="canvas-viewport" ref={canvasContainerRef}>
                        <div className="canvas-stage-wrapper" style={{ minWidth: stageSize.width * zoom }}>
                            <Stage
                                key={image.src.substring(0, 100)} // Force re-mount if image source changes
                                width={Math.ceil(stageSize.width * zoom)}
                                height={Math.ceil(stageSize.height * zoom)}
                                scaleX={zoom}
                                scaleY={zoom}
                                ref={stageRef}
                                onMouseDown={handleStageMouseDown}
                                onMouseMove={tool === 'crop' ? handleCropMouseMove : handleStageMouseMove}
                                onMouseUp={tool === 'crop' ? handleCropMouseUp : handleStageMouseUp}
                            >
                                <Layer>
                                    <KonvaImage image={image} id="background-image" width={stageSize.width} height={stageSize.height} />
                                    {elements.map(renderElement)}
                                    {currentElement && renderElement(currentElement)}
                                    {cropRect && <Rect x={cropRect.width < 0 ? cropRect.x + cropRect.width : cropRect.x} y={cropRect.height < 0 ? cropRect.y + cropRect.height : cropRect.y} width={Math.abs(cropRect.width)} height={Math.abs(cropRect.height)} stroke="var(--brand-primary)" strokeWidth={2 / zoom} fill="rgba(99, 102, 241, 0.1)" dash={[5, 5]} />}
                                    <Transformer ref={transformerRef} boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 5) ? oldBox : newBox} />
                                </Layer>
                            </Stage>
                        </div>

                        {cropRect && !isCropping && Math.abs(cropRect.width) > 5 && (
                            <div className="crop-floating-actions" style={{ left: (cropRect.width < 0 ? cropRect.x + cropRect.width : cropRect.x) * zoom, top: (cropRect.y + (cropRect.height < 0 ? 0 : cropRect.height)) * zoom + 10 }}>
                                <button onClick={applyCrop} className="apply-btn"><IconCheck /> Apply</button>
                                <button onClick={cancelCrop} className="cancel-btn"><IconClose /> Cancel</button>
                            </div>
                        )}

                        {textInput.visible && (
                            <div className="floating-text-input" style={{ left: textInput.x * zoom, top: textInput.y * zoom }}>
                                <input ref={textInputRef} type="text" value={textValue} onChange={(e) => setTextValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleTextSubmit(); if (e.key === 'Escape') setTextInput(prev => ({ ...prev, visible: false })); }} placeholder="Type something..." />
                                <div className="text-actions">
                                    <button onClick={handleTextSubmit} title="Confirm"><IconCheck /></button>
                                    <button onClick={() => setTextInput(prev => ({ ...prev, visible: false }))} title="Cancel"><IconClose /></button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="fixed-controls">
                        <div className="zoom-widget">
                            <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}><IconMinus /></button>
                            <span className="percentage">{Math.round(zoom * 100)}%</span>
                            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))}><IconPlus /></button>
                            <div className="h-divider"></div>
                            <button onClick={() => setZoom(1)} title="Reset"><IconRotateCcw /></button>
                        </div>
                    </div>
                </div>

                <aside className="editor-sidebar">
                    <div className="sidebar-section layers">
                        <div className="section-header"><IconLayers /><span>Layers</span><span className="badge">{elements.length}</span></div>
                        <div className="section-content scrollable">
                            {elements.length === 0 ? <div className="empty-state">No layers</div> : (
                                <div className="layer-stack">
                                    {[...elements].reverse().map(el => (
                                        <div key={el.id} className={`layer-card ${selectedId === el.id ? 'active' : ''}`} onClick={() => handleElementClick(el.id)}>
                                            <span className="type-icon">{getElementIcon(el.type)}</span>
                                            <span className="name">{el.name}</span>
                                            <div className="actions">
                                                <button onClick={(e) => { e.stopPropagation(); toggleVisibility(el.id); }}>{el.visible ? <IconEye /> : <IconEyeOff />}</button>
                                                <button className="del" onClick={(e) => { e.stopPropagation(); deleteElement(el.id); }}><IconTrash /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="sidebar-section properties" key={selectedId || 'none'}>
                        <div className="section-header"><IconSettings /><span>Properties</span></div>
                        <div className="section-content scrollable">
                            {selectedId ? (() => {
                                const el = elements.find(e => e.id === selectedId);
                                if (!el) return null;
                                return (
                                    <div className="prop-list">
                                        <div className="prop-row"><label>Name</label><input type="text" value={el.name} onChange={(e) => updateElementProperty(el.id, { name: e.target.value })} /></div>
                                        {el.type !== 'blur' && el.type !== 'image' && (
                                            <div className="prop-row"><label>Color</label><div className="color-pick-field"><input type="color" value={el.color} onChange={(e) => updateElementProperty(el.id, { color: e.target.value })} /><span className="hex">{(el.color || '#000').toUpperCase()}</span></div></div>
                                        )}
                                        <div className="prop-row"><label>Opacity ({Math.round((el.opacity ?? 1) * 100)}%)</label><input type="range" min="0" max="100" value={(el.opacity ?? 1) * 100} onChange={(e) => updateElementProperty(el.id, { opacity: parseInt(e.target.value) / 100 })} /></div>

                                        {['pencil', 'line', 'arrow', 'rectangle', 'circle'].includes(el.type) && (
                                            <div className="prop-row">
                                                <label>Stroke Size ({el.strokeWidth}px)</label>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="50"
                                                    value={el.strokeWidth}
                                                    onChange={(e) => updateElementProperty(el.id, { strokeWidth: parseInt(e.target.value) })}
                                                />
                                            </div>
                                        )}

                                        {el.type === 'text' && (
                                            <>
                                                <div className="sidebar-divider"></div>
                                                <div className="prop-row">
                                                    <label>Font Family</label>
                                                    <select
                                                        value={el.fontFamily}
                                                        onChange={(e) => updateElementProperty(el.id, { fontFamily: e.target.value })}
                                                        className="sidebar-select"
                                                    >
                                                        {AVAILABLE_FONTS.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                                                    </select>
                                                </div>

                                                <div className="prop-row">
                                                    <label>Font Size ({el.fontSize}px)</label>
                                                    <input
                                                        type="range"
                                                        min="8"
                                                        max="200"
                                                        value={el.fontSize}
                                                        onChange={(e) => updateElementProperty(el.id, { fontSize: parseInt(e.target.value) })}
                                                    />
                                                </div>

                                                <div className="prop-row">
                                                    <label>Text Background</label>
                                                    <div className="color-pick-field">
                                                        <input
                                                            type="color"
                                                            value={el.bgColor || '#ffffff'}
                                                            onChange={(e) => updateElementProperty(el.id, { bgColor: e.target.value })}
                                                        />
                                                        <span className="hex">{(el.bgColor || '#FFFFFF').toUpperCase()}</span>
                                                    </div>
                                                </div>

                                                <div className="prop-row">
                                                    <label>Alignment</label>
                                                    <div className="segmented-control">
                                                        <button
                                                            className={el.align === 'left' ? 'active' : ''}
                                                            onClick={() => updateElementProperty(el.id, { align: 'left' })}
                                                        >
                                                            <IconAlignLeft />
                                                        </button>
                                                        <button
                                                            className={el.align === 'center' ? 'active' : ''}
                                                            onClick={() => updateElementProperty(el.id, { align: 'center' })}
                                                        >
                                                            <IconAlignCenter />
                                                        </button>
                                                        <button
                                                            className={el.align === 'right' ? 'active' : ''}
                                                            onClick={() => updateElementProperty(el.id, { align: 'right' })}
                                                        >
                                                            <IconAlignRight />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="prop-row">
                                                    <label>Case</label>
                                                    <div className="segmented-control">
                                                        <button
                                                            className={el.textCase === 'none' ? 'active' : ''}
                                                            onClick={() => updateElementProperty(el.id, { textCase: 'none' })}
                                                        >
                                                            Abc
                                                        </button>
                                                        <button
                                                            className={el.textCase === 'uppercase' ? 'active' : ''}
                                                            onClick={() => updateElementProperty(el.id, { textCase: 'uppercase' })}
                                                        >
                                                            ABC
                                                        </button>
                                                        <button
                                                            className={el.textCase === 'capitalize' ? 'active' : ''}
                                                            onClick={() => updateElementProperty(el.id, { textCase: 'capitalize' })}
                                                        >
                                                            Aaa
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="sidebar-divider"></div>
                                                <label className="section-subtitle">Shadow Settings</label>

                                                <div className="prop-row">
                                                    <label>Shadow Blur ({el.shadowBlur || 0})</label>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="50"
                                                        value={el.shadowBlur || 0}
                                                        onChange={(e) => updateElementProperty(el.id, { shadowBlur: parseInt(e.target.value) })}
                                                    />
                                                </div>

                                                <div className="prop-row">
                                                    <label>Shadow Offset ({el.shadowOffset || 0})</label>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="50"
                                                        value={el.shadowOffset || 0}
                                                        onChange={(e) => updateElementProperty(el.id, { shadowOffset: parseInt(e.target.value) })}
                                                    />
                                                </div>

                                                <div className="prop-row">
                                                    <label>Shadow Color</label>
                                                    <div className="color-pick-field">
                                                        <input
                                                            type="color"
                                                            value={el.shadowColor || '#000000'}
                                                            onChange={(e) => updateElementProperty(el.id, { shadowColor: e.target.value })}
                                                        />
                                                        <span className="hex">{(el.shadowColor || '#000000').toUpperCase()}</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        <div className="sidebar-divider"></div>
                                        <button className="btn-danger" onClick={() => deleteElement(el.id)}><IconTrash /> Delete Element</button>
                                    </div>
                                );
                            })() : <div className="empty-state"><p>Select an element</p></div>}
                        </div>
                    </div>
                </aside>
            </main>

            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`}>
                        {t.type === 'success' && <IconCheck />}
                        {t.type === 'error' && <IconAlert />}
                        {t.type === 'info' && <IconBookmark />}
                        <span>{t.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Editor;
