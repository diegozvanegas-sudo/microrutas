"""Pega el trazo de las microrrutas al eje de las calles de OpenStreetMap (capas del mapa rápido).

    python tools/ajustar_a_calles.py [--lejos=M] <capa> [<capa> ...]      p. ej. python tools/ajustar_a_calles.py rutas_ryt rutas_lv
    python tools/ajustar_a_calles.py --lejos=35 barrido_dom barrido_manana barrido_tarde barrido_noche
--lejos: hasta cuántos metros se acepta el ajuste de un tramo (LEJOS_M). Los planos de barrido son de CAD ubicados por
los nombres de las calles (errores de hasta ~30 m) y son del centro, donde la calle más cercana sigue siendo la suya.

Los planos dibujan cada pasada a un lado de la vía (y a veces corrida unos metros): en el mapa salen líneas paralelas que
con el trazo grueso se vuelven manchas. Cada ruta se recorre cada PASO_M metros y cada punto se lleva al tramo de calle
más probable con un ajuste tipo HMM (Viterbi): cerca del punto, en la misma dirección de la ruta y sin saltar de una
calle a otra sin necesidad. Lo que no tiene calle a menos de RADIO_M (un parque, una vía que no está en OSM), o el
tramo que en promedio queda a más de LEJOS_M de la calle elegida (en lo rural el plano va lejos de la vía), queda como
venía. Inicio y fin se llevan a la calle más cercana.
Antes, si el plano viene corrido (la ruta entera cae lejos de las calles), se busca cuánto moverla (corrimiento()).
Al pasar de una calle a otra la línea sigue la red de calles (por_la_red()); si no hay camino razonable, sigue recta. Nada
del plano se quita: lo que no sigue ninguna calle queda como venía, aunque pise un edificio, y la ficha de la ruta lo avisa.
Guarda en "aj" el porcentaje de la ruta que quedó sobre calle, en "cr" los metros que se movió y en "pe" los metros que
pasan sobre edificios de OSM (si son al menos PISA_M). El trazo del plano no
se guarda (el archivo pesaría el doble en el celular): se vuelve a sacar de los planos con rutas_desde_geopdf.py, que
llama a este ajuste. Las calles y los edificios se descargan de OSM una vez y quedan en tools/.cache_osm_*.json (no se versionan).
--desde=<capa.js>: parte de ese archivo (el trazo del plano, sin ajustar) en vez de la capa publicada.
Necesita: pip install numpy shapely
"""
import heapq, json, os, re, sys, time, urllib.parse, urllib.request
import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, '..', 'public', 'data', 'rapido')
CACHE = os.path.join(AQUI, '.cache_osm_vias.json')
CACHE_EDIF = os.path.join(AQUI, '.cache_osm_edificios.json')
BBOX = '6.150,-75.710,6.360,-75.455'  # Medellín y alrededores (las rutas de LV y RyT)
TIPOS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|footway|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'
PASO_M, RADIO_M, CANDIDATOS = 5.0, 60.0, 10
GIRO_M, CAMBIO_M = 14.0, 8.0  # castigos (en metros) del ajuste: calle en otra dirección y saltar de una calle a otra
# Castigo por tipo de vía: en zona rural el plano va a 40-50 m de la vía y no debe quedarse en un camino de servicio
# Andenes y pasajes peatonales (footway): el barrido del centro pasa por ellos, pero las calles van primero
CASTIGO_VIA = {'service': 12.0, 'pedestrian': 6.0, 'footway': 15.0, 'living_street': 2.0}
TOL_M = 2.5
LEJOS_M = 20.0
CORRIDO_M, MAX_CORRIDO_M = 8.0, 400  # plano corrido: mediana a la calle desde la que se busca y hasta cuánto se mueve
RED_MAX_M, RED_FACTOR, RED_EXTRA_M = 300.0, 3.0, 60.0  # camino por la red entre dos puntos: largo máximo y frente a la línea recta
PISA_M = 10.0  # metros sobre edificios desde los que se avisa (menos es la diferencia normal entre el eje de la calle y el techo)
LAT0, LNG0 = 6.25, -75.57
KX, KY = 111320 * np.cos(np.radians(LAT0)), 110574

def a_m(lat, lng): return ((np.asarray(lng) - LNG0) * KX, (np.asarray(lat) - LAT0) * KY)
def a_ll(x, y): return (LAT0 + np.asarray(y) / KY, LNG0 + np.asarray(x) / KX)

