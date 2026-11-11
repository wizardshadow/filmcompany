(() => {
 const video=document.querySelector('.hero-picture video'),scroller=document.querySelector('#scroller');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let visible=false;
 window.HeroMediaReady=new Promise(resolve=>{
  let timer;
  const finish=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',finish);video.removeEventListener('error',finish);resolve();};
  if(video.readyState>=2||video.error){finish();return;}
  video.addEventListener('loadeddata',finish,{once:true});video.addEventListener('error',finish,{once:true});timer=setTimeout(finish,12000);
 });
 function sync(){if(visible&&!document.hidden&&!reduced.matches)window.lazyVideoPlay(video).catch(()=>{});else video.pause();}
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{root:scroller,threshold:.01}).observe(video);
 reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
})();
