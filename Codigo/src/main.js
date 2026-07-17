import { detectarFormato, parseFormatoGPS, parseFormatoSparse } from './servicios/lectorCSV.js';
import { construirDesdeGPS, construirDesdeSparse, calcularManiobras, promedioAngular, detectarTramos } from './servicios/calculadoraNavegacion.js';
import {
    crearMapa, crearGestorEstela, encuadrarMapa,
    crearMarcadorBarco, moverMarcador, eliminarMarcador,
    crearControladorOrientacion, inicializarBotonOrientacion,
    inicializarZoomPersonalizado
} from './mapas/configMapa.js';
import { actualizarTelemetria, actualizarEstado, actualizarManiobras, actualizarTramos } from './componentes/PanelTelemetria.js';
import { inicializarControlesReproductor, crearMotorReproduccion } from './componentes/ControlesReproductor.js';
import { inicializarBarraHerramientas } from './componentes/BarraHerramientas.js';

inicializarBarraHerramientas();

const { mapa, capaEstela } = crearMapa('mapa');
inicializarZoomPersonalizado(mapa);
const gestorEstela = crearGestorEstela(capaEstela);
const controladorOrientacion = crearControladorOrientacion(mapa);
const botonOrientacion = inicializarBotonOrientacion('btn-orientacion', controladorOrientacion);
let marcadorBarco = null;
let motor = null;
let mostrarRecorridoCompleto = false;
let puntosRuta = [];
// Intervalo elegido con los dos handles de la barra de progreso: fuera de él
// no se reproduce ni se dibuja nada.
let rangoInicio = 0;
let rangoFin = 0;

/** Redibuja la estela según el intervalo y hasta dónde ha llegado el barco. */
function refrescarEstela(indiceActual) {
    gestorEstela.mostrarRango(rangoInicio, mostrarRecorridoCompleto ? rangoFin : indiceActual);
}

function refrescarEtiquetaIntervalo() {
    if (puntosRuta.length === 0) return;
    const completo = rangoInicio === 0 && rangoFin === puntosRuta.length - 1;
    controles.establecerEtiquetaIntervalo(completo
        ? 'Intervalo: recorrido completo'
        : `Intervalo: ${puntosRuta[rangoInicio].tiempoFormateado} → ${puntosRuta[rangoFin].tiempoFormateado}`);
}

const controles = inicializarControlesReproductor({
    onPlay: () => { motor?.play(); controles.marcarReproduciendo(); },
    onPause: () => { motor?.pause(); controles.marcarPausado(); },
    onReset: () => { motor?.reset(); controles.marcarPausado(); },
    onSeek: indice => { motor?.pause(); motor?.irAIndice(indice); controles.marcarPausado(); },
    onVelocidad: factor => { motor?.setVelocidad(factor); },
    onRango: (inicio, fin) => {
        rangoInicio = inicio;
        rangoFin = fin;
        refrescarEtiquetaIntervalo();
        if (!motor) return;

        motor.pause();
        controles.marcarPausado();
        motor.setRango(inicio, fin);
        // irAIndice reengancha el cabezal dentro del intervalo (si se quedó
        // fuera) y dispara onFrame, que ya redibuja mapa y telemetría.
        motor.irAIndice(motor.obtenerIndiceActual());
    },
    onToggleRecorridoCompleto: () => {
        mostrarRecorridoCompleto = !mostrarRecorridoCompleto;
        controles.marcarRecorridoCompleto(mostrarRecorridoCompleto);
        refrescarEstela(motor ? motor.obtenerIndiceActual() : rangoInicio);
    }
});

document.getElementById('archivo-csv').addEventListener('change', function (e) {
    const archivo = e.target.files[0];
    if (!archivo) return;

    actualizarEstado("Analizando formato del archivo...", "#94a3b8");
    motor?.pause();
    controles.marcarPausado();

    const lector = new FileReader();
    lector.onload = evento => procesarArchivo(evento.target.result);
    lector.readAsText(archivo);
});