def vias():
    if not os.path.exists(CACHE) or time.time() - os.path.getmtime(CACHE) > 60 * 86400:
        q = '[out:json][timeout:240];way["highway"~"^(%s)$"](%s);out tags geom;' % (TIPOS, BBOX)
        req = urllib.request.Request('https://overpass-api.de/api/interpreter', urllib.parse.urlencode({'data': q}).encode(),
                                     headers={'User-Agent': 'microrutas-interventoria'})
        datos = urllib.request.urlopen(req, timeout=300).read()
        open(CACHE, 'wb').write(datos)
    A, B, via, castigo, na, nb = [], [], [], [], [], []
    for w in json.load(open(CACHE, encoding='utf-8'))['elements']:
        g = w.get('geometry') or []
        if len(g) < 2: continue
        x, y = a_m([p['lat'] for p in g], [p['lon'] for p in g])
        for k in range(len(g) - 1):
            A.append((x[k], y[k])); B.append((x[k + 1], y[k + 1])); via.append(w['id']); castigo.append(CASTIGO_VIA.get(w['tags'].get('highway'), 0.0))
            na.append((g[k]['lat'], g[k]['lon'])); nb.append((g[k + 1]['lat'], g[k + 1]['lon']))
    A, B = np.array(A), np.array(B)
    castigo = np.array(castigo)
    # Red de calles: dos tramos se tocan si comparten un nodo de OSM
    ids, ady, NA, NB = {}, [], [], []
    for a, b, pa, pb in zip(na, nb, A, B):
        i, j = ids.setdefault(a, len(ids)), ids.setdefault(b, len(ids))
        while len(ady) <= max(i, j): ady.append([])
        L = float(np.hypot(*(pb - pa)))
        ady[i].append((j, L)); ady[j].append((i, L)); NA.append(i); NB.append(j)
    pos = np.zeros((len(ids), 2))
    pos[NA] = A; pos[NB] = B
    lineas = [LineString([a, b]) for a, b in zip(A, B)]
    # Solo calles (sin andenes, servicio ni peatonales): para saber si un plano viene corrido; un parque con senderos
    # no cuenta como "cerca de calle"
    calles = STRtree([l for l, c in zip(lineas, castigo) if c == 0])
    return {'A': A, 'B': B, 'via': np.array(via), 'castigo': castigo, 'arbol': STRtree(lineas), 'calles': calles,
            'NA': NA, 'NB': NB, 'ady': ady, 'pos': pos, 'edif': edificios()}

def edificios():
    """Árbol con los edificios de OSM (polígonos en metros)."""
    if not os.path.exists(CACHE_EDIF):
        q = '[out:json][timeout:280];way["building"](%s);out geom;' % BBOX
        req = urllib.request.Request('https://overpass-api.de/api/interpreter', urllib.parse.urlencode({'data': q}).encode(),
                                     headers={'User-Agent': 'microrutas-interventoria'})
        open(CACHE_EDIF, 'wb').write(urllib.request.urlopen(req, timeout=300).read())
    pols = []
    for w in json.load(open(CACHE_EDIF, encoding='utf-8'))['elements']:
        g = w.get('geometry') or []
        if len(g) < 4: continue
        x, y = a_m([p['lat'] for p in g], [p['lon'] for p in g])
        pol = Polygon(zip(x, y))
        if pol.is_valid and pol.area > 0: pols.append(pol)
    return {'pols': pols, 'arbol': STRtree(pols)}

def metros_en_edificios(V, pts):
    """Cuántos metros de la línea caen dentro de edificios."""
    if len(pts) < 2: return 0.0
    l = LineString(pts)
    return sum(l.intersection(V['edif']['pols'][k]).length for k in V['edif']['arbol'].query(l, predicate='intersects'))

def muestrear(pts):
    """Puntos cada PASO_M a lo largo de la línea (con sus extremos)."""
    l = LineString(pts)
    if l.length == 0: return np.array(pts[:1])
    d = np.append(np.arange(0, l.length, PASO_M), l.length)
    return np.array([l.interpolate(t).coords[0] for t in d])

