//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

const util = require('util');
const fs = require('fs');

const Promise = require('bluebird');

const PWDB = require('../pwdb');
const Output = require('../output');

const u = require('./utility');
let {generateSets, intersection, difference, union, bucketize, JSONtoObject, getDifferences} = u;



// logical process for Comparison usage
// compare modules - if field definitions are added or changed they will be flagged.
// compare templates - if templates are add or changed they will be flagged.
// compare pages - same hierarchy and templates? same field values?
//


//
// Comparison constructor
//
function Comparison(sdb, tdb, options) {

    // utility function to define getters and setters so old-style accesses keep working.
    let defProp = name => {
        /// get the destination indicator (s, t) for (source, target)
        let dest = name[0];
        // lowercase the letter following the destination indicator
        let newname = name[1].toLowerCase() + name.slice(2);
        Object.defineProperty(this, name, {
            get: () => this[dest][newname],
            set: value => this[dest][newname] = value
        });
    };

    this.s = {};
    this.t = {};
    this.options = options || {};
    this.exceptionsFile = options.exceptionsFile || './exceptions';
    this.consoleFile = options.consoleFile;

    // why all the property getters/setters? to make sure no stragglers break while
    // migrating to the this.s, this.t organization. the old declarations are commented
    // out before the new declarations and property definitions.

    this.s.db = sdb;
    this.t.db = tdb;
    defProp('sdb');
    defProp('tdb');

    this.s.tables = null;
    this.t.tables = null;
    defProp('sTables');
    defProp('tTables');

    // field records
    this.s.fields = null;
    this.t.fields = null;
    defProp('sFields');
    defProp('tFields');
    // field records indexed by field ID
    this.s.fieldsIDs = null;
    this.t.fieldsIDs = null;
    defProp('sFieldsIDs');
    defProp('tFieldsIDs');
    // field records indexed by field name
    this.s.fieldsNames = null;
    this.t.fieldsNames = null;

    this.s.modules = null;
    this.t.modules = null;
    defProp('sModules');
    defProp('tModules');
    this.s.modulesIDs = {};
    this.t.modulesIDs = {};

    this.s.templates = null;
    this.t.templates = null;
    defProp('sTemplateNames');
    defProp('tTemplateNames');
    this.s.templatesIDs = {};
    this.t.templatesIDs = {};
    // only one template hash - it contains source and target templates
    this.templateHash = {};

    this.s.pages = null;
    this.t.pages = null;
    defProp('sPages');
    defProp('tPages');
    this.s.pagesIDs = {};
    this.t.pagesIDs = {};

    // if there was a log file to be output then do so.
    this.o = new Output({logFile: this.consoleFile, noconsole: options.noconsole});
    this.exceptions = fs.createWriteStream(this.exceptionsFile);
    let exceptionsAreClosed = stream => this.exceptions = null;
    this.exceptions.on('close', exceptionsAreClosed);
    this.exceptions.on('finish', exceptionsAreClosed);

    // make the log file availble on the s and t properties
    this.s.writeException = this.t.writeException = this.writeException.bind(this);

    // the default separator (unit separator control character) not currently used
    this.usep = '\u001f';
}

//
// presume the buffering can keep up - just log if a problem and need to handle.
//
Comparison.prototype.writeException = function(text) {
    if (!this.exceptions) {
        console.log(text);
        return;
    }
    let ok = this.exceptions.write(new Date().toISOString() + ' ' + text + '\n');
    if (!ok) {
        console.log('exception file buffer full:', text);
    }
}

Comparison.prototype.closeExceptionsFile = function() {
    if (this.exceptions) {
        this.exceptions.end();
    }
}

Comparison.prototype.close = function() {
    return Promise.map([
        () => this.closeExceptionsFile(),
        () => this.o.close()
    ])
}

//
// add the modules that extend the Comparison constructor.
//
require('./pages')(Comparison);
require('./tables')(Comparison);
require('./modules')(Comparison);
require('./templates')(Comparison);
require('./fields')(Comparison);

module.exports = Comparison;

// example code for extended Objects across files

/*

// foo/index.js
'use strict';
function Foo() {

};
Foo.prototype.constructor = Foo; // don't think it's needed

require('./foo-a')(Foo);
require('./foo-b')(Foo);

module.exports = Foo;



// foo/foo-a.js
'use strict';
module.exports = function(Foo) {
  Foo.prototype.methodA = function() {
    console.log('methodA');
  };
  // more methods as desired...
};



// foo/foo-b.js
'use strict';
module.exports = function(Foo) {
  Foo.prototype.methodB = function() {
    console.log('methodB');
    this.methodA();
  };
  // more methods as desired...
};
// */
