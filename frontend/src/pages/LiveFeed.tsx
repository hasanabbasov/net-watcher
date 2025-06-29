import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Grid,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Badge,
} from '@mui/material';
import {
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  Clear as ClearIcon,
  Save as SaveIcon,
  Warning as WarningIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { FixedSizeList as List } from 'react-window';
import { WS_BASE_URL, API_BASE_URL } from '../config';
import { useTheme } from '@mui/material/styles';

interface NetworkInterface {
  name: string;
  ip: string;
  mac: string | null;
}

interface Packet {
  time: string;
  protocol: string;
  source_ip: string;
  source_port: number | null;
  dest_ip: string;
  dest_port: number | null;
  info: string;
  length: number;
  anomalies?: Anomaly[];
}

interface Anomaly {
  type: string;
  message: string;
  severity: string;
}

interface SavedCapture {
  id: string;
  name: string;
  timestamp: string;
  packets: Packet[];
  interface?: string;
}

const PROTOCOLS = ['ALL', 'TCP', 'UDP', 'HTTPS', 'HTTP', 'ICMP', 'DNS', 'ARP'];
const ROW_HEIGHT = 50; // Her satırın yüksekliği

const LiveFeed: React.FC = () => {
  const theme = useTheme();
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<string>('en0');
  const [packets, setPackets] = useState<Packet[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [captureNameInput, setCaptureNameInput] = useState('');
  const [anomalySnackbarOpen, setAnomalySnackbarOpen] = useState(false);
  const [currentAnomaly, setCurrentAnomaly] = useState<Anomaly | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const isPausedRef = useRef<boolean>(false); // isPaused için ref
  const listRef = useRef<List>(null); // Virtualized list ref'i

  // Terminal görünümü için renk paleti
  const terminalColors = {
    background: '#0d1117',
    text: '#c9d1d9',
    green: '#7ee787',
    yellow: '#f1e05a',
    red: '#f85149',
    blue: '#79c0ff',
    purple: '#d2a8ff',
    orange: '#ffab70',
  };

  // WebSocket bağlantısını yönet
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/live_packets`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        // Başlangıç konfigürasyonunu gönder
        try {
          ws.send(JSON.stringify({
            interface: selectedInterface,
            isPaused: isPaused,
            protocolFilter: selectedProtocol
          }));
        } catch (error) {
          console.error('Config gönderme hatası:', error);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'packets' && Array.isArray(message.data)) {
            // isPaused state'ini kontrol et - eğer duraklat edilmişse paket ekleme
            setPackets((prevPackets) => {
              // Ref üzerinden güncel isPaused durumunu kontrol et
              if (!isPausedRef.current) {
                const newPackets = [...prevPackets, ...message.data];
                // Son 5000 paketi tut (performans için)
                const limitedPackets = newPackets.slice(-5000);
                
                // Otomatik scroll (en son pakete)
                setTimeout(() => {
                  if (listRef.current) {
                    listRef.current.scrollToItem(limitedPackets.length - 1, 'end');
                  }
                }, 100);
                
                return limitedPackets;
              }
              return prevPackets; // Duraklat edilmişse eski paketleri döndür
            });
          } else if (message.type === 'anomalies' && Array.isArray(message.data)) {
            // Anomali bildirimleri - duraklat edilmişse bunlar da durmalı
            if (!isPausedRef.current) {
              message.data.forEach((anomaly: Anomaly) => {
                setAnomalies(prev => [...prev.slice(-9), anomaly]); // Son 10 anomali
                setCurrentAnomaly(anomaly);
                setAnomalySnackbarOpen(true);
              });
            }
          }
        } catch (error) {
          console.error('Mesaj işleme hatası:', error);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        console.log('WebSocket kapandı:', event.code, event.reason);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isPaused) {
            connectWebSocket();
          }
        }, 3000);
      };

      ws.onerror = (error) => {
        setError('WebSocket bağlantı hatası');
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('WebSocket oluşturma hatası:', error);
      setError('WebSocket bağlantısı kurulamadı');
    }
  }, [selectedInterface, isPaused, selectedProtocol]);

  // Interface'leri yükle
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/interfaces`)
      .then((response) => response.json())
      .then((data) => {
        setInterfaces(data.interfaces);
        if (data.interfaces.length > 0) {
          setSelectedInterface(data.interfaces[0].name);
        }
      })
      .catch((error) => {
        setError('Arayüzler yüklenirken hata oluştu');
        console.error('Error fetching interfaces:', error);
      });
  }, []);

  // WebSocket bağlantısını başlat
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectWebSocket]);

  // Protokol filtresi değiştiğinde WebSocket'e bildir
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'filter',
        protocol: selectedProtocol
      }));
    }
  }, [selectedProtocol]);

  // Duraklat/Devam Et
  const togglePause = useCallback(() => {
    const newPaused = !isPaused;
    
    // Önce state'i güncelle
    setIsPaused(newPaused);
    
    // Sonra WebSocket'e bildir
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: newPaused ? 'pause' : 'resume'
        }));
        console.log(`Durum değiştirildi: ${newPaused ? 'DURAKLAT' : 'DEVAM'}`);
      } catch (error) {
        console.error('Duraklat komutu gönderme hatası:', error);
      }
    }
  }, [isPaused]);

  // Temizle
  const clearPackets = useCallback(() => {
    setPackets([]);
    setAnomalies([]);
  }, []);

  // Yakalamaları kaydet
  const saveCapture = useCallback(() => {
    const savedCaptures = JSON.parse(localStorage.getItem('savedCaptures') || '[]');
    const newCapture: SavedCapture = {
      id: Date.now().toString(),
      name: captureNameInput || `Yakalama_${new Date().toLocaleDateString()}`,
      timestamp: new Date().toISOString(),
      packets: packets,
      interface: selectedInterface
    };
    savedCaptures.push(newCapture);
    localStorage.setItem('savedCaptures', JSON.stringify(savedCaptures));
    setSaveDialogOpen(false);
    setCaptureNameInput('');
  }, [packets, selectedInterface, captureNameInput]);

  // Protokol rengini al
  const getProtocolColor = (protocol: string) => {
    switch (protocol) {
      case 'TCP': return terminalColors.blue;
      case 'UDP': return terminalColors.green;
      case 'HTTPS': return terminalColors.purple;
      case 'HTTP': return terminalColors.orange;
      case 'ICMP': return terminalColors.yellow;
      case 'DNS': return terminalColors.red;
      case 'ARP': return terminalColors.text;
      default: return terminalColors.text;
    }
  };

  // isPaused state'i değiştiğinde ref'i de güncelle
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Virtualized Paket Satırı Komponenti
  const VirtualizedPacketRow = memo(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const packet = packets[index];
    
    if (!packet) return null;

    return (
      <div style={style}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            height: ROW_HEIGHT,
            backgroundColor: terminalColors.background,
            borderBottom: `1px solid #21262d`,
            '&:hover': { backgroundColor: '#161b22' },
            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
            px: 1,
          }}
        >
          {/* TIME */}
          <Box sx={{ width: '80px', color: terminalColors.text, fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {packet.time}
          </Box>
          
          {/* PROTOCOL */}
          <Box sx={{ width: '100px', display: 'flex', alignItems: 'center' }}>
            <Chip
              label={packet.protocol}
              size="small"
              sx={{
                backgroundColor: getProtocolColor(packet.protocol),
                color: terminalColors.background,
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                fontWeight: 'bold',
                height: '24px'
              }}
            />
            {packet.anomalies && packet.anomalies.length > 0 && (
              <Tooltip title={packet.anomalies.map(a => a.message).join(', ')}>
                <WarningIcon 
                  sx={{ 
                    color: terminalColors.red, 
                    ml: 0.5, 
                    fontSize: '1rem' 
                  }} 
                />
              </Tooltip>
            )}
          </Box>
          
          {/* SOURCE_IP */}
          <Box sx={{ width: '120px', color: terminalColors.text, fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {packet.source_ip}
          </Box>
          
          {/* SRC_PORT */}
          <Box sx={{ width: '80px', color: terminalColors.text, fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {packet.source_port}
          </Box>
          
          {/* DEST_IP */}
          <Box sx={{ width: '120px', color: terminalColors.text, fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {packet.dest_ip}
          </Box>
          
          {/* DST_PORT */}
          <Box sx={{ width: '80px', color: terminalColors.text, fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {packet.dest_port}
          </Box>
          
          {/* INFO */}
          <Box sx={{ flex: 1, color: terminalColors.green, fontSize: '0.75rem', fontFamily: 'monospace', mr: 2 }}>
            {packet.info}
          </Box>
          
          {/* LENGTH */}
          <Box sx={{ width: '80px', color: terminalColors.yellow, fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {packet.length}
          </Box>
        </Box>
      </div>
    );
  });

  return (
    <Box sx={{ p: 2, height: '100vh', overflow: 'hidden' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Terminal Başlık */}
      <Paper sx={{ 
        p: 2, 
        mb: 2, 
        backgroundColor: terminalColors.background,
        color: terminalColors.text,
        fontFamily: 'monospace'
      }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h6" sx={{ 
            color: terminalColors.green, 
            fontFamily: 'monospace',
            fontWeight: 'bold'
          }}>
            $ NetWatcher Terminal
          </Typography>
          {isConnected && (
            <Chip
              label="CONNECTED"
              color="success"
              size="small"
              sx={{ fontFamily: 'monospace' }}
            />
          )}
          {anomalies.length > 0 && (
            <Badge badgeContent={anomalies.length} color="error">
              <SecurityIcon sx={{ color: terminalColors.red }} />
            </Badge>
          )}
          <Typography variant="caption" sx={{ color: terminalColors.text }}>
            {packets.length} paket
          </Typography>
        </Stack>
      </Paper>

      {/* Kontrol Paneli */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Ağ Arayüzü</InputLabel>
              <Select
                value={selectedInterface}
                onChange={(e) => setSelectedInterface(e.target.value)}
                label="Ağ Arayüzü"
              >
                {interfaces.map((iface) => (
                  <MenuItem key={iface.name} value={iface.name}>
                    {iface.name} ({iface.ip})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Protokol</InputLabel>
              <Select
                value={selectedProtocol}
                onChange={(e) => setSelectedProtocol(e.target.value)}
                label="Protokol"
              >
                {PROTOCOLS.map(protocol => (
                  <MenuItem key={protocol} value={protocol}>
                    {protocol}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={7}>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Tooltip title={isPaused ? "Devam Et" : "Duraklat"}>
                <IconButton onClick={togglePause} color={isPaused ? "primary" : "default"}>
                  {isPaused ? <PlayArrowIcon /> : <PauseIcon />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Kaydet">
                <IconButton 
                  onClick={() => setSaveDialogOpen(true)} 
                  disabled={packets.length === 0}
                  color="success"
                >
                  <SaveIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Temizle">
                <IconButton onClick={clearPackets} color="error">
                  <ClearIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Anomali Paneli */}
      {anomalies.length > 0 && (
        <Paper sx={{ p: 2, mb: 2, backgroundColor: '#fff3cd' }}>
          <Typography variant="h6" gutterBottom sx={{ color: theme.palette.warning.dark }}>
            <SecurityIcon sx={{ mr: 1 }} />
            Tespit Edilen Anomaliler
          </Typography>
          <Stack spacing={1} sx={{ maxHeight: 120, overflow: 'auto' }}>
            {anomalies.slice(-5).map((anomaly, index) => (
              <Alert 
                key={index} 
                severity={anomaly.severity === 'HIGH' ? 'error' : anomaly.severity === 'MEDIUM' ? 'warning' : 'info'}
                sx={{ fontSize: '0.875rem' }}
              >
                <strong>{anomaly.type}:</strong> {anomaly.message}
              </Alert>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Terminal Header */}
      <Paper sx={{ 
        backgroundColor: terminalColors.background,
        border: `1px solid #21262d`,
        mb: 1
      }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            height: ROW_HEIGHT,
            backgroundColor: terminalColors.background,
            borderBottom: `2px solid ${terminalColors.text}`,
            fontFamily: 'monospace',
            fontWeight: 'bold',
            px: 1,
          }}
        >
          <Box sx={{ width: '80px', color: terminalColors.text, fontSize: '0.8rem' }}>TIME</Box>
          <Box sx={{ width: '100px', color: terminalColors.text, fontSize: '0.8rem' }}>PROTOCOL</Box>
          <Box sx={{ width: '120px', color: terminalColors.text, fontSize: '0.8rem' }}>SOURCE_IP</Box>
          <Box sx={{ width: '80px', color: terminalColors.text, fontSize: '0.8rem' }}>SRC_PORT</Box>
          <Box sx={{ width: '120px', color: terminalColors.text, fontSize: '0.8rem' }}>DEST_IP</Box>
          <Box sx={{ width: '80px', color: terminalColors.text, fontSize: '0.8rem' }}>DST_PORT</Box>
          <Box sx={{ flex: 1, color: terminalColors.text, fontSize: '0.8rem', mr: 2 }}>INFO</Box>
          <Box sx={{ width: '80px', color: terminalColors.text, fontSize: '0.8rem' }}>LENGTH</Box>
        </Box>
      </Paper>

      {/* Virtualized Paket Tablosu */}
      <Paper sx={{ 
        flexGrow: 1, 
        overflow: 'hidden',
        backgroundColor: terminalColors.background,
        border: `1px solid #21262d`,
        height: 'calc(100vh - 500px)'
      }}>
        <List
          ref={listRef}
          height={window.innerHeight - 500}
          width="100%"
          itemCount={packets.length}
          itemSize={ROW_HEIGHT}
          style={{
            backgroundColor: terminalColors.background,
          }}
        >
          {VirtualizedPacketRow}
        </List>
      </Paper>

      {/* Kaydetme Dialogu */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Yakalamayı Kaydet</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Yakalama Adı"
            fullWidth
            variant="outlined"
            value={captureNameInput}
            onChange={(e) => setCaptureNameInput(e.target.value)}
            placeholder={`Yakalama_${new Date().toLocaleDateString()}`}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {packets.length} paket kaydedilecek
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>İptal</Button>
          <Button onClick={saveCapture} variant="contained">Kaydet</Button>
        </DialogActions>
      </Dialog>

      {/* Anomali Snackbar */}
      <Snackbar
        open={anomalySnackbarOpen}
        autoHideDuration={6000}
        onClose={() => setAnomalySnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setAnomalySnackbarOpen(false)} 
          severity={currentAnomaly?.severity === 'HIGH' ? 'error' : 'warning'}
        >
          <strong>Anomali Tespit Edildi!</strong><br />
          {currentAnomaly?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default LiveFeed; 