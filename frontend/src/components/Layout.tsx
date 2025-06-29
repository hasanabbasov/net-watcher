import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Typography,
  Divider,
  useTheme,
} from '@mui/material';
import {
  Terminal as TerminalIcon,
  Save as SaveIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

const DRAWER_WIDTH = 240;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { text: 'Canlı Trafik İzleme', icon: <TerminalIcon />, path: '/' },
    { text: 'Kayıtlı Hareketler', icon: <SaveIcon />, path: '/saved' },
  ];

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            backgroundColor: theme.palette.background.paper,
            borderRight: `1px solid ${theme.palette.divider}`,
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            NetWatcher
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Ağ Trafiği İzleme Aracı
          </Typography>
        </Box>
        <Divider />
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: `${theme.palette.primary.main}20`,
                    '&:hover': {
                      backgroundColor: `${theme.palette.primary.main}30`,
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: location.pathname === item.path
                      ? theme.palette.primary.main
                      : theme.palette.text.secondary,
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Box sx={{ flexGrow: 1 }} />
        <Divider />
        <List>
          <ListItem disablePadding>
            <ListItemButton>
              <ListItemIcon>
                <SettingsIcon />
              </ListItemIcon>
              <ListItemText primary="Ayarlar" />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          backgroundColor: theme.palette.background.default,
          minHeight: '100vh',
        }}
      >
        {children}
      </Box>
    </>
  );
};

export default Layout; 