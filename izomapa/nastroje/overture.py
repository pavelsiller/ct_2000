"""Overture Maps na S3 (anonymně): které vydání stahovat a dataset jedné vrstvy.

Overture vydává data každý měsíc a na S3 nechává jen poslední dvě až tři vydání. VYDANI je vyzkoušené s touto
šablonou; když už na S3 není, vezme se nejnovější dostupné (struktura dat se mezi vydáními mění jen výjimečně).
Konkrétní vydání jde vynutit proměnnou IZO_OVERTURE=2026-10-21.0 (seznam: s3://overturemaps-us-west-2/release/).
"""
import os, sys
import pyarrow.dataset as ds, pyarrow.fs as fs

VYDANI = '2026-10-21.0'
KOREN = 'overturemaps-us-west-2/release'
_s3 = _vydani = None


def s3():
    global _s3
    if _s3 is None:
        proxy = os.environ.get('HTTPS_PROXY')
        _s3 = fs.S3FileSystem(anonymous=True, region='us-west-2', **({'proxy_options': proxy} if proxy else {}))
    return _s3


def vydani():
    """VYDANI, nebo nejnovější vydání na S3, když VYDANI už smazali (zjistí se jednou za běh)"""
    global _vydani
    if _vydani: return _vydani
    _vydani = os.environ.get('IZO_OVERTURE') or VYDANI
    if os.environ.get('IZO_OVERTURE'): return _vydani
    try:
        dostupne = sorted(i.base_name for i in s3().get_file_info(fs.FileSelector(KOREN)) if i.type == fs.FileType.Directory)
    except Exception as e:                      # bez seznamu zkusit vyzkoušené vydání (chyba se ukáže až při stahování)
        print(f'Overture: seznam vydání nejde načíst ({e}), zkouším {VYDANI}', file=sys.stderr)
        return _vydani
    if dostupne and VYDANI not in dostupne:
        _vydani = dostupne[-1]
        print(f'Overture: vydání {VYDANI} už na S3 není, beru nejnovější {_vydani}', file=sys.stderr)
    return _vydani


def stac_files(theme, typ, bbox):
    import json, urllib.request
    x0, x1, y0, y1 = bbox
    try:
        v = vydani()
        c = json.loads(urllib.request.urlopen(f'https://stac.overturemaps.org/{v}/{theme}/{typ}/collection.json', timeout=15).read())
        bboxes = (c.get('extent') or {}).get('spatial', {}).get('bbox', [])[1:]
        items = [l['href'] for l in c.get('links', []) if l.get('rel') == 'item']
        if len(bboxes) != len(items) or not items:
            return None
        urls = [items[i] for i, b in enumerate(bboxes) if b[0] < x1 and b[2] > x0 and b[1] < y1 and b[3] > y0]
        paths = []
        for u in urls:
            it = json.loads(urllib.request.urlopen(u, timeout=15).read())
            s3_href = ((it.get('assets') or {}).get('aws') or {}).get('alternate', {}).get('s3', {}).get('href')
            if s3_href and s3_href.startswith('s3://'):
                paths.append(s3_href[5:])
        return paths if len(paths) == len(urls) else None
    except Exception:
        return None


def dataset(theme, typ, bbox=None):
    if bbox is not None:
        paths = stac_files(theme, typ, bbox)
        if paths is not None:
            if not paths:
                return ds.dataset(f'{KOREN}/{vydani()}/theme={theme}/type={typ}/', filesystem=s3(), format='parquet')
            return ds.dataset(paths, filesystem=s3(), format='parquet')
    return ds.dataset(f'{KOREN}/{vydani()}/theme={theme}/type={typ}/', filesystem=s3(), format='parquet')
