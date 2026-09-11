/**
 * mailer.js -- nodemailer 封装：SMTP 发送、批量发送、SSE 进度
 */

const nodemailer = require('nodemailer');
const EventEmitter = require('events');

let progressEmitter = new EventEmitter();
let abortFlag = false;

function getProgressEmitter() {
  return progressEmitter;
}

function abortSend() {
  abortFlag = true;
}

function createTransport(config) {
  return nodemailer.createTransport({
    host: config.smtp_server,
    port: config.smtp_port,
    secure: config.use_ssl,
    auth: { user: config.username, pass: config.password },
    connectionTimeout: 10000, // 建立连接超时 10 秒
    greetingTimeout: 10000,   // 等待问候语超时 10 秒
    socketTimeout: 30000,     // 传输数据超时 30 秒
  });
}

async function sendBatch(config, tasks) {
  abortFlag = false;
  const total = tasks.length;
  let successCount = 0;
  let failCount = 0;
  let stopCount = 0;
  const results = [];  // 全量结果：每个部门一条

  const transporter = createTransport(config);

  for (let i = 0; i < tasks.length; i++) {
    // 检查停止标志
    if (abortFlag) {
      for (let j = i; j < tasks.length; j++) {
        stopCount++;
        results.push({ dept: tasks[j].dept || '', status: 'stopped' });
      }
      progressEmitter.emit('done', { successCount, failCount, stopCount, results, aborted: true });
      return { successCount, failCount, stopCount, results, aborted: true };
    }
    const task = tasks[i];
    const dept = task.dept || '';
    let error = null;

    // 通知前端：正在发送该任务，附带收件人和附件信息
    progressEmitter.emit('progress', {
      type: 'sending',
      index: i,
      total,
      dept,
      to: task.to || [],
      cc: task.cc || [],
      attachCount: (task.attachments || []).length,
    });

    try {
      const mailOptions = {
        from: config.username,
        to: task.to.join(', '),
        subject: task.subject,
        html: task.html,
        attachments: (task.attachments || []).map(a => {
          var fname = a.filename || a.name || 'attachment';
          return {
            filename: fname,
            path: a.path,
            headers: {
              'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(fname),
            },
          };
        }),
      };
      if (task.cc && task.cc.length) {
        mailOptions.cc = task.cc.join(', ');
      }

      const info = await transporter.sendMail(mailOptions);
      const accepted = info.accepted || [];
      const rejected = info.rejected || [];
      const response = info.response || '';
      const messageId = info.messageId || '';

      if (rejected.length > 0 && accepted.length === 0) {
        error = '收件人地址均被服务器拒绝: ' + rejected.join(', ');
        failCount++;
        results.push({ dept, status: 'error', error, messageId, response, rejected, accepted });
        progressEmitter.emit('progress', {
          type: 'error', index: i + 1, total, dept, error, messageId, response, rejected, accepted,
        });
      } else if (rejected.length > 0) {
        const warning = '部分收件人被服务器拒绝: ' + rejected.join(', ');
        successCount++;
        results.push({ dept, status: 'partial', warning, messageId, response, rejected, accepted });
        progressEmitter.emit('progress', {
          type: 'success', index: i + 1, total, dept, warning, messageId, response, rejected, accepted,
        });
      } else {
        successCount++;
        results.push({ dept, status: 'success', messageId, response, accepted });
        progressEmitter.emit('progress', {
          type: 'success', index: i + 1, total, dept, messageId, response, accepted,
        });
      }
    } catch (e) {
      error = e.message || '发送失败';
      const code = e.code || '';
      failCount++;
      results.push({ dept, status: 'error', error, code });
      progressEmitter.emit('progress', {
        type: 'error', index: i + 1, total, dept, error, code,
      });
    }

    // 间隔：开启随机延迟则等待 2-6 秒，否则固定 1 秒（最后一封不等）
    if (i < tasks.length - 1) {
      // 等待期间也检查停止标志
      if (abortFlag) {
        for (let j = i + 1; j < tasks.length; j++) {
          stopCount++;
          results.push({ dept: tasks[j].dept || '', status: 'stopped' });
        }
        progressEmitter.emit('done', { successCount, failCount, stopCount, results, aborted: true });
        return { successCount, failCount, stopCount, results, aborted: true };
      }
      var delay;
      if (config.random_delay) {
        delay = 2000 + Math.floor(Math.random() * 4000); // 2-6 秒随机
      } else {
        delay = 1000;
      }
      var nextDept = (tasks[i + 1].dept || '');
      // 通知前端：已发送给当前部门，即将等待，下一封发给 nextDept
      progressEmitter.emit('progress', {
        type: 'waiting',
        index: i + 1, total,
        dept: dept,
        status: error ? 'error' : 'success',
        nextDept: nextDept,
        delay: Math.round(delay / 1000),
      });
      await new Promise(r => setTimeout(r, delay));
    }
  }

  progressEmitter.emit('done', { successCount, failCount, stopCount, results, aborted: false });
  return { successCount, failCount, stopCount, results, aborted: false };
}

module.exports = { getProgressEmitter, sendBatch, createTransport, abortSend };
