from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
from sniffer import PacketSniffer
import logging
import psutil
import netifaces
from typing import List, Dict

# Logging ayarları
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS ayarları
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global sniffer instance
sniffer = None

# WebSocket bağlantılarını yönetmek için sınıf
class ConnectionManager:
    def __init__(self):
        self.active_connections = {}  # WebSocket -> interface_name mapping
        self.paused_connections = set()  # Duraklatılmış bağlantılar

    async def connect(self, websocket: WebSocket, interface: str):
        self.active_connections[websocket] = interface
        logger.info(f"Yeni WebSocket bağlantısı: {interface}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            interface = self.active_connections[websocket]
            del self.active_connections[websocket]
            self.paused_connections.discard(websocket)
            logger.info(f"WebSocket bağlantısı kapandı: {interface}")

    def pause(self, websocket: WebSocket):
        self.paused_connections.add(websocket)
        logger.info(f"Bağlantı duraklatıldı: {self.active_connections.get(websocket)}")

    def resume(self, websocket: WebSocket):
        self.paused_connections.discard(websocket)
        logger.info(f"Bağlantı devam ediyor: {self.active_connections.get(websocket)}")

    def is_paused(self, websocket: WebSocket) -> bool:
        return websocket in self.paused_connections

    async def broadcast_packets(self, packets: List[Dict]):
        disconnected = []
        anomalies = []
        
        for websocket in self.active_connections:
            if not self.is_paused(websocket):
                try:
                    # Anomalileri topla
                    for packet in packets:
                        if packet.get('anomalies'):
                            anomalies.extend(packet['anomalies'])
                    
                    # Paketleri gönder
                    if packets:
                        await websocket.send_json({
                            "type": "packets",
                            "data": packets
                        })
                    
                    # Anomalileri gönder
                    if anomalies:
                        await websocket.send_json({
                            "type": "anomalies",
                            "data": anomalies
                        })
                        
                except Exception as e:
                    logger.error(f"Paket gönderme hatası: {str(e)}")
                    disconnected.append(websocket)
        
        for ws in disconnected:
            self.disconnect(ws)

manager = ConnectionManager()

@app.get("/api/interfaces")
async def get_interfaces():
    """Kullanılabilir ağ arayüzlerini listele (loopback interface'leri hariç)"""
    interfaces = []
    for iface in netifaces.interfaces():
        try:
            addrs = netifaces.ifaddresses(iface)
            # IPv4 adresi varsa interface aktif demektir
            if netifaces.AF_INET in addrs:
                ip_addr = addrs[netifaces.AF_INET][0]["addr"]
                
                # Loopback interface'leri (127.x.x.x) filtrele
                if not ip_addr.startswith("127."):
                    interface_info = {
                        "name": iface,
                        "ip": ip_addr,
                        "mac": addrs[netifaces.AF_LINK][0]["addr"] if netifaces.AF_LINK in addrs else None,
                    }
                    interfaces.append(interface_info)
        except Exception as e:
            logger.error(f"Interface bilgisi alınırken hata: {str(e)}")
    return {"interfaces": interfaces}

@app.websocket("/ws/live_packets")
async def websocket_endpoint(websocket: WebSocket):
    global sniffer
    
    try:
        # WebSocket bağlantısını kabul et
        await websocket.accept()
        
        try:
            # İlk mesajı bekle (interface seçimi ve durum)
            data = await websocket.receive_text()
            config = json.loads(data)
            interface = config.get("interface", "en0")
            is_paused = config.get("isPaused", False)
            protocol_filter = config.get("protocolFilter", "ALL")
            
            # Bağlantıyı yöneticiye ekle
            await manager.connect(websocket, interface)
            
            if is_paused:
                manager.pause(websocket)
            
            # Sniffer'ı başlat veya yeniden kullan
            if sniffer is None:
                sniffer = PacketSniffer()
                
            # Protokol filtresini ayarla
            sniffer.set_protocol_filter(protocol_filter if protocol_filter != 'ALL' else None)
                
            # Callback'i ayarla
            async def packet_callback(packets: List[Dict]):
                await manager.broadcast_packets(packets)
            
            sniffer.callback = packet_callback
            
            # Eğer ilk bağlantıysa sniffer'ı başlat
            if not sniffer.running:
                sniffer.start(interface)
            
            # Ana döngü
            while True:
                try:
                    data = await websocket.receive_text()
                    command = json.loads(data)
                    
                    if command.get("type") == "pause":
                        manager.pause(websocket)
                    elif command.get("type") == "resume":
                        manager.resume(websocket)
                    elif command.get("type") == "filter":
                        protocol_filter = command.get("protocol", "ALL")
                        if sniffer:
                            sniffer.set_protocol_filter(protocol_filter if protocol_filter != 'ALL' else None)
                    
                except WebSocketDisconnect:
                    logger.info("WebSocket bağlantısı normal şekilde kapandı")
                    break
                
        except Exception as e:
            logger.error(f"WebSocket iletişim hatası: {str(e)}")
            if websocket.client_state.CONNECTED:
                await websocket.close(code=1001)
            
    except Exception as e:
        logger.error(f"WebSocket hatası: {str(e)}")
        
    finally:
        # Bağlantıyı temizle
        manager.disconnect(websocket)
        # Eğer hiç aktif bağlantı kalmadıysa sniffer'ı durdur
        if not manager.active_connections and sniffer:
            sniffer.stop()
            sniffer = None

@app.on_event("shutdown")
def shutdown_event():
    """Uygulama kapatılırken sniffer'ı durdur"""
    global sniffer
    if sniffer:
        sniffer.stop()
        sniffer = None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info") 