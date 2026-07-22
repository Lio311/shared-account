import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useRegisterSW } from 'virtual:pwa-register/react'
import './index.css'
import App from './App.jsx'

function AppWithSWUpdate() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  return (
    <>
      <App />
      {needRefresh && (
        <div style={{
          position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
          background: '#1e40af', color: 'white', borderRadius: '1rem',
          padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center',
          gap: '0.75rem', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999,
          fontSize: '0.875rem', whiteSpace: 'nowrap'
        }}>
          <span>🔄 גרסה חדשה זמינה!</span>
          <button
            onClick={() => updateServiceWorker(true)}
            style={{ background: 'white', color: '#1e40af', border: 'none', borderRadius: '0.5rem', padding: '0.4rem 0.8rem', fontWeight: '700', cursor: 'pointer' }}
          >עדכן עכשיו</button>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppWithSWUpdate />
  </StrictMode>,
)
