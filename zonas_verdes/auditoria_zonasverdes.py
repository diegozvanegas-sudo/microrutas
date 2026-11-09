"""
Auditoría de evidencias fotográficas de zonas verdes a un Excel consolidado.

Lee un ZIP o carpeta de fotos y verifica los datos visibles, las subcarpetas ANTES/DESPUÉS y las
mediciones de césped con metro. Los metadatos EXIF no cuentan como confirmación de datos visibles.

Resultado: un único Excel consolidado con una fila por carpeta. Las coordenadas EXIF no se
consideran evidencia visible; se comprueban fecha/hora, coordenadas sobreimpresas y mediciones
de césped con metro en las fotos ANTES y DESPUÉS.
La hoja REVISION MANUAL incluye campos para confirmar visualmente los datos dudosos y las
mediciones; después de revisarlos, actualiza manualmente el reporte principal si corresponde.

Dependencias:
    python -m pip install pillow openpyxl
    Para --claude-auth api: python -m pip install anthropic
    Para --claude-auth plan, instala Claude Code e inicia sesión con tu plan.
    En modo API, si ANTHROPIC_API_KEY no está configurada, el programa la solicita
    manualmente y no la muestra en pantalla.

Uso:
    python auditoria_zonasverdes.py "C:\\ruta\\fotos.zip" --claude-auth plan --prueba 20
    python auditoria_zonasverdes.py "C:\\ruta\\fotos.zip" --claude-auth api --modelo claude-sonnet-4-5
    python auditoria_zonasverdes.py "C:\\ruta\\fotos.zip" --claude-auth plan
    python auditoria_zonasverdes.py "C:\\ruta\\fotos.zip" --claude-auth api --batch   (50 % más barato)

Las fotos se envían a Anthropic para su análisis. Si el proceso se interrumpe, vuelve a ejecutar
el mismo comando: los lotes ya completados se reutilizan desde la caché local.
"""
import argparse
import base64
import csv
import getpass
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, time as hora_sola

from openpyxl import Workbook, load_workbook
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

# Para usar la API, pega tu clave entre las comillas. No compartas este archivo con la clave.
ANTHROPIC_API_KEY = ""

EXTENSIONES = (".jpg", ".jpeg", ".png", ".webp")
# Los Excel del script van a <proyecto>/salidas/motor; la caché queda junto al ZIP (entradas/fotos).
# El script vive en Aplicaciones/modulos/microrutas/zonas_verdes y los datos en "Revisar IA reporte/Zonas verdes".
# Se usa la carpeta de la variable ZV_PROYECTO; si no está, la primera de estas que exista.
_CANDIDATAS_PROYECTO = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "Zonas verdes"),
    os.path.join(os.path.expanduser("~"), "OneDrive", "Documentos", "Envarias", "Revisar IA reporte", "Zonas verdes"),
    os.path.join(os.path.expanduser("~"), "Documents", "Envarias", "Revisar IA reporte", "Zonas verdes"),
)
CARPETA_PROYECTO = os.environ.get("ZV_PROYECTO") or next(
    (c for c in _CANDIDATAS_PROYECTO if os.path.isdir(c)), _CANDIDATAS_PROYECTO[0])
CARPETA_SALIDAS = os.path.normpath(os.path.join(CARPETA_PROYECTO, "salidas", "motor"))
LADO_MAX = 1280
# Valle de Aburrá aprox. (para validar coordenadas)
CAJA_LAT, CAJA_LON = (5.95, 6.55), (-75.80, -75.25)

# --------------------------------------------------------------------------------------
# Instrucciones para Claude
# --------------------------------------------------------------------------------------
SISTEMA = """Actúa como auditor de evidencias fotográficas de mantenimiento de ZONAS VERDES para la Secretaría de Medio Ambiente de Medellín. Extrae de cada foto de campo SOLO los campos pedidos, de forma EXACTA. No inventes ni deduzcas: si un dato no se ve o no es legible, déjalo "" o null. No uses nombres de archivo, carpetas ni metadatos EXIF, ni datos de otra foto.

Junto a cada foto puede venir un recorte ampliado de su MARCA DE AGUA (timemark/GPS): léelo letra por letra.

CAMPOS:
- fecha / hora: solo si son visibles en la foto o su marca. Fecha DD/MM/YYYY, hora HH:MM:SS (24 h).
- direccion: la línea de nomenclatura (Calle/Carrera/Diagonal/Transversal/Circular/Avenida...) tal cual aparece.
- coordenadas_visibles: true solo si latitud y longitud están impresas y legibles en la imagen (mapas o EXIF no cuentan). Si lo están, cópialas en coordenadas_marca {"lat", "lon"} con signo (S y W negativos); si no, null.
- texto_marca: transcripción COMPLETA del texto de la marca de agua, líneas separadas por " | ".
- estado: "antes", "durante", "después" o "" según lo que muestre la foto.
- legible: false si la foto está borrosa o la marca no se puede leer.
- cuadrilla, area_m2, sig_intervent: valor de cuadrilla, área en m2 y firma/iniciales/registro de interventoría, solo si están escritos y legibles; si no, "".
- foto_metro_visible: true si se distingue físicamente una regla/metro junto al césped, aunque no se pueda leer.
- medicion_cesped_cm: altura del césped en cm leída donde la punta del césped cruza la escala del metro, con el cero identificable. Excepción: si el metro está vertical y apoyado en el suelo y el césped tapa su parte baja (incluido el cero), la escala es continua: reporta el número MÁS BAJO que se lea por encima de las puntas del césped (es la altura mínima comprobable; ej. si el césped tapa hasta donde empieza a verse el 25, reporta 25). null si la lectura o la colocación no son claramente comprobables. No la estimes por apariencia.
- novedades: categorías que se vean CLARAMENTE en la foto o estén escritas en ella; [] si ninguna. No las supongas.
    cerramiento: zona enrejada, cerrada o con el acceso bloqueado.
    orden_publico: letrero o texto que indique restricción por seguridad u orden público.
    sin_cobertura_vegetal: el área no tiene césped que cortar (concreto, tierra, adoquín).
    otra_entidad: evidencia de que otra entidad hizo el corte (letrero, vehículo o personal identificado). La cuadrilla auditada es de EMVARIAS (Empresas Varias de Medellín, grupo EPM): personal con overol naranja y la malla/pantalla negra de protección con el logo de Emvarias, el número de contrato ("Contrato CW ...", "servicio público de aseo", "corte de césped") y la línea 444 56 36 son su equipo propio. Eso NO es otra entidad ni ninguna novedad.
    sst: riesgo de seguridad laboral, como trabajo en alturas o talud sin punto de anclaje.
    abejas: panal, nido o enjambre de abejas o avispas (incluidas avispas africanas) visible, o escrito en la foto (ej. nota del timemark "avispas", "abejas", "panal"). Un pasto sin cortar sin nido ni texto visible NO es esta novedad.
    otra: otra situación que impide o limita el trabajo.
- detalle_novedad: si hay novedades, una frase con lo que se ve; si no, "".

Responde con un objeto {"fotos": [...]} con UNA entrada por cada FOTO #n recibida, usando su número en "num"."""

_CAMPOS_TEXTO = ("fecha", "hora", "direccion", "texto_marca", "estado", "cuadrilla", "area_m2",
                 "sig_intervent", "detalle_novedad")
# Novedades que Claude puede ver en una foto -> texto para la columna NOVEDAD del reporte.
# Altura mínima de corte y adelanto de ejecución se calculan en consolidar_carpetas.
NOVEDADES_VISIBLES = {
    "cerramiento": "Cerramiento",
    "orden_publico": "Orden público",
    "sin_cobertura_vegetal": "Falta de cobertura vegetal",
    "otra_entidad": "Corte realizado por otra entidad",
    "sst": "SST",
    "abejas": "Presencia de abejas",
    "otra": "Otra novedad",
}


SUBCARPETAS = ("ANTES", "DURANTE", "DESPUES")
MOMENTOS = {"ANTES": "antes", "DURANTE": "durante", "DESPUES": "después"}
# Textos OFICIALES de la interventoría (novedades_oficiales.xlsx): la columna NOVEDAD solo usa estos.
OFICIAL_SIN_REGISTRO = "Microrruta sin registro fotográfico del {}."
OFICIAL_SIN_TRES_MOMENTOS = "Microrruta sin registro fotográfico de los tres momentos."
OFICIAL_SIN_COORDENADAS = "Microrruta con registro fotográfico del {} sin coordenadas."
OFICIAL_DESENFOCADO = "Microrruta con registro fotográfico del {} movido o desenfocado."  # durante/después
OFICIAL_ALTURA = "Microrruta no cumple con la altura minima de corte"
OFICIAL_FECHA_PERIODO = "Fecha del registro fotográfico no corresponde al periodo de ejecución."
OFICIAL_ADELANTO = "Sin novedad. Microrruta ejecutada y aprobada para adelanto de ejecucion."
OFICIAL_SIN_AC = "Microrruta sin registro fotográfico de actividades complementarias."
OFICIAL_FECHA_DURANTE_INFORME = ("Fecha del registro fotográfico del durante no corresponde con fecha de "
                                 "ejecución en el informe.")
OFICIAL_NO_EN_INFORME = "Microrruta no se encuentra en informe de lotes ejecutados."
OFICIAL_ORDEN_PUBLICO_SIN_REGISTRO = "Sin novedad, microrruta sin registro fotografico por orden publico."
OFICIAL_CLIMA_Q1 = "Microrruta no ejecutada durante la Q1 debido a condiciones climáticas desfavorables"
CONTRATO = "CW394406"
# Novedades visibles con texto oficial. Las demás de NOVEDADES_VISIBLES (abejas, SST, otra entidad,
# otra) no están en la lista oficial: van a OBSERVACIONES como pendientes y no cambian el AC.
NOVEDADES_OFICIALES = {
    "cerramiento": "Microrruta no ejecutada por cerramiento.",
    "orden_publico": "Microrruta no ejecutada por orden publico",
    "sin_cobertura_vegetal": "Microrruta no ejecutada por falta de cobertura vegetal.",
}


def novedades_foto(fila):
    """Novedades de la foto, descartando 'otra_entidad' cuando Claude describe la malla
    o el personal de Emvarias, que es la cuadrilla auditada y no otra entidad."""
    novedades = [n for n in (fila.get("novedades") or []) if n in NOVEDADES_VISIBLES]
    if "otra_entidad" in novedades and re.search(
            r"emvarias|empresas varias", str(fila.get("detalle_novedad", "")), re.I):
        novedades.remove("otra_entidad")
    return novedades
ESQUEMA = {
    "type": "object", "required": ["fotos"], "additionalProperties": False,
    "properties": {"fotos": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["num", *_CAMPOS_TEXTO, "coordenadas_marca", "coordenadas_visibles", "legible",
                     "foto_metro_visible", "medicion_cesped_cm", "novedades"],
        "properties": {
            "num": {"type": "integer"},
            **{campo: {"type": "string"} for campo in _CAMPOS_TEXTO},
            "coordenadas_marca": {"anyOf": [{"type": "null"}, {
                "type": "object", "required": ["lat", "lon"], "additionalProperties": False,
                "properties": {"lat": {"type": "number"}, "lon": {"type": "number"}}}]},
            "coordenadas_visibles": {"type": "boolean"},
            "legible": {"type": "boolean"},
            "foto_metro_visible": {"type": "boolean"},
            "medicion_cesped_cm": {"anyOf": [{"type": "null"}, {"type": "number"}]},
            "novedades": {"type": "array",
                          "items": {"type": "string", "enum": list(NOVEDADES_VISIBLES)}},
        }}}},
}


# --------------------------------------------------------------------------------------
# Fotos: listado, preparación, EXIF
# --------------------------------------------------------------------------------------
def _orden_natural(texto):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", texto)]


_PATRON_CARPETA = re.compile(r"^([^_-]+)[_-](.+)[_-](Q\d+)$", re.IGNORECASE)


def _estado_en_ruta(partes):
    for parte in reversed(partes):
        normal = unicodedata.normalize("NFKD", parte).encode("ascii", "ignore").decode().upper()
        normal = re.sub(r"[^A-Z]", "", normal)
        if normal in ("ANTES", "PREVIO", "PREVIA"):
            return "ANTES"
        if normal in ("DESPUES", "POSTERIOR", "POST"):
            return "DESPUES"
        if normal == "DURANTE":
            return "DURANTE"
        if normal == "AC":  # actividades complementarias
            return "AC"
        if "POSOPERACI" in normal:  # NOVEDAD_POSOPERACION y variantes
            return "POSOPERACION"
    return ""


def _grupo_de_ruta(ruta, origen):
    partes = [p for p in ruta.replace("\\", "/").split("/") if p]
    directorios = partes[:-1]
    codigo = next((i for i in range(len(directorios) - 1, -1, -1)
                   if _PATRON_CARPETA.fullmatch(directorios[i])), None)
    if codigo is not None:
        return "/".join(directorios[:codigo + 1]), directorios[codigo], _estado_en_ruta(directorios[codigo + 1:])

    antes_de_despues = next((i for i in range(len(directorios) - 1, -1, -1)
                             if _estado_en_ruta([directorios[i]])), None)
    if antes_de_despues is not None:
        grupo = "/".join(directorios[:antes_de_despues])
        nombre = directorios[antes_de_despues - 1] if antes_de_despues else os.path.basename(origen)
        return grupo, nombre or os.path.basename(origen), _estado_en_ruta(directorios[antes_de_despues:])
    grupo = "/".join(directorios)
    return grupo, directorios[-1] if directorios else os.path.basename(origen), ""


def carpetas_de_entrada(origen):
    """Devuelve carpetas de lote, incluso las vacías, agrupadas por código de microruta."""
    resultado = {}
    raiz_es_codigo = os.path.isdir(origen) and _PATRON_CARPETA.fullmatch(os.path.basename(os.path.normpath(origen)))

    def agregar(rel):
        partes = [p for p in rel.replace("\\", "/").split("/") if p]
        for i, parte in enumerate(partes):
            if _PATRON_CARPETA.fullmatch(parte):
                clave = "/".join(partes[:i + 1])
                grupo = resultado.setdefault(
                    clave, {"nombre": parte, "ruta": clave, "antes": False, "durante": False, "despues": False})
                estado = _estado_en_ruta(partes[i + 1:])
                if estado:
                    grupo[estado.lower()] = True
        if raiz_es_codigo and not partes:
            resultado.setdefault("", {"nombre": os.path.basename(os.path.normpath(origen)), "ruta": "",
                                      "antes": False, "durante": False, "despues": False})
        if raiz_es_codigo and partes:
            grupo = resultado.setdefault(
                "", {"nombre": os.path.basename(os.path.normpath(origen)), "ruta": "",
                     "antes": False, "durante": False, "despues": False})
            estado = _estado_en_ruta(partes)
            if estado:
                grupo[estado.lower()] = True

    if zipfile.is_zipfile(origen):
        with zipfile.ZipFile(origen) as z:
            for info in z.infolist():
                agregar(info.filename.rstrip("/") if info.is_dir() else os.path.dirname(info.filename))
    elif os.path.isdir(origen):
        for raiz, _, _ in os.walk(origen):
            rel = os.path.relpath(raiz, origen)
            agregar("" if rel == "." else rel)
        if raiz_es_codigo:
            resultado.setdefault("", {"nombre": os.path.basename(os.path.normpath(origen)), "ruta": "",
                                      "antes": False, "durante": False, "despues": False})
    return resultado


def listar_fotos(origen):
    """[(ruta_en_zip, carpeta, abrir)] ordenado. Acepta .zip (o carpeta)."""
    fotos = []
    if zipfile.is_zipfile(origen):
        for info in _zip_abierto(origen).infolist():
            if not info.flag_bits & 0x800:
                try:
                    info.filename = info.filename.encode("cp437").decode("utf-8")
                except (UnicodeEncodeError, UnicodeDecodeError):
                    pass
            base = os.path.basename(info.filename)
            if (info.is_dir() or base.startswith((".", "._")) or "__MACOSX" in info.filename
                    or not base.lower().endswith(EXTENSIONES)):
                continue
            grupo, _, _ = _grupo_de_ruta(info.filename, origen)
            fotos.append((info.filename, grupo,
                          lambda i=info, p=origen: _leer_archivo_zip(p, i)))
    elif os.path.isdir(origen):
        for raiz, _, archivos in os.walk(origen):
            for f in archivos:
                if f.lower().endswith(EXTENSIONES):
                    ruta = os.path.join(raiz, f)
                    rel = os.path.relpath(ruta, origen).replace("\\", "/")
                    grupo, _, _ = _grupo_de_ruta(rel, origen)
                    fotos.append((rel, grupo, lambda r=ruta: r))
    else:
        sys.exit(f"No es un .zip válido: {origen}")
    return sorted(fotos, key=lambda x: _orden_natural(x[0]))


def _bytes(abrir):
    obj = abrir()
    if hasattr(obj, "read"):
        return obj.read()
    with open(obj, "rb") as fh:
        return fh.read()


_ZIPS_ABIERTOS = {}


def _zip_abierto(origen):
    """Abre cada ZIP una sola vez: reabrirlo por foto vuelve a leer su índice completo."""
    if origen not in _ZIPS_ABIERTOS:
        _ZIPS_ABIERTOS[origen] = zipfile.ZipFile(origen)
    return _ZIPS_ABIERTOS[origen]


def _leer_archivo_zip(origen, info):
    return io.BytesIO(_zip_abierto(origen).read(info))


def leer_local(datos):
    """Comprueba localmente que el archivo sea una imagen legible y obtiene su resolución."""
    r = {"resolucion": "", "error": None}
    try:
        im = Image.open(io.BytesIO(datos))
        im.load()
    except Exception as e:  # noqa: BLE001
        r["error"] = ("archivo dañado o no es una imagen válida" if "cannot identify" in str(e)
                      else f"{type(e).__name__}: {e}")
        return r
    r["resolucion"] = f"{im.width}x{im.height}"
    return r


_MESES = {
    "ene": 1, "enero": 1, "jan": 1, "january": 1,
    "feb": 2, "febrero": 2, "february": 2,
    "mar": 3, "marzo": 3, "march": 3,
    "abr": 4, "abril": 4, "apr": 4, "april": 4,
    "may": 5, "mayo": 5,
    "jun": 6, "junio": 6, "june": 6,
    "jul": 7, "julio": 7, "july": 7,
    "ago": 8, "agosto": 8, "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "set": 9, "septiembre": 9, "setiembre": 9, "september": 9,
    "oct": 10, "octubre": 10, "october": 10,
    "nov": 11, "noviembre": 11, "november": 11,
    "dic": 12, "diciembre": 12, "dec": 12, "december": 12,
}


def configurar_paddleocr():
    try:
        from paddleocr import PaddleOCR
    except ImportError as exc:
        raise RuntimeError(
            "PaddleOCR no está instalado en este entorno. Usa un entorno separado con "
            "Python 3.8–3.13, instala PaddleOCR 3.x y PaddlePaddle CPU; revisa la guía "
            "oficial de instalación: https://www.paddleocr.ai/latest/en/quick_start.html"
        ) from exc
    try:
        return PaddleOCR(
            lang="en",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device="cpu",
        )
    except (ImportError, RuntimeError, ValueError) as exc:
        raise RuntimeError(
            "No se pudo iniciar PaddleOCR. Confirma que PaddlePaddle CPU esté instalado "
            f"en el mismo Python. Detalle: {exc}"
        ) from exc


