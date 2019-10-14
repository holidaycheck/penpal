"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _default = function _default() {
  var callbacks = [];
  var destroyed = false;
  return {
    destroy: function destroy() {
      destroyed = true;
      callbacks.forEach(function (callback) {
        callback();
      });
    },
    onDestroy: function onDestroy(callback) {
      destroyed ? callback() : callbacks.push(callback);
    }
  };
};

exports.default = _default;
module.exports = exports.default;