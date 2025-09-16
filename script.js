// Simple client-side PDF page extractor using pdf-lib
// No uploads. Everything happens in-browser.

let loadedPdfBytes = null;
let loadedPdfDoc = null;
let loadedFilename = null;

const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const controls = document.getElementById('controls');
const statusEl = document.getElementById('status');
const fileMeta = document.getElementById('fileMeta');
const rangesInput = document.getElementById('ranges');
const extractBtn = document.getElementById('extractBtn');
const resetBtn = document.getElementById('resetBtn');

// Drag & drop
;['dragenter','dragover'].forEach(evt => {
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag'); });
});
;['dragleave','drop'].forEach(evt => {
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag'); });
});
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files?.[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

resetBtn.addEventListener('click', () => {
  loadedPdfBytes = null;
  loadedPdfDoc = null;
  loadedFilename = null;
  fileInput.value = '';
  rangesInput.value = '';
  controls.classList.add('hidden');
  fileMeta.classList.add('hidden');
  status('Ready.');
});

extractBtn.addEventListener('click', async () => {
  if (!loadedPdfDoc) return;
  const total = loadedPdfDoc.getPageCount();
  const sel = parseRanges(rangesInput.value, total);
  if (sel.length === 0) {
    // If nothing specified, export all pages
    for (let i=0; i<total; i++) sel.push(i);
  }
  status('Extracting…');
  extractBtn.disabled = true;

  try {
    const { PDFDocument } = PDFLib;
    const outPdf = await PDFDocument.create();
    const copied = await outPdf.copyPages(loadedPdfDoc, sel);
    copied.forEach(p => outPdf.addPage(p));
    const outBytes = await outPdf.save();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const base = (loadedFilename || 'document').replace(/\.pdf$/i, '');
    const name = sel.length === total ? base + '-all-pages.pdf' : base + '-extracted-pages.pdf';
    downloadBlob(blob, name);
    status('Done. Your download should begin automatically.');
  } catch (err) {
    console.error(err);
    status('Sorry, something went wrong while extracting pages.');
  } finally {
    extractBtn.disabled = false;
  }
});

async function handleFile(file) {
  if (!file || file.type !== 'application/pdf') {
    status('Please choose a valid PDF file.');
    return;
  }
  status('Loading PDF…');
  loadedFilename = file.name;
  loadedPdfBytes = await file.arrayBuffer();
  const { PDFDocument } = PDFLib;
  loadedPdfDoc = await PDFDocument.load(loadedPdfBytes);
  const pages = loadedPdfDoc.getPageCount();
  fileMeta.innerHTML = `<strong>File:</strong> ${escapeHtml(file.name)} · <strong>Pages:</strong> ${pages}`;
  fileMeta.classList.remove('hidden');
  controls.classList.remove('hidden');
  status('PDF ready. Enter page ranges or leave blank to export all.');
}

function parseRanges(input, totalPages) {
  // Returns zero-based page indices
  const out = [];
  const s = (input || '').trim();
  if (!s) return out;
  const parts = s.split(',').map(x => x.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    let start = parseInt(m[1], 10);
    let end = m[2] ? parseInt(m[2], 10) : start;
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (start < 1) start = 1;
    if (end < 1) end = 1;
    if (start > totalPages) start = totalPages;
    if (end > totalPages) end = totalPages;
    if (start > end) [start, end] = [end, start];
    for (let i = start; i <= end; i++) out.push(i - 1);
  }
  // Deduplicate & sort
  return Array.from(new Set(out)).sort((a,b) => a - b);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function status(msg) {
  statusEl.textContent = msg || '';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
