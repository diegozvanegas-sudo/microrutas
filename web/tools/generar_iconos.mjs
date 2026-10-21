// Genera public/icons/icono-192.png e icono-512.png (PNG sin dependencias): fondo verde y un tablero blanco.
// El dibujo queda dentro del 60 % central para que sirva también como ícono "maskable".
// Reemplácelos por el logo definitivo cuando lo tenga (mismos nombres y tamaños).
import fs from 'node:fs';
import zlib from 'node:zlib';

const VERDE = [0x16, 0x7a, 0x55], BLANCO = [0xff, 0xff, 0xff], CLARO = [0xe3, 0xf4, 0xec];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function bloque(tipo, datos) {
  const t = Buffer.from(tipo), largo = Buffer.alloc(4), crc = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  crc.writeUInt32BE(crc32(Buffer.concat([t, datos])));
  return Buffer.concat([largo, t, datos, crc]);
}

function icono(n) {
  const u = n / 100; // el dibujo se define en una cuadrícula de 100 x 100
  const dentro = (x, y, x0, y0, x1, y1, r = 0) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const color = (px, py) => {
    const x = px / u, y = py / u;
    if (dentro(x, y, 40, 21, 60, 31, 3)) return CLARO;               // gancho del tablero
    if (dentro(x, y, 28, 25, 72, 79, 6)) {
      for (const ly of [42, 54, 66]) {                                // tres renglones con su casilla
        if (dentro(x, y, 35, ly - 3, 41, ly + 3, 1.5)) return VERDE;
        if (dentro(x, y, 46, ly - 2, 65, ly + 2, 2)) return VERDE;
      }
      return BLANCO;
    }
    return VERDE;
  };
  const filas = [];
  for (let y = 0; y < n; y++) {
    const fila = Buffer.alloc(1 + n * 3);
    for (let x = 0; x < n; x++) fila.set(color(x, y), 1 + x * 3);
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr), bloque('IDAT', zlib.deflateSync(Buffer.concat(filas))), bloque('IEND', Buffer.alloc(0)),
  ]);
}

const carpeta = new URL('../public/icons/', import.meta.url);
fs.mkdirSync(carpeta, { recursive: true });
for (const n of [192, 512]) fs.writeFileSync(new URL(`icono-${n}.png`, carpeta), icono(n));
console.log('Íconos en public/icons/');
