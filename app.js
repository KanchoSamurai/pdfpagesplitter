/* Enhanced app.js: progress bar + Plausible events + friendlier errors */
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const workArea = document.getElementById('workArea');
const fileNameEl = document.getElementById('fileName');
const pageCountEl = document.getElementById('pageCount');
const rangeInput = document.getElementById('rangeInput');
const statusEl = document.getElementById('status');
const btnExtract = document.getElementById('btnExtract');
const btnRemove = document.getElementById('btnRemove');
const btnSplitAll = document.getElementById('btnSplitAll');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

let loadedPdf = null;

document.getElementById('year').textContent = new Date().getFullYear();

function setStatus(msg) {
  statusEl.textContent = msg || '';
}

function showProgress(show, text, pct=0) {
  if (show) {
    progressWrap.classList.remove('hidden');
    progressWrap.setAttribute('aria-hidden', 'false');
    progressText.textContent = text || 'Working…';
    progressBar.style.width = `${pct}%`;
  } else {
    progressWrap.classList.add('hidden');
    progressWrap.setAttribute('aria-hidden', 'true');
    progressBar.style.width = '0%';
  }
}

function disableAll(disabled) {
  [btnExtract, btnRemove, btnSplitAll, fileInput].forEach(el => el.disabled = disabled);
}

function parseRanges(input, maxPage) {
  if (!input) return [];
  const cleaned = input.replace(/\s+/g, '');
  if (!cleaned) return [];
  const parts = cleaned.split(',');
  const set = new Set();
  for (let p of parts) {
    if (p.includes('-')) {
      let [a,b] = p.split('-').map(n => parseInt(n,10));
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      if (a > b) [a,b] = [b,a];
      a = Math.max(1, a); b = Math.min(maxPage, b);
      for (let i=a; i<=b; i++) set.add(i);
    } else {
      const n = parseInt(p,10);
      if (!Number.isNaN(n) && n>=1 && n<=maxPage) set.add(n);
    }
  }
  return Array.from(set).sort((x,y)=>x-y);
}

async function handleFile(file) {
  if (!file) return;
  try {
    if (file.size > 250 * 1024 * 1024) {
      setStatus('This file is quite large. If processing stalls, try splitting in chunks or using Chrome/Edge.');
    }
    setStatus('Reading PDF…');
    const loadedBytes = await file.arrayBuffer();
    try {
      loadedPdf = await PDFLib.PDFDocument.load(loadedBytes, { ignoreEncryption: false });
    } catch (e) {
      setStatus('This PDF appears to be password-protected. Please unlock it first.');
      return;
    }
    fileNameEl.textContent = file.name;
    pageCountEl.textContent = loadedPdf.getPageCount();
    workArea.classList.remove('hidden');
    setStatus('Ready.');
    window.plausible && plausible('FileLoaded');
  } catch (e) {
    console.error(e);
    setStatus('Sorry, that PDF could not be processed.');
  }
}

dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', ()=> dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', (e)=>{
  e.preventDefault();
  dropZone.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  handleFile(f);
});
fileInput.addEventListener('change', (e)=> handleFile(e.target.files[0]));

async function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

btnExtract.addEventListener('click', async ()=>{
  if (!loadedPdf) return;
  disableAll(true);
  try {
    const total = loadedPdf.getPageCount();
    const picks = parseRanges(rangeInput.value, total);
    if (picks.length===0) { setStatus('Please enter a valid page range.'); return; }
    setStatus('Extracting pages…');
    const out = await PDFLib.PDFDocument.create();
    const indices = picks.map(n=>n-1);
    const copied = await out.copyPages(loadedPdf, indices);
    copied.forEach(p=>out.addPage(p));
    const bytes = await out.save({ updateFieldAppearances: false });
    await saveBlob(new Blob([bytes], {type:'application/pdf'}), `extracted_${picks[0]}-${picks[picks.length-1]}.pdf`);
    setStatus(`Done. Extracted ${picks.length} pages.`);
    window.plausible && plausible('ExtractRange');
  } catch (e) {
    console.error(e);
    setStatus('Extraction failed. The PDF might be encrypted or corrupted.');
  } finally {
    disableAll(false);
  }
});

btnRemove.addEventListener('click', async ()=>{
  if (!loadedPdf) return;
  disableAll(true);
  try {
    const total = loadedPdf.getPageCount();
    const removes = new Set(parseRanges(rangeInput.value, total));
    if (removes.size===0) { setStatus('Please enter pages to remove.'); return; }
    setStatus('Removing pages…');
    const out = await PDFLib.PDFDocument.create();
    const keep = [];
    for (let i=1;i<=total;i++){ if (!removes.has(i)) keep.push(i-1); }
    if (keep.length===0){ setStatus('You removed all pages'); return; }
    const copied = await out.copyPages(loadedPdf, keep);
    copied.forEach(p=>out.addPage(p));
    const bytes = await out.save();
    await saveBlob(new Blob([bytes], {type:'application/pdf'}), `kept_${keep.length}_pages.pdf`);
    setStatus(`Done. Kept ${keep.length} pages.`);
    window.plausible && plausible('RemovePages');
  } catch (e) {
    console.error(e);
    setStatus('Remove failed. The PDF might be encrypted or too large.');
  } finally {
    disableAll(false);
  }
});

btnSplitAll.addEventListener('click', async ()=>{
  if (!loadedPdf) return;
  disableAll(true);
  try {
    const total = loadedPdf.getPageCount();
    setStatus(`Splitting ${total} pages… This can take time for large files.`);
    showProgress(true, 'Splitting pages…', 0);
    const zip = new JSZip();
    for (let i=0;i<total;i++){
      const out = await PDFLib.PDFDocument.create();
      const [p] = await out.copyPages(loadedPdf, [i]);
      out.addPage(p);
      const bytes = await out.save();
      const name = `page_${String(i+1).padStart(3,'0')}.pdf`;
      zip.file(name, bytes);
      const pct = Math.round(((i+1)/total)*100);
      progressBar.style.width = pct + '%';
      progressText.textContent = `Splitting pages… ${pct}%`;
    }
    const content = await zip.generateAsync({type:'blob'});
    await saveBlob(content, 'split_pages.zip');
    setStatus('ZIP downloaded.');
    window.plausible && plausible('SplitAll');
  } catch (e) {
    console.error(e);
    setStatus('Split failed. Try with a smaller file or a different browser.');
  } finally {
    showProgress(false);
    disableAll(false);
  }
});
