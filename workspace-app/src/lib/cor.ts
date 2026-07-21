'use client';

// COR (BIR Form 2303) reader — ported exactly from the MSMA Tax Compliance
// System. The file is read entirely in the browser (pdf.js text layer for
// digital eCORs, Tesseract OCR for scans) and auto-fills the client form;
// the file itself is never uploaded or saved anywhere.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type CorResult = {
  name: string;
  tin: string;
  address: string;
  rdo: string;
  taxTypes: Record<string, boolean>;
  found: string[];
};

let pdfJsPromise: Promise<void> | null = null;
let tessPromise: Promise<void> | null = null;

function loadScriptOnce(src: string, integrity: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.integrity = integrity;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadPdfJs(): Promise<void> {
  if ((window as any).pdfjsLib) return Promise.resolve();
  if (!pdfJsPromise) {
    pdfJsPromise = loadScriptOnce(
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e'
    )
      .then(() => {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      })
      .catch((e) => {
        pdfJsPromise = null;
        throw e;
      });
  }
  return pdfJsPromise;
}

function loadTesseract(): Promise<void> {
  if ((window as any).Tesseract) return Promise.resolve();
  if (!tessPromise) {
    tessPromise = loadScriptOnce(
      'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js',
      'sha384-1zP4ZOtlk2FXAOiUArpMuWf7INJJKe/ROfYFAVSeUa11DEfXdKWGiPI3dVma2Gt0'
    ).catch((e) => {
      tessPromise = null;
      throw e;
    });
  }
  return tessPromise;
}

/* map a COR FORM TYPE code to the app's tax-type chip */
const COR_FORM_TAX: Record<string, string> = {
  '1701': 'IT', '1701Q': 'IT', '1702': 'IT', '1702Q': 'IT', '1702RT': 'IT', '1702EX': 'IT',
  '2550': 'VAT', '2550M': 'VAT', '2550Q': 'VAT',
  '1601C': 'WTC', '1604C': 'WTC', '1604CF': 'WTC',
  '0619E': 'EWT', '1601EQ': 'EWT', '1604E': 'EWT',
  '0619F': 'FWT', '1601FQ': 'FWT', '1602Q': 'FWT', '1603Q': 'FBT', '1603': 'FBT',
  '1600': 'WVAT', '1600VT': 'WVAT', '1600WP': 'WVAT',
  '2000': 'DST', '2000OT': 'DST',
};

export function parseCorText(raw: string): CorResult {
  const text = String(raw || '').replace(/\r/g, '');
  const flat = text.toUpperCase().replace(/[ \t]+/g, ' ');
  const out: CorResult = { name: '', tin: '', address: '', rdo: '', taxTypes: {}, found: [] };
  // TIN & Branch Code: 3-3-3-(3..5)
  const tin = flat.match(/(\d{3})\s*[-–]\s*(\d{3})\s*[-–]\s*(\d{3})\s*[-–]?\s*(\d{3,5})/);
  if (tin) {
    out.tin = `${tin[1]}-${tin[2]}-${tin[3]}-${tin[4].slice(0, 3).padStart(3, '0')}`;
    out.found.push('TIN');
  }
  // RDO: the header "REVENUE DISTRICT OFFICE NO. 126", an RDO line, or the OCN prefix
  const rdo =
    flat.match(/REVENUE\s+DISTRICT\s+OFFICE\s*(?:N[O0]\.?|#)?\s*[:\-]?\s*(\d{2,3})/) ||
    flat.match(/RDO\s*(?:CODE)?\s*(?:N[O0]\.?)?\s*[:#]?\s*(\d{2,3})/) ||
    flat.match(/OCN[:\s#]*(\d{3})\s*[A-Z]/);
  if (rdo) {
    out.rdo = rdo[1];
    out.found.push('RDO');
  }
  out.name = extractCorName(text);
  if (out.name) out.found.push('Name');
  const ad = text.match(/REGISTERED ADDRESS[^A-Za-z0-9]*([\s\S]{5,220}?)(?:TAX TYPES|FORM TYPES|LINE OF BUSINESS|\n\s*\n)/i);
  if (ad) {
    out.address = ad[1].replace(/\s+/g, ' ').trim();
    out.found.push('Address');
  }
  // Tax types — by FORM CODE and, more OCR-robustly, by the tax-type NAME column
  (flat.match(/\b(1701Q?|1702(?:Q|RT|EX)?|2550[MQ]?|1601C|1604CF?|0619E|1601EQ|1604E|0619F|1601FQ|1602Q|1603Q?|1600(?:VT|WP)?|2000(?:OT)?)\b/g) || [])
    .forEach((code) => {
      const t = COR_FORM_TAX[code];
      if (t) out.taxTypes[t] = true;
    });
  const nameHits: [RegExp, string][] = [
    [/CORPORATE\s+INCOME\s+TAX|INCOME\s+TAX(?:\s+RETURN)?/, 'IT'],
    [/WITHH\w*\s*TAX[\s\-]*COMPENSATION/, 'WTC'],
    [/WITHH\w*\s*TAX[\s\-]*EXPANDED/, 'EWT'],
    [/WITHH\w*\s*TAX[\s\-]*FINAL/, 'FWT'],
    [/FRINGE\s+BENEFIT/, 'FBT'],
    [/DOCUMENTARY\s+STAMP/, 'DST'],
    [/(WITHH\w*\s*VAT|VALUE\s+ADDED\s+TAX\s+WITHHELD|VAT\s+WITHHELD)/, 'WVAT'],
  ];
  nameHits.forEach(([re, t]) => {
    if (re.test(flat)) out.taxTypes[t] = true;
  });
  if (/VALUE[\s\-]*ADDED\s+TAX/.test(flat) && !/WITHHELD/.test(flat)) out.taxTypes['VAT'] = true;
  const n = Object.keys(out.taxTypes).length;
  if (n) out.found.push(`${n} tax type${n === 1 ? '' : 's'}`);
  return out;
}

function extractCorName(text: string): string {
  const SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|COMPANY|OPC|ENTERPRISES?|ENTERPRISE|TRADING|HOLDINGS?|INDUSTRIES|PHILIPPINES|PHILS?|LTD|LIMITED|PARTNERSHIP|VENTURES?|SOLUTIONS?|TECHNOLOGIES|SYSTEMS?|GROUP|MARKETING|RESOURCES|ASSOCIATES|BANK|FOODS?|CONSTRUCTION|DEVELOPMENT|REALTY|MANUFACTURING)\b/;
  const OFFICE = /\b(LARGE|TAXPAYERS?|REVENUE|DISTRICT|AUDIT|DIVISION|BUREAU|INTERNAL|KAWANIHAN|KAGAWARAN|REPUBLI\w*|PILIPINAS|PANANALAPI|FINANCE|CERTIFICATE|REGISTRATION|REGISTER\w*|NAME OF|TAX TYPE|FORM TYPE|ISSUANCE|ADDRESS|FILING|BRANCH CODE)\b/i;
  const TINRE = /\d{3}\s*-\s*\d{3}\s*-\s*\d{3}\s*-?\s*\d{3,5}/;
  const stripJunk = (s: string) =>
    s
      .replace(/\d{3}\s*-\s*\d{3}\s*-\s*\d{3}\s*-?\s*\d{3,5}/g, ' ')
      .replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+\d{1,2},?\s*\d{2,4}/gi, ' ')
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
      .replace(/[^A-Za-z0-9&.,'\- ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const tidy = (s: string) => {
    const w = stripJunk(s).split(' ').filter(Boolean);
    while (w.length > 1 && /^(L{1,2}|I{1,2}|[IL]{2}|X|CO|—|~|\|)$/i.test(w[0])) w.shift();
    while (w.length > 1 && w[w.length - 1].replace(/[^A-Za-z0-9]/g, '').length <= 1) w.pop();
    return w.join(' ').trim();
  };
  const ok = (v: string) => v.length >= 4 && v.length <= 70 && /[A-Za-z]{3}/.test(v) && !OFFICE.test(v);
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 3);
  const tinLine = lines.find((l) => TINRE.test(l) && /[A-Za-z]{3}/.test(l.replace(TINRE, '')));
  if (tinLine) {
    const v = tidy(tinLine);
    if (ok(v)) return v;
  }
  for (const l of lines) {
    if (OFFICE.test(l)) continue;
    if (SUFFIX.test(l.toUpperCase())) {
      const v = tidy(l);
      if (ok(v) && SUFFIX.test(v.toUpperCase())) return v;
    }
  }
  const m = text.match(/NAME OF TAXPAYER[^A-Za-z0-9]*([^\n]{2,90})/i);
  if (m) {
    let v = m[1].replace(/\|/g, ' ');
    const cut = v.toUpperCase().search(/\b(TINISSUANCE|TIN\s*ISSUANCE|TIN|ISSUANCE|DATE|REGISTER\w*|BRANCH|HEAD OFFICE)\b/);
    if (cut > 0) v = v.slice(0, cut);
    v = tidy(v);
    if (ok(v)) return v;
  }
  return '';
}

// drop the light BIR watermark: keep only dark pixels as black, all else white
function cleanWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum < 120 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(im, 0, 0);
}

export async function corTextFromFile(file: File, setStatus?: (msg: string) => void): Promise<string> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    await loadPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await (window as any).pdfjsLib.getDocument({ data: buf }).promise;
    // 1) text layer (digital eCOR) — instant and exact
    let layer = '';
    for (let p = 1; p <= Math.min(2, pdf.numPages); p++) {
      const tc = await (await pdf.getPage(p)).getTextContent();
      layer += tc.items.map((i: any) => i.str).join(' ') + '\n';
    }
    if (layer.replace(/\s/g, '').length > 40) return layer;
    // 2) scanned image → OCR each page
    await loadTesseract();
    const pages = Math.min(pdf.numPages, 3);
    let text = '';
    for (let p = 1; p <= pages; p++) {
      setStatus?.(`Scanned COR — reading page ${p} of ${pages}${p === 1 ? ' (first time downloads the engine)' : ''}…`);
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 3.0 });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width);
      cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      cleanWatermark(ctx, cv.width, cv.height);
      const { data } = await (window as any).Tesseract.recognize(cv, 'eng');
      text += data.text + '\n';
    }
    return text;
  }
  // direct image upload → OCR straight away
  setStatus?.('Reading the image (first time downloads the engine)…');
  await loadTesseract();
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    cleanWatermark(ctx, cv.width, cv.height);
    const { data } = await (window as any).Tesseract.recognize(cv, 'eng');
    return data.text;
  } finally {
    URL.revokeObjectURL(url);
  }
}
