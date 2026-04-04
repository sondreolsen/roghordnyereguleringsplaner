# Vestlandet Kjoretidskart

En liten statisk webapp som lar deg:

- skrive inn fra- og til-adresse
- beregne kjorerute, distanse og estimert kjoretid
- vise NVDB-vegnett for Vestlandet som eget kartlag

## Filer

- `index.html` setter opp grensesnittet
- `styles.css` styrer utseendet
- `app.js` handterer kart, adresseoppslag, rute og NVDB-data

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
- Vegnettlag: Statens vegvesen NVDB API Les V4

## Merknad

NVDB-laget lastes for kartutsnittet du ser pa. Det gjor at losningen er lettere enn a laste hele Vestlandet pa en gang.
