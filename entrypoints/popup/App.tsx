import React, { useState } from 'react';
import './App.css';
import logo from '../../assets/logo.png';
import { IconMonitor, IconSelection, IconFile } from '../editor/Icons';

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
        setTimeout(() => {
          window.close();
        }, 500);
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
        <img src={logo} alt="Screenshot Editor Pro" className="brand-logo" />
      </header>

      <div className="capture-modes">
        <button
          className="capture-btn visible"
          onClick={() => handleCapture('visible')}
          disabled={isCapturing}
        >
          <span className="icon"><IconMonitor /></span>
          <div className="content">
            <span className="label">Visible Viewport</span>
            <span className="desc">Capture what's on screen</span>
          </div>
        </button>

        <button
          className="capture-btn selection"
          onClick={() => handleCapture('selection')}
          disabled={isCapturing}
        >
          <span className="icon"><IconSelection /></span>
          <div className="content">
            <span className="label">Selected Area</span>
            <span className="desc">Draw a custom rectangle</span>
          </div>
        </button>

        <button
          className="capture-btn fullpage"
          onClick={() => handleCapture('fullpage')}
          disabled={isCapturing}
        >
          <span className="icon"><IconFile /></span>
          <div className="content">
            <span className="label">Entire Page</span>
            <span className="desc">Capture from top to bottom</span>
          </div>
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
