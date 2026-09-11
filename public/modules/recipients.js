/**
 * 从工作表中解析目标名称列与展示排序（支持部门/分组排序 sheet）
 */
function extractSortFromWorkbook(wb, sheetName, nameHeader) {
  var list = [];
  if (!wb || !sheetName || !wb.SheetNames.includes(sheetName)) return list;
  var ws = wb.Sheets[sheetName];
  var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows || rows.length <= 1) return list;

  var sortIdx = -1, nameIdx = -1;
  rows[0].forEach(function(h, i) {
    var hdr = String(h).trim();
    if (hdr === '展示排序' && sortIdx < 0) sortIdx = i;
    if (hdr === nameHeader && nameIdx < 0) nameIdx = i;
  });
  if (sortIdx < 0) sortIdx = 0;
  if (nameIdx < 0) nameIdx = 1;

  for (var i = 1; i < rows.length; i++) {
    var sortVal = rows[i][sortIdx];
    var name = String(rows[i][nameIdx] || '').trim();
    if (name) {
      list.push({ sort: Number(sortVal) || 999, name: name });
    }
  }
  list.sort(function(a, b) { return a.sort - b.sort; });
  return list;
}

/**
 * 根据指定排序列表重整原顺序数组
 */
function applyOrderSort(orderArray, sortItems, filterFn) {
  if (!sortItems || !sortItems.length) return orderArray;
  var sortedNames = sortItems.map(function(item) { return item.name; });
  orderArray.forEach(function(item) {
    if (!sortedNames.includes(item)) sortedNames.push(item);
  });
  return sortedNames.filter(filterFn);
}

function initRecipients() {
  // 生成模板按钮 - 下载只有样例数据的收件人名单模板
  $('template-btn').addEventListener('click', async () => {
    try {
      $('status-text').textContent = '正在生成模板...';
      const resp = await fetch('/api/template');
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        showResultDialog('生成失败', data.error || '生成模板失败');
        $('status-text').textContent = '';
        return;
      }
      const buf = await resp.arrayBuffer();
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '收件人名单-模板.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('status-text').textContent = '模板已下载，请按格式填写收件人后重新加载';
    } catch (e) {
      showResultDialog('生成失败', '生成模板失败: ' + e.message);
      $('status-text').textContent = '';
    }
  });

  // 浏览按钮 - 使用 filepicker.exe 获取完整路径
  $('recip-browse-btn').addEventListener('click', async () => {
    try {
      var resp = await fetch('/api/browse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: 'Excel 文件 (*.xlsx;*.xls)|*.xlsx;*.xls|所有文件|*.*' }),
      });
      var data = await resp.json();
      if (!resp.ok) {
        showResultDialog('选择失败', data.error || '选择文件失败');
        return;
      }
      if (!data.filePath) return; // 用户取消
      // 读取文件内容
      var fileResp = await fetch('/api/read-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: data.filePath }),
      });
      if (!fileResp.ok) {
        showResultDialog('读取失败', '读取文件失败');
        return;
      }
      var buf = await fileResp.arrayBuffer();
      await parseExcelBuffer(buf, data.filePath);
    } catch (e) {
      showResultDialog('选择失败', '选择文件失败: ' + e.message);
    }
  });

  // 拖拽支持
  const dropZone = $('recip-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (/\.(xlsx|xls)$/i.test(file.name)) {
          parseExcelFile(file);
        } else {
          showResultDialog('格式不对', '请拖入 Excel 文件（.xlsx 或 .xls）');
        }
      }
    });
  }
}

async function loadDefaultRecipients() {
  try {
    // 并行获取完整路径和文件内容
    const [pathResp, fileResp] = await Promise.all([
      fetch('/api/recipient-file-path'),
      fetch('/api/recipient-file'),
    ]);
    if (!fileResp.ok) {
      $('status-text').textContent = '未找到默认收件人名单';
      return;
    }
    let fullPath = null;
    if (pathResp.ok) {
      const pathData = await pathResp.json();
      fullPath = pathData.filePath;
    }
    const buf = await fileResp.arrayBuffer();
    await parseExcelBuffer(buf, fullPath);
  } catch (e) {
    // 无默认名单时不报错
  }
}

function parseExcelFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    parseExcelBuffer(e.target.result, file.name);
  };
  reader.readAsArrayBuffer(file);
}