def _resultados_paddle(ocr, imagen):
    import numpy as np

    predicciones = ocr.predict(np.asarray(imagen))
    textos, confianzas = [], []
    for prediccion in predicciones:
        datos = getattr(prediccion, "json", prediccion)
        if callable(datos):
            datos = datos()
        if isinstance(datos, str):
            datos = json.loads(datos)
        if not isinstance(datos, dict):
            continue
        datos = datos.get("res", datos)
        if not isinstance(datos, dict):
            continue
        valores_texto = datos.get("rec_texts", [])
        valores_confianza = datos.get("rec_scores", [])
        for texto, confianza in zip(valores_texto, valores_confianza):
            texto = str(texto).strip()
            try:
                confianza = float(confianza)
            except (TypeError, ValueError):
                continue
            if texto and confianza >= 0:
                textos.append(texto)
                confianzas.append(confianza * 100)
    confianza_media = sum(confianzas) / len(confianzas) if confianzas else 0
    return " ".join(textos), confianza_media


def analizar_foto_paddleocr(datos_imagen, motor):
    imagen = abrir_derecha(datos_imagen)
    ancho, alto = imagen.size
    marca = imagen.crop((int(ancho * 0.45), int(alto * 0.60), ancho, alto))
    texto_marca, confianza = _resultados_paddle(motor, marca)
    fecha, hora = _extraer_fecha_hora_ocr(texto_marca)
    coordenadas_visibles = _extraer_coordenadas_ocr(texto_marca)
    texto_marca_normalizado = unicodedata.normalize("NFKD", texto_marca)
    texto_marca_normalizado = texto_marca_normalizado.encode("ascii", "ignore").decode()
    coincidencia = re.search(
        r"\b(?:cuadrilla|cuadr\.)\s*(?:n[.º°o]?\s*)?[:#-]?\s*([A-Z0-9-]{1,16})\b",
        texto_marca_normalizado, re.IGNORECASE)
    cuadrilla = coincidencia.group(1) if coincidencia else ""
    coincidencia = re.search(
        r"\b(?:area|área)\s*[:=]?\s*([\d.,]+)\s*m(?:2|²)\b",
        texto_marca, re.IGNORECASE)
    area_m2 = coincidencia.group(1) if coincidencia else ""
    coincidencia = re.search(
        r"\b(?:sig(?:natura)?\.?\s*intervent(?:or(?:a|ía)?)?|interventor(?:a|ía))"
        r"\s*[:=-]\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{1,40})",
        texto_marca, re.IGNORECASE)
    sig_intervent = coincidencia.group(1).strip() if coincidencia else ""
    return {
        "texto_ocr": texto_marca,
        "confianza_ocr": round(confianza, 1),
        "fecha": fecha,
        "hora": hora,
        "coordenadas_visibles": coordenadas_visibles,
        "cuadrilla": cuadrilla,
        "area_m2": area_m2,
        "sig_intervent": sig_intervent,
        "foto_metro_visible": None,
        "medicion_cesped_cm": None,
        "legible": bool(texto_marca) and confianza >= 20,
    }


def configurar_ocr(ruta_tesseract=None, idioma="eng"):
    import pytesseract

    ruta = _ruta_tesseract(ruta_tesseract)
    if not ruta:
        raise RuntimeError(
            "No se encontró el motor Tesseract. Instálalo con "
            "'winget install --id UB-Mannheim.TesseractOCR --exact' o indica --tesseract RUTA."
        )
    pytesseract.pytesseract.tesseract_cmd = ruta
    try:
        idiomas = pytesseract.get_languages(config="")
    except pytesseract.TesseractNotFoundError as exc:
        raise RuntimeError(f"No se pudo iniciar Tesseract desde {ruta}: {exc}") from exc
    faltantes = set(idioma.split("+")) - set(idiomas)
    if faltantes:
        raise RuntimeError(
            f"Tesseract no tiene los paquetes de idioma {', '.join(sorted(faltantes))}. "
            f"Idiomas disponibles: {', '.join(idiomas)}."
        )
    return ruta


def _ocr_con_confianza(imagen, idioma, psm, config_extra=""):
    import pytesseract
    from pytesseract import Output

    datos = pytesseract.image_to_data(
        imagen, lang=idioma, config=f"--oem 3 --psm {psm} {config_extra}".strip(),
        output_type=Output.DICT)
    tokens, confianzas = [], []
    for texto, conf in zip(datos["text"], datos["conf"]):
        texto = texto.strip()
        try:
            confianza = float(conf)
        except (TypeError, ValueError):
            confianza = -1
        if texto and confianza >= 0:
            tokens.append(texto)
            confianzas.append(confianza)
    confianza_media = sum(confianzas) / len(confianzas) if confianzas else 0
    return " ".join(tokens), confianza_media


def _texto_y_confianza_ocr(datos_imagen, idioma):
    imagen = abrir_derecha(datos_imagen)
    ancho, alto = imagen.size
    marca = imagen.crop((int(ancho * 0.50), int(alto * 0.64), ancho, alto)).convert("L")
    marca = marca.resize((marca.width * 3, marca.height * 3), Image.Resampling.LANCZOS)
    marca = ImageEnhance.Contrast(marca).enhance(2.0).filter(ImageFilter.SHARPEN)
    texto_marca, confianza_marca = _ocr_con_confianza(marca, idioma, 6)

    fecha_region = imagen.crop(
        (int(ancho * 0.52), int(alto * 0.67), ancho, int(alto * 0.77))).convert("L")
    fecha_region = fecha_region.resize(
        (fecha_region.width * 4, fecha_region.height * 4), Image.Resampling.LANCZOS)
    texto_fecha, confianza_fecha = _ocr_con_confianza(fecha_region, idioma, 8)

    coordenadas_region = imagen.crop(
        (int(ancho * 0.60), int(alto * 0.74), ancho, int(alto * 0.80))).convert("L")
    coordenadas_region = coordenadas_region.resize(
        (coordenadas_region.width * 4, coordenadas_region.height * 4), Image.Resampling.LANCZOS)
    texto_coordenadas, confianza_coordenadas = _ocr_con_confianza(
        coordenadas_region, idioma, 7, "-c tessedit_char_whitelist=0123456789.NSEW,")

    completa = ImageOps.grayscale(imagen)
    completa.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
    texto_completo, confianza_completa = _ocr_con_confianza(completa, idioma, 11)
    textos = [texto for texto in (texto_fecha, texto_coordenadas, texto_marca) if texto]
    confianzas = [conf for texto, conf in (
        (texto_fecha, confianza_fecha), (texto_coordenadas, confianza_coordenadas),
        (texto_marca, confianza_marca), (texto_completo, confianza_completa),
    ) if texto]
    confianza_total = sum(confianzas) / len(confianzas) if confianzas else 0
    return " | ".join(textos), texto_completo, round(confianza_total, 1)


def _extraer_fecha_hora_ocr(texto):
    fecha = ""
    numerica = re.search(r"\b([0-3]?\d)[./-]([01]?\d)[./-](20\d{2})\b", texto)
    if numerica:
        try:
            fecha = datetime.strptime(
                f"{numerica.group(1)}/{numerica.group(2)}/{numerica.group(3)}", "%d/%m/%Y"
            ).strftime("%d/%m/%Y")
        except ValueError:
            pass
    if not fecha:
        meses = "|".join(sorted(_MESES, key=len, reverse=True))
        escrita = re.search(rf"\b([0-3]?\d)\s+({meses})\.?,?\s+(20\d{{2}})\b", texto, re.IGNORECASE)
        if escrita:
            try:
                fecha = datetime(
                    int(escrita.group(3)), _MESES[escrita.group(2).lower()], int(escrita.group(1))
                ).strftime("%d/%m/%Y")
            except ValueError:
                pass

    hora = ""
    hora_encontrada = re.search(
        r"\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?\b", texto)
    if hora_encontrada:
        h, m, s = int(hora_encontrada.group(1)), int(hora_encontrada.group(2)), int(
            hora_encontrada.group(3) or 0)
        sufijo_encontrado = re.match(
            r"\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b",
            texto[hora_encontrada.end():], re.IGNORECASE)
        sufijo = sufijo_encontrado.group(1).strip().lower()[0] if sufijo_encontrado else ""
        if sufijo == "p" and h < 12:
            h += 12
        elif sufijo == "a" and h == 12:
            h = 0
        hora = f"{h:02d}:{m:02d}:{s:02d}"
    return fecha, hora


def _extraer_coordenadas_ocr(texto):
    patron = (
        r"(-?\d{1,2}(?:[.,]\d{3,})?)\s*°?\s*([NS])\s*[,;/\s]*\s*"
        r"(-?\d{1,3}(?:[.,]\d{3,})?)\s*°?\s*([EW])"
    )
    coincidencia = re.search(patron, texto, re.IGNORECASE)
    if not coincidencia:
        return False
    try:
        lat = float(coincidencia.group(1).replace(",", "."))
        lon = float(coincidencia.group(3).replace(",", "."))
    except ValueError:
        return False
    if coincidencia.group(2).upper() == "S":
        lat = -lat
    if coincidencia.group(4).upper() == "W":
        lon = -lon
    return abs(lat) <= 90 and abs(lon) <= 180


def analizar_foto_ocr(datos_imagen, idioma="eng"):
    texto_marca, texto_completo, confianza = _texto_y_confianza_ocr(datos_imagen, idioma)
    texto_campos = f"{texto_marca} | {texto_completo}"
    fecha, hora = _extraer_fecha_hora_ocr(texto_marca)
    coordenadas_visibles = _extraer_coordenadas_ocr(texto_marca)
    cuadrilla = ""
    coincidencia = re.search(
        r"\b(?:cuadrilla|cuadr\.)\s*(?:n[.º°o]?\s*)?[:#-]?\s*([A-Z0-9-]{1,16})\b",
        texto_campos, re.IGNORECASE)
    if coincidencia:
        cuadrilla = coincidencia.group(1)
    area_m2 = ""
    coincidencia = re.search(
        r"\b(?:area|área)\s*[:=]?\s*([\d.,]+)\s*m(?:2|²)\b", texto_campos, re.IGNORECASE)
    if coincidencia:
        area_m2 = coincidencia.group(1)
    sig_intervent = ""
    coincidencia = re.search(
        r"\b(?:sig(?:natura)?\.?\s*intervent(?:or(?:a|ía)?)?|interventor(?:a|ía))"
        r"\s*[:=-]\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{1,40})",
        texto_campos, re.IGNORECASE)
    if coincidencia:
        sig_intervent = coincidencia.group(1).strip()
    legible = bool(texto_marca) and confianza >= 20
    return {
        "texto_ocr": texto_campos.strip(" |"),
        "confianza_ocr": confianza,
        "fecha": fecha,
        "hora": hora,
        "coordenadas_visibles": coordenadas_visibles,
        "cuadrilla": cuadrilla,
        "area_m2": area_m2,
        "sig_intervent": sig_intervent,
        "foto_metro_visible": None,
        "medicion_cesped_cm": None,
        "legible": legible,
    }


RECORTES = True

# --------------------------------------------------------------------------------------
# Orientación: las fotos pueden venir giradas o al revés; se enderezan antes de analizarlas
# --------------------------------------------------------------------------------------
# 1) Se aplica la orientación EXIF (lo que el celular dice que hay que girar).
# 2) Algunas fotos traen la orientación EXIF mal o no la traen (WhatsApp, capturas). Para esas se
#    usa la marca de agua del timemark, que en una foto derecha está en la esquina inferior
#    derecha: se lee esa esquina con Tesseract en cada giro (0/90/180/270) y se queda el giro donde
#    aparecen la fecha y las coordenadas. Si ningún giro la muestra con claridad, la foto se deja
#    como venía (no se gira "a ciegas").
ENDEREZAR = {"activo": True, "ruta": None, "aviso": False}
CONTEO_GIROS = {"revisadas": 0, "giradas": 0}
_CANDADO_GIROS = threading.Lock()
_PATRON_MARCA = re.compile(
    r"\d[.,]\d{3,}\s*[NSWnsw]"                       # coordenadas: 6.2727N 75.5902W
    r"|\b20[2-3]\d\b"                                 # año: 2026 (también en 28/9/2026)
    r"|\b\d{1,2}:\d{2}(?::\d{2})?\b"                  # hora: 8:42:19 / 1:08
    r"|\b[ap]\.\s?m\b"                                # a. m. / p.m
    r"|\b(?:ene|feb|mar|abr|may|jun|jul|ago|sept?|set|oct|nov|dic)\b",
    re.IGNORECASE)
_PUNTOS_MARCA_SEGURA = 2  # coincidencias mínimas para dar por encontrada la marca de agua


def _ruta_tesseract(ruta_tesseract=None):
    ruta = ruta_tesseract or os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
    if not ruta:
        candidatos = (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        )
        ruta = next((p for p in candidatos if os.path.isfile(p)), None)
    return ruta if ruta and os.path.isfile(ruta) else None


def _puntos_marca(im):
    """Cuántos rasgos de la marca de agua (fecha, hora, coordenadas) se leen en la esquina
    inferior derecha de 'im' tal como está orientada."""
    w, h = im.size
    # El texto de la marca es blanco con borde oscuro: se dejan solo los píxeles casi blancos.
    esquina = im.crop((int(w * 0.50), int(h * 0.62), w, h)).convert("L")
    esquina = esquina.point(lambda v: 0 if v > 235 else 255)
    if esquina.width < 900:
        esquina = esquina.resize((esquina.width * 2, esquina.height * 2), Image.LANCZOS)
    buf = io.BytesIO()
    esquina.save(buf, format="PNG")
    try:
        proc = subprocess.run(
            [ENDEREZAR["ruta"], "stdin", "stdout", "--psm", "6", "-l", "eng"],
            input=buf.getvalue(), capture_output=True, timeout=60,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError):
        return 0
    return len(_PATRON_MARCA.findall(proc.stdout.decode("utf-8", errors="replace")))


def enderezar(im):
    """Devuelve (imagen derecha, grados girados en sentido antihorario). Ver la nota de arriba."""
    if not ENDEREZAR["activo"]:
        return im, 0
    if ENDEREZAR["ruta"] is None:
        ENDEREZAR["ruta"] = _ruta_tesseract() or ""
    if not ENDEREZAR["ruta"]:
        if not ENDEREZAR["aviso"]:
            ENDEREZAR["aviso"] = True
            print("AVISO: no se encontró Tesseract; las fotos solo se enderezan con su dato EXIF. "
                  "Instálalo con 'winget install --id UB-Mannheim.TesseractOCR --exact' para "
                  "enderezar también las que vienen al revés sin ese dato.", flush=True)
        return im, 0
    muestra = im.copy()
    muestra.thumbnail((1600, 1600))
    puntos = {0: _puntos_marca(muestra)}
    if puntos[0] < _PUNTOS_MARCA_SEGURA:  # lo normal es que ya esté derecha y baste una lectura
        for grados in (180, 90, 270):
            puntos[grados] = _puntos_marca(muestra.rotate(grados, expand=True))
    mejor = max(puntos, key=lambda g: (puntos[g], g == 0))
    # Solo se gira si la marca se lee claramente en UN giro y en ninguno otro igual de bien.
    girar = (mejor != 0 and puntos[mejor] >= _PUNTOS_MARCA_SEGURA
             and all(puntos[mejor] > p for g, p in puntos.items() if g != mejor))
    with _CANDADO_GIROS:
        CONTEO_GIROS["revisadas"] += 1
        CONTEO_GIROS["giradas"] += int(girar)
    return (im.rotate(mejor, expand=True), mejor) if girar else (im, 0)


def abrir_derecha(datos):
    """Abre la foto en RGB ya enderezada: primero por EXIF y luego por la marca de agua."""
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(datos))).convert("RGB")
    return enderezar(im)[0]


def _jpg(im, calidad=85):
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=calidad, optimize=True)
    return buf.getvalue()


def _ajustar_ancho(im, ancho_min=900, ancho_max=1100):
    """Amplía recortes pequeños para leer la letra y reduce los grandes: cada píxel extra
    se cobra como tokens de entrada."""
    if im.width < ancho_min:
        f = ancho_min / im.width
    elif im.width > ancho_max:
        f = ancho_max / im.width
    else:
        return im
    return im.resize((int(im.width * f), int(im.height * f)), Image.LANCZOS)


def preparar_imagen(datos):
    """Devuelve {"foto": jpg, "marca": jpg} con la foto ya enderezada. El recorte de la marca de
    agua (inferior derecha) permite leer bien textos pequeños como '# 119-5 Calle 61'."""
    im = abrir_derecha(datos)
    salida = {}
    if RECORTES:
        w, h = im.size
        salida["marca"] = _jpg(_ajustar_ancho(im.crop((int(w * 0.40), int(h * 0.55), w, h))), 90)
    principal = im.copy()
    principal.thumbnail((LADO_MAX, LADO_MAX))
    salida["foto"] = _jpg(principal)
    return salida


# --------------------------------------------------------------------------------------
# Claude (plan vía Claude Code, o API)
# --------------------------------------------------------------------------------------
class LimiteAlcanzado(Exception):
    pass


_PALABRAS_LIMITE = ("usage limit", "limit reached", "rate limit", "rate_limit", "hit your limit",
                    "out of extra usage", "session limit", "weekly limit", "hit your")


def extraer_json(texto):
    texto = re.sub(r"^```(?:json)?|```$", "", texto.strip(), flags=re.M).strip()
    ini, fin = texto.find("{"), texto.rfind("}")
    if ini < 0 or fin < 0:
        raise ValueError("La respuesta no contiene JSON")
    return json.loads(texto[ini:fin + 1])


def ruta_claude():
    exe = shutil.which("claude")
    if exe:
        return exe
    for cand in (os.path.expandvars(r"%USERPROFILE%\.local\bin\claude.exe"),
                 os.path.expanduser("~/.local/bin/claude")):
        if os.path.exists(cand):
            return cand
    return None


def analizar_plan(claude_exe, modelo, lote, archivo_sistema, esquema=None):
    """lote = [(num, nombre_archivo, jpg_bytes)]"""
    with tempfile.TemporaryDirectory(prefix="zv_lote_") as carpeta:
        lineas = []
        for num, nombre, imgs in lote:
            partes_txt = []
            for tipo, sufijo in (("foto", ""), ("marca", "_marca")):
                if tipo in imgs:
                    f = f"foto_{num:04d}{sufijo}.jpg"
                    with open(os.path.join(carpeta, f), "wb") as fh:
                        fh.write(imgs[tipo])
                    partes_txt.append(f)
            extra = (f"  + recorte de la marca: {partes_txt[1]}" if len(partes_txt) > 1 else "")
            lineas.append(f"FOTO #{num} -> {partes_txt[0]}{extra}   (archivo original: {nombre})")
        prompt = ("Usa la herramienta Read para ver CADA una de estas imágenes (están en la carpeta "
                  "actual), en este orden. Los recortes '_marca' son ampliaciones de la marca de agua "
                  "de la misma foto: úsalos para leerla con exactitud.\n"
                  + "\n".join(lineas) +
                  "\n\nCuando las hayas visto todas, extrae los datos de cada una y responde solo con el JSON.")
        return ejecutar_claude_plan(claude_exe, modelo, prompt, esquema or ESQUEMA, archivo_sistema, carpeta)


