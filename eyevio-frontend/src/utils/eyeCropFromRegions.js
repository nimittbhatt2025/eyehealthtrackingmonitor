/**
 * Crop pupil / iris patches from a video frame using PupilRegionTracker regions.
 *
 * Quality rule: take a *larger* source window from the camera frame, then only
 * downscale (or keep native size). Never blow up a tiny 50px patch to 256+.
 */

/** Max edge length we store / draw for a single eye close-up */
export const DISPLAY_SIZE = 320
/** Prefer at least this many source pixels before zooming (reduces grain) */
export const MIN_GOOD_SOURCE_PX = 120

/**
 * Square half-extent around a pupil region.
 * Wide enough to keep iris + lids so we downscale instead of upsample.
 */
export function cropHalfExtent(region, frameW, frameH) {
  if (!region) return Math.round(Math.min(frameW, frameH) * 0.12)
  const iris = Number(region.irisRadius) || Number(region.radius) || 12
  const pupil = Number(region.radius) || iris * 0.6
  // Wider window → more camera pixels → sharper display after resize.
  const half = Math.max(pupil * 3.2, iris * 2.15, 64)
  return Math.round(Math.min(half, Math.min(frameW, frameH) * 0.34))
}

/**
 * Source rectangle for one eye in unmirrored video / canvas space.
 */
export function eyeSourceRect(region, frameW, frameH) {
  if (!region || !frameW || !frameH) return null
  const half = cropHalfExtent(region, frameW, frameH)
  const cx = Math.round(region.x)
  const cy = Math.round(region.y)
  let x = cx - half
  let y = cy - half
  let size = half * 2
  if (x < 0) x = 0
  if (y < 0) y = 0
  if (x + size > frameW) x = Math.max(0, frameW - size)
  if (y + size > frameH) y = Math.max(0, frameH - size)
  size = Math.min(size, frameW - x, frameH - y)
  if (size < 40) return null
  return { x, y, size }
}

function configureSmoothCtx(ctx, sourceSize, destSize) {
  ctx.imageSmoothingEnabled = true
  // 'high' helps when downscaling; still better than default for mild upscales.
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = sourceSize >= destSize ? 'high' : 'medium'
  }
}

/**
 * Output edge length: never force a huge upsample from a tiny ROI.
 */
export function outputEdgeForSource(sourceSize, maxSize = DISPLAY_SIZE) {
  const src = Math.max(1, Math.round(sourceSize))
  if (src >= maxSize) return maxSize
  // Mild upscale only (≤1.5×); otherwise keep native for sharpness.
  if (src * 1.5 >= maxSize) return maxSize
  return Math.max(src, Math.min(maxSize, Math.round(src * 1.25)))
}

/**
 * Draw a mirrored (selfie) close-up of one eye onto a destination canvas.
 */
export function drawEyeZoom(source, destCanvas, region, { mirror = true, size = DISPLAY_SIZE } = {}) {
  if (!source || !destCanvas || !region) return false
  const frameW = source.videoWidth || source.width
  const frameH = source.videoHeight || source.height
  if (!frameW || !frameH) return false

  const rect = eyeSourceRect(region, frameW, frameH)
  if (!rect) return false

  const out = outputEdgeForSource(rect.size, size)
  destCanvas.width = out
  destCanvas.height = out
  const ctx = destCanvas.getContext('2d')
  if (!ctx) return false

  configureSmoothCtx(ctx, rect.size, out)
  ctx.save()
  if (mirror) {
    ctx.translate(out, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(source, rect.x, rect.y, rect.size, rect.size, 0, 0, out, out)
  ctx.restore()

  // Soft reticle so the pupil stays centered in the zoom view
  ctx.beginPath()
  ctx.arc(out / 2, out / 2, out * 0.16, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  return { ok: true, sourceSize: rect.size, outputSize: out, sharp: rect.size >= MIN_GOOD_SOURCE_PX }
}

/**
 * Encode a single eye close-up as a JPEG data URL (unmirrored, for storage).
 */
export function cropEyeDataUrl(
  sourceCanvas,
  region,
  { size = DISPLAY_SIZE, quality = 0.95 } = {}
) {
  if (!sourceCanvas || !region) return null
  const frameW = sourceCanvas.width
  const frameH = sourceCanvas.height
  const rect = eyeSourceRect(region, frameW, frameH)
  if (!rect) return null

  const out = outputEdgeForSource(rect.size, size)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  configureSmoothCtx(ctx, rect.size, out)
  ctx.drawImage(sourceCanvas, rect.x, rect.y, rect.size, rect.size, 0, 0, out, out)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Whether both eye crops have enough source pixels for a sharp zoom.
 */
export function regionsSharpEnough(regions, frameW, frameH) {
  if (!regions?.anatomicalLeft || !regions?.anatomicalRight) return false
  const left = eyeSourceRect(regions.anatomicalLeft, frameW, frameH)
  const right = eyeSourceRect(regions.anatomicalRight, frameW, frameH)
  if (!left || !right) return false
  return left.size >= MIN_GOOD_SOURCE_PX && right.size >= MIN_GOOD_SOURCE_PX
}
