/**
 * modules/event-bus.js -- 前端轻量事件发布/订阅中心 (EventBus)
 * 用于解耦收件人、筛选、预览、列表及附件等 UI 模块之间的直接网状调用
 */

const AppEventBus = {
  _listeners: {},

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  on: function(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
  },

  /**
   * 取消订阅
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off: function(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(function(cb) {
      return cb !== callback;
    });
  },

  /**
   * 发布事件并通知所有订阅者
   * @param {string} event - 事件名称
   * @param {*} [data] - 附加参数
   */
  emit: function(event, data) {
    var list = this._listeners[event];
    if (list && list.length) {
      list.slice().forEach(function(cb) {
        try {
          cb(data);
        } catch (e) {
          console.error('[EventBus] 订阅执行异常 (' + event + '):', e);
        }
      });
    }
  }
};

window.AppEventBus = AppEventBus;
