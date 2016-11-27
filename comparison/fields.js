//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

const Promise = require('bluebird');

const u = require('./utility');

let {intersection, difference, getDifferences, JSONtoObject} = u;

//
// Fields
//

module.exports = function(_base) {
    _base.prototype.compareFields = function(opts) {

        let query = 'select id, type, name, flags, label, data from fields';
        let key = 'name';

        return Promise.all([this.sdb.query(query), this.tdb.query(query)]).then(results => {
            [this.s.fields, this.t.fields] = results;
        }).then(() => {
            // make ID-indexed hash for fields
            let fieldsIDs = {};
            let fieldsNames = {};
            this.s.fields.rows.forEach(row => {
                fieldsIDs[row.id] = row;
                fieldsNames[row.name] = row;
                row.data = JSON.parse(row.data && row.data.length ? row.data : '{}');
            });
            this.s.fieldsIDs = fieldsIDs;
            this.s.fieldsNames = fieldsNames;

            // now do same for target
            fieldsIDs = {};
            fieldsNames = {};
            this.t.fields.rows.forEach(row => {
                fieldsIDs[row.id] = row;
                fieldsNames[row.name] = row;
                row.data = JSON.parse(row.data && row.data.length ? row.data : '{}');
            });
            this.t.fieldsIDs = fieldsIDs;
            this.t.fieldsNames = fieldsNames;

            let compareFields = ['type', 'name', 'flags', 'label', 'data'];
            let comparison = compareRows(this.s.fields.rows, this.t.fields.rows, key, compareFields);
            //let c = getDifferences(this.s.fields.rows, this.)

            let sourceOnly = comparison.inSource;
            let targetOnly = comparison.inTarget;

            let equalRecs = comparison.equalRecs;
            let nEqual = Object.keys(equalRecs).length;

            let unequalRecs = comparison.unequalRecs;
            let nUnequal = Object.keys(unequalRecs).length;

            this.o.putHeader('FIELDS');

            // go through each category of field
            if (this.s.fields.rows.length) {
                this.o.putSection('fields in source only', 'red');
                this.s.fields.rows.forEach(row => {
                    if (sourceOnly.has(row[key])) {
                        this.o.putSectionItem(row[key], 'red');
                    }
                })
            }

            if (this.t.fields.rows.length) {
                this.o.putSection('fields in target only', 'yellow');
                this.t.fields.rows.forEach(row => {
                    if (targetOnly.has(row[key])) {
                        this.o.putSectionItem(row[key], 'yellow');
                    }
                })
            }

            if (nEqual) {
                this.o.putSection(['%d fields identical in source and target', nEqual], 'green');
                if (!opts.showall) {
                    this.o.putSectionItem('use --showall commandline option to display');
                } else {
                    for (let key in equalRecs) {
                        this.o.putSectionItem(key, 'green');
                    }
                }
            }

            if (nUnequal) {
                this.o.putSection(['%d fields are different in source and target', nUnequal], 'red');
                for (let key in unequalRecs) {
                    this.o.putSectionItem(key, 'red');
                    // TODO - change comparison from compareRows() to getDifferences() so the differences
                    // are {property: {s: diff, t: diff}, ...} instead of [{property: {s: diff, t: diff}}].
                    // for each array element
                    unequalRecs[key].forEach(element => {
                        for (let property in element) {
                            this.o.putSectionItemObject(property, element[property]);
                        }
                    })
                }
            }
        })
    }
}

