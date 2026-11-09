# Auditoría de fotos de zonas verdes

`auditoria_zonasverdes.py` lee el ZIP de fotos de una cuadrilla con Claude, aplica las reglas de la
interventoría y genera el Excel consolidado por microrruta. Antes de analizar cada foto la endereza
si viene girada o al revés.

Los datos NO están en este repositorio. El script los busca en la carpeta de la variable `ZV_PROYECTO` o,
si no está, en `Revisar IA reporte\Zonas verdes` (en OneDrive o en Documents):

- `entradas\fotos\` ZIPs y sus cachés (no borrar las cachés: las fotos se vuelven a pagar).
- `entradas\informes\` informe de lotes ejecutados de la quincena (`--informe`).
- `salidas\motor\` aquí quedan los Excel.

## Instalar

```powershell
python -m pip install -r zonas_verdes\requirements.txt
```

Para leer con el plan de Claude: tener Claude Code instalado y con sesión iniciada.
Para enderezar fotos sin dato de orientación: Tesseract
(`winget install --id UB-Mannheim.TesseractOCR --exact`). Sin él, el script sigue y avisa.

## Correr

Siempre desde la carpeta `Zonas verdes` de los datos. Primero una prueba con pocas fotos:

```powershell
python <ruta a microrutas>\zonas_verdes\auditoria_zonasverdes.py "entradas\fotos\C2.zip" --claude-auth plan --modelo claude-haiku-5-5 --prueba 20
```

Completo, con el informe de la quincena:

```powershell
python <ruta a microrutas>\zonas_verdes\auditoria_zonasverdes.py "entradas\fotos\C2.zip" --claude-auth plan --modelo claude-haiku-5-5 --paralelo 6 --informe "entradas\informes\LOTES_EJECUTADOS_CW394406_Q1_OCT_2026.xlsx"
```

Otras opciones: `--avance` (Excel parcial desde la caché, sin gastar), `--metro claude-sonnet-5-5`
(segunda lectura solo del metro), `--sin-enderezar`. Lista completa: `--help`.
Nunca uses `--reiniciar` sin estar seguro: borra lo leído y vuelve a cobrar todas las fotos.
