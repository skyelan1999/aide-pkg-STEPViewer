"""Bounded detached conversion. An abandoned bridge loses its lease in 30s."""
import json,os,pathlib,resource,signal,subprocess,sys,time,shutil
limits=json.loads(pathlib.Path(__file__).with_name('limits.json').read_text())
root=pathlib.Path(sys.argv[1]);proc=None
def memory_room():
 try:
  base=pathlib.Path('/sys/fs/cgroup');limit=(base/'memory.max').read_text().strip()
  return 2**63 if limit=='max' else int(limit)-int((base/'memory.current').read_text())
 except (OSError,ValueError):return 2**63
try:
 resource.setrlimit(resource.RLIMIT_FSIZE,(limits['maxOutputBytes'],limits['maxOutputBytes']))
 resource.setrlimit(resource.RLIMIT_AS,(1024**3,1024**3))
 deadline=time.monotonic()+900
 while not (root/'started').exists():
  if (root/'cancel').exists() or time.monotonic()>deadline or time.time()-root.stat().st_mtime>30:raise RuntimeError('STEP 上传取消或超时')
  time.sleep(.1)
 if memory_room()<192*1024**2:raise RuntimeError('可用内存不足，请稍后重试 STEP 预览')
 with (root/'output').open('wb',buffering=0) as out,(root/'error').open('wb') as err:
  proc=subprocess.Popen([sys.executable,sys.argv[2],str(root/'model.step')],stdout=out,stderr=err,start_new_session=True)
  deadline=time.monotonic()+900
  while proc.poll() is None:
   if (root/'cancel').exists() or time.monotonic()>deadline or time.time()-root.stat().st_mtime>30 or memory_room()<128*1024**2:
    os.killpg(proc.pid,signal.SIGKILL);proc.wait();raise RuntimeError('STEP 加载取消、超时或可用内存不足')
   time.sleep(.1)
  if proc.returncode:raise RuntimeError('STEP 几何转换失败')
except Exception as e:
 with (root/'output').open('ab') as out:out.write((json.dumps({'error':str(e)})+'\n').encode())
finally:
 (root/'done').write_text('done');(root/'model.step').unlink(missing_ok=True)
 # The viewer cancels after consuming output. Reclaim only this private job.
 for _ in range(300):
  if (root/'cancel').exists():break
  time.sleep(1)
 shutil.rmtree(root,ignore_errors=True)
