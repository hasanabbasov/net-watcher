import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  FileDownload as DownloadIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';

interface Packet {
  time: string;
  protocol: string;
  source_ip: string;
  source_port: number | null;
  dest_ip: string;
  dest_port: number | null;
  info: string;
  length: number;
}

interface SavedCapture {
  id: string;
  name: string;
  timestamp: string;
  packets: Packet[];
  interface?: string;
}

const SavedCaptures: React.FC = () => {
  const theme = useTheme();
  const [captures, setCaptures] = useState<SavedCapture[]>([]);
  const [selectedCapture, setSelectedCapture] = useState<SavedCapture | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('savedCaptures');
    if (saved) {
      setCaptures(JSON.parse(saved));
    }
  }, []);

  const handleDelete = (id: string) => {
    const updatedCaptures = captures.filter(capture => capture.id !== id);
    setCaptures(updatedCaptures);
    localStorage.setItem('savedCaptures', JSON.stringify(updatedCaptures));
  };

  const handleView = (capture: SavedCapture) => {
    setSelectedCapture(capture);
    setViewDialogOpen(true);
  };

  const handleDownload = (capture: SavedCapture) => {
    const dataStr = JSON.stringify(capture, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `netwatcher_capture_${capture.id}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const getProtocolStats = (packets: Packet[]) => {
    const stats: { [key: string]: number } = {};
    packets.forEach(packet => {
      stats[packet.protocol] = (stats[packet.protocol] || 0) + 1;
    });
    return stats;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Kayıtlı Hareketler
      </Typography>
      
      {captures.length === 0 ? (
        <Alert severity="info">
          Henüz kaydedilmiş trafik yakalama bulunmamaktadır. 
          Canlı akış sayfasından trafik yakalayıp kaydedebilirsiniz.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {captures.map((capture) => {
            const protocolStats = getProtocolStats(capture.packets);
            const totalPackets = capture.packets.length;
            
            return (
              <Grid item xs={12} md={6} lg={4} key={capture.id}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {capture.name || `Yakalama #${capture.id}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {new Date(capture.timestamp).toLocaleString()}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      Toplam Paket: {totalPackets}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      Arayüz: {capture.interface || 'Bilinmiyor'}
                    </Typography>
                    
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" gutterBottom>
                        Protokoller:
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {Object.entries(protocolStats).map(([protocol, count]) => (
                          <Chip
                            key={protocol}
                            label={`${protocol}: ${count}`}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Box>
                    
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="Görüntüle">
                        <IconButton
                          onClick={() => handleView(capture)}
                          color="primary"
                        >
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="İndir">
                        <IconButton
                          onClick={() => handleDownload(capture)}
                          color="success"
                        >
                          <DownloadIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Sil">
                        <IconButton
                          onClick={() => handleDelete(capture.id)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Yakalama Görüntüleme Dialogu */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {selectedCapture?.name || `Yakalama #${selectedCapture?.id}`}
        </DialogTitle>
        <DialogContent>
          {selectedCapture && (
            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Zaman</TableCell>
                    <TableCell>Protokol</TableCell>
                    <TableCell>Kaynak IP</TableCell>
                    <TableCell>Kaynak Port</TableCell>
                    <TableCell>Hedef IP</TableCell>
                    <TableCell>Hedef Port</TableCell>
                    <TableCell>Bilgi</TableCell>
                    <TableCell>Boyut</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedCapture.packets.map((packet, index) => (
                    <TableRow key={index}>
                      <TableCell>{packet.time}</TableCell>
                      <TableCell>
                        <Chip
                          label={packet.protocol}
                          size="small"
                          sx={{
                            backgroundColor: (() => {
                              switch (packet.protocol) {
                                case 'TCP': return theme.palette.info.light;
                                case 'UDP': return theme.palette.success.light;
                                case 'HTTPS': return theme.palette.secondary.light;
                                case 'HTTP': return theme.palette.primary.light;
                                case 'ICMP': return theme.palette.warning.light;
                                case 'DNS': return theme.palette.error.light;
                                case 'ARP': return theme.palette.grey[400];
                                default: return theme.palette.grey[300];
                              }
                            })(),
                          }}
                        />
                      </TableCell>
                      <TableCell>{packet.source_ip}</TableCell>
                      <TableCell>{packet.source_port}</TableCell>
                      <TableCell>{packet.dest_ip}</TableCell>
                      <TableCell>{packet.dest_port}</TableCell>
                      <TableCell>{packet.info}</TableCell>
                      <TableCell>{packet.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>
            Kapat
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SavedCaptures; 