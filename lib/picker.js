/**
 * picker.js -- 原生文件/文件夹选择器子进程包装器
 * 统一封装 folderpicker.exe / filepicker.exe 的启动、输出捕获、状态码与超时处理
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * 运行原生选择器可执行文件
 * @param {string} exeName - 如 'folderpicker.exe' 或 'filepicker.exe'
 * @param {string[]} [args] - 命令行参数数组
 * @param {number} [timeoutMs=60000] - 超时毫秒数，默认 60 秒
 * @returns {Promise<{ ok: boolean, path: string|null, error?: string, timedOut?: boolean }>}
 */
function runPicker(exeName, args, timeoutMs) {
  return new Promise((resolve) => {
    const pickerExe = path.join(__dirname, exeName);
    if (!fs.existsSync(pickerExe)) {
      return resolve({ ok: false, error: exeName + ' not found' });
    }

    const timeout = timeoutMs || 60000;
    let done = false;
    let stdoutData = '';

    const child = spawn(pickerExe, args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', function(chunk) {
      stdoutData += chunk.toString('utf8');
    });

    child.stderr.on('data', function() {
      // 忽略 stderr
    });

    child.on('error', function(err) {
      if (!done) {
        done = true;
        resolve({ ok: false, error: '无法启动选择器: ' + err.message });
      }
    });

    child.on('close', function(code) {
      if (done) return;
      done = true;
      const result = stdoutData.trim();
      if (code === 0) {
        resolve({ ok: true, path: result || null });
      } else if (code === 2 && result) {
        resolve({ ok: false, error: result });
      } else {
        // 用户主动取消选择
        resolve({ ok: true, path: null });
      }
    });

    setTimeout(function() {
      if (done) return;
      done = true;
      try { child.kill(); } catch (e) {}
      resolve({ ok: false, error: '选择超时', timedOut: true });
    }, timeout);
  });
}

module.exports = { runPicker };
