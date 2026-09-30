# Grid Engine Dashboard

React workspace for the Hugging Face `ranbyDipz/sih-lidar-clip` dataset and
KITTI BIN uploads and reopened LGF1/JSON outputs. Includes clouds, a 2.5D map
with persistent zoom, configurable drivability profiles and thresholds,
area totals, diagnostics, recorded timings, accuracy, bookmarks, and JSON export.

## Run

From this directory:

```bash
npm install
npm run dev
```

Hosted playback needs no local backend. Optionally run
`python3 -m uvicorn backend.app:app --port 8000` from the repository root for
local raw uploads. Configure `.env.local` using `.env.example` to connect a
Hugging Face Space. Run `npm run build` for the production assets.

If `public/frames/manifest.json` exists, `npm run dev` now serves that local
frame archive automatically before falling back to the hosted LGF1 manifest.
Both the older split archive (`grid/`, `points/`, `meta/`) and single-file
Point Matrix JSON clip manifests are supported.

See the [root README](../README.md) for formats, GPU/model configuration and hosting.

## Download source frames

From the repository root:

```bash
npm --prefix dashboard run download:clip
```

The downloader caches all 1,000 lite/full LGF1 pairs outside the deployed site.
Vercel must use the repository root because the provided TypeScript decoder
is in `dashbard_timesxript_drivability/`. No NPZ conversion or LFS frame download
is part of the build.
