// Keep recognition local: improve contrast per class area, without uploading the file.
export function prepareImage(source,{maxWidth=3600,maxPixels=10000000,maxScale=3}={}){
  const width=source.width||source.naturalWidth,height=source.height||source.naturalHeight;
  const scale=Math.min(maxScale,maxWidth/width,Math.sqrt(maxPixels/(width*height)));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const image=ctx.getImageData(0,0,canvas.width,canvas.height),hist=new Uint32Array(256);
  for(let i=0;i<image.data.length;i+=16){const g=Math.round(image.data[i]*.299+image.data[i+1]*.587+image.data[i+2]*.114);hist[g]++}
  const total=hist.reduce((n,v)=>n+v,0),percentile=p=>{let sum=0;for(let n=0;n<256;n++){sum+=hist[n];if(sum>=total*p)return n}return 255};
  // Sparse white text can occupy less than 2% of a dark timetable. Preserve it
  // and colored weekday panels instead of clipping them to the same black level.
  const invert=percentile(.5)<128,low=Math.min(35,percentile(.001)),high=Math.max(220,percentile(.999));
  for(let i=0;i<image.data.length;i+=4){let g=image.data[i]*.299+image.data[i+1]*.587+image.data[i+2]*.114;if(high-low>45)g=(g-low)*255/(high-low);if(invert)g=255-g;g=Math.max(0,Math.min(255,g));if(invert&&g>135)g=255;image.data[i]=image.data[i+1]=image.data[i+2]=g;image.data[i+3]=255}
  ctx.putImageData(image,0,0);return canvas;
}
export function cropClass(source,region){
  const x=Math.floor(Math.max(0,region.x0)),y=Math.floor(Math.max(0,region.y0));
  const crop=document.createElement('canvas');crop.width=Math.max(1,Math.ceil(region.x1)-x);crop.height=Math.max(1,Math.ceil(region.y1)-y);
  crop.getContext('2d').drawImage(source,x,y,crop.width,crop.height,0,0,crop.width,crop.height);
  const prepared=prepareImage(crop,{maxWidth:2400,maxPixels:3000000,maxScale:1});
  const scale=prepared.width/crop.width;crop.width=crop.height=1;
  removeGridLines(prepared);
  return {canvas:prepared,x,y,scale};
}
export function removeGridLines(canvas){
  // Rule detection operates on straight runs, not complete dark regions.
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),im=ctx.getImageData(0,0,canvas.width,canvas.height),w=canvas.width,h=canvas.height,erase=[];
  const dark=(xx,yy)=>im.data[(yy*w+xx)*4]<190;
  const thin=(start,end,fixed,horizontal)=>{
    let light=0,count=0;
    for(let p=start+3;p<end-3;p+=Math.max(5,Math.floor((end-start)/25))){
      const x=horizontal?p:fixed,y=horizontal?fixed:p;
      const a=horizontal?y-5:x-5,b=horizontal?y+5:x+5;
      if(a<0||b>=(horizontal?h:w))continue;
      const before=horizontal?dark(x,a):dark(a,y),after=horizontal?dark(x,b):dark(b,y);
      count++;if(!before&&!after)light++;
    }
    return count>0&&light/count>.65;
  };
  for(let yy=0;yy<h;yy++){let start=-1;for(let xx=0;xx<=w;xx++){if(xx<w&&dark(xx,yy)){if(start<0)start=xx}else if(start>=0){if(xx-start>Math.max(90,w*.035)&&thin(start,xx,yy,true))erase.push({horizontal:true,start,end:xx,fixed:yy});start=-1}}}
  for(let xx=0;xx<w;xx++){let start=-1;for(let yy=0;yy<=h;yy++){if(yy<h&&dark(xx,yy)){if(start<0)start=yy}else if(start>=0){if(yy-start>Math.max(55,h*.035)&&thin(start,yy,xx,false))erase.push({horizontal:false,start,end:yy,fixed:xx});start=-1}}}
  for(const line of erase)for(let p=line.start;p<line.end;p++){const at=(line.horizontal?line.fixed*w+p:p*w+line.fixed)*4;im.data[at]=im.data[at+1]=im.data[at+2]=255}
  ctx.putImageData(im,0,0);
  return canvas;
}
