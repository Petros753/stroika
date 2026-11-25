import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'

// Рабочая сборка и демо-прототип — разные приложения. Условие вычисляется при сборке,
// поэтому в рабочий бандл не попадают демо-сид и store прототипа (проверяется после npm run build).
const App = lazy(() => (import.meta.env.VITE_APP_MODE === 'demo' ? import('./app/App') : import('./work/WorkApp')))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </HashRouter>
  </React.StrictMode>,
)
