# Vestlandet Kjoretidskart

En liten statisk webapp som lar deg:

- skrive inn fra- og til-adresse
- beregne kjorerute, distanse og estimert kjoretid
- velge om ferger skal tillates i ruteberegning
- sammenligne dagens nett med et framtidsnett i et eget kart
- vise alle veier for Vestlandet som eget kartlag

## Filer

- `index.html` setter opp grensesnittet
- `styles.css` styrer utseendet
- `app.js` handterer kart, adresseoppslag, ruter og lasting av vegfliser
- `data/road-tiles/` inneholder vegdata delt opp i geografiske fliser
- `data/vestlandet-road-tiles.json` er manifestet som forteller appen hvilke fliser som finnes
- `scripts/build-road-dataset.ps1` bygger datasettene fra OpenStreetMap via Overpass
- `hordfast_simplified.geojson`, `e39_rogfast_approx.geojson` og `e39_bokn_bomlafjorden_alt1_simplified.geojson` brukes i framtidskartet

## Slik starter du lokalt

Apne en enkel lokal webserver i denne mappen. Et greit alternativ er:

```powershell
python -m http.server 8000
```

Deretter apner du:

```text
http://localhost:8000
```

## Datakilder

- Kartbakgrunn: OpenStreetMap
- Adresseoppslag: Nominatim
- Ruteberegning: Valhalla public demo
- Veglag: lokale GeoJSON-fliser generert fra OpenStreetMap-data
- Framtidskart: lokale prosjektlinjer lagt oppa vegnettet og brukt som nye forbindelser i hoyre kart

## Merknad

Veglaget lastes fra repoet i stedet for et eksternt API. For a holde siden brukbar er vegnettet delt opp i fliser som lastes etter kartutsnitt og zoom.

## GitHub Pages

Repoet er satt opp med en GitHub Actions-workflow som kan publisere siden til GitHub Pages.
For dette repoet vil adressen normalt bli:

```text
https://sondreolsen.github.io/roghordnyereguleringsplaner/
```

Hvis Pages ikke er aktivert automatisk, maa du i GitHub ga til Settings > Pages og velge GitHub Actions som kilde.
