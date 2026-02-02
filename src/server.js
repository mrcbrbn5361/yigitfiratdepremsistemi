import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { EarthquakeService } from './services/earthquake-service.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { createRateLimiter } from './middleware/rate-limiter.js';
import { getCache, setCache, isCacheValid, getCacheAge, getCacheStats } from './cache.js';

// Load environment variables
dotenv.config();

// Get directory paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicPath = join(__dirname, '..', 'public');

const app = express();
const PORT = process.env.PORT || 3000;
const earthquakeService = new EarthquakeService();

// Security & performance middleware
app.use(helmet({
  contentSecurityPolicy: false, // CSP'yi devre dışı bırak - API servisi için gerekli
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: '*', // Tüm domainlerden erişime izin ver
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: false, // Public API için credentials kapalı
  maxAge: 86400 // 24 saat preflight cache
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(publicPath));

// Set proper headers for all responses
app.use((req, res, next) => {
  // Set UTF-8 encoding for JSON responses
  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Cache control for API responses
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes cache
  }

  next();
});

app.use(createRateLimiter());

// Health check - Türkiye saatinde
app.get('/health', (_req, res) => {
  const turkeyTime = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  res.json({
    status: 'ok',
    timestamp: turkeyTime,
    timezone: 'Europe/Istanbul (UTC+3)'
  });
});

// Root endpoint - Serve HTML page
app.get('/', (req, res) => {
  // If request accepts HTML, serve the HTML page
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile('index.html', { root: publicPath });
  } else {
    // Otherwise serve JSON API info
    res.json({
      name: 'Miraç Birben Deprem API Servisi',
      version: '1.0.0',
      description: 'Miraç Birben Deprem API Servisi - KOERI verilerini kullanan gerçek zamanlı deprem takip sistemi',
      endpoints: {
        health: '/health',
        earthquakes: '/api/earthquakes-kandilli',
        proxy: '/api/kandilli-proxy',
        test: '/api/test-kandilli'
      },
      documentation: '/docs',
      parameters: {
        limit: 'Maximum results for /api/earthquakes-kandilli (default: 10, max: 50)'
      },
      examples: [
        '/api/earthquakes-kandilli?limit=10',
        '/api/kandilli-proxy',
        '/api/test-kandilli'
      ],
      source: 'KOERI - Kandilli Observatory and Earthquake Research Institute',
      attribution: 'All data belongs to Boğaziçi University'
    });
  }
});

// API Documentation page
app.get('/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile('docs.html', { root: publicPath });
});

// Alternative docs routes
app.get('/api-docs', (req, res) => {
  res.redirect('/docs');
});

app.get('/api/docs', (req, res) => {
  res.redirect('/docs');
});

app.get('/api/v1/docs', (req, res) => {
  res.redirect('/docs');
});

