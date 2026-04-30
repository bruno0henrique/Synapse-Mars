import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './styles/index.css'
import { ClerkProvider } from '@clerk/clerk-react'
import { ptBR } from '@clerk/localizations'
// 1. Mude o import para pegar a função registerSW
import { registerSW } from 'virtual:pwa-register'

// 2. Chame a função de registro imediatamente
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return

    window.setInterval(() => {
      void registration.update()
    }, 60 * 60 * 1000)
  },
})

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!clerkPublishableKey) {
  console.error('❌ Clerk: VITE_CLERK_PUBLISHABLE_KEY não encontrada!')
  console.error('Configure a variável VITE_CLERK_PUBLISHABLE_KEY no painel da Vercel (Settings > Environment Variables)')
  throw new Error('Clerk publishable key não configurada.')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider 
      afterSignOutUrl="/"
      publishableKey={clerkPublishableKey}
      localization={ptBR}
    >
      <App />
    </ClerkProvider>
  </React.StrictMode>,
)
