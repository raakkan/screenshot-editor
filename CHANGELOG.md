# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-02-11

### Added
- **Blinking Cursor**: Added a blinking cursor to the text annotation tool for a more intuitive "input" experience.
- **Enhanced Popup Positioning**: Property inspector now tracks the stage scroll and zoom state in real-time.
- **Cursor feedback**: Implementation of 'move' and 'text' cursors during element interaction.

### Changed
- **Optimized Assets**: Converted all extension-related images on the landing page to WebP format, reducing load times by up to 75%.
- **Open Source Branding**: Added prominent "100% Open Source" badges and sections to highlight the project's foundation.
- **Improved UI Layout**: Refined the "Pro Editor" image list to be horizontal and more responsive.

### Fixed
- Fixed an issue where annotation tool popups would drift when scrolling the editor canvas.
- Improved text element selection behavior when editing.

## [1.1.0] - 2026-01-15
- Initial public release with capture modes (Visible, Select Area, Full Page).
- Basic annotation tools (Crop, Pencil, Arrow, Line, Rectangle, Circle, Text, Blur).
- Undo/Redo support.
- Export to PNG/JPEG/Clipboard.