let compareRows = function (sRows, tRows, mapKeys, fields) {
    // TODO extract comparison logic into separate function so can use on page structure after
    // manipulation. pass sRows, tRows, mapKey, fieldnames (can be from fields or Object.keys()).
    if (!Array.isArray(mapKeys)) {
        mapKeys = [mapKeys];
    }
    let sets = generateMultipleKeySets(sRows, tRows, mapKeys);

    // get the fields (columns). they should be the same for both DBs.
    //let fields = results[0].fields.map(f => f.name);

    // TODO sourcemap and targetmap only contain one entry per mapKeys (the last)
    // but there can be multiple rows - one per field - for each key.
    // go back to multiple keys (e.g., template + field) or store array per primary key.
    let sourcemap = sets.bothmap.s;
    let targetmap = sets.bothmap.t;
    let equalRecs = {};
    let unequalRecs = {};

    // for the rows in source and target that share the same key do detailed compare.
    [...sets.inBoth].forEach(key => {
        sets;
        //if (key === 'process') debugger;
        let sourceRec = sRows[sourcemap[key]];
        let targetRec = tRows[targetmap[key]];
        let differentFields = [];
        for (let i = 0, len = fields.length; i < len; i++) {
            if (typeof sourceRec[fields[i]] === 'object' && typeof targetRec[fields[i]] === 'object') {
                let diff = {};
                diff.data = objectCompare(sourceRec[fields[i]], targetRec[fields[i]]);
                if (diff.data) {
                    differentFields.push(diff);
                }
            } else if (sourceRec[fields[i]] !== targetRec[fields[i]]) {
                let diff = {};
                diff[fields[i]] = {s: sourceRec[fields[i]], t: targetRec[fields[i]]};
                differentFields.push(diff);
            }
        }
        if (differentFields.length) {
            if (unequalRecs[key]) {
                throw "Duplicate unequalRec " + key + " found in queryCompare";
            }
            unequalRecs[key] = differentFields;
        } else {
            if (equalRecs[key]) {
                throw "Duplicate equalRec " + key + " found in queryCompare";
            }
            equalRecs[key] = differentFields;
        }
    });

    return {
        inSource: sets.inSource,
        inTarget: sets.inTarget,
        unequalRecs,
        equalRecs
    };
}


//
// Compare two JSON strings (originally, now compares objects).
//
let objectCompare = function(s, t) {
    //let sData = JSON.parse(s && s.length ? s : '{}');
    //let tData = JSON.parse(t && t.length ? t : '{}');
    let sData = s;
    let tData = t;
    let sKeys = Object.keys(sData);
    let tKeys = Object.keys(tData);
    let sKeySet = new Set(sKeys);
    let tKeySet = new Set(tKeys);
    let temp = intersection(sKeySet, tKeySet);
    temp.delete('modified');
    let both = [...temp];
    temp = difference(sKeySet, tKeySet);
    temp.delete('modified');
    let sOnly = [...temp];
    temp = difference(tKeySet, sKeySet);
    temp.delete('modified');
    let tOnly = [...temp];
    let differences = [];

    // go through each key in the two objects
    both.forEach(key => {
        // if they are arrays see if the elements of the array are equal.
        // TODO this should probably recurse but I don't think PW creates arrays of arrays.
        if (Array.isArray(sData[key]) && Array.isArray(tData[key])) {
            if (sData[key].length !== tData[key].length) {
                let diff = {};
                diff[key] = {s: sData[key], t: tData[key]};
                differences.push(diff);
                // on to the next key in both.
                return;
            }
            for (let i = 0, len = sData[key].length; i < len; i++) {
                if (sData[key][i] !== tData[key][i]) {
                    let diff = {};
                    diff[key] = {s: sData[key], t: tData[key]};
                    differences.push(diff);
                    break;
                }
            }
        } else if (sData[key] !== tData[key]) {
            let diff = {};
            diff[key] = {s: sData[key], t: tData[key]};
            differences.push(diff);
        }
    });
    sOnly.forEach(key => {
        let diff = {};
        diff[key] = {s: sData[key], t: null};
        differences.push(diff);
    })
    tOnly.forEach(key => {
        let diff = {};
        diff[key] = {s: null, t: tData[key]};
        differences.push(diff);
    })

    return differences.length ? differences : null;
}


//
// TODO fix the silly '+' concatenation of keys. Give caller the option or
// stringify objects or do something. How useful is this whole function? Multiple
// keys are no longer used anyway...
//
let generateMultipleKeySets = function(s, t, mapKeys) {
    let bothmap = {s: {}, t: {}};

    let makeKey = row => {
        let mapkey = [];
        for (let key of mapKeys) {
            mapkey.push(row[key]);
        };
        return mapkey.join('+');
    }

    let sourceKeys = new Set(s.map((row, i) => {
        let key = makeKey(row);
        bothmap.s[key] = i;
        return key;
    }));
    let targetKeys = new Set(t.map((row, i) => {
        let key = makeKey(row);
        bothmap.t[key] = i;
        return key;
    }));

    return {
        inBoth: intersection(sourceKeys, targetKeys),
        bothmap,
        inSource: difference(sourceKeys, targetKeys),
        inTarget: difference(targetKeys, sourceKeys)
    }
}




