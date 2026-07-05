// Remove common emojis and pictographs from a string.
// Uses a broad regex that covers surrogate pair emoji ranges and common pictograph blocks.
// Not perfect for every Unicode emoji but sufficient for input sanitization in UI fields.

const removeEmojis = (str = '') => {
  try {
    // Unicode property escapes would be ideal: /\p{Extended_Pictographic}/u
    // But to be broadly compatible, use a combined surrogate-range regex.
    return String(str).replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\u2600-\u26FF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|\uFE0F)/g, '').trim()
  } catch (e) {
    // Fallback - if regex fails for some engines, just return original
    return String(str)
  }
}

export default removeEmojis
