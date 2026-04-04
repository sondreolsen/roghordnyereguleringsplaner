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

const markers = {
  from: null,
  to: null
};

let routeLine = null;
let nvdbLayer = L.geoJSON([], {
  style: {
    color: "#0f766e",
    weight: 2,
    opacity: 0.55
  }
}).addTo(map);
let hasLoadedRoadOverlay = false;

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
  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}`
  );
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
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
    setStatus("Soker opp adresser og beregner rute...");
    clearRoute();

    const [from, to] = await Promise.all([geocodeAddress(fromText), geocodeAddress(toText)]);

    updateMarker("from", [from.lat, from.lon], "A", from.label);
    updateMarker("to", [to.lat, to.lon], "B", to.label);

    const route = await fetchRoute(from, to);

    routeLine = L.geoJSON(route.geometry, {
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

function parseWktLineString(wkt) {
  if (!wkt || typeof wkt !== "string") {
    return null;
  }

  const normalized = wkt.trim();
  if (normalized.startsWith("LINESTRING")) {
    return {
      type: "LineString",
      coordinates: extractLineCoordinates(normalized)
    };
  }

  if (normalized.startsWith("MULTILINESTRING")) {
    return {
      type: "MultiLineString",
      coordinates: extractMultiLineCoordinates(normalized)
    };
  }

  return null;
}

function extractLineCoordinates(wkt) {
  const raw = wkt.slice(wkt.indexOf("(") + 1, wkt.lastIndexOf(")"));
  return raw
    .split(",")
    .map((point) => point.trim().split(/\s+/).map(Number))
    .map(([lon, lat]) => [lon, lat])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function extractMultiLineCoordinates(wkt) {
  const raw = wkt.slice(wkt.indexOf("((") + 2, wkt.lastIndexOf("))"));
  return raw
    .split("),(")
    .map((segment) =>
      segment
        .split(",")
        .map((point) => point.trim().split(/\s+/).map(Number))
        .map(([lon, lat]) => [lon, lat])
        .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
    )
    .filter((segment) => segment.length > 1);
}

function toGeoJsonFeatures(segment) {
  if (segment?.geometri?.wkt) {
    const geometry = parseWktLineString(segment.geometri.wkt);
    if (!geometry || !geometry.coordinates.length) {
      return [];
    }

    return [{
      type: "Feature",
      properties: {
        referanse: segment.referanse || segment.kortform || "Veglenke",
        typeVeg: segment.typeVeg || "Ukjent vegtype"
      },
      geometry
    }];
  }

  if (Array.isArray(segment?.veglenker)) {
    return segment.veglenker
      .map((veglenke) => {
        const geometry = veglenke?.geometri?.wkt
          ? parseWktLineString(veglenke.geometri.wkt)
          : null;

        if (!geometry || !geometry.coordinates.length) {
          return null;
        }

        return {
          type: "Feature",
          properties: {
            referanse: segment.kortform || `Veglenkesekvens ${segment.veglenkesekvensid}`,
            typeVeg: veglenke.typeVeg || segment.typeVeg || "Ukjent vegtype"
          },
          geometry
        };
      })
      .filter(Boolean);
  }

  return [];
}

async function loadNvdbRoads() {
  if (!nvdbToggle.checked) {
    nvdbLayer.clearLayers();
    hasLoadedRoadOverlay = false;
    return;
  }

  if (hasLoadedRoadOverlay) {
    return;
  }

  try {
    const response = await fetch("./data/vestlandet-roads.geojson", {
      headers: {
        Accept: "application/geo+json,application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Veglaget svarte med status ${response.status}.`);
    }

    const data = await response.json();
    nvdbLayer.clearLayers();
    nvdbLayer.addData(data);
    hasLoadedRoadOverlay = true;
  } catch (error) {
    setStatus(`Kunne ikke laste veglaget akkurat na. ${error.message}`);
  }
}

routeForm.addEventListener("submit", handleRouteSubmit);
swapButton.addEventListener("click", swapAddresses);
nvdbToggle.addEventListener("change", loadNvdbRoads);
loadNvdbRoads();
