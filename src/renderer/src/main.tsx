import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const params = new URLSearchParams(window.location.search)
const view = params.get('view') === 'widget' ? 'widget' : params.get('view') === 'sync' ? 'sync' : 'main'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App view={view} />
  </StrictMode>
)
