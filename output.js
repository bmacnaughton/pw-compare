//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

const fs = require('fs');
const util = require('util');
const chalk = require('chalk');

//
// Object to standardize output formatting based on what's being output.
//
function Output(options) {
    this.options = options || {};
    this.fd = null;
    this.nc = options.noconsole;
    if (options.logFile) {
        this.fd = fs.createWriteStream(options.logFile);
        this.fd.on('error', err => {throw "error on console logging: " + err});
        this.fd.on('drain', this.handleBacklog.bind(this));
        this.fd.on('finish', stream => this.fd = null);
        this.fd.on('close', stream => this.fd = null);
    }
    this.logicalClose = false;
    this.backlog = [];
    this.backlogHighWater = 0;
}

Output.prototype.writeLog = function(text) {
    this.backlog.push(text);
    if(this.backlog.length > this.backlogHighWater) {
        this.backlogHighWater = this.backlog.length;
    }
    this.handleBacklog();
}

Output.prototype.handleBacklog = function() {
    while (this.backlog.length) {
        let text = this.backlog.shift();
        if (!this.fd.write(text + '\n')) {
            this.backlog.unshift(text);
            //this.fd.once('drain', handleBacklog);
            return;
        }
    }
    if (this.logicalClose) {
        this.fd.end();
    }
}

Output.prototype.close = function() {
    if (this.backlog.length) {
        this.logicalClose = true;
    } else {
        this.fd.end();
    }
}

Output.prototype.putHeader = function(text) {
    if (!this.nc) {
        console.log(chalk.bgBlack.bold(text));
    }
    if (this.fd) {
        this.writeLog(text);
    }
}

Output.prototype.putSection = function(text, color) {
    if (!color) {
        color = 'reset';
    }
    if (!Array.isArray(text)) {
        text = [text];
    }
    let spacing = '    %s';
    text = util.format(...text);
    if (!this.nc) {
        console.log(spacing, chalk[color].bold(text));
    }
    if (this.fd) {
        this.writeLog(util.format(spacing, text));
    }
}

Output.prototype.putSectionItem = function(text, color) {
    if (!color) {
        color = 'reset';
    }
    if (!Array.isArray(text)) {
        text = [text];
    }
    let spacing = '        %s';
    text = util.format(...text);
    if (!this.nc) {
        console.log(spacing, chalk[color](text));
    }
    if (this.fd) {
        this.writeLog(util.format(spacing, text));
    }
}

Output.prototype.putSectionItemText = function(text, color) {
    if (!color) {
        color = 'reset';
    }
    if (!Array.isArray(text)) {
        text = [text];
    }
    let spacing = '            %s';
    text = util.format(...text);
    if (!this.nc) {
        console.log(spacing, chalk[color](text));
    }
    if (this.fd) {
        this.writeLog(util.format(spacing, text));
    }
}

Output.prototype.putSectionItemObject = function(property, object) {
    let text = util.inspect(object, {depth: null}).replace(/\n/g, '\n            ');
    let spacing = '            %s: %s';
    if (!this.nc) {
        console.log(spacing, property, text);
    }
    if (this.fd) {
        this.writeLog(util.format(spacing, property, text));
    }
}

module.exports = Output;
