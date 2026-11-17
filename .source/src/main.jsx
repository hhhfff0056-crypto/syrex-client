import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import BrowserCheck from './components/BrowserCheck'
import { useCallback, useState } from 'react'
import { LanguageProvider } from './context/LanguageContext'
import { ThemeProvider } from './context/ThemeContext'
import './index.css'

function SyrexEntry() {
  const [verified, setVerified] = useState(false);
  const onVerified = useCallback(() => setVerified(true), []);
  return verified ? <App /> : <BrowserCheck onVerified={onVerified} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <SyrexEntry />
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>,
)

