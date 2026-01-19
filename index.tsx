
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Critical: Root element #root not found in DOM.");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (err) {
    console.error("React Mounting Error:", err);
    rootElement.innerHTML = `<div style="padding: 20px; color: white; background: #000; font-family: sans-serif;">
      <h2 style="color: #ef4444;">Application Failed to Initialize</h2>
      <p>Error details have been logged to the console.</p>
    </div>`;
  }
}
