# Miraç Birben Deprem API Servisi

Türkiye ve yakın çevresindeki gerçek zamanlı deprem verilerini sunan modern web servisi. KOERI (Kandilli Rasathanesi ve Deprem Araştırma Enstitüsü) verilerini kullanır.

## Özellikler

- **Gerçek Zamanlı Veriler**: Her 5 dakikada bir KOERI'den veri çeker
- **Modern Arayüz**: Tailwind CSS ile responsive tasarım
- **RESTful API**: Filtrelenebilir endpoint'ler
- **Production Ready**: Rate limiting, güvenlik, hata yönetimi
- **Türkçe Karakter Desteği**: Doğru encoding ile Türkçe karakterler

## API Endpoints

### GET /api/earthquakes

Get earthquake data with optional filtering.

**Query Parameters:**

- `limit` (number): Maximum results (default: 50)
- `minMagnitude` (number): Minimum magnitude filter
- `region` (string): Region name filter (partial match)
- `hours` (number): Only earthquakes from last N hours

**Example:**

```bash
curl "http://localhost:8080/api/earthquakes?limit=10&minMagnitude=3.0"
```

### GET /api/earthquakes/latest

Get the most recent earthquake.

### GET /api/earthquakes/stats

Get statistics about earthquake data.

### GET /health

Health check endpoint.

## Data Format

```json
{
  "data": [
    {
      "id": "2025.12.29_14:54:47_39.2492_28.0960",
      "timestamp": "2025-12-29T14:54:47.000Z",
      "date": "2025.12.29",
      "time": "14:54:47",
      "location": {
        "latitude": 39.2492,
        "longitude": 28.096,
        "depth": 10.5
      },
      "magnitude": {
        "md": null,
        "ml": 2.8,
        "mw": null,
        "primary": 2.8
      },
      "region": "KOZLU-SINDIRGI (BALIKESIR)",
      "quality": "İlksel",
      "source": "KOERI"
    }
  ],
  "count": 1,
  "lastUpdated": "2025-12-29T15:16:26.000Z",
  "source": "KOERI - Kandilli Observatory"
}
```

## Installation & Usage

```bash
# Install dependencies
npm install

# Production mode (Port 8080)
npm start

# Development mode (Port 8081, auto-restart)
npm run dev

# Windows specific commands
npm run start:win    # Production on Windows
npm run dev:win      # Development on Windows
```

### PowerShell Scripts

```powershell
# Production server
.\start-server.ps1

# Development server
.\start-dev.ps1
```

## Environment Configuration

- **Production**: Port 8080, optimized for performance
- **Development**: Port 8081, auto-restart on file changes

### Environment Files

- `.env` - Production settings
- `.env.development` - Development settings

## Environment Variables

- `PORT`: Server port (default: 8080)
- `NODE_ENV`: Environment (production/development)
- `ALLOWED_ORIGINS`: CORS allowed origins (comma-separated)

## Rate Limiting

- 100 requests per 15-minute window per IP
- Rate limit headers included in responses

## Data Source

Data is sourced from KOERI's official earthquake monitoring service:
http://www.koeri.boun.edu.tr/scripts/lst6.asp

**Attribution**: All data belongs to Boğaziçi University Kandilli Observatory and Earthquake Research Institute.
