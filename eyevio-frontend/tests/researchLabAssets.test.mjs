/**
 * The Research Lab page reads public/research-lab/*_eval.json; those must match the model-card evidence.
 * After re-running scripts/eval_model_cards.py, copy docs/model_cards/assets/*_eval.json into public/research-lab/.
 * Run: npm test
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public', 'research-lab')
const docsDir = join(here, '..', '..', 'docs', 'model_cards', 'assets')

describe('research lab assets', () => {
  for (const name of ['cataract', 'redness', 'pathology']) {
    it(`${name}_eval.json matches the model card`, (t) => {
      const docsFile = join(docsDir, `${name}_eval.json`)
      if (!existsSync(docsFile)) {
        t.skip('model-card assets not present in this checkout')
        return
      }
      const published = JSON.parse(readFileSync(join(publicDir, `${name}_eval.json`), 'utf8'))
      assert.deepEqual(published, JSON.parse(readFileSync(docsFile, 'utf8')))
    })
  }

  for (const image of ['cataract_gradcam', 'cataract_reliability', 'redness_gradcam', 'pathology_gradcam']) {
    it(`${image}.jpg is published`, () => {
      assert.ok(existsSync(join(publicDir, `${image}.jpg`)))
    })
  }
})
