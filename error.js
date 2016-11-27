//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

function XError(name, message, context) {
    this.name = name;
    this.message = message;
    this.context = context;
}

XError.prototype = Object.create(Error.prototype);
XError.prototype.name = "XError";
XError.prototype.message = "";
XError.prototype.constructor = XError;

module.exports = {
    XError,
}