def candidatos(V, p, dirr):
    idx = V['arbol'].query(Point(p).buffer(RADIO_M))
    if not len(idx): return []
    A, B = V['A'][idx], V['B'][idx]
    ab = B - A; L2 = (ab ** 2).sum(1); L2[L2 == 0] = 1e-9
    t = np.clip(((p - A) * ab).sum(1) / L2, 0, 1)
    q = A + ab * t[:, None]
    d = np.hypot(*(q - p).T)
    seno = np.abs(ab[:, 0] * dirr[1] - ab[:, 1] * dirr[0]) / np.sqrt(L2)
    e = d + GIRO_M * seno + V['castigo'][idx]
    ok = d <= RADIO_M
    orden = np.argsort(e)[:CANDIDATOS]
    return [(e[k], q[k], V['via'][idx[k]], idx[k]) for k in orden if ok[k]]

def ajustar_linea(V, pts, lejos=LEJOS_M):
    """[(x, y)] -> (corridas [(sobre_calle, puntos, elegidos o None)], puntos sobre calle, total de puntos)."""
    P = muestrear(pts)
    n = len(P)
    if n < 2: return [(False, P, None)], 0, n
    dirs = np.zeros_like(P)
    dirs[1:-1] = P[2:] - P[:-2]; dirs[0] = P[1] - P[0]; dirs[-1] = P[-1] - P[-2]
    nrm = np.hypot(*dirs.T); nrm[nrm == 0] = 1; dirs = dirs / nrm[:, None]
    cand = [candidatos(V, P[i], dirs[i]) for i in range(n)]
    corridas, sobre = [], 0
    def libre(q):
        if corridas and not corridas[-1][0]: corridas[-1] = (False, np.vstack([corridas[-1][1], q]), None)
        else: corridas.append((False, np.asarray(q), None))
    i = 0
    while i < n:
        if not cand[i]: libre(P[i:i + 1]); i += 1; continue
        # Tramo seguido con calle cerca: Viterbi
        j = i
        while j < n and cand[j]: j += 1
        costo = [np.array([c[0] for c in cand[i]])]; atras = [None]
        for k in range(i + 1, j):
            paso = np.hypot(*(P[k] - P[k - 1]))
            prev, cur = cand[k - 1], cand[k]
            M = np.empty((len(prev), len(cur)))
            for a, ca in enumerate(prev):
                for b, cb in enumerate(cur):
                    M[a, b] = abs(np.hypot(*(cb[1] - ca[1])) - paso) + (0 if ca[2] == cb[2] else CAMBIO_M)
            tot = costo[-1][:, None] + M
            atras.append(tot.argmin(0))
            costo.append(tot.min(0) + np.array([c[0] for c in cur]))
        s = int(costo[-1].argmin()); camino = [s]
        for k in range(len(atras) - 1, 0, -1):
            s = int(atras[k][s]); camino.append(s)
        camino.reverse()
        elegidos = [cand[k][s] for k, s in zip(range(i, j), camino)]
        q = [c[1] for c in elegidos]
        # En lo rural el plano va lejos de la vía y la calle "más probable" puede ser otra: si el tramo quedó en promedio
        # a más de LEJOS_M, se deja como en el plano
        if np.median(np.hypot(*(np.array(q) - P[i:j]).T)) <= lejos: corridas.append((True, None, elegidos)); sobre += j - i
        else: libre(P[i:j])
        i = j
    return corridas, sobre, n

def camino_nodos(V, ini, fin, limite):
    """Dijkstra por la red. ini y fin: {nodo: metros hasta él desde el punto}. -> [nodos] o None si no llega antes de limite."""
    dist, prev, cola = dict(ini), {}, [(d, u) for u, d in ini.items()]
    heapq.heapify(cola)
    mejor, meta = limite, None
    while cola:
        d, u = heapq.heappop(cola)
        if d > dist.get(u, 1e18) or d >= mejor: continue
        if u in fin and d + fin[u] < mejor: mejor, meta = d + fin[u], u
        for v, L in V['ady'][u]:
            if d + L < dist.get(v, 1e18) and d + L < mejor: dist[v] = d + L; prev[v] = u; heapq.heappush(cola, (d + L, v))
    if meta is None: return None
    nodos = [meta]
    while nodos[-1] in prev: nodos.append(prev[nodos[-1]])
    return nodos[::-1]

def por_la_red(V, q1, s1, q2, s2):
    """Puntos para ir de q1 (sobre el tramo s1) a q2 (sobre s2) por las calles; None si solo se llega dando mucha vuelta."""
    if s1 == s2: return []
    recta = float(np.hypot(*(q2 - q1)))
    limite = min(RED_MAX_M, max(recta * RED_FACTOR, recta + RED_EXTRA_M))
    ini = {V['NA'][s1]: float(np.hypot(*(V['A'][s1] - q1))), V['NB'][s1]: float(np.hypot(*(V['B'][s1] - q1)))}
    fin = {V['NA'][s2]: float(np.hypot(*(V['A'][s2] - q2))), V['NB'][s2]: float(np.hypot(*(V['B'][s2] - q2)))}
    r = camino_nodos(V, ini, fin, limite)
    return None if r is None else [V['pos'][u] for u in r]