function procesarArchivo(rawTexto) {
    const lineas = rawTexto.split(/\r?\n/);
    eliminarMarcador(mapa, marcadorBarco);

    if (lineas.length === 0 || !lineas[0]) {
        alert("Error: el archivo está vacío.");
        return;
    }

    const formato = detectarFormato(lineas);
    let resultado;

    if (formato === 'gps') {
        const crudos = parseFormatoGPS(lineas);
        if (crudos.length === 0) {
            alert("Error: no se pudieron leer coordenadas GPS válidas en el archivo.");
            return;
        }
        
        // Comprobar si los datos traen viento nativo en las columnas
        let tieneVientoNativo = crudos.some(p => p.twd !== null);
        let direccionViento = null;
        
        if (!tieneVientoNativo) {
            direccionViento = pedirDireccionVientoManual();
        }
        
        resultado = construirDesdeGPS(crudos, direccionViento);
    } else {
        const datosFiltrados = parseFormatoSparse(lineas);
        if (datosFiltrados.length === 0) {
            alert("Error: no se encontraron canales de velocidad y rumbo en el archivo.");
            return;
        }

        let latInicial = 39.45, lonInicial = -0.30, anclada = false;
        const manual = pedirPuntoInicialManual();
        if (manual) {
            latInicial = manual.lat;
            lonInicial = manual.lon;
            anclada = true;
        }

        resultado = construirDesdeSparse(datosFiltrados, latInicial, lonInicial, anclada);
    }

    if (resultado.puntos.length === 0) {
        alert("Error: no se pudo reconstruir ninguna posición válida.");
        return;
    }

    // Calcular maniobras
    const maniobras = calcularManiobras(resultado.puntos);
    actualizarManiobras(maniobras);

    // Identificar los tramos de ceñida y popa del recorrido
    actualizarTramos(detectarTramos(resultado.puntos));

    // Calcular viento medio para orientar el mapa
    const direccionVientoRuta = promedioAngular(resultado.puntos.map(p => p.twd));
    controladorOrientacion.reiniciar(); 
    if (direccionVientoRuta !== null) {
        controladorOrientacion.establecerDireccionViento(direccionVientoRuta);
    }
    botonOrientacion.actualizarAspecto();

    gestorEstela.inicializar(resultado.puntos, resultado.maxSOG);
    encuadrarMapa(mapa, resultado.coordenadasMapa);
    marcadorBarco = crearMarcadorBarco(mapa, resultado.puntos[0].lat, resultado.puntos[0].lon);

    mostrarRecorridoCompleto = false;
    controles.marcarRecorridoCompleto(false);
    controles.reiniciarVelocidad();
    controles.configurarRango(resultado.puntos.length);

    // Cada archivo nuevo empieza con el intervalo abarcando la ruta entera.
    puntosRuta = resultado.puntos;
    rangoInicio = 0;
    rangoFin = resultado.puntos.length - 1;
    refrescarEtiquetaIntervalo();

    const duracionTotalFormateada = resultado.puntos[resultado.puntos.length - 1].tiempoFormateado;

    motor = crearMotorReproduccion({
        puntos: resultado.puntos,
        onFrame: (punto, indice) => {
            moverMarcador(marcadorBarco, punto.lat, punto.lon);
            actualizarTelemetria(punto);
            controles.actualizarProgreso(indice, punto.tiempoFormateado, duracionTotalFormateada);
            refrescarEstela(indice);
        },
        onFin: () => {
            controles.marcarPausado();
            actualizarEstado("● Fin de la reproducción", "#94a3b8");
        }
    });

    motor.reset(); 
    controles.habilitar();

    const mensajesEstado = {
        'gps': "● Listo para reproducir — posición GPS real",
        'estimada-anclada': "● Listo para reproducir — estima anclada al punto de salida indicado",
        'estimada-relativa': "● Listo para reproducir — estima relativa (posición sin georreferenciar)"
    };
    actualizarEstado(mensajesEstado[resultado.tipoPosicion], "#34d399");
}

function pedirDireccionVientoManual() {
    const respuesta = window.prompt(
        "Este archivo no incluye datos de viento.\n" +
        "Si conoces la dirección aproximada de la que venía el viento durante la regata, " +
        "introdúcela en grados (ej: 90 = viento del Este).\n" +
        "Déjalo vacío o cancela si no la conoces (no se podrán contar viradas/trasluchadas " +
        "ni orientar el mapa al viento).",
        ""
    );
    if (!respuesta) return null;

    const grados = parseFloat(respuesta.trim());
    if (!isNaN(grados) && grados >= 0 && grados <= 360) {
        return grados;
    }
    alert("Formato no reconocido. No se usará ninguna dirección de viento.");
    return null;
}

function pedirPuntoInicialManual() {
    const respuesta = window.prompt(
        "Este archivo no incluye posición GPS (solo velocidad y rumbo).\n" +
        "Si conoces el punto de salida, introdúcelo como 'latitud, longitud' (ej: 39.45, -0.30).\n" +
        "Déjalo vacío o cancela si no lo conoces (se reproducirá la forma del recorrido sin anclar al mapa real).",
        ""
    );
    if (!respuesta) return null;

    const partes = respuesta.split(',').map(s => parseFloat(s.trim()));
    if (partes.length === 2 && !isNaN(partes[0]) && !isNaN(partes[1])) {
        return { lat: partes[0], lon: partes[1] };
    }
    alert("Formato no reconocido. Se usará una posición de referencia arbitraria.");
    return null;
}