# Screenshot Editor

A powerful browser extension for capturing and editing screenshots with multiple capture modes, built with WXT and React.

![Screenshot Editor](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

### Capture Modes
- **Visible Page** - Capture the currently visible portion of the page
- **Select Area** - Draw a selection rectangle to capture a specific area
- **Full Page** - Capture the entire scrollable page (automatically handles lazy-loading content and sticky headers)

### Editor Tools
- ✂️ **Crop** - Trim your screenshot to focus on what matters
- ✏️ **Pencil** - Freehand drawing for annotations
- ➔ **Arrow** - Point to important elements
- / **Line** - Draw straight lines
- ▢ **Rectangle** - Highlight areas with boxes
- ○ **Circle/Ellipse** - Draw circles and ovals
- T **Text** - Add text annotations with customizable font size
- 🔴 **Blur** - Blur sensitive information

### Additional Features
- **Undo/Redo** - Full history support for all edits
- **Zoom Controls** - Unlimited zoom for detailed viewing
- **Color Picker** - Choose any color for your annotations
- **Stroke Width** - Adjustable line thickness
- **Export Options** - Save as PNG or JPEG, or copy to clipboard

## Installation

### From Source (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/raakkan/screenshot-editor.git
   cd screenshot-editor
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build for your browser:
   ```bash
   # For Chrome/Edge
   npm run build
   
   # For Edge specifically
   npx wxt build -b edge
   
   # For Firefox
   npm run build:firefox
   ```

4. Load the extension:
   - **Chrome/Edge**: Go to `chrome://extensions` or `edge://extensions`, enable Developer mode, click "Load unpacked", and select the `.output/chrome-mv3` or `.output/edge-mv3` folder
   - **Firefox**: Go to `about:debugging`, click "This Firefox", click "Load Temporary Add-on", and select any file in the `.output/firefox-mv2` folder

### Development Mode

Run the extension in development mode with hot reload:
```bash
npm run dev
```

## Usage

1. Click the extension icon in your browser toolbar
2. Select a capture mode:
   - **Visible Page**: Instantly captures what's visible
   - **Select Area**: Click and drag to select a region
   - **Full Page**: Automatically scrolls and captures the entire page
3. Edit your screenshot using the available tools
4. Export via:
   - **Copy** - Copy to clipboard
   - **PNG** - Download as PNG
   - **JPEG** - Download as JPEG

## Tech Stack

- **[WXT](https://wxt.dev/)** - Next-gen Web Extension Framework
- **React 19** - UI Framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tooling

## Project Structure

```
screenshot-editor/
├── entrypoints/
│   ├── background.ts      # Service worker for capture logic
│   ├── content.ts         # Content script for area selection
│   ├── popup/             # Extension popup UI
│   └── editor/            # Screenshot editor UI
├── public/
│   └── icon/              # Extension icons
├── wxt.config.ts          # WXT configuration
└── package.json
```

## Known Limitations

- Full page capture may not work perfectly on sites with complex infinite scroll (like social media feeds)
- Some sites with strict Content Security Policies may block the content script

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Roadmap

- [ ] Keyboard shortcuts for tools
- [ ] Shape fill options
- [ ] Multiple text styles (bold, italic)
- [ ] Image filters (brightness, contrast)
- [ ] Cloud storage integration
- [ ] Browser store publication (Chrome Web Store, Firefox Add-ons, Edge Add-ons)

---

Made with ❤️ by [Raakkan](https://github.com/raakkan)
