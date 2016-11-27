//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

const chalk = require('chalk');
const util = require('util');
const fs = require('fs');
const Promise = require('bluebird');

const PWDB = require('./pwdb');
const Comparison = require('./comparison/');
const {XError} = require('./error');

const opts = require('yargs')
    .usage('node $0 [args]')
    .option('source', {
        alias: 's',
        describe: 'source database name',
        default: 'whale'
    })
    .option('target', {
        alias: 't',
        describe: 'target database name',
        default: 'whale_testing'
    })
    .option('showall', {
        alias: 'a',
        describe: 'show identical elements in addition to different elements',
        default: false
    })
    .option('fields', {
        alias: 'f',
        describe: 'show fields information everywhere',
        default: false
    })
    .option('write', {
        alias: 'w',
        describe: 'write util.inspect format files for each section',
        default: false
    })
    .option('noconsole', {
        alias: 'n',
        describe: 'do not write normal output to the console',
        default: false
    })
    /*
    .option('memory', {
        alias: 'm',
        describe: 'write memory usage statistics and the end of each step',
        default: false
    })
    // */
    .option('append', {
        alias: 'A',
        describe: 'do not delete logs/memory at the start, append to the file',
        default: false
    })
    .option('debug', {
        alias: 'd',
        describe: 'hit breakpoints at beginning and end',
        default: false
    })
    .help('help')
    .alias('help', 'h')
    .argv;

//
// basic logic
//
// open databases
//
// get list of tables - compare against old - need new tables
// is every table in old in new with same schema?
// are there any tables in new that are not in old?
// DONE
//
// get old and new structures for each tables
// - same, no issue
// - different, flag
// DONE
//
// if DB structure changes then abort until addressed?
//
// go through modules
// DONE
//
// go through fields
// DONE
//
// go through templates
// DONE
//
// go through pages
// - this is trickier - only the URL path can be compared - page IDs will vary.
//   so changing a single parent, e.g., /config/product/ to /config/products/
//   will result in all children being flagged.
// - need to check the field values associated with each page.
// DONE
//
// NOT sessions, users, wall-pages, unpublished pages?, etc.
//
// flag any tables that don't fit a category
//

let logsDir = 'logs/';
let sourceLogsDir = 'logs/s/';
let targetLogsDir = 'logs/t/';

function write(name, data) {
    var p = new Promise((resolve, reject) => {
        fs.writeFile(name, data, err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            };
        });
    });
    return p;
}

// delete file and create directory are not as straightforward as
// reject() and resolve(). e.g., attemping to delete a non-existent file
// is not a failure.

let memFilename = logsDir + 'memory';

function deleteMemoryStatsFile() {
    return new Promise((resolve, reject) => {
        fs.unlink(memFilename, err => {
            if (err && err.code === 'ENOENT') {
                resolve();
            } else if (err) {
                reject(err)
            } else {
                resolve();
            }
        })
    })
}

function writeMemoryStats(message) {
    let date = new Date().toISOString();
    let memory = util.format(process.memoryUsage());
    return new Promise((resolve, reject) => {
        fs.appendFile(memFilename, date + ' ' + message + ' ' + memory + '\n', err => {
            if (err) {
                reject(err)
            } else {
                resolve();
            }
        })
    })
}

// this little hook is after other libraries exceptions have occured so setting
// breakOnException only catches our exceptions.
if (opts.debug) {
    debugger;
}

//++
// utility functions start here
//--

function checkDBs() {
    return PWDB.getDatabases().then(databases => {
        if (databases.indexOf(opts.source) < 0) {
            throw new XError(
                "DATABASE_NOT_FOUND",
                "Source database " + opts.source + " not present in the server",
                databases
            );
        } else if (databases.indexOf(opts.target) < 0) {
            throw new XError(
                "DATABASE_NOT_FOUND",
                "Target database " + opts.target + " not present in the server",
                databases
            );
        }
        return databases;
    })
}


// async version of making logs directory.
function makeDir(name) {

    // utility function to make a directory
    let makeit = (resolve, reject) => {
        fs.stat(name, (err, stats) => {
            if (err && err.code == 'ENOENT') {
                // then make the directory
                fs.mkdir(name, err => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve()
                    }
                })
            } else if (err && err.code !== 'ENOENT') {
                reject(err)
            } else if (!stats.isDirectory()) {
                reject(new Error('"' + name + '" is not a directory'));
            } else if (stats.isDirectory()) {
                resolve();
            } else {
                throw ("Impossible state in makeLogsDir");
            }
        })
    }
    return new Promise(makeit);
}

