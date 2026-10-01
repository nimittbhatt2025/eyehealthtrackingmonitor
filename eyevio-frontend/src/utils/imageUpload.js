/**
 * Client-side preparation of photos that do go to the server (save-photos opt-in
 * or on-device fallback): crop to the face, cap resolution, encode a JPEG Blob.
 * api.js sends Blob fields as multipart/form-data, so there is no base64 inflation.
 */

import { rgbaToRgb } from '../ml/imageOps'
import { estimateWhiteBalance } from '../ml/ocularAnalysis'

// Must match eyevio/app/ai_models/capture_quality.py so a crop can never turn a
// rejected framing into an accepted one (the server re-checks in crop coordinates).
const MIN_EYE_SPAN = 0.2
const EYE_EDGE_MARGIN = 0.04
const EYE_CENTER_Y_MIN = 0.1
const EYE_CENTER_Y_MAX = 0.75
const EYE_LANDMARKS = [
  33, 133, 160, 159, 158, 157, 173, 144, 145, 153,
  362, 263, 387, 386, 385, 384, 398, 373, 374, 380,
]

function framingOk(landmarks, box, width, height) {
  const xs = EYE_LANDMARKS.map((i) => (landmarks[i].x * width - box.x) / box.w)
  const ys = EYE_LANDMARKS.map((i) => (landmarks[i].y * height - box.y) / box.h)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
  return (
    xMax - xMin >= MIN_EYE_SPAN &&
    meanY >= EYE_CENTER_Y_MIN && meanY <= EYE_CENTER_Y_MAX &&
    xMin >= EYE_EDGE_MARGIN && xMax <= 1 - EYE_EDGE_MARGIN
  )
}

/**
 * Padded face box in pixels, or null when the full frame should be sent: no
 * landmarks, the frame already fails the server framing gate (let it reject with
 * its usual message), or the crop would change the gate's outcome.
 */
export function faceUploadBox(width, height, landmarks, { pad = 0.3 } = {}) {
  if (!landmarks || landmarks.length < 468) return null
  const full = { x: 0, y: 0, w: width, h: height }
  if (!framingOk(landmarks, full, width, height)) return null

  const xs = landmarks.map((p) => p.x * width)
  const ys = landmarks.map((p) => p.y * height)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const padX = (x1 - x0) * pad
  const padY = (y1 - y0) * pad
  const bx = Math.max(0, Math.floor(x0 - padX))
  const by = Math.max(0, Math.floor(y0 - padY))
  const box = {
    x: bx,
    y: by,
    w: Math.min(width, Math.ceil(x1 + padX)) - bx,
    h: Math.min(height, Math.ceil(y1 + padY)) - by,
  }
  if (box.w < 64 || box.h < 64 || !framingOk(landmarks, box, width, height)) return null
  return box
}

/**
 * @returns {Promise<{blob: Blob, meta: {source_size, box, scale, reason, white_balance?}}>}
 * meta goes to the server as `client_crop`. A cropped upload carries the
 * full-frame white balance, since estimating it on the crop would bias redness.
 */
export async function prepareImageUpload(canvas, landmarks, { maxSide = 1024, quality = 0.9 } = {}) {
  const width = canvas.width
  const height = canvas.height
  const box = faceUploadBox(width, height, landmarks)
  let whiteBalance
  if (box) {
    const rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data
    whiteBalance = estimateWhiteBalance(rgbaToRgb(rgba, width, height))
  }
  const src = box || { x: 0, y: 0, w: width, h: height }
  const scale = Math.min(1, maxSide / Math.max(src.w, src.h))

  const out = document.createElement('canvas')
  out.width = Math.round(src.w * scale)
  out.height = Math.round(src.h * scale)
  const ctx = out.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, src.x, src.y, src.w, src.h, 0, 0, out.width, out.height)
  const blob = await new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', quality)
  })

  return {
    blob,
    meta: {
      source_size: [width, height],
      box: box ? [box.x, box.y, box.w, box.h] : null,
      scale: Math.round(scale * 1000) / 1000,
      reason: box ? 'face_region' : (landmarks ? 'framing_not_croppable' : 'no_landmarks'),
      ...(whiteBalance ? { white_balance: whiteBalance } : {}),
    },
  }
}

/**
 * JPEG Blob of the current video frame, long side capped at maxSide, for the
 * blink-calibration frame streams (eye aspect ratio is scale-invariant).
 * Resolves null when the video has no frame yet.
 */
export function videoFrameBlob(video, canvas = document.createElement('canvas'), { maxSide = 640, quality = 0.8 } = {}) {
  if (!video?.videoWidth || !video?.videoHeight) return Promise.resolve(null)
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}
