import iconv from 'iconv-lite';

export class EarthquakeService {
  constructor() {
    this.earthquakes = [];
    this.lastUpdate = null;
    // Orhan Aydoğdu API - Kandilli verilerini JSON formatında sunan güvenilir API
    this.sourceUrl = 'https://raw.githubusercontent.com/gist/mrcbrbn5361/92f37eaca76e75d16d3ac8d62a7a22b9/raw/fake-deprem.json';
    this.maxEarthquakes = 1000;
    this.fetchTimeout = 20000; // 20 saniye
    this.cacheTime = 300000; // 5 dakika
    this.isFetching = false;
    this.failureCount = 0;
    this.lastSuccessfulFetch = null;
  }

  async fetchData(force = false) {
    // Cache kontrolü
    if (!force && this.lastUpdate && this.earthquakes.length > 0) {
      const timeSinceUpdate = Date.now() - this.lastUpdate.getTime();
      if (timeSinceUpdate < this.cacheTime) {
        console.log(`📦 Cache geçerli (${Math.round(timeSinceUpdate / 1000)}s)`);
        return true;
      }
    }

    if (this.isFetching) {
      console.log('⏳ Zaten veri çekiliyor...');
      return false;
    }

    this.isFetching = true;
    const startTime = Date.now();

    try {
      console.log(`🚀 Kandilli verilerini çekiliyor (Orhan Aydoğdu API)...`);

      // Orhan Aydoğdu API bağlantısı
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout);

      const response = await fetch(this.sourceUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const fetchTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`API sunucu hatası: HTTP ${response.status}`);
      }

      console.log(`📡 API yanıtı alındı (${fetchTime}ms)`);

      // JSON response
      const data = await response.json();

      // Orhan Aydoğdu API JSON'ını parse et
      const newEarthquakes = this.parseKandilliData(data);

