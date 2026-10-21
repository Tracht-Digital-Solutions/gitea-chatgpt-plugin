import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const output = 'plugin/assets/icon.png';
const png = new Resvg(readFileSync('plugin/assets/icon.svg'), {
  fitTo: { mode: 'width', value: 512 },
})
  .render()
  .asPng();
if (process.argv.includes('--check')) {
  if (!png.equals(readFileSync(output)))
    throw new Error('Icon drift: run pnpm branding');
} else {
  writeFileSync(output, png);
}
process.stdout.write('SVG and 512px PNG branding verified.\n');
