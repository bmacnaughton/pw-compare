//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

const Promise = require('bluebird');

const PWDB = require('../pwdb');
const u = require('./utility');

let {bucketize, getDifferences} = u;

//
// tables
//
module.exports = function(_base) {
    _base.prototype.compareTableStructures = function(opts) {
        return Promise.all([this.sdb.getTableDescs(), this.tdb.getTableDescs()]).then(results => {
            [this.s.tables, this.t.tables] = results;
        }).then(() => {
            // convert the weird table structure data to {table: tableRecord}
            // TODO - fix getTableDescs()
            let sTableRecords = {};
            for(let table in this.s.tables) {
                sTableRecords[table] = this.s.tables[table].rows;
            }
            let tTableRecords = {};
            for (let table in this.t.tables) {
                tTableRecords[table] = this.t.tables[table].rows;
            }

            // find tables in source, target, and the differences
            this.tableSets = bucketize(getDifferences(sTableRecords, tTableRecords));

            // output information about the differences between the two DBs
            this.o.putHeader('TABLES');

            if (this.tableSets.inSource.length) {
                this.o.putSection(['%d tables in source only', this.tableSets.inSource.length], 'yellow');
                this.tableSets.inSource.forEach(table => {
                    this.o.putSectionItem(table, 'yellow');
                });
            }
            if (this.tableSets.inTarget.length) {
                this.o.putSection(['    %d tables in source only', this.tableSets.inTarget.length], 'yellow');
                this.tableSets.inTarget.forEach(table => {
                    this.o.putSectionItem(table, 'yellow');
                });
            }

            let identical = [];
            let different = [];
            this.tableSets.inBoth.forEach(table => {
                if (!PWDB.tableDefinitionsAreEqual(this.s.tables[table], this.t.tables[table])) {
                    different.push(table);
                } else {
                    identical.push(table);
                }
            });

            if (identical.length) {
                this.o.putSection(['%d tables identical in source and target', identical.length], 'green');
                if (!opts.showall) {
                    this.o.putSectionItem('use --showall commandline option to display');
                } else {
                    identical.forEach(table => {
                        this.o.putSectionItem(table, 'green');
                    });
                }
            }

            if (different.length) {
                let phrase = different.length === 1 ? 'table is' : 'tables are';
                this.o.putSection(['%d %s different in source and target', different.length, phrase], 'red');
                //console.log(chalk.red.bold('    %d %s different in source and target'), different.length, phrase);
                different.forEach(table => {
                    this.o.putSectionItem(table, 'red');
                    this.o.putSectionItemObject({s: this.s.tables[table], t: this.t.tables[table]});
                })
            }
        })
    }
}
