(() => {
  'use strict';
  const root=document.documentElement, scroller=document.querySelector('#scroller');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const screens=[...document.querySelectorAll('.screen')];
  let ready=false,scrollFrame=0,previousFrame=0,scrollTarget=scroller.scrollTop;
  const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
  const maxScroll=()=>Math.max(0,scroller.scrollHeight-scroller.clientHeight);
  function stopScroll(){
    cancelAnimationFrame(scrollFrame);scrollFrame=0;previousFrame=0;scrollTarget=scroller.scrollTop;
  }
  function smoothFrame(now){
    const dt=previousFrame?Math.min(now-previousFrame,50):16.67;previousFrame=now;
    scrollTarget=clamp(scrollTarget,0,maxScroll());
    const current=scroller.scrollTop,distance=scrollTarget-current;
    if(Math.abs(distance)<.8){scroller.scrollTop=scrollTarget;scrollFrame=0;previousFrame=0;return;}
    scroller.scrollTop=current+distance*(1-Math.exp(-dt/240));
    scrollFrame=requestAnimationFrame(smoothFrame);
  }
  function scrollToPosition(destination){
    scrollTarget=clamp(destination,0,maxScroll());
    if(reduced.matches){const next=scrollTarget;stopScroll();scroller.scrollTop=next;scrollTarget=next;return;}
    if(!scrollFrame){previousFrame=0;scrollFrame=requestAnimationFrame(smoothFrame);}
  }
  function goTo(section){scrollToPosition(section.offsetTop);}
  // Continuous wheel distance, with easing; no screen index or snap threshold.
  scroller.addEventListener('wheel',e=>{
    if(!ready||reduced.matches||e.ctrlKey||e.defaultPrevented||document.body.classList.contains('menu-open')||document.body.classList.contains('page-changing')||document.querySelector('#video-dialog[open]')||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    if(!e.deltaY)return;
    e.preventDefault();
    const unit=e.deltaMode===1?16:e.deltaMode===2?scroller.clientHeight:1;
    const delta=e.deltaY*unit;
    // Reversing direction immediately cancels the previous momentum.
    const pending=scrollTarget-scroller.scrollTop;
    if(scrollFrame&&Math.sign(delta)!==Math.sign(pending))stopScroll();
    scrollToPosition((scrollFrame?scrollTarget:scroller.scrollTop)+delta);
  },{passive:false});
  // Touch, keyboard and scrollbar retain native free scrolling.
  scroller.addEventListener('touchstart',stopScroll,{passive:true});
  scroller.addEventListener('pointerdown',stopScroll,{passive:true});
  document.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' ','Tab'].includes(e.key))stopScroll();});
  scroller.addEventListener('scroll',()=>{if(!scrollFrame)scrollTarget=scroller.scrollTop;},{passive:true});
  reduced.addEventListener('change',stopScroll);

  // One GPU context is reused for all images; the DOM canvases are 2D surfaces.
  // Pixel-grid reveal follows the first variation of the supplied Codrops demo.
  class ImageRenderer{
    constructor(){
      this.surface=document.createElement('canvas');
      this.gl=this.surface.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
      if(!this.gl)throw new Error('WebGL unavailable');
      const gl=this.gl;
      const vertex='attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}';
      const fragment=`precision mediump float;
        varying vec2 uv;uniform sampler2D picture;uniform float progress;uniform vec2 imageSize;uniform vec2 boxSize;
        vec2 cover(vec2 p){float imageAspect=imageSize.x/imageSize.y;float boxAspect=boxSize.x/boxSize.y;
          return (p-.5)*vec2(min(boxAspect/imageAspect,1.),min(imageAspect/boxAspect,1.))+.5;}
        float cubic(float p){return p<.5?4.*p*p*p:1.-pow(-2.*p+2.,3.)/2.;}
        void main(){
          float p=clamp(progress,0.,1.);float reveal=1.-pow(1.-clamp(p/.8,0.,1.),3.);
          float pixelP=floor(clamp((p-.3)/.7,0.,1.)*12.)/12.;
          float columns=floor(mix(11.,50.,1.-pow(1.-pixelP,2.)));
          vec2 grid=vec2(columns,max(1.,floor(columns*boxSize.y/boxSize.x)));
          vec2 pixelUv=(floor(uv*grid)+.5)/grid;
          vec3 pixel=texture2D(picture,cover(pixelUv)).rgb;
          vec3 detail=texture2D(picture,cover(uv)).rgb;
          float sharp=clamp((p-.75)/.25,0.,1.);
          vec3 color=mix(pixel,detail,sharp);
          vec2 cell=fract(uv*grid);vec2 edges=min(cell,1.-cell);
          float line=1.-smoothstep(.015*(1.-p),.07*(1.-p)+.001,min(edges.x,edges.y));
          color=mix(color,vec3(0.),line*.3*(1.-sharp));
          float width=mix(.4,.2,p);float front=mix(-width,1.-width,cubic(p));
          float blackMask=smoothstep(front,front+width,uv.x);
          color=mix(color,vec3(0.),blackMask*(1.-sharp));
          if(uv.x>reveal)color=vec3(0.);
          gl_FragColor=vec4(color,1.);
        }`;
      const shader=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Image shader compilation failed');return s;};
      this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Image shader linking failed');
      gl.useProgram(this.program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      this.locations=Object.fromEntries(['progress','imageSize','boxSize'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
      this.surface.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});
    }
    texture(image){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);return t;}
    draw(item,p){if(this.lost)throw new Error('Image context lost');const gl=this.gl,canvas=item.canvas;if(this.surface.width!==canvas.width||this.surface.height!==canvas.height){this.surface.width=canvas.width;this.surface.height=canvas.height;}gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(this.program);gl.bindTexture(gl.TEXTURE_2D,item.texture);gl.uniform1f(this.locations.progress,p);gl.uniform2f(this.locations.imageSize,item.img.naturalWidth,item.img.naturalHeight);gl.uniform2f(this.locations.boxSize,canvas.width,canvas.height);gl.drawArrays(gl.TRIANGLES,0,6);item.context.drawImage(this.surface,0,0);}
  }
  let renderer;
  const imageItems=new Map();
  function finishImage(item){cancelAnimationFrame(item.frame);if(item.texture&&renderer){renderer.gl.deleteTexture(item.texture);item.texture=null;}item.img.classList.remove('image-reveal-pending');item.img.classList.add('visible');item.canvas?.remove();item.canvas=null;item.done=true;}
  function placeCanvas(item){const {img,canvas}=item;if(!canvas)return;const style=getComputedStyle(img),w=img.offsetWidth,h=img.offsetHeight,dpr=Math.min(devicePixelRatio,1.5);if(!w||!h){canvas.style.display="none";return;}canvas.style.display="block";Object.assign(canvas.style,{left:img.offsetLeft+'px',top:img.offsetTop+'px',width:w+'px',height:h+'px',transform:style.transform,transformOrigin:style.transformOrigin,opacity:style.opacity,borderRadius:style.borderRadius});const pw=Math.round(w*dpr),ph=Math.round(h*dpr);if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;item.context.fillStyle='#000';item.context.fillRect(0,0,pw,ph);}}
  function prepareImage(img){
    if(reduced.matches)return;
    let item=imageItems.get(img);if(item)finishImage(item);
    if(getComputedStyle(img.parentElement).position==='static')img.parentElement.style.position='relative';
    const canvas=document.createElement('canvas');canvas.className='image-reveal-canvas';canvas.setAttribute('aria-hidden','true');img.after(canvas);
    item={img,canvas,context:canvas.getContext('2d'),done:false,started:false,texture:null,frame:0};imageItems.set(img,item);img.classList.remove('reveal');img.classList.add('image-reveal-pending');placeCanvas(item);return item;
  }
  function revealImage(item){
    if(!item||item.started||item.done)return;item.started=true;
    if(reduced.matches||!item.img.naturalWidth){finishImage(item);return;}
    try{renderer??=new ImageRenderer();item.texture=renderer.texture(item.img);placeCanvas(item);}catch{finishImage(item);return;}
    const begin=performance.now();
    const frame=now=>{const p=clamp((now-begin)/1200);try{placeCanvas(item);renderer.draw(item,p);}catch{finishImage(item);return;}if(p<1)item.frame=requestAnimationFrame(frame);else finishImage(item);};item.frame=requestAnimationFrame(frame);
  }
  const imageObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&ready){revealImage(imageItems.get(e.target));imageObserver.unobserve(e.target);}},{root:scroller,threshold:.05});

  function splitText(element){
    element.classList.add('text-reveal');
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())if(walker.currentNode.textContent.trim())nodes.push(walker.currentNode);
    for(const text of nodes){const fragment=document.createDocumentFragment();for(const token of text.textContent.split(/(\s+)/)){if(!token)continue;if(/^\s+$/.test(token))fragment.append(document.createTextNode(token));else{const word=document.createElement('motion-word'),ink=document.createElement('motion-ink');ink.textContent=token;word.append(ink);fragment.append(word);}}text.replaceWith(fragment);}
    measureLines(element);
  }
  function measureLines(element){let previous=-Infinity,line=-1;for(const word of element.querySelectorAll('motion-word')){const top=Math.round(word.getBoundingClientRect().top);if(Math.abs(top-previous)>5){line++;previous=top;}word.style.setProperty('--line-delay',`${line*50}ms`);word.style.setProperty('--line-duration',`${700*(1+line*.04)}ms`);}}
  const textObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&ready){e.target.classList.add('is-revealed','visible');textObserver.unobserve(e.target);}},{root:scroller,threshold:.05});
  const simpleObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&ready){e.target.classList.add('visible');simpleObserver.unobserve(e.target);}},{root:scroller,threshold:.05});

  function initCursor(){
    const cursor=document.querySelector('.rec-cursor'),fine=matchMedia('(hover:hover) and (pointer:fine)');let x=0,y=0;
    function updateHover(){if(!cursor.classList.contains('is-visible'))return;const target=document.elementFromPoint(x,y);cursor.classList.toggle('is-hovered',!!target?.closest('a[href],button:not(:disabled),[role="option"]'));}
    // The red dot is the click hotspot. Never offset or ease it away from the native pointer.
    document.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||!fine.matches||reduced.matches)return;x=e.clientX;y=e.clientY;cursor.style.transform=`translate3d(${x-4}px,${y-4}px,0)`;root.classList.add('has-rec-cursor');cursor.classList.add('is-visible');updateHover();},{passive:true});
    document.addEventListener('pointerover',updateHover,{passive:true});
    scroller.addEventListener('scroll',updateHover,{passive:true});
    function hide(){cursor.classList.remove('is-visible','is-hovered');root.classList.remove('has-rec-cursor');}
    document.addEventListener('pointerout',e=>{if(!e.relatedTarget)hide();});window.addEventListener('blur',hide);fine.addEventListener('change',hide);reduced.addEventListener('change',hide);
  }

  async function boot(){
    initCursor();
    const loader=document.querySelector('.preloader'),bar=document.querySelector('.loader-progress>span'),status=document.querySelector('.loader-status');
    scroller.inert=true;document.querySelector('.rail').inert=true;
    const backgrounds=[...new Set(screens.flatMap(section=>[...getComputedStyle(section,'::before').backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>m[1])))].map(url=>{const img=new Image();img.src=url;return img;});
    const texture=new Image();texture.src="assets/d0-img071.jpg?v=3";const images=[...backgrounds,texture];let count=0;const total=images.length+1;
    const progress=()=>{count++;bar.style.transform=`scaleX(${count/total})`;status.textContent=`ЗАГРУЗКА ${Math.round(count/total*100)}%`;};
    const loadImage=async image=>{if(!image.complete)await new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});if(image.naturalWidth&&image.decode)await image.decode().catch(()=>{});progress();};
    await Promise.race([Promise.allSettled([...images.map(loadImage),document.fonts.ready.then(progress)]),new Promise(resolve=>setTimeout(resolve,2500))]);
    const targets=[...document.querySelectorAll('.screen h1,.screen h2,.screen p:not(#form-status):not(#brief-status):not(#brief-file-error)')];
    for(const element of targets)splitText(element);
    for(const img of document.querySelectorAll('.screen img'))if(!img.closest('.cut-button,.email,.sound,.case-controls,.story-track,.aperture-play,.origin-more,.brief-select,.contact-breadcrumb')&&img.naturalWidth){prepareImage(img);}
    scroller.inert=false;document.querySelector('.rail').inert=false;ready=true;
    root.classList.remove('is-loading');root.classList.add('is-ready');status.textContent='ГОТОВО';loader.classList.add('is-complete');
    loader.addEventListener('transitionend',()=>loader.remove(),{once:true});if(reduced.matches)loader.remove();
    targets.forEach(el=>textObserver.observe(el));
    document.querySelectorAll('.reveal:not(.text-reveal)').forEach(el=>simpleObserver.observe(el));
    imageItems.forEach(item=>imageObserver.observe(item.img));
    document.querySelectorAll(".screen img").forEach(img=>{if(!img.complete)img.addEventListener("load",()=>{if(!imageItems.has(img)&&!img.closest(".cut-button,.email,.sound,.case-controls,.story-track,.aperture-play,.origin-more,.brief-select,.contact-breadcrumb")){prepareImage(img);imageObserver.observe(img);}},{once:true});});
    let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{targets.forEach(measureLines);imageItems.forEach(placeCanvas);},100);});
    new MutationObserver(records=>{for(const r of records){const img=r.target;if(!imageItems.has(img))continue;img.decode().then(()=>{const item=prepareImage(img);imageObserver.observe(img);const rect=img.getBoundingClientRect();if(rect.bottom>0&&rect.top<innerHeight)revealImage(item);}).catch(()=>{});}}).observe(scroller,{subtree:true,attributes:true,attributeFilter:['src']});
    reduced.addEventListener('change',()=>{if(reduced.matches){imageItems.forEach(finishImage);targets.forEach(el=>el.classList.add('is-revealed'));}});
  }
  window.SiteMotion={goTo,stop:stopScroll,refresh:()=>{document.querySelectorAll('.text-reveal').forEach(measureLines);imageItems.forEach(placeCanvas);}};
  boot().catch(()=>{ready=true;root.classList.remove('is-loading');document.querySelector('.preloader')?.remove();scroller.inert=false;document.querySelector('.rail').inert=false;document.querySelectorAll('.reveal,.text-reveal').forEach(el=>el.classList.add('visible','is-revealed'));imageItems.forEach(finishImage);});
})();
