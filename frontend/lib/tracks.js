export function buildGoogleMapsLink(track) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(track.googleQuery)}`;
}

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 600;
const TRACK_CARD_MAP_WIDTH = 640;
const TRACK_CARD_MAP_HEIGHT = 320;
const STATIC_MAP_MAX_WIDTH = 640;
const STATIC_MAP_MAX_HEIGHT = 640;
const WORLD_DIM = 256;
const TRACK_MAP_CALIBRATIONS = {
  "pf-international": {
    scaleX: 2.08,
    scaleY: 1.24,
    offsetX: 0.01,
    offsetY: -0.01,
    rotationDeg: -0.7,
  },
};

export function buildGoogleStaticMapUrl(track, apiKey, overlayBounds = null, options = {}) {
  if (!apiKey) {
    return "";
  }
  const requestedWidth = options.width || MAP_WIDTH;
  const requestedHeight = options.height || MAP_HEIGHT;
  const requestedScale = options.scale || 2;
  const aspectRatio = requestedHeight > 0 ? requestedWidth / requestedHeight : MAP_WIDTH / MAP_HEIGHT;
  let width = Math.min(requestedWidth, STATIC_MAP_MAX_WIDTH);
  let height = Math.round(width / aspectRatio);
  if (height > STATIC_MAP_MAX_HEIGHT) {
    height = STATIC_MAP_MAX_HEIGHT;
    width = Math.round(height * aspectRatio);
  }
  const scale = Math.min(Math.max(requestedScale, 1), 2);
  const viewport = getStaticMapViewport(track, overlayBounds, width, height);
  const center = viewport.centerQuery || `${viewport.center.lat},${viewport.center.lon}`;
  const params = new URLSearchParams({
    center,
    zoom: String(viewport.zoom),
    size: `${width}x${height}`,
    maptype: "satellite",
    scale: String(scale),
    key: apiKey
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function buildTrackCardMapUrl(track, apiKey) {
  return buildGoogleStaticMapUrl(track, apiKey, null, {
    width: TRACK_CARD_MAP_WIDTH,
    height: TRACK_CARD_MAP_HEIGHT,
    scale: 1,
  });
}

export function findTrackByName(tracks, value) {
  const normalized = String(value || "").trim().toLowerCase();
  return tracks.find((track) => track.name.toLowerCase() === normalized || track.id === normalized) || null;
}

export function projectTraceToStage(trace, viewport, width = MAP_WIDTH, height = MAP_HEIGHT, calibration = null) {
  const points = projectTracePointsToStage(trace, viewport, width, height, calibration);
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export function projectTracePointsToStage(trace, viewport, width = MAP_WIDTH, height = MAP_HEIGHT, calibration = null) {
  if (!trace?.length || !viewport?.center || viewport?.zoom === undefined || viewport?.zoom === null) {
    return [];
  }

  const scale = 2 ** viewport.zoom;
  const worldCenter = latLonToWorld(viewport.center.lat, viewport.center.lon);

  return trace
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
    .map((point) => {
      const worldPoint = latLonToWorld(point.lat, point.lon);
      const pixelX = (worldPoint.x - worldCenter.x) * scale + width / 2;
      const pixelY = (worldPoint.y - worldCenter.y) * scale + height / 2;
      const adjusted = applyTrackCalibration(pixelX, pixelY, width, height, calibration);
      const x = Math.max(-1000, Math.min(width + 1000, adjusted.x));
      const y = Math.max(-1000, Math.min(height + 1000, adjusted.y));
      return { x, y, source: point };
    });
}

export function getTrackMapCalibration(track) {
  if (!track) {
    return null;
  }
  return TRACK_MAP_CALIBRATIONS[track.id] || null;
}

export function getStaticMapViewport(track, overlayBounds = null, width = MAP_WIDTH, height = MAP_HEIGHT) {
  const bounds = overlayBounds?.min_lat !== undefined
    ? overlayBounds
    : null;

  if (!bounds) {
    const centerQuery = getTrackStaticMapQuery(track);
    return {
      center: {
        lat: overlayBounds?.center_lat || 52.0,
        lon: overlayBounds?.center_lon || 0.0,
      },
      centerQuery,
      zoom: 17,
      width,
      height,
    };
  }

  const paddingFactor = 0.12;
  const minLat = bounds.min_lat;
  const maxLat = bounds.max_lat;
  const minLon = bounds.min_lon;
  const maxLon = bounds.max_lon;
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lonSpan = Math.max(maxLon - minLon, 0.0001);
  const paddedMinLat = minLat - latSpan * paddingFactor;
  const paddedMaxLat = maxLat + latSpan * paddingFactor;
  const paddedMinLon = minLon - lonSpan * paddingFactor;
  const paddedMaxLon = maxLon + lonSpan * paddingFactor;
  const center = {
    lat: (paddedMinLat + paddedMaxLat) / 2,
    lon: (paddedMinLon + paddedMaxLon) / 2,
  };
  const zoom = Math.max(
    14,
    Math.min(
      20,
      Math.floor(
        Math.min(
          zoomForLongitude(paddedMinLon, paddedMaxLon, width),
          zoomForLatitude(paddedMinLat, paddedMaxLat, height),
        ),
      ),
    ),
  );

  return { center, zoom, width, height, centerQuery: null };
}

function getTrackStaticMapQuery(track) {
  if (!track) {
    return "United Kingdom";
  }
  if (track.googleQuery) {
    return track.googleQuery;
  }
  if (Array.isArray(track.address) && track.address.length) {
    return track.address.join(", ");
  }
  return [track.name, track.venue, track.postcode].filter(Boolean).join(", ") || "United Kingdom";
}

function latLonToWorld(lat, lon) {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: WORLD_DIM * (0.5 + lon / 360),
    y: WORLD_DIM * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

function applyTrackCalibration(x, y, width, height, calibration) {
  if (!calibration) {
    return { x, y };
  }
  const centerX = width / 2;
  const centerY = height / 2;
  const scaledX = centerX + (x - centerX) * (calibration.scaleX || 1);
  const scaledY = centerY + (y - centerY) * (calibration.scaleY || 1);
  const radians = ((calibration.rotationDeg || 0) * Math.PI) / 180;
  const rotatedX = centerX + (scaledX - centerX) * Math.cos(radians) - (scaledY - centerY) * Math.sin(radians);
  const rotatedY = centerY + (scaledX - centerX) * Math.sin(radians) + (scaledY - centerY) * Math.cos(radians);
  return {
    x: rotatedX + width * (calibration.offsetX || 0),
    y: rotatedY + height * (calibration.offsetY || 0),
  };
}

function zoomForLongitude(minLon, maxLon, width) {
  const fraction = lngFraction(minLon, maxLon);
  return zoom(width, WORLD_DIM, fraction);
}

function zoomForLatitude(minLat, maxLat, height) {
  const fraction = latFraction(minLat, maxLat);
  return zoom(height, WORLD_DIM, fraction);
}

function zoom(mapPx, worldPx, fraction) {
  if (!fraction) {
    return 20;
  }
  return Math.log(mapPx / worldPx / fraction) / Math.LN2;
}

function lngFraction(minLon, maxLon) {
  const diff = maxLon - minLon;
  return ((diff < 0 ? diff + 360 : diff) / 360) || 0.000001;
}

function latFraction(minLat, maxLat) {
  const latRad = (lat) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
    return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
  };
  return (latRad(maxLat) - latRad(minLat)) / Math.PI || 0.000001;
}
