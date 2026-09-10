/**
 * modules/recipients.js -- 收件人名单加载与解析
 * 使用 SheetJS 在浏览器端解析 Excel
 * 支持：文件选择 + 拖拽
 */

function initRecipients() {
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

    // 解析数据行
    const recipients = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => c === '' || c === null)) continue;
      const dept = String(row[colMap.dept] || '').trim();
      const group = String(row[colMap.group] || '').trim();
      const name = String(row[colMap.name] || '').trim();
      const email = String(row[colMap.email] || '').trim();
      if (!email || !email.includes('@')) continue;
      recipients.push({ dept, group, name, email });
    }

    if (!recipients.length) {
        showResultDialog('名单为空', '收件人名单为空或格式不正确');
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

    // 尝试从后端获取排序数据，按"部门"和"分组" sheet 中的"展示排序"排列
    try {
      const sortResp = await fetch('/api/sort-order');
      if (sortResp.ok) {
        const sortData = await sortResp.json();
        // 按 sort 数据重新排列 deptOrder
        if (sortData.depts && sortData.depts.length > 0) {
          var sortedDepts = sortData.depts.map(function(d) { return d.name; });
          // 保留不在排序 sheet 中的部门（按原始顺序追加到末尾）
          state.deptOrder.forEach(function(d) {
            if (!sortedDepts.includes(d)) sortedDepts.push(d);
          });
          // 只保留收件人名单中实际出现的部门
          state.deptOrder = sortedDepts.filter(function(d) {
            return state.recipients.some(function(r) { return r.dept === d; });
          });
        }
        // 按 sort 数据重新排列 groupOrder
        if (sortData.groups && sortData.groups.length > 0) {
          var sortedGroups = sortData.groups.map(function(g) { return g.name; });
          state.groupOrder.forEach(function(g) {
            if (!sortedGroups.includes(g)) sortedGroups.push(g);
          });
          state.groupOrder = sortedGroups.filter(function(g) {
            return state.recipients.some(function(rec) { return rec.group === g; });
          });
        }
      }
    } catch (sortErr) {
      // 排序获取失败，保持原始顺序
    }

    // 触发筛选控件和列表更新
    state.deptFilters = {};
    state.groupFilters = {};
    state.groupTypes = {};
    state.deptOrder.forEach(d => { state.deptFilters[d] = true; });
    state.groupOrder.forEach(g => { state.groupFilters[g] = true; state.groupTypes[g] = '收件人'; });

    buildFilterControls();
    updateRecipientList();
    updatePreview();
  } catch (e) {
    showResultDialog('解析失败', '解析 Excel 失败: ' + e.message);
  }
}
