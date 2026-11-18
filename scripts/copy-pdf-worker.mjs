// PDF 뷰어(pdf.js)의 작업 파일을 public/ 으로 복사합니다. (npm install 시 자동 실행)
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('pdfjs-dist/package.json'));
mkdirSync('public', { recursive: true });
copyFileSync(join(pkgDir, 'legacy/build/pdf.worker.min.mjs'), 'public/pdf.worker.min.mjs');
console.log('pdf.worker.min.mjs → public/');
