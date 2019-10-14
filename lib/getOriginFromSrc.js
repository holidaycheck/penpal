"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
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

var _default = function _default(src) {
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
};

exports.default = _default;
module.exports = exports.default;