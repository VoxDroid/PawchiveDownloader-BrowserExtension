// Renders the hand-drawn icon (scripts/draw-icon.py) with Blender, headless,
// into every size the manifest and stores need. Sizes below 96 px use the
// bolder, simplified drawing.
//
// Usage: pnpm icons
// Set BLENDER to the blender executable if it is not found automatically.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const candidates = [];
  if (process.platform === 'win32') {
    const root = 'C:/Program Files/Blender Foundation';
    if (existsSync(root)) {
      for (const dir of readdirSync(root).sort().reverse())
        candidates.push(join(root, dir, 'blender.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
  }
  candidates.push('blender');
  return candidates.find((c) => c === 'blender' || existsSync(c));
}

const blender = findBlender();
const script = resolve('scripts/draw-icon.py');
const targets = [
  ...[16, 32, 48, 96, 128].map((size) => [size, resolve(`public/icon/${size}.png`)]),
  [512, resolve('assets/icon-512.png')],
];
mkdirSync(resolve('public/icon'), { recursive: true });

for (const [size, out] of targets) {
  // --python-exit-code makes Blender fail when the script raises.
  execFileSync(
    blender,
    [
      '-b',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      script,
      '--',
      out,
      String(size),
    ],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  console.log(`${size}px  ${out}`);
}
