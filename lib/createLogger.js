"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _default = function _default(debug) {
  return function () {
    if (debug) {
      var _console;

      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      (_console = console).log.apply(_console, ['[Penpal]'].concat(args)); // eslint-disable-line no-console

    }
  };
};

exports.default = _default;
module.exports = exports.default;