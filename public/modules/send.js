/**
 * modules/send.js -- 发送按钮、大看板弹出层、SSE 客户端与重试逻辑
 * 省略单部门冗余的部门列，全展开收件人明细，支持网络异常白话化与一键重试
 */

var currentSendTasks = [];
var currentGroups = [];
var activeEs = null;
var countdownTimer = null;

function initSend() {
  $('send-btn').addEventListener('click', onSendClick);
  // 确认对话框按钮
  $('confirm-cancel-btn').addEventListener('click', function() {
    $('confirm-dialog').style.display = 'none';
  });
  // 停止发送按钮
  $('progress-abort-btn').addEventListener('click', onAbortClick);
  // 看板重试按钮
  $('dashboard-retry-btn').addEventListener('click', onRetryClick);
  // 看板关闭按钮
  $('dashboard-close-btn').addEventListener('click', function() {
    $('progress-overlay').style.display = 'none';
  });
}

function onAbortClick() {
  $('progress-abort-btn').disabled = true;
  $('progress-abort-btn').textContent = '正在停止...';
  fetch('/api/send/abort', { method: 'POST' }).catch(function() {});
}

/**
 * 翻译常见 SMTP 与网络异常为通俗中文
 */
function formatSmtpError(rawError, code) {
  if (!rawError && !code) return '未知发送错误';
  var err = String(rawError || '');
  var c = String(code || '');

  if (c === 'ETIMEDOUT' || err.includes('ETIMEDOUT') || err.includes('ESOCKETTIMEDOUT') || err.includes('timeout')) {
    return '连接 SMTP 服务器超时，请检查本地网络或邮箱服务器配置';
  }
  if (c === 'ECONNREFUSED' || err.includes('ECONNREFUSED')) {
    return '连接被拒绝，请确认 SMTP 服务器地址与端口是否正确';
  }
  if (c === 'ENOTFOUND' || err.includes('ENOTFOUND') || err.includes('getaddrinfo')) {
    return 'DNS 解析失败，无法找到 SMTP 服务器域名，请检查网络';
  }
  if (err.includes('535') || err.includes('Authentication') || err.includes('BadCredentials')) {
    return '邮箱认证失败（535），请检查设置中的用户名与密码/授权码';
  }
  if (err.includes('552') || err.includes('Message size exceeds')) {
    return '邮件附件总体积超出发件邮箱单封邮件上限';
  }
  if (err.includes('554') || err.includes('421') || err.includes('Too many') || err.includes('frequency')) {
    return '触发发信频次风控或被服务商限速（554/421），请稍后重试';
  }
  if (err.includes('550') || err.includes('User not found') || err.includes('Mailbox unavailable')) {
    return '服务器拒绝投递：收件人地址无效或不可用';
  }
  if (err.includes('self-signed') || err.includes('certificate')) {
    return 'SSL/TLS 证书验证失败，请确认端口与 SSL 开关配置';
  }
  return err;
}

function clearCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  $('progress-countdown').innerHTML = '&nbsp;';
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
    '即将发送 ' + sendTasks.length + ' 封邮件（包含 ' + getSelectedRecipients().length + ' 位收件人），确定要发送吗？');
  if (!confirmed) return;

  currentSendTasks = sendTasks;
  currentGroups = groups;

  startSendingProcess();
}

function onRetryClick() {
  if (state.sending || !currentSendTasks.length) return;
  startSendingProcess();
}

/**
 * 启动发送流程并渲染看板
 */
