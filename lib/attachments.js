/**
 * attachments.js -- 附件上传临时存储与清理
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let tempDir = null;

/**
 * multer/busboy 默认按 Latin1 解析 originalname，
 * 浏览器发送的 UTF-8 文件名需要转回 Buffer 再按 UTF-8 解码。
 */
function fixEncoding(str) {
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch (e) {
    return str;
  }
}

function getTempDir() {
  if (!tempDir) {
    const stamp = Date.now();
    tempDir = path.join(os.tmpdir(), 'batch-email-attachments-' + stamp);
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * 保存上传的文件到临时目录，按部门子目录组织
 * files: multer 文件数组 [{originalname, path, buffer}]
 * 返回 {部门: [{name, tempPath}]}
 */
function saveUploadedFiles(files) {
  const dir = getTempDir();
  const result = {};

  files.forEach(f => {
    // originalname 格式: "部门/文件名"（前端传入），修复中文编码
    const fixedName = fixEncoding(f.originalname);
    const parts = fixedName.split('/');
    const dept = parts[0];
    const filename = parts.slice(1).join('/') || parts[0];

    const deptDir = path.join(dir, dept);
    fs.mkdirSync(deptDir, { recursive: true });
    const dest = path.join(deptDir, filename);
    fs.copyFileSync(f.path, dest);

    if (!result[dept]) result[dept] = [];
    result[dept].push({ name: filename, tempPath: dest });
  });

  return result;
}

function cleanupTemp() {
  if (tempDir && fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('清理临时目录失败:', e.message);
    }
    tempDir = null;
  }
}

module.exports = { saveUploadedFiles, cleanupTemp };
