// lectorCSV.js — "El pelador de patatas"
// Único trabajo: abrir el texto crudo del CSV, detectar de qué formato viene
// y devolver columnas limpias. No calcula rutas, no sabe de millas náuticas,
// no sabe de mapas. Solo lee.

/**
 * Detecta si el archivo trae posición GPS real (columnas latitude/longitude)
 * o si es el formato multiplexado sin posición (solo velocidad/rumbo).
 * @param {string[]} lineas
 * @returns {'gps'|'sparse'}
 */
export function detectarFormato(lineas) {
    const primeraLinea = (lineas[0] || '').toLowerCase();
    if (primeraLinea.includes('latitude') && primeraLinea.includes('longitude')) {
        return 'gps';
    }
    return 'sparse';
}

// Normaliza fechas tipo "+0100" a "+01:00" para que Date las interprete
// de forma fiable en cualquier navegador.
function normalizarFechaISO(texto) {
    return texto.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}

/**
 * Parsea el formato CSV con columnas: timestamp,latitude,longitude,sog_kts,cog,hdg_true,...
 * @param {string[]} lineas
 * @returns {{tSeg:number, lat:number, lon:number, sog:number, curso:number}[]}
 */
export function parseFormatoGPS(lineas) {
    const cabecera = lineas[0].split(',').map(h => h.trim().toLowerCase());
    const idx = {
        tiempo: cabecera.indexOf('timestamp'),
        lat: cabecera.indexOf('latitude'),
        lon: cabecera.indexOf('longitude'),
        sog: cabecera.findIndex(h => h.includes('sog')),
        cog: cabecera.findIndex(h => h === 'cog'),
        hdg: cabecera.findIndex(h => h.includes('hdg'))
    };

    const puntos = [];
    for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea) continue;
        const columnas = linea.split(',');
        if (columnas.length < cabecera.length) continue;

        const fecha = new Date(normalizarFechaISO(columnas[idx.tiempo]));
        const lat = parseFloat(columnas[idx.lat]);
        const lon = parseFloat(columnas[idx.lon]);
        const sog = parseFloat(columnas[idx.sog]);
        const curso = idx.cog >= 0 ? parseFloat(columnas[idx.cog])
            : (idx.hdg >= 0 ? parseFloat(columnas[idx.hdg]) : NaN);

        if (isNaN(fecha.getTime()) || isNaN(lat) || isNaN(lon) || isNaN(sog) || isNaN(curso)) continue;

        puntos.push({ tSeg: fecha.getTime() / 1000, lat, lon, sog, curso });
    }
    return puntos;
}

/**
 * Parsea el formato multiplexado (id,valor,id,valor,...) sin posición GPS.
 * Canales: 0=tiempo, 51=SOG, 50=COG, 13=HDG.
 * @param {string[]} lineas
 * @returns {{t:number, sog:number, curso:number}[]}
 */
export function parseFormatoSparse(lineas) {
    const datosFiltrados = [];
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea || linea.startsWith('!')) continue;

        const columnas = linea.split(',');
        let tiempoFila = null, sogFila = null, cogFila = null, hdgFila = null;

        for (let j = 0; j < columnas.length; j += 2) {
            const idCanal = columnas[j]?.trim();
            const valorCanal = parseFloat(columnas[j + 1]);
            if (isNaN(valorCanal)) continue;

            if (idCanal === '0') tiempoFila = valorCanal;
            else if (idCanal === '51') sogFila = valorCanal; // SOG
            else if (idCanal === '50') cogFila = valorCanal; // COG
            else if (idCanal === '13') hdgFila = valorCanal; // HDG
        }

        if (tiempoFila !== null && tiempoFila > 40000) {
            const curso = (cogFila !== null) ? cogFila : hdgFila;
            if (sogFila !== null && curso !== null) {
                datosFiltrados.push({ t: tiempoFila, sog: sogFila, curso });
            }
        }
    }
    return datosFiltrados;
}
