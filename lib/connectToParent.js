"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _constants = require("./constants");

var _errorCodes = require("./errorCodes");

var _createDestructor2 = _interopRequireDefault(require("./createDestructor"));

var _connectCallReceiver = _interopRequireDefault(require("./connectCallReceiver"));

var _connectCallSender = _interopRequireDefault(require("./connectCallSender"));

var _createLogger = _interopRequireDefault(require("./createLogger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * @typedef {Object} Parent
 * @property {Promise} promise A promise which will be resolved once a connection has
 * been established.
 * @property {Function} destroy A method that, when called, will disconnect any
 * messaging channels. You may call this even before a connection has been established.
 */

/**
 * Attempts to establish communication with the parent window.
 * @param {Object} options
 * @param {string} [options.parentOrigin=*] Valid parent origin used to restrict communication.
 * @param {Object} [options.methods={}] Methods that may be called by the parent window.
 * @param {Number} [options.timeout] The amount of time, in milliseconds, Penpal should wait
 * for the parent to respond before rejecting the connection promise.
 * @return {Parent}
 */
var _default = function _default() {
  var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
      _ref$parentOrigin = _ref.parentOrigin,
      parentOrigin = _ref$parentOrigin === void 0 ? '*' : _ref$parentOrigin,
      _ref$methods = _ref.methods,
      methods = _ref$methods === void 0 ? {} : _ref$methods,
      timeout = _ref.timeout,
      debug = _ref.debug;

  var log = (0, _createLogger.default)(debug);

  if (window === window.top) {
    var error = new Error('connectToParent() must be called within an iframe');
    error.code = _errorCodes.ERR_NOT_IN_IFRAME;
    throw error;
  }

  var _createDestructor = (0, _createDestructor2.default)(),
      destroy = _createDestructor.destroy,
      onDestroy = _createDestructor.onDestroy;

  var child = window;
  var parent = child.parent;
  var promise = new Promise(function (resolveConnectionPromise, reject) {
    var connectionTimeoutId;

    if (timeout !== undefined) {
      connectionTimeoutId = setTimeout(function () {
        var error = new Error("Connection to parent timed out after ".concat(timeout, "ms"));
        error.code = _errorCodes.ERR_CONNECTION_TIMEOUT;
        reject(error);
        destroy();
      }, timeout);
    }

    var handleMessageEvent = function handleMessageEvent(event) {
      // Under niche scenarios, we get into this function after
      // the iframe has been removed from the DOM. In Edge, this
      // results in "Object expected" errors being thrown when we
      // try to access properties on window (global properties).
      // For this reason, we try to access a global up front (clearTimeout)
      // and if it fails we can assume the iframe has been removed
      // and we ignore the message event.
      try {
        clearTimeout('');
      } catch (e) {
        return;
      }

      if (event.source !== parent || event.data.penpal !== _constants.HANDSHAKE_REPLY) {
        return;
      }

      if (parentOrigin !== '*' && parentOrigin !== event.origin) {
        log("Child received handshake reply from origin ".concat(event.origin, " which did not match expected origin ").concat(parentOrigin));
        return;
      }

      log('Child: Received handshake reply');
      child.removeEventListener(_constants.MESSAGE, handleMessageEvent);
      var info = {
        localName: 'Child',
        local: child,
        remote: parent,
        originForSending: event.origin === 'null' ? '*' : event.origin,
        originForReceiving: event.origin
      };
      var callSender = {};
      var destroyCallReceiver = (0, _connectCallReceiver.default)(info, methods, log);
      onDestroy(destroyCallReceiver);
      var destroyCallSender = (0, _connectCallSender.default)(callSender, info, event.data.methodNames, destroy, log);
      onDestroy(destroyCallSender);
      clearTimeout(connectionTimeoutId);
      resolveConnectionPromise(callSender);
    };

    child.addEventListener(_constants.MESSAGE, handleMessageEvent);
    onDestroy(function () {
      child.removeEventListener(_constants.MESSAGE, handleMessageEvent);
      var error = new Error('Connection destroyed');
      error.code = _errorCodes.ERR_CONNECTION_DESTROYED;
      reject(error);
    });
    log('Child: Sending handshake');
    parent.postMessage({
      penpal: _constants.HANDSHAKE,
      methodNames: Object.keys(methods)
    }, parentOrigin);
  });
  return {
    promise: promise,
    destroy: destroy
  };
};

exports.default = _default;
module.exports = exports.default;