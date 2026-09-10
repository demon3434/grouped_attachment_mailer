/**
 * modules/filters.js -- 部门/分组筛选 checkbox
 * 排序依据：deptOrder / groupOrder 中 Excel 出现的顺序
 * 筛选区在弹出层内，使用 panel-section 卡片样式
 * 板块顺序：先分组筛选，后部门筛选
 */

function initFilters() {
  // 初始化时无操作，等名单加载后由 buildFilterControls 生成
}

function buildFilterControls() {
  const area = $('filter-area');
  area.innerHTML = '';

  // -- 分组筛选（panel-section 卡片）--
  const groupSection = document.createElement('div');
  groupSection.className = 'panel-section';

  const groupTitle = document.createElement('div');
  groupTitle.className = 'panel-title';
  groupTitle.innerHTML = '<span>分组筛选 (' + state.groupOrder.length + ')</span>';
  const groupTitleBtns = document.createElement('span');
  groupTitleBtns.className = 'title-btn-group';
  const groupAllBtn = document.createElement('button');
  groupAllBtn.className = 'title-btn';
  groupAllBtn.textContent = '全选';
  groupAllBtn.onclick = () => {
    state.groupOrder.forEach(g => { state.groupFilters[g] = true; });
    buildFilterControls();
    updateRecipientList();
    updatePreview();
  };
  const groupNoneBtn = document.createElement('button');
  groupNoneBtn.className = 'title-btn';
  groupNoneBtn.textContent = '取消全选';
  groupNoneBtn.onclick = () => {
    state.groupOrder.forEach(g => { state.groupFilters[g] = false; });
    buildFilterControls();
    updateRecipientList();
    updatePreview();
  };
  groupTitleBtns.appendChild(groupAllBtn);
  groupTitleBtns.appendChild(groupNoneBtn);
  groupTitle.appendChild(groupTitleBtns);
  groupSection.appendChild(groupTitle);

  const groupBody = document.createElement('div');
  groupBody.className = 'panel-body';
  const groupRow = document.createElement('div');
  groupRow.className = 'group-row';
  state.groupOrder.forEach(group => {
    const item = document.createElement('div');
    item.className = 'group-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.groupFilters[group] !== false;
    cb.onchange = () => {
      state.groupFilters[group] = cb.checked;
      updateRecipientList();
      updatePreview();
    };
    item.appendChild(cb);
    item.appendChild(document.createTextNode(' ' + group + ' '));

    const sel = document.createElement('select');
    ['收件人', '抄送'].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (state.groupTypes[group] !== '抄送') opt.selected = t === '收件人';
      sel.appendChild(opt);
    });
    state.groupTypes[group] = state.groupTypes[group] || '收件人';
    sel.onchange = () => {
      state.groupTypes[group] = sel.value;
      updateRecipientList();
      updatePreview();
    };
    item.appendChild(sel);
    groupRow.appendChild(item);
  });
  groupBody.appendChild(groupRow);
  groupSection.appendChild(groupBody);
  area.appendChild(groupSection);

  // -- 部门筛选（panel-section 卡片）--
  const deptSection = document.createElement('div');
  deptSection.className = 'panel-section';

  const deptTitle = document.createElement('div');
  deptTitle.className = 'panel-title';
  deptTitle.innerHTML = '<span>部门筛选 (' + state.deptOrder.length + ')</span>';
  const deptTitleBtns = document.createElement('span');
  deptTitleBtns.className = 'title-btn-group';
  const deptAllBtn = document.createElement('button');
  deptAllBtn.className = 'title-btn';
  deptAllBtn.textContent = '全选';
  deptAllBtn.onclick = () => {
    state.deptOrder.forEach(d => { state.deptFilters[d] = true; });
    buildFilterControls();
    updateRecipientList();
    updatePreview();
  };
  const deptNoneBtn = document.createElement('button');
  deptNoneBtn.className = 'title-btn';
  deptNoneBtn.textContent = '取消全选';
  deptNoneBtn.onclick = () => {
    state.deptOrder.forEach(d => { state.deptFilters[d] = false; });
    buildFilterControls();
    updateRecipientList();
    updatePreview();
  };
  deptTitleBtns.appendChild(deptAllBtn);
  deptTitleBtns.appendChild(deptNoneBtn);
  deptTitle.appendChild(deptTitleBtns);
  deptSection.appendChild(deptTitle);

  const deptBody = document.createElement('div');
  deptBody.className = 'panel-body';
  const deptGrid = document.createElement('div');
  deptGrid.className = 'dept-grid';
  state.deptOrder.forEach(dept => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.deptFilters[dept] !== false;
    cb.onchange = () => {
      state.deptFilters[dept] = cb.checked;
      updateRecipientList();
      updatePreview();
    };
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + dept));
    deptGrid.appendChild(label);
  });
  deptBody.appendChild(deptGrid);
  deptSection.appendChild(deptBody);
  area.appendChild(deptSection);
}

function getFilteredRecipients() {
  if (!state.recipients.length) return [];
  return state.recipients
    .map((r, i) => ({ idx: i, r }))
    .filter(({ r }) =>
      state.deptFilters[r.dept] !== false &&
      state.groupFilters[r.group] !== false
    );
}

function getSelectedRecipients() {
  return getFilteredRecipients().filter(({ idx }) => state.personChecks[idx]);
}