def trazar(V, corridas):
    """Corridas -> línea: une lo que va por calles siguiendo la red; lo demás sigue como en el plano."""
    act, ult = [], None
    for sobre, pts, eleg in corridas:
        if not sobre:
            act += list(pts); ult = None
            continue
        for _, q, _, s in eleg:
            if ult is not None and ult[1] != s: act += por_la_red(V, ult[0], ult[1], q, s) or []
            act.append(q)
            ult = (q, s)
    return act

def sin_picos(p, largo=25.0):
    """Quita los picos de ida y vuelta cortos (A -> B -> A) que deja el ajuste al tocar una calle transversal."""
    p = list(p)
    k = 1
    while 0 < k < len(p) - 1:
        if np.hypot(*(p[k + 1] - p[k - 1])) < 3 and np.hypot(*(p[k] - p[k - 1])) < largo:
            del p[k:k + 2]; k = max(1, k - 1)
        else: k += 1
    return np.array(p)

def simplificar(p, tol):
    if len(p) < 3: return p
    keep = np.zeros(len(p), bool); keep[0] = keep[-1] = True
    pila = [(0, len(p) - 1)]
    while pila:
        a, b = pila.pop()
        if b <= a + 1: continue
        ab = p[b] - p[a]; L = np.hypot(*ab); seg = p[a + 1:b] - p[a]
        d = np.abs(ab[0] * seg[:, 1] - ab[1] * seg[:, 0]) / L if L > 0 else np.hypot(*seg.T)
        k = int(d.argmax())
        if d[k] > tol: keep[a + 1 + k] = True; pila += [(a, a + 1 + k), (a + 1 + k, b)]
    return p[keep]

def decodificar(g):
    out, x, y = [], 0, 0
    for k in range(0, len(g), 2): x += g[k]; y += g[k + 1]; out.append((y / 1e6, x / 1e6))
    return out

def codificar(latlng):
    out, px, py = [], 0, 0
    for lat, lng in latlng:
        x, y = round(lng * 1e6), round(lat * 1e6)
        if (x, y) == (px, py) and out: continue
        out += [x - px, y - py]; px, py = x, y
    return out

def distancias(V, Q, arbol='calles'):
    _, d = V[arbol].query_nearest(shapely.points(Q), return_distance=True, all_matches=False)
    return d

def corrimiento(V, lineas):
    """Planos con la georreferencia corrida (la ruta cae en el monte y las calles con su forma están a 200 m): se busca
    el desplazamiento (sin girar ni deformar) que la deja sobre calles. Se acepta solo si queda claramente mejor y no hay
    otro desplazamiento casi igual de bueno (en una cuadrícula de calles una cuadra corrida también cuadra).
    Devuelve (dx, dy) en metros, o None si no hace falta o no es seguro."""
    Q = np.concatenate([muestrear(l)[::4] for l in lineas if len(l) > 1])  # un punto cada ~20 m
    if len(Q) < 10: return None
    d0 = np.median(distancias(V, Q))
    if d0 <= CORRIDO_M: return None
    puntaje = lambda s: np.mean(np.minimum(distancias(V, Q + s), 40))
    malla = [np.array((dx, dy)) for dx in range(-MAX_CORRIDO_M, MAX_CORRIDO_M + 1, 20) for dy in range(-MAX_CORRIDO_M, MAX_CORRIDO_M + 1, 20)]
    res = sorted((puntaje(s), tuple(s)) for s in malla)
    mejor = np.array(res[0][1])
    # En una cuadrícula de calles una cuadra corrida también cuadra: entre los casi iguales, el que menos mueve
    casi = [s for p, s in res if p <= res[0][0] * 1.15 + .5]
    mejor = np.array(min(casi, key=lambda s: np.hypot(*s)))
    fino = min((puntaje(mejor + (a, b)), tuple(mejor + (a, b))) for a in range(-16, 17, 4) for b in range(-16, 17, 4))
    s = np.array(fino[1], float)
    d1 = np.median(distancias(V, Q + s))
    if d1 > 10 or d1 > d0 * 0.6: return None
    return s

