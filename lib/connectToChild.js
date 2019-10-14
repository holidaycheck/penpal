"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _constants = require("./constants");

var _errorCodes = require("./errorCodes");

var _createDestructor2 = _interopRequireDefault(require("./createDestructor"));

var _getOriginFromSrc = _interopRequireDefault(require("./getOriginFromSrc"));

var _createLogger = _interopRequireDefault(require("./createLogger"));

var _connectCallReceiver = _interopRequireDefault(require("./connectCallReceiver"));

var _connectCallSender = _interopRequireDefault(require("./connectCallSender"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var CHECK_IFRAME_IN_DOC_INTERVAL = 60000;
/**
 * @typedef {Object} Child
 * @property {Promise} promise A promise which will be resolved once a connection has
 * been established.
 * @property {Function} destroy A method that, when called, will disconnect any
 * messaging channels. You may call this even before a connection has been established.
 */

/**
 * Creates an iframe, loads a webpage into the URL, and attempts to establish communication with
 * the iframe.
 * @param {Object} options
 * @param {HTMLIframeElement} options.iframe The iframe to connect to.
 * @param {Object} [options.methods={}] Methods that may be called by the iframe.
 * @param {String} [options.childOrigin] The child origin to use to secure communication. If
 * not provided, the child origin will be derived from the iframe's src or srcdoc value.
 * @param {Number} [options.timeout] The amount of time, in milliseconds, Penpal should wait
 * for the child to respond before rejecting the connection promise.
 * @return {Child}
 */

var _default = function _default(_ref) {
  var iframe = _ref.iframe,
      _ref$methods = _ref.methods,
      methods = _ref$methods === void 0 ? {} : _ref$methods,
      childOrigin = _ref.childOrigin,
      timeout = _ref.timeout,
      debug = _ref.debug;
  var log = (0, _createLogger.default)(debug);
  var parent = window;

  var _createDestructor = (0, _createDestructor2.default)(),
      destroy = _createDestructor.destroy,
      onDestroy = _createDestructor.onDestroy;

  if (!childOrigin) {
    if (!iframe.src && !iframe.srcdoc) {
      var error = new Error('Iframe must have src or srcdoc property defined.');
      error.code = _errorCodes.ERR_NO_IFRAME_SRC;
      throw error;
    }

    childOrigin = (0, _getOriginFromSrc.default)(iframe.src);
  } // If event.origin is "null", the remote protocol is
  // file:, data:, and we must post messages with "*" as targetOrigin
  // when sending and allow
  // [1] https://developer.mozilla.org/fr/docs/Web/API/Window/postMessage#Utiliser_window.postMessage_dans_les_extensions


  var originForSending = childOrigin === 'null' ? '*' : childOrigin;
  var promise = new Promise(function (resolveConnectionPromise, reject) {
    var connectionTimeoutId;

    if (timeout !== undefined) {
      connectionTimeoutId = setTimeout(function () {
        var error = new Error("Connection to child timed out after ".concat(timeout, "ms"));
        error.code = _errorCodes.ERR_CONNECTION_TIMEOUT;
        reject(error);
        destroy();
      }, timeout);
    } // We resolve the promise with the call sender. If the child reconnects (for example, after
    // refreshing or navigating to another page that uses Penpal, we'll update the call sender
    // with methods that match the latest provided by the child.


    var callSender = {};
    var receiverMethodNames;
    var destroyCallReceiver;

    var handleMessage = function handleMessage(event) {
      var child = iframe.contentWindow;

      if (event.source !== child || event.data.penpal !== _constants.HANDSHAKE) {
        return;
      }

      if (event.origin !== childOrigin) {
        log("Parent received handshake from origin ".concat(event.origin, " which did not match expected origin ").concat(childOrigin));
        return;
      }

      log('Parent: Received handshake, sending reply');
      event.source.postMessage({
        penpal: _constants.HANDSHAKE_REPLY,
        methodNames: Object.keys(methods)
      }, originForSending);
      var info = {
        localName: 'Parent',
        local: parent,
        remote: child,
        originForSending: originForSending,
        originForReceiving: childOrigin
      }; // If the child reconnected, we need to destroy the previous call receiver before setting
      // up a new one.

      if (destroyCallReceiver) {
        destroyCallReceiver();
      }

      destroyCallReceiver = (0, _connectCallReceiver.default)(info, methods, log);
      onDestroy(destroyCallReceiver); // If the child reconnected, we need to remove the methods from the previous call receiver
      // off the sender.

      if (receiverMethodNames) {
        receiverMethodNames.forEach(function (receiverMethodName) {
          delete callSender[receiverMethodName];
        });
      }

      receiverMethodNames = event.data.methodNames;
      var destroyCallSender = (0, _connectCallSender.default)(callSender, info, receiverMethodNames, destroy, log);
      onDestroy(destroyCallSender);
      clearTimeout(connectionTimeoutId);
      resolveConnectionPromise(callSender);
    };

    parent.addEventListener(_constants.MESSAGE, handleMessage);
    log('Parent: Awaiting handshake'); // This is to prevent memory leaks when the iframe is removed
    // from the document and the consumer hasn't called destroy().
    // Without this, event listeners attached to the window would
    // stick around and since the event handlers have a reference
    // to the iframe in their closures, the iframe would stick around
    // too.

    var checkIframeInDocIntervalId = setInterval(function () {
      if (!document.body.contains(iframe)) {
        clearInterval(checkIframeInDocIntervalId);
        destroy();
      }
    }, CHECK_IFRAME_IN_DOC_INTERVAL);
    onDestroy(function () {
      parent.removeEventListener(_constants.MESSAGE, handleMessage);
      clearInterval(checkIframeInDocIntervalId);
      var error = new Error('Connection destroyed');
      error.code = _errorCodes.ERR_CONNECTION_DESTROYED;
      reject(error);
    });
  });
  return {
    promise: promise,
    destroy: destroy
  };
};

exports.default = _default;
module.exports = exports.default;