function startSendingProcess() {
  state.sending = true;
  $('send-btn').disabled = true;
  $('send-btn').textContent = '发送中...';
  $('preview-btn').disabled = true;
  $('preview-send-btn').disabled = true;

  clearCountdown();
  if (activeEs) {
    activeEs.close();
    activeEs = null;
  }

  var subject = getSubject();
  var groups = currentGroups;
  var sendTasks = currentSendTasks;

  // 1. 设置头部标题与部门徽章
  var deptNames = groups.map(function(g) { return g.dept; }).filter(Boolean);
  var deptLabel = deptNames.length === 1 ? deptNames[0] : (deptNames.length > 1 ? (deptNames[0] + ' 等 ' + deptNames.length + ' 个部门') : '全部部门');
  $('dashboard-dept-badge').textContent = deptLabel;
  $('dashboard-title').textContent = '邮件发送看板';
  $('dashboard-stats').textContent = '正在连接中...';

  // 2. 填写概要卡片
  $('dashboard-subject').textContent = subject;
  var allAttachNames = [];
  groups.forEach(function(g) {
    if (g.attachNames && g.attachNames.length) {
      allAttachNames = allAttachNames.concat(g.attachNames);
    }
  });
  if (allAttachNames.length > 0) {
    $('dashboard-attachments').textContent = allAttachNames.join('、') + '（共 ' + allAttachNames.length + ' 个文件）';
  } else {
    $('dashboard-attachments').textContent = '无附件';
  }

  // 3. 渲染收件人明细表格（省略部门列）
  var tbody = $('dashboard-recip-tbody');
  tbody.innerHTML = '';

  var personIdx = 1;
  groups.forEach(function(g, gIdx) {
    // 收件人 To
    (g.toPeople || []).forEach(function(p) {
      var row = createRecipientRow(personIdx++, p.name, p.email, '收件人', 'to', gIdx);
      tbody.appendChild(row);
    });
    // 抄送 Cc
    (g.ccPeople || []).forEach(function(p) {
      var row = createRecipientRow(personIdx++, p.name, p.email, '抄送', 'cc', gIdx);
      tbody.appendChild(row);
    });
  });

  // 4. 重置进度条、日志区与操作按钮
  $('progress-overlay').style.display = 'flex';
  $('progress-bar-fill').style.width = '0%';
  $('progress-info').textContent = '正在准备建立发信通道...';
  $('dashboard-log-content').textContent = '正在初始化发件连接...';
  $('dashboard-log-content').className = 'log-content';
  $('dashboard-notice').style.display = 'none';

  $('progress-abort-btn').style.display = 'inline-block';
  $('progress-abort-btn').disabled = false;
  $('progress-abort-btn').textContent = '停止发送';
  $('dashboard-retry-btn').style.display = 'none';
  $('dashboard-close-btn').style.display = 'none';

  // 5. 启动 SSE 连接
  var es = new EventSource('/api/send/progress');
  activeEs = es;
  var posted = false;

  es.onmessage = function(e) {
    var data = JSON.parse(e.data);

    // SSE 就绪，发起 POST 请求
    if (data.type === 'ready' && !posted) {
      posted = true;
      $('dashboard-log-content').textContent = '通信通道已就绪，正在投递任务数据至发件队列...';
      fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: sendTasks }),
      }).catch(function(err) {
        clearCountdown();
        es.close();
        activeEs = null;
        onSendErrorOccurred('发起发信请求失败: ' + err.message);
      });
      return;
    }

    if (data.type === 'done') {
      clearCountdown();
      es.close();
      activeEs = null;
      onSendDone(data);
      return;
    }

    if (data.type === 'sending') {
      clearCountdown();
      var pct = Math.round((data.index / data.total) * 100);
      $('progress-bar-fill').style.width = Math.max(pct, 15) + '%';
      $('progress-info').textContent = '正在投递邮件... (' + (data.index + 1) + '/' + data.total + ')';
      $('dashboard-stats').textContent = '传输中 (' + (data.index + 1) + '/' + data.total + ')';
      $('dashboard-log-content').textContent = '正在向发信服务器传输正文与附件（附件数：' + (data.attachCount || 0) + '）...';
      $('dashboard-log-content').className = 'log-content';

      // 标记对应组收件人为传输中
      setGroupRowsState(data.index, 'sending', '传输中', '正在传输正文与附件...');
      return;
    }

    if (data.type === 'waiting') {
      clearCountdown();
      $('progress-info').textContent = '已投递完成，准备发送下一封...';
      var remaining = data.delay;
      $('progress-countdown').textContent = remaining + ' 秒';
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

    if (data.type === 'success') {
      var pct2 = Math.round((data.index / sendTasks.length) * 100);
      $('progress-bar-fill').style.width = pct2 + '%';

      var feedbackMsg = '250 OK: 已成功交付发件服务器外发';
      if (data.warning) {
        feedbackMsg = data.warning;
      } else if (data.response) {
        feedbackMsg = data.response;
      }
      setGroupRowsState(data.index - 1, data.warning ? 'partial' : 'success', data.warning ? '部分拒收' : '已交付', feedbackMsg);

      var logText = '投递成功：服务器已接收';
      if (data.messageId) logText += ' (Message-ID: ' + data.messageId + ')';
      $('dashboard-log-content').textContent = logText;
      $('dashboard-log-content').className = 'log-content success';
      return;
    }

    if (data.type === 'error') {
      var friendlyError = formatSmtpError(data.error, data.code);
      setGroupRowsState(data.index - 1, 'error', '失败', friendlyError);

      $('dashboard-log-content').textContent = '发送失败：' + friendlyError;
      $('dashboard-log-content').className = 'log-content error';
      return;
    }
  };

  es.onerror = function() {
    clearCountdown();
    es.close();
    activeEs = null;
    onSendErrorOccurred('与本地后台服务的通信中断，请确认后台是否正常运行');
  };
}

