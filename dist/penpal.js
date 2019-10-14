var Penpal = (function () {
  'use strict';

  var HANDSHAKE = 'handshake';
  var HANDSHAKE_REPLY = 'handshake-reply';
  var CALL = 'call';
  var REPLY = 'reply';
  var FULFILLED = 'fulfilled';
  var REJECTED = 'rejected';
  var MESSAGE = 'message';
  var DATA_CLONE_ERROR = 'DataCloneError';

  var ERR_CONNECTION_DESTROYED = 'ConnectionDestroyed';
  var ERR_CONNECTION_TIMEOUT = 'ConnectionTimeout';
  var ERR_NOT_IN_IFRAME = 'NotInIframe';
  var ERR_NO_IFRAME_SRC = 'NoIframeSrc';

  var createDestructor = (function () {
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
  });

  var DEFAULT_PORTS = {
    'http:': '80',
    'https:': '443'
  };
  var URL_REGEX = /^(https?:)?\/\/([^/:]+)?(:(\d+))?/;
  var opaqueOriginSchemes = ['file:', 'data:'];
  /**
   * Converts a src value into an origin.
   * @param {string} src
   * @return {string} The URL's origin
   */

  var getOriginFromSrc = (function (src) {
    if (src && opaqueOriginSchemes.find(function (scheme) {
      return src.startsWith(scheme);
    })) {
      // The origin of the child document is an opaque origin and its
      // serialization is "null"
      // https://html.spec.whatwg.org/multipage/origin.html#origin
      return 'null';
    } // Note that if src is undefined, then srcdoc is being used instead of src
    // and we can follow this same logic below to get the origin of the parent,
    // which is the origin that we will need to use.


    var location = document.location;
    var regexResult = URL_REGEX.exec(src);
    var protocol;
    var hostname;
    var port;

    if (regexResult) {
      // It's an absolute URL. Use the parsed info.
      // regexResult[1] will be undefined if the URL starts with //
      protocol = regexResult[1] ? regexResult[1] : location.protocol;
      hostname = regexResult[2];
      port = regexResult[4];
    } else {
      // It's a relative path. Use the current location's info.
      protocol = location.protocol;
      hostname = location.hostname;
      port = location.port;
    } // If the port is the default for the protocol, we don't want to add it to the origin string
    // or it won't match the message's event.origin.


    var portSuffix = port && port !== DEFAULT_PORTS[protocol] ? ":".concat(port) : '';
    return "".concat(protocol, "//").concat(hostname).concat(portSuffix);
  });

  var createLogger = (function (debug) {
    return function () {
      if (debug) {
        var _console;

        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        (_console = console).log.apply(_console, ['[Penpal]'].concat(args)); // eslint-disable-line no-console

      }
    };
  });

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

  var deserializeError = function deserializeError(obj) {
    var deserializedError = new Error();
    Object.keys(obj).forEach(function (key) {
      return deserializedError[key] = obj[key];
    });
    return deserializedError;
  };

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

  var connectCallReceiver = (function (info, methods, log) {
    var localName = info.localName,
        local = info.local,
        remote = info.remote,
        originForSending = info.originForSending,
        originForReceiving = info.originForReceiving;
    var destroyed = false;
    log("".concat(localName, ": Connecting call receiver"));

    var handleMessageEvent = function handleMessageEvent(event) {
      if (event.source !== remote || event.data.penpal !== CALL) {
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
            penpal: REPLY,
            id: id,
            resolution: resolution,
            returnValue: returnValue
          };

          if (resolution === REJECTED && returnValue instanceof Error) {
            message.returnValue = serializeError(returnValue);
            message.returnValueIsError = true;
          }

          try {
            remote.postMessage(message, originForSending);
          } catch (err) {
            // If a consumer attempts to send an object that's not cloneable (e.g., window),
            // we want to ensure the receiver's promise gets rejected.
            if (err.name === DATA_CLONE_ERROR) {
              remote.postMessage({
                penpal: REPLY,
                id: id,
                resolution: REJECTED,
                returnValue: serializeError(err),
                returnValueIsError: true
              }, originForSending);
            }

            throw err;
          }
        };
      };

      new Promise(function (resolve) {
        return resolve(methods[methodName].apply(methods, args));
      }).then(createPromiseHandler(FULFILLED), createPromiseHandler(REJECTED));
    };

    local.addEventListener(MESSAGE, handleMessageEvent);
    return function () {
      destroyed = true;
      local.removeEventListener(MESSAGE, handleMessageEvent);
    };
  });

  var id = 0;
  /**
   * @return {number} A unique ID (not universally unique)
   */

  var generateId = (function () {
    return ++id;
  });

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

  var connectCallSender = (function (callSender, info, methodNames, destroyConnection, log) {
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
          error.code = ERR_CONNECTION_DESTROYED;
          throw error;
        }

        return new Promise(function (resolve, reject) {
          var id = generateId();

          var handleMessageEvent = function handleMessageEvent(event) {
            if (event.source !== remote || event.data.penpal !== REPLY || event.data.id !== id) {
              return;
            }

            if (event.origin !== originForReceiving) {
              log("".concat(localName, " received message from origin ").concat(event.origin, " which did not match expected origin ").concat(originForReceiving));
              return;
            }

            log("".concat(localName, ": Received ").concat(methodName, "() reply"));
            local.removeEventListener(MESSAGE, handleMessageEvent);
            var returnValue = event.data.returnValue;

            if (event.data.returnValueIsError) {
              returnValue = deserializeError(returnValue);
            }

            (event.data.resolution === FULFILLED ? resolve : reject)(returnValue);
          };

          local.addEventListener(MESSAGE, handleMessageEvent);
          remote.postMessage({
            penpal: CALL,
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
  });

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

  var connectToChild = (function (_ref) {
    var iframe = _ref.iframe,
        _ref$methods = _ref.methods,
        methods = _ref$methods === void 0 ? {} : _ref$methods,
        childOrigin = _ref.childOrigin,
        timeout = _ref.timeout,
        debug = _ref.debug;
    var log = createLogger(debug);
    var parent = window;

    var _createDestructor = createDestructor(),
        destroy = _createDestructor.destroy,
        onDestroy = _createDestructor.onDestroy;

    if (!childOrigin) {
      if (!iframe.src && !iframe.srcdoc) {
        var error = new Error('Iframe must have src or srcdoc property defined.');
        error.code = ERR_NO_IFRAME_SRC;
        throw error;
      }

      childOrigin = getOriginFromSrc(iframe.src);
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
          error.code = ERR_CONNECTION_TIMEOUT;
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

        if (event.source !== child || event.data.penpal !== HANDSHAKE) {
          return;
        }

        if (event.origin !== childOrigin) {
          log("Parent received handshake from origin ".concat(event.origin, " which did not match expected origin ").concat(childOrigin));
          return;
        }

        log('Parent: Received handshake, sending reply');
        event.source.postMessage({
          penpal: HANDSHAKE_REPLY,
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

        destroyCallReceiver = connectCallReceiver(info, methods, log);
        onDestroy(destroyCallReceiver); // If the child reconnected, we need to remove the methods from the previous call receiver
        // off the sender.

        if (receiverMethodNames) {
          receiverMethodNames.forEach(function (receiverMethodName) {
            delete callSender[receiverMethodName];
          });
        }

        receiverMethodNames = event.data.methodNames;
        var destroyCallSender = connectCallSender(callSender, info, receiverMethodNames, destroy, log);
        onDestroy(destroyCallSender);
        clearTimeout(connectionTimeoutId);
        resolveConnectionPromise(callSender);
      };

      parent.addEventListener(MESSAGE, handleMessage);
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
        parent.removeEventListener(MESSAGE, handleMessage);
        clearInterval(checkIframeInDocIntervalId);
        var error = new Error('Connection destroyed');
        error.code = ERR_CONNECTION_DESTROYED;
        reject(error);
      });
    });
    return {
      promise: promise,
      destroy: destroy
    };
  });

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

  var connectToParent = (function () {
    var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        _ref$parentOrigin = _ref.parentOrigin,
        parentOrigin = _ref$parentOrigin === void 0 ? '*' : _ref$parentOrigin,
        _ref$methods = _ref.methods,
        methods = _ref$methods === void 0 ? {} : _ref$methods,
        timeout = _ref.timeout,
        debug = _ref.debug;

    var log = createLogger(debug);

    if (window === window.top) {
      var error = new Error('connectToParent() must be called within an iframe');
      error.code = ERR_NOT_IN_IFRAME;
      throw error;
    }

    var _createDestructor = createDestructor(),
        destroy = _createDestructor.destroy,
        onDestroy = _createDestructor.onDestroy;

    var child = window;
    var parent = child.parent;
    var promise = new Promise(function (resolveConnectionPromise, reject) {
      var connectionTimeoutId;

      if (timeout !== undefined) {
        connectionTimeoutId = setTimeout(function () {
          var error = new Error("Connection to parent timed out after ".concat(timeout, "ms"));
          error.code = ERR_CONNECTION_TIMEOUT;
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

        if (event.source !== parent || event.data.penpal !== HANDSHAKE_REPLY) {
          return;
        }

        if (parentOrigin !== '*' && parentOrigin !== event.origin) {
          log("Child received handshake reply from origin ".concat(event.origin, " which did not match expected origin ").concat(parentOrigin));
          return;
        }

        log('Child: Received handshake reply');
        child.removeEventListener(MESSAGE, handleMessageEvent);
        var info = {
          localName: 'Child',
          local: child,
          remote: parent,
          originForSending: event.origin === 'null' ? '*' : event.origin,
          originForReceiving: event.origin
        };
        var callSender = {};
        var destroyCallReceiver = connectCallReceiver(info, methods, log);
        onDestroy(destroyCallReceiver);
        var destroyCallSender = connectCallSender(callSender, info, event.data.methodNames, destroy, log);
        onDestroy(destroyCallSender);
        clearTimeout(connectionTimeoutId);
        resolveConnectionPromise(callSender);
      };

      child.addEventListener(MESSAGE, handleMessageEvent);
      onDestroy(function () {
        child.removeEventListener(MESSAGE, handleMessageEvent);
        var error = new Error('Connection destroyed');
        error.code = ERR_CONNECTION_DESTROYED;
        reject(error);
      });
      log('Child: Sending handshake');
      parent.postMessage({
        penpal: HANDSHAKE,
        methodNames: Object.keys(methods)
      }, parentOrigin);
    });
    return {
      promise: promise,
      destroy: destroy
    };
  });

  var index = {
    ERR_CONNECTION_DESTROYED: ERR_CONNECTION_DESTROYED,
    ERR_CONNECTION_TIMEOUT: ERR_CONNECTION_TIMEOUT,
    ERR_NOT_IN_IFRAME: ERR_NOT_IN_IFRAME,
    ERR_NO_IFRAME_SRC: ERR_NO_IFRAME_SRC,
    connectToChild: connectToChild,
    connectToParent: connectToParent
  };

  return index;

}());
