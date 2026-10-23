# STEP Viewer

Public optional STEP/STP file-preview plugin for Aide. Aide's default release no longer bundles a STEP parser or native CAD sidecar. DXF, STL and URDF remain independent built-in formats.

Install the plugin ZIP in Aide, enable it, then open a `.step` or `.stp` file. On first use click **安装 CAD 引擎并预览** to download the separate platform runtime. Downloads are checked against byte count and SHA-256 before extraction. Models are processed locally and never sent to the engine download service. No provider API key is required.

The original native OCCT converter preserves millimeter/metre/inch units, assembly transforms, part/face colors, mixed solid/wire/point geometry, bounded batches, measurement, coordinate calibration and assembly explode controls. Inputs remain read-only. Limits: 384 MiB input, 3 million triangles, 500,000 segments, 200,000 points, 15-minute conversion deadline. Complex models can still exceed memory/geometry limits. The converter is capped at 1 GiB address space and stops when the container memory margin falls below 128 MiB; large assemblies may need more available memory. Rendering requires WebGL. No geometry editing or STEP export is provided.

File access uses the existing bound-document MessagePort bridge (including supported read-only references); it has no arbitrary file path or parent bearer access. The trusted Node backend receives only bounded uploaded chunks and opaque random job IDs. Closing/revoking a view stops polling and conversion loses its lease within 30 seconds; temporary jobs are reclaimed. Original files are never overwritten. Without this plugin Aide offers a download/install hint.

Runtime is separately distributed for Linux ARM64/AMD64 containers, not macOS/Windows native Python. The cache persists outside the image; removing the plugin does not remove the downloaded engine. See [runtime build and source provenance](runtime/README.md).

Tests: `python3 tests/install.py`, `node tests/worker.cjs`, `node tests/step-metrology.test.cjs`, `node tests/step-assembly.test.cjs`; native IO and full converter fidelity run inside the pinned Linux engine environment. `scripts/package.py` produces the plugin ZIP without tests, caches or the heavyweight engine.

MIT wrapper; bundled Three.js is MIT, and separately downloaded OCP/OCCT retain their original licenses in licenses/. The workbench client derives from Aide's MIT-licensed public bridge.
