/**
 * modules/config.js -- 配置状态管理 + 设置弹出层
 */

async function loadConfig() {
  try {
    const resp = await fetch('/api/config');
    const data = await resp.json();
    state.config = data;
    if (window.AppEventBus) AppEventBus.emit('config:updated', data);

    if (data.status === 'ok') {
      $('status-text').textContent =
        '配置已加载: ' + data.username + '@' + data.smtp_server;
      var badge = $('sender-email-display');
      badge.textContent = '发件人: ' + data.username;
      badge.classList.remove('empty');
    } else {
      // 区分"未配置账号密码"和其他错误
      if (data.error && data.error.indexOf('密码') >= 0) {
        $('status-text').textContent = '请先在设置中配置发件邮箱账号和密码';
      } else if (data.error && data.error.indexOf('username') >= 0) {
        $('status-text').textContent = '请先在设置中配置发件邮箱账号和密码';
      } else {
        $('status-text').textContent = '配置未加载: ' + (data.error || '未知错误');
      }
      $('send-btn').disabled = true;
      var badge2 = $('sender-email-display');
      badge2.textContent = '未配置发件人';
      badge2.classList.add('empty');
    }
  } catch (e) {
    $('status-text').textContent = '无法连接服务器: ' + e.message;
    $('send-btn').disabled = true;
    var badgeErr = $('sender-email-display');
    if (badgeErr) {
      badgeErr.textContent = '未配置发件人';
      badgeErr.classList.add('empty');
    }
  }
}

function initConfig() {
  // 齿轮设置按钮
  $('settings-btn').addEventListener('click', openSettings);
  $('settings-close-btn').addEventListener('click', closeSettings);
  $('settings-save-btn').addEventListener('click', saveSettings);
  // 密码眼睛：按下显示明文，松开恢复密文
  var eyeBtn = $('toggle-password-btn');
  var pwdInput = $('set-password');
  var _savedPwd = ''; // 保存松开时要恢复的值
  eyeBtn.addEventListener('mousedown', async function() {
    _savedPwd = pwdInput.value; // 记住当前值
    if (_savedPwd) {
      pwdInput.type = 'text';
      eyeBtn.textContent = '🙈';
    } else if (pwdInput.dataset.hasSaved === 'true') {
      try {
        var resp = await fetch('/api/password');
        var data = await resp.json();
        if (data.password) {
          pwdInput.value = data.password;
          pwdInput.type = 'text';
          eyeBtn.textContent = '🙈';
        }
      } catch (e) {}
    }
  });
  eyeBtn.addEventListener('mouseup', function() {
    pwdInput.type = 'password';
    pwdInput.value = _savedPwd;
    eyeBtn.textContent = '👁';
  });
  eyeBtn.addEventListener('mouseleave', function() {
    if (pwdInput.type === 'text') {
      pwdInput.type = 'password';
      pwdInput.value = _savedPwd;
      eyeBtn.textContent = '👁';
    }
  });
  // 关闭服务按钮（主页图标按钮）
  $('shutdown-btn').addEventListener('click', shutdownServer);
  // 收件人名单文件三点按钮
  $('browse-file-btn').addEventListener('click', browseRecipientFile);
  // 测试连接 / 发送测试邮件
  $('test-conn-btn').addEventListener('click', testConnection);
  $('test-mail-btn').addEventListener('click', testSendMail);
}

// ====== 设置弹出层 ======

async function openSettings() {
  try {
    const resp = await fetch('/api/settings');
    if (!resp.ok) {
      showResultDialog('加载失败', '加载设置失败');
      return;
    }
    const cfg = await resp.json();

    $('set-smtp-server').value = cfg.smtp_server || '';
    $('set-smtp-port').value = cfg.smtp_port || 465;
    $('set-username').value = cfg.username || '';

    var pwdInput = $('set-password');
    pwdInput.value = '';
    pwdInput.type = 'password';
    $('toggle-password-btn').textContent = '👁';
    if (cfg.hasPassword || cfg.password) {
      pwdInput.placeholder = '已设置密码（如无需修改请留空）';
      pwdInput.dataset.hasSaved = 'true';
    } else {
      pwdInput.placeholder = '请输入邮箱密码或授权码';
      pwdInput.dataset.hasSaved = 'false';
    }

    $('set-use-ssl').checked = cfg.use_ssl !== false;
    $('set-random-delay').checked = cfg.random_delay !== false;
    $('set-port').value = cfg.port || 8460;
    $('set-recipient-file').value = cfg.recipient_file || '收件人名单.xlsx';
    $('set-sheet-recipients').value = cfg.sheet_recipients || '收件人名单';
    $('set-sheet-depts').value = cfg.sheet_depts || '部门';
    $('set-sheet-groups').value = cfg.sheet_groups || '分组';

    $('settings-overlay').style.display = 'flex';
  } catch (e) {
    showResultDialog('加载失败', '加载设置失败: ' + e.message);
  }
}

function closeSettings() {
  $('settings-overlay').style.display = 'none';
}

