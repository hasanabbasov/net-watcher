from scapy.all import sniff, IP, TCP, UDP, ICMP, DNS, ARP, Ether
import threading
import queue
import logging
import asyncio
from datetime import datetime, timedelta
import json
from collections import deque, defaultdict
import time
import statistics

logger = logging.getLogger(__name__)

class AnomalyDetector:
    def __init__(self):
        self.packet_rates = deque(maxlen=60)  # Son 60 saniye
        self.protocol_counts = defaultdict(int)
        self.port_counts = defaultdict(int)
        self.ip_counts = defaultdict(int)
        self.last_reset = time.time()
        
        # Eşik değerleri
        self.packet_rate_threshold = 100  # Saniye başına paket
        self.unusual_port_threshold = 10   # Nadir port kullanımı
        self.ip_flood_threshold = 50       # IP başına paket sayısı
        
    def analyze_packet(self, packet_info):
        current_time = time.time()
        
        # Her dakika istatistikleri sıfırla
        if current_time - self.last_reset > 60:
            self.protocol_counts.clear()
            self.port_counts.clear()
            self.ip_counts.clear()
            self.last_reset = current_time
        
        # Paket oranını takip et
        self.packet_rates.append(current_time)
        
        # Protokol, port ve IP istatistiklerini güncelle
        if packet_info.get('protocol'):
            self.protocol_counts[packet_info['protocol']] += 1
        
        if packet_info.get('dest_port'):
            self.port_counts[packet_info['dest_port']] += 1
        
        if packet_info.get('source_ip'):
            self.ip_counts[packet_info['source_ip']] += 1
        
        return self.detect_anomalies(packet_info)
    
    def detect_anomalies(self, packet_info):
        anomalies = []
        
        # Yüksek paket oranı tespiti
        if len(self.packet_rates) >= 10:
            recent_rate = len([t for t in self.packet_rates if time.time() - t < 1])
            if recent_rate > self.packet_rate_threshold:
                anomalies.append({
                    'type': 'HIGH_PACKET_RATE',
                    'message': f'Yüksek paket oranı tespit edildi: {recent_rate} paket/saniye',
                    'severity': 'HIGH'
                })
        
        # Nadir port kullanımı tespiti
        if packet_info.get('dest_port'):
            port = packet_info['dest_port']
            if port > 1024 and self.port_counts[port] == 1:  # İlk kez görülen yüksek port
                anomalies.append({
                    'type': 'UNUSUAL_PORT',
                    'message': f'Nadir port kullanımı: {port}',
                    'severity': 'MEDIUM'
                })
        
        # IP flooding tespiti
        if packet_info.get('source_ip'):
            ip = packet_info['source_ip']
            if self.ip_counts[ip] > self.ip_flood_threshold:
                anomalies.append({
                    'type': 'IP_FLOOD',
                    'message': f'IP flood tespit edildi: {ip} ({self.ip_counts[ip]} paket)',
                    'severity': 'HIGH'
                })
        
        # Şüpheli protokol kombinasyonu
        if packet_info.get('protocol') == 'TCP' and packet_info.get('dest_port') in [22, 23, 3389]:
            anomalies.append({
                'type': 'SUSPICIOUS_CONNECTION',
                'message': f'Şüpheli bağlantı denemesi: {packet_info["protocol"]} port {packet_info["dest_port"]}',
                'severity': 'MEDIUM'
            })
        
        return anomalies

