#!/usr/bin/env python3
"""Reproducible plugin-only package; heavyweight platform engines stay separate."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1];version=json.loads((root/'manifest.json').read_text())['version'];out=root/'dist';out.mkdir(exist_ok=True)
files=[root/x for x in ('manifest.json','index.js','viewer.html','LICENSE','README.md','runtime/catalog.json')]
for folder in ('assets','native','licenses'):
 files.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc')
archive=out/f'aide-pkg-step-viewer-v{version}.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(files):
  entry=zipfile.ZipInfo(str(p.relative_to(root)),date_time=(2026,10,23,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o100644<<16;z.writestr(entry,p.read_bytes())
digest=hashlib.sha256(archive.read_bytes()).hexdigest();(out/'SHA256SUMS').write_text(f'{digest}  {archive.name}\n');print(json.dumps({'file':str(archive),'sha256':digest,'bytes':archive.stat().st_size}))
