/** Stored eye photo, or a placeholder when the photo was analysed on-device and never uploaded. */
export default function EyeThumbnail({ src, alt, className = '' }) {
  if (src) return <img src={src} alt={alt} className={className} />
  return (
    <div
      className={`flex items-center justify-center bg-gray-100 text-gray-400 text-[11px] text-center leading-tight p-2 ${className}`}
      role="img"
      aria-label="Photo kept on device"
    >
      Photo kept on device
    </div>
  )
}