async function saveSettings() {
  var newConfig = {
    smtp_server: $('set-smtp-server').value.trim(),
    smtp_port: parseInt($('set-smtp-port').value, 10),
    username: $('set-username').value.trim(),
    password: $('set-password').value.trim(),
    use_ssl: $('set-use-ssl').checked,
    random_delay: $('set-random-delay').checked,
    port: parseInt($('set-port').value, 10) || 8460,
    recipient_file: $('set-recipient-file').value.trim(),
    sheet_recipients: $('set-sheet-recipients').value.trim(),
    sheet_depts: $('set-sheet-depts').value.trim(),
    sheet_groups: $('set-sheet-groups').value.trim(),
  };

  try {
    const resp = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    const data = await resp.json();
    if (data.ok) {
      closeSettings();
      // 重新加载配置状态
      await loadConfig();
      // 重新加载收件人名单（按新的 sheet 配置读取）
      await loadDefaultRecipients();
      showResultDialog('提示', '设置已保存');
    } else {
      showResultDialog('保存失败', data.error || '未知错误');
    }
  } catch (e) {
    showResultDialog('保存失败', e.message);
  }
}

// ====== 收件人名单文件选择 ======
async function browseRecipientFile() {
  try {
    var resp = await fetch('/api/browse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: 'Excel 文件 (*.xlsx;*.xls)|*.xlsx;*.xls|所有文件|*.*' }),
    });
    var data = await resp.json();
    if (!resp.ok) {
      showResultDialog('选择失败', data.error || '选择文件失败');
      return;
    }
    if (!data.filePath) return; // 用户取消
    $('set-recipient-file').value = data.filePath;
  } catch (e) {
    showResultDialog('选择失败', '选择文件失败: ' + e.message);
  }
}

// ====== 测试连接 / 发送测试邮件 ======

/** 从设置表单收集当前配置（用于测试，不保存到文件） */
function collectSettingsForTest() {
  var cfg = {
    smtp_server: $('set-smtp-server').value.trim(),
    smtp_port: parseInt($('set-smtp-port').value, 10),
    username: $('set-username').value.trim(),
    password: $('set-password').value.trim(),
    use_ssl: $('set-use-ssl').checked,
  };
  // 密码是占位符或留空时，若已有保存密码则使用真实密码
  if (cfg.password === '******' || !cfg.password) {
    cfg._useRealPassword = true;
  }
  return cfg;
}

/** 恢复按钮状态（带超时保护），结果用弹出层展示 */
function withTimeout(btn, label, fn) {
  btn.disabled = true;
  btn.textContent = label + '中...';
  var restored = false;
  function restore(text, type) {
    if (restored) return;
    restored = true;
    btn.disabled = false;
    btn.textContent = label;
    var title = (type === 'success') ? (label + '成功') : (label + '失败');
    showResultDialog(title, text);
  }
  // 超时保护（15秒）
  var timer = setTimeout(function() {
    restore('请求超时', 'error');
  }, 15000);
  fn().then(function(result) {
    clearTimeout(timer);
    restore(result.text, result.type);
  }).catch(function(e) {
    clearTimeout(timer);
    restore('失败: ' + e.message, 'error');
  });
}

async function testConnection() {
  var cfg = collectSettingsForTest();
  if (!cfg.smtp_server || !cfg.smtp_port || !cfg.username) {
    showResultDialog('提示', '请先填写 SMTP 服务器、端口和发件邮箱');
    return;
  }
  var btn = $('test-conn-btn');
  withTimeout(btn, '测试连接', async function() {
    var resp = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    var data = await resp.json();
    if (data.ok) {
      return { text: '连接成功', type: 'success' };
    } else {
      return { text: '失败: ' + (data.error || '未知错误'), type: 'error' };
    }
  });
}

async function testSendMail() {
  var cfg = collectSettingsForTest();
  if (!cfg.smtp_server || !cfg.smtp_port || !cfg.username) {
    showResultDialog('提示', '请先填写 SMTP 服务器、端口和发件邮箱');
    return;
  }
  var btn = $('test-mail-btn');
  withTimeout(btn, '发送测试邮件', async function() {
    var resp = await fetch('/api/test-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    var data = await resp.json();
    if (data.ok) {
      return { text: '已发送到 ' + cfg.username, type: 'success' };
    } else {
      return { text: '失败: ' + (data.error || '未知错误'), type: 'error' };
    }
  });
}

// ====== 关闭服务 ======
var _shutdownSent = false;  // 防止重复发送

async function shutdownServer() {
  var confirmed = await showConfirm('关闭服务',
    '关闭后将无法继续发送邮件，需要用时再重新打开程序即可。\n确定要关闭吗？',
    '确认关闭');
  if (!confirmed) return;

  doShutdown();
}

/// 执行关闭服务：显示提示、发请求、倒计时关标签页
async function doShutdown() {
  if (_shutdownSent) return;
  _shutdownSent = true;

  closeSettings();

  // 先显示关闭提示
  $('shutdown-overlay').style.display = 'flex';

  // 禁用页面所有交互
  document.body.style.pointerEvents = 'none';

  // 发送关闭请求
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch (e) {
    // 服务器已关闭，fetch 会失败，这是正常的
  }

  // 3 秒倒计时后关闭浏览器标签页
  var countdown = 3;
  var countdownEl = $('shutdown-countdown');
  var timer = setInterval(function() {
    countdown--;
    if (countdown > 0) {
      countdownEl.textContent = countdown + ' 秒后自动关闭页面...';
    } else {
      clearInterval(timer);
      window.close();
    }
  }, 1000);
}

// 关闭/刷新浏览器标签页时触发延迟关闭
// 刷新场景：3秒内新页面加载会调 /api/cancel-shutdown 取消
// 关闭场景：无新页面取消，3秒后服务自动退出
window.addEventListener('beforeunload', function(e) {
  if (!_shutdownSent) {
    _shutdownSent = true;
    // 用 Beacon 发送延迟关闭请求，不阻塞页面关闭
    navigator.sendBeacon('/api/before-close');
  }
});
