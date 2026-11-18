import {parseSpatial,parsePlainText,parseDelimited,parseTable,validateDraft,timetableRegions,chooseExtraction,extractionQuality,parseNamedDay,mergeClassReadings,parseRoomText} from './import-parser.js';
import {groupLines} from './import-layout.js';
import {prepareImage,cropClass,removeGridLines} from './import-image.js';
let ocrScript;
const loadOCR=()=>ocrScript||(ocrScript=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/ocr/tesseract.min.js';script.onload=resolve;script.onerror=()=>reject(Error('Text-recognition files could not load. Refresh the page and try again.'));document.head.append(script)}));
function flatten(data){const tokens=[];for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[])for(const word of line.words||[])tokens.push({text:word.text,box:word.bbox,confidence:word.confidence});return tokens}
function detect(tokens,text,dimensions){return chooseExtraction(parseSpatial(tokens,dimensions),parsePlainText(text,dimensions.source))}
async function recognize(source,options,label){
  await loadOCR();if(options.cancelled())throw Error('Cancelled');
  options.progress('Starting text recognition',0);
  const worker=await window.Tesseract.createWorker(options.language==='eng+ara'?['eng','ara']:'eng',1,{
    workerPath:location.origin+'/vendor/ocr/worker.min.js',corePath:location.origin+'/vendor/ocr/core',
    langPath:location.origin+'/vendor/ocr/lang',gzip:false,workerBlobURL:false,cacheMethod:'none'
  });
  options.onCancel(()=>worker.terminate());
  let canvas;
  try{
    if(options.cancelled())throw Error('Cancelled');
    canvas=removeGridLines(prepareImage(source));
    const dimensions={width:canvas.width,height:canvas.height,source:label};
    await worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});
    options.progress('Finding class areas in '+label,5);
    let {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});
    let tokens=flatten(data),regions=timetableRegions(tokens,dimensions),whole=detect(tokens,data.text,dimensions);
    // Colored weekday panels need their own contrast correction. Read the label
    // strips separately before assigning any class to a row or column.
    const firstX=regions.length?Math.min(...regions.map(r=>r.anchor.box.x0)):canvas.width*.3;
    const firstY=regions.length?Math.min(...regions.map(r=>r.anchor.box.y0)):canvas.height*.3;
    const strips=[{x0:0,y0:0,x1:Math.min(canvas.width*.25,Math.max(canvas.width*.08,firstX*.65)),y1:canvas.height},
      {x0:0,y0:0,x1:canvas.width,y1:Math.min(canvas.height*.25,Math.max(canvas.height*.06,firstY*.65))}];
    await worker.setParameters({tessedit_pageseg_mode:'6'});
    for(const strip of strips){
      if(options.cancelled())throw Error('Cancelled');
      const crop=originalCrop(source,strip,canvas);
      try{
        const labels=flatten((await worker.recognize(crop.canvas,{}, {text:true,blocks:true})).data).filter(t=>parseNamedDay(t.text)).map(t=>({...t,box:{x0:t.box.x0/crop.scale+strip.x0,x1:t.box.x1/crop.scale+strip.x0,y0:t.box.y0/crop.scale+strip.y0,y1:t.box.y1/crop.scale+strip.y0}}));
        for(const label of labels){tokens=tokens.filter(t=>!parseNamedDay(t.text)||Math.abs((t.box.y0+t.box.y1-label.box.y0-label.box.y1)/2)>20||Math.abs((t.box.x0+t.box.x1-label.box.x0-label.box.x1)/2)>40);tokens.push(label)}
      }finally{crop.canvas.width=crop.canvas.height=1}
    }
    regions=timetableRegions(tokens,dimensions);whole=detect(tokens,data.text,dimensions);
    // Retry a normal page layout when sparse-text recognition has missed the timetable.
    if(!regions.length||extractionQuality(whole)<2){
      if(options.cancelled())throw Error('Cancelled');
      await worker.setParameters({tessedit_pageseg_mode:'3'});
      const retry=(await worker.recognize(canvas,{}, {text:true,blocks:true})).data;
      const retryTokens=[...flatten(retry),...tokens.filter(t=>parseNamedDay(t.text))],retryRegions=timetableRegions(retryTokens,dimensions);
      if(retryRegions.length>regions.length||extractionQuality(detect(retryTokens,retry.text,dimensions))>extractionQuality(whole)){
        data=retry;tokens=retryTokens;regions=retryRegions;whole=detect(tokens,data.text,dimensions);
      }
    }
    const rows=[],transcripts=[];
    await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
    for(let index=0;index<regions.length;index++){
      if(options.cancelled())throw Error('Cancelled');
      const region=regions[index];
      const original=parseSpatial(tokens,{...dimensions,regions:[region]})[0];
      // Bound work on long PDFs; preserve all remaining detected entries for review.
      if(index>=40){original.warnings.push('Detailed recognition was limited to the first 40 class areas. Check these details carefully.');rows.push(original);continue}
      options.progress('Reading class '+(index+1)+' of '+regions.length,Math.round(10+85*index/regions.length));
      // Crop from the original colors so each area gets its own light/dark correction.
      const cropped=originalCrop(source,region,canvas);
      try{
        const local=(await worker.recognize(cropped.canvas,{}, {text:true,blocks:true})).data;
        const localTokens=flatten(local),localDimensions={width:cropped.canvas.width,height:cropped.canvas.height,source:label};
        const newAnchor=timetableRegions(localTokens,localDimensions).find(r=>r.anchor.code===region.anchor.code)?.anchor;
        const anchor=newAnchor||{...region.anchor,box:{x0:(region.anchor.box.x0-region.x0)*cropped.scale,x1:(region.anchor.box.x1-region.x0)*cropped.scale,y0:(region.anchor.box.y0-region.y0)*cropped.scale,y1:(region.anchor.box.y1-region.y0)*cropped.scale}};
        const refined=parseSpatial(localTokens,{...localDimensions,regions:[{anchor,weekday:region.weekday,x0:0,y0:0,x1:localDimensions.width,y1:localDimensions.height}]})[0];
        // If a crop loses information, keep the better reading of the same class.
        const chosen=mergeClassReadings(original,refined);
        if(!chosen.room){
          const footer=groupLines(localTokens).find(l=>/\broom\b/i.test(l.text)&&l.y>anchor.box.y1);
          if(footer){
            const words=footer.words.filter(w=>!/^(?:lect|sec|lab|tutorial)/i.test(w.text));
            const x0=Math.max(0,Math.min(...words.map(w=>w.box.x0))-6),y0=Math.max(0,Math.min(...words.map(w=>w.box.y0))-6);
            const x1=Math.min(cropped.canvas.width,Math.max(...words.map(w=>w.box.x1))+6),y1=Math.min(cropped.canvas.height,Math.max(...words.map(w=>w.box.y1))+6);
            const line=document.createElement('canvas');line.width=Math.ceil((x1-x0)*2);line.height=Math.ceil((y1-y0)*2);
            line.getContext('2d').drawImage(cropped.canvas,x0,y0,x1-x0,y1-y0,0,0,line.width,line.height);
            try{
              await worker.setParameters({tessedit_pageseg_mode:'7'});
              const roomData=(await worker.recognize(line,{}, {text:true,blocks:true})).data;
              const room=parseRoomText(roomData.text);
              if(room){chosen.room=room;chosen.warnings=chosen.warnings.filter(w=>w!=='Room number was unclear. Enter it from your file.')}
            }finally{line.width=line.height=1;await worker.setParameters({tessedit_pageseg_mode:'6'})}
          }
        }
        rows.push(chosen);transcripts.push(local.text);
      }finally{cropped.canvas.width=cropped.canvas.height=1}
    }
    return {rows:rows.length?rows:whole,text:transcripts.length?transcripts.join('\n\n'):data.text};
  }finally{if(canvas)canvas.width=canvas.height=1;await worker.terminate().catch(()=>{})}
}
function originalCrop(source,region,full){
  const ratioX=(source.width||source.naturalWidth)/full.width,ratioY=(source.height||source.naturalHeight)/full.height;
  const raw=document.createElement('canvas');raw.width=Math.max(1,Math.ceil(region.x1-region.x0));raw.height=Math.max(1,Math.ceil(region.y1-region.y0));
  raw.getContext('2d').drawImage(source,region.x0*ratioX,region.y0*ratioY,(region.x1-region.x0)*ratioX,(region.y1-region.y0)*ratioY,0,0,raw.width,raw.height);
  const crop=cropClass(raw,{x0:0,y0:0,x1:raw.width,y1:raw.height});raw.width=raw.height=1;return crop;
}
function textLines(tokens){const lines=[];for(const t of tokens){const y=(t.box.y0+t.box.y1)/2;let line=lines.find(l=>Math.abs(l.y-y)<Math.max(3,(t.box.y1-t.box.y0)*.5));if(!line){line={y,items:[]};lines.push(line)}line.items.push(t)}return lines.sort((a,b)=>a.y-b.y).map(l=>l.items.sort((a,b)=>a.box.x0-b.box.x0).map(i=>i.text).join(' ')).join('\n')}
export async function readImportFile(file,options){if(file.size>15728640)throw Error(file.name+' is larger than 15 MB. Choose a smaller file.');const extension=file.name.toLowerCase().split('.').pop();if(['csv','tsv','txt'].includes(extension)){const text=await file.text();const rows=extension==='txt'?parsePlainText(text,file.name):parseTable(parseDelimited(text),file.name);return {rows,text,preview:null}}
if(['png','jpg','jpeg','webp'].includes(extension)){const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('This photo is too large. Resize it below 40 megapixels.')}const preview=document.createElement('canvas');const scale=Math.min(1,1000/bitmap.width);preview.width=Math.round(bitmap.width*scale);preview.height=Math.round(bitmap.height*scale);preview.getContext('2d').drawImage(bitmap,0,0,preview.width,preview.height);try{const result=await recognize(bitmap,options,file.name);return {...result,preview:preview.toDataURL('image/jpeg',.8)}}finally{bitmap.close()}}
if(extension==='pdf'){options.progress('Opening PDF',0);const pdfjs=await import('./vendor/pdf/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=location.origin+'/vendor/pdf/pdf.worker.mjs';const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'/vendor/pdf/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdf/standard_fonts/',wasmUrl:'/vendor/pdf/wasm/',isEvalSupported:false,enableXfa:false});let pdf;options.onCancel(()=>task.destroy());try{pdf=await task.promise}catch(error){await task.destroy().catch(()=>{});if(error.name==='PasswordException')throw Error('This PDF is password-protected. Upload an unlocked copy.');throw Error('This PDF could not be opened. Try a different copy or a screenshot.')}try{if(pdf.numPages>8)throw Error('Choose a PDF with up to 8 pages. Split a longer document first.');const rows=[],texts=[];let preview=null;for(let n=1;n<=pdf.numPages;n++){if(options.cancelled())throw Error('Cancelled');options.progress('Reading PDF page '+n+' of '+pdf.numPages,Math.round((n-1)/pdf.numPages*100));const page=await pdf.getPage(n),viewport=page.getViewport({scale:1}),content=await page.getTextContent();const tokens=content.items.filter(item=>item.str?.trim()).map(item=>{const transform=pdfjs.Util.transform(viewport.transform,item.transform),height=Math.max(5,Math.hypot(transform[2],transform[3]));return {text:item.str,box:{x0:transform[4],x1:transform[4]+item.width,y0:transform[5]-height,y1:transform[5]}}});let text=textLines(tokens),detected=detect(tokens,text,{width:viewport.width,height:viewport.height,source:file.name+' · page '+n});if(!preview||!detected.length||detected.some(r=>validateDraft(r).length>0)){const scale=Math.min(2,2200/viewport.width,Math.sqrt(6500000/(viewport.width*viewport.height))),renderViewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(renderViewport.width);canvas.height=Math.ceil(renderViewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:renderViewport}).promise;if(!preview)preview=canvas.toDataURL('image/jpeg',.8);if(!detected.length||detected.some(r=>validateDraft(r).length>0)){const result=await recognize(canvas,options,file.name+' · page '+n);detected=chooseExtraction(detected,result.rows);text=result.text}canvas.width=canvas.height=1}rows.push(...detected);texts.push(text);page.cleanup()}return {rows,text:texts.join('\n\n'),preview}}finally{await task.destroy()}}
throw Error('Upload a PNG, JPG, WebP, PDF, CSV, or TSV file.')}
