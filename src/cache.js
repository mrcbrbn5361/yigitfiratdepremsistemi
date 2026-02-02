// Simple cache for earthquake data
let earthquakeCache = {
  earthquakes: [],
  lastUpdate: null,
  fetchCount: 0,
  errorCount: 0
};

export function setCache(data) {
  if (data.earthquakes && data.earthquakes.length > 0) {
    earthquakeCache = {
      earthquakes: data.earthquakes,
      lastUpdate: data.lastUpdate || new Date(),
      fetchCount: earthquakeCache.fetchCount + 1,
      errorCount: 0
    };
    console.log(`✅ Cache güncellendi: ${earthquakeCache.earthquakes.length} gerçek deprem verisi`);
  } else {
    earthquakeCache.errorCount++;
    console.log(`⚠️ Veri çekme başarısız (Hata #${earthquakeCache.errorCount})`);
  }
}

export function getCache() {
  return earthquakeCache;
}

export function isCacheValid(maxAge = 5 * 60 * 1000) { // 5 dakika
  if (!earthquakeCache.lastUpdate || earthquakeCache.earthquakes.length === 0) {
    return false;
  }
  return (Date.now() - earthquakeCache.lastUpdate.getTime()) < maxAge;
}

export function getCacheAge() {
  if (!earthquakeCache.lastUpdate) return null;
  return Math.round((Date.now() - earthquakeCache.lastUpdate.getTime()) / 1000);
}

export function getCacheStats() {
  return {
    totalEarthquakes: earthquakeCache.earthquakes.length,
    lastUpdate: earthquakeCache.lastUpdate,
    fetchCount: earthquakeCache.fetchCount,
    errorCount: earthquakeCache.errorCount,
    cacheAge: getCacheAge(),
    isRealData: earthquakeCache.earthquakes.length > 0
  };
}