async function parseExcelBuffer(buf, filename) {
  try {
    const wb = XLSX.read(buf, { type: 'array' });
    // 优先读取配置中指定的 sheet，找不到则回退到第一个
    var sheetName = (state.config && state.config.sheet_recipients) || '收件人名单';
    var ws = wb.Sheets[wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (!rows || rows.length < 2) {
      showResultDialog('格式不对', '无法读取收件人名单，请检查文件格式');
      return;
    }

    // 表头识别
    const header = rows[0].map(c => String(c).trim());
    let colMap = {};
    header.forEach((h, i) => {
      if (['部门', '区域'].includes(h) && !('dept' in colMap)) colMap.dept = i;
      else if (h === '分组' && !('group' in colMap)) colMap.group = i;
      else if (['姓名', '名字'].includes(h) && !('name' in colMap)) colMap.name = i;
      else if (['邮箱', '电子邮件', 'email', 'Email', 'E-mail'].includes(h) && !('email' in colMap)) colMap.email = i;
    });

    // 回退：取前4列
    if (Object.keys(colMap).length < 4) {
      if (header.length >= 4) {
        colMap = { dept: 0, group: 1, name: 2, email: 3 };
      } else {
          showResultDialog('格式不对', '收件人名单列数不足，需 4 列：部门/分组/姓名/邮箱');
        return;
      }
    }

    // 解析数据行并执行三大核心校验：单元格非空、Email正则匹配、Email重复
    const recipients = [];
    const validationErrors = [];
    const emailSeen = new Map(); // normalizedEmail -> [{ line, dept, group, name, rawEmail }]

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // 如果整行都为空，跳过（忽略 Excel 末尾的空白行）
      if (!row || row.every(c => c === undefined || c === null || String(c).trim() === '')) {
        continue;
      }

      const lineNum = i + 1; // 对应 Excel 实际行号（首行为表头）
      const dept = String(row[colMap.dept] !== undefined && row[colMap.dept] !== null ? row[colMap.dept] : '').trim();
      const group = String(row[colMap.group] !== undefined && row[colMap.group] !== null ? row[colMap.group] : '').trim();
      const name = String(row[colMap.name] !== undefined && row[colMap.name] !== null ? row[colMap.name] : '').trim();
      const rawEmail = String(row[colMap.email] !== undefined && row[colMap.email] !== null ? row[colMap.email] : '').trim();

      // 1. 单元格非空校验
      const emptyFields = [];
      if (!dept) emptyFields.push('部门');
      if (!group) emptyFields.push('分组');
      if (!name) emptyFields.push('姓名');
      if (!rawEmail) emptyFields.push('邮箱');

      if (emptyFields.length > 0) {
        validationErrors.push({
          line: lineNum,
          dept: dept || '—',
          group: group || '—',
          name: name || '—',
          email: rawEmail || '—',
          type: '单元格未填',
          badgeClass: 'badge-empty',
          reason: '【' + emptyFields.join('、') + '】未填写',
        });
        // 邮箱未填则无法继续做格式与重复比对
        continue;
      }

      // 2. Email 正则匹配与格式合法性校验
      const formatErr = validateEmailAddress(rawEmail);
      if (formatErr) {
        validationErrors.push({
          line: lineNum,
          dept: dept,
          group: group,
          name: name,
          email: rawEmail,
          type: '格式错误',
          badgeClass: 'badge-format',
          reason: formatErr,
        });
        continue;
      }

      // 3. 邮箱重复比对记录 (不区分大小写比对)
      const emailKey = rawEmail.toLowerCase();
      if (!emailSeen.has(emailKey)) {
        emailSeen.set(emailKey, []);
      }
      emailSeen.get(emailKey).push({
        line: lineNum,
        dept: dept,
        group: group,
        name: name,
        rawEmail: rawEmail
      });

      recipients.push({ dept, group, name, email: rawEmail, line: lineNum });
    }

    // 汇总检查邮箱重复
    emailSeen.forEach((entries) => {
      if (entries.length > 1) {
        const firstLine = entries[0].line;
        const firstName = entries[0].name;
        // 第 2 个及以后的每一条均作为重复项提示
        for (let k = 1; k < entries.length; k++) {
          const item = entries[k];
          validationErrors.push({
            line: item.line,
            dept: item.dept,
            group: item.group,
            name: item.name,
            email: item.rawEmail,
            type: '邮箱重复',
            badgeClass: 'badge-dup',
            reason: '与第 ' + firstLine + ' 行（' + firstName + '）邮箱重复',
          });
        }
      }
    });

    // 按 Excel 行号由小到大排序错误，方便用户自上而下核对修正
    validationErrors.sort((a, b) => a.line - b.line);

    // 发现任何异常，立即阻断并弹窗呈现完整明细表格
    if (validationErrors.length > 0) {
      const errorRows = validationErrors.map(function(item) {
        return '<tr>' +
          '<td style="white-space:nowrap; font-weight:bold; text-align:center;">第 ' + item.line + ' 行</td>' +
          '<td class="dept-highlight">' + escapeHtml(item.dept) + '</td>' +
          '<td>' + escapeHtml(item.group) + '</td>' +
          '<td>' + escapeHtml(item.name) + '</td>' +
          '<td style="word-break:break-all; font-family:monospace;">' + escapeHtml(item.email) + '</td>' +
          '<td style="white-space:nowrap; text-align:center;"><span class="' + item.badgeClass + '">' + item.type + '</span></td>' +
          '<td style="color:#c0392b; font-weight:bold;">' + escapeHtml(item.reason) + '</td>' +
          '</tr>';
      }).join('');

      const detailHtml = '<div style="margin-bottom:12px; color:#c0392b; font-size:14px; line-height:1.6;">' +
        '为避免发信出现静默遗漏或重复投递，系统已拦截加载。请在 Excel 表格中修改以下单元格后重新导入：' +
        '</div>' +
        '<div style="max-height:360px; overflow-y:auto; border:1px solid #eee; border-radius:4px;">' +
        '<table style="width:100%; border-collapse:collapse; font-size:13px;">' +
        '<thead><tr style="background:#f8f9fa; position:sticky; top:0; z-index:2; border-bottom:2px solid #dee2e6;">' +
        '<th style="width:70px; text-align:center; padding:8px 6px;">位置</th>' +
        '<th style="padding:8px 6px;">部门</th>' +
        '<th style="padding:8px 6px;">分组</th>' +
        '<th style="padding:8px 6px;">姓名</th>' +
        '<th style="padding:8px 6px;">问题邮箱</th>' +
        '<th style="width:85px; text-align:center; padding:8px 6px;">问题类型</th>' +
        '<th style="padding:8px 6px;">错误原因</th>' +
        '</tr></thead><tbody>' + errorRows + '</tbody></table></div>';

      showResult('收件人名单格式异常', '共发现 ' + validationErrors.length + ' 条记录存在问题（单元格未填 / 格式错误 / 邮箱重复）：', detailHtml, true);
      return;
    }

    if (!recipients.length) {
      showResultDialog('名单为空', '收件人名单中未读取到任何有效人员数据');
      return;
    }

    // 设置状态
    state.recipients = recipients;
    state.deptOrder = [];
    state.groupOrder = [];
    recipients.forEach(r => {
      if (!state.deptOrder.includes(r.dept)) state.deptOrder.push(r.dept);
      if (!state.groupOrder.includes(r.group)) state.groupOrder.push(r.group);
    });
    state.personChecks = {};
    recipients.forEach((_, i) => { state.personChecks[i] = true; });

    // 更新路径显示
    if (filename) {
      $('recip-path-input').value = filename;
    }

    // 直接从当前 Excel 中读取"部门"与"分组" sheet 进行展示排序
    var deptSheetName = (state.config && state.config.sheet_depts) || '部门';
    var groupSheetName = (state.config && state.config.sheet_groups) || '分组';

    var deptSortItems = extractSortFromWorkbook(wb, deptSheetName, '部门');
    var groupSortItems = extractSortFromWorkbook(wb, groupSheetName, '分组');

    state.deptOrder = applyOrderSort(state.deptOrder, deptSortItems, function(d) {
      return state.recipients.some(function(r) { return r.dept === d; });
    });

    state.groupOrder = applyOrderSort(state.groupOrder, groupSortItems, function(g) {
      return state.recipients.some(function(rec) { return rec.group === g; });
    });

    // 触发筛选控件和列表更新
    state.deptFilters = {};
    state.groupFilters = {};
    state.groupTypes = {};
    state.deptOrder.forEach(d => { state.deptFilters[d] = true; });
    state.groupOrder.forEach(g => { state.groupFilters[g] = true; state.groupTypes[g] = '收件人'; });

    if (window.AppEventBus) {
      AppEventBus.emit('recipients:loaded');
    } else {
      buildFilterControls();
      updateRecipientList();
      updatePreview();
    }
  } catch (e) {
    showResultDialog('解析失败', '解析 Excel 失败: ' + e.message);
  }
}