// Direct AFAD data endpoint
app.get('/api/earthquakes-direct', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const afadUrl = `https://deprem.afad.gov.tr/apiv2/event/filter?start=2025-01-01&end=2026-12-31&minmag=0&maxmag=10&orderby=timedesc&limit=${limit}`;

    console.log('Fetching from AFAD:', afadUrl);

    const response = await fetch(afadUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`AFAD API error: ${response.status}`);
    }

    const afadData = await response.json();
    console.log('AFAD data received:', afadData?.length, 'items');
    console.log('First item:', afadData?.[0]);

    if (!Array.isArray(afadData) || afadData.length === 0) {
      return res.json({
        success: true,
        data: [],
        count: 0,
        total: 0,
        lastUpdated: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        source: 'AFAD - Afet ve Acil Durum Yönetimi Başkanlığı',
        debug: {
          afadDataType: typeof afadData,
          afadDataLength: afadData?.length || 0,
          firstItem: afadData?.[0] || null
        }
      });
    }

    // Convert AFAD format to our format
    const earthquakes = afadData.map(item => {
      try {
        const date = new Date(item.eventDate);
        if (isNaN(date.getTime())) {
          console.error('Invalid date:', item.eventDate);
          return null;
        }

        const turkeyDate = date.toLocaleDateString('tr-TR').replace(/\//g, '.');
        const turkeyTime = date.toLocaleTimeString('tr-TR', { hour12: false });

        return {
          id: `${item.eventID}_${item.latitude}_${item.longitude}`,
          timestamp: date.toISOString(),
          date: turkeyDate,
          time: turkeyTime,
          location: {
            latitude: parseFloat(item.latitude),
            longitude: parseFloat(item.longitude),
            depth: parseFloat(item.depth || 0)
          },
          magnitude: {
            primary: parseFloat(item.magnitude)
          },
          region: item.location,
          source: 'AFAD'
        };
      } catch (error) {
        console.error('Item parse error:', error, item);
        return null;
      }
    }).filter(Boolean);

    res.json({
      success: true,
      data: earthquakes,
      count: earthquakes.length,
      total: earthquakes.length,
      lastUpdated: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
      source: 'AFAD - Afet ve Acil Durum Yönetimi Başkanlığı'
    });
  } catch (error) {
    console.error('Direct AFAD error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Simple Kandilli proxy
app.get('/api/kandilli-proxy', async (req, res) => {
  try {
    const response = await fetch('https://api.orhanaydogdu.com.tr/deprem/kandilli/live');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Direct Kandilli data endpoint
app.get('/api/earthquakes-kandilli', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const response = await fetch('https://api.orhanaydogdu.com.tr/deprem/kandilli/live');

    if (!response.ok) {
      throw new Error(`Kandilli API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data?.result || !Array.isArray(data.result)) {
      console.log('No result data:', { hasResult: !!data?.result, isArray: Array.isArray(data?.result) });
      return res.json({
        success: true,
        data: [],
        count: 0,
        total: 0,
        lastUpdated: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        source: 'KOERI - Kandilli Rasathanesi'
      });
    }

    console.log(`Processing ${data.result.length} earthquakes, limit: ${limit}`);

    // Convert Kandilli format to our format
    const earthquakes = data.result.slice(0, parseInt(limit)).map(item => {
      try {
        const title = item.title;
        const mag = item.mag;
        const depth = item.depth;
        const latitude = item.geojson?.coordinates?.[1];
        const longitude = item.geojson?.coordinates?.[0];
        const dateTime = item.date_time; // Format: "2026-01-14 14:15:55"

        // Validate required fields
        if (!title || !dateTime) {
          console.log('Missing required fields:', { title, dateTime });
          return null;
        }

        if (!latitude || !longitude || isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude))) {
          console.log('Invalid coordinates:', { latitude, longitude });
          return null;
        }

        // Parse date_time field
        const [datePart, timePart] = dateTime.split(' ');
        const timestamp = `${datePart}T${timePart}+03:00`;
        const turkeyDate = datePart.replace(/-/g, '.');

        // Parse numeric values safely
        const parsedLat = parseFloat(latitude);
        const parsedLon = parseFloat(longitude);
        const parsedDepth = depth ? parseFloat(depth) : 0;
        const parsedMag = mag ? parseFloat(mag) : null;

        return {
          id: `${item.earthquake_id}_${parsedLat.toFixed(4)}_${parsedLon.toFixed(4)}`,
          timestamp,
          date: turkeyDate,
          time: timePart,
          location: {
            latitude: parseFloat(parsedLat.toFixed(4)),
            longitude: parseFloat(parsedLon.toFixed(4)),
            depth: isNaN(parsedDepth) ? 0 : parseFloat(parsedDepth.toFixed(1))
          },
          magnitude: {
            primary: parsedMag !== null && !isNaN(parsedMag) ? parseFloat(parsedMag.toFixed(1)) : null
          },
          region: title.trim(),
          source: 'KOERI'
        };
      } catch (error) {
        console.error('Parse error:', error, item);
        return null;
      }
    }).filter(Boolean);

    console.log(`Parsed ${earthquakes.length} earthquakes successfully`);

    res.json({
      success: true,
      data: earthquakes,
      count: earthquakes.length,
      total: data.result.length,
      lastUpdated: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
      source: 'KOERI - Kandilli Rasathanesi'
    });
  } catch (error) {
    console.error('Kandilli endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Simple Kandilli proxy// Test endpoint for Kandilli API
app.get('/api/test-kandilli', async (req, res) => {
  try {
    const testUrl = 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live';

    console.log('Testing Kandilli API:', testUrl);

    const response = await fetch(testUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    console.log('Kandilli Response status:', response.status);

    if (!response.ok) {
      throw new Error(`Kandilli API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Kandilli Data length:', data?.result?.length);

    res.json({
      success: true,
      status: response.status,
      dataLength: data?.result?.length || 0,
      firstItem: data?.result?.[0] || null,
      url: testUrl
    });
  } catch (error) {
    console.error('Kandilli Test Error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Cache stats endpoint (debug için)
app.get('/api/cache/stats', (req, res) => {
  const stats = getCacheStats();
  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
  });
});

// API routes
app.get('/api/earthquakes', async (req, res, next) => {
  try {
    const { limit = 50, minMagnitude, region, hours } = req.query;
    const startTime = Date.now();

    // Cache kontrolü
    const cache = getCache();

    // Cache boş veya eski ise gerçek veri çek
    if (cache.earthquakes.length === 0 || !isCacheValid()) {
      console.log('🔄 Kandilli\'den gerçek veri çekiliyor...');

      // Force fetch - Vercel cold start için
      try {
        const success = await earthquakeService.fetchData(true); // Force fetch

        if (success && earthquakeService.earthquakes.length > 0) {
          setCache({
            earthquakes: earthquakeService.earthquakes,
            lastUpdate: earthquakeService.getLastUpdate()
          });
          console.log(`✅ Gerçek deprem verileri yüklendi: ${earthquakeService.earthquakes.length} adet`);
        } else {
          console.log('⚠️ Kandilli\'den veri çekilemedi');
        }
      } catch (error) {
        console.error('❌ Kandilli veri çekme hatası:', error.message);
      }

      // Hala veri yoksa loading mesajı
      if (cache.earthquakes.length === 0) {
        const elapsedTime = Date.now() - startTime;
        return res.json({
          success: true,
          data: [],
          count: 0,
          total: 0,
          lastUpdated: null,
          message: 'Kandilli\'den gerçek deprem verileri çekiliyor...',
          loadingTime: `${elapsedTime}ms`,
          estimatedTime: earthquakeService.isFetching ? 'Yaklaşık 15-30 saniye' : 'Başlatılıyor...',
          isLoading: true,
          filters: {
            limit: parseInt(limit) || 50,
            minMagnitude: minMagnitude ? parseFloat(minMagnitude) : null,
            region: region || null,
            hours: hours ? parseInt(hours) : null
          },
          source: 'KOERI - Kandilli Rasathanesi'
        });
      }
    }

    // Gerçek veriyi filtrele ve döndür
    const earthquakes = filterEarthquakes(cache.earthquakes, {
      limit: parseInt(limit) || 50,
      minMagnitude: minMagnitude ? parseFloat(minMagnitude) : undefined,
      region: region || undefined,
      hours: hours ? parseInt(hours) : undefined
    });

    const lastUpdatedTR = cache.lastUpdate ?
      cache.lastUpdate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : null;

    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      data: earthquakes,
      count: earthquakes.length,
      total: cache.earthquakes.length,
      lastUpdated: lastUpdatedTR,
      responseTime: `${responseTime}ms`,
      cacheAge: getCacheAge(),
      isRealData: true,
      dataSource: 'KOERI Gerçek Veri',
      filters: {
        limit: parseInt(limit) || 50,
        minMagnitude: minMagnitude ? parseFloat(minMagnitude) : null,
        region: region || null,
        hours: hours ? parseInt(hours) : null
      },
      source: 'KOERI - Kandilli Rasathanesi'
    });
  } catch (error) {
    next(error);
  }
});

// Filtering function
function filterEarthquakes(earthquakes, filters) {
  const { limit = 50, minMagnitude, region, hours } = filters;

  let filtered = [...earthquakes];

  // Magnitude filtresi
  if (minMagnitude !== undefined) {
    filtered = filtered.filter(eq =>
      eq.magnitude.primary !== null && eq.magnitude.primary >= minMagnitude
    );
  }

  // Bölge filtresi
  if (region && typeof region === 'string' && region.trim().length > 0) {
    const regionLower = region.toLowerCase().trim();
    filtered = filtered.filter(eq =>
      eq.region.toLowerCase().includes(regionLower)
    );
  }

  // Saat filtresi
  if (hours !== undefined) {
    const now = new Date();
    const cutoffMs = now.getTime() - (hours * 60 * 60 * 1000);

    filtered = filtered.filter(eq => {
      const eqTime = new Date(eq.timestamp).getTime();
      return eqTime >= cutoffMs;
    });
  }

  // Sırala ve limit uygula
  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return filtered.slice(0, limit);
}

app.get('/api/earthquakes/latest', async (_req, res, next) => {
  try {
    const cache = getCache();

    if (cache.earthquakes.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'Veriler yükleniyor...',
        source: 'KOERI - Kandilli Rasathanesi'
      });
    }

    // En yeni depremi bul
    const latest = cache.earthquakes
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    res.json({
      success: true,
      data: latest,
      cacheAge: getCacheAge(),
      source: 'KOERI - Kandilli Rasathanesi'
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/earthquakes/stats', async (_req, res, next) => {
  try {
    const cache = getCache();

    if (cache.earthquakes.length === 0) {
      return res.json({
        success: true,
        data: {
          total: 0,
          last24Hours: 0,
          magnitude: { max: null, min: null, avg: null },
          topRegions: [],
          lastUpdate: null
        },
        message: 'Veriler yükleniyor...',
        source: 'KOERI - Kandilli Rasathanesi'
      });
    }

    // İstatistikleri hesapla
    const magnitudes = cache.earthquakes
      .map(eq => eq.magnitude.primary)
      .filter(mag => mag !== null && mag > 0);

    const now = new Date();
    const cutoff24h = now.getTime() - (24 * 60 * 60 * 1000);
    const last24h = cache.earthquakes.filter(eq => {
      const eqTime = new Date(eq.timestamp).getTime();
      return eqTime >= cutoff24h;
    }).length;

    const regions = {};
    cache.earthquakes.forEach(eq => {
      const mainRegion = eq.region.split('-')[0].split('(')[0].trim();
      regions[mainRegion] = (regions[mainRegion] || 0) + 1;
    });

    const topRegions = Object.entries(regions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([region, count]) => ({ region, count }));

    const stats = {
      total: cache.earthquakes.length,
      last24Hours: last24h,
      magnitude: {
        max: magnitudes.length > 0 ? parseFloat(Math.max(...magnitudes).toFixed(1)) : null,
        min: magnitudes.length > 0 ? parseFloat(Math.min(...magnitudes).toFixed(1)) : null,
        avg: magnitudes.length > 0 ? parseFloat((magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length).toFixed(2)) : null
      },
      topRegions,
      lastUpdate: cache.lastUpdate ? cache.lastUpdate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : null
    };

    res.json({
      success: true,
      data: stats,
      cacheAge: getCacheAge(),
      source: 'KOERI - Kandilli Rasathanesi'
    });
  } catch (error) {
    next(error);
  }
});

// Error handling
app.use(createErrorHandler());

// Vercel serverless export
export default app;

// Local development server
const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  const server = app.listen(PORT, '127.0.0.1', () => {
    const mode = process.env.NODE_ENV || 'production';
    console.log(`🌍 Miraç Birben Deprem API Servisi running on http://127.0.0.1:${PORT}`);
    console.log(`📊 Mode: ${mode}`);
    console.log(`🌐 Frontend: http://127.0.0.1:${PORT}`);
    console.log(`📡 API: http://127.0.0.1:${PORT}/api`);
    console.log(`🔄 Auto-refresh: Every 5 minutes`);

    // Initial data fetch
    earthquakeService.fetchData().catch(console.error);

    // Kandilli'den gerçek veri çekme - her 5 dakikada bir
    cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('🔄 Scheduled: Kandilli\'den gerçek veri çekiliyor...');
        const success = await earthquakeService.fetchData(true); // Force fetch
        if (success) {
          setCache({
            earthquakes: earthquakeService.earthquakes,
            lastUpdate: earthquakeService.getLastUpdate()
          });
          console.log(`✅ Scheduled: ${earthquakeService.earthquakes.length} gerçek deprem verisi güncellendi`);
        } else {
          console.log('⚠️ Scheduled: Kandilli\'den veri çekilemedi');
        }
      } catch (error) {
        console.error('❌ Scheduled update hatası:', error.message);
      }
    });
  });

  server.on('error', (error) => {
    if (error.code === 'EACCES') {
      console.error(`❌ Permission denied on port ${PORT}. Try a different port or run as administrator.`);
    } else if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Try a different port.`);
    } else {
      console.error('❌ Server error:', error);
    }
    process.exit(1);
  });
} else {
  // Vercel: İlk veri çekmeyi başlat
  const earthquakeService = new EarthquakeService();
  earthquakeService.fetchData().then(() => {
    if (earthquakeService.earthquakes.length > 0) {
      setCache({
        earthquakes: earthquakeService.earthquakes,
        lastUpdate: earthquakeService.getLastUpdate()
      });
      console.log('🚀 Vercel cold start: Cache hazırlandı');
    }
  }).catch(console.error);
}