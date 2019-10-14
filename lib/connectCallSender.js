"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _constants = require("./constants");

var _errorCodes = require("./errorCodes");

var _generateId = _interopRequireDefault(require("./generateId"));

var _errorSerialization = require("./errorSerialization");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Augments an object with methods that match those defined by the remote. When these methods are
 * called, a "call" message will be sent to the remote, the remote's corresponding method will be
 * executed, and the method's return value will be returned via a message.
 * @param {Object} callSender Sender object that should be augmented with methods.
 * @param {Object} info Information about the local and remote windows.
 * @param {Array} methodNames Names of methods available to be called on the remote.
 * @param {Promise} destructionPromise A promise resolved when destroy() is called on the penpal
 * connection.
 * @returns {Object} The call sender object with methods that may be called.
 */
var _default = function _default(callSender, info, methodNames, destroyConnection, log) {
  var localName = info.localName,
      local = info.local,
      remote = info.remote,
      originForSending = info.originForSending,
      originForReceiving = info.originForReceiving;
  var destroyed = false;
  log("".concat(localName, ": Connecting call sender"));

  var createMethodProxy = function createMethodProxy(methodName) {
    return function () {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      log("".concat(localName, ": Sending ").concat(methodName, "() call")); // This handles the case where the iframe has been removed from the DOM
      // (and therefore its window closed), the consumer has not yet
      // called destroy(), and the user calls a method exposed by
      // the remote. We detect the iframe has been removed and force
      // a destroy() immediately so that the consumer sees the error saying
      // the connection has been destroyed. We wrap this check in a try catch
      // because Edge throws an "Object expected" error when accessing
      // contentWindow.closed on a contentWindow from an iframe that's been
      // removed from the DOM.

      var iframeRemoved;

      try {
        if (remote.closed) {
          iframeRemoved = true;
        }
      } catch (e) {
        iframeRemoved = true;
      }

      if (iframeRemoved) {
        destroyConnection();
      }

      if (destroyed) {
        var error = new Error("Unable to send ".concat(methodName, "() call due ") + "to destroyed connection");
        error.code = _errorCodes.ERR_CONNECTION_DESTROYED;
        throw error;
      }

      return new Promise(function (resolve, reject) {
        var id = (0, _generateId.default)();

        var handleMessageEvent = function handleMessageEvent(event) {
          if (event.source !== remote || event.data.penpal !== _constants.REPLY || event.data.id !== id) {
            return;
          }

          if (event.origin !== originForReceiving) {
            log("".concat(localName, " received message from origin ").concat(event.origin, " which did not match expected origin ").concat(originForReceiving));
            return;
          }

          log("".concat(localName, ": Received ").concat(methodName, "() reply"));
          local.removeEventListener(_constants.MESSAGE, handleMessageEvent);
          var returnValue = event.data.returnValue;

          if (event.data.returnValueIsError) {
            returnValue = (0, _errorSerialization.deserializeError)(returnValue);
          }

          (event.data.resolution === _constants.FULFILLED ? resolve : reject)(returnValue);
        };

        local.addEventListener(_constants.MESSAGE, handleMessageEvent);
        remote.postMessage({
          penpal: _constants.CALL,
          id: id,
          methodName: methodName,
          args: args
        }, originForSending);
      });
    };
  };

  methodNames.reduce(function (api, methodName) {
    api[methodName] = createMethodProxy(methodName);
    return api;
  }, callSender);
  return function () {
    destroyed = true;
  };
};

exports.default = _default;
module.exports = exports.default;