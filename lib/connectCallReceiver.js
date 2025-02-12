"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _constants = require("./constants");

var _errorSerialization = require("./errorSerialization");

/**
 * Listens for "call" messages coming from the remote, executes the corresponding method, and
 * responds with the return value.
 * @param {Object} info Information about the local and remote windows.
 * @param {Object} methods The keys are the names of the methods that can be called by the remote
 * while the values are the method functions.
 * @param {Promise} destructionPromise A promise resolved when destroy() is called on the penpal
 * connection.
 * @returns {Function} A function that may be called to disconnect the receiver.
 */
var _default = function _default(info, methods, log) {
  var localName = info.localName,
      local = info.local,
      remote = info.remote,
      originForSending = info.originForSending,
      originForReceiving = info.originForReceiving;
  var destroyed = false;
  log("".concat(localName, ": Connecting call receiver"));

  var handleMessageEvent = function handleMessageEvent(event) {
    if (event.source !== remote || event.data.penpal !== _constants.CALL) {
      return;
    }

    if (event.origin !== originForReceiving) {
      log("".concat(localName, " received message from origin ").concat(event.origin, " which did not match expected origin ").concat(originForReceiving));
      return;
    }

    var _event$data = event.data,
        methodName = _event$data.methodName,
        args = _event$data.args,
        id = _event$data.id;
    log("".concat(localName, ": Received ").concat(methodName, "() call"));

    var createPromiseHandler = function createPromiseHandler(resolution) {
      return function (returnValue) {
        log("".concat(localName, ": Sending ").concat(methodName, "() reply"));

        if (destroyed) {
          // It's possible to throw an error here, but it would need to be thrown asynchronously
          // and would only be catchable using window.onerror. This is because the consumer
          // is merely returning a value from their method and not calling any function
          // that they could wrap in a try-catch. Even if the consumer were to catch the error,
          // the value of doing so is questionable. Instead, we'll just log a message.
          log("".concat(localName, ": Unable to send ").concat(methodName, "() reply due to destroyed connection"));
          return;
        }

        var message = {
          penpal: _constants.REPLY,
          id: id,
          resolution: resolution,
          returnValue: returnValue
        };

        if (resolution === _constants.REJECTED && returnValue instanceof Error) {
          message.returnValue = (0, _errorSerialization.serializeError)(returnValue);
          message.returnValueIsError = true;
        }

        try {
          remote.postMessage(message, originForSending);
        } catch (err) {
          // If a consumer attempts to send an object that's not cloneable (e.g., window),
          // we want to ensure the receiver's promise gets rejected.
          if (err.name === _constants.DATA_CLONE_ERROR) {
            remote.postMessage({
              penpal: _constants.REPLY,
              id: id,
              resolution: _constants.REJECTED,
              returnValue: (0, _errorSerialization.serializeError)(err),
              returnValueIsError: true
            }, originForSending);
          }

          throw err;
        }
      };
    };

    new Promise(function (resolve) {
      return resolve(methods[methodName].apply(methods, args));
    }).then(createPromiseHandler(_constants.FULFILLED), createPromiseHandler(_constants.REJECTED));
  };

  local.addEventListener(_constants.MESSAGE, handleMessageEvent);
  return function () {
    destroyed = true;
    local.removeEventListener(_constants.MESSAGE, handleMessageEvent);
  };
};

exports.default = _default;
module.exports = exports.default;