# --- Segunda pasada: solo la altura del metro, con un modelo más fuerte (--metro) -------
METRO_SISTEMA = """Eres auditor de corte de césped. En cada foto SOLO debes leer la altura del césped en un metro o regla. No inventes ni estimes a ojo: si no es claramente comprobable, null.

- foto_metro_visible: true si se distingue físicamente una regla/metro junto al césped, aunque no se pueda leer.
- medicion_cesped_cm: altura del césped en cm leída donde la punta del césped cruza la escala del metro, con el cero identificable. Excepción: si el metro está vertical y apoyado en el suelo y el césped tapa su parte baja (incluido el cero), la escala es continua: reporta el número MÁS BAJO que se lea por encima de las puntas del césped (es la altura mínima comprobable; ej. si el césped tapa hasta donde empieza a verse el 25, reporta 25). null si la lectura o la colocación no son claramente comprobables (metro inclinado, en el aire, escala borrosa o números no legibles).
- lectura_metro: una frase corta con lo que ves: tipo de metro, cómo está apoyado, qué números se leen y dónde cruza el césped; o por qué no se puede leer.

Las fotos ANTES son del césped sin cortar (la interventoría exige mínimo 9 cm) y las DESPUÉS del césped cortado (mínimo 2 cm). Ese dato es solo contexto: no ajustes la lectura para que cumpla o no cumpla.

Responde con un objeto {"fotos": [...]} con UNA entrada por cada FOTO #n recibida, usando su número en "num"."""
METRO_ESQUEMA = {
    "type": "object", "required": ["fotos"], "additionalProperties": False,
    "properties": {"fotos": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["num", "foto_metro_visible", "medicion_cesped_cm", "lectura_metro"],
        "properties": {
            "num": {"type": "integer"},
            "foto_metro_visible": {"type": "boolean"},
            "medicion_cesped_cm": {"anyOf": [{"type": "null"}, {"type": "number"}]},
            "lectura_metro": {"type": "string"},
        }}}},
}
METRO_LADO_MAX = 1568  # más resolución que la primera pasada: los números del metro son pequeños


def preparar_imagen_metro(datos):
    im = abrir_derecha(datos)
    im.thumbnail((METRO_LADO_MAX, METRO_LADO_MAX))
    return {"foto": _jpg(im, 90)}


def cargar_cache_metro(base, cache):
    """Pone en 'cache' (solo en memoria) las lecturas del metro de la segunda pasada. La caché
    de la primera pasada no se modifica."""
    import glob
    rutas = sorted(glob.glob(f"{glob.escape(base)}_metro_*_cache.jsonl"), key=os.path.getmtime)
    usadas = 0
    for ruta in rutas:
        modelo = os.path.basename(ruta)[len(os.path.basename(base)) + len("_metro_"):-len("_cache.jsonl")]
        with open(ruta, encoding="utf-8") as fh:
            for linea in fh:
                try:
                    item = json.loads(linea)
                    digest, metro = item["sha256"], item["resultado"]
                except (json.JSONDecodeError, KeyError, TypeError):
                    continue
                if isinstance(cache.get(digest), dict):
                    cache[digest] = {**cache[digest],
                                     "foto_metro_visible": metro.get("foto_metro_visible"),
                                     "medicion_cesped_cm": metro.get("medicion_cesped_cm"),
                                     "lectura_metro": metro.get("lectura_metro", ""),
                                     "metro_modelo": modelo}
                    usadas += 1
    if usadas:
        print(f"Lecturas del metro de la segunda pasada: {usadas}.", flush=True)
    return rutas


def segunda_pasada_metro(args, fotos, cache, base, claude_exe, maximo=None):
    """Vuelve a leer con args.metro solo las fotos ANTES/DESPUÉS donde la primera pasada vio un
    metro. Guarda en su propia caché y deja un Excel para comparar las dos lecturas."""
    sufijo = re.sub(r"[^A-Za-z0-9_.-]+", "_", args.metro)
    ruta_cache = f"{base}_metro_{sufijo}_cache.jsonl"
    hechas = {}
    if os.path.exists(ruta_cache):
        with open(ruta_cache, encoding="utf-8") as fh:
            for linea in fh:
                try:
                    item = json.loads(linea)
                    hechas[item["sha256"]] = item["resultado"]
                except (json.JSONDecodeError, KeyError, TypeError):
                    continue
    candidatas, vistas = [], set()
    print("Buscando fotos con metro en ANTES y DESPUÉS...", flush=True)
    for ruta, grupo, abrir in fotos:
        _, carpeta, subcarpeta = _grupo_de_ruta(ruta, args.zip)
        if subcarpeta not in ("ANTES", "DESPUES"):
            continue
        try:
            datos = _bytes(abrir)
        except (OSError, zipfile.BadZipFile, KeyError):
            continue
        digest = hashlib.sha256(datos).hexdigest()
        primera = cache.get(digest)
        if digest in vistas or not isinstance(primera, dict) or not primera.get("foto_metro_visible"):
            continue
        vistas.add(digest)
        candidatas.append({"digest": digest, "abrir": abrir, "carpeta": carpeta,
                           "subcarpeta": subcarpeta, "archivo": os.path.basename(ruta),
                           "haiku": primera.get("medicion_cesped_cm")})
    faltan = [c for c in candidatas if c["digest"] not in hechas]
    if maximo:
        faltan = faltan[:maximo]
    print(f"Fotos con metro: {len(candidatas)} | ya leídas con {args.metro}: "
          f"{len(candidatas) - len([c for c in candidatas if c['digest'] not in hechas])} | "
          f"se leen ahora: {len(faltan)}", flush=True)

    archivo_sistema = None
    if faltan:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".txt",
                                         prefix="zv_metro_", delete=False) as tmp:
            tmp.write(METRO_SISTEMA)
            archivo_sistema = tmp.name
    lotes = [faltan[i:i + 4] for i in range(0, len(faltan), 4)]

    def leer(lote):
        datos_lote = [(n, f"{c['subcarpeta']} - {c['archivo']}", preparar_imagen_metro(_bytes(c["abrir"])))
                      for n, c in enumerate(lote, 1)]
        resultado = analizar_plan(claude_exe, args.metro, datos_lote, archivo_sistema, METRO_ESQUEMA)
        return validar_resultados(resultado, set(range(1, len(lote) + 1)))

    try:
        with open(ruta_cache, "a", encoding="utf-8") as salida, \
                ThreadPoolExecutor(max_workers=args.paralelo) as hilos:
            futuros = {hilos.submit(leer, lote): lote for lote in lotes}
            listas, limite = 0, False
            for futuro in futuros:
                lote = futuros[futuro]
                if futuro.cancelled():
                    continue
                try:
                    por_numero = futuro.result()
                except LimiteAlcanzado as exc:
                    if not limite:  # guardar lo que ya estaba en curso y no enviar más
                        print(f"\n{exc}", flush=True)
                        limite = True
                        for otro in futuros:
                            otro.cancel()
                    continue
                except Exception as exc:  # un lote con error no detiene los demás
                    print(f"  Lote con error (se reintenta la próxima vez): {exc}", flush=True)
                    continue
                for n, c in enumerate(lote, 1):
                    r = por_numero[n]
                    metro = {"foto_metro_visible": r.get("foto_metro_visible"),
                             "medicion_cesped_cm": r.get("medicion_cesped_cm"),
                             "lectura_metro": r.get("lectura_metro", "")}
                    hechas[c["digest"]] = metro
                    salida.write(json.dumps({"sha256": c["digest"], "resultado": metro},
                                            ensure_ascii=False) + "\n")
                salida.flush()
                listas += len(lote)
                print(f"  Metro: {listas}/{len(faltan)} fotos leídas", flush=True)
    finally:
        if archivo_sistema:
            os.remove(archivo_sistema)

    # Comparación de las dos lecturas para revisarla a mano.
    wb = Workbook()
    ws = wb.active
    ws.title = "COMPARACION METRO"
    ws.append(["CARPETA", "SUBCARPETA", "ARCHIVO", "LECTURA 1a PASADA (cm)",
               f"LECTURA {args.metro} (cm)", "QUÉ VE EL MODELO", "¿CAMBIÓ?", "REVISIÓN MANUAL"])
    cuenta = {"antes_sin": 0, "ahora_con": 0, "cambio": 0, "comparadas": 0}
    for c in candidatas:
        nueva = hechas.get(c["digest"])
        if nueva is None:
            continue
        cuenta["comparadas"] += 1
        n1, n2 = c["haiku"], nueva.get("medicion_cesped_cm")
        cuenta["antes_sin"] += not isinstance(n1, (int, float))
        cuenta["ahora_con"] += isinstance(n2, (int, float))
        cambio = "SI" if n1 != n2 else "NO"
        cuenta["cambio"] += cambio == "SI"
        ws.append([c["carpeta"], c["subcarpeta"], c["archivo"], n1, n2,
                   nueva.get("lectura_metro", ""), cambio, ""])
    for col, ancho in zip("ABCDEFGH", (22, 12, 40, 14, 14, 70, 10, 18)):
        ws.column_dimensions[col].width = ancho
    ws.freeze_panes = "A2"
    nombre = os.path.basename(base)
    ruta_excel = os.path.join(CARPETA_SALIDAS, f"{nombre}_metro_comparacion.xlsx")
    try:
        wb.save(ruta_excel)
    except PermissionError:
        ruta_excel = os.path.join(CARPETA_SALIDAS, f"{nombre}_metro_comparacion_{datetime.now():%H%M%S}.xlsx")
        wb.save(ruta_excel)
    con_primera = cuenta["comparadas"] - cuenta["antes_sin"]
    print(f"\n  SEGUNDA PASADA DEL METRO ({args.metro})")
    print(f"  Fotos comparadas:                     {cuenta['comparadas']}")
    print(f"  Con lectura en la primera pasada:     {con_primera}")
    print(f"  Con lectura en la segunda pasada:     {cuenta['ahora_con']}")
    print(f"  Lecturas distintas entre las dos:     {cuenta['cambio']}")
    print(f"  Comparación para revisar a mano:      {ruta_excel}")
    print("  Para ver el reporte con las lecturas nuevas, corre el mismo comando con --avance "
          "(sin --metro).")


# --- Sesión de Claude Code con varios procesos en paralelo -----------------------------
# El inicio de sesión del plan usa un token que vence cada pocas horas. Si vence mientras corren
# varios 'claude' a la vez (--paralelo), todos intentan renovarlo al mismo tiempo, el servidor
# invalida la sesión y Claude Code queda "sin sesión iniciada". Para evitarlo, cuando al token le
# quedan menos de 15 minutos las llamadas se hacen de UNA en UNA hasta que se renueve.
_CANDADO_TOKEN = threading.Lock()


def _archivo_credenciales():
    base = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
    return os.path.join(base, ".credentials.json")


def _minutos_token():
    """Minutos que le quedan al token de Claude Code (None si no se puede saber)."""
    try:
        with open(_archivo_credenciales(), encoding="utf-8") as f:
            vence = json.load(f)["claudeAiOauth"]["expiresAt"]
        return (float(vence) / 1000 - time.time()) / 60
    except Exception:
        return None


def _es_error_sesion(bajo):
    return any(p in bajo for p in ("/login", "not logged in", "invalid api key", "authenticat",
                                   "oauth", "token has expired", "invalid_grant", "unauthorized"))


def ejecutar_claude_plan(claude_exe, modelo, prompt, esquema, archivo_sistema, carpeta):
    """Igual que _ejecutar_claude_plan, pero protege la sesión cuando el token está por vencer
    y reintenta una vez (de forma serial) si Claude Code dice que no hay sesión."""
    minutos = _minutos_token()
    try:
        if minutos is not None and minutos < 15:
            with _CANDADO_TOKEN:
                return _ejecutar_claude_plan(claude_exe, modelo, prompt, esquema, archivo_sistema, carpeta)
        return _ejecutar_claude_plan(claude_exe, modelo, prompt, esquema, archivo_sistema, carpeta)
    except LimiteAlcanzado as exc:
        if "sesión iniciada" not in str(exc):
            raise
    # Pudo ser un choque momentáneo con otro proceso que estaba renovando el token: reintentar solo.
    time.sleep(5)
    with _CANDADO_TOKEN:
        try:
            return _ejecutar_claude_plan(claude_exe, modelo, prompt, esquema, archivo_sistema, carpeta)
        except LimiteAlcanzado as exc:
            if "sesión iniciada" not in str(exc) or not _iniciar_sesion_y_esperar(claude_exe):
                raise
        # Ya se inició sesión: seguir con este lote sin cerrar el programa.
        return _ejecutar_claude_plan(claude_exe, modelo, prompt, esquema, archivo_sistema, carpeta)


_LOGIN = {"ultimo": 0.0}


def _iniciar_sesion_y_esperar(claude_exe, espera_min=20):
    """Abre sola la ventana de inicio de sesión de Claude Code y espera (hasta 'espera_min')
    a que termines en el navegador. Devuelve True si se inició sesión; así el programa continúa."""
    if os.name != "nt" or time.time() - _LOGIN["ultimo"] < 120:
        return False  # no abrir ventanas en bucle si el login recién hecho tampoco sirvió
    archivo = _archivo_credenciales()

    def firma():
        try:
            with open(archivo, encoding="utf-8") as f:
                datos = json.load(f)
            return datos["claudeAiOauth"].get("refreshToken") or ""
        except Exception:
            return ""

    antes = firma()
    comando = ('title Iniciar sesion en Claude & echo. & '
               'echo  La sesion de Claude Code se vencio. Se abrira el navegador: entra con tu cuenta. & '
               'echo  El programa de zonas verdes continuara solo cuando termines. & '
               'echo  Si este comando falla, escribe: claude   y dentro: /login & echo. & '
               + ('claude' if shutil.which("claude") else f'"{claude_exe}"') + ' auth login')
    # Se pasa como texto (no lista) para que Python no agregue \" que CMD no entiende.
    subprocess.Popen("cmd /k " + comando, creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))
    print("\n>>> La sesión de Claude Code se venció. Se abrió una ventana para iniciar sesión "
          "(aprueba en el navegador). El programa sigue solo al terminar…", flush=True)
    limite = time.time() + espera_min * 60
    while time.time() < limite:
        time.sleep(3)
        actual = firma()
        if actual and actual != antes:
            _LOGIN["ultimo"] = time.time()
            print(">>> Sesión iniciada. Continuando la revisión…\n", flush=True)
            time.sleep(2)
            return True
    print(">>> No se detectó el inicio de sesión a tiempo.", flush=True)
    return False


def _ejecutar_claude_plan(claude_exe, modelo, prompt, esquema, archivo_sistema, carpeta):
    """Corre Claude Code (plan Pro/Max) en 'carpeta' con permiso solo de leer imágenes y devuelve
    el JSON que cumple 'esquema'. Lanza LimiteAlcanzado si se acabó el uso o no hay sesión.
    También lo usa revision_carpetas.py."""
    cmd = [claude_exe, "-p", "--output-format", "json",
           "--json-schema", json.dumps(esquema, separators=(",", ":")),
           "--append-system-prompt-file", archivo_sistema,
           "--allowedTools", "Read", "--permission-mode", "dontAsk", "--model", modelo]
    entorno = {k: v for k, v in os.environ.items()
               if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
    try:
        proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True, env=entorno,
                              encoding="utf-8", errors="replace", cwd=carpeta, timeout=900)
    except subprocess.TimeoutExpired:
        raise RuntimeError("Claude Code tardó más de 15 minutos en el lote") from None
    salida = (proc.stdout or "").strip()
    try:
        datos = json.loads(salida[salida.find("{"):]) if salida else {}
    except json.JSONDecodeError:
        datos = {"result": salida, "is_error": True}
    texto = str(datos.get("result") or proc.stderr or "")
    bajo = texto.lower()
    if datos.get("is_error") or proc.returncode != 0:
        if any(p in bajo for p in _PALABRAS_LIMITE):
            m = re.search(r"\|(\d{10})", texto)
            reinicio = re.search(r"resets\s+([^\n·|]+)", texto, re.IGNORECASE)
            if m:
                cuando = f" Se renueva aprox. a las {datetime.fromtimestamp(int(m.group(1))):%H:%M del %d/%m}."
            elif reinicio:
                cuando = f" Se renueva: {reinicio.group(1).strip()}."
            else:
                cuando = ""
            raise LimiteAlcanzado("Se alcanzó el límite de uso de tu plan." + cuando
                                  + " Vuelve a correr el mismo comando después y continuará.")
        if "credit balance" in bajo:
            raise LimiteAlcanzado("Claude Code está conectado a una cuenta de API sin saldo, no a tu "
                                  "plan. Escribe  claude , luego /logout y /login eligiendo "
                                  "'Claude account with subscription'.")
        if _es_error_sesion(bajo):
            raise LimiteAlcanzado("Claude Code no tiene sesión iniciada (o se venció). En CMD escribe  "
                                  "claude auth login  (o abre 'Cuentas de Claude' y pulsa 'Iniciar sesión "
                                  "otra vez'); luego vuelve a correr el mismo comando y continuará.\n"
                                  "   Mensaje de Claude Code: " + " ".join(texto.split())[:300])
        raise RuntimeError(f"Claude Code falló (código {proc.returncode}): {texto[:300]}")
    return datos.get("structured_output") or extraer_json(texto)


# Se desactiva sola si el modelo elegido no admite salida estructurada.
_SALIDA_ESTRUCTURADA = {"activa": True}


