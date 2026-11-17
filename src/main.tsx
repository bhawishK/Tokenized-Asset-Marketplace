import React from 'react';
import { createRoot } from 'react-dom/client';
import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { dAppKit } from './chain';
import App from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><DAppKitProvider dAppKit={dAppKit}><App /></DAppKitProvider></React.StrictMode>);
