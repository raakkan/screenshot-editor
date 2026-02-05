import React, { useState } from 'react';
import './App.css';

type CaptureMode = 'visible' | 'selection' | 'fullpage';

function App() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState('');

  const handleCapture = async (mode: CaptureMode) => {
    setIsCapturing(true);
    setStatus('Capturing...');

    try {
      // Send message to background script
      const response = await browser.runtime.sendMessage({
        type: 'capture',
        mode: mode,
      });

      if (response?.success) {
        setStatus('Opening editor...');
        // Close popup after successful capture
        window.close();
      } else {
        setStatus(response?.error || 'Capture failed');
        setIsCapturing(false);
      }
    } catch (error) {
      setStatus('Error: ' + (error as Error).message);
      setIsCapturing(false);
    }
  };

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>📸 Screenshot Editor</h1>
      </header>

      <div className="capture-modes">
        <button
          className="capture-btn visible"
          onClick={() => handleCapture('visible')}
          disabled={isCapturing}
        >
          <span className="icon">🖥️</span>
          <span className="label">Visible Page</span>
          <span className="desc">Capture current viewport</span>
        </button>

        <button
          className="capture-btn selection"
          onClick={() => handleCapture('selection')}
          disabled={isCapturing}
        >
          <span className="icon">✂️</span>
          <span className="label">Select Area</span>
          <span className="desc">Draw selection rectangle</span>
        </button>

        <button
          className="capture-btn fullpage"
          onClick={() => handleCapture('fullpage')}
          disabled={isCapturing}
        >
          <span className="icon">📄</span>
          <span className="label">Full Page</span>
          <span className="desc">Capture entire page</span>
        </button>
      </div>

      {status && (
        <div className="status">
          {isCapturing && <span className="spinner"></span>}
          {status}
        </div>
      )}
    </div>
  );
}

export default App;
