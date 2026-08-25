import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ProvedorAuth } from './lib/auth';
import { ProvedorTema } from './lib/tema';

// A ordem importa: index.css define os tokens, tema-escuro.css os inverte.
import './index.css';
import './tema-escuro.css';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('Elemento #root não encontrado no index.html');

createRoot(raiz).render(
  <StrictMode>
    <ProvedorTema>
      <ProvedorAuth>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ProvedorAuth>
    </ProvedorTema>
  </StrictMode>,
);
