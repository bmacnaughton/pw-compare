//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

const util = require('util');
const Promise = require('bluebird');

const PageFieldsFactory = require('./pagefields');

const u = require('./utility');

//
// pages
//
// this comparison requires that the field comparison has already been run because it uses
// the data in fields
//
module.exports = function(_base) {
    _base.prototype.comparePages = function(opts) {

        // WARNING - walkPageTree() depends on these names as they are, specifically id, p.name, and parent_id.
        // WARNING - these names are used by code later on.
        // TODO - choose a better naming convention, e.g., p$name, so page['p.name'] can be replaced with page.p$name.
        // TODO - standard table short-hand documentation, e.g., p$, f$, t$, fgf$, etc.
        // TODO - fetch sort and compare it as well.
        let query = 'select p.id, p.name "p.name", p.status, p.parent_id, ' +
                        't.name "t.name", t.fieldgroups_id "t.fieldgroups_id"  from pages p ' +
                        'join templates t on p.templates_id = t.id ' +
                        'order by p.id';

        return Promise.all([this.sdb.query(query), this.tdb.query(query)]).then(results => {
            // WARNING - the row data packet will have properties added to it. it is possible to
            // overwrite an existing property.
            [this.s.pages, this.t.pages] = results;
        }).then(() => {
            // promises is kind of a brute force mechanism to wait for every field.getValue() to complete.
            let promises = [];
            let tracePages = new Set([/*1, 1313, 1564*/]);
            [this.s, this.t].forEach(db => {
                this.writeException('DB is: ' + db.db.db);
                // loop once through to make an ID-indexed hash of the pages.
                db.pages.rows.forEach(page => db.pagesIDs[page.id] = page);

                // now get a DB=specific constructor and go through each page to resolve
                // their field values.
                let pff = new PageFieldsFactory(db);
                db.pages.rows.forEach(page => {

                    // add the field information. this makes it easier to look at the output
                    // logs; it's not necessary for the code to resolve the page's field values.
                    page.pageFields = {};
                    let fields = db.fgf.getRecords(page['t.fieldgroups_id']);
                    fields.forEach(row => {
                        let field_name = row.field_name;
                        let fields_id = row.fields_id;
                        let type = db.fieldsIDs[fields_id].type;

                        page.pageFields[field_name] = {fields_id, type, sort: row.sort};
                    });
                    let options = {};
                    if (tracePages.has(page.id)) {
                        debugger;
                        options.trace = true;
                    }

                    // resolve the fields on this page
                    let pageResolver = new pff.Page(page.id, options);
                    let p = pageResolver.getFieldValues().then(results => {
                        if (tracePages.has(page.id)) debugger;
                        page.fieldValues = results;
                    })
                    // save each promise so this section can wait until all queries required for
                    // field-value resolution are done before moving to the comparison section.
                    promises.push(p);
                    if (options.trace) {
                        console.log('pending count', pageResolver.queriesPending);
                        debugger;
                    }

                });
            });
            return Promise.all(promises);
        }).then(results => {
            // build a page tree that is then used to construct and fill in each page's path.
            // this is necessary because 1) PW doesn't store children of a page, only parents and
            // 2) pages names can be duplicated at different levels of the tree so matching must
            // be done on the full path.
            this.pageTree = {s: null, t: null};
            this.pagePaths = {s: null, t: null, b: {}};
            for (let db of ['s', 't']) {
                let rows = this[db].pages.rows;
                // make sure that the first row is the page '/' (id=1). The query sorts rows by page ID
                // so if this isn't true then there is something we don't understand about pages.
                if (rows[0].id != 1) {
                    throw "Unknown page ID structure before walking the page tree";
                }

                let pageTree = {};
                let pagePaths = {};

                // add an array for children to page and create a hash with the page ID as
                // the index.
                for (let i = 0, len = rows.length; i < len; i++) {
                    rows[i].children = [];
                    pageTree[rows[i].id] = rows[i];
                }
                // first fill in the arrays of children for each page. PW keeps track of the parent_id but
                // not the children, so go through each row and fill in the children array using the parent_ids.
                // skip the first page - it is the root (validated above) and doesn't have a parent_id.
                for (let i = 1, len = rows.length; i < len; i++) {
                    pageTree[pageTree[rows[i].id].parent_id].children.push(rows[i].id);
                }
                // save the tree and page-path indexed hash
                this.pageTree[db] = pageTree;

                // utility function called by walkPageTree.
                //     this uses each page's name, starting with '/' to build a full page
                //     path. it then updates pagePaths to point to the pageRecord for each
                //     DB and updates pageTree's pagepath with the path.
                let action = (id, pagepath) => {
                    let path = '/' + pagepath.slice(1).join('/');
                    pagePaths[path] = pageTree[id];
                    if (!this.pagePaths.b[path]) {
                        this.pagePaths.b[path] = {};
                    }
                    this.pagePaths.b[path][db] = pageTree[id];
                    pageTree[id].pagepath = path;
                }
                //
                // walk the page tree invoking action each step to build each page's complete path.
                //
                walkPageTree(pageTree, 1, action);

                // save the page-path indexed hash
                this.pagePaths[db] = pagePaths;
            }

            // page data buckets
            let p = {
                sourceOnly: {},
                targetOnly: {},
                bothCount: 0,
                unequal: {},
                equal: {}
            };

            function extracted(record) {
                // function to copy field definitions except for fields_id so
                // it doesn't cause differences.
                function extractedFields(pageFields) {
                    let fields = {};
                    for (let key in pageFields) {
                        if (key !== 'fields_id') {
                            fields[key] = pageFields[key];
                        }
                    }
                    return fields;
                }

                return {
                    name: record.name,
                    status: record.status,
                    template_name: record['t.name'],
                    pageFields: extractedFields(record.pageFields),
                    fieldValues: record.fieldValues,
                    pagepath: record.pagepath
                }
            }

            // put pages in source, both, target buckets
            for (let pagepath in this.pagePaths.b) {
                let sourceRec = this.pagePaths.b[pagepath].s;
                let targetRec = this.pagePaths.b[pagepath].t;
                if (sourceRec && targetRec) {
                    p.bothCount += 1;

                    let diffs = getObjectDifferences(extracted(sourceRec), extracted(targetRec));
                    //let diffs = getObjectDifferences(sourceRec.fieldValues, targetRec.fieldValues);
                    //let diffs = getDifferences(sourceRec, targetRec, pageKeyActions);
                    if (diffs) {
                        p.unequal[pagepath] = diffs;
                    } else {
                        p.equal[pagepath] = this.pagePaths.b[pagepath];
                    }
                } else if (sourceRec) {
                    p.sourceOnly[pagepath] = sourceRec;
                } else if (targetRec) {
                    p.targetOnly[pagepath] = targetRec;
                } else {
                    throw "pagePath: " + pagepath + " missing source and target records";
                }
            }

            //
            // Print pages information
            //

            // utility function to determine whether to include page in output or not. the patterns
            // must be the first part of the path.
            let include = key => {
                const excludes = [
                    '/manage/access/users/',
                    '/trash/',
                    '/wall-files/'
                ];
                for (let exclude of excludes) {
                    if (key.indexOf(exclude) === 0 && key.length > exclude.length) {
                        return false;
                    }
                }
                return true;
            }

            this.o.putHeader('PAGES - URL (template)', 'black');

            // this used to go through pagePaths so the paths are fetched in traversal order.
            // it's not clear that it matters.

            if (Object.keys(p.sourceOnly).length) {
                this.o.putSection('pages in source only', 'red');
                for (let key in p.sourceOnly) {
                    if (include(key)) {
                        this.o.putSectionItem(['%s (%s)', key, p.sourceOnly[key]['t.name']], 'red');
                    }
                }
            }

            if (Object.keys(p.targetOnly).length) {
                this.o.putSection('pages in target only', 'red');
                for (let key in p.targetOnly) {
                    if (include(key)) {
                        this.o.putSectionItem(['%s (%s)', key, p.targetOnly[key]['t.name']], 'red');
                    }
                }
            }

            let unequal = Object.keys(p.unequal).length;
            if (unequal) {
                this.o.putSection(['%d pages are different in source and target', unequal], 'red');
                for (let key in p.unequal) {
                    this.o.putSectionItem(key, 'red');
                    for (let property in p.unequal[key]) {
                        this.o.putSectionItemObject(property, p.unequal[key][property]);
                    }
                }
            }

            let equal = Object.keys(p.equal).length;
            if (equal) {
                this.o.putSection(['%d pages are identical in source and target', equal], 'green');
                if (!opts.showall) {
                    this.o.putSectionItem('use --showall commandline option to display');
                } else {
                    for (let key in p.equal) {
                        this.o.putSectionItem(['%s (%s)', key, this.equal[key]['t.name']], 'green');
                    }
                }
            }
        })
    }
}



