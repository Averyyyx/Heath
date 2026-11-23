import './polyfills';
import { migrateLegacyLocalStorage } from './lib/brand';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

migrateLegacyLocalStorage();

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('Root element #app not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

