/**
 * routes/files.js -- 文件/文件夹选择与扫描路由
 * folderpicker/filepicker 调用、附件目录扫描、拖拽文件夹路径定位
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// 浏览选择文件夹（使用 folderpicker.exe）
router.post('/browse-folder', (req, res) => {
  var pickerExe = path.join(__dirname, '..', 'folderpicker.exe');
  if (!fs.existsSync(pickerExe)) {
    return res.status(500).json({ error: 'folderpicker.exe not found' });
  }

  var done = false;
  var child = spawn(pickerExe, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  var stdoutData = '';

  child.stdout.on('data', function(chunk) {
    stdoutData += chunk.toString('utf8');
  });
  child.stderr.on('data', function(chunk) {
    // ignore stderr
  });

  child.on('error', function(err) {
    if (!done && !res.headersSent) {
      done = true;
      res.status(500).json({ error: '无法启动文件夹选择: ' + err.message });
    }
  });

  child.on('close', function(code) {
    if (done) return;
    done = true;
    if (code === 0) {
      var result = stdoutData.trim();
      if (result) {
        res.json({ folderPath: result });
      } else {
        res.json({ folderPath: null });
      }
    } else {
      if (code === 2 && stdoutData.trim()) {
        res.status(500).json({ error: stdoutData.trim() });
      } else {
        res.json({ folderPath: null });
      }
    }
  });

  // 超时保护（60秒）
  setTimeout(function() {
    if (done) return;
    done = true;
    try { child.kill(); } catch (e) {}
    if (!res.headersSent) {
      res.status(504).json({ error: '选择文件夹超时' });
    }
  }, 60000);
});

// 浏览选择文件（使用 filepicker.exe）
router.post('/browse-file', (req, res) => {
  var pickerExe = path.join(__dirname, '..', 'filepicker.exe');
  if (!fs.existsSync(pickerExe)) {
    return res.status(500).json({ error: 'filepicker.exe not found' });
  }

  var filter = (req.body && req.body.filter) || 'Excel \u6587\u4ef6 (*.xlsx;*.xls)|*.xlsx;*.xls|\u6240\u6709\u6587\u4ef6|*.*';

  var done = false;
  var child = spawn(pickerExe, ['\u8bf7\u9009\u62e9\u6536\u4ef6\u4eba\u540d\u5355\u6587\u4ef6', filter], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  var stdoutData = '';

  child.stdout.on('data', function(chunk) {
    stdoutData += chunk.toString('utf8');
  });
  child.stderr.on('data', function(chunk) {
    // ignore stderr
  });

  child.on('error', function(err) {
    if (!done && !res.headersSent) {
      done = true;
      res.status(500).json({ error: '无法启动文件选择: ' + err.message });
    }
  });

  child.on('close', function(code) {
    if (done) return;
    done = true;
    if (code === 0) {
      var result = stdoutData.trim();
      if (result) {
        res.json({ filePath: result });
      } else {
        res.json({ filePath: null });
      }
    } else {
      if (code === 2 && stdoutData.trim()) {
        res.status(500).json({ error: stdoutData.trim() });
      } else {
        res.json({ filePath: null });
      }
    }
  });

  // 超时保护（60秒）
  setTimeout(function() {
    if (done) return;
    done = true;
    try { child.kill(); } catch (e) {}
    if (!res.headersSent) {
      res.status(504).json({ error: '选择文件超时' });
    }
  }, 60000);
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
    path.dirname(exeDir) + '\\附件根目录',
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
