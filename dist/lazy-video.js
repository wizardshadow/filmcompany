(() => {
 window.lazyVideoPlay=video=>{
  if(document.documentElement.classList.contains('is-loading'))return Promise.resolve();
  if(!video.getAttribute('src')){video.src=video.dataset.src||'assets/about/aboutbottom.mp4';video.preload='none';}
  return video.play();
 };
 const observer=new MutationObserver(()=>{
  if(document.documentElement.classList.contains('is-loading'))return;
  observer.disconnect();document.dispatchEvent(new Event('visibilitychange'));
  document.querySelectorAll('.site-page:not([hidden]) .contact-video,.site-page:not([hidden]) .page-background-video').forEach(v=>{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)window.lazyVideoPlay(v).catch(()=>{});});
 });observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
})();
