/**
 * routes/files.js -- 文件/文件夹选择与扫描路由
 * folderpicker/filepicker 调用、附件目录扫描、拖拽文件夹路径定位
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { runPicker } = require('../picker');

// 浏览选择文件夹（使用 folderpicker.exe）
router.post('/browse-folder', async (req, res) => {
  const result = await runPicker('folderpicker.exe');
  if (!result.ok) {
    return res.status(result.timedOut ? 504 : 500).json({ error: result.error });
  }
  res.json({ folderPath: result.path });
});

// 浏览选择文件（使用 filepicker.exe）
router.post('/browse-file', async (req, res) => {
  const filter = (req.body && req.body.filter) || 'Excel 文件 (*.xlsx;*.xls)|*.xlsx;*.xls|所有文件|*.*';
  const result = await runPicker('filepicker.exe', ['请选择收件人名单文件', filter]);
  if (!result.ok) {
    return res.status(result.timedOut ? 504 : 500).json({ error: result.error });
  }
  res.json({ filePath: result.path });
});

// 递归扫描文件夹，返回 {部门: [{name, fullPath, size}]}
function scanFolder(folderPath) {
  const result = {};
  const subdirs = fs.readdirSync(folderPath, { withFileTypes: true });
  subdirs.forEach(function(entry) {
    if (entry.isDirectory()) {
      var dept = entry.name;
      var deptPath = path.join(folderPath, dept);
      var files = [];
      function scanDir(dir, relPrefix) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(function(f) {
          if (f.isDirectory()) {
            scanDir(path.join(dir, f.name), relPrefix ? relPrefix + '/' + f.name : f.name);
          } else if (f.isFile()) {
            files.push({
              name: relPrefix ? relPrefix + '/' + f.name : f.name,
              fullPath: path.join(dir, f.name),
              size: fs.statSync(path.join(dir, f.name)).size,
            });
          }
        });
      }
      scanDir(deptPath, '');
      if (files.length > 0) result[dept] = files;
    }
  });
  return result;
}

// 扫描附件目录
router.post('/scan-attachments', (req, res) => {
  const folderPath = req.body.folderPath;
  if (!folderPath) {
    return res.status(400).json({ error: '请提供文件夹路径' });
  }
  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: '文件夹不存在: ' + folderPath });
  }
  const stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: '路径不是文件夹: ' + folderPath });
  }

  try {
    const result = scanFolder(folderPath);
    res.json({ folderPath: folderPath, depts: result, mode: 'local' });
  } catch (e) {
    res.status(500).json({ error: '扫描文件夹失败: ' + e.message });
  }
});

// 根据文件夹名搜索本地真实路径（拖拽文件夹时用）
router.post('/resolve-folder', (req, res) => {
  var folderName = req.body.folderName;
  if (!folderName) {
    return res.status(400).json({ error: '缺少文件夹名' });
  }

  var exeDir = process.env.EXE_DIR || path.resolve(__dirname, '..', '..');
  var candidates = [
    exeDir,
    path.dirname(exeDir),
    path.join(exeDir, '附件根目录'),
    path.join(exeDir, '附件根目录(参考样例)'),
    path.dirname(exeDir) + '\\附件根目录',
    path.dirname(exeDir) + '\\附件根目录(参考样例)',
    'C:\\Users\\' + os.userInfo().username + '\\Desktop',
    'C:\\Users\\' + os.userInfo().username + '\\Documents',
  ];

  function searchDir(dir, depth) {
    if (depth > 2) return null;
    try {
      var entries = fs.readdirSync(dir, { withFileTypes: true });
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isDirectory() && entries[i].name === folderName) {
          var found = path.join(dir, folderName);
          if (fs.existsSync(found)) return found;
        }
      }
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].isDirectory()) {
          var subdir = path.join(dir, entries[j].name);
          if (subdir.match(/node_modules|\.git|Windows|Program Files/i)) continue;
          var result = searchDir(subdir, depth + 1);
          if (result) return result;
        }
      }
    } catch (e) {}
    return null;
  }

  for (var c = 0; c < candidates.length; c++) {
    if (!fs.existsSync(candidates[c])) continue;
    if (path.basename(candidates[c]) === folderName) {
      return res.json({ folderPath: candidates[c] });
    }
    var direct = path.join(candidates[c], folderName);
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
      return res.json({ folderPath: direct });
    }
    var found = searchDir(candidates[c], 0);
    if (found) {
      return res.json({ folderPath: found });
    }
  }

  res.json({ folderPath: null, error: '未找到文件夹: ' + folderName + '，请用"选择"按钮手动指定' });
});

module.exports = router;
