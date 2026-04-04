# Vestlandet Kjoretidskart

En liten statisk webapp som lar deg:

- skrive inn fra- og til-adresse
- beregne kjorerute, distanse og estimert kjoretid
- vise et forenklet hovedvegkart for Vestlandet som eget kartlag

## Filer

- `index.html` setter opp grensesnittet
- `styles.css` styrer utseendet
- `app.js` handterer kart, adresseoppslag, rute og veglag
- `data/vestlandet-roads.geojson` inneholder et lettvekts veglag for kartet

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
- Ruteberegning: OSRM demo-server
- Veglag: lokal GeoJSON-fil i repoet

## Merknad

Veglaget lastes fra repoet i stedet for et eksternt API. Det gjor siden mer stabil pa GitHub Pages.

## GitHub Pages

Repoet er satt opp med en GitHub Actions-workflow som kan publisere siden til GitHub Pages.
For dette repoet vil adressen normalt bli:

```text
https://sondreolsen.github.io/roghordnyereguleringsplaner/
```

Hvis Pages ikke er aktivert automatisk, maa du i GitHub ga til Settings > Pages og velge GitHub Actions som kilde.
