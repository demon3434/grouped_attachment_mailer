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
    const result = { depts: [], groups: [] };

    // 读取部门排序
    var deptSheetName = sheetNames.depts;
    if (wb.SheetNames.includes(deptSheetName)) {
      var ws = wb.Sheets[deptSheetName];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      var sortIdx = -1, nameIdx = -1;
      if (rows.length > 0) {
        rows[0].forEach(function(h, i) {
          var hdr = String(h).trim();
          if (hdr === '展示排序' && sortIdx < 0) sortIdx = i;
          if (hdr === '部门' && nameIdx < 0) nameIdx = i;
        });
      }
      if (sortIdx < 0) sortIdx = 0;
      if (nameIdx < 0) nameIdx = 1;
      for (var i = 1; i < rows.length; i++) {
        var sortVal = rows[i][sortIdx];
        var deptName = String(rows[i][nameIdx] || '').trim();
        if (deptName) {
          result.depts.push({ sort: Number(sortVal) || 999, name: deptName });
        }
      }
      result.depts.sort(function(a, b) { return a.sort - b.sort; });
    }

    // 读取分组排序
    var groupSheetName = sheetNames.groups;
    if (wb.SheetNames.includes(groupSheetName)) {
      var ws2 = wb.Sheets[groupSheetName];
      var rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
      var sortIdx2 = -1, nameIdx2 = -1;
      if (rows2.length > 0) {
        rows2[0].forEach(function(h, i) {
          var hdr = String(h).trim();
          if (hdr === '展示排序' && sortIdx2 < 0) sortIdx2 = i;
          if (hdr === '分组' && nameIdx2 < 0) nameIdx2 = i;
        });
      }
      if (sortIdx2 < 0) sortIdx2 = 0;
      if (nameIdx2 < 0) nameIdx2 = 1;
      for (var j = 1; j < rows2.length; j++) {
        var sortVal2 = rows2[j][sortIdx2];
        var groupName = String(rows2[j][nameIdx2] || '').trim();
        if (groupName) {
          result.groups.push({ sort: Number(sortVal2) || 999, name: groupName });
        }
      }
      result.groups.sort(function(a, b) { return a.sort - b.sort; });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: '读取排序数据失败: ' + e.message });
  }
});

module.exports = router;
