// Produces tone-mark-audit.txt. Run from apps/backend: node ../../evidence/document-precheck-task-9/tone-mark-audit.js
// Tone-mark audit: for every legible OCR'd variant, compare tone marks (U+0E48-U+0E4B) with the
// same slot's faithful text-layer read (correct-text), per word position is not attempted — counts
// per mark, plus the words of the on-file name.
const path=require('path');
const {extractDocument}=require(path.resolve('services/document-precheck/extract'));
const {composeSaraAm}=require(path.resolve('services/document-precheck/normalize'));
const labels=require(path.resolve('__tests__/fixtures/document-precheck/labels.json'));
const D='__tests__/fixtures/document-precheck/corpus/';
const MARKS={'่':'mai ek','้':'mai tho','๊':'mai tri','๋':'mai chattawa'};
const count=(t)=>Object.fromEntries(Object.keys(MARKS).map(m=>[MARKS[m],[...t].filter(c=>c===m).length]));
(async()=>{
 const slots=Object.keys(labels.references);
 let tot={src:{},ocr:{}};
 for(const s of slots){
  const src=(await extractDocument(D+s+'--correct-text.pdf','application/pdf')).pages.map(p=>p.text).join('\n');
  const cs=count(src);
  for(const v of ['correct-scan','scan-blur','scan-rotate3']){
   const f=D+s+'--'+v+(v==='correct-scan'?'.pdf':'.png');
   const ocr=composeSaraAm((await extractDocument(f,f.endsWith('pdf')?'application/pdf':'image/png')).pages.map(p=>p.text).join('\n'));
   const co=count(ocr);
   for(const k of Object.keys(cs)){tot.src[k]=(tot.src[k]||0)+cs[k];tot.ocr[k]=(tot.ocr[k]||0)+co[k];}
   const name=labels.references[s].applicantName||labels.references[s].entityName;
   const nameOk=name.split(' ').every(w=>ocr.includes(w));
   console.log(`${s}--${v}: `+Object.keys(cs).map(k=>`${k} ${co[k]}/${cs[k]}`).join('  ')+`   on-file name words verbatim in OCR: ${nameOk}`);
  }
 }
 console.log('TOTAL (OCR/text-layer): '+Object.keys(tot.src).map(k=>`${k} ${tot.ocr[k]}/${tot.src[k]}`).join('  '));
})();
