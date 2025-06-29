# NetWatcher - Modern Ağ Trafiği İzleme ve Analiz Aracı

Modern ve kullanıcı dostu bir ağ trafiği izleme ve analiz aracı.

## Özellikler

- Gerçek zamanlı ağ trafiği izleme
- Protokol bazlı analiz
- İnteraktif gösterge paneli
- Detaylı paket analizi
- Modern ve kullanıcı dostu arayüz

## Gereksinimler

### Backend
- Python 3.8+
- FastAPI
- Scapy
- uvicorn

### Frontend
- Node.js 16+
- React 18+
- TypeScript
- Material-UI (MUI)

## Kurulum

1. Backend kurulumu:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. Frontend kurulumu:
```bash
cd frontend
npm install
```

## Çalıştırma

1. Backend'i başlatma:
```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
uvicorn main:app --reload
```

2. Frontend'i başlatma:
```bash
cd frontend
npm start
```

## Lisans

MIT License

## Güvenlik Notu

Bu uygulama root/admin yetkileri gerektirir çünkü ağ paketlerini yakalamak için sistem seviyesinde erişim gereklidir. 