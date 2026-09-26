import React from 'react'
import ReactDOM from 'react-dom/client'
import VisuClean from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <VisuClean />
  </React.StrictMode>
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error => {
      console.error('VisuClean offline cache could not be registered', error)
    })
  })
}
