"""Exercise the detached job with virtual time and a synthetic converter.

No OCP, user drawing, sleep or real resource-limit change is involved.
"""
import json
import pathlib
import runpy
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch


JOB = pathlib.Path(__file__).resolve().parents[1] / 'native/job.py'


class Lifecycle(unittest.TestCase):
    def execute(self, *, upload_delay=0, conversion_delay=0, cancel_at=None,
                never_start=False, heartbeat=False, memory=2**30):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'model.step').write_bytes(b'synthetic bytes')
            epoch = time.time()
            state = {'clock': 0.0, 'started': None, 'killed': False}
            captured = {}

            def sleep(seconds):
                state['clock'] += seconds
                now = state['clock']
                if heartbeat:
                    import os
                    os.utime(root, (epoch + now, epoch + now))
                if cancel_at is not None and now >= cancel_at:
                    (root / 'cancel').touch()
                if not never_start and state['started'] is None and now >= upload_delay:
                    state['started'] = now
                    (root / 'started').touch()
                    import os
                    os.utime(root, (epoch + now, epoch + now))

            class Process:
                pid = 12345
                returncode = 0

                def poll(self):
                    return 0 if state['clock'] - state['started'] >= conversion_delay or state['killed'] else None

                def wait(self):
                    return self.returncode

            def reclaim(path, **kwargs):
                captured.update({p.name: p.read_bytes() for p in root.iterdir() if p.is_file()})
                captured['elapsed'] = state['clock']

            clock = types.SimpleNamespace(monotonic=lambda: state['clock'],
                                          time=lambda: epoch + state['clock'], sleep=sleep)
            resource = types.SimpleNamespace(RLIMIT_FSIZE=1, RLIMIT_AS=2, setrlimit=lambda *_: None)
            memory_module = types.SimpleNamespace(available_memory=lambda: memory)
            with patch.dict(sys.modules, {'time': clock, 'resource': resource, 'memory_budget': memory_module}), \
                    patch.object(sys, 'argv', [str(JOB), str(root), 'synthetic-converter.py']), \
                    patch('subprocess.Popen', return_value=Process()), \
                    patch('os.killpg', side_effect=lambda *_: state.update(killed=True)), \
                    patch('shutil.rmtree', side_effect=reclaim):
                runpy.run_path(str(JOB), run_name='__main__')
            self.assertIn('done', captured)
            self.assertNotIn('model.step', captured, 'private source is reclaimed after terminal state')
            captured['killed'] = state['killed']
            return captured

    def test_active_upload_can_wait_for_a_bridge_reply(self):
        result = self.execute(upload_delay=319)
        self.assertEqual(result['output'], b'', 'a valid bridge delay must reach conversion')

    def test_active_conversion_can_wait_for_a_bridge_reply(self):
        result = self.execute(conversion_delay=319)
        self.assertEqual(result['output'], b'')
        self.assertFalse(result['killed'])

    def test_abandoned_upload_is_still_bounded(self):
        result = self.execute(never_start=True)
        self.assertIn('超时', json.loads(result['output'])['error'])
        self.assertGreater(result['elapsed'], 320)
        self.assertLess(result['elapsed'], 640)

    def test_heartbeat_cannot_extend_absolute_upload_deadline(self):
        result = self.execute(never_start=True, heartbeat=True)
        self.assertIn('超时', json.loads(result['output'])['error'])
        self.assertGreaterEqual(result['elapsed'], 900)
        self.assertLess(result['elapsed'], 1210)

    def test_cancel_upload_immediately(self):
        result = self.execute(never_start=True, cancel_at=2)
        self.assertIn('取消', json.loads(result['output'])['error'])
        self.assertLess(result['elapsed'], 3)

    def test_cancel_converter_kills_child(self):
        result = self.execute(conversion_delay=100, cancel_at=2)
        self.assertTrue(result['killed'])
        self.assertLess(result['elapsed'], 3)

    def test_memory_guard_remains(self):
        result = self.execute(memory=100 * 1024**2)
        self.assertIn('内存不足', json.loads(result['output'])['error'])


if __name__ == '__main__':
    unittest.main()
