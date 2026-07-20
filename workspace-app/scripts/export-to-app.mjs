// Copies the static export (out/) to ../app, which Firebase Hosting serves
// at msma.work/app. Runs automatically after `next build` (postbuild).
import { rmSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../out', import.meta.url));
const target = fileURLToPath(new URL('../../app', import.meta.url));

rmSync(target, { recursive: true, force: true });
cpSync(out, target, { recursive: true });
console.log('Exported to', target);
