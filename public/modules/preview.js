/**
 * modules/preview.js -- 发送预览（全页面弹出层）
 * 每行 = 一封邮件（一个部门）
 * 收件人/抄送：一人一行，格式为"姓名(分组) 灰色小字邮箱"
 */

function initPreview() {
  // 预览按钮 → 打开弹出层
  $('preview-btn').addEventListener('click', () => {
    openPreviewOverlay();
  });

  // 关闭按钮
  $('preview-close-btn').addEventListener('click', () => {
    closePreviewOverlay();
  });

  // 点击遮罩关闭
  $('preview-overlay').addEventListener('click', (e) => {
    if (e.target === $('preview-overlay')) {
      closePreviewOverlay();
    }
  });

  // 弹出层内的确认发送按钮
  $('preview-send-btn').addEventListener('click', () => {
    closePreviewOverlay();
    onSendClick();
  });
}

function openPreviewOverlay() {
  updatePreview();
  $('preview-overlay').style.display = 'flex';
}

function closePreviewOverlay() {
  $('preview-overlay').style.display = 'none';
}

function updatePreview() {
  const tbody = $('preview-tbody');
  tbody.innerHTML = '';

  const tasks = groupByDept();

  tasks.forEach(t => {
    const tr = document.createElement('tr');

    // 部门
    const tdUnit = document.createElement('td');
    tdUnit.textContent = t.dept;
    tdUnit.style.fontWeight = 'bold';
    tr.appendChild(tdUnit);

    // 收件人：一人一行
    const tdTo = document.createElement('td');
    tdTo.className = 'col-people';
    if (t.toPeople.length === 0) {
      tdTo.textContent = '（无）';
      tdTo.style.color = '#aaa';
    } else {
      t.toPeople.forEach(p => {
        var row = document.createElement('div');
        row.className = 'preview-person-row';
        var nameSpan = document.createElement('span');
        nameSpan.textContent = p.group ? (p.name + '(' + p.group + ')') : p.name;
        nameSpan.className = 'preview-person-name';
        var emailSpan = document.createElement('span');
        emailSpan.textContent = ' ' + p.email;
        emailSpan.className = 'preview-person-email';
        row.appendChild(nameSpan);
        row.appendChild(emailSpan);
        tdTo.appendChild(row);
      });
    }
    tr.appendChild(tdTo);

    // 抄送：一人一行
    const tdCc = document.createElement('td');
    tdCc.className = 'col-people';
    if (t.ccPeople.length === 0) {
      tdCc.textContent = '（无）';
      tdCc.style.color = '#aaa';
    } else {
      t.ccPeople.forEach(p => {
        var row = document.createElement('div');
        row.className = 'preview-person-row';
        var nameSpan = document.createElement('span');
        nameSpan.textContent = p.group ? (p.name + '(' + p.group + ')') : p.name;
        nameSpan.className = 'preview-person-name';
        var emailSpan = document.createElement('span');
        emailSpan.textContent = ' ' + p.email;
        emailSpan.className = 'preview-person-email';
        row.appendChild(nameSpan);
        row.appendChild(emailSpan);
        tdCc.appendChild(row);
      });
    }
    tr.appendChild(tdCc);

    // 附件列表
    const tdAttach = document.createElement('td');
    tdAttach.className = 'col-attach-list';
    const attachDiv = document.createElement('div');
    attachDiv.className = 'preview-attach-list';
    if (t.attachCount > 0) {
      attachDiv.innerHTML = t.attachNames
        .map(n => '• ' + escapeHtml(n))
        .join('<br>');
      attachDiv.style.color = '#333';
    } else {
      attachDiv.textContent = '（无附件）';
      attachDiv.style.color = '#aaa';
    }
    tdAttach.appendChild(attachDiv);
    tr.appendChild(tdAttach);

    tbody.appendChild(tr);
  });

  // 统计
  const deptCount = new Set(tasks.map(t => t.dept)).size;
  const peopleCount = tasks.reduce((sum, t) =>
    sum + t.toPeople.length + t.ccPeople.length, 0);
  const totalFiles = tasks.reduce((sum, t) => sum + t.attachCount, 0);
  $('preview-summary').textContent =
    '共发送 ' + deptCount + ' 封邮件（' + peopleCount + ' 人，' + totalFiles + ' 个附件）';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
