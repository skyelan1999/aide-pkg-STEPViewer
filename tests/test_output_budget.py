import ast,base64,array,contextlib,io,json,os,pathlib,subprocess,sys,tempfile,time,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class OutputBudget(unittest.TestCase):
 def test_real_binary_encoding_fits_declared_geometry(self):
  module=ast.parse((ROOT/'native/convert.py').read_text());functions=[n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=='binary'];scope={'sys':sys,'base64':base64};exec(compile(ast.Module(body=functions,type_ignores=[]),str(ROOT/'native/convert.py'),'exec'),scope)
  limits=json.loads((ROOT/'native/limits.json').read_text());triangle=len(scope['binary'](array.array('f',[0]*9)))*3;segment=len(scope['binary'](array.array('f',[0]*6)))*2;point=len(scope['binary'](array.array('f',[0]*3)))*2
  self.assertEqual((triangle,segment,point),(144,64,32));minimum=triangle*limits['maxTriangles']+segment*limits['maxSegments']+point*limits['maxPoints']+limits['metadataReserveBytes'];self.assertGreaterEqual(limits['maxOutputBytes'],minimum)
 def test_actual_job_file_limit_accepts_geometry_sized_sparse_output(self):
  with tempfile.TemporaryDirectory(prefix='step-job-budget-') as temporary:
   root=pathlib.Path(temporary)/'job';root.mkdir();(root/'model.step').write_text('owned fixture');(root/'started').write_text('start')
   target=432000000
   child=pathlib.Path(temporary)/'synthetic.py';child.write_text(f'import os\nos.lseek(1,{target-1},os.SEEK_SET)\nos.write(1,b"\\n")\n')
   log=pathlib.Path(temporary)/'job.log'
   with log.open('wb') as output:
    process=subprocess.Popen([sys.executable,str(ROOT/'native/job.py'),str(root),str(child)],stdout=output,stderr=output)
    try:
     deadline=time.monotonic()+15
     while not (root/'done').exists():
      if time.monotonic()>deadline:self.fail('owned job did not finish')
      if process.poll() is not None:self.fail(log.read_text())
      os.utime(root,None);time.sleep(.02)
     info=(root/'output').stat();self.assertEqual(info.st_size,target);self.assertLess(info.st_blocks*512,1024*1024)
    finally:
     if root.exists():(root/'cancel').write_text('cancel')
     try:process.wait(timeout=4)
     except subprocess.TimeoutExpired:process.kill();process.wait()
if __name__=='__main__':unittest.main()
