// Every relative link and image in the README and the guides resolves to a file in the repo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docs = ['README.md', 'docs/guides/install.md', 'docs/guides/troubleshooting.md']
// Guides written by sibling tasks (plan Tasks 13/14). Tolerated only while the file is absent;
// once a guide exists its links are checked like any other. Delete this list when all three have landed.
const SIBLING_GUIDES = new Set(['docs/guides/review.md', 'docs/guides/dispatch.md', 'docs/guides/agents.md'])

function links(md) {
  const out = []
  const text = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) out.push(m[1])
  return out
}

for (const doc of docs) {
  test(`${doc}: relative links resolve`, () => {
    const file = path.join(root, doc)
    const md = fs.readFileSync(file, 'utf8')
    const broken = []
    for (const href of links(md)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue
      const target = path.resolve(path.dirname(file), href.split('#')[0])
      const rel = path.relative(root, target)
      if (fs.existsSync(target)) continue
      if (SIBLING_GUIDES.has(rel)) continue
      broken.push(href)
    }
    assert.deepEqual(broken, [])
  })
}

test('README links to every guide', () => {
  const md = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  for (const g of ['install', 'review', 'dispatch', 'agents', 'troubleshooting'])
    assert.ok(md.includes(`docs/guides/${g}.md`), `README must link docs/guides/${g}.md`)
})

test('guides name the symptoms the spec lists', () => {
  const t = fs.readFileSync(path.join(root, 'docs/guides/troubleshooting.md'), 'utf8')
  for (const s of ['mmdc', 'herdr-task', "isn't listed", 'opens as a tab', 'too narrow', 'instructions'])
    assert.ok(t.toLowerCase().includes(s.toLowerCase()), `troubleshooting must cover: ${s}`)
  const i = fs.readFileSync(path.join(root, 'docs/guides/install.md'), 'utf8')
  assert.ok(i.includes('link.sh --remove'))
})
