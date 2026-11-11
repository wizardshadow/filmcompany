(() => {
 'use strict';
 const hero=document.querySelector('#home'),home=document.querySelector('#home-page'),scroller=document.querySelector('#scroller');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover:hover) and (pointer:fine)');
 const layers=[['.hero-intro',8,2],['.hero-picture',22,4],['h1',12,2.5],['.hero-tagline',9,2],['.hero-bottom>button',4,.7],['.hero-bottom>a',5,.8],['.hero-bottom nav>a',4,.7]].flatMap(([selector,depth,float])=>[...hero.querySelectorAll(selector)].map(el=>({el,depth,float,x:0,y:0,held:false})));
 layers.forEach(({el})=>el.classList.add('hero-float-layer'));
 let mx=0,my=0,frame=0,last=0,phase=0,visible=false;
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 function allowed(){return visible&&!home.hidden&&!reduced.matches&&!document.hidden&&document.documentElement.classList.contains('is-ready')&&!document.body.classList.contains('menu-open')&&!document.body.classList.contains('page-changing');}
 function stop(){cancelAnimationFrame(frame);frame=0;last=0;}
 function reset(){stop();mx=my=0;layers.forEach(layer=>{layer.x=layer.y=0;layer.el.style.removeProperty('--float-x');layer.el.style.removeProperty('--float-y');});}
 function tick(now){
  if(!allowed()){stop();return;}
  const dt=last?Math.min(now-last,40):16.67;last=now;phase+=dt/1000;
  const ease=1-Math.exp(-dt/180),mobile=!fine.matches,progress=clamp(scroller.scrollTop/hero.offsetHeight,0,1),strength=mobile?.45:1;
  layers.forEach((layer,index)=>{
   if(layer.held||layer.el.contains(document.activeElement))return;
   const wave=phase*.65+index*.75;
   const tx=mobile?0:(mx*layer.depth+Math.sin(wave)*layer.float);
   const ty=(mobile?0:my*layer.depth*.65+Math.cos(wave*.85)*layer.float)-progress*layer.depth*1.7;
   layer.x+=(tx*strength-layer.x)*ease;layer.y+=(ty*strength-layer.y)*ease;
   layer.el.style.setProperty('--float-x',layer.x.toFixed(3)+'px');layer.el.style.setProperty('--float-y',layer.y.toFixed(3)+'px');
  });
  frame=requestAnimationFrame(tick);
 }
 function start(){if(allowed()&&!frame)frame=requestAnimationFrame(tick);else if(!allowed())stop();}
 hero.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse'||!fine.matches)return;const r=hero.getBoundingClientRect();mx=clamp((event.clientX-r.left)/r.width*2-1,-1,1);my=clamp((event.clientY-r.top)/r.height*2-1,-1,1);start();},{passive:true});
 hero.addEventListener('pointerleave',()=>{mx=my=0;});
 layers.filter(({el})=>el.matches('a,button')).forEach(layer=>{layer.el.addEventListener('pointerenter',()=>layer.held=true);layer.el.addEventListener('pointerleave',()=>layer.held=false);});
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;start();},{root:scroller,threshold:0}).observe(hero);
 new MutationObserver(start).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 new MutationObserver(start).observe(document.body,{attributes:true,attributeFilter:['class']});
 new MutationObserver(()=>{if(home.hidden)reset();else start();}).observe(home,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('visibilitychange',start);
 reduced.addEventListener('change',()=>{reset();start();});fine.addEventListener('change',()=>{reset();start();});
})();
