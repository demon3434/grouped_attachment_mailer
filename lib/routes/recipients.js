/**
 * routes/recipients.js -- 收件人名单相关路由
 * 默认名单文件、文件读取、排序数据
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { getRecipientFilePath, getSheetNames } = require('../config');
const { generateTemplate } = require('../template');

// 默认收件人名单文件
router.get('/recipient-file', (req, res) => {
  const filePath = getRecipientFilePath();
  if (!filePath) {
    return res.status(404).json({ error: '未找到收件人名单文件' });
  }
  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.sendFile(filePath);
});

// 获取收件人名单文件完整路径
router.get('/recipient-file-path', (req, res) => {
  const filePath = getRecipientFilePath();
  if (!filePath) {
    return res.status(404).json({ error: '未找到收件人名单文件' });
  }
  res.json({ filePath: filePath });
});

// 读取指定路径的文件内容
router.post('/read-file', (req, res) => {
  const filePath = req.body.filePath;
  if (!filePath) {
    return res.status(400).json({ error: '请提供文件路径' });
  }
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ error: '文件不存在: ' + filePath });
  }
  res.sendFile(absPath);
});

// 生成收件人名单模板（只有样例数据，供用户下载参考格式）
router.get('/template', (req, res) => {
  try {
    var sheetNames = getSheetNames() || {
      recipients: '收件人名单',
      depts: '部门',
      groups: '分组',
    };
    var buf = generateTemplate(sheetNames);
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      "attachment; filename*=UTF-8''" + encodeURIComponent('收件人名单-模板.xlsx'));
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: '生成模板失败: ' + e.message });
  }
});

/**
 * 从工作表中解析目标名称列与展示排序
 * @param {Object} wb - XLSX workbook
 * @param {string} sheetName - 工作表名称
 * @param {string} nameHeader - 目标名称列头（如'部门'或'分组'）
 * @returns {Array<{ sort: number, name: string }>}
 */
function readSortSheet(wb, sheetName, nameHeader) {
  const list = [];
  if (!wb || !sheetName || !wb.SheetNames.includes(sheetName)) {
    return list;
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows || rows.length <= 1) {
    return list;
  }

  let sortIdx = -1;
  let nameIdx = -1;
  rows[0].forEach(function(h, i) {
    const hdr = String(h).trim();
    if (hdr === '展示排序' && sortIdx < 0) sortIdx = i;
    if (hdr === nameHeader && nameIdx < 0) nameIdx = i;
  });

  if (sortIdx < 0) sortIdx = 0;
  if (nameIdx < 0) nameIdx = 1;

  for (let i = 1; i < rows.length; i++) {
    const sortVal = rows[i][sortIdx];
    const name = String(rows[i][nameIdx] || '').trim();
    if (name) {
      list.push({ sort: Number(sortVal) || 999, name: name });
    }
  }
  list.sort(function(a, b) { return a.sort - b.sort; });
  return list;
}

// 获取排序数据（从 xlsx 的"部门"和"分组" sheet 读取）
router.get('/sort-order', (req, res) => {
  const filePath = getRecipientFilePath();
  if (!filePath) {
    return res.status(404).json({ error: '未找到收件人名单文件' });
  }
  const sheetNames = getSheetNames();
  if (!sheetNames) {
    return res.status(500).json({ error: '配置未加载' });
  }

  try {
    const wb = XLSX.readFile(filePath);
    res.json({
      depts: readSortSheet(wb, sheetNames.depts, '部门'),
      groups: readSortSheet(wb, sheetNames.groups, '分组'),
    });
  } catch (e) {
    res.status(500).json({ error: '读取排序数据失败: ' + e.message });
  }
});

module.exports = router;