def mover(latlngs, s):
    x, y = a_m([p[0] for p in latlngs], [p[1] for p in latlngs])
    lat, lng = a_ll(np.asarray(x) + s[0], np.asarray(y) + s[1])
    return [[round(float(a), 6), round(float(b), 6)] for a, b in zip(lat, lng)]

def ajustar_ruta(V, it, lejos=LEJOS_M):
    """Cambia it['g'] (e inicio y fin) por el trazo sobre calles. Si el plano venía corrido, primero lo mueve y deja
    en it['cr'] cuántos metros."""
    lineas = []
    for linea in it['g']:
        ll = decodificar(linea)
        if len(ll) < 2: continue
        x, y = a_m([p[0] for p in ll], [p[1] for p in ll])
        lineas.append(list(zip(x, y)))
    s = corrimiento(V, lineas)
    if s is not None:
        lineas = [[(px + s[0], py + s[1]) for px, py in l] for l in lineas]
        for k in ('i', 'f'):
            if it.get(k): it[k] = mover(it[k], s)
        it['cr'] = round(float(np.hypot(*s)))
    res, sobre, total = [], 0, 0
    for l in lineas:
        c, s, n = ajustar_linea(V, l, lejos)
        res.append(c); sobre += s; total += n
    it['aj'] = round(100 * sobre / total) if total else 0
    g, pisa = [], 0.0
    for c in res:
        q = simplificar(sin_picos(simplificar(np.array(trazar(V, c)), 0.5)), TOL_M)
        pisa += metros_en_edificios(V, q)
        lat, lng = a_ll(q[:, 0], q[:, 1])
        if len(q) > 1: g.append(codificar(zip(np.round(lat, 6), np.round(lng, 6))))
    it['g'] = g
    it.pop('pe', None)
    if pisa >= PISA_M: it['pe'] = round(pisa)
    for k in ('i', 'f'):
        if not it.get(k): continue
        nuevos = []
        for lat, lng in it[k]:
            x, y = a_m(lat, lng)
            c = candidatos(V, np.array([float(x), float(y)]), np.array([1.0, 0.0]))
            c = min(c, key=lambda z: np.hypot(*(z[1] - (x, y)))) if c else None
            la, ln = a_ll(*c[1]) if c else (lat, lng)
            nuevos.append([round(float(la), 6), round(float(ln), 6)])
        it[k] = nuevos
    return it

def leer_capa(capa, archivo=None):
    t = open(archivo or os.path.join(SALIDA, 'capa_%s.js' % capa), encoding='utf-8').read()
    return json.loads(t[t.index(',') + 1:t.rindex(')')])

def escribir_capa(capa, datos):
    js = 'cargarCapa(%s,%s);\n' % (json.dumps(capa), json.dumps(datos, ensure_ascii=False, separators=(',', ':')))
    open(os.path.join(SALIDA, 'capa_%s.js' % capa), 'w', encoding='utf-8').write(js)
    idx_path = os.path.join(SALIDA, 'indice.js')
    idx = open(idx_path, encoding='utf-8').read()
    m = re.search(r'("capas":\{)(.*?)(\}\};?\s*$)', idx, re.S)
    capas = json.loads('{' + m.group(2) + '}')
    capas[capa] = {'kb': round(len(js.encode()) / 1024)}
    open(idx_path, 'w', encoding='utf-8').write(idx[:m.start()] + '"capas":' + json.dumps(capas, separators=(',', ':')) + '};\n')
    return capas[capa]['kb']

if __name__ == '__main__':
    V = vias()
    lejos = next((float(a.split('=')[1]) for a in sys.argv[1:] if a.startswith('--lejos=')), LEJOS_M)
    desde = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--desde=')), None)
    for capa in [a for a in sys.argv[1:] if not a.startswith('--')]:
        datos = leer_capa(capa, desde)
        t0 = time.time()
        for k, it in enumerate(datos['items']):
            ajustar_ruta(V, it, lejos)
            if k % 200 == 199: print('  %s: %d de %d' % (capa, k + 1, len(datos['items'])), flush=True)
        aj = np.array([it['aj'] for it in datos['items']])
        kb = escribir_capa(capa, datos)
        print('%s: %d rutas en %.0f s; sobre calle (mediana) %d%%; con menos del 70%% sobre calle: %d; %d KB' %
              (capa, len(aj), time.time() - t0, np.median(aj), (aj < 70).sum(), kb))
