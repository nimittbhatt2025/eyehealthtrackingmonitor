import { useEffect, useRef } from 'react'
import { paintGrating } from '../utils/psychophysics'

/** High-contrast stripe icon used on answer buttons. */
export default function GratingSwatch({ angle, size = 44, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    paintGrating(ref.current, angle, 4, 1, { dither: false })
  }, [angle])
  return (
    <canvas
      ref={ref}
      width={size * 2}
      height={size * 2}
      style={{ width: size, height: size }}
      className={`rounded-md shrink-0 ${className}`}
      aria-hidden
    />
  )
}
