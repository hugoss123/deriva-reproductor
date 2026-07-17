// BarraHerramientas.js — "La cinta de opciones"
// Único trabajo: alternar la pestaña activa de la barra tipo ribbon y mostrar
// su recuadro correspondiente. De momento los recuadros están vacíos, listos
// para colgar iconos de funciones en el futuro.

/**
 * Conecta las pestañas de la barra de herramientas (Regata, Datos, ...) para
 * que al pulsar una se resalte y se muestre su panel de contenido.
 */
export function inicializarBarraHerramientas() {
    const pestanas = document.querySelectorAll('.ribbon-tab');
    const contenidos = document.querySelectorAll('.ribbon-contenido');

    pestanas.forEach(pestana => {
        pestana.addEventListener('click', () => {
            const objetivo = pestana.dataset.tab;
            pestanas.forEach(p => p.classList.toggle('activo', p === pestana));
            contenidos.forEach(c => c.classList.toggle('activo', c.dataset.panel === objetivo));
        });
    });
}
