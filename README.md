# Deriva — Reproductor de telemetría de regatas

Aplicación web (frontend puro, sin backend) para **reproducir y visualizar recorridos
de regatas de vela** a partir de los logs de datos del barco. Cargas un archivo `.csv`
de la instrumentación de a bordo y la app lo reproduce como un "vídeo" sobre un mapa,
mostrando la telemetría en tiempo real.

## Funcionalidades

- **Mapa interactivo** (Leaflet, capa oscura de CARTO) con el recorrido del barco.
- **Estela coloreada por velocidad** (escala térmica: rojo = lento → amarillo → azul =
  rápido, relativa a la velocidad máxima de esa regata).
- **Reproductor tipo vídeo**: Play / Pausa / Reset, barra de progreso para saltar a
  cualquier momento, e interruptor para ver el recorrido completo o solo lo ya navegado.
- **Panel de telemetría en vivo**: tiempo transcurrido, distancia, velocidad (SOG),
  rumbo (COG) y contador de **viradas y trasluchadas**.
- **Orientación del mapa según el viento** (botón 🧭), además del Norte por defecto.

## Cómo ejecutar

La app usa **módulos ES** (`<script type="module">`), así que **no funciona abriendo
`index.html` directamente** con `file://` — hay que servirla por HTTP. Desde la carpeta
`Codigo/`:

```bash
# Opción A: Python
python -m http.server 8000

# Opción B: Node
npx serve
```

Luego abre `http://localhost:8000` en el navegador y pulsa "Cargar Log de Regata".

## Formatos de log soportados

La app detecta automáticamente el formato al cargar el archivo
(`servicios/lectorCSV.js` → `detectarFormato`).

### 1. Con GPS real

CSV con cabecera que incluye las columnas `latitude` y `longitude`. Se usan las
posiciones directas y las distancias se calculan con la fórmula de **Haversine**.

```
timestamp,latitude,longitude,sog_kts,cog,hdg_true,heel,trim
2025-05-24T10:51:50.053+0100,45.79426,10.8331116,0.500,198.0,296.6,11.9,6.5
```

Columnas reconocidas (nombres flexibles, se buscan por coincidencia):
`timestamp`, `latitude`, `longitude`, `sog`, `cog`, `hdg`, `twd`/`wind dir`,
`twa`/`wind ang`.

### 2. Multiplexado sin posición (estima náutica)

Formato `id,valor,id,valor,...` que solo trae velocidad y rumbo, sin coordenadas.
La trayectoria se reconstruye por **estima náutica (dead reckoning)**, integrando
velocidad × rumbo × tiempo con la corrección de proyección correcta
(1° de longitud = 60·cos(latitud) millas náuticas). Si conoces el punto de salida,
puedes anclarlo al mapa real; si no, se reproduce la forma del recorrido sin
georreferenciar.

**Canales (id de campo):**

| id | Canal            |
|----|------------------|
| 0  | Tiempo           |
| 51 | SOG (velocidad)  |
| 50 | COG (rumbo)      |
| 13 | HDG (proa)       |
| 4  | TWA (áng. viento)|
| 6  | TWD (dir. viento)|

### Viento (TWD/TWA)

Si el log no trae viento de forma nativa, la app lo pide manualmente al cargar el
archivo. El viento se usa para orientar el mapa y para contar viradas/trasluchadas
(sin viento, esos contadores muestran "N/D").

## Estructura del código

```
Codigo/
├── index.html                        Maquetación y estilos
└── src/
    ├── main.js                       Orquestador: une todos los módulos
    ├── servicios/
    │   ├── lectorCSV.js              Detección de formato y parseo de CSV
    │   └── calculadoraNavegacion.js  Haversine, estima, viento y maniobras (lógica pura)
    ├── mapas/
    │   └── configMapa.js             Mapa Leaflet, estela y orientación al viento
    └── componentes/
        ├── ControlesReproductor.js   Botones + motor de reproducción
        └── PanelTelemetria.js        Escritura de datos en el panel (solo DOM)
```

La separación es estricta: `servicios/` no toca el DOM, `componentes/` y `mapas/` no
calculan nada de navegación, y `main.js` es el único que los conecta.

## Logs de ejemplo

En `Logs/` hay archivos de muestra de ambos formatos para probar la app.
