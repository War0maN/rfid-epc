import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// i18n-ийг App-аас өмнө инициализлана (lib-үүд i18n.t-г модулийн түвшинд ашигладаг).
import './i18n'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
