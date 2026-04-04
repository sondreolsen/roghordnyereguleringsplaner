const VESTLANDET_BOUNDS = L.latLngBounds(
  L.latLng(57.7, 4.0),
  L.latLng(62.4, 8.9)
);

const PROJECT_SPECS = [
  {
    id: "hordfast",
    name: "Hordfast",
    file: "./hordfast_simplified.geojson",
    color: "#7c3aed",
    speedKph: 110,
    northPortal: { lon: 5.44045, lat: 60.20445 },
    southPortal: { lon: 5.49657, lat: 59.79889 },
    corridor: {
      northMinLat: 60.0,
      southMaxLat: 60.0,
      westMaxLon: 6.2
    }
  },
  {
    id: "bokn-bomlafjorden",
    name: "Bokn-Bomlafjorden",
    file: "./e39_bokn_bomlafjorden_alt1_simplified.geojson",
    color: "#d97706",
    speedKph: 110,
    northPortal: { lon: 5.488, lat: 59.704 },
    southPortal: { lon: 5.443, lat: 59.1845 },
    corridor: {
      northMinLat: 59.55,
      southMaxLat: 59.35,
      westMaxLon: 6.1
    }
  },
  {
    id: "rogfast",
    name: "Rogfast",
    file: "./e39_rogfast_approx.geojson",
    color: "#1d4ed8",
    speedKph: 110,
    routeFeatureIds: [
      "rogfast_bokn_surface_road_approx",
      "rogfast_main_tunnel_approx"
    ],
    northPortal: { lon: 5.456, lat: 59.207 },
    southPortal: { lon: 5.6358, lat: 59.01191 },
    corridor: {
      northMinLat: 59.1,
      southMaxLat: 59.08,
      westMaxLon: 6.0
    }
  }
];

const routeForm = document.getElementById("route-form");
const fromInput = document.getElementById("from-input");
const toInput = document.getElementById("to-input");
const submitButton = document.getElementById("submit-button");
const swapButton = document.getElementById("swap-button");
const currentDurationOutput = document.getElementById("current-duration-output");
const currentDistanceOutput = document.getElementById("current-distance-output");
const futureDurationOutput = document.getElementById("future-duration-output");
const futureDistanceOutput = document.getElementById("future-distance-output");
const statusOutput = document.getElementById("status-output");
const roadsToggle = document.getElementById("roads-toggle");
const ferryToggle = document.getElementById("ferry-toggle");

const currentMap = createMap("current-map");
const futureMap = createMap("future-map");

syncMaps(currentMap, futureMap);

const roadTileManifestPromise = fetchJson("./data/vestlandet-road-tiles.json");
const roadTileDataCache = new Map();
const roadTileLayerStores = {
  current: new Map(),
  future: new Map()
};

const projectDataPromise = Promise.all(PROJECT_SPECS.map(loadProjectSpec));

const currentMarkers = { from: null, to: null };
const futureMarkers = { from: null, to: null };

let currentRouteLine = null;
let futureRouteLine = null;
function createMap(elementId) {
  const map = L.map(elementId, {
    zoomControl: true,
    minZoom: 6
  }).fitBounds(VESTLANDET_BOUNDS, { padding: [20, 20] });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  return map;
}

function syncMaps(mapA, mapB) {
  let isSyncing = false;

  function bind(source, target) {
    source.on("move", () => {
      if (isSyncing) {
        return;
      }

      isSyncing = true;
      target.setView(source.getCenter(), source.getZoom(), { animate: false });
      isSyncing = false;
    });
  }

  bind(mapA, mapB);
  bind(mapB, mapA);
}

function markerIcon(label, color) {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width:34px;
      height:34px;
      border-radius:50%;
      display:grid;
      place-items:center;
      background:${color};
      color:white;
      font-weight:700;
      border:3px solid rgba(255,255,255,0.9);
      box-shadow:0 10px 24px rgba(0,0,0,0.18);
    ">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

function setStatus(message) {
  statusOutput.textContent = message;
}

function setBusy(isBusy) {
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy ? "Beregner..." : "Beregn kjoretid";
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${totalMinutes} min`;
  }

  if (!minutes) {
    return `${hours} t`;
  }

  return `${hours} t ${minutes} min`;
}

function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

async function fetchJson(path) {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json,application/geo+json"
    }
  });

  if (!response.ok) {
    throw new Error(`Kunne ikke laste ${path} (${response.status}).`);
  }

  return response.json();
}

async function geocodeAddress(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "no");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Adresseoppslag feilet med status ${response.status}.`);
  }

  const results = await response.json();
  if (!results.length) {
    throw new Error(`Fant ingen adresse for "${query}".`);
  }

  return {
    lat: Number(results[0].lat),
    lon: Number(results[0].lon),
    label: results[0].display_name
  };
}