def parametros_api(modelo, lote, estructurada):
    """Parámetros de messages.create para un lote [(num, nombre_archivo, imagenes)]."""
    contenido = []
    for num, nombre, imgs in lote:
        for tipo, etiqueta in (("foto", f"FOTO #{num} (archivo original: {nombre})"),
                               ("marca", f"FOTO #{num} - recorte ampliado de la MARCA DE AGUA")):
            if tipo in imgs:
                contenido.append({"type": "text", "text": etiqueta})
                contenido.append({"type": "image", "source": {
                    "type": "base64", "media_type": "image/jpeg",
                    "data": base64.standard_b64encode(imgs[tipo]).decode()}})
    contenido.append({"type": "text", "text": "Extrae los datos de cada foto y responde solo con el JSON."})
    parametros = {
        "model": modelo, "max_tokens": 8000,
        # El prompt del sistema es igual en todos los lotes: se marca para la caché de prompts.
        "system": [{"type": "text", "text": SISTEMA, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": contenido}],
    }
    if estructurada:
        parametros["output_config"] = {"format": {"type": "json_schema", "schema": ESQUEMA}}
    return parametros


def validar_resultados(resultados, numeros_esperados):
    """Comprueba que Claude devolvió exactamente una foto por número; devuelve {num: resultado}."""
    fotos_resultado = resultados.get("fotos") if isinstance(resultados, dict) else None
    if not isinstance(fotos_resultado, list):
        raise ValueError("Claude no devolvió la lista JSON requerida en 'fotos'.")
    por_numero = {}
    for resultado in fotos_resultado:
        if not isinstance(resultado, dict) or not isinstance(resultado.get("num"), int):
            raise ValueError("Claude devolvió una foto sin número 'num' válido.")
        numero = resultado["num"]
        if numero not in numeros_esperados:
            raise ValueError(f"Claude devolvió el número de foto inesperado {numero}.")
        if numero in por_numero:
            raise ValueError(f"Claude devolvió dos resultados para la foto {numero}.")
        por_numero[numero] = resultado
    faltantes = set(numeros_esperados) - por_numero.keys()
    if faltantes:
        raise ValueError(
            "Claude omitió resultados para las fotos: "
            + ", ".join(str(numero) for numero in sorted(faltantes))
            + ". El lote no se guardó en caché; vuelve a ejecutar el mismo comando."
        )
    return por_numero


def analizar_api(cliente, modelo, lote):
    from anthropic import BadRequestError

    error = None
    for intento in range(3):
        estructurada = _SALIDA_ESTRUCTURADA["activa"]
        try:
            resp = cliente.messages.create(**parametros_api(modelo, lote, estructurada))
        except BadRequestError as exc:
            if not estructurada or "output" not in str(exc).lower():
                raise
            print(f"Aviso: {modelo} no admite salida estructurada; se usará lectura de JSON en texto.",
                  flush=True)
            _SALIDA_ESTRUCTURADA["activa"] = False
            continue
        texto = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        try:
            return extraer_json(texto)
        except (ValueError, json.JSONDecodeError) as e:
            error = f"JSON inválido (stop_reason={resp.stop_reason}): {e}"
            time.sleep(2 * (intento + 1))
    raise RuntimeError(error)


# --------------------------------------------------------------------------------------
# Batch API: 50 % más barata, asíncrona (normalmente < 1 h, máximo 24 h)
# --------------------------------------------------------------------------------------
# Límite de la API: 256 MB por batch; se deja margen.
BATCH_MAX_BYTES = 200 * 1024 * 1024


def leer_estado_batch(ruta):
    try:
        with open(ruta, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return {"batches": {}}


def guardar_estado_batch(ruta, estado):
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as fh:
        json.dump(estado, fh, ensure_ascii=False, indent=1)
    os.replace(temporal, ruta)


def crear_batch(cliente, modelo, solicitudes):
    """solicitudes = [(custom_id, [(num, nombre_archivo, imagenes)])] -> id del batch.
    Sin salida estructurada: no todos los modelos la admiten y en un batch no hay reintento
    inmediato; el JSON se valida al recoger los resultados."""
    batch = cliente.messages.batches.create(requests=[
        {"custom_id": custom_id, "params": parametros_api(modelo, lote, estructurada=False)}
        for custom_id, lote in solicitudes
    ])
    return batch.id


def resultados_batch(cliente, batch_id, solicitudes):
    """Itera (custom_id, {num: resultado} o None, motivo) de un batch terminado.
    solicitudes = {custom_id: [[num, sha256], ...]}"""
    for item in cliente.messages.batches.results(batch_id):
        numeros = {num for num, _ in solicitudes.get(item.custom_id, [])}
        if item.result.type != "succeeded":
            detalle = getattr(getattr(item.result, "error", None), "error", None)
            yield item.custom_id, None, f"{item.result.type} {getattr(detalle, 'message', '')}".strip()
            continue
        mensaje = item.result.message
        texto = "".join(b.text for b in mensaje.content if getattr(b, "type", "") == "text")
        try:
            yield item.custom_id, validar_resultados(extraer_json(texto), numeros), ""
        except (ValueError, json.JSONDecodeError) as exc:
            yield item.custom_id, None, f"respuesta inválida (stop_reason={mensaje.stop_reason}): {exc}"


# --------------------------------------------------------------------------------------
# Coordenadas: geocodificación con OpenStreetMap (Nominatim), con caché
# --------------------------------------------------------------------------------------
_TIPOS_VIA = {"CL": "Calle", "CLL": "Calle", "CR": "Carrera", "KR": "Carrera", "CRA": "Carrera",
              "DG": "Diagonal", "TV": "Transversal", "CQ": "Circular", "AV": "Avenida", "AK": "Avenida Carrera",
              "AC": "Avenida Calle"}


_RE_VIA = r"(CALLE|CARRERA|CRA|CR|KR|CLL|CL|DIAGONAL|DG|TRANSVERSAL|TV|CIRCULAR|CQ|AVENIDA|AV|AK|AC)\.?"
_NOMBRE_VIA = {"CALLE": "Calle", "CL": "Calle", "CLL": "Calle", "CARRERA": "Carrera", "CR": "Carrera",
               "CRA": "Carrera", "KR": "Carrera", "DIAGONAL": "Diagonal", "DG": "Diagonal",
               "TRANSVERSAL": "Transversal", "TV": "Transversal", "CIRCULAR": "Circular", "CQ": "Circular",
               "AVENIDA": "Avenida", "AV": "Avenida", "AK": "Avenida Carrera", "AC": "Avenida Calle"}


def partes_direccion(direccion):
    """Devuelve (via, numero_via, placa) o None. Acepta 'CL 61 # 119 5', 'Calle 61 #119-5',
    '# 119-5 Calle 61' (número primero) y 'CL 61'."""
    d = " " + unicodedata.normalize("NFKD", direccion or "").encode("ascii", "ignore").decode().upper() + " "
    d = d.replace("NO.", "#").replace("N.", "#")
    num_via = r"(\d+\s?[A-Z]?(?:\s?BIS)?(?:\s?SUR|\s?ESTE)?)"
    placa = r"(\d+\s?[A-Z]?)\s*[- ]\s*(\d+)"
    m = re.search(_RE_VIA + r"\s+" + num_via + r"\s*#?\s*" + placa, d)
    if m:
        return _NOMBRE_VIA[m.group(1)], m.group(2).strip(), f"{m.group(3).replace(' ', '')}-{m.group(4)}"
    m = re.search(r"#\s*" + placa + r"\s*,?\s*" + _RE_VIA + r"\s+" + num_via, d)   # '# 119-5 Calle 61'
    if m:
        return _NOMBRE_VIA[m.group(3)], m.group(4).strip(), f"{m.group(1).replace(' ', '')}-{m.group(2)}"
    m = re.search(_RE_VIA + r"\s+" + num_via + r"(?=\s|$)", d)
    if m:
        return _NOMBRE_VIA[m.group(1)], m.group(2).strip(), ""
    return None


_ABREV_VIA = {"CALLE": "CL", "CLL": "CL", "CL": "CL", "CARRERA": "CR", "CRA": "CR", "CR": "CR",
              "KR": "CR", "DIAGONAL": "DG", "DG": "DG", "TRANSVERSAL": "TV", "TV": "TV",
              "CIRCULAR": "CQ", "CQ": "CQ", "AVENIDA": "AV", "AV": "AV", "AK": "AK", "AC": "AC"}
_RE_NUM_DIR = r"(\d+)\s*([A-Z]{1,2}(?![A-Z]))?\s*(BIS)?\s*(SUR|ESTE)?"


def _num_dir(numero, letra, bis):
    return " ".join(x for x in (numero, letra, bis) if x)


def direccion_formato(direccion):
    """Normaliza al formato del reporte: 'Calle 103 #48-27' -> 'CL 103 # 48 27',
    'Cra 42B #107-13' -> 'CR 42 B # 107 13', 'Calle 6 Sur #52-20' -> 'CL 6 # SUR 52 20',
    'Cra 52 #12 Sur-22' -> 'CR 52 # 12 SUR 22', '# 64B-46 Calle 55a' -> 'CL 55 A # 64 B 46'.
    Sin dirección legible devuelve 'SIN DIRECCION EN LA MARCA'."""
    d = unicodedata.normalize("NFKD", direccion or "").encode("ascii", "ignore").decode().upper()
    d = re.sub(r"\b(NO|NRO|N)\s*\.|N\s*[°º]", "#", d).replace("-", " ")
    via = r"\b(CALLE|CARRERA|CRA|CR|KR|CLL|CL|DIAGONAL|DG|TRANSVERSAL|TV|CIRCULAR|CQ|AVENIDA|AV|AK|AC)\b\.?"
    placa = _RE_NUM_DIR + r"\s+(\d+)\b"
    m = re.search(via + r"\s*" + _RE_NUM_DIR + r"\s*#?\s*" + placa, d)
    if m:
        tipo, (n1, l1, b1, s1), (n2, l2, b2, s2, n3) = m.group(1), m.groups()[1:5], m.groups()[5:10]
    else:
        m = re.search(r"(?:#\s*)?" + placa + r"\s*,?\s*" + via + r"\s*" + _RE_NUM_DIR, d)
        if not m:
            return "SIN DIRECCION EN LA MARCA"
        (n2, l2, b2, s2, n3), tipo, (n1, l1, b1, s1) = m.groups()[0:5], m.group(6), m.groups()[6:10]
    sentido = s1 or s2
    partes = [_ABREV_VIA[tipo], _num_dir(n1, l1, b1), "#"]
    if s1:  # la vía principal es sur/este: 'CL 6 # SUR 52 20'
        partes.append(sentido)
    partes.append(_num_dir(n2, l2, b2))
    if s2 and not s1:  # la vía que cruza es sur/este: 'CR 52 # 12 SUR 22'
        partes.append(sentido)
    partes.append(n3)
    return " ".join(partes)


def direccion_osm(direccion):
    """'CL 103 # 48 27' -> 'Calle 103 48-27' (formato que entiende OpenStreetMap)."""
    p = partes_direccion(direccion)
    if not p:
        return direccion
    via, num, placa = p
    return f"{via} {num} {placa}".strip()


class Geocodificador:
    URL = "https://nominatim.openstreetmap.org/search"

    def __init__(self, archivo_cache, activo=True):
        self.archivo, self.activo, self.candado, self.ultimo = archivo_cache, activo, threading.Lock(), 0.0
        self.cache, self.errores = {}, 0
        if os.path.exists(archivo_cache):
            try:
                with open(archivo_cache, encoding="utf-8") as fh:
                    self.cache = json.load(fh)
            except (json.JSONDecodeError, OSError):
                self.cache = {}

    def buscar(self, consulta, caja=None):
        """Devuelve [lat, lon, nombre_osm] o None. 'caja' = (lat_min, lat_max, lon_min, lon_max)
        restringe la búsqueda a esa zona (ej. alrededor del barrio)."""
        r = self.buscar_varios(consulta, caja, 1)
        return r[0] if r else None

    def buscar_varios(self, consulta, caja=None, limite=5):
        """Lista de hasta 'limite' resultados [lat, lon, nombre] (para nombres repetidos, ej. dos Nazaret)."""
        clave = (consulta.strip().lower() + (f" @{','.join(f'{c:.3f}' for c in caja)}" if caja else "")
                 + (f" #{limite}" if limite != 1 else ""))
        if not consulta.strip():
            return None
        with self.candado:
            if clave in self.cache:
                return self.cache[clave]
            if not self.activo or self.errores >= 5:
                return []
            espera = 1.1 - (time.time() - self.ultimo)  # política de uso: máx. 1 consulta/seg
            if espera > 0:
                time.sleep(espera)
            if caja:
                vb = f"{caja[2]},{caja[1]},{caja[3]},{caja[0]}"
            else:
                vb = f"{CAJA_LON[0]},{CAJA_LAT[1]},{CAJA_LON[1]},{CAJA_LAT[0]}"
            params = urllib.parse.urlencode({"q": consulta, "format": "json", "limit": limite,
                                             "countrycodes": "co", "viewbox": vb, "bounded": 1})
            req = urllib.request.Request(f"{self.URL}?{params}",
                                         headers={"User-Agent": "auditoria-zonasverdes/1.1 (interventoria)"})
            try:
                with urllib.request.urlopen(req, timeout=20) as r:
                    res = json.loads(r.read().decode("utf-8"))
                valor = [[float(x["lat"]), float(x["lon"]), x.get("display_name", "")] for x in res]
            except Exception:  # noqa: BLE001
                self.errores += 1
                self.ultimo = time.time()
                return []
            self.ultimo = time.time()
            self.cache[clave] = valor
            return valor

    def guardar(self):
        try:
            with open(self.archivo, "w", encoding="utf-8") as fh:
                json.dump(self.cache, fh, ensure_ascii=False, indent=0)
        except OSError:
            pass


class GeocodificadorGoogle:
    """Google Maps Geocoding API (opcional, requiere clave). Ubica bien direcciones colombianas
    como 'Cl. 61 # 119-5, Nazaret, San Cristóbal' que OpenStreetMap no tiene."""
    URL = "https://maps.googleapis.com/maps/api/geocode/json"
    PRECISION = {"ROOFTOP": "exacta", "RANGE_INTERPOLATED": "interpolada sobre la vía",
                 "GEOMETRIC_CENTER": "centro de la vía/lugar", "APPROXIMATE": "aproximada (zona)"}

    def __init__(self, clave, cache):
        self.clave, self.cache, self.candado, self.errores, self.consultas = clave, cache, threading.Lock(), 0, 0

    def buscar(self, consulta):
        """[lat, lon, direccion_google, location_type, tipos] o None."""
        clave = "google:" + consulta.strip().lower()
        with self.candado:
            if clave in self.cache:
                return self.cache[clave]
            if self.errores >= 5:
                return None
            params = urllib.parse.urlencode({
                "address": consulta, "key": self.clave, "region": "co", "language": "es",
                "components": "country:CO",
                "bounds": f"{CAJA_LAT[0]},{CAJA_LON[0]}|{CAJA_LAT[1]},{CAJA_LON[1]}"})
            try:
                with urllib.request.urlopen(f"{self.URL}?{params}", timeout=20) as r:
                    res = json.loads(r.read().decode("utf-8"))
            except Exception:  # noqa: BLE001
                self.errores += 1
                return None
            self.consultas += 1
            estado = res.get("status")
            if estado in ("REQUEST_DENIED", "OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT"):
                self.errores = 5
                print(f"  Aviso Google Maps: {estado} - {res.get('error_message', '')[:150]}")
                return None
            valor = None
            for x in res.get("results", []):
                loc = x["geometry"]["location"]
                if en_valle(loc["lat"], loc["lng"]):
                    valor = [round(loc["lat"], 6), round(loc["lng"], 6), x.get("formatted_address", ""),
                             x["geometry"].get("location_type", ""), x.get("types", [])]
                    break
            self.cache[clave] = valor
            return valor


def en_valle(lat, lon):
    return CAJA_LAT[0] <= lat <= CAJA_LAT[1] and CAJA_LON[0] <= lon <= CAJA_LON[1]


def distancia_km(a_lat, a_lon, b_lat, b_lon):
    import math
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _clave_dir(direccion, barrio):
    p = partes_direccion(direccion or "")
    base = f"{p[0]} {p[1]} {p[2]}" if p else (direccion or "")
    norm = lambda t: re.sub(r"[^A-Z0-9]", "", unicodedata.normalize("NFKD", t or "")  # noqa: E731
                            .encode("ascii", "ignore").decode().upper())
    return f"{norm(base)}|{norm(barrio)}"


def cargar_conocidas(rutas):
    """Lee direcciones_conocidas.csv (direccion;barrio;latitud;longitud). Separador ; o , y
    decimales con punto o coma. Devuelve {clave: (lat, lon)}."""
    conocidas = {}
    for ruta in rutas:
        if not os.path.exists(ruta):
            continue
        with open(ruta, encoding="utf-8-sig", newline="") as fh:
            texto = fh.read()
        sep = ";" if texto.count(";") >= texto.count(",") / 2 else ","
        for fila in csv.DictReader(io.StringIO(texto), delimiter=sep):
            f = {(k or "").strip().lower(): (v or "").strip() for k, v in fila.items()}
            try:
                lat = float(f.get("latitud", "").replace(",", "."))
                lon = float(f.get("longitud", "").replace(",", "."))
            except ValueError:
                continue
            if f.get("direccion"):
                conocidas[_clave_dir(f["direccion"], f.get("barrio", ""))] = (lat, lon)
        print(f"Direcciones verificadas cargadas: {len(conocidas)} ({os.path.basename(ruta)})")
    return conocidas


def resolver_coordenadas(fila, geo, conocidas=None, google=None):
    """Devuelve (lat, lon, fuente, motivo_si_no_hay). Prueba en orden y anota por qué falla cada paso.
    Todo resultado de mapa se valida contra el barrio de la marca de agua."""
    motivos = []
    motivos.append("los metadatos EXIF no se aceptan como coordenadas visibles")
    cm = fila.get("coordenadas_marca")
    if isinstance(cm, dict) and cm.get("lat") is not None and cm.get("lon") is not None:
        lat, lon = float(cm["lat"]), float(cm["lon"])
        if lon > 0 and en_valle(lat, -lon):  # longitud sin signo
            lon = -lon
        if en_valle(lat, lon):
            return round(lat, 6), round(lon, 6), "Marca de agua (exacto)", ""
        motivos.append(f"las coordenadas leídas en la marca ({lat}, {lon}) quedan fuera del Valle de Aburrá")
    else:
        motivos.append("la marca de agua no muestra latitud/longitud")

    direccion = fila.get("direccion") or fila.get("direccion_original") or ""
    barrio = fila.get("barrio") or ""
    if conocidas:
        for b in (barrio, ""):
            hit = conocidas.get(_clave_dir(direccion, b))
            if hit and direccion:
                return hit[0], hit[1], "Dirección verificada (direcciones_conocidas.csv)", ""

    # Google Maps (si hay clave): dirección completa con barrio y sector
    muni_g = fila.get("municipio") or "Medellín"
    sector_g = fila.get("comuna_corregimiento") or ""
    if google:
        p_g = partes_direccion(direccion)
        contexto = ", ".join(x for x in (barrio, sector_g, muni_g, "Antioquia") if x)
        consultas = []
        if p_g and p_g[2]:
            consultas.append((f"{p_g[0]} {p_g[1]} # {p_g[2]}, {contexto}", f"dirección {p_g[0]} {p_g[1]} # {p_g[2]}"))
        elif p_g:
            consultas.append((f"{p_g[0]} {p_g[1]}, {contexto}", f"vía {p_g[0]} {p_g[1]}"))
        for ref in list(fila.get("lugares_mapa") or [])[:3]:
            limpio = re.sub(r"\(.*?\)", "", ref).split("/")[0].rstrip(". …").strip()
            if len(limpio) >= 4:
                consultas.append((f"{limpio}, {contexto}", f"lugar del minimapa '{limpio}'"))
        centro_g = (google.buscar(", ".join(x for x in (barrio, sector_g, muni_g, "Antioquia") if x))
                    if barrio else None)
        for q, que in consultas:
            r = google.buscar(q)
            if not r:
                continue
            if r[3] == "APPROXIMATE" and "dirección" in que:
                motivos.append(f"Google solo ubicó la zona (no la {que})")
                continue
            if centro_g and distancia_km(r[0], r[1], centro_g[0], centro_g[1]) > 3:
                motivos.append(f"Google ubicó la {que} lejos del barrio {barrio}: descartado")
                continue
            prec = GeocodificadorGoogle.PRECISION.get(r[3], r[3])
            aprox = "" if r[3] == "ROOFTOP" else " (aprox.)"
            return r[0], r[1], f"Google Maps: {que}, precisión {prec}{aprox} -> {r[2]}", ""
        if consultas:
            motivos.append("Google Maps no encontró la dirección ni los lugares del minimapa")

    if not geo.activo:
        motivos.append("la búsqueda en mapas está desactivada (--sin-geocodificar)")
        return None, None, "Sin coordenadas", "; ".join(motivos)

    muni = fila.get("municipio") or "Medellín"
    region = f"{muni}, Antioquia, Colombia"
    partes = partes_direccion(direccion)

    lugares = []
    for ref in list(fila.get("lugares_mapa") or []) + list(fila.get("referencias_mapa") or []):
        limpio = re.sub(r"\(.*?\)", "", ref).split("/")[0].rstrip(". …").strip()
        if len(limpio) >= 4 and limpio not in lugares:
            lugares.append(limpio)
    calles = []
    for calle in fila.get("calles_mapa") or []:
        p = partes_direccion(calle)
        calles.append(f"{p[0]} {p[1]}" if p else calle)
    sector = fila.get("comuna_corregimiento") or ""

    # Candidatos de barrio (puede haber homónimos, ej. Nazaret en Comuna 9 y en San Cristóbal)
    candidatos = []
    if barrio:
        consulta = f"{barrio}, {sector + ', ' if sector else ''}{region}"
        candidatos = geo.buscar_varios(consulta, None, 5) or []
        if not candidatos and sector:
            candidatos = geo.buscar_varios(f"{barrio}, {region}", None, 5) or []
        # quitar duplicados muy cercanos entre sí
        unicos = []
        for c in candidatos:
            if all(distancia_km(c[0], c[1], u[0], u[1]) > 1.0 for u in unicos):
                unicos.append(c)
        candidatos = unicos
        if not candidatos:
            motivos.append(f"el barrio '{barrio}' no se encontró en OpenStreetMap (no se pudo validar la zona)")

    def caja_de(c, d=0.025):  # ~2.7 km alrededor
        return (c[0] - d, c[0] + d, c[1] - d, c[1] + d)

    def evaluar(centro):
        """Intenta ubicar la foto alrededor de un candidato de barrio. Devuelve (resultado, puntaje)."""
        caja = caja_de(centro)
        hallados = [n for n in lugares if geo.buscar(f"{n}, {region}", caja)]
        puntaje = len(hallados)
        if partes and partes[2]:
            via, num, placa = partes
            r = geo.buscar(f"{via} {num} {placa}, {region}", caja)
            if r:
                return (r[0], r[1], f"Dirección {via} {num} # {placa} (aprox.)"), puntaje + 3
        if partes:
            via, num, _ = partes
            r = geo.buscar(f"{via} {num}, {region}", caja)
            if r:
                return (r[0], r[1], f"{via} {num} en el barrio {barrio} (aprox., sobre la vía)"), puntaje + 2
        if hallados:
            r = geo.buscar(f"{hallados[0]}, {region}", caja)
            return (r[0], r[1], f"Minimapa: cerca de '{hallados[0]}' (aprox.)"), puntaje + 1
        for q in calles:
            r = geo.buscar(f"{q}, {region}", caja)
            if r:
                return (r[0], r[1], f"Minimapa: sobre '{q}' cerca de {barrio} (aprox.)"), puntaje + 1
        return (centro[0], centro[1], f"Centro del barrio {barrio} (aprox., baja precisión)"), puntaje

    if candidatos:
        evaluados = [(evaluar(c), c) for c in candidatos]
        (mejor, puntaje), centro = max(evaluados, key=lambda x: x[0][1])
        nota = ""
        if len(candidatos) > 1:
            nota = (f" [hay {len(candidatos)} lugares llamados '{barrio}' en el mapa; se eligió el que "
                    f"coincide con la dirección/minimapa: {centro[2].split(',')[1].strip() if ',' in centro[2] else centro[2]}]")
            if puntaje == 0:
                nota += " - AMBIGUO, verificar"
        return mejor[0], mejor[1], mejor[2] + nota, ""

    # Sin barrio: búsqueda general en el municipio (menos confiable)
    if partes and partes[2]:
        via, num, placa = partes
        r = geo.buscar(f"{via} {num} {placa}, {region}")
        if r:
            return r[0], r[1], f"Dirección {via} {num} # {placa} (aprox., sin validar barrio)", ""
        motivos.append(f"la dirección '{via} {num} # {placa}' no está registrada con placa en OpenStreetMap")
    elif direccion:
        motivos.append(f"no se pudo interpretar la dirección '{direccion}'")
    else:
        motivos.append("la marca de agua no trae dirección")
    for n in lugares:
        r = geo.buscar(f"{n}, {region}")
        if r:
            return r[0], r[1], f"Minimapa: cerca de '{n}' (aprox., sin validar barrio)", ""
    if lugares or calles:
        motivos.append(f"los nombres del minimapa ({', '.join((lugares + calles)[:4])}) no se encontraron en OpenStreetMap")
    else:
        motivos.append("la foto no tiene minimapa o no se leen nombres en él")
    if not barrio:
        motivos.append("la marca no trae barrio")
    if geo.errores >= 5:
        motivos.append("no hubo conexión con OpenStreetMap (revisar internet)")
    return None, None, "Sin coordenadas", "; ".join(motivos)


# --------------------------------------------------------------------------------------
# Excel
# --------------------------------------------------------------------------------------
AZUL = "1F4E78"
FINO = Side(style="thin", color="000000")
BORDE = Border(left=FINO, right=FINO, top=FINO, bottom=FINO)
F_NORMAL = Font(name="Calibri", size=11)
F_TITULO = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
CENTRO = Alignment(horizontal="center", vertical="center", wrap_text=True)
IZQ = Alignment(horizontal="left", vertical="center", wrap_text=True)

def encabezado(ws, cols):
    for i, (t, ancho, *_) in enumerate(cols, 1):
        c = ws.cell(row=1, column=i, value=t)
        c.font, c.fill, c.alignment, c.border = F_TITULO, PatternFill("solid", fgColor=AZUL), CENTRO, BORDE
        ws.column_dimensions[get_column_letter(i)].width = ancho
    ws.freeze_panes = "B2"


# Mismo formato del informe "LOTES EJECUTADOS CW…" de Emvarias.
COLUMNAS_REPORTE = [
    ("MICRORRUTA", 14), ("LOTE", 9), ("NOMBRE Y DESCRIPCION", 55), ("DIRECCION", 28),
    ("FECHA", 14), ("CUADRILLA", 11), ("AREA m2", 12), ("OBSERVACIONES", 30),
    ("NOVEDAD", 50), ("AC", 16), ("OBSERVACIONES TOTALES", 90),
]
_MESES = ("ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE",
          "OCTUBRE", "NOVIEMBRE", "DICIEMBRE")


def _numero(valor):
    """1109.0 -> 1109; deja el texto como está."""
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    return valor


def _clave_lote(valor):
    """'N-A', 'NA' y 'N/A' son el mismo lote; '1109' y 1109 también."""
    return re.sub(r"[^0-9A-Z]", "", str(_numero(valor) if valor is not None else "").upper())


def _fechas_texto(valor):
    """Fechas del informe -> (texto para la celda, {'DD/MM/YYYY', ...}). La fecha vacía de
    Excel (30/12/1899) llega como una hora sola y se toma como sin fecha."""
    if valor is None or isinstance(valor, hora_sola):
        return "", set()
    if isinstance(valor, datetime):
        texto = valor.strftime("%d/%m/%Y")
        return texto, {texto}
    fechas = set()
    for token in str(valor).split():
        try:
            fechas.add(datetime.strptime(token, "%d/%m/%Y").strftime("%d/%m/%Y"))
        except ValueError:
            pass
    return " ".join(str(valor).split()), fechas


def cuadrillas_de_entrada(base, inventario):
    """Carpetas C2/, C4/... en la raíz: una cuadrilla por carpeta. Si no, el nombre del ZIP."""
    en_raiz = {int(m.group(1)) for v in inventario.values()
               if (m := re.fullmatch(r"C(\d+)", v["ruta"].replace("\\", "/").split("/")[0], re.IGNORECASE))}
    m = re.match(r"C(\d+)", os.path.basename(base), re.IGNORECASE)
    return sorted(en_raiz) if en_raiz else int(m.group(1)) if m else None


def leer_cache(ruta):
    cache = {}
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as fh:
            for linea in fh:
                try:
                    item = json.loads(linea)
                    cache[item["sha256"]] = item["resultado"]
                except (json.JSONDecodeError, KeyError, TypeError):
                    continue
    return cache


def leer_informe(ruta, cuadrilla=None):
    """Lee el informe LOTES EJECUTADOS (xlsx): título, período y una fila por microrruta.
    Con 'cuadrilla' (un número o varios) deja solo las microrrutas de esas cuadrillas."""
    ws = load_workbook(ruta, data_only=True, read_only=True).active
    titulo, periodo, filas = "", "", []
    for r in ws.iter_rows(values_only=True):
        r = list(r) + [None] * 10
        primero = _limpio(r[0])
        if re.fullmatch(r"Z\d+CC\d+", primero, re.IGNORECASE):
            fecha, fechas = _fechas_texto(r[4])
            filas.append({
                "microruta": primero.upper(), "lote": _numero(r[1]), "nombre": _limpio(r[2]),
                "direccion": _limpio(r[3]), "fecha": fecha, "fechas": fechas,
                "cuadrilla": _numero(r[5]), "area": _numero(r[6]), "observacion": _limpio(r[7]),
                "novedad": _limpio(r[8]), "ac": _limpio(r[9]).upper(),
            })
        elif primero.upper().startswith("LOTES EJECUTADOS"):
            titulo = primero
        elif primero.upper().startswith("PERIODO"):
            periodo = primero
    todas = len(filas)
    if cuadrilla is not None:
        cuadrillas = {_clave_lote(c) for c in (cuadrilla if isinstance(cuadrilla, (set, list, tuple))
                                               else [cuadrilla])}
        propias = [f for f in filas if _clave_lote(f["cuadrilla"]) in cuadrillas]
        if propias:
            filas = propias
        else:
            print(f"AVISO: el informe no tiene microrrutas de la cuadrilla {cuadrilla}; "
                  "se usan todas.", flush=True)
    return {"titulo": titulo, "periodo": periodo, "filas": filas, "total": todas}


# Fotos de un momento tomadas todas en el mismo sitio: no recorren el lote.
DISTRIBUCION_MIN_M = 30
# Sin coordenadas o foto movida: la novedad solo sale si menos del 80 % de las fotos del momento
# cumplen (regla de la interventoría, 20-oct-2026).
PORCENTAJE_MINIMO = 0.8
OFICIAL_NO_ABARCA = "Registro fotográfico del {} no abarca la totalidad de la microrruta."
# Palabras con que el informe de Emvarias reporta cada novedad visible.
PALABRAS_NOVEDAD = {
    "cerramiento": ("CERRAMIENTO", "CERRAD"),
    "orden_publico": ("ORDEN PUBLICO",),
    "sin_cobertura_vegetal": ("COBERTURA",),
    "abejas": ("ABEJA", "AVISPA", "PANAL"),
}


def _sin_tildes(texto):
    return unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode().upper()


def _extension_m(puntos):
    """Mayor distancia en metros entre las coordenadas de un grupo de fotos."""
    puntos = list(puntos)
    return max((((a[0] - b[0]) * 110574) ** 2 + ((a[1] - b[1]) * 110574) ** 2) ** 0.5
               for i, a in enumerate(puntos) for b in puntos[i:])


def _novedades_del_informe(prog):
    """Claves de NOVEDADES_VISIBLES que reporta el informe (columnas NOVEDAD u OBSERVACIONES) y
    si el informe reporta alguna novedad."""
    novedad = _sin_tildes(prog["novedad"]).strip()
    texto = novedad + " " + _sin_tildes(prog["observacion"])
    claves = {k for k, palabras in PALABRAS_NOVEDAD.items() if any(p in texto for p in palabras)}
    return claves, bool(claves) or novedad not in ("", "SN", "-", "NA", "N/A")


def _fila_sin_carpeta(prog, periodo):
    """Microrruta programada en el informe que no tiene carpeta en el ZIP. Regla de la
    interventoría: si no hay fotos, NOVEDAD lleva el texto oficial de "sin registro fotográfico"."""
    obs = prog["observacion"].strip(" -")
    texto = obs.upper()
    observaciones = ["Sin carpeta de fotos en el ZIP."]
    if "ORDEN PUBLICO" in texto and "SIN REGISTRO" in texto:
        novedad = OFICIAL_ORDEN_PUBLICO_SIN_REGISTRO
    else:  # sin carpeta = sin registro, diga lo que diga el informe (usuario, 21-oct-2026)
        novedad = OFICIAL_SIN_TRES_MOMENTOS
    # Sin fotos el AC es N/A (no aplica), como el informe con las microrrutas no ejecutadas.
    ac = "N/A"
    if obs:
        observaciones.insert(0, f"Informe Emvarias: {obs}.")
        observaciones.append("REVISAR la justificación que da el informe.")
    if prog["novedad"] or prog["ac"]:
        observaciones.append(f"El informe traía NOVEDAD: {prog['novedad'] or '(vacía)'}; "
                             f"AC: {prog['ac'] or '(vacío)'}.")
    return {
        "microruta": prog["microruta"], "lote": prog["lote"], "nombre": prog["nombre"],
        "direccion": prog["direccion"], "fecha": prog["fecha"], "cuadrilla": prog["cuadrilla"],
        "area": prog["area"], "quincena": "", "observaciones": " ".join(observaciones),
        "observacion_informe": obs,
        "novedad": novedad, "ac": ac,
    }


def ordenar_con_informe(resultado, informe):
    """Una fila por microrruta del informe, en su mismo orden; al final, las carpetas del ZIP
    que no están en el informe."""
    por_codigo = {}
    for fila in resultado:
        por_codigo.setdefault(str(fila["microruta"]).upper(), []).append(fila)
    ordenado = []
    for prog in informe["filas"]:
        ordenado.extend(por_codigo.pop(prog["microruta"], None)
                        or [_fila_sin_carpeta(prog, informe["periodo"])])
    por_lote = {_clave_lote(p["lote"]): p for p in informe["filas"] if _clave_lote(p["lote"]) not in ("", "NA")}
    for filas in por_codigo.values():
        for fila in filas:
            novedades = [n for n in fila["novedad"].split("; ") if n and n != "SN"]
            fila["novedad"] = "; ".join([OFICIAL_NO_EN_INFORME] + novedades)
            otra = por_lote.get(_clave_lote(fila["lote"]))
            if otra:
                fila["observaciones"] += (f" REVISAR: el lote {fila['lote']} está en el informe con la "
                                          f"microrruta {otra['microruta']}.")
            if fila["ac"] not in ("NO", "N/A"):
                fila["ac"] = "NO VERIFICABLE"
            ordenado.append(fila)
    return ordenado


def periodo_de_filas(filas):
    """'PERIODO 1 AL 15 DE OCTUBRE 2026' a partir de la quincena y el mes más frecuente."""
    meses, quincenas = {}, {f.get("quincena") for f in filas if f.get("quincena") in ("Q1", "Q2")}
    for f in filas:
        for token in str(f.get("fecha", "")).replace(";", " ").split():
            try:
                d = datetime.strptime(token, "%d/%m/%Y")
            except ValueError:
                continue
            meses[(d.year, d.month)] = meses.get((d.year, d.month), 0) + 1
    if not meses or len(quincenas) != 1:
        return "PERIODO: NO VERIFICABLE"
    anio, mes = max(meses, key=meses.get)
    if quincenas == {"Q1"}:
        dias = "1 AL 15"
    else:
        ultimo = (datetime(anio + (mes == 12), mes % 12 + 1, 1) - datetime(anio, mes, 1)).days
        dias = f"16 AL {ultimo}"
    return f"PERIODO {dias} DE {_MESES[mes - 1]} {anio}"


def _fila_revision_manual(fila, motivo):
    codigo = _PATRON_CARPETA.fullmatch(fila.get("carpeta", "") or "")
    coords = fila.get("coordenadas_marca")
    if not isinstance(coords, dict):
        coords = {}
    return {
        "fecha": fila.get("fecha") or "NO VISIBLE",
        "hora": fila.get("hora") or "NO VISIBLE",
        "latitud": coords.get("lat") if coords.get("lat") is not None else "NO VISIBLE",
        "longitud": coords.get("lon") if coords.get("lon") is not None else "NO VISIBLE",
        "coordenadas": (f"{coords['lat']}, {coords['lon']}"
                        if coords.get("lat") is not None and coords.get("lon") is not None
                        else "NO VISIBLE"),
        "direccion": direccion_formato(fila.get("direccion") or fila.get("direccion_original")),
        "carpeta": fila.get("carpeta", ""),
        "lote": codigo.group(2) if codigo else "NO VERIFICABLE",
        "quincena": codigo.group(3).upper() if codigo else "NO VERIFICABLE",
        "subcarpeta": fila.get("subcarpeta") or "NO CLASIFICADA",
        "archivo": fila.get("ruta", fila.get("archivo", "")),
        "motivo": motivo,
        "texto_ocr": fila.get("texto_ocr", ""),
    }


def motivos_revision(fila):
    """Texto de la columna MOTIVO de REVISION MANUAL para una foto con resultado."""
    motivos = []
    if not fila.get("fecha"):
        motivos.append("Confirmar fecha visible: Claude no pudo leerla.")
    if not fila.get("hora"):
        motivos.append("Confirmar hora visible: Claude no pudo leerla.")
    if fila.get("coordenadas_visibles") is not True:
        motivos.append("Confirmar coordenadas sobreimpresas: Claude no pudo verificarlas.")
    if fila.get("legible") is False:
        motivos.append("Claude indica que la foto o la marca no es legible.")
    etiquetas = [NOVEDADES_VISIBLES[n] for n in novedades_foto(fila)]
    if etiquetas:
        motivos.append(f"Posible novedad ({', '.join(etiquetas)}): "
                       f"{fila.get('detalle_novedad') or 'confirmar en la foto'}.")
    if fila["subcarpeta"] in ("ANTES", "DESPUES"):
        umbral = "9 cm" if fila["subcarpeta"] == "ANTES" else "2 cm"
        motivos.append(
            f"Verificar visualmente el metro, su posición y la lectura mínima de {umbral}.")
    if not motivos:
        motivos.append("Sin alertas automáticas: verificación visual general.")
    return " ".join(motivos)


class IndiceFotos:
    """Recuerda el sha256 de cada foto (por ruta, tamaño y CRC del ZIP, o fecha de la carpeta) en
    <base>_indice_fotos.json, para no tener que volver a leer los GB del ZIP en cada --avance."""

    def __init__(self, origen):
        self.ruta = os.path.splitext(origen.rstrip("\\/"))[0] + "_indice_fotos.json"
        self.origen = origen
        self.cambios = False
        try:
            with open(self.ruta, encoding="utf-8") as fh:
                self.datos = json.load(fh)
        except (OSError, ValueError):
            self.datos = {}
        self.firmas = {}
        if zipfile.is_zipfile(origen):
            for info in _zip_abierto(origen).infolist():
                self.firmas[info.filename] = f"{info.file_size}|{info.CRC}"

    def _firma(self, ruta):
        if ruta in self.firmas:
            return self.firmas[ruta]
        try:
            st = os.stat(os.path.join(self.origen, ruta))
            return f"{st.st_size}|{int(st.st_mtime)}"
        except OSError:
            return None

    def digest(self, ruta, abrir):
        firma = self._firma(ruta)
        clave = f"{ruta}|{firma}"
        if firma and clave in self.datos:
            return self.datos[clave]
        valor = hashlib.sha256(_bytes(abrir)).hexdigest()
        if firma:
            self.datos[clave] = valor
            self.cambios = True
        return valor

    def guardar(self):
        if self.cambios:
            try:
                with open(self.ruta, "w", encoding="utf-8") as fh:
                    json.dump(self.datos, fh)
                self.cambios = False
            except OSError:
                pass


def armar_reporte(fotos, cache, inventario, origen, informe=None, progreso=None):
    """Arma el reporte con lo que ya está en caché, sin llamar a Claude. Lo usan --avance y el
    panel (panel_novedades.py). Devuelve un dict con filas por foto, reporte y conteos."""
    indice = IndiceFotos(origen)
    filas, pendientes_por_grupo = [], {}
    for num, (ruta, grupo, abrir) in enumerate(fotos, 1):
        if num % 500 == 0:
            if progreso:
                progreso(num, len(fotos))
            else:
                print(f"Leyendo fotografías: {num}/{len(fotos)}", flush=True)
        _, nombre_carpeta, subcarpeta = _grupo_de_ruta(ruta, origen)
        fila = {"num": num, "archivo": os.path.basename(ruta), "ruta": ruta, "grupo": grupo,
                "carpeta": nombre_carpeta, "subcarpeta": subcarpeta, "error": None}
        try:
            fila["sha256"] = indice.digest(ruta, abrir)
            resultado = cache.get(fila["sha256"])
        except (OSError, zipfile.BadZipFile, KeyError):
            resultado = None
        if resultado is None:
            pendientes_por_grupo[grupo] = pendientes_por_grupo.get(grupo, 0) + 1
        else:
            fila.update(resultado)
            fila["texto_ocr"] = resultado.get("texto_marca", "")
        filas.append(fila)
    indice.guardar()

    pendientes = sum(pendientes_por_grupo.values())
    grupos = set(inventario) | {f["grupo"] for f in filas}
    completos = {g for g in grupos if not pendientes_por_grupo.get(g)}
    filas_completas = [f for f in filas if f["grupo"] in completos]
    reporte = consolidar_carpetas(
        filas_completas, {k: v for k, v in inventario.items() if k in completos}, origen, informe)
    # Carpetas con fotos aún sin analizar: no son "sin registro", quedan como pendientes.
    en_proceso = {}
    for g in grupos - completos:
        m = _PATRON_CARPETA.fullmatch(inventario.get(g, {}).get("nombre", "") or "")
        if m:
            en_proceso[m.group(1).upper()] = pendientes_por_grupo.get(g, 0)
    for fila in reporte:
        faltan = en_proceso.get(str(fila["microruta"]).upper())
        if faltan is not None and "Sin carpeta de fotos" in fila["observaciones"]:
            fila.update(novedad="PENDIENTE", ac="PENDIENTE",
                        observaciones=f"PENDIENTE: la carpeta aún tiene {faltan} foto(s) sin analizar.")
    return {"filas": filas, "filas_completas": filas_completas, "reporte": reporte,
            "pendientes": pendientes, "hechas": len(filas) - pendientes,
            "grupos": grupos, "completos": completos}


def mostrar_avance(fotos, cache, inventario, origen, salida, informe=None):
    """Cuenta las fotos que ya tienen resultado en caché y genera un Excel parcial con las
    carpetas completas. No llama a Claude."""
    datos = armar_reporte(fotos, cache, inventario, origen, informe)
    filas, pendientes = datos["filas"], datos["pendientes"]
    porcentaje = 100 * datos["hechas"] / len(filas) if filas else 100
    print("\n  AVANCE DE LA REVISIÓN (sin llamar a Claude)")
    print(f"  Fotografías analizadas:   {datos['hechas']} de {len(filas)} ({porcentaje:.1f} %)")
    print(f"  Fotografías pendientes:   {pendientes}")
    print(f"  Carpetas completas:       {len(datos['completos'])} de {len(datos['grupos'])}")
    if not datos["completos"]:
        print("  Aún no hay carpetas completas; no se generó Excel parcial.")
        return
    reporte = datos["reporte"]
    revisiones = [_fila_revision_manual(f, motivos_revision(f)) for f in datos["filas_completas"]]
    salida = generar_excel(os.path.splitext(salida)[0] + "_parcial.xlsx", reporte, revisiones, informe)
    estados = [c.get("ac") for c in reporte]
    print(f"  Excel parcial:            {salida}")
    print(f"    (solo carpetas completas | SI: {estados.count('SI')} | NO: {estados.count('NO')}"
          f" | NO VERIFICABLE: {estados.count('NO VERIFICABLE')} | N/A: {estados.count('N/A')}"
          f" | PENDIENTE: {estados.count('PENDIENTE')})")
    if pendientes:
        print("  Para continuar, corre el mismo comando sin --avance.")


def duracion_texto(segundos):
    """3725 -> '1 h 02 min 05 s'."""
    segundos = int(segundos)
    h, resto = divmod(segundos, 3600)
    m, s = divmod(resto, 60)
    return f"{h} h {m:02d} min {s:02d} s" if h else f"{m} min {s:02d} s"


def texto_tiempo(inicio, analizadas):
    """Duración desde 'inicio' (datetime) y velocidad de las fotos analizadas por Claude."""
    segundos = (datetime.now() - inicio).total_seconds()
    texto = f"{duracion_texto(segundos)} (de {inicio:%H:%M} a {datetime.now():%H:%M})"
    if analizadas and segundos >= 1:
        texto += f" | {analizadas / (segundos / 60):.1f} fotos/min analizadas por Claude"
    return texto


def imprimir_resumen(filas, reporte, revisiones, inicio):
    """Conteo final en consola de fotografías y carpetas revisadas."""
    def contar(condicion):
        return sum(1 for f in filas if condicion(f))

    def revisada(origen):
        return contar(lambda f: f.get("origen_resultado") == origen and not f.get("error"))

    con_error = contar(lambda f: f.get("error"))
    estados = [c.get("ac") for c in reporte]
    print("\n  RESUMEN DE LA REVISIÓN")
    print(f"  Fotografías encontradas:          {len(filas)}"
          f"  (ANTES: {contar(lambda f: f.get('subcarpeta') == 'ANTES')}"
          f" | DURANTE: {contar(lambda f: f.get('subcarpeta') == 'DURANTE')}"
          f" | DESPUÉS: {contar(lambda f: f.get('subcarpeta') == 'DESPUES')}"
          f" | AC: {contar(lambda f: f.get('subcarpeta') == 'AC')}"
          f" | posoperación: {contar(lambda f: f.get('subcarpeta') == 'POSOPERACION')}"
          f" | sin clasificar: {contar(lambda f: not f.get('subcarpeta'))})")
    print(f"  Revisadas con resultado:          {len(filas) - con_error}")
    print(f"    - analizadas por Claude ahora:  {revisada('claude')}")
    print(f"    - tomadas de la caché:          {revisada('cache')}")
    print(f"    - copias exactas de otra foto:  {revisada('copia')}")
    print(f"  Con error o sin resultado:        {con_error}")
    print(f"  Con medición del metro legible:   "
          f"{contar(lambda f: isinstance(f.get('medicion_cesped_cm'), (int, float)))}")
    print(f"  Con posible novedad visible:      {contar(novedades_foto)}")
    print(f"  Carpetas consolidadas:            {len(reporte)}"
          f"  (SI: {estados.count('SI')} | NO: {estados.count('NO')}"
          f" | NO VERIFICABLE: {estados.count('NO VERIFICABLE')} | N/A: {estados.count('N/A')})")
    print(f"  Fotografías en REVISION MANUAL:   {len(revisiones)}")
    print(f"  Tiempo total:                     {texto_tiempo(inicio, revisada('claude'))}")


DIAS_GRACIA_DESPUES = 2


def _en_gracia(fecha, quincena):
    """Fecha del DESPUÉS dentro de los DIAS_GRACIA_DESPUES días siguientes al fin de la quincena:
    Q1 termina el 15 (vale 16 y 17); Q2 termina a fin de mes (vale 1 y 2 del mes siguiente)."""
    try:
        dia = datetime.strptime(fecha, "%d/%m/%Y").day
    except ValueError:
        return False
    if quincena == "Q1":
        return 15 < dia <= 15 + DIAS_GRACIA_DESPUES
    if quincena == "Q2":
        return dia <= DIAS_GRACIA_DESPUES
    return False


def _fechas_fuera_de_quincena(fechas, quincena):
    """Q1 = días 1 a 15, Q2 = días 16 a fin de mes. Devuelve las fechas DD/MM/YYYY fuera de rango."""
    if quincena not in ("Q1", "Q2"):
        return []
    fuera = []
    for fecha in fechas:
        try:
            dia = datetime.strptime(fecha, "%d/%m/%Y").day
        except ValueError:
            continue
        if (dia <= 15) != (quincena == "Q1"):
            fuera.append(fecha)
    return fuera


def consolidar_carpetas(filas, inventario, origen, informe=None):
    programadas = {f["microruta"]: f for f in informe["filas"]} if informe else {}
    grupos = {k: dict(v) for k, v in inventario.items()}
    for f in filas:
        k = f.get("grupo", "")
        if k not in grupos:
            _, nombre, _ = _grupo_de_ruta(f.get("ruta", ""), origen)
            grupos[k] = {"nombre": nombre, "ruta": k, "antes": False, "durante": False, "despues": False}
        if f.get("subcarpeta"):
            grupos[k][f["subcarpeta"].lower()] = True
    por_grupo = {}
    for f in filas:
        por_grupo.setdefault(f.get("grupo", ""), []).append(f)

    resultado = []
    for clave, carpeta in grupos.items():
        fotos = por_grupo.get(clave, [])
        nombre = carpeta["nombre"]
        match = _PATRON_CARPETA.fullmatch(nombre or "")
        # Nombre con texto pegado después de Qn (ej. "Z2CC0092_289_Q1NOVEDAD_POSOPERACION"): se toma
        # la microrruta del comienzo y se avisa.
        pegado = None if match else re.match(r"^(Z\d+CC\d+)[_-]([^_-]+)[_-](Q\d+)", nombre or "", re.IGNORECASE)
        partes = match or pegado
        microruta, lote, quincena = (partes.group(1), partes.group(2), partes.group(3).upper()) if partes else (
            "NO VERIFICABLE", "NO VERIFICABLE", "NO VERIFICABLE")
        novedades = []   # solo textos oficiales (novedades_oficiales.xlsx)
        avisos = []      # verificación pendiente que no es una novedad oficial
        pendientes = []  # novedades vistas que no están en la lista oficial: no cambian el AC

        def agregar_novedad(texto):
            if texto not in novedades:
                novedades.append(texto)

        por_momento = {s: [f for f in fotos if f.get("subcarpeta") == s] for s in SUBCARPETAS}
        fotos_ac = [f for f in fotos if f.get("subcarpeta") == "AC"]
        fotos_posop = [f for f in fotos if f.get("subcarpeta") == "POSOPERACION"]
        # Las fotos de posoperación se toman después: no cuentan para fechas de ejecución.
        fotos_ejec = [f for f in fotos if f.get("subcarpeta") != "POSOPERACION"]
        prog = programadas.get(str(microruta).upper())
        observaciones = [
            f"Carpeta: {nombre}; fotografías encontradas: {len(fotos)}.",
            "Subcarpetas " + "; ".join(
                f"{s.replace('DESPUES', 'DESPUÉS')}: {'SÍ' if carpeta.get(s.lower()) else 'NO'}"
                f" ({len(por_momento[s])} fotos)" for s in SUBCARPETAS)
            + f"; AC: {len(fotos_ac)} fotos" + (f"; POSOPERACIÓN: {len(fotos_posop)} fotos" if fotos_posop else "")
            + ".",
        ]
        if prog and prog["observacion"].strip(" -"):
            observaciones.insert(0, f"Informe Emvarias: {prog['observacion'].strip(' -')}.")
        no_verificable = False
        incumplimiento = False

        if pegado:
            avisos.append(f"Nombre de carpeta mal escrito ({nombre}): se tomó como {microruta}.")
            no_verificable = True
        elif not match:
            avisos.append("Nombre de carpeta fuera del patrón MICRORRUTA_LOTE_Qn.")
            no_verificable = True
        no_ejecutada = sorted(_novedades_del_informe(prog)[0] & set(NOVEDADES_OFICIALES)) if prog else []
        sueltas = [f for f in fotos if not f.get("subcarpeta")]
        orden_publico = bool(prog and "orden_publico" in no_ejecutada
                             and "SIN REGISTRO" in _sin_tildes(prog["observacion"]))
        if not any(por_momento.values()) and orden_publico:
            # Por orden público no se pueden tomar fotos: SN con el texto oficial.
            agregar_novedad(OFICIAL_ORDEN_PUBLICO_SIN_REGISTRO)
            observaciones.append("Sin fotos: el informe lo justifica por orden público.")
        elif not any(por_momento.values()) and no_ejecutada and fotos:
            for clave_novedad in no_ejecutada:
                agregar_novedad(OFICIAL_ORDEN_PUBLICO_SIN_REGISTRO
                                if clave_novedad == "orden_publico"
                                and "SIN REGISTRO" in _sin_tildes(prog["observacion"])
                                else NOVEDADES_OFICIALES[clave_novedad])
            observaciones.append(f"Evidencia de la novedad que reporta el informe: {len(fotos)} "
                                 "foto(s) sin ANTES/DURANTE/DESPUÉS. Confirmar con las fotos.")
        elif not any(por_momento.values()):
            agregar_novedad(OFICIAL_SIN_TRES_MOMENTOS)
            incumplimiento = True
            if fotos:
                avisos.append(f"{len(fotos)} fotografía(s) fuera de ANTES, DURANTE y DESPUÉS.")
        else:
            if sueltas:
                observaciones.append(f"{len(sueltas)} foto(s) fuera de ANTES, DURANTE, DESPUES, AC y "
                                     "NOVEDAD_POSOPERACION (ej. carpeta PQR): revisar a mano.")
            for sub, momento in MOMENTOS.items():
                if not por_momento[sub] and orden_publico:
                    agregar_novedad(OFICIAL_ORDEN_PUBLICO_SIN_REGISTRO)
                    observaciones.append(f"Sin registro del {momento}: el informe lo justifica por orden público.")
                elif not por_momento[sub]:
                    agregar_novedad(OFICIAL_SIN_REGISTRO.format(momento))
                    incumplimiento = True
            if not fotos_ac:
                agregar_novedad(OFICIAL_SIN_AC)
                no_verificable = True
        if prog and _clave_lote(prog["lote"]) != _clave_lote(lote):
            avisos.append(f"El lote de la carpeta ({lote}) no coincide con el del informe ({prog['lote']}).")
            no_verificable = True

        for sub in SUBCARPETAS:
            for foto in por_momento[sub]:
                estado_visible = (unicodedata.normalize("NFKD", str(foto.get("estado", "")))
                                  .encode("ascii", "ignore").decode().strip().casefold())
                if estado_visible in ("antes", "durante", "despues") and estado_visible != sub.lower():
                    avisos.append(
                        f"La foto {foto.get('archivo', '')} está en {sub} "
                        f"pero visualmente indica estado {estado_visible.upper()}.")
                    no_verificable = True

        antes, despues = por_momento["ANTES"], por_momento["DESPUES"]
        mediciones_antes = [f.get("medicion_cesped_cm") for f in antes
                            if f.get("foto_metro_visible") and isinstance(f.get("medicion_cesped_cm"), (int, float))]
        mediciones_despues = [f.get("medicion_cesped_cm") for f in despues
                              if f.get("foto_metro_visible") and isinstance(f.get("medicion_cesped_cm"), (int, float))]
        # Altura del metro: por ahora la revisa una persona; no saca novedad ni cambia el AC
        # (pedido del usuario, 20-oct-2026). OFICIAL_ALTURA queda para cuando se vuelva a usar.
        for sub, momento_fotos, minimo in (("ANTES", antes, 9), ("DESPUÉS", despues, 2)):
            lecturas = mediciones_antes if sub == "ANTES" else mediciones_despues
            if not momento_fotos:
                continue
            if not lecturas:
                observaciones.append(f"Altura {sub} (revisión manual): metro sin lectura clara.")
            else:
                cumple = (max(lecturas) >= minimo) if sub == "ANTES" else (min(lecturas) >= minimo)
                modelos = sorted({f.get("metro_modelo") for f in momento_fotos if f.get("metro_modelo")})
                observaciones.append(f"Altura {sub} (revisión manual"
                                     + (f", metro leído con {', '.join(modelos)}" if modelos else "")
                                     + f"): lecturas {lecturas} cm; "
                                     + ("cumple" if cumple else "NO cumple") + f" mínimo {minimo} cm.")

        fechas = sorted({str(f.get("fecha", "")).strip() for f in fotos_ejec
                         if f.get("fecha") and str(f.get("fecha")).strip().casefold() != "no verificable"})
        if fechas:
            fecha = "; ".join(fechas)
        else:
            fecha = "NO VERIFICABLE"
        fechas_faltantes = [f for f in fotos_ejec
                            if not f.get("fecha") or str(f.get("fecha")).strip().casefold() == "no verificable"]
        if fechas_faltantes:
            avisos.append(f"Fecha visible ausente o no legible en {len(fechas_faltantes)} fotografía(s).")
            no_verificable = True
        if prog and prog["fechas"]:
            fechas_durante = {str(f.get("fecha", "")).strip() for f in por_momento["DURANTE"] if f.get("fecha")}
            fuera_informe = sorted(fechas_durante - prog["fechas"] - {"NO VERIFICABLE"})
            if fuera_informe:
                agregar_novedad(OFICIAL_FECHA_DURANTE_INFORME)
                observaciones.append(f"DURANTE: fechas {', '.join(fuera_informe)}; el informe dice "
                                     f"{prog['fecha']}.")
                no_verificable = True
        # El DESPUÉS puede tomarse hasta DIAS_GRACIA_DESPUES días después de terminar la quincena
        # sin novedad (usuario, 21-oct-2026). Los demás momentos y el AC no tienen gracia.
        def fechas_de(lista):
            return {str(f.get("fecha", "")).strip() for f in lista
                    if f.get("fecha") and str(f.get("fecha")).strip().casefold() != "no verificable"}
        fechas_despues = fechas_de(por_momento["DESPUES"])
        fechas_resto = fechas_de([f for f in fotos_ejec if f.get("subcarpeta") != "DESPUES"])
        fuera_despues = _fechas_fuera_de_quincena(sorted(fechas_despues), quincena)
        en_gracia = sorted(d for d in fuera_despues if _en_gracia(d, quincena) and d not in fechas_resto)
        distintas = [d for d in fechas if d not in en_gracia]
        if len(distintas) > 1:
            avisos.append(f"Se encontraron fechas visibles diferentes: {', '.join(distintas)}.")
        if en_gracia:
            observaciones.append(f"DESPUÉS con fecha {', '.join(en_gracia)}: dentro de los {DIAS_GRACIA_DESPUES} "
                                 "días de gracia después de la quincena, no es novedad.")
        fuera_quincena = sorted(set(_fechas_fuera_de_quincena(sorted(fechas_resto), quincena))
                                | (set(fuera_despues) - set(en_gracia)), key=lambda d: d[6:] + d[3:5] + d[:2])
        if fuera_quincena:
            agregar_novedad(OFICIAL_FECHA_PERIODO)
            observaciones.append(
                f"Fechas fuera de la quincena {quincena} ({', '.join(fuera_quincena)}): posible adelanto "
                "de ejecución o periodo anterior. Verificar programación.")
            no_verificable = True

        vistas = {k for f in fotos for k in novedades_foto(f) if k in PALABRAS_NOVEDAD}
        if prog:
            reportadas, reporta = _novedades_del_informe(prog)
            nombres = lambda claves: ", ".join(NOVEDADES_VISIBLES[k] for k in sorted(claves))
            if reporta and not fotos_posop and not sueltas and not orden_publico:
                observaciones.append("OBSERVACIÓN: el informe reporta novedad pero la carpeta no trae "
                                     "NOVEDAD_POSOPERACION con la evidencia.")
            if reportadas - vistas:
                observaciones.append(f"OBSERVACIÓN: el informe reporta {nombres(reportadas - vistas)} "
                                     "y no se ve en las fotos.")
            if vistas - reportadas:
                observaciones.append(f"OBSERVACIÓN: las fotos muestran {nombres(vistas - reportadas)} "
                                     "y el informe no lo reporta.")
            if fotos_posop and not reporta:
                observaciones.append("OBSERVACIÓN: la carpeta trae NOVEDAD_POSOPERACION y el informe "
                                     "no reporta novedad.")

        del_informe = _novedades_del_informe(prog)[0] if prog else set()
        for clave_novedad, etiqueta in NOVEDADES_VISIBLES.items():
            con_novedad = [f for f in fotos if clave_novedad in novedades_foto(f)]
            if con_novedad:
                # ";" separa novedades en la columna NOVEDAD: no puede ir dentro del detalle.
                detalles = sorted({str(f.get("detalle_novedad", "")).replace(";", ",").strip()
                                   for f in con_novedad if str(f.get("detalle_novedad", "")).strip()})
                detalle = (f"{etiqueta}: visible en {len(con_novedad)} fotografía(s)"
                           + (f" ({' / '.join(detalles[:3])})" if detalles else ""))
                # Novedad de no ejecución (cerramiento, cobertura, orden público): solo si el informe la
                # reporta o la muestra al menos el 80 % de las fotos; si no, es una posible falsa alarma.
                aplica = clave_novedad in NOVEDADES_OFICIALES and (
                    clave_novedad in del_informe or len(con_novedad) >= PORCENTAJE_MINIMO * len(fotos))
                if aplica and all(por_momento.values()):
                    # Tiene ANTES, DURANTE y DESPUÉS: se ejecutó (ej. cerramiento solo en una parte del
                    # lote). No es "no ejecutada"; se comprueba que el césped quedó cortado.
                    cortes = [m for m in mediciones_despues if m < 9]
                    texto = (f"{etiqueta} en parte del lote ({len(con_novedad)} foto(s)): la microrruta sí se "
                             "ejecutó (tiene ANTES, DURANTE y DESPUÉS); no se saca "
                             f"«{NOVEDADES_OFICIALES[clave_novedad]}»")
                    if cortes:
                        observaciones.append(f"{texto}. Césped cortado según el metro del DESPUÉS: {cortes} cm.")
                    else:
                        observaciones.append(texto + ".")
                        avisos.append("Confirmar en las fotos del DESPUÉS que el césped fuera del "
                                      f"{etiqueta.lower()} quedó cortado.")
                        no_verificable = True
                elif aplica:
                    agregar_novedad(NOVEDADES_OFICIALES[clave_novedad])
                    observaciones.append(f"Posible novedad - {detalle}. Confirmar y aplicar descuento si corresponde.")
                    no_verificable = True
                elif clave_novedad in NOVEDADES_OFICIALES:
                    observaciones.append(f"{detalle} de {len(fotos)}: menos del 80 % y el informe no la "
                                         "reporta, no se saca novedad.")
                else:
                    pendientes.append(f"PENDIENTE DE REVISIÓN (novedad no oficial) - {detalle}.")
        horas_faltantes = [f for f in fotos_ejec
                           if not f.get("hora") or str(f.get("hora")).strip().casefold() == "no verificable"]
        if horas_faltantes:
            avisos.append(f"Fecha/hora no visible o no legible en {len(horas_faltantes)} fotografía(s).")
            no_verificable = True

        todas_movidas = bool(fotos_ejec) and all(f.get("legible") is False for f in fotos_ejec)
        if todas_movidas:
            avisos.append("Todas las fotos de la carpeta están movidas o ilegibles: no se saca "
                          "novedad de foto movida; revisar a mano.")
            no_verificable = True
        for sub, momento in MOMENTOS.items():
            total = len(por_momento[sub])
            sin_coordenadas = [f for f in por_momento[sub] if f.get("coordenadas_visibles") is not True]
            if sin_coordenadas:
                texto = (f"{sub}: coordenadas no visibles o no legibles en {len(sin_coordenadas)} "
                         f"de {total} fotografía(s).")
                if total - len(sin_coordenadas) < PORCENTAJE_MINIMO * total:
                    agregar_novedad(OFICIAL_SIN_COORDENADAS.format(momento))
                    no_verificable = True
                else:
                    texto += " Al menos el 80 % tiene coordenadas: no es novedad."
                observaciones.append(texto)
            borrosas = [f for f in por_momento[sub] if f.get("legible") is False]
            if borrosas and not todas_movidas:
                texto = f"{sub}: {len(borrosas)} de {total} fotografía(s) borrosa(s) o con la marca ilegible."
                if total - len(borrosas) >= PORCENTAJE_MINIMO * total:
                    observaciones.append(texto + " Al menos el 80 % está bien: no es novedad.")
                elif sub in ("DURANTE", "DESPUES"):
                    agregar_novedad(OFICIAL_DESENFOCADO.format(momento))
                    observaciones.append(texto)
                    no_verificable = True
                else:
                    avisos.append(texto)
                    no_verificable = True
        for sub, momento in MOMENTOS.items():
            del_momento = por_momento[sub]
            if not del_momento:
                continue
            sin_marca = [f for f in del_momento if not str(f.get("texto_marca", "")).strip()
                         or str(f.get("texto_marca")).strip().casefold() == "no verificable"]
            if sin_marca:
                avisos.append(f"{sub}: {len(sin_marca)} fotografía(s) sin marca de agua legible.")
                no_verificable = True
            if not any(f.get("fecha") and str(f.get("fecha")).strip().casefold() != "no verificable"
                       for f in del_momento):
                avisos.append(f"{sub}: ninguna foto muestra la fecha.")
                no_verificable = True
            puntos = {(c["lat"], c["lon"]) for f in del_momento
                      if isinstance(c := f.get("coordenadas_marca"), dict)
                      and isinstance(c.get("lat"), (int, float)) and isinstance(c.get("lon"), (int, float))}
            if len(del_momento) >= 2 and puntos:
                extension = _extension_m(puntos)
                if extension < DISTRIBUCION_MIN_M:
                    avisos.append(
                        f"{sub}: las {len(del_momento)} fotos están en el mismo sitio (menos de "
                        f"{DISTRIBUCION_MIN_M} m entre ellas); posible novedad "
                        f"\"{OFICIAL_NO_ABARCA.format(momento)}\"")
                    no_verificable = True
                else:
                    observaciones.append(f"{sub}: fotos repartidas en unos {extension:,.0f} m.")
        if fotos and all(f.get("coordenadas_visibles") is True for f in fotos):
            observaciones.append("Coordenadas visibles en todas las fotografías.")
        if fotos and all(f.get("fecha") and f.get("hora") for f in fotos):
            observaciones.append("Fecha y hora visibles en todas las fotografías.")

        def valores_campo(campo):
            return sorted({
                str(f.get(campo, "")).strip() for f in fotos
                if str(f.get(campo, "")).strip()
                and str(f.get(campo, "")).strip().casefold() != "no verificable"
            })

        def valor_unico_o_no_verificable(campo, etiqueta):
            nonlocal no_verificable
            valores = valores_campo(campo)
            if not valores:
                avisos.append(f"NO VERIFICABLE: {etiqueta} no aparece legible en las fotos.")
                no_verificable = True
                return "NO VERIFICABLE"
            if len(valores) > 1:
                avisos.append(f"Valores distintos de {etiqueta}: {', '.join(valores)}.")
                no_verificable = True
                return "; ".join(valores)
            return valores[0]

        if prog:
            # Cuadrilla y área salen del informe; las fotos solo se usan para compararlas.
            cuadrilla, area = prog["cuadrilla"], prog["area"]
            en_fotos = valores_campo("cuadrilla")
            if en_fotos and any(re.sub(r"\D", "", v) != _clave_lote(cuadrilla) for v in en_fotos):
                avisos.append(f"Cuadrilla en las fotos ({', '.join(en_fotos)}) distinta a la del "
                              f"informe ({cuadrilla}).")
                no_verificable = True
        else:
            cuadrilla = valor_unico_o_no_verificable("cuadrilla", "CUADRILLA")
            area = valor_unico_o_no_verificable("area_m2", "AREA m2")
        # El formato LOTES EJECUTADOS no tiene SIG INTERVENT: si se lee, queda como dato.
        if valores_campo("sig_intervent"):
            observaciones.append(f"SIG INTERVENT en fotos: {', '.join(valores_campo('sig_intervent'))}.")
        # Sin informe, la dirección es la más repetida en las marcas de agua.
        conteo_dir = {}
        for f in fotos_ejec:
            d = direccion_formato(f.get("direccion")) if f.get("direccion") else ""
            if d and d != "SIN DIRECCION EN LA MARCA":
                conteo_dir[d] = conteo_dir.get(d, 0) + 1
        direccion = prog["direccion"] if prog else max(conteo_dir, key=conteo_dir.get) if conteo_dir else ""
        if prog:
            if fechas and set(fechas) != prog["fechas"]:
                observaciones.append(f"Fechas en las fotos: {', '.join(fechas)}.")
            fecha = prog["fecha"]
        elif fechas:
            fecha = " ".join(fechas)

        if any(f.get("error") for f in fotos):
            avisos.append("Una o más fotografías no pudieron leerse con OCR.")
            no_verificable = True
        if not any(por_momento.values()):
            ac = "N/A"  # carpeta sin fotos de los tres momentos
        else:
            ac = "NO" if incumplimiento else "NO VERIFICABLE" if no_verificable or novedades or avisos else "SI"
        novedad = "; ".join(novedades) if novedades else "SN"
        if avisos:
            observaciones.append("REVISAR: " + " ".join(avisos))
        observaciones.extend(pendientes)
        resultado.append({
            "microruta": microruta, "lote": prog["lote"] if prog else lote,
            "nombre": prog["nombre"] if prog else "", "direccion": direccion,
            "quincena": quincena, "fecha": fecha, "cuadrilla": cuadrilla, "area": area,
            "observaciones": " ".join(observaciones), "novedad": novedad, "ac": ac,
            "observacion_informe": prog["observacion"].strip(" -") if prog else "",
        })
    return ordenar_con_informe(resultado, informe) if informe else resultado


def generar_excel(salida, filas, revision_manual=(), informe=None):
    """Hoja REPORTE con el formato LOTES EJECUTADOS: título en la fila 2, período en la 3,
    encabezados en la 5 y la fila de total al final."""
    wb = Workbook()
    ws = wb.active
    ws.title = "REPORTE"
    total_columnas = len(COLUMNAS_REPORTE)
    titulo = (informe or {}).get("titulo") or f"LOTES EJECUTADOS {CONTRATO}"
    periodo = (informe or {}).get("periodo") or periodo_de_filas(filas)
    for fila_idx, texto in ((2, titulo), (3, periodo)):
        ws.merge_cells(start_row=fila_idx, start_column=1, end_row=fila_idx, end_column=total_columnas)
        c = ws.cell(row=fila_idx, column=1, value=texto)
        c.font, c.alignment = Font(name="Calibri", size=12, bold=True), CENTRO
    for i, (encabezado_texto, ancho) in enumerate(COLUMNAS_REPORTE, 1):
        c = ws.cell(row=5, column=i, value=encabezado_texto)
        c.font, c.fill, c.alignment, c.border = F_TITULO, PatternFill("solid", fgColor=AZUL), CENTRO, BORDE
        ws.column_dimensions[get_column_letter(i)].width = ancho
    for fila_idx, fila in enumerate(filas, 6):
        valores = [fila["microruta"], fila["lote"], fila.get("nombre", ""), fila.get("direccion", ""),
                   fila["fecha"], fila["cuadrilla"], fila["area"], fila.get("observacion_informe", ""),
                   fila["novedad"], fila["ac"], fila["observaciones"]]
        for col_idx, valor in enumerate(valores, 1):
            c = ws.cell(row=fila_idx, column=col_idx, value=valor)
            c.font, c.border = F_NORMAL, BORDE
            c.alignment = CENTRO if col_idx in (1, 2, 5, 6, 7, 10) else IZQ
            if col_idx == 7 and isinstance(valor, (int, float)):
                c.number_format = "#,##0"
    total = len(filas) + 6
    ws.merge_cells(start_row=total, start_column=1, end_row=total, end_column=6)
    ws.cell(row=total, column=1, value="TOTAL REPORTE EMVARIAS S.A E.S.P")
    c = ws.cell(row=total, column=7, value=sum(f["area"] for f in filas
                                                if isinstance(f["area"], (int, float))))
    c.number_format = "#,##0"
    for col_idx in range(1, total_columnas + 1):
        c = ws.cell(row=total, column=col_idx)
        c.font, c.border, c.alignment = Font(name="Calibri", size=11, bold=True), BORDE, CENTRO
    ws.freeze_panes = "A6"
    ws.auto_filter.ref = f"A5:{get_column_letter(total_columnas)}{max(5, len(filas) + 5)}"
    ws.sheet_view.showGridLines = False

    wr = wb.create_sheet("REVISION MANUAL")
    columnas_revision = [
        ("MICRORRUTA / CARPETA", 28), ("LOTE", 12), ("QUINCENA", 12),
        ("SUBCARPETA", 16), ("ARCHIVO", 46), ("FECHA", 16), ("HORA", 14),
        ("LATITUD", 13), ("LONGITUD", 13), ("COORDENADAS", 24), ("DIRECCION", 26),
        ("MOTIVO", 70), ("TEXTO OCR", 70),
        ("FECHA/HORA CONFIRMADA", 22), ("COORDENADAS CONFIRMADAS", 24),
        ("MEDICIÓN VISUAL cm", 20), ("CUMPLE UMBRAL", 18), ("REVISIÓN MANUAL", 20),
        ("REVISADO POR", 24),
    ]
    encabezado(wr, columnas_revision)
    primera_manual = 14# desde FECHA/HORA CONFIRMADA las celdas las llena el revisor
    for row_idx, revision in enumerate(revision_manual, 2):
        valores = [revision["carpeta"], revision["lote"], revision["quincena"],
                   revision["subcarpeta"], revision["archivo"], revision["fecha"],
                   revision["hora"], revision["latitud"], revision["longitud"],
                   revision["coordenadas"], revision["direccion"],
                   revision["motivo"], revision["texto_ocr"], "", "", "", "", "", ""]
        for col_idx, valor in enumerate(valores, 1):
            c = wr.cell(row=row_idx, column=col_idx, value=valor)
            c.font, c.border = F_NORMAL, BORDE
            c.alignment = CENTRO if 6 <= col_idx <= 10 else IZQ
            if col_idx >= primera_manual:
                c.fill = PatternFill("solid", fgColor="FFF2CC")
    ultima = len(revision_manual) + 1
    if revision_manual:
        opciones = DataValidation(type="list", formula1='"SI,NO,NO VERIFICABLE"',
                                  allow_blank=True)
        wr.add_data_validation(opciones)
        for columna in ("N", "O", "Q"):
            opciones.add(f"{columna}2:{columna}{ultima}")
        medicion = DataValidation(type="decimal", operator="greaterThanOrEqual",
                                  formula1="0", allow_blank=True)
        wr.add_data_validation(medicion)
        medicion.add(f"P2:P{ultima}")
        resultado = DataValidation(type="list", formula1='"CONFORME,NO CONFORME,PENDIENTE"',
                                   allow_blank=True)
        wr.add_data_validation(resultado)
        resultado.add(f"R2:R{ultima}")
    wr.auto_filter.ref = f"A1:{get_column_letter(len(columnas_revision))}{max(1, ultima)}"
    wr.sheet_view.showGridLines = False
    try:
        wb.save(salida)
    except PermissionError:
        salida = os.path.splitext(salida)[0] + f"_{datetime.now():%H%M%S}.xlsx"
        print(f"El Excel estaba abierto; se guardó como {salida}")
        wb.save(salida)
    return salida


def _limpio(v):
    return unicodedata.normalize("NFC", str(v)).strip() if v is not None else ""


def _guardar_checkpoint(ruta, datos, ruta_recuperacion=None):
    def guardar_atomico(destino):
        directorio = os.path.dirname(os.path.abspath(destino))
        descriptor, temporal = tempfile.mkstemp(
            prefix=f".{os.path.basename(destino)}.",
            suffix=".tmp",
            dir=directorio,
        )
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as archivo:
                json.dump(datos, archivo, ensure_ascii=False, indent=2)
                archivo.write("\n")
                archivo.flush()
                os.fsync(archivo.fileno())
            for intento in range(4):
                try:
                    os.replace(temporal, destino)
                    return
                except PermissionError:
                    if intento == 3:
                        raise
                    time.sleep(0.2 * (intento + 1))
        finally:
            try:
                os.remove(temporal)
            except FileNotFoundError:
                pass

    try:
        guardar_atomico(ruta)
        return ruta
    except PermissionError as error_principal:
        recuperacion = ruta_recuperacion or f"{os.path.splitext(ruta)[0]}_recuperacion.json"
        try:
            guardar_atomico(recuperacion)
        except OSError as error_recuperacion:
            raise OSError(
                f"No se pudo guardar el checkpoint en '{ruta}' ni en '{recuperacion}'. "
                "Cierra cualquier proceso que esté usando esos archivos y vuelve a ejecutar "
                "el mismo comando; la caché OCR se conserva. "
                f"Error principal: {error_principal}; error de recuperación: {error_recuperacion}"
            ) from error_recuperacion
        return recuperacion


def _leer_checkpoint(rutas):
    checkpoints = []
    for ruta in rutas:
        try:
            with open(ruta, encoding="utf-8") as archivo:
                datos = json.load(archivo)
        except FileNotFoundError:
            continue
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Aviso: no se pudo leer el punto de reanudación {ruta}: {exc}", flush=True)
            continue
        checkpoints.append((str(datos.get("actualizado", "")), datos, ruta))
    return max(checkpoints, default=("", None, ""), key=lambda item: item[0])


# --------------------------------------------------------------------------------------
# Programa principal
# --------------------------------------------------------------------------------------
def main():
    inicio = datetime.now()
    try:
        sys.stdout.reconfigure(errors="replace")
    except AttributeError:
        pass
    ap = argparse.ArgumentParser(description="Auditoría de evidencias fotográficas con Claude")
    ap.add_argument("zip", help="Archivo .zip o carpeta con las carpetas de microruta")
    ap.add_argument("--salida", help="Ruta del Excel")
    ap.add_argument("--prueba", type=int, help="Solo las primeras N fotos")
    ap.add_argument("--claude-auth", choices=("plan", "api"), default="plan",
                    help="Autenticación de Claude Code con plan o API de Anthropic")
    ap.add_argument("--modelo",
                    help="Modelo de Claude (por defecto: sonnet para plan y claude-sonnet-4-5 para API)")
    ap.add_argument("--lote", type=int, default=8,
                    help="Cantidad de fotos por solicitud a Claude (por defecto: 8)")
    ap.add_argument("--paralelo", type=int, default=3,
                    help="Lotes enviados a Claude al mismo tiempo (por defecto: 3; usa 1 si "
                         "tu plan alcanza el límite de uso muy rápido)")
    ap.add_argument("--batch", action="store_true",
                    help="Solo con --claude-auth api: usar la Batch API (50 %% más barata, "
                         "resultados normalmente en menos de 1 h, máximo 24 h)")
    ap.add_argument("--claude-exe", help="Ruta a claude.exe si no está en PATH")
    ap.add_argument("--avance", action="store_true",
                    help="Solo mostrar cuántas fotos ya están analizadas y generar un Excel parcial "
                         "con las carpetas completas, sin llamar a Claude")
    ap.add_argument("--informe",
                    help="Excel LOTES EJECUTADOS de Emvarias: el reporte sale con todas sus "
                         "microrrutas de la cuadrilla, en su orden y con su nombre, dirección y área")
    ap.add_argument("--cuadrilla", type=int,
                    help="Cuadrilla del ZIP (por defecto se toma del nombre: C10.zip -> 10)")
    ap.add_argument("--metro", metavar="MODELO",
                    help="Segunda pasada: volver a leer SOLO las fotos del metro (ANTES/DESPUÉS) con "
                         "otro modelo, ej. claude-sonnet-5-5. Usa la caché de --modelo.")
    ap.add_argument("--metro-max", type=int,
                    help="Con --metro: leer como máximo N fotos (para probar)")
    ap.add_argument("--reiniciar", action="store_true",
                    help="Borrar la caché y el punto de reanudación de esta autenticación/modelo")
    ap.add_argument("--sin-enderezar", action="store_true",
                    help="No girar las fotos según su marca de agua (solo se usa la orientación EXIF)")
    args = ap.parse_args()
    ENDEREZAR["activo"] = not args.sin_enderezar
    if args.lote < 1:
        ap.error("--lote debe ser mayor que cero")
    if args.paralelo < 1:
        ap.error("--paralelo debe ser mayor que cero")
    if args.prueba is not None and args.prueba < 1:
        ap.error("--prueba debe ser mayor que cero")
    if args.metro and (args.claude_auth != "plan" or args.avance or args.reiniciar):
        ap.error("--metro funciona solo con --claude-auth plan, sin --avance ni --reiniciar")
    if args.batch and args.claude_auth != "api":
        ap.error("--batch solo funciona con --claude-auth api")

    base = os.path.splitext(args.zip.rstrip("\\/"))[0]
    salida = args.salida or os.path.join(CARPETA_SALIDAS, f"{os.path.basename(base)}_zonas_verdes.xlsx")
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    modelo = args.modelo or ("sonnet" if args.claude_auth == "plan" else "claude-sonnet-4-5")
    sufijo_modelo = re.sub(r"[^A-Za-z0-9_.-]+", "_", modelo)
    prefijo = f"{base}_claude_{args.claude_auth}_{sufijo_modelo}"
    progreso = f"{prefijo}_cache.jsonl"
    checkpoint = f"{prefijo}_progreso.json"
    checkpoint_recuperacion = f"{prefijo}_progreso_recuperacion.json"
    ruta_estado_batch = f"{prefijo}_batches.json"

    fotos = listar_fotos(args.zip)
    inventario = carpetas_de_entrada(args.zip)
    informe = None
    if args.informe:
        cuadrilla = args.cuadrilla if args.cuadrilla is not None else cuadrillas_de_entrada(base, inventario)
        informe = leer_informe(args.informe, cuadrilla)
        print(f"Informe: {len(informe['filas'])} microrrutas programadas"
              + (f" para la(s) cuadrilla(s) {cuadrilla}" if cuadrilla is not None else "")
              + f" (de {informe['total']} en el archivo).", flush=True)
    if not fotos and not inventario:
        sys.exit("No se encontraron carpetas de microruta ni fotografías.")
    if args.prueba is not None:
        fotos = fotos[:args.prueba]
        grupos_muestra = {grupo for _, grupo, _ in fotos}
        inventario = {k: v for k, v in inventario.items() if k in grupos_muestra}

    claude_exe = None
    cliente = None
    api_error_types = ()
    if args.avance:
        pass  # no se llama a Claude
    elif args.claude_auth == "plan":
        claude_exe = args.claude_exe or ruta_claude()
        if not claude_exe:
            sys.exit(
                "No se encontró Claude Code. Instálalo e inicia sesión con tu plan, "
                "o indica su ruta con --claude-exe."
            )
        print(f"Claude Code | autenticación: plan | modelo: {modelo}", flush=True)
    else:
        try:
            from anthropic import APIError, Anthropic
        except ImportError as exc:
            sys.exit(
                "Falta el SDK de Anthropic en este Python. Instálalo con "
                "'python -m pip install anthropic' y vuelve a ejecutar."
            )
        api_key = ANTHROPIC_API_KEY.strip() or os.environ.get("ANTHROPIC_API_KEY") or getpass.getpass(
            "Pega tu clave API de Anthropic (no se mostrará al escribir): "
        )
        if not api_key.strip():
            sys.exit("No se ingresó una clave API de Anthropic.")
        cliente = Anthropic(api_key=api_key.strip(), timeout=900, max_retries=2)
        del api_key
        api_error_types = (APIError,)
        print(f"API de Anthropic | modelo: {modelo}" + (" | Batch API" if args.batch else ""),
              flush=True)

    origen_normalizado = os.path.normcase(os.path.abspath(args.zip))
    limite_prueba = args.prueba or 0
    _, estado_anterior, checkpoint_existente = _leer_checkpoint(
        (checkpoint, checkpoint_recuperacion))
    checkpoint_destino = checkpoint_existente or checkpoint
    if args.reiniciar:
        for ruta_estado in (progreso, checkpoint):
            try:
                os.remove(ruta_estado)
            except FileNotFoundError:
                pass
        try:
            os.remove(checkpoint_recuperacion)
        except FileNotFoundError:
            pass
        estado_anterior = None
        checkpoint_destino = checkpoint
        if cliente is not None:
            for batch_id in leer_estado_batch(ruta_estado_batch)["batches"]:
                try:
                    cliente.messages.batches.cancel(batch_id)
                    print(f"Batch pendiente cancelado: {batch_id}", flush=True)
                except api_error_types:
                    pass
        try:
            os.remove(ruta_estado_batch)
        except FileNotFoundError:
            pass
    if (estado_anterior
            and estado_anterior.get("origen") == origen_normalizado
            and estado_anterior.get("total_fotos") == len(fotos)
            and estado_anterior.get("limite_prueba") == limite_prueba
            and estado_anterior.get("estado") != "completada"):
        print(
            "Se encontró una revisión interrumpida: "
            f"{estado_anterior.get('indice', '?')}/{len(fotos)} "
            f"({estado_anterior.get('archivo_actual', 'archivo no registrado')}). "
            "Se reconstruirá el Excel desde el inicio reutilizando la caché guardada.",
            flush=True,
        )

    cache = {}
    if os.path.exists(progreso):
        with open(progreso, encoding="utf-8") as fh:
            for linea in fh:
                try:
                    item = json.loads(linea)
                    cache[item["sha256"]] = item["resultado"]
                except (json.JSONDecodeError, KeyError, TypeError):
                    continue

    if cache:
        print(
            f"Resultados Claude en caché: {len(cache)} "
            "(se reutilizarán para las fotografías que coincidan).",
            flush=True,
        )

    if args.metro:
        segunda_pasada_metro(args, fotos, cache, base, claude_exe, args.metro_max)
        if CONTEO_GIROS["giradas"]:
            print(f"Orientación: se enderezaron {CONTEO_GIROS['giradas']} de "
                  f"{CONTEO_GIROS['revisadas']} fotografías del metro.", flush=True)
        return
    cargar_cache_metro(base, cache)
    if args.avance:
        mostrar_avance(fotos, cache, inventario, args.zip, salida, informe)
        return
    cache_inicial = len(cache)

    filas = []
    revisiones = []
    archivo_cache = open(progreso, "a", encoding="utf-8")
    aviso_checkpoint_alternativo = False
    archivo_sistema = None
    if args.claude_auth == "plan":
        archivo_temporal = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", suffix=".txt", prefix="zv_sistema_", delete=False)
        archivo_sistema = archivo_temporal.name
        try:
            archivo_temporal.write(SISTEMA)
        finally:
            archivo_temporal.close()

    lote_pendiente = []
    en_vuelo = {}     # futuro -> lote enviado a Claude
    en_espera = {}    # sha256 -> filas que esperan ese resultado (incluye copias exactas)

    estado_batch = leer_estado_batch(ruta_estado_batch) if args.batch else {"batches": {}}
    solicitudes_batch = []   # [(custom_id, lote)] preparadas pero aún no enviadas
    bytes_batch = [0]
    for solicitudes in estado_batch["batches"].values():
        for pares in solicitudes.values():
            for _, digest in pares:
                if digest not in cache:  # ya pagada en un batch anterior: no se reenvía
                    en_espera.setdefault(digest, [])
    if estado_batch["batches"]:
        print(f"Batches pendientes de una ejecución anterior: {len(estado_batch['batches'])} "
              "(sus fotos no se vuelven a enviar).", flush=True)

    def guardar_en_cache(digest, resultado):
        if digest not in cache:
            cache[digest] = resultado
            archivo_cache.write(json.dumps(
                {"sha256": digest, "resultado": resultado}, ensure_ascii=False) + "\n")
            archivo_cache.flush()

    def guardar_resultado(fila, resultado, digest):
        fila.update(resultado)
        fila["texto_ocr"] = resultado.get("texto_marca", "")
        fila["error"] = None
        guardar_en_cache(digest, resultado)
        revisiones.append((fila["num"], _fila_revision_manual(fila, motivos_revision(fila))))

    def consultar_claude(lote):
        """Corre en un hilo aparte: solo llama a Claude y valida; no escribe archivos."""
        datos_lote = [
            (elemento["fila"]["num"], elemento["fila"]["archivo"], elemento["imagenes"])
            for elemento in lote
        ]
        try:
            if args.claude_auth == "plan":
                resultados = analizar_plan(claude_exe, modelo, datos_lote, archivo_sistema)
            else:
                resultados = analizar_api(cliente, modelo, datos_lote)
        except api_error_types as exc:
            raise RuntimeError(
                f"Falló la solicitud a la API de Anthropic: {exc}. "
                "El avance previo está guardado; vuelve a ejecutar el mismo comando."
            ) from exc
        return validar_resultados(resultados, {elemento["fila"]["num"] for elemento in lote})

    def guardar_lote(lote, por_numero):
        for elemento in lote:
            resultado = por_numero[elemento["fila"]["num"]]
            for fila_espera in en_espera.pop(elemento["sha256"]):
                guardar_resultado(fila_espera, resultado, elemento["sha256"])

    def recoger(maximo_en_vuelo):
        """Guarda los lotes terminados y espera hasta que queden como mucho 'maximo_en_vuelo'."""
        while True:
            for futuro in [f for f in en_vuelo if f.done()]:
                guardar_lote(en_vuelo.pop(futuro), futuro.result())
            if len(en_vuelo) <= maximo_en_vuelo:
                return
            wait(en_vuelo, return_when=FIRST_COMPLETED)

    def enviar_batch():
        if not solicitudes_batch:
            return
        try:
            batch_id = crear_batch(cliente, modelo, [
                (custom_id, [(e["fila"]["num"], e["fila"]["archivo"], e["imagenes"]) for e in lote])
                for custom_id, lote in solicitudes_batch])
        except api_error_types as exc:
            raise RuntimeError(f"No se pudo crear el batch en la API de Anthropic: {exc}") from exc
        estado_batch["batches"][batch_id] = {
            custom_id: [[e["fila"]["num"], e["sha256"]] for e in lote]
            for custom_id, lote in solicitudes_batch}
        guardar_estado_batch(ruta_estado_batch, estado_batch)
        total = sum(len(lote) for _, lote in solicitudes_batch)
        print(f"Batch creado: {batch_id} ({len(solicitudes_batch)} solicitudes, {total} fotos).",
              flush=True)
        solicitudes_batch.clear()
        bytes_batch[0] = 0

    def esperar_batches():
        if not estado_batch["batches"]:
            return
        print("Esperando resultados de la Batch API (normalmente menos de 1 h). Puedes cerrar "
              "con Ctrl+C: al volver a ejecutar el mismo comando se recogen sin pagar de nuevo.",
              flush=True)
        while estado_batch["batches"]:
            en_proceso = 0
            for batch_id in list(estado_batch["batches"]):
                try:
                    batch = cliente.messages.batches.retrieve(batch_id)
                except api_error_types as exc:
                    raise RuntimeError(f"No se pudo consultar el batch {batch_id}: {exc}") from exc
                if batch.processing_status != "ended":
                    en_proceso += batch.request_counts.processing
                    continue
                solicitudes = estado_batch["batches"][batch_id]
                for custom_id, por_numero, motivo in resultados_batch(cliente, batch_id, solicitudes):
                    if por_numero is None:
                        print(f"Aviso: {custom_id} de {batch_id} sin resultado ({motivo}); esas "
                              "fotos se reenviarán en la próxima ejecución.", flush=True)
                        continue
                    for num, digest in solicitudes.get(custom_id, []):
                        guardar_en_cache(digest, por_numero[num])
                        for fila_espera in en_espera.pop(digest, []):
                            guardar_resultado(fila_espera, por_numero[num], digest)
                del estado_batch["batches"][batch_id]
                guardar_estado_batch(ruta_estado_batch, estado_batch)
                print(f"Batch terminado: {batch_id}", flush=True)
            if estado_batch["batches"]:
                print(f"{datetime.now():%H:%M} | batches pendientes: {len(estado_batch['batches'])}"
                      f" | solicitudes en proceso: {en_proceso}", flush=True)
                time.sleep(60)

    def enviar_lote():
        if not lote_pendiente:
            return
        if args.batch:
            lote = list(lote_pendiente)
            lote_pendiente.clear()
            tamano = sum(len(img) for e in lote for img in e["imagenes"].values()) * 4 // 3
            if bytes_batch[0] + tamano > BATCH_MAX_BYTES:
                enviar_batch()
            solicitudes_batch.append((f"lote-{len(solicitudes_batch):05d}", lote))
            bytes_batch[0] += tamano
            return
        recoger(args.paralelo - 1)
        lote = list(lote_pendiente)
        lote_pendiente.clear()
        en_vuelo[ejecutor.submit(consultar_claude, lote)] = lote

    ejecutor = ThreadPoolExecutor(max_workers=args.paralelo)
    try:
        for num, (ruta, grupo, abrir) in enumerate(fotos, 1):
            print(f"Revisando fotografía {num}/{len(fotos)}: {ruta}", flush=True)
            if num == 1 or num % 25 == 0:
                checkpoint_destino = _guardar_checkpoint(checkpoint_destino, {
                    "origen": origen_normalizado,
                    "limite_prueba": limite_prueba,
                    "total_fotos": len(fotos),
                    "indice": num,
                    "archivo_actual": ruta,
                    "estado": "en_proceso",
                    "actualizado": datetime.now().isoformat(timespec="seconds"),
                }, checkpoint_recuperacion)
            if checkpoint_destino == checkpoint_recuperacion and not aviso_checkpoint_alternativo:
                print(
                    f"Aviso: Windows bloqueó el checkpoint principal; guardando avance en "
                    f"{checkpoint_recuperacion}.",
                    flush=True,
                )
                aviso_checkpoint_alternativo = True
            _, nombre_carpeta, subcarpeta = _grupo_de_ruta(ruta, args.zip)
            fila = {
                "num": num, "archivo": os.path.basename(ruta), "ruta": ruta,
                "grupo": grupo, "carpeta": nombre_carpeta, "subcarpeta": subcarpeta,
                "fecha": "", "hora": "", "coordenadas_visibles": False, "cuadrilla": "",
                "area_m2": "", "sig_intervent": "", "foto_metro_visible": False,
                "medicion_cesped_cm": None, "texto_ocr": "", "confianza_ocr": 0,
                "legible": False, "error": None,
            }
            try:
                datos = _bytes(abrir)
            except (OSError, zipfile.BadZipFile, KeyError) as exc:
                fila["error"] = f"No se pudo leer la imagen: {exc}"
                filas.append(fila)
                revisiones.append((num, _fila_revision_manual(fila, fila["error"])))
                continue

            digest = hashlib.sha256(datos).hexdigest()
            fila["sha256"] = digest
            resultado_guardado = cache.get(digest)
            if resultado_guardado is not None:
                fila["origen_resultado"] = "cache"
                guardar_resultado(fila, resultado_guardado, digest)
                filas.append(fila)
                continue
            if digest in en_espera:  # copia exacta de una foto ya enviada: no se paga dos veces
                # Lista vacía = la foto va en un batch de una ejecución anterior.
                fila["origen_resultado"] = "copia" if en_espera[digest] else "claude"
                en_espera[digest].append(fila)
                filas.append(fila)
                continue
            try:
                imagenes = preparar_imagen(datos)
            except (OSError, ValueError) as exc:
                fila["error"] = f"No se pudo preparar la fotografía para Claude: {exc}"
                filas.append(fila)
                revisiones.append((num, _fila_revision_manual(fila, fila["error"])))
                continue
            filas.append(fila)
            fila["origen_resultado"] = "claude"
            en_espera[digest] = [fila]
            lote_pendiente.append({"fila": fila, "sha256": digest, "imagenes": imagenes})
            if len(lote_pendiente) >= args.lote:
                enviar_lote()
            if num % 25 == 0 or num == len(fotos):
                print(f"Claude: {num}/{len(fotos)} fotografías preparadas/procesadas.", flush=True)
        enviar_lote()
        if args.batch:
            enviar_batch()
            esperar_batches()
            for filas_sin_resultado in en_espera.values():
                for fila_espera in filas_sin_resultado:
                    fila_espera["error"] = ("Claude no devolvió resultado en el batch; vuelve a "
                                            "ejecutar el mismo comando para reenviarla.")
                    revisiones.append((fila_espera["num"],
                                       _fila_revision_manual(fila_espera, fila_espera["error"])))
        else:
            recoger(0)
    except KeyboardInterrupt:
        sys.exit(f"Interrumpido. Avance guardado: {len(cache)} fotografías en caché de {len(fotos)}; "
                 f"vuelve a ejecutar el mismo comando.\n"
                 f"Tiempo: {texto_tiempo(inicio, len(cache) - cache_inicial)}")
    except (LimiteAlcanzado, RuntimeError, OSError, ValueError) as exc:
        # Conserva en caché los lotes que sí terminaron antes de salir.
        ejecutor.shutdown(wait=True, cancel_futures=True)
        for futuro, lote in en_vuelo.items():
            if not futuro.cancelled() and futuro.exception() is None:
                guardar_lote(lote, futuro.result())
        sys.exit(f"Error durante la revisión con Claude: {exc}\n"
                 f"Avance guardado: {len(cache)} fotografías en caché de {len(fotos)}.\n"
                 f"Tiempo: {texto_tiempo(inicio, len(cache) - cache_inicial)}")
    finally:
        ejecutor.shutdown(wait=False, cancel_futures=True)
        archivo_cache.close()
        if archivo_sistema:
            try:
                os.remove(archivo_sistema)
            except FileNotFoundError:
                pass
    revisiones = [revision for _, revision in sorted(revisiones, key=lambda par: par[0])]

    # Copias exactas heredan la lectura OCR sin volver a procesar el contenido.
    originales = {}
    for fila in filas:
        digest = fila.get("sha256")
        if not digest:
            continue
        if digest in originales:
            for clave, valor in originales[digest].items():
                if clave not in ("num", "ruta", "archivo", "grupo", "carpeta", "subcarpeta",
                                 "resolucion", "sha256"):
                    fila.setdefault(clave, valor)
        elif not fila.get("error"):
            originales[digest] = fila

    reporte = consolidar_carpetas(filas, inventario, args.zip, informe)
    salida = generar_excel(salida, reporte, revisiones, informe)
    print(f"\nListo: {salida}")
    imprimir_resumen(filas, reporte, revisiones, inicio)
    if CONTEO_GIROS["revisadas"]:
        print(f"Orientación: {CONTEO_GIROS['giradas']} de {CONTEO_GIROS['revisadas']} fotografías "
              "nuevas venían giradas o al revés y se enderezaron antes de enviarlas a Claude.",
              flush=True)
    checkpoint_destino = _guardar_checkpoint(checkpoint_destino or checkpoint, {
        "origen": origen_normalizado,
        "limite_prueba": limite_prueba,
        "total_fotos": len(fotos),
        "indice": len(fotos),
        "archivo_actual": fotos[-1][0] if fotos else "",
        "estado": "completada",
        "excel": os.path.abspath(salida),
        "autenticacion": args.claude_auth,
        "modelo": modelo,
        "actualizado": datetime.now().isoformat(timespec="seconds"),
    }, checkpoint_recuperacion)
    print(f"  Caché Claude conservada: {progreso}")
    print(f"  Punto de reanudación: {checkpoint_destino}")


if __name__ == "__main__":
    main()
