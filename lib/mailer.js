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
  });
}

async function sendBatch(config, tasks) {
  abortFlag = false;
  const total = tasks.length;
  let successCount = 0;
  let failCount = 0;
  const failDetails = [];

  const transporter = createTransport(config);

  for (let i = 0; i < tasks.length; i++) {
    // 检查停止标志
    if (abortFlag) {
      for (let j = i; j < tasks.length; j++) {
        failCount++;
        failDetails.push({ dept: tasks[j].dept || '', error: '用户手动停止' });
      }
      progressEmitter.emit('done', { successCount, failCount, failDetails, aborted: true });
      return { successCount, failCount, failDetails, aborted: true };
    }
    const task = tasks[i];
    const dept = task.dept || '';
    let error = null;

    // 通知前端：正在发送给该部门
    progressEmitter.emit('progress', {
      type: 'sending', index: i, total, dept,
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

      await transporter.sendMail(mailOptions);
      successCount++;
      progressEmitter.emit('progress', {
        type: 'success', index: i + 1, total, dept,
      });
    } catch (e) {
      error = e.message;
      failCount++;
      failDetails.push({ dept, error });
      progressEmitter.emit('progress', {
        type: 'error', index: i + 1, total, dept, error,
      });
    }

    // 间隔：开启随机延迟则等待 2-6 秒，否则固定 1 秒（最后一封不等）
    if (i < tasks.length - 1) {
      // 等待期间也检查停止标志
      if (abortFlag) {
        for (let j = i + 1; j < tasks.length; j++) {
          failCount++;
          failDetails.push({ dept: tasks[j].dept || '', error: '用户手动停止' });
        }
        progressEmitter.emit('done', { successCount, failCount, failDetails, aborted: true });
        return { successCount, failCount, failDetails, aborted: true };
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

  progressEmitter.emit('done', { successCount, failCount, failDetails });
  return { successCount, failCount, failDetails };
}

module.exports = { getProgressEmitter, sendBatch, createTransport, abortSend };
