import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar, Box, Collapse, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem,
  Toolbar, Tooltip, Typography, useMediaQuery, ToggleButton, ToggleButtonGroup,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import AccountCircle from '@mui/icons-material/AccountCircle'
import { menu, type MenuItem as MI } from '../menu'
import { useAuth } from '../auth'
import { useI18n, type Lang } from '../i18n'
import { Logo } from './Logo'

const FULL = 264, MINI = 64
export const SIDEBAR_BG = '#17324d'

export function Layout({ children }: { children: ReactNode }) {
  const { perm, user, logout } = useAuth()
  const { t, lang, setLang } = useI18n()
  const loc = useLocation(), nav = useNavigate()
  const mobile = useMediaQuery('(max-width:900px)')
  const [open, setOpen] = useState(!mobile)
  const [expanded, setExpanded] = useState<string | null>(() => menu.find((m) => m.child?.some((c) => loc.pathname.startsWith(c.link)))?.key ?? null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  // Same rule as the original: show an item only when its permission key has is_view === 1.
  const visible = (m: MI) => m.alwaysShow || (m.child ? m.child.some((c) => perm(c.key).is_view === 1) : perm(m.key).is_view === 1)
  const width = mobile ? FULL : open ? FULL : MINI
  const active = (link: string) => (link === '/' ? loc.pathname === '/' : loc.pathname.startsWith(link))
  const onNav = () => { if (mobile) setOpen(false) }

  const drawer = (
    <Box sx={{ bgcolor: SIDEBAR_BG, color: '#fff', height: '100%', overflowX: 'hidden', pt: 8 }}>
      <List dense>
        {menu.filter(visible).map((m) => {
          const label = t(m.name)
          const icon = <ListItemIcon sx={{ color: '#cfe3f7', minWidth: 40 }}>{m.icon}</ListItemIcon>
          if (!m.child) {
            return (
              <ListItemButton key={m.name} component={RouterLink} to={m.link} onClick={onNav} selected={active(m.link)}
                sx={{ '&.Mui-selected': { bgcolor: 'rgba(26,144,220,.35)' } }}>
                {open || mobile ? icon : <Tooltip title={label} placement="right">{icon}</Tooltip>}
                <ListItemText primary={label} />
              </ListItemButton>
            )
          }
          const isOpen = expanded === m.key
          return (
            <Box key={m.name}>
              <ListItemButton onClick={() => { setExpanded(isOpen ? null : m.key); setOpen(true) }}>
                {open || mobile ? icon : <Tooltip title={label} placement="right">{icon}</Tooltip>}
                <ListItemText primary={label} />
                {isOpen ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
              <Collapse in={isOpen && (open || mobile)} unmountOnExit>
                <List dense disablePadding>
                  {m.child.filter((c) => perm(c.key).is_view === 1).map((c) => (
                    <ListItemButton key={c.link} component={RouterLink} to={c.link} onClick={onNav} selected={active(c.link)}
                      sx={{ pl: 9, '&.Mui-selected': { bgcolor: 'rgba(26,144,220,.35)' } }}>
                      <ListItemText primary={t(c.name)} slotProps={{ primary: { variant: 'body2' } }} />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </Box>
          )
        })}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100%' }}>
      <AppBar position="fixed" color="inherit" elevation={1} sx={{ zIndex: (th) => th.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" onClick={() => setOpen(!open)} aria-label="menu"><MenuIcon /></IconButton>
          <Box component={RouterLink} to="/" sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}><Logo height={34} /></Box>
          <Box sx={{ flex: 1 }} />
          <ToggleButtonGroup size="small" exclusive value={lang} onChange={(_, v: Lang | null) => v && setLang(v)}>
            <ToggleButton value="th" sx={{ px: 1.2, py: 0.3 }}>TH</ToggleButton>
            <ToggleButton value="en" sx={{ px: 1.2, py: 0.3 }}>EN</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' }, ml: 1 }}>
            {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.user_name}
          </Typography>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="account"><AccountCircle /></IconButton>
          <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
            <MenuItem onClick={() => { setAnchor(null); nav('/profile') }}>{t('profile')}</MenuItem>
            <MenuItem onClick={() => { setAnchor(null); logout(); nav('/login') }}>{t('signOut')}</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Drawer variant={mobile ? 'temporary' : 'permanent'} open={open} onClose={() => setOpen(false)}
        sx={{ width, flexShrink: 0, '& .MuiDrawer-paper': { width, border: 0, transition: 'width .2s', bgcolor: SIDEBAR_BG } }}>
        {drawer}
      </Drawer>
      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 3 }, pt: { xs: 10, md: 11 } }}>{children}</Box>
    </Box>
  )
}
