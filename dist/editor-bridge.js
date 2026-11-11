(() => {
  const pencil = document.createElement('button');
  pencil.className = 'cms-pencil'; pencil.textContent = '✎'; pencil.title = 'Редактировать блок'; pencil.hidden = true;
  document.body.append(pencil);
  let active = null;
  function position() {
    if (!active) return;
    const rect = active.getBoundingClientRect();
    pencil.style.left = Math.min(innerWidth - 38, Math.max(0, rect.right - 30)) + 'px';
    pencil.style.top = Math.min(innerHeight - 38, Math.max(0, rect.top - 30)) + 'px';
  }
  document.addEventListener('pointerover', event => {
    if (event.target === pencil) return;
    const element = event.target.closest('[data-cms]');
    if (element) { active = element; pencil.hidden = false; position(); }
  });
  document.addEventListener('scroll', () => { pencil.hidden = true; }, true);
  pencil.onclick = event => {
    event.preventDefault(); event.stopPropagation();
    if (active) parent.postMessage({ type: 'cms-select', id: active.dataset.cms }, location.origin);
  };
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data.type !== 'cms-values') return;
    const { values, fields } = event.data;
    document.querySelectorAll('[data-cms]').forEach(element => {
      const id = element.dataset.cms, field = fields[id];
      if (!field) return;
      const value = values[id] ?? field.value;
      if (field.type === 'text') {
        if (element.textContent !== value) element.textContent = value;
      }
      else {
        if (element.getAttribute(field.attribute) === value) return;
        element.setAttribute(field.attribute, value);
        if (element.tagName === 'VIDEO') {
          element.pause();
          element.src = value;
          element.load();
          if (element.getBoundingClientRect().top < innerHeight) element.play().catch(() => {});
        }
        if (element.tagName === 'IMG') {
          element.classList.remove('image-reveal-pending'); element.style.visibility = 'visible';
          document.querySelectorAll('.image-reveal-canvas').forEach(canvas => canvas.remove());
        }
      }
    });
    position();
  });
  parent.postMessage({ type: 'cms-ready' }, location.origin);
})();
