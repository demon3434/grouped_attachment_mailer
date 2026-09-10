/**
 * mailer.js -- nodemailer 封装：SMTP 发送、批量发送、SSE 进度
 */

const nodemailer = require('nodemailer');
const EventEmitter = require('events');

let progressEmitter = new EventEmitter();

function getProgressEmitter() {
  return progressEmitter;
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
  const total = tasks.length;
  let successCount = 0;
  let failCount = 0;
  const failDetails = [];

  const transporter = createTransport(config);

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const dept = task.dept || '';
    let error = null;

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
        index: i + 1, total, dept, status: 'success', error: null,
      });
    } catch (e) {
      error = e.message;
      failCount++;
      failDetails.push({ dept, error });
      progressEmitter.emit('progress', {
        index: i + 1, total, dept, status: 'error', error,
      });
    }

    // 间隔：开启随机延迟则等待 2-6 秒，否则固定 1 秒（最后一封不等）
    if (i < tasks.length - 1) {
      var delay;
      if (config.random_delay) {
        delay = 2000 + Math.floor(Math.random() * 4000); // 2-6 秒随机
      } else {
        delay = 1000;
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }

  progressEmitter.emit('done', { successCount, failCount, failDetails });
  return { successCount, failCount, failDetails };
}

module.exports = { getProgressEmitter, sendBatch, createTransport };
