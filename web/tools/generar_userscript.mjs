// Escribe public/llenar-pqr-emvarias.user.js (script de Tampermonkey para llenar la PQR en EMVARIAS) desde
// src/radicar/marcador.js, para que el marcador y el llenado automático usen el mismo código. Uso: node tools/generar_userscript.mjs
// (tests/radicar.test.mjs avisa si el archivo quedó desactualizado)
import { writeFileSync } from 'node:fs';
import { scriptTampermonkey } from '../src/radicar/marcador.js';

var destino = new URL('../public/llenar-pqr-emvarias.user.js', import.meta.url);
writeFileSync(destino, scriptTampermonkey().split(String.fromCharCode(13)).join(''));
console.log('Escrito ' + destino.pathname);
