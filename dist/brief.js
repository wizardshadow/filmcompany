(() => {
 'use strict';
 const form=document.querySelector('#project-brief-form'),status=document.querySelector('#brief-status');
 const storageKey='infinity-project-brief-v1';
 const fields=['name','company','phone','email','service','comment'];
 const serviceButton=document.querySelector('#brief-service-button'),list=document.querySelector('#brief-service-list'),options=[...list.querySelectorAll('[role=option]')];
 const input=document.querySelector('#brief-files'),fileList=document.querySelector('#brief-file-list'),fileError=document.querySelector('#brief-file-error');
 let files=[],storageAvailable=true;
 function save(){try{localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(fields.map(key=>[key,form.elements[key].value]))));}catch{storageAvailable=false;status.textContent='Не удалось сохранить черновик в браузере. Не закрывайте страницу до завершения.';}}
 function choose(value){const option=options.find(o=>o.dataset.value===value);form.elements.service.value=option?value:'';serviceButton.querySelector('span').textContent=option?value:'ВЫБЕРИТЕ УСЛУГУ ИЗ СПИСКА';options.forEach(o=>o.setAttribute('aria-selected',String(o===option)));}
 try{const data=JSON.parse(localStorage.getItem(storageKey)||'{}');fields.forEach(key=>{if(typeof data[key]==='string')form.elements[key].value=data[key].slice(0,key==='comment'?10000:160);});choose(form.elements.service.value);}catch{}
 function setOpen(open,focus=false){list.hidden=!open;serviceButton.setAttribute('aria-expanded',String(open));if(open&&focus)(options.find(o=>o.getAttribute('aria-selected')==='true')||options[0]).focus();}
 serviceButton.addEventListener('click',()=>setOpen(list.hidden,true));
 serviceButton.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setOpen(true,true);}});
 options.forEach(option=>option.addEventListener('click',()=>{choose(option.dataset.value);setOpen(false);serviceButton.focus();save();validate('service');}));
 list.addEventListener('keydown',e=>{const index=options.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next].focus();}else if(e.key==='Escape'){e.preventDefault();setOpen(false);serviceButton.focus();}else if(e.key==='Tab')setOpen(false);});
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.brief-select'))setOpen(false);});
 form.addEventListener('focusout',e=>{if(e.target.name&&['name','company','phone','email'].includes(e.target.name))validate(e.target.name);});
 form.addEventListener('input',e=>{save();status.classList.remove('is-validated');if(e.target.getAttribute('aria-invalid')==='true')validate(e.target.name);});
 function validate(name){const el=form.elements[name],value=el.value.trim();let error='';if(['name','company','phone'].includes(name)&&!value)error='Заполните это поле';else if(name==='name'&&value.length<2)error='Укажите имя — минимум 2 символа';else if(name==='phone'&&(!/^[+\d()\s.\-]+$/.test(value)||value.replace(/\D/g,'').length<7||value.replace(/\D/g,'').length>15))error='Укажите корректный номер телефона';else if(name==='email'&&value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))error='Укажите email в формате name@example.com';const control=name==='service'?serviceButton:el;control.setAttribute('aria-invalid',String(!!error));document.querySelector('#error-'+name).textContent=error;return !error;}
 function renderFiles(){fileList.replaceChildren();files.forEach((file,index)=>{const li=document.createElement('li'),name=document.createElement('span'),button=document.createElement('button'),icon=document.createElement('img');name.textContent=file.name;button.type='button';button.setAttribute('aria-label','Удалить файл '+file.name);icon.src='assets/brief/remove.svg';icon.alt='';button.append(icon);button.addEventListener('click',()=>{files.splice(index,1);fileError.textContent='';renderFiles();});li.append(name,button);fileList.append(li);});}
 document.querySelector('.attach-button').addEventListener('click',()=>input.click());
 input.addEventListener('change',()=>{const next=window.BriefFiles.add(files,[...input.files]);if(!next){fileError.textContent='Общий размер файлов превышает 20 МБ. Уменьшите размер или удалите лишние файлы.';}else{files=next;fileError.textContent='';renderFiles();}input.value='';});
 form.addEventListener('submit',e=>{e.preventDefault();setOpen(false);const invalid=['name','company','phone','email','service'].filter(name=>!validate(name));save();if(invalid.length){form.elements[invalid[0]].focus();status.textContent='Проверьте отмеченные поля.';status.classList.remove('is-validated');return;}status.classList.add('is-validated');status.textContent=storageAvailable?'Данные проверены, черновик сохранён. Отправка писем пока не подключена — письмо не отправлено.':'Данные проверены. Отправка пока не подключена; сохранить черновик в браузере не удалось.';});
 // The future delivery handler must navigate to success only after the server confirms delivery.
 window.BriefForm={recipient:'artur@andreiko.me',getAttachments:()=>[...files]};
})();
