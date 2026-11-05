import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import './index.css'
import App from './App'
import { AuthProvider } from './auth'
import { I18nProvider } from './i18n'

// Palette taken from the colours most used in the original SEEKPI bundle (#1A90DC, #3c91dc, #3d6bb3, #98cad3, #82ca9d).
const theme = createTheme({
  palette: {
    primary: { main: '#1A90DC', dark: '#3d6bb3' },
    secondary: { main: '#d4a017' },
    background: { default: '#f0f2f5' },
  },
  typography: { fontFamily: "'Sarabun', 'Roboto', 'Segoe UI', sans-serif", button: { textTransform: 'none', fontWeight: 600 } },
  shape: { borderRadius: 6 },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
