# Point Matrix

LiDAR workspace with nine panels based on `ideal.jpeg`, persistent playback zoom,
recorded inference timings, accuracy, and bookmarked frames. Playback now uses
[ranbyDipz/sih-lidar-clip](https://huggingface.co/datasets/ranbyDipz/sih-lidar-clip):
its JSON manifest and 1,000 LGF1 frames (`001500` through `002499`), with no NPZ
conversion or local archive required. The provided TypeScript decoder and format
documentation live in `dashbard_timesxript_drivability/`.

## Vercel and Hugging Face

Import this repository into Vercel with **Root Directory set to the repository
root**, not `dashboard`. The root `vercel.json` configures installation, build,
and `dashboard/dist` output. The build excludes `dashboard/public/frames` and
the local download cache. No Git LFS download is needed for playback.

The manifest URL is configured by default:

```text
VITE_MANIFEST_URL=https://huggingface.co/datasets/ranbyDipz/sih-lidar-clip/resolve/main/manifest.json
```

Playback downloads frames directly from Hugging Face. Auto detail uses lite
frames while playing and full frames when paused. The recorded 10 FPS is the
target rate. Playback starts at 2x and always shows every frame in order, with
speed controls up to 8x. If a frame is late, playback waits instead of skipping.
Four upcoming frames are downloaded, decoded, and prepared in a background
worker, including point colors and map instance buffers. Auto detail preloads
lite frames; explicitly selected quality is respected. Twelve compressed files
and eight prepared frames are retained in memory. Actual speed depends on
download and rendering throughput.

For local development, when `dashboard/public/frames/manifest.json` exists the
dashboard now auto-detects and serves that frame set too. Both the existing
split frame archive (`grid/`, `points/`, `meta/`) and single-file Point Matrix
JSON clip manifests are supported without going through LGF1.

The dataset is file storage, not an inference server. To process new raw scans,
configure **one** of these Vercel environment variables, then redeploy:

- `VITE_HF_SPACE=owner/space`: an existing Gradio Space exposing
  `/infer(scan_file)` and returning `[LGF1 file, summary]`, as in the supplied
  `FORMAT.md`. The frontend uses the official Gradio JavaScript client.
- `VITE_API_BASE_URL=https://owner-space.hf.space`: a FastAPI Docker Space.
  Deploy the files described in `deploy/huggingface/README.md` and set its
  `CORS_ORIGINS` to your exact Vercel URL.

No Space URL or hosting credentials were supplied. The dashboard can play the
public clip and import LGF1 / exported JSON without an inference backend.
There are no private Hugging Face tokens in the frontend.

To finish a hosted integration, provide the Vercel project/team and production
URL, the Hugging Face Space URL or `owner/space`, and authenticated deployment
access to both accounts on this machine. For an existing Gradio Space, its
`/infer` endpoint must accept `scan_file` and return `[LGF1 file, summary]`.
For a new inference Space, also supply the SalsaNext checkpoint and model
code/configuration, plus the intended GPU or ZeroGPU setup. The bundled CPU
Docker backend provides geometry preview only for unlabeled BIN scans.
Use authenticated CLI sessions or server-side secrets for credentials; never
put a private Hugging Face token into a `VITE_*` variable. A private Space
needs server-side authentication rather than the current public browser client.

See [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build),
[Hugging Face Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker),
and the [Gradio client guide](https://www.gradio.app/guides/getting-started-with-the-js-client).

## Download the hosted clip

```bash
npm --prefix dashboard run download:clip
```

Downloads `manifest.json` and all lite/full frame pairs to `.cache/hf-clip`
(about 1.2 GiB). Rerunning verifies sizes and skips completed files.
Run `npm --prefix dashboard run verify:clip` to decode every downloaded file
and check its counts, timings and accuracy against the manifest.
For a smaller sample:

```bash
npm --prefix dashboard run download:clip -- --quality lite --limit 10
```

These are the actual hosted LGF1 files; the JSON manifest points to compressed
binary sections, not standalone JSON point arrays. **Export map** produces a
JSON copy including cells, points, recorded metadata and point attributes.
JSON exports can be reopened with **Upload scan**. Ground-truth point classes
retain the source convention (0 unlabeled, 1 car); rendered classes use
-1 unlabeled and 0 car. LGF1 heights include the sensor-height offset.

## Run the website

From the repository root:

```bash
python3 -m pip install -r requirements.txt
npm --prefix dashboard ci
npm --prefix dashboard run build
python3 -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open **http://localhost:8000**. The same process serves the dashboard and upload API.

For frontend-only development, run `npm --prefix dashboard run dev`; hosted
playback needs no local Python server. Vite proxies `/api` to port 8000 if you
also want the existing local upload processor.

When `.cache/hf-clip/manifest.json` exists, the development server automatically
serves the downloaded LGF1 clip at `/__local_clip/` to avoid internet delays.
An explicit `VITE_MANIFEST_URL` overrides this. Production builds continue to
use Hugging Face and do not include the downloaded archive.

## Upload formats

The dashboard accepts raw **KITTI `.bin`** scans: little-endian float32 rows
`[x, y, z, intensity]`, with coordinates in metres relative to the sensor.
The browser checks nonempty files, the 16 MiB size limit, complete 16-byte
rows and finite values before sending data. The local/FastAPI processor also
limits scans to 250,000 points. BIN uploads require a configured processor;
they are sent directly to the Hugging Face Space when hosted there.
LGF1 and exported JSON files up to 64 MiB can also be opened directly
in the browser. Exports include the currently displayed points: choose Full
frames before exporting if every source point is needed.

The optional FastAPI API still supports `.npy`, `.csv`, and `.npz` for direct
API clients; those are not raw upload options in the dashboard.

The FastAPI worker rejects pickled arrays, malformed/nonfinite data and
oversized uploads. It processes jobs sequentially with at most three active
or queued jobs. At most twelve results are retained, for up to one hour;
results disappear on restart.

## Drivability

The map layer and diagnostic panel use the supplied `drivability.ts` rules:
green drivable, amber caution, red blocked. On-road/off-road profiles and
complexity/confidence thresholds update both maps in the browser without
rerunning inference. Defaults are 50% caution complexity, 80% blocked
complexity, and 50% minimum confidence.

Layer controls show areas in square metres using each cell's footprint, not
cell counts. Totals include hidden semantic classes. Unobserved gaps have no
counted area and remain unknown; legacy cells missing required measurements
are unknown unless an obstacle rule already blocks them. Unlabeled measured
cells are blocked by the supplied rules. Geometry-only results keep the
drivability maps disabled.

## Notebook processing

`backend/pipeline.py` loads the trusted repository notebook `new-claude-sih-v2.ipynb`. It extracts its Grid Engine package into a temporary directory and calls the notebook functions directly. It does not execute the Kaggle installation, benchmarks, dataset loops, or user-uploaded code.

There are three explicit modes:

- **Geometry preview** is available on a normal CPU. It uses the notebook's distance-based grid assignment and cell statistics. It does not run semantic refinement, label objects, or infer traversability; the corresponding panels report that the model is unavailable.
- **Supplied labels** uses the full notebook NumPy reference pipeline, including semantic split/merge rules.
- **SalsaNext + CUDA** uses the notebook's projection, model, KNN post-processing and compiled CUDA grid engine. This requires an NVIDIA GPU, CUDA toolkit including `nvcc`, matching PyTorch, a C++ compiler, the SalsaNext source checkout, and a trusted pretrained checkpoint.

To enable the GPU path on that machine:

```bash
python3 -m pip install -r requirements-gpu.txt
git clone https://github.com/TiagoCortinhal/SalsaNext.git /opt/SalsaNext
export SALSANEXT_REPO=/opt/SalsaNext
export SALSANEXT_WEIGHTS=/models/pretrained/SalsaNext
python3 -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --workers 1
```

Place `arch_cfg.yaml` beside the checkpoint when available. The adapter applies the notebook's Python compatibility fixes to the [upstream model](https://github.com/TiagoCortinhal/SalsaNext/blob/master/train/tasks/semantic/modules/SalsaNext.py) in memory. First upload initializes the model and compiles the CUDA extension, which can take several minutes. The checkpoint is operator-provided and must be trusted; it is never accepted through the upload form. GPU inference has not been validated on the local Mac.

The API and LGF1 adapter convert notebook labels to the display convention:
`-1` unknown, `0` car through `18` traffic-sign. Recorded processing timings
are separate from browser/network playback speed. The 0.5 traversability
display threshold is a visualization threshold, not a navigation guarantee.

## Public deployment

The recommended split is the Vercel dashboard and a Hugging Face processing
Space, with the dataset serving the precomputed files. `render.yaml` remains
an optional combined Python service deployment.

This default deployment supports geometry preview and supplied labels. Full raw-scan semantic inference must run on a CUDA-equipped host with the model configuration above. Run one Uvicorn worker and one service replica, because the bounded job registry is process-local. Add authenticated access and durable shared job storage before scaling to a public multi-user production service.

For the optional combined CPU container, run `docker build -t point-matrix .`,
then `docker run --rm -p 8000:8000 point-matrix`. The old frame archive is not
part of the frontend build.

No public deployment URL is generated merely by changing these files. A connected hosting account and deployment are required.

## Verification

Use Node.js 22.18 or newer for the tests and clip verification (native
TypeScript loading).

```bash
python3 -m pip install httpx
python3 -m unittest backend.test_pipeline -v
npm --prefix dashboard test
npm --prefix dashboard run build
```
