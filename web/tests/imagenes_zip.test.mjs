import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { imagenesDeZips } from '../src/subsanaciones/zippdf.js';

const zipCon = async (archivos) => {
    const z = new JSZip();
    Object.entries(archivos).forEach(([n, v]) => z.file(n, v));
    return new File([await z.generateAsync({ type: 'uint8array' })], 'fotos.zip', { type: 'application/zip' });
};

test('imagenesDeZips: solo imágenes, en orden natural, de carpetas internas y de varios zip', async () => {
    const a = await zipCon({ 'C2/foto10.jpg': 'x', 'C2/foto2.JPG': 'y', 'C2/nota.txt': 'n', '__MACOSX/C2/._foto2.jpg': 'm', '.oculta.jpg': 'o', 'p.png': 'p' });
    const b = await zipCon({ 'z.webp': 'w' });
    const fs = await imagenesDeZips([a, b]);
    assert.deepEqual(fs.map(f => f.name), ['foto2.JPG', 'foto10.jpg', 'p.png', 'z.webp']);
    assert.deepEqual(fs.map(f => f.type), ['image/jpeg', 'image/jpeg', 'image/png', 'image/webp']);
    assert.equal(await fs[0].text(), 'y');
});
test('imagenesDeZips: zip sin fotos da lista vacía', async () => {
    assert.deepEqual(await imagenesDeZips([await zipCon({ 'a.txt': '1' })]), []);
});
