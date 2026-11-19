/* global L -- Leaflet: lo carga optimizar.html con <script src="js/leaflet.js"> antes de este módulo */
// Mapas de 🛣️ Programación por cercanía: la ruta de hoy y la de la propuesta de una cuadrilla en una quincena, lado a lado
// (uno encima del otro en el celular), con cada lote numerado en el orden de visita, la línea del recorrido de cada día con
// flechas hacia el siguiente, el polígono del lote y su ficha al tocarlo. Los dos mapas se mueven juntos.
import { esc } from '../subsanaciones/util.js';
import { paradas, anguloPantalla, metros, nombreDia, rotuloLote } from './optimizar.js';

export var COLORES = ['#e11d48', '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#65a30d', '#0d9488', '#b45309'];
var SIN_DIA = '#64748b';
// Los mismos fondos del mapa rápido (mapa_rapido.html)
var FONDOS = {
    calles: ['https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19, attribution: '© OpenStreetMap' }],
    satelite: ['https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { subdomains: '0123', maxZoom: 21, maxNativeZoom: 20, attribution: 'Imágenes © Google' }],
    orto: ['https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCiudad/IMAGEN_WEBM/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 21, attribution: 'Ortofoto © Alcaldía de Medellín' }]
};

export function hayLeaflet() { return typeof L !== 'undefined' && !!L.map; }

// → { pintar(datos, opciones), ajustar(), tamano() }
export function crearMapas(idHoy, idProp) {
    var mapas = [idHoy, idProp].map(function (id) {
        var m = L.map(id, { preferCanvas: false, zoomControl: true, maxZoom: 21 }).setView([6.25, -75.58], 13);
        return { mapa: m, capa: L.layerGroup().addTo(m), fondo: null, nombreFondo: '' };
    });
    var juntos = true, moviendo = false, ultimo = null;
    mapas.forEach(function (a, i) {
        var b = mapas[1 - i];
        a.mapa.on('move', function () {
            if (!juntos || moviendo) return;
            moviendo = true;
            b.mapa.setView(a.mapa.getCenter(), a.mapa.getZoom(), { animate: false });
            moviendo = false;
        });
    });
    function fondo(nombre) {
        mapas.forEach(function (m) {
            if (m.nombreFondo === nombre) return;
            if (m.fondo) m.mapa.removeLayer(m.fondo);
            var f = FONDOS[nombre] || FONDOS.calles;
            m.fondo = L.tileLayer(f[0], f[1]).addTo(m.mapa);
            m.fondo.bringToBack();
            m.nombreFondo = nombre;
        });
    }
    function icono(texto, color, extra) {
        var largo = String(texto).length;
        return L.divIcon({ className: 'oz-pin' + (extra ? ' ' + extra : ''), iconSize: [largo > 2 ? 32 : 26, 26], iconAnchor: [largo > 2 ? 16 : 13, 13], popupAnchor: [0, -12],
            html: '<span style="background:' + color + '">' + esc(texto) + '</span>' });
    }
    function flecha(a, b, color) {
        var c = [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2];
        return L.marker(c, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'oz-flecha', iconSize: [16, 16], iconAnchor: [8, 8],
            html: '<span style="color:' + color + ';transform:rotate(' + anguloPantalla(a, b).toFixed(0) + 'deg)">➤</span>' }) });
    }
    function ficha(p, cual, extra) {
        var x = p.x, d = p.dia;
        var filas = [
            ['Día', d ? 'Semana ' + d.semana + ' · ' + nombreDia(d) : 'Sin semana ni día en el Excel'],
            d ? ['Parada', p.n + ' de ' + p.total + ' del día · ' + p.g + ' de la quincena'] : null,
            ['Microrruta', x.mr], ['Lote', x.lote || '—'], ['Dirección', x.dir || '—'],
            ['Área', Math.round(x.area || 0).toLocaleString('es-CO') + ' m²'], ['Frecuencia', x.frec === 2 ? 'Quincenal' : x.frec === 1 ? 'Mensual' : '—'],
            p.sig != null ? ['Al siguiente', metros(p.sig) + ' (línea recta)'] : d ? ['Al siguiente', 'Es el último lote del día'] : null,
            cual === 'prop' && x.antes ? ['Hoy está', x.antes.dia ? 'Semana ' + x.antes.semana + ' · ' + nombreDia({ dia: x.antes.dia }) : 'sin día en el Excel'] : null,
            extra ? ['', extra] : null
        ].filter(Boolean);
        return '<div class="oz-ficha"><b>' + esc((cual === 'prop' ? 'Propuesta' : 'Hoy') + ' · ' + (x.lote && !/^N\/?A$/i.test(x.lote) ? 'Lote ' + x.lote : x.mr)) + '</b><table>' +
            filas.map(function (f) { return '<tr><td>' + esc(f[0]) + '</td><td>' + esc(f[1]) + '</td></tr>'; }).join('') + '</table>' +
            '<a href="mapa_rapido.html?lote=' + encodeURIComponent(rotuloLote(x)) + '" target="_blank" rel="noopener">Abrir en el mapa ↗</a></div>';
    }
    // datos: { hoy: [días], prop: [días], sinDia: [lotes], colorDe(fecha), fecha ('' = todos), poligonos(x) → [anillos] }
    // opciones: { numeros: 'dia' | 'quincena', flechas, poligonos, fondo, juntos }
    function pintar(datos, op) {
        juntos = op.juntos !== false;
        fondo(op.fondo || 'calles');
        var limites = L.latLngBounds([]);
        [['hoy', datos.hoy], ['prop', datos.prop]].forEach(function (par, i) {
            var cual = par[0], capa = mapas[i].capa;
            capa.clearLayers();
            var todas = paradas(par[1]);
            var ver = todas.filter(function (p) { return !datos.fecha || p.dia.fecha === datos.fecha; });
            // Polígonos debajo, después líneas y flechas, encima los números
            if (op.poligonos) ver.forEach(function (p) {
                var g = datos.poligonos(p.x);
                if (g && g.length) L.polygon(g, { color: datos.colorDe(p.dia.fecha), weight: 1.5, fillOpacity: 0.22, interactive: false }).addTo(capa);
            });
            var porDia = {};
            ver.forEach(function (p) { (porDia[p.dia.fecha] = porDia[p.dia.fecha] || []).push(p); });
            Object.keys(porDia).forEach(function (f) {
                var ps = porDia[f], color = datos.colorDe(f);
                if (ps.length > 1) {
                    L.polyline(ps.map(function (p) { return [p.x.lat, p.x.lon]; }), { color: '#fff', weight: 7, opacity: 0.9, interactive: false }).addTo(capa);
                    L.polyline(ps.map(function (p) { return [p.x.lat, p.x.lon]; }), { color: color, weight: 4, opacity: 0.95, interactive: false }).addTo(capa);
                    if (op.flechas) for (var k = 0; k + 1 < ps.length; k++) if (ps[k].sig > 0.03) flecha(ps[k].x, ps[k + 1].x, color).addTo(capa);
                }
            });
            ver.forEach(function (p) {
                var texto = op.numeros === 'quincena' ? p.g : p.n;
                L.marker([p.x.lat, p.x.lon], { icon: icono(texto, datos.colorDe(p.dia.fecha), p.x.frec === 2 ? 'quin' : ''), title: nombreDia(p.dia) + ' · parada ' + p.n + ' · ' + rotuloLote(p.x), riseOnHover: true })
                    .bindPopup(ficha(p, cual), { maxWidth: 320 }).addTo(capa);
                limites.extend([p.x.lat, p.x.lon]);
            });
            // Hoy: los que el Excel no les da día, en gris con «?» (no tienen recorrido)
            if (cual === 'hoy' && !datos.fecha) (datos.sinDia || []).forEach(function (x) {
                L.marker([x.lat, x.lon], { icon: icono('?', SIN_DIA, 'sin'), title: 'Sin día en el Excel · ' + rotuloLote(x) })
                    .bindPopup(ficha({ x: x, dia: null }, 'hoy', 'El Excel no le pone semana ni día: no entra en el recorrido de hoy.'), { maxWidth: 320 }).addTo(capa);
                limites.extend([x.lat, x.lon]);
            });
        });
        ultimo = limites;
    }
    function ajustar() {
        mapas.forEach(function (m) { m.mapa.invalidateSize(); });
        if (ultimo && ultimo.isValid()) {
            moviendo = true;
            mapas.forEach(function (m) { m.mapa.fitBounds(ultimo, { padding: [24, 24], maxZoom: 18, animate: false }); });
            moviendo = false;
        }
    }
    function tamano() { mapas.forEach(function (m) { m.mapa.invalidateSize(); }); }
    return { pintar: pintar, ajustar: ajustar, tamano: tamano };
}
