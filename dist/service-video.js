(() => {
 const items=[...document.querySelectorAll('.service')].map(card=>({card,video:card.querySelector('video'),hover:false,focus:false,ratio:0,wanted:false,pending:false,blocked:false}));
 const mobile=matchMedia('(max-width: 1000px), (hover: none)');let active=null;
 function start(item,gesture=false){
  if(!item.wanted||item.pending||(item.blocked&&!gesture))return;
  const v=item.video;v.muted=true;v.defaultMuted=true;v.playsInline=true;
  if(!v.getAttribute('src')){if(!v.dataset.src)return;v.src=v.dataset.src;v.load();}
  item.pending=true;
  v.play().then(()=>{item.pending=false;item.blocked=false;v.controls=false;if(!item.wanted)v.pause();}).catch(error=>{item.pending=false;if(!item.wanted)return;if(error.name==='NotAllowedError'){item.blocked=true;v.controls=false;}else if(error.name!=='AbortError')v.controls=false;});
 }
 function sync(){
  const best=items.filter(i=>i.ratio>=.25).sort((a,b)=>b.ratio-a.ratio)[0];
  if(!active||active.ratio<.2||(best&&best!==active&&best.ratio>active.ratio+.15))active=best||null;
  items.forEach(item=>{item.wanted=!document.hidden&&item.ratio>0&&(mobile.matches?item===active:item.hover||item.focus);item.card.classList.toggle("is-video-active",item.wanted);if(item.wanted)start(item);else item.video.pause();});
 }
 const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{const item=items.find(i=>i.video===e.target);item.ratio=e.isIntersecting?e.intersectionRatio:0;});sync();},{root:document.querySelector('#scroller'),threshold:Array.from({length:21},(_,i)=>i/20)});
 items.forEach(item=>{
  const v=item.video;v.style.backgroundImage=`url("${v.poster}")`;v.style.backgroundSize='cover';v.style.backgroundPosition='center';
  item.card.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){item.hover=true;sync();}});
  item.card.addEventListener('pointerleave',()=>{item.hover=false;sync();});
  item.card.addEventListener('focus',()=>{item.focus=item.card.matches(':focus-visible');sync();});
  item.card.addEventListener('blur',()=>{item.focus=false;sync();});
  v.addEventListener('canplay',()=>start(item));
  v.addEventListener('pause',()=>{if(item.wanted&&!document.hidden)v.controls=false;});
  v.addEventListener('playing',()=>{v.controls=false;});
  item.card.addEventListener('click',e=>{if(item.wanted&&(v.controls||item.blocked)){e.preventDefault();start(item,true);}});
  observer.observe(v);
 });
 mobile.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);addEventListener('pageshow',sync);
 document.querySelector('#services-track').addEventListener('touchend',()=>{if(active&&active.wanted)start(active,true);},{passive:true});
})();