//
// walk the pageTree starting at startID. create the full path and call action
// for each page.
//
function walkPageTree(pageTree, startID, action) {
    let pagepath = [];

    let recurse = id => {
        let branch = pageTree[id];
        pagepath.push(branch['p.name']);
        action(id, pagepath);
        // if this branch has children follow them.
        if (branch.children.length) {
            for (let i = 0, len = branch.children.length; i < len; i++) {
                recurse(branch.children[i]);
            }
        }
        pagepath.pop();
    }

    recurse(startID);
}


//
// getObjectDifferences(sfields, tfields)
//
// call with s.page.fieldValues, t.page.fieldValues
//
function getObjectDifferences(sfields, tfields) {
    let differences = {};

    // figure which fields are in source, both, and target.
    let sets = u.generateSets(sfields, tfields);

    // differences for those only in source or target are the entire record
    sets.inSource.forEach(key => {
        differences[key] = {s: sfields[key], t: undefined};
    })
    sets.inTarget.forEach(key => {
        differences[key] = {s: undefined, t: tfields[key]};
    })

    // now detect differences for fields that are in both source and target
    sets.inBoth.forEach(key => {
        // if they are the same then they must be primitive types so just
        // return null indcating no difference.
        if (sfields[key] === tfields[key]) {
            return;
        } else if (Array.isArray(sfields[key]) && Array.isArray(tfields[key])) {
            if (sfields[key].length !== tfields[key].length) {
                differences[key] = {s: sfields[key], t: tfields[key]};
                return;
            }
            for (let i = 0, len = sfields[key].length; i < len; i++) {
                // if they are the same then on to the next element
                if (sfields[key][i] === tfields[key][i]) {
                    continue
                } else if (typeof sfields[key][i] === 'object' && typeof tfields[key][i] === 'object') {
                    let subDiffs = getObjectDifferences(sfields[key][i], tfields[key][i]);
                    if (subDiffs) {
                        differences[key] = subDiffs;
                        return;
                    }
                } else {
                    differences[key] = {s: sfields[key], t: tfields[key]};
                    return;
                }

            }
        } else if (typeof sfields[key] === 'object' && typeof tfields[key] === 'object') {
            let subDifferences = getObjectDifferences(sfields[key], tfields[key]);
            if (subDifferences) {
                if(subDifferences.s === null && subDifference.t === null) debugger;
                differences[key] = subDifferences;
                return;
            }
        } else {
            // thy're just not equal
            differences[key] = {s: sfields[key], t: tfields[key]};
            return;
        }
    });

    if (Object.keys(differences).length) {
        return differences;
    } else {
        return null;
    }
}