class PacketSniffer:
    def __init__(self):
        self.running = False
        self.thread = None
        self.callback = None
        self._loop = None
        self.packet_buffer = deque(maxlen=1000)
        self.last_send_time = 0
        self.send_interval = 2.0  # 2 saniye aralıkla gönder
        self.packet_count = 0
        self.batch_size = 50
        self.protocol_filter = None  # Protokol filtresi
        self.anomaly_detector = AnomalyDetector()

    def set_protocol_filter(self, protocol):
        """Protokol filtresi ayarla"""
        self.protocol_filter = protocol
        logger.info(f"Protokol filtresi ayarlandı: {protocol}")

    def _process_packet(self, packet):
        """Paketi işle ve JSON formatına dönüştür"""
        try:
            packet_info = {
                "time": datetime.now().strftime("%H:%M:%S"),
                "protocol": None,
                "source_ip": None,
                "source_port": None,
                "dest_ip": None,
                "dest_port": None,
                "info": "",
                "length": len(packet),
                "anomalies": []
            }

            # Ethernet katmanı
            if Ether in packet:
                src_mac = packet[Ether].src
                dst_mac = packet[Ether].dst

            # IP katmanı
            if IP in packet:
                packet_info["source_ip"] = packet[IP].src
                packet_info["dest_ip"] = packet[IP].dst

            # TCP/UDP/ICMP protokolleri
            if TCP in packet:
                packet_info["protocol"] = "TCP"
                packet_info["source_port"] = packet[TCP].sport
                packet_info["dest_port"] = packet[TCP].dport
                packet_info["info"] = f"TCP {packet_info['source_port']} → {packet_info['dest_port']}"

                # HTTPS tespiti
                if packet_info["source_port"] == 443 or packet_info["dest_port"] == 443:
                    packet_info["protocol"] = "HTTPS"
                    packet_info["info"] = f"HTTPS {packet_info['source_port']} → {packet_info['dest_port']}"

                # HTTP tespiti
                elif packet_info["source_port"] == 80 or packet_info["dest_port"] == 80:
                    packet_info["protocol"] = "HTTP"
                    packet_info["info"] = f"HTTP {packet_info['source_port']} → {packet_info['dest_port']}"

            elif UDP in packet:
                packet_info["protocol"] = "UDP"
                packet_info["source_port"] = packet[UDP].sport
                packet_info["dest_port"] = packet[UDP].dport
                packet_info["info"] = f"UDP {packet_info['source_port']} → {packet_info['dest_port']}"

            elif ICMP in packet:
                packet_info["protocol"] = "ICMP"
                packet_info["info"] = "ICMP Echo"

            # DNS protokolü
            if DNS in packet:
                packet_info["protocol"] = "DNS"
                if packet.qr == 0:  # DNS sorgusu
                    packet_info["info"] = f"DNS Query: {packet[DNS].qd.qname.decode()}"
                else:  # DNS cevabı
                    packet_info["info"] = f"DNS Response"

            # ARP protokolü
            elif ARP in packet:
                packet_info["protocol"] = "ARP"
                packet_info["source_ip"] = packet[ARP].psrc
                packet_info["dest_ip"] = packet[ARP].pdst
                packet_info["info"] = "ARP Request" if packet[ARP].op == 1 else "ARP Reply"

            # Protokol filtresi kontrolü - sadece belirli protokol isteniyorsa
            if self.protocol_filter is not None and packet_info["protocol"] != self.protocol_filter:
                return

            # Anomali tespiti
            anomalies = self.anomaly_detector.analyze_packet(packet_info)
            packet_info["anomalies"] = anomalies

            # Paketi buffer'a ekle
            self.packet_buffer.append(packet_info)
            self.packet_count += 1

            # Belirli aralıklarla paketleri gönder
            current_time = time.time()
            if (current_time - self.last_send_time >= self.send_interval or 
                self.packet_count >= self.batch_size) and self.callback and self._loop:
                
                packets_to_send = list(self.packet_buffer)
                self.packet_buffer.clear()
                self.packet_count = 0
                self.last_send_time = current_time

                # Paketleri batch halinde gönder
                asyncio.run_coroutine_threadsafe(
                    self.callback(packets_to_send),
                    self._loop
                )

        except Exception as e:
            logger.error(f"Paket işleme hatası: {str(e)}")

    def _sniff_packets(self, interface):
        """Paket yakalamayı başlat"""
        try:
            logger.info(f"{interface} arayüzünde paket yakalama başlatılıyor...")
            sniff(iface=interface, prn=self._process_packet, store=0, stop_filter=lambda _: not self.running)
        except Exception as e:
            logger.error(f"Paket yakalama hatası: {str(e)}")
        finally:
            logger.info("Paket yakalama durduruluyor...")

    def start(self, interface="en0"):
        """Sniffer'ı başlat"""
        if not self.running:
            self.running = True
            self._loop = asyncio.get_event_loop()
            self.thread = threading.Thread(target=self._sniff_packets, args=(interface,))
            self.thread.daemon = True
            self.thread.start()

    def stop(self):
        """Sniffer'ı durdur"""
        if self.running:
            self.running = False
            if self.thread:
                self.thread.join(timeout=1.0)
                self.thread = None
            self._loop = None
            self.packet_buffer.clear()
            self.packet_count = 0 