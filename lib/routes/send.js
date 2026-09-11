/**
 * routes/send.js -- 邮件发送与进度推送路由
 */

const express = require('express');
const router = express.Router();
const { getConfig } = require('../config');
const { getProgressEmitter, sendBatch, abortSend } = require('../mailer');
const { cleanupTemp } = require('../attachments');

// 发送邮件
router.post('/send', async (req, res) => {
  const config = getConfig();
  if (!config) {
    return res.status(500).json({ error: 'SMTP 配置未加载' });
  }
  const tasks = req.body.tasks || [];
  if (!tasks.length) {
    return res.status(400).json({ error: '没有发送任务' });
  }

  res.json({ ok: true });

  // 异步发送
  sendBatch(config, tasks).then(() => {
    cleanupTemp();
  }).catch(e => {
    console.error('发送失败:', e);
    getProgressEmitter().emit('done', {
      successCount: 0, failCount: tasks.length,
      failDetails: tasks.map(t => ({ dept: t.dept, error: e.message })),
    });
    cleanupTemp();
  });
});

// 停止发送
router.post('/send/abort', (req, res) => {
  abortSend();
  res.json({ ok: true });
});

// SSE 进度推送
router.get('/send/progress', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // 先发 ready 事件，通知前端 SSE 已就绪
  res.write('data: ' + JSON.stringify({ type: 'ready' }) + '\n\n');

  const emitter = getProgressEmitter();

  const onProgress = (data) => {
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  };
  const onDone = (data) => {
    res.write('data: ' + JSON.stringify({ type: 'done', ...data }) + '\n\n');
    res.end();
    emitter.off('progress', onProgress);
    emitter.off('done', onDone);
  };

  emitter.on('progress', onProgress);
  emitter.on('done', onDone);

  req.on('close', () => {
    emitter.off('progress', onProgress);
    emitter.off('done', onDone);
  });
});

module.exports = router;
