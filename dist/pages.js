(() => {
 const scroller=document.querySelector('#scroller'),home=document.querySelector('#home-page'),about=document.querySelector('#about-page'),curtain=document.querySelector('.page-curtain'),dialog=document.querySelector('#video-dialog');
 const contact=document.querySelector('#contact-page'),footer=document.querySelector('#contacts'),contactVideo=document.querySelector('.contact-video');
 const pages={home,about,contacts:contact,brief:document.querySelector("#brief-page"),success:document.querySelector("#success-page")};
 const route=()=>Object.keys(pages).find(key=>location.hash==="#/"+key)||"home";
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let current=route(),changing=false,queued=null,videoURL="assets/about/aboutbottom.mp4";
 function apply(page){current=page;Object.entries(pages).forEach(([key,el])=>el.hidden=key!==page);footer.hidden=['contacts','brief','success'].includes(page);document.title=({about:'О нас',contacts:'Контакты',brief:'Бриф',success:'Сообщение отправлено',home:'Видеопродакшен'})[page]+' — Infinity Frameworks';document.querySelectorAll('a[href^="#/"]').forEach(a=>{if(a.getAttribute('href')==='#/'+page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});document.querySelectorAll('.contact-video,.page-background-video').forEach(v=>{if(pages[page].contains(v)&&!reduced.matches)window.lazyVideoPlay(v).catch(()=>{});else v.pause();});}

 apply(current);
 const track=document.querySelector('.story-track');[...track.children].forEach(img=>{const copy=img.cloneNode(true);copy.alt='';copy.setAttribute('aria-hidden','true');track.append(copy);});
 const mediaReady=Promise.resolve();
 function animate(el,frames,options){const animation=el.animate(frames,options);return animation.finished.catch(()=>{}).then(()=>animation.cancel());}
 async function navigate(page,{anchor=null,historyMode='push',back=false}={}){
  if(changing){queued=[page,{anchor,historyMode,back}];return;}
  if(document.body.classList.contains('menu-open')&&window.setMenu)window.setMenu(false);
  if(page===current){if(anchor)window.SiteMotion.goTo(document.querySelector(anchor));else window.SiteMotion.goTo(pages[page]);return;}
  changing=true;window.SiteMotion.stop();document.body.classList.add('page-changing');scroller.inert=true;
  const coverStart=back?'inset(0 0 100% 0)':'inset(100% 0 0 0)',coverEnd=back?'inset(100% 0 0 0)':'inset(0 0 100% 0)';
  if(!reduced.matches){curtain.style.clipPath='inset(0)';await Promise.all([animate(curtain,[{clipPath:coverStart},{clipPath:'inset(0)'}],{duration:600,easing:'cubic-bezier(.45,0,.55,1)'}),animate(scroller,[{transform:'translateY(0)'},{transform:`translateY(${back?100:-100}px)`}],{duration:600,easing:'cubic-bezier(.45,0,.55,1)'})]);}
  apply(page);if(page==='home')window.positionCases?.();scroller.scrollTop=0;window.SiteMotion.stop();window.SiteMotion.refresh();
  if(historyMode==='push')history.pushState({page},'','#/'+page);
  if(anchor){const target=document.querySelector(anchor);if(target)scroller.scrollTop=target.offsetTop;}
  if(!reduced.matches)await Promise.all([animate(curtain,[{clipPath:'inset(0)'},{clipPath:coverEnd}],{duration:800,easing:'cubic-bezier(.16,1,.3,1)'}),animate(scroller,[{transform:`translateY(${back?-100:100}px)`},{transform:'translateY(0)'}],{duration:800,easing:'cubic-bezier(.16,1,.3,1)'})]);
  curtain.style.clipPath='inset(100% 0 0)';scroller.inert=false;document.body.classList.remove('page-changing');changing=false;
  const heading=pages[page].querySelector('h1');heading.tabIndex=-1;heading.focus({preventScroll:true});
  if(queued){const next=queued;queued=null;navigate(...next);}
 }
 document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const hash=a.getAttribute('href');if(hash.startsWith('#/')&&pages[hash.slice(2)]){e.preventDefault();e.stopImmediatePropagation();navigate(hash.slice(2));return;}
  if(hash.startsWith('#/'))return;const target=document.querySelector(hash);if(target&&current!=='home'&&home.contains(target)){e.preventDefault();e.stopImmediatePropagation();navigate('home',{anchor:hash});}
 },true);
 addEventListener('popstate',()=>navigate(route(),{historyMode:'none',back:true}));
 const cursor=document.querySelector('.rec-cursor');let closing=false;
 function openVideo(button){window.SiteMotion.stop();dialog.append(cursor);dialog.showModal();dialog.classList.remove('is-closing');dialog.returnFocus=button;window.lazyVideoPlay(dialog.querySelector('video')).catch(()=>{});}
 function closeVideo(){if(closing||!dialog.open)return;closing=true;dialog.classList.add('is-closing');setTimeout(()=>{dialog.close();closing=false;dialog.classList.remove('is-closing');},reduced.matches?0:300);}
 const inline=document.querySelector('.inline-film'),inlineStart=document.querySelector('.inline-film-start');
 inlineStart.addEventListener('click',()=>{window.lazyVideoPlay(inline).then(()=>inline.parentElement.classList.add('is-playing')).catch(()=>{});});
 inline.addEventListener('ended',()=>inline.parentElement.classList.remove('is-playing'));

 document.querySelectorAll('[data-play-video]').forEach(button=>{button.addEventListener('click',()=>openVideo(button));const video=button.querySelector('video');if(video){button.addEventListener('pointerenter',e=>{if(e.pointerType!=='mouse'||reduced.matches||!videoURL)return;window.lazyVideoPlay(video).then(()=>button.classList.add('preview-playing')).catch(()=>{});});button.addEventListener('pointerleave',()=>{button.classList.remove('preview-playing');video.pause();});}});
 dialog.querySelector('.video-close').onclick=closeVideo;dialog.addEventListener('cancel',e=>{e.preventDefault();closeVideo();});dialog.addEventListener('click',e=>{if(e.target===dialog)closeVideo();});dialog.addEventListener('close',()=>{dialog.querySelector('video').pause();document.body.append(cursor);dialog.returnFocus?.focus({preventScroll:true});});
 const previewObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(!e.isIntersecting){e.target.pause();e.target.parentElement.classList.remove('preview-playing');}}),{root:scroller});document.querySelectorAll('.gallery-preview,.inline-film').forEach(v=>previewObserver.observe(v));
 window.SitePages={mediaReady,navigate};
})();
