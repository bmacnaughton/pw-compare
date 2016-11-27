//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

const Promise = require('bluebird');

const KeyedBuckets = require('./keyed-buckets');
const u = require('./utility');

let {getDifferences, JSONtoObject} = u;

//
// templates
//

module.exports = function(_base) {
    _base.prototype.compareTemplates = function(opts) {

        /*
        let query = 'select t.name "t.name", fgf.data "fgf.data", fgf.fieldgroups_id "fgf.fieldgroups_id",  f.name "f.name", ' +
                        'f.type, f.flags, f.label, f.data "f.data" from templates t ' +
                        'join fieldgroups fg on t.fieldgroups_id = fg.id ' +
                        'join fieldgroups_fields fgf on fg.id = fgf.fieldgroups_id ' +
                        'join fields f on fgf.fields_id = f.id ' +
                        'order by t.name, fgf.fields_id';
        let key = ['t.name', 'f.name'];
        //query = 'select name, fieldgroups_id, flags, data from ' + this.sdb.db + '.templates';
        // */
        // read key fields from the templates table first.
        let query = 'select id, name, data, fieldgroups_id from templates';

        return Promise.all([this.sdb.query(query), this.tdb.query(query)]).then(results => {
            [this.s.templates, this.t.templates] = results;
        }).then(() => {
            this.templateHash = {};
            this.templatesInBoth = [];
            this.templatesSourceOnly = [];
            this.templatesTargetOnly = [];

            // add the source template names to the hash and make an ID-indexed hash too
            this.s.templates.rows.forEach(r => {
                this.s.templatesIDs[r.id] = r;
                JSONtoObject(r, 'data');
                if (!this.templateHash[r.name]) {
                    this.templateHash[r.name] = {s: null, t: null};
                }
                this.templateHash[r.name].s = r;
            })
            // add the target template names to the hash
            this.t.templates.rows.forEach(r => {
                this.t.templatesIDs[r.id] = r;
                JSONtoObject(r, 'data');
                if (!this.templateHash[r.name]) {
                    this.templateHash[r.name] = {s: null, t: null};
                }
                this.templateHash[r.name].t = r;
            })
            // now all template names are in the dictionary. figure out which bucket
            // each goes in.
            for (let name in this.templateHash) {
                if (this.templateHash[name].s && this.templateHash[name].t) {
                    this.templatesInBoth.push(name);
                } else if (this.templateHash[name].s) {
                    this.templatesSourceOnly.push(name);
                } else {
                    this.templatesTargetOnly.push(name);
                }
            }
        }).then(() => {
            // read the fieldgroups_fields and add field names to them for easier lookups.
            let query = 'select fieldgroups_fields.*, fields.name "field_name" from fieldgroups_fields ' +
                        'join fields on fieldgroups_fields.fields_id = fields.id ' +
                        'order by fieldgroups_id, sort';

            return Promise.all([this.sdb.query(query), this.tdb.query(query)]).then(results => {
                [this.s.fgf, this.t.fgf] = results;
                [this.s, this.t].forEach(db => {
                    db.fgf.rows.forEach(r => {
                        JSONtoObject(r, 'data');
                    });
                    db.fgf = new KeyedBuckets('fieldgroups_id', {objects: db.fgf.rows});
                });
            });
        }).then(() => {
            // TODO this whole section duplicates the fieldgroups_fields read just done; rework
            // this to use the data that's already been read.
            let q = 'select fgf.fields_id, fgf.data fgf$data, f.name from fieldgroups_fields fgf ' +
                'join fields f on fgf.fields_id = f.id ' +
                'where fgf.fieldgroups_id = ';

            // make the queries for the fields of the template "name" in the source and target
            // databases. handle condition where template is not present in source or target.
            let makeQueries = name => {
                let makeQuery = db => q + '"' + this.templateHash[name][db].fieldgroups_id + '"';
                let sQuery = [null];
                if (this.templateHash[name]['s']) {
                    sQuery = [this.sdb.query(makeQuery('s'))];
                }
                let tQuery = [null];
                if (this.templateHash[name]['t']) {
                    tQuery = [this.tdb.query(makeQuery('t'))];
                }
                return sQuery.concat(tQuery);
            };

            // now read all the detailed data for each template. each read is handled sequentially.
            // https://stackoverflow.com/questions/17757654/how-to-chain-a-variable-number-of-promises-in-q-in-order
            // https://stackoverflow.com/questions/16976573/chaining-an-arbitrary-number-of-promises-in-q

            // the resultName is one behind the name that reduce supplies because it is the
            // the name of the template for the completed query while 'name' is for the next
            // query.
            let resultName = this.templatesInBoth[0];

            // define a function as it's needed in two places.
            let fn = results => {
                if (!results) {
                    throw "no results in template details query";
                }
                let [sTemplateFields, tTemplateFields] = results;
                // convert JSON strings to objects
                // TODO use already converted db.fgf records
                if (sTemplateFields) {
                    sTemplateFields.rows.forEach(row => JSONtoObject(row, 'fgf$data'));
                }
                if (tTemplateFields) {
                    tTemplateFields.rows.forEach(row => JSONtoObject(row, 'fgf$data'));
                }
                // store the fields in the hash.
                this.templateHash[resultName].fields = {s: sTemplateFields.rows, t: tTemplateFields.rows};
            }

            //
            // note the .then(fn) at the end to pick up the last Promise resolution.
            //
            return this.templatesInBoth.reduce((p, name) => {
                //*
                return p.then(results => {
                    fn(results);
                    // the new resultName will be the new query.
                    resultName = name;
                    return Promise.all(makeQueries(name));
                });
                // */
            }, Promise.all(makeQueries(resultName))).then(fn);
        }).then(() => {
            let breakName = 'xyzzy-42';         // it will break on this template name
            // now compare source and target for differences.
            // TODO: now just handle templatesInBoth but needs to handle source and target only too.
            let templateDifferences = {};
            for (let name in this.templateHash) {
                // skip if not in source or target until they are correctly handled.
                if (!(this.templateHash[name].s && this.templateHash[name].t)) {
                    continue;
                }
                //console.log('differencing', name);
                if (name === breakName) {
                    debugger;
                }
                let differences = getDifferences(this.templateHash[name].s, this.templateHash[name].t);
                if (differences) {
                    templateDifferences[name] = {template: differences};
                }
                // if there are no fields then it's a problem.
                // TODO - must a template have fields?
                if (!this.templateHash[name].fields) {
                    debugger;
                    throw "No fields for template: " + name;
                }
                // get fields organized by name (the only way to match between two DBs)
                let sFields = {};
                this.templateHash[name].fields.s.forEach(f => {
                    sFields[f.name] = f;
                });
                let tFields = {};
                this.templateHash[name].fields.t.forEach(f => {
                    tFields[f.name] = f;
                })

                if (name === breakName) {
                    debugger;
                }
                // now get common, source only, and target only.
                let fieldSets = u.generateSets(sFields, tFields);
                let fieldDifferences = {};
                fieldSets.inBoth.forEach(fieldName => {
                    let differences = getDifferences(sFields[fieldName], tFields[fieldName]);
                    if (differences) {
                        fieldDifferences[fieldName] = differences;
                    }
                })
                if (Object.keys(fieldDifferences).length) {
                    if (!templateDifferences[name]) {
                        templateDifferences[name] = {};
                    }
                    templateDifferences[name].fieldgroup_fields = fieldDifferences;
                }
            }

            // TODO can create .SQL files that would perform these updates. also can create
            // LostKobrakai migration files - probably cleaner to user PW primitives.
            // print what has been found
            this.o.putHeader('TEMPLATES');

            // go through each category of template

            if (this.templatesSourceOnly.length) {
                this.o.putSection('templates in source only', 'red');
                this.templatesSourceOnly.forEach(t => {
                    this.o.putSectionItem(t, 'red');
                })
            }

            if (this.templatesTargetOnly.length) {
                this.o.putSection('templates in target only', 'yellow');
                this.templatesTargetOnly.forEach(t => {
                    this.o.putSectionItem(t, 'yellow');
                })
            }

            let nUnequal = Object.keys(templateDifferences).length;
            let nEqual = this.templatesInBoth.length - nUnequal;

            if (nEqual) {
                this.o.putSection(['%d templates identical in source and target', nEqual], 'green');
                if (!opts.showall) {
                    this.o.putSectionItem('use --showall commandline option to display');
                } else {
                    this.templatesInBoth.forEach(name => {
                        this.o.putSectionItem(name, 'green');
                    })
                }
            }

            if (nUnequal) {
                let phrase = nUnequal === 1 ? "template is" : "templates are"
                this.o.putSection(['%d %s different in source and target', nUnequal, phrase], 'red');
                for (let key in templateDifferences) {
                    this.o.putSectionItem(key, 'red');
                    for (let diff in templateDifferences[key]) {
                        this.o.putSectionItemObject(diff, templateDifferences[key][diff]);
                    }
                }
            }
        })
    }
}

