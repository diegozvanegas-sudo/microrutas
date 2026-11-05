// Servicios adicionales del contrato de corte de césped: sitios fuera de la programación de microrrutas (no tienen lote ni
// cuadrilla). Lista de la interventoría, noviembre de 2026. Los usa web/tools/generar_servicios_adicionales.mjs para la capa
// "Servicios adicionales" del mapa rápido (public/data/rapido/capa_servicios_adicionales.js).
// - proxima: fecha de la próxima intervención (dd/mm/aaaa) o el texto de la lista ("Noviembre", "Quincena 1").
// - p: [lat, lon] del punto; aprox: cómo se ubicó (con los cruces de calles de OpenStreetMap). Sin p: no se pudo ubicar y
//   no sale en el mapa hasta que se ponga el punto a mano.
// - El repositorio es público: no van nombres de personas ni teléfonos (están en la lista original).
var serviciosAdicionales = [
  { nombre: 'Centro Integrado San Cristóbal', frecuencia: 'Mensual (semana por solicitud de la administración)', direccion: 'Calle 64 N 127-32',
    area: 19260, proxima: '11/11/2026', obs: '', p: null, aprox: 'No está en los cruces de calles guardados (corregimiento San Cristóbal)' },
  { nombre: 'Juan Pablo II', frecuencia: 'Mensual', direccion: 'Carrera 70 con Calle 18', area: 51750, proxima: '11/11/2026',
    obs: 'Cambio de frecuencia por solicitud de la administración del punto. Enviar correo con ARL adjunto del personal con 3 días hábiles de anticipación.',
    p: [6.22232, -75.59214], aprox: 'En el cruce' },
  { nombre: 'Centro Integral de Familia Buenos Aires', frecuencia: 'Mensual', direccion: 'Carrera 6AB N 47A-99', area: 16448, proxima: '13/11/2026', obs: '',
    p: null, aprox: 'La dirección no está en los cruces de calles guardados: revisar la carrera' },
  { nombre: 'Planta de Operaciones Emvarias', frecuencia: 'Mensual', direccion: 'Calle 111B N 64-92', area: 3657, proxima: '12/11/2026',
    obs: 'Desde el área de planeación solicitan que se ejecute cada 2 meses. Próxima intervención en noviembre.',
    p: [6.30262, -75.56087], aprox: 'Cercana: en el cruce de la Calle 111B con la Carrera 64AA, confírmela en el mapa' },
  { nombre: 'Centro de Diagnóstico y Derivación Tejiendo Amor', frecuencia: 'Mensual', direccion: 'Carrera 72B N 78B-54', area: 3906, proxima: '10/11/2026',
    obs: 'Programar el mismo día que La Granja.', p: [6.278530, -75.582030], aprox: 'Aproximada por la placa' },
  { nombre: 'Sede de San Cristóbal "La Granja"', frecuencia: 'Mensual', direccion: 'Vía al Mar Km 7', area: 8101, proxima: '10/11/2026',
    obs: 'Programar el mismo día que Tejiendo Amor.', p: null, aprox: 'Dirección por kilómetro de vía: no se puede ubicar con los cruces de calles' },
  { nombre: 'Colonia de Belencito', frecuencia: 'Mensual', direccion: 'Carrera 92 N 34B-35', area: 46685, proxima: '19/11/2026', obs: '',
    p: [6.245465, -75.617078], aprox: 'Aproximada por la placa' },
  { nombre: 'Centro de Bienestar para la Comunidad Belén (Preventorio)', frecuencia: 'Mensual', direccion: 'Carrera 77 N 25-01', area: 3672, proxima: '19/11/2026', obs: '',
    p: [6.227299, -75.597438], aprox: 'Aproximada por la placa' },
  { nombre: 'Unidad de Discapacidad Ser Capaz', frecuencia: 'Mensual', direccion: 'Carrera 72 N 11-11', area: 620, proxima: '30/11/2026', obs: '',
    p: [6.219198, -75.594903], aprox: 'Aproximada por la placa' },
  { nombre: 'Centro Integral de Familia San Antonio de Prado', frecuencia: 'Mensual', direccion: 'Carrera 63 N 41 Sur-19', area: 3384, proxima: '27/11/2026', obs: '',
    p: [6.18415, -75.64352], aprox: 'Cercana: en el cruce de la Carrera 63 con la Calle 41A Sur, confírmela en el mapa' },
  { nombre: 'Caracol del Tránsito', frecuencia: 'Mensual', direccion: 'Carrera 64A N 77-00', area: 6894, proxima: '24/11/2026', obs: '',
    p: null, aprox: 'Ese cruce no está en las calles guardadas de Medellín (el más parecido queda en Bello)' },
  { nombre: 'Cementerio Universal', frecuencia: 'Mensual', direccion: 'Calle 80 N 65-04', area: 49702, proxima: '24/11/2026', obs: '',
    p: [6.276377, -75.573452], aprox: 'Aproximada por la placa' },
  { nombre: 'Solicitud ID416522', frecuencia: 'Mensual', direccion: 'Carrera 57 N 20A-09', area: 33, proxima: '',
    obs: 'El operativo debe garantizar la recolección inmediata del punto.', p: [6.222778, -75.582157], aprox: 'Aproximada por la placa' },
  { nombre: 'Curva de Rodas', frecuencia: 'Mensual', direccion: 'Autopista Medellín-Bogotá', area: 346000, proxima: 'Noviembre', obs: '',
    p: null, aprox: 'La dirección es solo la vía: no se puede ubicar con los cruces de calles' },
  { nombre: 'Corte de césped PROEXCAR', frecuencia: 'Mensual', direccion: 'Carrera 50G N 10B Sur-14', area: 100, proxima: 'Quincena 1',
    obs: 'Contactar al usuario antes de la intervención para establecer la logística (contacto en la lista original).', p: [6.19789, -75.58594], aprox: 'En el cruce' },
  { nombre: 'Espartillo PROEXCAR', frecuencia: 'Mensual', direccion: 'Carrera 50G N 10B Sur-14', area: 77.85, proxima: 'Quincena 1',
    obs: 'Contactar al usuario antes de la intervención para establecer la logística (contacto en la lista original).', p: [6.19789, -75.58594], aprox: 'En el cruce' },
  { nombre: 'Cascajo PROEXCAR', frecuencia: 'Mensual', direccion: 'Carrera 50G N 10B Sur-14', area: 1557, proxima: 'Quincena 1',
    obs: 'Contactar al usuario antes de la intervención para establecer la logística (contacto en la lista original).', p: [6.19789, -75.58594], aprox: 'En el cruce' },
];
