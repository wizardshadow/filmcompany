(() => {
 const section=document.querySelector('#cases'),videos=[...section.querySelectorAll('.case-film')],sound=document.querySelector('#sound'),slash=section.querySelector('.sound-slash');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let active=1,request=0,visible=false,muted=true,timer;
 const ready=videos.map(video=>new Promise(resolve=>{let timeout;const done=()=>{clearTimeout(timeout);video.removeEventListener('loadeddata',done);video.removeEventListener('error',done);resolve();};if(video.readyState>=2||video.error){done();return;}video.addEventListener('loadeddata',done,{once:true});video.addEventListener('error',done,{once:true});timeout=setTimeout(done,12000);}));
 window.CaseMediaReady=Promise.all(ready);
 function sync(){videos.forEach((video,index)=>{video.muted=index!==active||muted;const shouldPlay=visible&&!document.hidden&&!reduced.matches&&(index===active||video.classList.contains('is-outgoing'));if(shouldPlay)window.lazyVideoPlay(video).catch(()=>{});else video.pause();});}
 function updateSound(){sound.setAttribute('aria-pressed',String(!muted));sound.setAttribute('aria-label',muted?'Включить звук':'Выключить звук');slash.hidden=!muted;}
 async function select(index){
  const token=++request;if(token!==request)return;
  clearTimeout(timer);const previous=active;active=index;
  videos.forEach((video,i)=>{video.classList.toggle('is-outgoing',i===previous&&previous!==index);video.classList.toggle('is-active',i===index);if(i!==index&&i!==previous)video.pause();});
  if(previous!==index){try{videos[index].currentTime=0;}catch{}}
  sync();timer=setTimeout(()=>{videos.forEach((video,i)=>{video.classList.remove('is-outgoing');if(i!==active)video.pause();});},reduced.matches?0:700);
 }
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{root:document.querySelector('#scroller'),threshold:.01}).observe(section);
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
 window.CaseBackground={select,toggleSound(){muted=!muted;sync();updateSound();}};updateSound();select(active);
})();
