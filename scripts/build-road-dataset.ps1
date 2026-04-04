$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $projectRoot "data"
$tileDir = Join-Path $dataDir "road-tiles"
$manifestPath = Join-Path $dataDir "vestlandet-road-tiles.json"
$overviewPath = Join-Path $dataDir "vestlandet-roads.geojson"

if (-not (Test-Path $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir | Out-Null
}

if (-not (Test-Path $tileDir)) {
  New-Item -ItemType Directory -Path $tileDir | Out-Null
}

$tiles = @(
  @{ id = "tile-01"; south = 57.70; west = 4.00; north = 59.30; east = 5.60 },
  @{ id = "tile-02"; south = 57.70; west = 5.60; north = 59.30; east = 7.20 },
  @{ id = "tile-03"; south = 57.70; west = 7.20; north = 59.30; east = 8.90 },
  @{ id = "tile-04"; south = 59.30; west = 4.00; north = 60.90; east = 5.60 },
  @{ id = "tile-05"; south = 59.30; west = 5.60; north = 60.90; east = 7.20 },
  @{ id = "tile-06"; south = 59.30; west = 7.20; north = 60.90; east = 8.90 },
  @{ id = "tile-07"; south = 60.90; west = 4.00; north = 62.50; east = 5.60 },
  @{ id = "tile-08"; south = 60.90; west = 5.60; north = 62.50; east = 7.20 },
  @{ id = "tile-09"; south = 60.90; west = 7.20; north = 62.50; east = 8.90 }
)

$highwayPattern = "^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|road|track)$"
$overpassEndpoints = @(
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter"
)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$manifest = @()

function Format-Coordinate([double]$value) {
  return $value.ToString("0.####", [System.Globalization.CultureInfo]::InvariantCulture)
}

function Write-FeatureCollection($path, $features) {
  $stream = [System.IO.StreamWriter]::new($path, $false, $utf8NoBom)

  try {
    $stream.Write('{"type":"FeatureCollection","features":[')
    $first = $true

    foreach ($feature in $features) {
      if (-not $first) {
        $stream.Write(',')
      }

      $stream.Write(($feature | ConvertTo-Json -Compress -Depth 8))
      $first = $false
    }

    $stream.Write(']}')
  } finally {
    $stream.Dispose()
  }
}

foreach ($tile in $tiles) {
  $tileFileName = "$($tile.id).geojson"
  $tilePath = Join-Path $tileDir $tileFileName

  if (Test-Path $tilePath) {
    $existingLength = (Get-Item $tilePath).Length
    Write-Host "Skipping existing $tileFileName ($existingLength bytes)"
    $manifest += [ordered]@{
      id = $tile.id
      file = "data/road-tiles/$tileFileName"
      bbox = @($tile.south, $tile.west, $tile.north, $tile.east)
      featureCount = -1
    }
    continue
  }

  $bbox = "{0},{1},{2},{3}" -f `
    (Format-Coordinate $tile.south), `
    (Format-Coordinate $tile.west), `
    (Format-Coordinate $tile.north), `
    (Format-Coordinate $tile.east)

  Write-Host "Fetching tile $($tile.id) $bbox"

  $query = @"
[out:json][timeout:180];
way[highway~"$highwayPattern"]($bbox);
out geom;
"@

  $response = $null
  foreach ($endpoint in $overpassEndpoints) {
    try {
      $response = Invoke-RestMethod `
        -Uri $endpoint `
        -Method Post `
        -ContentType "text/plain; charset=utf-8" `
        -Body $query
      break
    } catch {
      Write-Host "Endpoint failed: $endpoint"
    }
  }

  if (-not $response) {
    throw "Could not fetch road data for tile $($tile.id)"
  }

  $features = @()
  foreach ($element in $response.elements) {
    if (-not $element.geometry) {
      continue
    }

    $coordinates = @()
    foreach ($point in $element.geometry) {
      $coordinates += ,@(
        [math]::Round([double]$point.lon, 5),
        [math]::Round([double]$point.lat, 5)
      )
    }

    if ($coordinates.Count -lt 2) {
      continue
    }

    $tags = $element.tags
    $features += [ordered]@{
      type = "Feature"
      properties = [ordered]@{
        h = $tags.highway
        r = $tags.ref
        n = $tags.name
      }
      geometry = [ordered]@{
        type = "LineString"
        coordinates = $coordinates
      }
    }
  }

  Write-FeatureCollection -path $tilePath -features $features

  $manifest += [ordered]@{
    id = $tile.id
    file = "data/road-tiles/$tileFileName"
    bbox = @($tile.south, $tile.west, $tile.north, $tile.east)
    featureCount = $features.Count
  }

  Write-Host "Wrote $($features.Count) roads to $tileFileName"
}

$manifestJson = $manifest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8NoBom)
[System.IO.File]::WriteAllText($overviewPath, '{"type":"FeatureCollection","features":[]}', $utf8NoBom)

Write-Host "Wrote manifest to $manifestPath"
