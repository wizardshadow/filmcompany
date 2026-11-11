(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', fields = {}, values = {}, revision = null, selected = null, dirty = false;
  async function api(path, options = {}) {
    const response = await fetch('/api/cms/' + path, {
      ...options, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Ошибка запроса');
    return result;
  }
  function message(value) { $('error').textContent = value; }
  function setDirty(value) {
    dirty = value;
    $('publish').disabled = !value;
    $('status').textContent = value ? 'Есть неопубликованные изменения' : 'Все изменения сохранены';
  }
  function preview() {
    $('preview').contentWindow.postMessage({ type: 'cms-values', values, fields }, location.origin);
  }
  async function enter() {
    const data = await api('content');
    fields = data.fields; values = data.values; revision = data.revision;
    $('login').hidden = true; $('editor').hidden = false;
    $('preview').src = '/?edit=1#/' + $('page').value;
  }
  $('login-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.submitter; button.disabled = true;
    try {
      const form = new FormData(event.target);
      const result = await api('login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      csrf = result.csrf; event.target.reset(); await enter();
    } catch (error) { $('login-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('page').onchange = () => { $('preview').src = '/?edit=1#/' + $('page').value; };
  $('viewport').onchange = () => { $('preview').style.width = $('viewport').value; };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== $('preview').contentWindow) return;
    if (event.data.type === 'cms-ready') preview();
    if (event.data.type !== 'cms-select' || !fields[event.data.id]) return;
    selected = event.data.id;
    const field = fields[selected];
    $('field-title').textContent = field.type === 'text' ? 'Редактирование текста' : 'Замена медиа';
    $('hint').hidden = true; $('field-form').hidden = false;
    $('value').value = values[selected] ?? field.value;
    $('upload-label').hidden = field.type === 'text';
    $('value').setAttribute('aria-label', field.type === 'text' ? 'Текст блока' : 'Адрес медиафайла');
    message('');
  });
  $('field-form').onsubmit = event => {
    event.preventDefault();
    values[selected] = $('value').value; setDirty(true); preview(); message('');
  };
  $('cancel').onclick = () => { $('value').value = values[selected] ?? fields[selected].value; };
  $('reset').onclick = () => {
    delete values[selected]; $('value').value = fields[selected].value; setDirty(true); preview();
  };
  $('upload').onchange = async () => {
    const file = $('upload').files[0], field = selected;
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { message('Максимальный размер — 20 МБ'); return; }
    $('upload').disabled = true; message('Загрузка файла…');
    try {
      const result = await api('upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      values[field] = result.url; setDirty(true); preview();
      if (selected === field) $('value').value = result.url;
      message('');
    } catch (error) { message(error.message); }
    finally { $('upload').disabled = false; $('upload').value = ''; }
  };
  $('publish').onclick = async () => {
    $('publish').disabled = true;
    const snapshot = JSON.stringify(values);
    try {
      const result = await api('content', { method: 'PUT', body: JSON.stringify({ values, revision }) });
      revision = result.revision; setDirty(snapshot !== JSON.stringify(values)); message('');
    } catch (error) { message(error.message); $('publish').disabled = false; }
  };
  $('logout').onclick = async () => {
    if (dirty && !confirm('Выйти без сохранения изменений?')) return;
    try { await api('logout', { method: 'POST', body: '{}' }); location.reload(); }
    catch (error) { message(error.message); }
  };
  addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  api('session').then(result => { csrf = result.csrf; return enter(); }).catch(() => {});
})();
