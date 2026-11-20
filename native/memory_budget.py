"""Conservative available memory, including clean inactive cgroup file cache."""
from pathlib import Path


def available_memory(cgroup=Path('/sys/fs/cgroup'), meminfo=Path('/proc/meminfo')):
    available = 2**63
    try:
        limit = (cgroup / 'memory.max').read_text().strip()
        if limit != 'max':
            current = int((cgroup / 'memory.current').read_text())
            reclaimable = 0
            try:
                stats = dict((key, int(value)) for key, value in
                             (line.split() for line in (cgroup / 'memory.stat').read_text().splitlines()))
                # Only inactive file pages; exclude shared, dirty and in-flight IO.
                inactive = min(stats['inactive_file'], max(0, stats['file'] - stats.get('shmem', 0)))
                reclaimable = max(0, inactive - stats.get('file_dirty', 0) - stats.get('file_writeback', 0))
            except (OSError, ValueError, KeyError):
                pass
            available = max(0, int(limit) - current + reclaimable)
    except (OSError, ValueError):
        pass
    try:
        for line in meminfo.read_text().splitlines():
            if line.startswith('MemAvailable:'):
                available = min(available, max(0, int(line.split()[1]) * 1024))
                break
    except (OSError, ValueError, IndexError):
        pass
    return available
