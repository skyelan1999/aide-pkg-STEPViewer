"""Memory pressure guards must distinguish clean cache from resident memory."""
import importlib.util
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('memory_budget', Path(__file__).resolve().parents[1] / 'native/memory_budget.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    meminfo = base / 'meminfo'
    meminfo.write_text('MemAvailable: 100000 kB\n')
    (base / 'memory.max').write_text('1000')
    (base / 'memory.current').write_text('980')
    (base / 'memory.stat').write_text('inactive_file 400\nfile 500\nshmem 100\nfile_dirty 10\nfile_writeback 20\nactive_file 999\n')
    assert module.available_memory(base, meminfo) == 390
    (base / 'memory.stat').write_text('inactive_file 400\nfile 500\nshmem 450\nfile_dirty 10\nfile_writeback 20\n')
    assert module.available_memory(base, meminfo) == 40
    (base / 'memory.stat').write_text('inactive_file 0\nfile 900\n')
    assert module.available_memory(base, meminfo) == 20  # active cache and anonymous memory are not reclaimed
    (base / 'memory.stat').write_text('invalid')
    assert module.available_memory(base, meminfo) == 20
    (base / 'memory.current').write_text('1200')
    assert module.available_memory(base, meminfo) == 0
    (base / 'memory.max').write_text('max')
    meminfo.write_text('MemAvailable: 12 kB\n')
    assert module.available_memory(base, meminfo) == 12288
    (base / 'memory.max').write_text('200000')
    (base / 'memory.current').write_text('1')
    assert module.available_memory(base, meminfo) == 12288  # host available memory is still a hard bound
print('PASS memory guard: clean inactive cache, dirty/shared exclusions, pressure and host bound')
