// main.js — "El director de orquesta"
// Es el único archivo que conoce a todos los demás. No pela patatas, no
// cocina salsas, no emplata: coordina a quien sí sabe hacer cada cosa.

import { detectarFormato, parseFormatoGPS, parseFormatoSparse } from './servicios/lectorCSV.js';
import { construirDesdeGPS, construirDesdeSparse, calcularManiobras, promedioAngular } from './servicios/calculadoraNavegacion.js';
import {
    crearMapa, crearGestorEstela, encuadrarMapa,
    crearMarcadorBarco, moverMarcador, eliminarMarcador,
    crearControladorOrientacion, inicializarBotonOrientacion
} from './mapas/configMapa.js';
import { actualizarTelemetria, actualizarEstado, actualizarManiobras } from './componentes/PanelTelemetria.js';
import { inicializarControlesReproductor, crearMotorReproduccion } from './componentes/ControlesReproductor.js';

const { mapa, capaEstela } = crearMapa('mapa');
const gestorEstela = crearGestorEstela(capaEstela);
const controladorOrientacion = crearControladorOrientacion(mapa);
const botonOrientacion = inicializarBotonOrientacion('btn-orientacion', controladorOrientacion);
let marcadorBarco = null;
let motor = null;
let mostrarRecorridoCompleto = false; // por defecto: solo se ve lo ya navegado

const controles = inicializarControlesReproductor({
    onPlay: () => { motor?.play(); controles.marcarReproduciendo(); },
    onPause: () => { motor?.pause(); controles.marcarPausado(); },
    onReset: () => { motor?.reset(); },
    onSeek: indice => { motor?.irAIndice(indice); controles.marcarPausado(); },
    onToggleRecorridoCompleto: () => {
        mostrarRecorridoCompleto = !mostrarRecorridoCompleto;
        controles.marcarRecorridoCompleto(mostrarRecorridoCompleto);

        if (mostrarRecorridoCompleto) {
            gestorEstela.dibujarCompleto();
        } else {
            // Al desactivarlo, oculta de nuevo lo que el barco aún no ha navegado
            gestorEstela.ocultarDesde(motor ? motor.obtenerIndiceActual() : 0);
        }
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
        // Archivo con posición GPS real: sin estima, sin factor inventado
        const crudos = parseFormatoGPS(lineas);
        if (crudos.length === 0) {
            alert("Error: no se pudieron leer coordenadas GPS válidas en el archivo.");
            return;
        }
        const direccionViento = pedirDireccionVientoManual();
        resultado = construirDesdeGPS(crudos, direccionViento);
    } else {
        // Archivo sin posición: velocidad y rumbo solamente → estima náutica
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

    // Viradas y trasluchadas, a partir del TWA de cada punto (si hay datos de viento)
    const maniobras = calcularManiobras(resultado.puntos);
    actualizarManiobras(maniobras);

    // Dirección de viento de referencia para el botón de orientación (media circular)
    const direccionVientoRuta = promedioAngular(resultado.puntos.map(p => p.twd));
    controladorOrientacion.reiniciar(); // cada archivo nuevo empieza con el Norte arriba
    if (direccionVientoRuta !== null) {
        controladorOrientacion.establecerDireccionViento(direccionVientoRuta);
    }
    botonOrientacion.actualizarAspecto();

    gestorEstela.inicializar(resultado.puntos, resultado.maxSOG);
    encuadrarMapa(mapa, resultado.coordenadasMapa);
    marcadorBarco = crearMarcadorBarco(mapa, resultado.puntos[0].lat, resultado.puntos[0].lon);

    // Cada archivo nuevo empieza en modo progresivo (solo se ve lo navegado)
    mostrarRecorridoCompleto = false;
    controles.marcarRecorridoCompleto(false);
    controles.configurarRango(resultado.puntos.length);

    const duracionTotalFormateada = resultado.puntos[resultado.puntos.length - 1].tiempoFormateado;

    motor = crearMotorReproduccion({
        puntos: resultado.puntos,
        onFrame: (punto, indice) => {
            moverMarcador(marcadorBarco, punto.lat, punto.lon);
            actualizarTelemetria(punto);
            controles.actualizarProgreso(indice, punto.tiempoFormateado, duracionTotalFormateada);
            if (!mostrarRecorridoCompleto) {
                // Se llama a ambas para que funcione igual al reproducir hacia
                // delante que al saltar hacia atrás con la barra de progreso.
                gestorEstela.ocultarDesde(indice);
                gestorEstela.dibujarHasta(indice);
            }
        },
        onFin: () => actualizarEstado("● Fin de la reproducción", "#94a3b8")
    });

    motor.reset(); // pinta el primer punto y deja todo listo para arrancar
    controles.habilitar();

    const mensajesEstado = {
        'gps': "● Listo para reproducir — posición GPS real",
        'estimada-anclada': "● Listo para reproducir — estima anclada al punto de salida indicado",
        'estimada-relativa': "● Listo para reproducir — estima relativa (posición sin georreferenciar)"
    };
    actualizarEstado(mensajesEstado[resultado.tipoPosicion], "#34d399");
}

// Pregunta (opcional) la dirección aproximada del viento cuando el archivo no la trae.
// Necesaria para contar viradas/trasluchadas y para orientar el mapa al viento.
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

// Pregunta (opcional) el punto de salida real cuando el archivo no trae posición.
// Vive en main.js porque es interacción con el usuario, no cálculo ni lectura de datos.
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
