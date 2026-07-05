#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const srcDir = path.join(root, 'src')
const archiveDir = path.join(root, 'archive_unused_by_ai', 'emoji_backups')

const mapping = {
  '🎥': '[camera]',
  '📸': '[camera]',
  '🎤': '[mic]',
  '✅': '[OK]',
  '❌': '[X]',
  '⚠️': '[WARNING]',
  '⚠': '[WARNING]',
  '🔴': '[RED]',
  '🟢': '[GREEN]',
  '🚫': '[BLOCKED]',
  '🚨': '[ALERT]',
  '➡️': '->',
  '🎧': '[headphones]',
  '🎯': '[target]'
}

function walk(dir, filelist = []) {
  const files = fs.readdirSync(dir)
  files.forEach(file => {
    const full = path.join(dir, file)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      walk(full, filelist)
    } else {
      filelist.push(full)
    }
  })
  return filelist
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

ensureDir(archiveDir)

const files = walk(srcDir).filter(f => /\.(js|jsx|ts|tsx|md)$/.test(f))
let changed = 0

for (const file of files) {
  const rel = path.relative(root, file)
  let content = fs.readFileSync(file, 'utf8')
  let modified = content
  for (const [emoji, repl] of Object.entries(mapping)) {
    if (modified.includes(emoji)) {
      const re = new RegExp(emoji.replace(/([.*+?^=!:${}()|[\]\\])/g, '\\$1'), 'g')
      modified = modified.replace(re, repl)
    }
  }
  if (modified !== content) {
    // backup original into archive folder preserving path
    const backupPath = path.join(archiveDir, rel)
    ensureDir(path.dirname(backupPath))
    fs.writeFileSync(backupPath + '.bak', content, 'utf8')
    fs.writeFileSync(file, modified, 'utf8')
    console.log('Updated:', rel)
    changed++
  }
}

console.log(`Emoji sweep complete. Files changed: ${changed}`)
