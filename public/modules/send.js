/**
 * modules/send.js -- 发送按钮、进度弹出层、SSE 客户端
 * 发送时弹出进度层，阻止重复点击
 */

function initSend() {
  $('send-btn').addEventListener('click', onSendClick);
  // 确认对话框按钮
  $('confirm-cancel-btn').addEventListener('click', function() {
    $('confirm-dialog').style.display = 'none';
  });
  // 结果对话框按钮
  $('result-ok-btn').addEventListener('click', function() {
    $('result-dialog').style.display = 'none';
  });
  // 停止发送按钮
  $('progress-abort-btn').addEventListener('click', onAbortClick);
}

function onAbortClick() {
  $('progress-abort-btn').disabled = true;
  $('progress-abort-btn').textContent = '正在停止...';
  fetch('/api/send/abort', { method: 'POST' }).catch(function() {});
}

async function onSendClick() {
  if (state.sending) return;

  var subject = getSubject();
  if (!subject) { showResult('提示', '请填写邮件标题', null); return; }

  var body = getBodyText();
  if (!body) { showResult('提示', '请填写邮件正文', null); return; }

  // 构建发送任务
  var groups = groupByDept();
  if (!groups.length) {
    showResult('提示', '没有可发送的邮件，请检查收件人筛选和勾选', null);
    return;
  }

  var bodyHTML = getBodyHTML();
  var sendTasks = groups.map(function(g) {
    return {
      dept: g.dept, to: g.toAddrs, cc: g.ccAddrs,
      subject: subject, html: bodyHTML,
      attachments: g.attachments,
    };
  });

  // 用自定义确认对话框替代 confirm
  var confirmed = await showConfirm('确认发送',
    '即将发送 ' + sendTasks.length + ' 封邮件，确定要发送吗？');
  if (!confirmed) return;

  // 锁定发送状态
  state.sending = true;
  $('send-btn').disabled = true;
  $('send-btn').textContent = '发送中...';
  $('preview-btn').disabled = true;
  $('preview-send-btn').disabled = true;

  // 显示进度弹出层
  $('progress-overlay').style.display = 'flex';
  $('progress-bar').value = 0;
  $('progress-bar').max = sendTasks.length;
  $('progress-info').textContent = '正在发送 0/' + sendTasks.length + '...';
  $('progress-countdown').style.display = 'none';
  $('progress-countdown').textContent = '';
  $('progress-abort-btn').disabled = false;
  $('progress-abort-btn').textContent = '停止发送';

  var countdownTimer = null;

  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    $('progress-countdown').style.display = 'none';
    $('progress-countdown').textContent = '';
  }

  // 发起 SSE 监听进度
  var es = new EventSource('/api/send/progress');
  var posted = false;  // 确保只 POST 一次

  es.onmessage = function(e) {
    var data = JSON.parse(e.data);

    // SSE 连接就绪，发送 POST 请求开始发送
    if (data.type === 'ready' && !posted) {
      posted = true;
      fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: sendTasks }),
      }).catch(function(err) {
        clearCountdown();
        es.close();
        $('progress-overlay').style.display = 'none';
        showResult('发送失败', '发送请求失败: ' + err.message, null);
        resetSendButton();
      });
      return;
    }

    if (data.type === 'done') {
      clearCountdown();
      es.close();
      onSendDone(data);
      return;
    }

    if (data.type === 'sending') {
      clearCountdown();
      $('progress-bar').value = data.index;
      $('progress-info').textContent =
        '正在发送给' + data.dept + '... (' + (data.index + 1) + '/' + data.total + ')';
      return;
    }

    if (data.type === 'waiting') {
      clearCountdown();
      var statusText = data.status === 'success' ? '已成功发送给' : '发送给';
      var resultMark = data.status === 'success' ? ' \u2713' : ' \u2717';
      $('progress-info').textContent =
        statusText + data.dept + resultMark + '，随机等待' + data.delay +
        '秒后，将发送下一封邮件给' + data.nextDept;
      var remaining = data.delay;
      $('progress-countdown').textContent = remaining + ' 秒';
      $('progress-countdown').style.display = 'block';
      countdownTimer = setInterval(function() {
        remaining--;
        if (remaining <= 0) {
          clearCountdown();
        } else {
          $('progress-countdown').textContent = remaining + ' 秒';
        }
      }, 1000);
      return;
    }

    if (data.type === 'success' || data.type === 'error') {
      $('progress-bar').value = data.index;
    }
  };

  es.onerror = function() {
    clearCountdown();
    es.close();
  };
}

function onSendDone(data) {
  // 延迟关闭进度层，让用户看到最后一封的发送结果
  setTimeout(function() {
    resetSendButton();
    $('progress-overlay').style.display = 'none';
    if (data.aborted) {
      var detail = data.failDetails
        .map(function(d) { return d.dept + ': ' + d.error; })
        .join('\n');
      showResult('已停止发送',
        '已发送 ' + data.successCount + ' 封，停止 ' + data.failCount + ' 封',
        data.failCount > 0 ? '停止详情:\n' + detail : null);
    } else if (data.failCount === 0) {
      showResult('发送成功', '全部 ' + data.successCount + ' 封邮件发送成功！', null);
    } else {
      var detail = data.failDetails
        .map(function(d) { return d.dept + ': ' + d.error; })
        .join('\n');
      showResult('发送完成',
        '成功 ' + data.successCount + ' 封, 失败 ' + data.failCount + ' 封',
        '失败详情:\n' + detail);
    }
  }, 800);
}

function resetSendButton() {
  state.sending = false;
  $('send-btn').disabled = false;
  $('send-btn').textContent = '发送';
  $('preview-btn').disabled = false;
  $('preview-send-btn').disabled = false;
}