      if (newEarthquakes.length > 0) {
        this.earthquakes = newEarthquakes.slice(0, this.maxEarthquakes);
        this.earthquakes.sort((a, b) => this.compareTimestamps(b.timestamp, a.timestamp));
        this.lastUpdate = new Date();
        this.lastSuccessfulFetch = new Date();
        this.failureCount = 0;

        console.log(`✅ ${this.earthquakes.length} gerçek deprem verisi yüklendi (${fetchTime}ms)`);
        console.log(`📊 En son deprem: ${this.earthquakes[0]?.region} - ${this.earthquakes[0]?.magnitude.primary} ML`);

        return true;
      } else {
        throw new Error('AFAD API\'sinden veri parse edilemedi');
      }
    } catch (error) {
      this.failureCount++;
      const fetchTime = Date.now() - startTime;
      console.error(`❌ Kandilli veri çekme hatası (${this.failureCount}) - ${fetchTime}ms:`, error.message);

      // Detaylı hata bilgisi
      if (error.name === 'AbortError') {
        console.error('⏰ Timeout: AFAD sunucusu çok yavaş yanıt veriyor');
      } else if (error.message.includes('fetch')) {
        console.error('🌐 Network: İnternet bağlantısı sorunu olabilir');
      }

      return false;
    } finally {
      this.isFetching = false;
    }
  }

  // Kandilli JSON data parser (Orhan Aydoğdu API)
  parseKandilliData(data) {
    const earthquakes = [];
    
    if (!data || !data.result || !Array.isArray(data.result)) {
      console.error('Kandilli API geçersiz format döndürdü');
      return earthquakes;
    }

    let validCount = 0;
    for (const item of data.result) {
      if (validCount >= this.maxEarthquakes) break;
      
      const earthquake = this.parseKandilliItem(item);
      if (earthquake) {
        earthquakes.push(earthquake);
        validCount++;
      }
    }
    
    return earthquakes;
  }

  parseKandilliItem(item) {
    try {
      if (!item || typeof item !== 'object') return null;

      // Orhan Aydoğdu API field mapping - gerçek format
      const title = item.title;
      const mag = parseFloat(item.mag);
      const depth = parseFloat(item.depth);
      const latitude = item.geojson?.coordinates?.[1];
      const longitude = item.geojson?.coordinates?.[0];
      const date = item.date;
      const time = item.time;
      const rev = item.rev || false;

      // Validation
      if (!title || !date || !time || isNaN(latitude) || isNaN(longitude)) return null;
      if (latitude < 30 || latitude > 45 || longitude < 20 || longitude > 50) return null;

      // Date parsing - API uses "2026-01-07" and "14:04:32" format
      const timestamp = `${date}T${time}+03:00`;
      const dateObj = new Date(timestamp);
      
      if (isNaN(dateObj.getTime())) return null;

      // Format date for compatibility
      const turkeyDate = date.replace(/-/g, '.');

      return {
        id: `${item.earthquake_id}_${latitude.toFixed(4)}_${longitude.toFixed(4)}`,
        timestamp,
        date: turkeyDate,
        time,
        location: {
          latitude: parseFloat(latitude.toFixed(4)),
          longitude: parseFloat(longitude.toFixed(4)),
          depth: parseFloat((depth || 0).toFixed(1))
        },
        magnitude: {
          md: null,
          ml: mag ? parseFloat(mag.toFixed(1)) : null,
          mw: null,
          primary: mag ? parseFloat(mag.toFixed(1)) : null
        },
        region: title.trim(),
        quality: rev ? 'Revize' : 'İlksel',
        source: 'KOERI'
      };
    } catch (error) {
      console.error('Kandilli item parse hatası:', error);
      return null;
    }
  }

  // AFAD JSON data parser
  parseAFADData(data) {
    const earthquakes = [];
    
    if (!data || !Array.isArray(data)) {
      console.error('AFAD API geçersiz format döndürdü');
      return earthquakes;
    }

    let validCount = 0;
    for (const item of data) {
      if (validCount >= this.maxEarthquakes) break;
      
      const earthquake = this.parseAFADItem(item);
      if (earthquake) {
        earthquakes.push(earthquake);
        validCount++;
      }
    }
    
    return earthquakes;
  }

  parseAFADItem(item) {
    try {
      if (!item || typeof item !== 'object') return null;

      // AFAD API v2 field mapping
      const eventDate = item.eventDate;
      const latitude = parseFloat(item.latitude);
      const longitude = parseFloat(item.longitude);
      const depth = parseFloat(item.depth);
      const magnitude = parseFloat(item.magnitude);
      const location = item.location || 'Bilinmeyen Bölge';
      const eventID = item.eventID;

      // Validation
      if (!eventDate || isNaN(latitude) || isNaN(longitude)) return null;
      if (latitude < 30 || latitude > 45 || longitude < 20 || longitude > 50) return null;

      // Date parsing - AFAD uses "2026-01-07 11:04:32" format
      const date = new Date(eventDate);
      if (isNaN(date.getTime())) return null;

      // Format date for compatibility
      const turkeyDate = date.toLocaleDateString('tr-TR').replace(/\//g, '.');
      const turkeyTime = date.toLocaleTimeString('tr-TR', { hour12: false });
      const timestamp = date.toISOString();

      return {
        id: `${eventID}_${latitude.toFixed(4)}_${longitude.toFixed(4)}`,
        timestamp,
        date: turkeyDate,
        time: turkeyTime,
        location: {
          latitude: parseFloat(latitude.toFixed(4)),
          longitude: parseFloat(longitude.toFixed(4)),
          depth: parseFloat((depth || 0).toFixed(1))
        },
        magnitude: {
          md: null,
          ml: magnitude ? parseFloat(magnitude.toFixed(1)) : null,
          mw: null,
          primary: magnitude ? parseFloat(magnitude.toFixed(1)) : null
        },
        region: location.trim(),
        quality: 'AFAD',
        source: 'AFAD'
      };
    } catch (error) {
      console.error('AFAD item parse hatası:', error);
      return null;
    }
  }

  // Hızlı parse için optimize edilmiş
  parseEarthquakeData(html) {
    const earthquakes = [];
    const preMatch = html.match(/<pre>([\s\S]*?)<\/pre>/i);
    if (!preMatch) return earthquakes;

    const lines = preMatch[1].split('\n');
    let validCount = 0;

    for (const line of lines) {
      if (validCount >= this.maxEarthquakes) break; // Erken çıkış
      if (this.isHeaderLine(line)) continue;

      const earthquake = this.parseEarthquakeLine(line);
      if (earthquake) {
        earthquakes.push(earthquake);
        validCount++;
      }
    }
    return earthquakes;
  }

  // Optimized header detection
  isHeaderLine(line) {
    const trimmed = line.trim();
    if (trimmed.length < 50) return true;

    // Hızlı kontroller
    const firstChar = trimmed[0];
    if (firstChar !== '2') return true; // 2024, 2025 etc için

    return (
      trimmed.includes('Tarih') ||
      trimmed.includes('----') ||
      trimmed.includes('TÜRKIYE') ||
      trimmed.includes('BÖLGESEL') ||
      trimmed.includes('Son 500')
    );
  }

  // Optimized parsing
  parseEarthquakeLine(line) {
    const trimmed = line.trim();
    if (trimmed.length < 50 || !trimmed.match(/^\d{4}\.\d{2}\.\d{2}/)) return null;

    try {
      const parts = trimmed.split(/\s+/);
      if (parts.length < 9) return null;

      const date = parts[0];
      const time = parts[1];
      const lat = parseFloat(parts[2]);
      const lon = parseFloat(parts[3]);
      const depth = parseFloat(parts[4]);
      const md = this.parseMagnitude(parts[5]);
      const ml = this.parseMagnitude(parts[6]);
      const mw = this.parseMagnitude(parts[7]);

      // Hızlı validasyon
      if (!date || !time || isNaN(lat) || isNaN(lon)) return null;
      if (lat < 30 || lat > 45 || lon < 20 || lon > 50) return null;

      const quality = parts[parts.length - 1];
      const regionParts = parts.slice(8, parts.length - 1);
      const region = regionParts.join(' ').trim() || 'Bilinmeyen Bölge';

      const primary = ml || mw || md;
      const isoDate = date.replace(/\./g, '-');
      const timestamp = `${isoDate}T${time}+03:00`;

      return {
        id: `${date}_${time}_${lat.toFixed(4)}_${lon.toFixed(4)}`,
        timestamp,
        date,
        time,
        location: {
          latitude: parseFloat(lat.toFixed(4)),
          longitude: parseFloat(lon.toFixed(4)),
          depth: parseFloat((depth || 0).toFixed(1))
        },
        magnitude: {
          md: md ? parseFloat(md.toFixed(1)) : null,
          ml: ml ? parseFloat(ml.toFixed(1)) : null,
          mw: mw ? parseFloat(mw.toFixed(1)) : null,
          primary: primary ? parseFloat(primary.toFixed(1)) : null
        },
        region,
        quality: this.normalizeQuality(quality),
        source: 'KOERI'
      };
    } catch (error) {
      return null;
    }
  }

  parseMagnitude(value) {
    if (!value || value === '-.-' || value === '---') return null;
    const num = parseFloat(value);
    return (isNaN(num) || num < 0 || num > 10) ? null : num;
  }

  normalizeQuality(quality) {
    if (!quality) return 'Bilinmeyen';
    const q = quality.toLowerCase();
    if (q.includes('ilksel')) return 'İlksel';
    if (q.includes('revize')) return 'Revize';
    return quality;
  }

  compareTimestamps(a, b) {
    return new Date(a).getTime() - new Date(b).getTime();
  }

  // Hızlı filtering
  async getEarthquakes(filters = {}) {
    const { limit = 50, minMagnitude, region, hours } = filters;
    const validLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 500);

    let filtered = this.earthquakes;

    // Hızlı filtering - en pahalı işlemleri son yap
    if (hours) {
      const validHours = Math.max(parseInt(hours), 1);
      const cutoffMs = Date.now() - (validHours * 60 * 60 * 1000);
      filtered = filtered.filter(eq => {
        const eqTime = new Date(eq.timestamp).getTime();
        return eqTime >= cutoffMs;
      });
    }

    if (minMagnitude !== undefined && minMagnitude !== null) {
      const validMinMagnitude = Math.max(parseFloat(minMagnitude), 0);
      filtered = filtered.filter(eq =>
        eq.magnitude.primary !== null && eq.magnitude.primary >= validMinMagnitude
      );
    }

    if (region && typeof region === 'string' && region.trim().length > 0) {
      const regionLower = region.toLowerCase().trim();
      filtered = filtered.filter(eq =>
        eq.region.toLowerCase().includes(regionLower)
      );
    }

    // Zaten sıralı olduğu için tekrar sıralama yapmaya gerek yok
    return filtered.slice(0, validLimit);
  }

  async getLatestEarthquake() {
    return this.earthquakes.length > 0 ? this.earthquakes[0] : null;
  }

  // Cached statistics
  async getStatistics() {
    if (this.earthquakes.length === 0) {
      return {
        total: 0,
        last24Hours: 0,
        magnitude: { max: null, min: null, avg: null },
        topRegions: [],
        lastUpdate: this.lastUpdate ? this.formatTurkeyTime(this.lastUpdate) : null,
        performance: {
          lastFetch: this.lastSuccessfulFetch ? this.formatTurkeyTime(this.lastSuccessfulFetch) : null,
          failureCount: this.failureCount
        }
      };
    }

    // Cache statistics calculation
    const magnitudes = this.earthquakes
      .map(eq => eq.magnitude.primary)
      .filter(mag => mag !== null && mag > 0);

    const cutoff24h = Date.now() - (24 * 60 * 60 * 1000);
    const last24h = this.earthquakes.filter(eq => {
      const eqTime = new Date(eq.timestamp).getTime();
      return eqTime >= cutoff24h;
    }).length;

    const regions = {};
    this.earthquakes.slice(0, 100).forEach(eq => { // Sadece ilk 100'ü analiz et
      const mainRegion = eq.region.split('-')[0].split('(')[0].trim();
      regions[mainRegion] = (regions[mainRegion] || 0) + 1;
    });

    const topRegions = Object.entries(regions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([region, count]) => ({ region, count }));

    return {
      total: this.earthquakes.length,
      last24Hours: last24h,
      magnitude: {
        max: magnitudes.length > 0 ? parseFloat(Math.max(...magnitudes).toFixed(1)) : null,
        min: magnitudes.length > 0 ? parseFloat(Math.min(...magnitudes).toFixed(1)) : null,
        avg: magnitudes.length > 0 ? parseFloat((magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length).toFixed(2)) : null
      },
      topRegions,
      lastUpdate: this.lastUpdate ? this.formatTurkeyTime(this.lastUpdate) : null,
      performance: {
        lastFetch: this.lastSuccessfulFetch ? this.formatTurkeyTime(this.lastSuccessfulFetch) : null,
        failureCount: this.failureCount
      }
    };
  }

  formatTurkeyTime(date) {
    return date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  }

  getLastUpdate() {
    return this.lastUpdate;
  }
}
