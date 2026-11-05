import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, IconButton, InputAdornment, MenuItem, Paper, TextField, Typography } from '@mui/material'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import { useAuth } from '../auth'
import { useI18n, type Lang } from '../i18n'
import { Logo } from '../components/Logo'

export function Login() {
  const { user, login } = useAuth()
  const { t, lang, setLang } = useI18n()
  const nav = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try { await login(username, password, lang); nav('/') } catch (err) {
      const m = err instanceof Error ? err.message : ''
      setError(m === '401LI' ? t('401LI') : m || t('500'))
    } finally { setBusy(false) }
  }

  return (
    <Box sx={{ minHeight: '100%', display: 'grid', placeItems: 'center', p: 2, background: 'linear-gradient(135deg,#eef4fa 0%,#dfe9f3 100%)' }}>
      <Paper elevation={3} component="form" onSubmit={submit} sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}><Logo height={60} /></Box>
        <Typography align="center" sx={{ color: '#c62828', fontWeight: 600, mb: 3 }}>The Best Solution for Enterprise Excellence</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField fullWidth required label={t('usernameOrEmail')} margin="dense" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <TextField fullWidth required label={t('password')} margin="dense" type={show ? 'text' : 'password'} autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShow(!show)} edge="end" aria-label="toggle password">{show ? <Visibility /> : <VisibilityOff />}</IconButton></InputAdornment> } }} />
        <TextField fullWidth select label={t('language')} margin="dense" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          <MenuItem value="en">English</MenuItem>
          <MenuItem value="th">ภาษาไทย</MenuItem>
        </TextField>
        <Button fullWidth type="submit" variant="contained" size="large" disabled={!username || !password || busy} sx={{ mt: 2 }}>{t('login')}</Button>
        <Typography variant="caption" align="right" sx={{ mt: 2, display: 'block' }}>{t('version')} : 2.0.0</Typography>
      </Paper>
    </Box>
  )
}
