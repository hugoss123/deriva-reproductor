const RADIO_TIERRA_NM = 3440.065;
const NM_POR_GRADO_LAT = 60;

export function distanciaHaversineNm(lat1, lon1, lat2, lon2) {
    const toRad = g => (g * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return RADIO_TIERRA_NM * c;
}

export function formatearReloj(segundosTranscurridos) {
    const h = Math.floor(segundosTranscurridos / 3600).toString().padStart(2, '0');
    const m = Math.floor((segundosTranscurridos % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(segundosTranscurridos % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * Construye la ruta a partir de posición GPS real.
 */
export function construirDesdeGPS(crudos, direccionViento = null) {
    const primerTiempo = crudos[0].tSeg;
    let maxSOG = crudos[0].sog;
    let distanciaAcumulada = 0;

    const puntos = [];
    const coordenadasMapa = [];

    for (let k = 0; k < crudos.length; k++) {
        const pAct = crudos[k];
        
        // Si no trae viento de forma nativa, inyectamos el manual
        const twd = pAct.twd !== null ? pAct.twd : direccionViento;
        const twa = pAct.twa !== null ? pAct.twa : (twd !== null ? calcularTWA(pAct.curso, twd) : null);

        if (k > 0) {
            const pAnt = crudos[k - 1];
            const dtSeconds = pAct.tSeg - pAnt.tSeg;
            if (dtSeconds <= 0 || dtSeconds > 30) continue;
            distanciaAcumulada += distanciaHaversineNm(pAnt.lat, pAnt.lon, pAct.lat, pAct.lon);
        }

        if (pAct.sog > maxSOG) maxSOG = pAct.sog;

        const segundosTranscurridos = pAct.tSeg - primerTiempo;
        coordenadasMapa.push([pAct.lat, pAct.lon]);
        
        puntos.push({
            lat: pAct.lat,
            lon: pAct.lon,
            sog: pAct.sog,
            curso: pAct.curso,
            twa: twa,
            twd: twd,
            segundos: segundosTranscurridos,
            tiempoFormateado: formatearReloj(segundosTranscurridos),
            distancia: distanciaAcumulada.toFixed(2)
        });
    }

    return { puntos, coordenadasMapa, maxSOG, tipoPosicion: 'gps' };
}

/**
 * Reconstruye la ruta por estima náutica (dead reckoning) cuando no hay GPS.
 */
export function construirDesdeSparse(datosFiltrados, latInicial, lonInicial, anclada) {
    const primerTiempo = datosFiltrados[0].t;
    let latActual = latInicial;
    let lonActual = lonInicial;
    let maxSOG = datosFiltrados[0].sog;
    let distanciaAcumulada = 0;

    const puntos = [];
    const coordenadasMapa = [];

    for (let k = 0; k < datosFiltrados.length; k++) {
        const pAct = datosFiltrados[k];

        if (k > 0) {
            const pAnt = datosFiltrados[k - 1];
            const dtSeconds = Math.round((pAct.t - pAnt.t) * 86400);
            if (dtSeconds <= 0 || dtSeconds > 10) continue;

            const anguloRad = (pAct.curso * Math.PI) / 180;
            const distanciaTramoNm = pAct.sog * (dtSeconds / 3600); 

            const despNorteNm = distanciaTramoNm * Math.cos(anguloRad);
            const despEsteNm = distanciaTramoNm * Math.sin(anguloRad);

            latActual += despNorteNm / NM_POR_GRADO_LAT;
            lonActual += despEsteNm / (NM_POR_GRADO_LAT * Math.cos((latActual * Math.PI) / 180));
            distanciaAcumulada += distanciaTramoNm;
        }

        if (pAct.sog > maxSOG) maxSOG = pAct.sog;

        const segundosTranscurridos = Math.round((pAct.t - primerTiempo) * 86400);
        coordenadasMapa.push([latActual, lonActual]);

        puntos.push({
            lat: latActual,
            lon: lonActual,
            sog: pAct.sog,
            curso: pAct.curso,
            twa: pAct.twa !== null ? pAct.twa : (pAct.twd !== null ? calcularTWA(pAct.curso, pAct.twd) : null),
            twd: pAct.twd,
            segundos: segundosTranscurridos,
            tiempoFormateado: formatearReloj(segundosTranscurridos),
            distancia: distanciaAcumulada.toFixed(2)
        });
    }

    return {
        puntos, coordenadasMapa, maxSOG,
        tipoPosicion: anclada ? 'estimada-anclada' : 'estimada-relativa'
    };
}

function normalizarDiferenciaAngular(diffGrados) {
    return ((diffGrados % 360) + 540) % 360 - 180;
}

export function calcularTWA(curso, direccionViento) {
    return normalizarDiferenciaAngular(curso - direccionViento);
}

export function promedioAngular(direcciones) {
    let sumaX = 0, sumaY = 0, n = 0;
    for (const d of direcciones) {
        if (d === null || d === undefined || isNaN(d)) continue;
        const rad = (d * Math.PI) / 180;
        sumaX += Math.cos(rad);
        sumaY += Math.sin(rad);
        n++;
    }
    if (n === 0) return null;
    let grados = (Math.atan2(sumaY / n, sumaX / n) * 180) / Math.PI;
    if (grados < 0) grados += 360;
    return grados;
}

/**
 * Cuenta viradas y trasluchadas de forma temporal estable.
 */
export function calcularManiobras(puntos, ventanaSegundos = 15, umbralGrados = 40) {
    let viradas = 0, trasluchadas = 0;
    let huboDatosViento = false;
    let j = 0;

    for (let i = 0; i < puntos.length; i++) {
        while (j < i && puntos[i].segundos - puntos[j].segundos > ventanaSegundos) j++;
        if (i - j < 3) continue;

        const twaAntes = puntos[j].twa;
        const twaAhora = puntos[i].twa;
        if (twaAntes === null || twaAntes === undefined || isNaN(twaAntes)) continue;
        if (twaAhora === null || twaAhora === undefined || isNaN(twaAhora)) continue;
        huboDatosViento = true;

        const signoAntes = Math.sign(twaAntes);
        const signoAhora = Math.sign(twaAhora);
        const cambioDeAmura = signoAntes !== 0 && signoAhora !== 0 && signoAntes !== signoAhora;
        const magnitudCambio = Math.abs(normalizarDiferenciaAngular(twaAhora - twaAntes));

        if (cambioDeAmura && magnitudCambio > umbralGrados) {
            const promedioAbs = (Math.abs(twaAntes) + Math.abs(twaAhora)) / 2;
            if (promedioAbs < 90) viradas++; else trasluchadas++;
            j = i; 
        }
    }

    return huboDatosViento ? { viradas, trasluchadas } : null;
}