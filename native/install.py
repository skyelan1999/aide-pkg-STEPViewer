"""Extract only a hash-verified, bounded regular-file runtime archive."""
import pathlib,sys,tarfile
root=pathlib.Path(sys.argv[2]);total=0
with tarfile.open(sys.argv[1],'r:gz') as archive:
 members=archive.getmembers()
 if len(members)>20000:raise ValueError('Too many runtime files')
 for m in members:
  p=pathlib.PurePosixPath(m.name)
  if p.is_absolute() or '..' in p.parts or not(m.isfile() or m.isdir()):raise ValueError('Unsafe runtime entry')
  total+=m.size
  if total>400*1024*1024:raise ValueError('Runtime too large')
 for m in members:
  dest=root/m.name
  if m.isdir():dest.mkdir(parents=True,exist_ok=True);continue
  dest.parent.mkdir(parents=True,exist_ok=True)
  with archive.extractfile(m) as src,dest.open('xb') as out:
   while chunk:=src.read(1024*1024):out.write(chunk)
  dest.chmod(0o700 if m.mode&0o111 else 0o600)
