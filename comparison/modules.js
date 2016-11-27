//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

const Promise = require('bluebird');

const u = require('./utility');

let {difference, intersection, getDifferences} = u;

//
// Modules
//
module.exports = function(_base) {
    _base.prototype.compareModules = function(opts) {
        let query = 'select id, class, flags, data from modules';
        return Promise.all([this.sdb.query(query), this.tdb.query(query)]).then(results => {
            [this.s.modules, this.t.modules] = results;
        }).then(() => {
            // convert all the data fields (JSON) to objects. it can be null or a null string.
            // also create an ID-indexed hash for later lookup, but delete the ID after that
            // so the log file format doesn't change.
            this.s.modules.rows.forEach(row => {
                this.s.modulesIDs[row.id] = row;
                row.data = JSON.parse(row.data && row.data.length ? row.data : '{}');
                delete row.id;
            });

            this.t.modules.rows.forEach(row => {
                this.t.modulesIDs[row.id] = row;
                row.data = JSON.parse(row.data && row.data.length ? row.data : '{}');
                delete row.id;
            })

            // show the comparison between source and target.
            let sModuleMap = {};
            let tModuleMap = {};

            let sourceModules = new Set(this.s.modules.rows.map(row => {
                sModuleMap[row.class] = row;
                return row.class
            }));
            let targetModules = new Set(this.t.modules.rows.map(row => {
                tModuleMap[row.class] = row;
                return row.class
            }));

            //
            // find relationships between the tables in the source and target.
            //
            this.moduleSets = {};
            this.moduleSets.inSource = [...difference(sourceModules, targetModules)];
            this.moduleSets.inBoth = [...intersection(sourceModules, targetModules)];
            this.moduleSets.inTarget = [...difference(targetModules, sourceModules)]

            this.o.putHeader('MODULES', 'black');

            if (this.moduleSets.inSource.length) {
                this.o.putSection('modules in source only', 'red');
                this.moduleSets.inSource.forEach(m => {
                    this.o.putSectionItem(m, 'red')
                })
            }

            if (this.moduleSets.inTarget.length) {
                this.o.putSection('modules in target only', 'yellow');
                this.moduleSets.inTarget.forEach(m => {
                    this.o.putSectionItem(m, 'yellow');
                })
            }

            // not for modules that are in both source and target do comparisons
            let identical = [];
            let different = [];
            this.moduleSets.inBoth.forEach(m => {
                let differences = getDifferences(sModuleMap[m], tModuleMap[m]);
                if (differences) {
                    different.push(Object.assign({class: m, differences}));
                } else {
                    identical.push(m);
                }
            });

            if (identical.length) {
                this.o.putSection(['%d modules identical in source and target', identical.length], 'green');
                if (!opts.showall) {
                    this.o.putSectionItem('use --showall commandline option to display');
                } else {
                    this.moduleSets.inBoth.forEach(name => {
                        this.o.putSectionItem(name, 'green');
                    })
                }
            }

            if (different.length) {
                let phrase = different.length === 1 ? "module is" : "modules are"
                this.o.putSection(['%d %s different in source and target', different.length, phrase], 'red');
                different.forEach(m => {
                    this.o.putSectionItem(m.class, 'red');
                    for (let d in m.differences) {
                        this.o.putSectionItemObject(d, m.differences[d]);
                    }
                })
            }

        })
    }
}
