import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import theme from './theme';
import Layout from './components/Layout';
import LiveFeed from './pages/LiveFeed';
import SavedCaptures from './pages/SavedCaptures';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          <Layout>
            <Routes>
              <Route path="/" element={<LiveFeed />} />
              <Route path="/saved" element={<SavedCaptures />} />
            </Routes>
          </Layout>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App; 