"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deserializeError = exports.serializeError = void 0;

/**
 * Converts an error object into a plain object.
 * @param {Error} Error object.
 * @returns {Object}
 */
var serializeError = function serializeError(_ref) {
  var name = _ref.name,
      message = _ref.message,
      stack = _ref.stack;
  return {
    name: name,
    message: message,
    stack: stack
  };
};
/**
 * Converts a plain object into an error object.
 * @param {Object} Object with error properties.
 * @returns {Error}
 */


exports.serializeError = serializeError;

var deserializeError = function deserializeError(obj) {
  var deserializedError = new Error();
  Object.keys(obj).forEach(function (key) {
    return deserializedError[key] = obj[key];
  });
  return deserializedError;
};

exports.deserializeError = deserializeError;