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

function normalizarFechaISO(texto) {
    return texto.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}

/**
 * Parsea el formato CSV con columnas GPS reales.
 * @param {string[]} lineas
 * @returns {{tSeg:number, lat:number, lon:number, sog:number, curso:number, twd:number|null, twa:number|null}[]}
 */
export function parseFormatoGPS(lineas) {
    const cabecera = lineas[0].split(',').map(h => h.trim().toLowerCase());
    const idx = {
        tiempo: cabecera.indexOf('timestamp'),
        lat: cabecera.indexOf('latitude'),
        lon: cabecera.indexOf('longitude'),
        sog: cabecera.findIndex(h => h.includes('sog')),
        cog: cabecera.findIndex(h => h === 'cog'),
        hdg: cabecera.findIndex(h => h.includes('hdg')),
        twd: cabecera.findIndex(h => h === 'twd' || h.includes('wind dir')),
        twa: cabecera.findIndex(h => h === 'twa' || h.includes('wind ang'))
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
        
        const twd = idx.twd >= 0 ? parseFloat(columnas[idx.twd]) : null;
        const twa = idx.twa >= 0 ? parseFloat(columnas[idx.twa]) : null;

        if (isNaN(fecha.getTime()) || isNaN(lat) || isNaN(lon) || isNaN(sog) || isNaN(curso)) continue;

        puntos.push({ 
            tSeg: fecha.getTime() / 1000, 
            lat, 
            lon, 
            sog, 
            curso, 
            twd: isNaN(twd) ? null : twd, 
            twa: isNaN(twa) ? null : twa 
        });
    }
    return puntos;
}

/**
 * Parsea el formato multiplexado (id,valor,id,valor,...) sin posición GPS.
 * Canales: 0=tiempo, 51=SOG, 50=COG, 13=HDG, 4=TWA, 6=TWD.
 * @param {string[]} lineas
 * @returns {{t:number, sog:number, curso:number, twa:number|null, twd:number|null}[]}
 */
export function parseFormatoSparse(lineas) {
    const datosFiltrados = [];
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea || linea.startsWith('!')) continue;

        const columnas = linea.split(',');
        let tiempoFila = null, sogFila = null, cogFila = null, hdgFila = null, twaFila = null, twdFila = null;

        for (let j = 0; j < columnas.length; j += 2) {
            const idCanal = columnas[j]?.trim();
            const valorCanal = parseFloat(columnas[j + 1]);
            if (isNaN(valorCanal)) continue;

            if (idCanal === '0') tiempoFila = valorCanal;
            else if (idCanal === '51') sogFila = valorCanal; 
            else if (idCanal === '50') cogFila = valorCanal; 
            else if (idCanal === '13') hdgFila = valorCanal; 
            else if (idCanal === '4') twaFila = valorCanal;  
            else if (idCanal === '6') twdFila = valorCanal;  
        }

        if (tiempoFila !== null && tiempoFila > 40000) {
            const curso = (cogFila !== null) ? cogFila : hdgFila;
            if (sogFila !== null && curso !== null) {
                datosFiltrados.push({ 
                    t: tiempoFila, 
                    sog: sogFila, 
                    curso, 
                    twa: twaFila, 
                    twd: twdFila 
                });
            }
        }
    }
    return datosFiltrados;
}