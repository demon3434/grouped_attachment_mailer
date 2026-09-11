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

  es.onmessage = function(e) {
    var data = JSON.parse(e.data);

    if (data.type === 'done') {
      clearCountdown();
      es.close();
      onSendDone(data);
      return;
    }

    if (data.type === 'sending') {
      // 正在发送给某部门
      clearCountdown();
      $('progress-bar').value = data.index;
      $('progress-info').textContent =
        '正在发送给' + data.dept + '... (' + (data.index + 1) + '/' + data.total + ')';
      return;
    }

    if (data.type === 'waiting') {
      // 已发送完当前部门，进入随机等待
      clearCountdown();

      var statusText = data.status === 'success' ? '已成功发送给' : '发送给';
      var resultMark = data.status === 'success' ? ' ✓' : ' ✗';
      $('progress-info').textContent =
        statusText + data.dept + resultMark + '，随机等待' + data.delay +
        '秒后，将发送下一封邮件给' + data.nextDept;

      // 第二行：倒计时
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

    // success / error （非 waiting 的独立事件，更新进度条）
    if (data.type === 'success' || data.type === 'error') {
      $('progress-bar').value = data.index;
    }
  };

  // SSE 连接出错时清理
  es.onerror = function() {
    clearCountdown();
    es.close();
  };

  // 等 SSE 连接建立后再发送 POST，避免首封邮件的 sending 事件丢失
  es.onopen = function() {
    fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: sendTasks }),
    }).catch(function(e) {
      clearCountdown();
      es.close();
      $('progress-overlay').style.display = 'none';
      showResult('发送失败', '发送请求失败: ' + e.message, null);
      resetSendButton();
    });
  };
}

function onSendDone(data) {
  // 延迟关闭进度层，让用户看到最后一封的发送结果
  setTimeout(function() {
    resetSendButton();
    $('progress-overlay').style.display = 'none';
    if (data.failCount === 0) {
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
