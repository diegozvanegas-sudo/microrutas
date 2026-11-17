// Arreglos del libro de horas extras antes de escribirle encima (sin nada de la página, para probarlo con npm test).

// Excel guarda las fórmulas iguales de una columna como «compartidas»: la escribe una vez (la maestra, p. ej. K8) y
// las de abajo la copian (K9, K10…). Si se escribe la H. REAL o el TOTAL encima de la maestra, las copias se quedan
// sin origen y ExcelJS no deja guardar («Shared Formula master must exist above and or left of clone»).
// Se cambian todas por su fórmula propia (la de cada fila, ya corrida) antes de tocar nada. Devuelve cuántas cambió.
export function sinFormulasCompartidas(ws) {
    var cambios = [];
    ws.eachRow({ includeEmpty: false }, function (fila) {
        fila.eachCell({ includeEmpty: false }, function (c) {
            var v = c.value;
            if (!v || typeof v !== 'object') return;
            if (v.sharedFormula || v.shareType === 'shared') {
                // Se calculan todas antes de cambiar alguna: la copia necesita la maestra intacta para correr su fórmula
                var f = c.formula;
                // Si la maestra no está en el archivo, queda el valor que Excel ya había calculado
                cambios.push([c, f ? { formula: f, result: v.result } : v.result == null ? null : v.result]);
            }
        });
    });
    cambios.forEach(function (x) { x[0].value = x[1]; });
    return cambios.length;
}