function createRecipientRow(idx, name, email, typeText, typeRole, gIdx) {
  var tr = document.createElement('tr');
  tr.className = 'recip-row gidx-' + gIdx;

  // 序号
  var tdIdx = document.createElement('td');
  tdIdx.textContent = idx;
  tr.appendChild(tdIdx);

  // 姓名
  var tdName = document.createElement('td');
  tdName.textContent = name || '（未填）';
  tdName.style.fontWeight = '600';
  tr.appendChild(tdName);

  // 邮箱
  var tdEmail = document.createElement('td');
  tdEmail.textContent = email;
  tdEmail.style.fontFamily = 'monospace';
  tdEmail.style.color = '#1e293b';
  tr.appendChild(tdEmail);

  // 类型
  var tdType = document.createElement('td');
  tdType.textContent = typeText;
  tdType.style.color = typeRole === 'cc' ? '#d97706' : '#2563eb';
  tdType.style.fontWeight = '600';
  tr.appendChild(tdType);

  // 状态徽章
  var tdStatus = document.createElement('td');
  var badge = document.createElement('span');
  badge.className = 'status-badge pending status-badge-cell';
  badge.textContent = '待交付';
  tdStatus.appendChild(badge);
  tr.appendChild(tdStatus);

  // 反馈说明
  var tdFeedback = document.createElement('td');
  tdFeedback.className = 'feedback-cell';
  tdFeedback.textContent = '等待发信...';
  tdFeedback.style.color = '#64748b';
  tr.appendChild(tdFeedback);

  return tr;
}

function setGroupRowsState(gIdx, statusKey, statusText, feedbackText) {
  var rows = document.querySelectorAll('.recip-row.gidx-' + gIdx);
  rows.forEach(function(row) {
    row.className = 'recip-row gidx-' + gIdx;
    if (statusKey === 'sending') row.classList.add('active-sending');
    else if (statusKey === 'success') row.classList.add('row-success');
    else if (statusKey === 'error') row.classList.add('row-error');

    var badge = row.querySelector('.status-badge-cell');
    if (badge) {
      badge.className = 'status-badge ' + statusKey + ' status-badge-cell';
      badge.textContent = statusText;
    }

    var fb = row.querySelector('.feedback-cell');
    if (fb) {
      fb.textContent = feedbackText;
      if (statusKey === 'error') {
        fb.style.color = '#dc2626';
        fb.style.fontWeight = 'bold';
      } else if (statusKey === 'success') {
        fb.style.color = '#16a34a';
        fb.style.fontWeight = 'normal';
      } else if (statusKey === 'partial') {
        fb.style.color = '#d97706';
        fb.style.fontWeight = 'bold';
      } else {
        fb.style.color = '#2563eb';
      }
    }
  });
}

function onSendErrorOccurred(errorMsg) {
  resetSendButton();
  $('progress-bar-fill').style.width = '100%';
  $('progress-info').textContent = '发信中断';
  $('dashboard-stats').textContent = '发信失败';
  $('dashboard-log-content').textContent = errorMsg;
  $('dashboard-log-content').className = 'log-content error';

  $('progress-abort-btn').style.display = 'none';
  $('dashboard-retry-btn').style.display = 'inline-block';
  $('dashboard-close-btn').style.display = 'inline-block';
}

function onSendDone(data) {
  $('progress-bar-fill').style.width = '100%';
  resetSendButton();

  $('progress-abort-btn').style.display = 'none';
  $('dashboard-close-btn').style.display = 'inline-block';

  if (data.aborted) {
    $('dashboard-title').textContent = '已停止发送';
    $('progress-info').textContent = '发信任务已中止';
    $('dashboard-stats').textContent = '已停止';
    return;
  }

  if (data.failCount > 0) {
    $('dashboard-title').textContent = '发送未完全成功';
    $('progress-info').textContent = '成功交付 ' + data.successCount + ' 封，失败 ' + data.failCount + ' 封';
    $('dashboard-stats').textContent = '有失败项';
    $('dashboard-retry-btn').style.display = 'inline-block';
  } else {
    $('dashboard-title').textContent = '发送已完成';
    $('progress-info').textContent = '已全部成功交付发件服务器外发';
    $('dashboard-stats').textContent = '全部成功';
    $('dashboard-notice').style.display = 'flex';
  }
}

function resetSendButton() {
  state.sending = false;
  $('send-btn').disabled = false;
  $('send-btn').textContent = '发送';
  $('preview-btn').disabled = false;
  $('preview-send-btn').disabled = false;
}