// globals
var sourceDB;
var targetDB;
var c;

var comparisonOptions = {
    exceptionsFile: logsDir + 'exceptions',
    noconsole: opts.noconsole,
}

if (opts.write) {
    comparisonOptions.consoleFile = logsDir + 'console'
}

var dbSettings = require('./db-settings');
var sourceSettings = dbSettings.sourceDB;
var targetSettings = dbSettings.targetDB;

// override DB name from command line if specified
if (opts.source) sourceSettings.database = opts.source;
if (opts.target) targetSettings.database = opts.target;

//++
// main code starts here
//--

// the Promise.each() function gets the value in each element of the array.
// i.e., result => result(), invokes each function either resulting in a promise or value.
// easiest way I know to generate a combination of sequential steps mixing async and sync
// using bluebird.js.
function initialize() {
    return Promise.each([
        () => checkDBs(),
        () => makeDir(logsDir),
        () => makeDir(sourceLogsDir),
        () => makeDir(targetLogsDir),
        () => (!opts.append && opts.write) ? deleteMemoryStatsFile() : null,
        () => opts.write ? writeMemoryStats('baseline') : null,
        () => sourceDB = new PWDB(sourceSettings),
        () => targetDB = new PWDB(targetSettings),
        () => c = new Comparison(sourceDB, targetDB, comparisonOptions),
        () => opts.write ? writeMemoryStats('comparison created') : null
    ], result => result());
}


//console.log('Comparing source: %s and target: %s', opts.source, opts.target);

let utilOpts = {depth: null, maxArrayLength: null};

//
// initialize then do compares in sequence
//
initialize().then(() => {
    // write console/logged output after creating the comparison.
    c.o.putHeader(util.format('Comparing source: %s and target: %s', opts.source, opts.target));
}).then(() => c.compareTableStructures(opts).then(() => {
    if (opts.write) {
        return Promise.all([
            writeMemoryStats('tables compared'),
            write(sourceLogsDir + 'tables', util.inspect(c.sTables, utilOpts)),
            write(targetLogsDir + 'tables', util.inspect(c.tTables, utilOpts))
        ]);
    }
})).then(() => c.compareModules(opts).then(function() {
    if (opts.write) {
        return Promise.all([
            writeMemoryStats('modules compared'),
            write(sourceLogsDir + 'modules', util.inspect(c.sModules, utilOpts)),
            write(targetLogsDir + 'modules', util.inspect(c.tModules, utilOpts))
        ]);
    }
})).then(() => c.compareFields(opts).then(function() {
    if (opts.write) {
        return Promise.all([
            writeMemoryStats('fields compared'),
            write(sourceLogsDir + 'fields', util.inspect(c.sFields, utilOpts)),
            write(targetLogsDir + 'fields', util.inspect(c.tFields, utilOpts))
        ]);
    }
})).then(() => c.compareTemplates(opts).then(function() {
    if (opts.write) {
        return Promise.all([
            writeMemoryStats('templates compared'),
            write(logsDir + 'templateHash', util.inspect(c.templateHash, utilOpts)),
            write(sourceLogsDir + 'templates', util.inspect(c.s.templates, utilOpts)),
            write(targetLogsDir + 'templates', util.inspect(c.t.templates, utilOpts))
        ]);
    }
})).then(() => c.comparePages(opts).then(function() {
    if (opts.write) {
        return Promise.all([
            writeMemoryStats('pages compared'),
            write(sourceLogsDir + 'pages', util.inspect(c.s.pages, utilOpts)),
            write(targetLogsDir + 'pages', util.inspect(c.t.pages, utilOpts)),
            write(sourceLogsDir + 'pagePaths', util.inspect(c.pagePaths.s, utilOpts)),
            write(targetLogsDir + 'pagePaths', util.inspect(c.pagePaths.t, utilOpts))
        ]);
    }
})).then(function() {
    if (opts.debug) {
        debugger;
    }
    return Promise.map([
        //() => c ? c.closeExceptionsFile() : null,
        () => c.close(),
        () => sourceDB ? sourceDB.close() : null,
        () => targetDB ? targetDB.close() : null
    ]);
}).catch(function(err) {
    debugger;
    if (err.name === "DATABASE_NOT_FOUND") {
        console.log(chalk.inverse.red.bgWhite(err));
        console.log('databases found in server: ', err.context);
    }
    // close things if the program got far enough to open them.
    Promise.all([
        () => c ? c.closeExceptionsFile() : null,
        () => sourceDB ? sourceDB.close() : null,
        () => targetDB ? targetDB.close() : null,
    ]).then(() => null);
    process.exit(1);
});
