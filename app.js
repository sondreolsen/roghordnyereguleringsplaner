const VESTLANDET_BOUNDS = L.latLngBounds(
  L.latLng(57.7, 4.0),
  L.latLng(62.4, 8.9)
);

const map = L.map("map", {
  zoomControl: true,
  minZoom: 6
}).fitBounds(VESTLANDET_BOUNDS, { padding: [20, 20] });

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const routeForm = document.getElementById("route-form");
const fromInput = document.getElementById("from-input");
const toInput = document.getElementById("to-input");
const submitButton = document.getElementById("submit-button");
const swapButton = document.getElementById("swap-button");
const durationOutput = document.getElementById("duration-output");
const distanceOutput = document.getElementById("distance-output");
const statusOutput = document.getElementById("status-output");
const nvdbToggle = document.getElementById("nvdb-toggle");
const ferryToggle = document.getElementById("ferry-toggle");

const markers = {
  from: null,
  to: null
};

let routeLine = null;
const roadTileLayers = new Map();
let roadTileManifest = null;
let manifestPromise = null;

const markerIcon = (label) =>
  L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width:34px;
      height:34px;
      border-radius:50%;
      display:grid;
      place-items:center;
      background:${label === "A" ? "#0f766e" : "#f97316"};
      color:white;
      font-weight:700;
      border:3px solid rgba(255,255,255,0.9);
      box-shadow:0 10px 24px rgba(0,0,0,0.18);
    ">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

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
    return `${minutes} min`;
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

async function fetchRoute(from, to) {
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
          use_ferry: ferryToggle.checked ? 1.0 : 0.0,
          exclude_ferry: !ferryToggle.checked
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

function updateMarker(key, latlng, label, popupText) {
  if (markers[key]) {
    markers[key].setLatLng(latlng);
    markers[key].setPopupContent(`<div class="route-popup">${popupText}</div>`);
    return;
  }

  markers[key] = L.marker(latlng, {
    icon: markerIcon(label)
  })
    .addTo(map)
    .bindPopup(`<div class="route-popup">${popupText}</div>`);
}

function clearRoute() {
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
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
    setStatus(
      ferryToggle.checked
        ? "Soker opp adresser og beregner rute med ferger tillatt..."
        : "Soker opp adresser og beregner rute uten ferger..."
    );
    clearRoute();

    const [from, to] = await Promise.all([geocodeAddress(fromText), geocodeAddress(toText)]);

    updateMarker("from", [from.lat, from.lon], "A", from.label);
    updateMarker("to", [to.lat, to.lon], "B", to.label);

    const route = await fetchRoute(from, to);

    const routeGeometry =
      typeof route.geometry === "string"
        ? decodePolyline(route.geometry, 6)
        : route.geometry;

    routeLine = L.geoJSON(routeGeometry, {
      style: {
        color: "#f97316",
        weight: 6,
        opacity: 0.9
      }
    }).addTo(map);

    durationOutput.textContent = formatDuration(route.duration);
    distanceOutput.textContent = formatDistance(route.distance);
    setStatus("Ruten er klar.");

    const routeBounds = routeLine.getBounds();
    if (routeBounds.isValid()) {
      map.fitBounds(routeBounds.pad(0.2));
    }
  } catch (error) {
    durationOutput.textContent = "-";
    distanceOutput.textContent = "-";
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

async function loadRoadManifest() {
  if (roadTileManifest) {
    return roadTileManifest;
  }

  if (!manifestPromise) {
    manifestPromise = fetch("./data/vestlandet-road-tiles.json", {
      headers: {
        Accept: "application/json"
      }
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Vegmanifest svarte med status ${response.status}.`);
      }

      roadTileManifest = await response.json();
      return roadTileManifest;
    });
  }

  return manifestPromise;
}

async function loadRoadTile(tile) {
  if (roadTileLayers.has(tile.id)) {
    return roadTileLayers.get(tile.id);
  }

  const response = await fetch(`./${tile.file}`, {
    headers: {
      Accept: "application/geo+json,application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Vegflis ${tile.id} svarte med status ${response.status}.`);
  }

  const data = await response.json();
  const layer = createRoadLayer(data);
  roadTileLayers.set(tile.id, layer);
  return layer;
}

async function loadNvdbRoads() {
  if (!nvdbToggle.checked) {
    roadTileLayers.forEach((layer) => map.removeLayer(layer));
    return;
  }

  if (map.getZoom() < 9) {
    roadTileLayers.forEach((layer) => map.removeLayer(layer));
    setStatus("Zoom inn for a vise alle vegene i omradet.");
    return;
  }

  try {
    const manifest = await loadRoadManifest();
    const visibleTiles = manifest.filter((tile) => intersectsBbox(map.getBounds(), tile.bbox));
    const visibleTileIds = new Set(visibleTiles.map((tile) => tile.id));

    roadTileLayers.forEach((layer, tileId) => {
      if (!visibleTileIds.has(tileId) && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    for (const tile of visibleTiles) {
      const layer = await loadRoadTile(tile);
      if (!map.hasLayer(layer)) {
        layer.addTo(map);
      }
    }
  } catch (error) {
    setStatus(`Kunne ikke laste veglaget akkurat na. ${error.message}`);
  }
}

routeForm.addEventListener("submit", handleRouteSubmit);
swapButton.addEventListener("click", swapAddresses);
nvdbToggle.addEventListener("change", loadNvdbRoads);
map.on("moveend", loadNvdbRoads);
loadNvdbRoads();
