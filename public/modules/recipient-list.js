/**
 * modules/recipient-list.js -- 收件人列表表格与勾选
 * 排序依据：Excel 出现顺序（部门→分组→原始顺序）
 * 表头 checkbox 与列表项联动全选/取消全选
 */

function initRecipientList() {
  // 抄送自己开关
  $('cc-self-toggle').addEventListener('change', function() {
    state.ccSelf = this.checked;
    updatePreview();
  });

  // 表头全选 checkbox 联动
  $('select-all-cb').addEventListener('change', function() {
    var checked = this.checked;
    getFilteredRecipients().forEach(({ idx }) => {
      state.personChecks[idx] = checked;
    });
    updateRecipientList();
    updatePreview();
  });

  // 筛选弹出层
  $('filter-toggle-btn').addEventListener('click', function() {
    $('filter-overlay').style.display = 'flex';
  });
  $('filter-close-btn').addEventListener('click', function() {
    $('filter-overlay').style.display = 'none';
  });
}

function updateRecipientList() {
  const tbody = $('recip-tbody');
  tbody.innerHTML = '';

  const filtered = getFilteredRecipients();
  // 按 Excel 出现顺序排序
  const sorted = filtered.slice().sort((a, b) => {
    const ua = state.deptOrder.indexOf(a.r.dept);
    const ub = state.deptOrder.indexOf(b.r.dept);
    if (ua !== ub) return ua - ub;
    const ga = state.groupOrder.indexOf(a.r.group);
    const gb = state.groupOrder.indexOf(b.r.group);
    if (ga !== gb) return ga - gb;
    return a.idx - b.idx;
  });

  let selectedCount = 0;
  sorted.forEach(({ idx, r }) => {
    const tr = document.createElement('tr');
    const isChecked = state.personChecks[idx];
    if (!isChecked) tr.className = 'unchecked';

    // 勾选列
    const tdSel = document.createElement('td');
    tdSel.className = 'col-sel';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isChecked;
    cb.onchange = () => {
      state.personChecks[idx] = cb.checked;
      updateRecipientList();
      updatePreview();
    };
    tdSel.appendChild(cb);
    tr.appendChild(tdSel);

    // 数据列：部门、分组、姓名、邮箱
    [r.dept, r.group, r.name, r.email].forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });

    // 收件人/抄送列
    const tdType = document.createElement('td');
    tdType.className = 'col-type';
    const groupType = state.groupTypes[r.group] || '收件人';
    tdType.textContent = groupType;
    if (!isChecked) {
      tdType.style.color = '#999';
    } else if (groupType === '抄送') {
      tdType.style.color = '#e69500';
    } else {
      tdType.style.color = '#333';
    }
    tr.appendChild(tdType);

    // 附件数量列（鼠标悬停显示文件名）
    const tdAttach = document.createElement('td');
    tdAttach.className = 'col-attach';
    const attachCount = (state.attachmentsMap[r.dept] || []).length;
    if (attachCount > 0) {
      tdAttach.textContent = attachCount;
      tdAttach.style.color = isChecked ? '#5cb85c' : '#999';
      tdAttach.style.fontWeight = 'bold';
      // tooltip: 每行一个文件名
      var names = getAttachNames(r.dept);
      tdAttach.title = names.join('\n');
    } else {
      tdAttach.textContent = '-';
      tdAttach.title = '';
    }
    tr.appendChild(tdAttach);

    tbody.appendChild(tr);
    if (isChecked) selectedCount++;
  });

  $('person-count').textContent = selectedCount + '/' + sorted.length + ' 人';

  // 更新表头全选 checkbox 状态
  var selectAllCb = $('select-all-cb');
  if (sorted.length === 0) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  } else if (selectedCount === sorted.length) {
    selectAllCb.checked = true;
    selectAllCb.indeterminate = false;
  } else if (selectedCount === 0) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  } else {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = true;
  }
}
