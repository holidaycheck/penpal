"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var id = 0;
/**
 * @return {number} A unique ID (not universally unique)
 */

var _default = function _default() {
  return ++id;
};

exports.default = _default;
module.exports = exports.default;