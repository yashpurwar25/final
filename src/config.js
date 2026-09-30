export const MANIFEST_URL = import.meta.env?.VITE_MANIFEST_URL ||
  import.meta.env?.VITE_LOCAL_FRAMES_MANIFEST_URL ||
  import.meta.env?.VITE_LOCAL_MANIFEST_URL ||
  'https://huggingface.co/datasets/ranbyDipz/sih-lidar-clip/resolve/main/manifest.json'
export const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
export const HF_SPACE = import.meta.env?.VITE_HF_SPACE || (API_BASE ? '' : 'ranbyDipz/point-matrix-hub')
export const LOCAL_API = import.meta.env?.DEV === true
export const apiUrl = (path) => `${API_BASE}${path}`
