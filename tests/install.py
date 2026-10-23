import io,pathlib,subprocess,sys,tarfile,tempfile,unittest
SCRIPT=pathlib.Path(__file__).resolve().parents[1]/'native/install.py'
class ArchiveTests(unittest.TestCase):
 def run_archive(self,name,symlink=False):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);archive=root/'engine.tar.gz';out=root/'out';out.mkdir()
   with tarfile.open(archive,'w:gz') as tar:
    m=tarfile.TarInfo(name);m.size=2
    if symlink:m.type=tarfile.SYMTYPE;m.linkname='/etc/passwd';m.size=0;tar.addfile(m)
    else:tar.addfile(m,io.BytesIO(b'OK'))
   result=subprocess.run([sys.executable,str(SCRIPT),str(archive),str(out)],capture_output=True)
   return result.returncode, list(out.rglob('*'))
 def test_regular(self):self.assertEqual(self.run_archive('OCP/test.py')[0],0)
 def test_traversal(self):self.assertNotEqual(self.run_archive('../escape')[0],0)
 def test_absolute(self):self.assertNotEqual(self.run_archive('/etc/escape')[0],0)
 def test_symlink(self):self.assertNotEqual(self.run_archive('OCP/escape',True)[0],0)
if __name__=='__main__':unittest.main()