async function fetchValhallaRoute(from, to, allowFerries = true) {
  const response = await fetch("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      locations: [
        { lon: from.lon, lat: from.lat },
        { lon: to.lon, lat: to.lat }
      ],
      costing: "auto",
      costing_options: {
        auto: {
          use_ferry: allowFerries ? 1.0 : 0.0,
          exclude_ferry: !allowFerries
        }
      },
      directions_options: {
        units: "kilometers",
        format: "osrm",
        shape_format: "geojson"
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ruteberegning feilet med status ${response.status}.`);
  }

  const data = await response.json();
  if (!data.routes || !data.routes.length) {
    throw new Error("Fant ingen kjorbar rute mellom adressene.");
  }

  return data.routes[0];
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function fetchRouteWithRetry(from, to, allowFerries = true, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchValhallaRoute(from, to, allowFerries);
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await wait(250 * attempt);
      }
    }
  }

  throw lastError;
}

function decodePolyline(encoded, precision = 6) {
  let index = 0;
  let lat = 0;
  let lon = 0;
  const coordinates = [];
  const factor = 10 ** precision;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const latitudeChange = result & 1 ? ~(result >> 1) : result >> 1;
    lat += latitudeChange;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const longitudeChange = result & 1 ? ~(result >> 1) : result >> 1;
    lon += longitudeChange;

    coordinates.push([lon / factor, lat / factor]);
  }

  return {
    type: "LineString",
    coordinates
  };
}

function routeGeometry(route) {
  return typeof route.geometry === "string"
    ? decodePolyline(route.geometry, 6)
    : route.geometry;
}

function updateMarker(markerStore, map, key, latlng, label, popupText, color) {
  if (markerStore[key]) {
    markerStore[key].setLatLng(latlng);
    markerStore[key].setPopupContent(`<div class="route-popup">${popupText}</div>`);
    return;
  }

  markerStore[key] = L.marker(latlng, {
    icon: markerIcon(label, color)
  })
    .addTo(map)
    .bindPopup(`<div class="route-popup">${popupText}</div>`);
}

function removeLayerIfExists(map, layer) {
  if (layer && map.hasLayer(layer)) {
    map.removeLayer(layer);
  }
}

function clearRoutes() {
  removeLayerIfExists(currentMap, currentRouteLine);
  removeLayerIfExists(futureMap, futureRouteLine);
  currentRouteLine = null;
  futureRouteLine = null;
}

function roadWeight(highway) {
  switch (highway) {
    case "motorway":
    case "trunk":
      return 3;
    case "primary":
    case "secondary":
      return 2.4;
    case "tertiary":
    case "unclassified":
      return 1.8;
    default:
      return 1.1;
  }
}

function roadOpacity(highway) {
  switch (highway) {
    case "motorway":
    case "trunk":
    case "primary":
      return 0.9;
    case "secondary":
    case "tertiary":
      return 0.75;
    default:
      return 0.45;
  }
}

function createRoadLayer(data) {
  return L.geoJSON(data, {
    style(feature) {
      const highway = feature?.properties?.h || "service";
      return {
        color: "#0f766e",
        weight: roadWeight(highway),
        opacity: roadOpacity(highway)
      };
    }
  });
}

function intersectsBbox(bounds, bbox) {
  const [south, west, north, east] = bbox;
  return !(
    bounds.getNorth() < south ||
    bounds.getSouth() > north ||
    bounds.getEast() < west ||
    bounds.getWest() > east
  );
}

async function ensureRoadTiles(mapName, mapInstance) {
  const store = roadTileLayerStores[mapName];

  if (!roadsToggle.checked || mapInstance.getZoom() < 9) {
    store.forEach((layer) => removeLayerIfExists(mapInstance, layer));
    return;
  }

  const manifest = await roadTileManifestPromise;
  const visibleTiles = manifest.filter((tile) => intersectsBbox(mapInstance.getBounds(), tile.bbox));
  const visibleIds = new Set(visibleTiles.map((tile) => tile.id));

  store.forEach((layer, tileId) => {
    if (!visibleIds.has(tileId)) {
      removeLayerIfExists(mapInstance, layer);
    }
  });

  for (const tile of visibleTiles) {
    let data = roadTileDataCache.get(tile.id);
    if (!data) {
      data = await fetchJson(`./${tile.file}`);
      roadTileDataCache.set(tile.id, data);
    }

    let layer = store.get(tile.id);
    if (!layer) {
      layer = createRoadLayer(data);
      store.set(tile.id, layer);
    }

    if (!mapInstance.hasLayer(layer)) {
      layer.addTo(mapInstance);
    }
  }
}

function flattenProjectCoordinates(geojson, spec) {
  const coordinates = [];
  const routeFeatureIds = spec.routeFeatureIds || null;

  for (const feature of geojson.features || []) {
    const geometry = feature.geometry;
    const featureId = feature?.properties?.id || null;

    if (routeFeatureIds && !routeFeatureIds.includes(featureId)) {
      continue;
    }

    if (!geometry) {
      continue;
    }

    if (geometry.type === "LineString") {
      coordinates.push(...geometry.coordinates);
    }

    if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach((segment) => coordinates.push(...segment));
    }
  }

  return coordinates;
}

function coordinatesToGeometry(coordinates) {
  return {
    type: "LineString",
    coordinates
  };
}

function reverseGeometry(geometry) {
  return {
    type: "LineString",
    coordinates: [...geometry.coordinates].reverse()
  };
}

function geometryLengthMeters(geometry) {
  let total = 0;

  for (let i = 1; i < geometry.coordinates.length; i += 1) {
    const [lonA, latA] = geometry.coordinates[i - 1];
    const [lonB, latB] = geometry.coordinates[i];
    total += L.latLng(latA, lonA).distanceTo(L.latLng(latB, lonB));
  }

  return total;
}

function combineLineStrings(segments) {
  const coordinates = [];

  segments.forEach((segment, segmentIndex) => {
    segment.coordinates.forEach((coordinate, coordinateIndex) => {
      if (segmentIndex > 0 && coordinateIndex === 0) {
        const previous = coordinates[coordinates.length - 1];
        if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) {
          return;
        }
      }

      coordinates.push(coordinate);
    });
  });

  return {
    type: "LineString",
    coordinates
  };
}

function approximateProjectDurationSeconds(geometry, speedKph = 110) {
  const meters = geometryLengthMeters(geometry);
  const speedMetersPerSecond = speedKph / 3.6;
  return meters / speedMetersPerSecond;
}

async function loadProjectSpec(spec) {
  const geojson = await fetchJson(spec.file);
  const coordinates = flattenProjectCoordinates(geojson, spec);
  const geometry = coordinatesToGeometry(coordinates);

  return {
    ...spec,
    geojson,
    geometry,
    bbox: L.geoJSON(geojson).getBounds()
  };
}

function shouldUseProject(project, from, to) {
  const northLat = Math.max(from.lat, to.lat);
  const southLat = Math.min(from.lat, to.lat);
  const westLon = Math.min(from.lon, to.lon);
  const corridor = project.corridor;

  return (
    northLat >= corridor.northMinLat &&
    southLat <= corridor.southMaxLat &&
    westLon <= corridor.westMaxLon
  );
}

async function buildFutureRoute(from, to, projects) {
  const northToSouth = from.lat >= to.lat;
  const orderedProjects = northToSouth ? projects : [...projects].reverse();
  const selectedProjects = orderedProjects.filter((project) => shouldUseProject(project, from, to));

  if (!selectedProjects.length) {
    const route = await fetchRouteWithRetry(from, to, false);
    return {
      geometry: routeGeometry(route),
      duration: route.duration,
      distance: route.distance
    };
  }

  const segments = [];
  let totalDuration = 0;
  let totalDistance = 0;
  let currentPoint = { lon: from.lon, lat: from.lat };

  try {
    for (const project of selectedProjects) {
      const entryPoint = northToSouth ? project.northPortal : project.southPortal;
      const exitPoint = northToSouth ? project.southPortal : project.northPortal;
      const projectGeometry = northToSouth ? reverseGeometry(project.geometry) : project.geometry;

      const connectorToProject = await fetchRouteWithRetry(currentPoint, entryPoint, false);
      const connectorGeometry = routeGeometry(connectorToProject);
      segments.push(connectorGeometry);
      totalDuration += connectorToProject.duration;
      totalDistance += connectorToProject.distance;

      segments.push(projectGeometry);
      totalDuration += approximateProjectDurationSeconds(projectGeometry, project.speedKph);
      totalDistance += geometryLengthMeters(projectGeometry);

      currentPoint = exitPoint;
    }

    const connectorToDestination = await fetchRouteWithRetry(currentPoint, to, false);
    segments.push(routeGeometry(connectorToDestination));
    totalDuration += connectorToDestination.duration;
    totalDistance += connectorToDestination.distance;

    return {
      geometry: combineLineStrings(segments),
      duration: totalDuration,
      distance: totalDistance,
      usedProjects: true
    };
  } catch (error) {
    const fallbackRoute = await fetchRouteWithRetry(from, to, false);

    return {
      geometry: routeGeometry(fallbackRoute),
      duration: fallbackRoute.duration,
      distance: fallbackRoute.distance,
      usedProjects: false
    };
  }
}

function drawRoute(mapInstance, geometry, color) {
  return L.geoJSON(geometry, {
    style: {
      color,
      weight: 6,
      opacity: 0.9
    }
  }).addTo(mapInstance);
}

function fitBothMaps(currentLayer, futureLayer) {
  const group = L.featureGroup([currentLayer, futureLayer]);
  const bounds = group.getBounds();

  if (bounds.isValid()) {
    currentMap.fitBounds(bounds.pad(0.12));
  }
}

async function handleRouteSubmit(event) {
  event.preventDefault();

  const fromText = fromInput.value.trim();
  const toText = toInput.value.trim();

  if (!fromText || !toText) {
    setStatus("Fyll inn bade fra- og til-adresse.");
    return;
  }

  try {
    setBusy(true);
    setStatus("Soker opp adresser og beregner dagens og framtidige ruter...");
    clearRoutes();

    const [from, to, projects] = await Promise.all([
      geocodeAddress(fromText),
      geocodeAddress(toText),
      projectDataPromise
    ]);

    updateMarker(currentMarkers, currentMap, "from", [from.lat, from.lon], "A", from.label, "#0f766e");
    updateMarker(currentMarkers, currentMap, "to", [to.lat, to.lon], "B", to.label, "#f97316");
    updateMarker(futureMarkers, futureMap, "from", [from.lat, from.lon], "A", from.label, "#0f766e");
    updateMarker(futureMarkers, futureMap, "to", [to.lat, to.lon], "B", to.label, "#f97316");

    const [currentRouteResult, futureRouteResult] = await Promise.allSettled([
      fetchRouteWithRetry(from, to, ferryToggle.checked),
      buildFutureRoute(from, to, projects)
    ]);

    if (currentRouteResult.status === "rejected") {
      throw currentRouteResult.reason;
    }

    const currentRoute = currentRouteResult.value;
    currentRouteLine = drawRoute(currentMap, routeGeometry(currentRoute), "#f97316");

    currentDurationOutput.textContent = formatDuration(currentRoute.duration);
    currentDistanceOutput.textContent = formatDistance(currentRoute.distance);

    if (futureRouteResult.status === "fulfilled") {
      const futureRoute = futureRouteResult.value;
      futureRouteLine = drawRoute(futureMap, futureRoute.geometry, "#1d4ed8");
      futureDurationOutput.textContent = formatDuration(futureRoute.duration);
      futureDistanceOutput.textContent = formatDistance(futureRoute.distance);
      fitBothMaps(currentRouteLine, futureRouteLine);

      setStatus(
        futureRoute.usedProjects
          ? "Begge kartene er oppdatert. Hoyre kart bruker framtidsforbindelsene i ruteberegningen."
          : "Begge kartene er oppdatert. Hoyre kart falt tilbake til fergefri ruteberegning uten prosjektkoblinger."
      );
    } else {
      futureDurationOutput.textContent = "-";
      futureDistanceOutput.textContent = "-";
      fitBothMaps(currentRouteLine, currentRouteLine);
      setStatus("Dagens rute er oppdatert, men framtidskartet kunne ikke beregnes akkurat na.");
    }
  } catch (error) {
    currentDurationOutput.textContent = "-";
    currentDistanceOutput.textContent = "-";
    futureDurationOutput.textContent = "-";
    futureDistanceOutput.textContent = "-";
    setStatus(error.message);
  } finally {
    setBusy(false);
  }
}

function swapAddresses() {
  const currentFrom = fromInput.value;
  fromInput.value = toInput.value;
  toInput.value = currentFrom;
}

async function refreshRoadLayers() {
  try {
    await Promise.all([
      ensureRoadTiles("current", currentMap),
      ensureRoadTiles("future", futureMap)
    ]);
  } catch (error) {
    setStatus(`Kunne ikke laste veglaget akkurat na. ${error.message}`);
  }
}

routeForm.addEventListener("submit", handleRouteSubmit);
swapButton.addEventListener("click", swapAddresses);
roadsToggle.addEventListener("change", refreshRoadLayers);
currentMap.on("moveend", refreshRoadLayers);
futureMap.on("moveend", refreshRoadLayers);

refreshRoadLayers();
