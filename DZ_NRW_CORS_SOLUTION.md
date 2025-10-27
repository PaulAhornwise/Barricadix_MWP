# 🚀 DZ NRW 3D Integration - CORS-Lösung

## 🔍 Problem identifiziert

Die 3D-Funktion zeigt eine "plattgestreckte OSM-Satellitenkarte" statt der echten DZ NRW 3D-Daten, weil:

1. **CORS-Blockierung**: `opengeodata.nrw.de` blockiert Anfragen von `localhost:5173`
2. **Fallback auf OSM**: Cesium fällt auf Standard-Imagery zurück
3. **3D-Darstellung**: Die OSM-Karte wird im 3D-Modus angezeigt

## ✅ Lösung: Proxy-Server

### Schritt 1: Proxy-Server installieren

```bash
# Proxy-Dependencies installieren
npm install express http-proxy-middleware cors nodemon --save-dev
```

### Schritt 2: Proxy-Server starten

```bash
# In einem separaten Terminal:
npm run proxy
```

Der Proxy läuft auf `http://localhost:3001` und leitet Anfragen an `opengeodata.nrw.de` weiter.

### Schritt 3: Anwendung testen

1. Proxy-Server starten: `npm run proxy`
2. Hauptanwendung starten: `npm run dev`
3. 3D-Button klicken
4. Echte DZ NRW 3D-Daten sollten jetzt laden!

## 🔧 Technische Details

### Proxy-Endpoints:
- **3D Tiles**: `http://localhost:3001/dz-nrw-3d-tiles/tileset.json`
- **SceneServer**: `http://localhost:3001/dz-nrw-scene`

### CORS-Konfiguration:
```javascript
cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
})
```

## 🐛 Debugging

### Konsole prüfen:
```bash
# Proxy-Logs
🔄 Proxying 3D Tiles request: /dz-nrw-3d-tiles/tileset.json
✅ Successfully loaded 3D Tiles.

# Browser-Logs
🔧 Final URLs - Tiles: http://localhost:3001/dz-nrw-3d-tiles/tileset.json
✅ Successfully loaded 3D Tiles.
```

### Fallback-Verhalten:
1. **3D Tiles** (Cesium 3D Tiles) → **SceneServer** (ArcGIS) → **Placeholder** (Demo-Gebäude)

## 🚨 Wichtige Hinweise

- **Proxy muss laufen**: Ohne Proxy-Server werden CORS-Fehler auftreten
- **Port 3001**: Muss frei sein für den Proxy-Server
- **Entwicklungsumgebung**: Diese Lösung ist nur für `localhost` gedacht

## 🔄 Alternative Lösungen

### Option 1: Produktions-Proxy
Für Produktion einen echten Proxy-Server (nginx, Apache) konfigurieren.

### Option 2: Server-seitige Integration
DZ NRW Daten server-seitig laden und über eigene API bereitstellen.

### Option 3: CORS-Header
Falls möglich, `opengeodata.nrw.de` um CORS-Header erweitern lassen.

## 📞 Support

Bei Problemen:
1. Proxy-Server-Logs prüfen
2. Browser-Netzwerk-Tab prüfen
3. Konsole auf CORS-Fehler prüfen
4. Port 3001 auf Verfügbarkeit prüfen


