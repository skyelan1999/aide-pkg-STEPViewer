# Optional native CAD engine

Build independently of Aide: `docker build --platform linux/arm64 -f runtime/Dockerfile -t step-engine .` (or linux/amd64). Only `/opt/aide-cad` enters the engine archive; no Aide data, credentials or installed plugins are copied.

Dependencies are pinned by version and PyPI wheel SHA-256 in requirements.txt. OCP/OCCT licenses and upstream references are in `licenses/occt/`. Engine archives include those licenses. Source projects: https://github.com/CadQuery/OCP and https://github.com/Open-Cascade-SAS/OCCT . These libraries retain their original licenses; the plugin wrapper is MIT.

`catalog.json` pins each platform archive byte count and SHA-256. Install is explicit through the viewer button; archives are never downloaded by Aide startup or default core builds. The first install requires network; subsequent previews work offline. Cache is under the runtime user's `~/.cache/aide-step-viewer/engine`, outside the application image and plugin package.
