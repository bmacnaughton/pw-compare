'use strict';

const util = require('util');

const Promise = require('bluebird');

const u = require('./utility');
let {JSONtoObject, promisewhile} = u;


//
// Construct a factory to make page-field-value resolvers.
// the primary purpose of the factory is to associate the DB with
// newly constructed page object.
//
// it was intended to keep counters, references to created pages, etc.
// but that hasn't been necessary.
//
function PageFieldsFactory(db) {
    this.factory = {db};

    // associate this factory with this db.
    this.Page = Page.bind(null, this.factory);
    //this.Field = Field.bind(null, factory);
}

//
// construct a page object. this has debug and trace facilities
// that can be associated with a single root page.
//
function Page (factory, pages_id, options) {
    this.factory = factory;
    this.db = factory.db;
    this.pages_id = pages_id;
    this.options = options || {};

    this.queriesPending = 0;

    this.debug = {
        FieldtypeFile: false,
        FieldtypeModule: false,
        FieldtypePadNotes: false,
        FieldtypePageTable: false,
        FieldtypeRepeater: false,
    };

    // debugging aid for asynchronous completions
    this.traceRing = {};
    this.traceInitial = 0;
    this.traceCurrent = this.traceInitial;
    this.traceMax = 40;

    // simple function to make standard field query
    this.makeQuery = (pages_id, field_name) =>
        'select * from field_' + field_name.toLowerCase() + ' where pages_id = ' + pages_id;
}

//
// submit a query to the DB connection manager
//
Page.prototype.query = function (query) {
    this.trace('query', query);
    return this.db.db.query(query, {rowsOnly: true}).catch(err => {
        // TODO why is err.err needed?
        debugger;
        console.log('query failed: ' + err.err.message + '\n' + err.query);
    })
}

//
// Implement a trace facility that outputs to the console and logs to ring
// specific to the root page so it is easier to follow the flow of many
// asynchronous requests.
//
// it can also be used to set a tracepoint-specific debugger statement breakpoint
// by passing the specific message or "all" as option.break.
//
Page.prototype.trace = function(message, context) {
    //
    if (this.options.break && this.options.break == message || this.options.break == 'all') debugger;

    if (!this.options.trace) return;
    if (!context) {
        context = ''
    } else {
        //context = util.inspect(context, {depth: null});
    }
    // do this first so current points to the last item inserted.
    this.traceCurrent += 1;
    if (this.traceCurrent > this.traceMax) {
        this.traceCurrent -= this.traceMax;
    }
    this.traceRing[this.traceCurrent] = {message, context};
    console.log(this.pages_id, message, context);
}


//
// getFieldValues
//
// returns a promise to the results from resolveFields() which is fulfilled
// once all pending queries complete. this assures that there won't be unfulfilled
// promises dangling in the results tree.
//
Page.prototype.getFieldValues = function () {
    // wait until they complete.
    let moreRemain = () => this.queriesPending;
    let keepWaiting = () => new Promise(resolve => {
        this.trace('waiting queriespending: ' + this.queriesPending);
        setTimeout(() => resolve(), 100)
    });

    return this.resolveFields(this.pages_id).then(results => {
        // ignore the promisewhile result and return resolveFields results.
        return promisewhile(moreRemain, keepWaiting).then(() => results);
    }).catch(err => {
        console.log('err:', err, this.pages_id, this.db.db.db);
        return null;
    })
}

//
// resolveFields(pages_id)
//
// pages_id - integer page ID
//
// returns an object with keys for each field_name in the page.
//
Page.prototype.resolveFields = function(pages_id) {
    this.trace('resolveFields()', {pages_id});
    let page = this.db.pagesIDs[pages_id];
    if (!page) {
        return [];
    }
    let fieldgroups_id = page['t.fieldgroups_id'];
    let fields = this.db.fgf.getRecords(fieldgroups_id);

    // go through each field on the page
    let fieldsPending = {};
    fields.forEach(field => {
        fieldsPending[field.field_name] = this.resolveField(pages_id, field.fields_id);
    })

    return Promise.props(fieldsPending);
}

//
// resolveField()
//
// pages_id - the ID of a page
// fields_id - the ID of the field in the page specified by pages_id
//
Page.prototype.resolveField = function(pages_id, fields_id) {
    let context = {pages_id, fields_id};
    this.trace('resolveField()', context);

    // field, as stored in fieldsIDs, uses the PW database column names not
    // the more unique names this code creates. e.g., name === field_name,
    // id === fields_id.
    // TODO - change?
    let field = this.db.fieldsIDs[fields_id];

    this.queriesPending += 1;
    return this.query(this.makeQuery(pages_id, field.name)).then(results => {
        context.results = results;
        context.queriesPending = this.queriesPending;
        if (!(field.type in this.indirectTypes)) {
            this.trace('resolveField() returning', context);
            // likely need to return results[0].data after checking length === 1.
            this.queriesPending -= 1;
            if (results.length > 1) {
                debugger;
                this.writeException('page: ' + pages_id + ' field: ' + fields_id + ' record count: ' + results.length);
            }
            return results.length === 1 ? results[0].data : undefined;
        }

        // it is an indirect field type
        let fn = 'fieldtype' + this.indirectTypes[field.type];

        this.trace('resolveField() indirect invoking ' + fn, context);
        return this[fn](context).then(results => {
            context.results = results;
            this.trace('resolveField() ' + fn + ' returns', context);
            this.queriesPending -= 1;
            return results;
        })
    })
}

//
// fieldtypeFile
//
// this is very similar to a multi-paged terminal value except that
// there are additional properties besides 'data'. we use the sort property,
// ignore the timestamp properties, and return the description property along
// with the data property.
// TODO are the timestamps for the file? if so, maybe keep?
//
Page.prototype.fieldtypeFile = function(context) {
    this.trace('fieldtypeFile()', context);
    if (this.debug.FieldtypeFile) debugger;
    let {pages_id, fields_id, results} = context;
    results.sort((a, b) => a.sort - b.sort);
    return Promise.resolve(results.map(row => {
        return {data: row.data, description: row.description};
    }));
}

Page.prototype.fieldtypeMatrix = function(context) {
    this.trace('fieldtypeMatrix()', context);
    if (this.debug.FieldtypeMatrix) debugger;
    return Promise.resolve('FieldtypeMatrix()');
}

Page.prototype.fieldtypeModule = function(context) {
    this.trace('fieldtypeModule()', context);
    if (this.debug.FieldtypeModule) debugger;
    if (context.results.length != 1) {
        // TODO integrate this module with comparison/index.js.
        //this.writeException('more than one module ' + context);
    }
    return Promise.map(context.results, row => this.db.modulesIDs[row.data]);
}

Page.prototype.fieldtypePadNotes = function(context) {
    this.trace('fieldtypePadNotes()', context);
    if (this.debug.FieldtypePadNotes) debugger;
    let results = context.results;

    results.sort((a, b) => a.sort - b.sort);

    return Promise.map(results, row => {
        return {data: row.data, notes: row.notes}
    });
}

//
// fieldtypePage(context)
//
// context.pages_id - unused except for trace
// context.fields_id - unused except for trace
// context.results - each rows 'data' property is used as a page ID
//                   in a call to resolveFields().
//
Page.prototype.fieldtypePage = function(context) {
    this.trace('fieldtypePage()', context);
    if (this.debug.FieldtypePage) debugger;
    let {pages_id, fields_id, results} = context;

    let fieldgroups_id = this.db.pagesIDs[pages_id]['t.fieldgroups_id'];
    let fields = this.db.fgf.getRecords(fieldgroups_id);
    this.trace('fieldtypePage()', {fields: fields.map(f => f.field_name)});

    return Promise.map(results, row => {
        return this.resolveFields(row.data);
    }).then(results => {
        this.trace('fieldtypePage() returns => ' + results);
        return results;
    })
}

//
// fieldtypePageTable(context)
//
// context.pages_id - unused
// context.fields_id = unused
// context.results - each row's 'data' property is used as a page ID
//                   in a call to resolveFields().
//
Page.prototype.fieldtypePageTable = function(context) {
    this.trace('fieldtypePageTable()', context);
    if (this.debug.FieldtypePageTable) debugger;
    let {pages_id, fields_id, results} = context;

    // TODO sort rows?
    return Promise.map(results, row => {
        return this.resolveFields(row.data);
    }).then(results => {
        context.results = results;
        this.trace('fieldtypePageTable() => ', context);
        return results;
    });
}

//
// fieldtypeRepeater(context)
//
// context.pages_id - unused
// context.fields_id - unused (artifact code left)
// context.results - the 'data' property is a comma-separated list
//                   of page IDs. It is split and each is used in a
//                   call to resolveFields().
//
Page.prototype.fieldtypeRepeater = function(context) {
    this.trace('fieldtypeRepeater()', context);
    if (this.debug.FieldtypeRepeater) debugger;
    let {pages_id, fields_id, results} = context;
    let field = this.db.fieldsIDs[context.fields_id];

    let repeaterFieldsIDs = field.data.repeaterFields;
    let repeaterPagesIDs = results[0].data.split(',').map(text => parseInt(text));

    return Promise.map(repeaterPagesIDs, pages_id => {
        return this.resolveFields(pages_id);
    })
}

//
// these Fieldtypes are indirect, i.e., they do not contain a simple value.
// in most cases they contain a page reference which then must be resolved
// (possibly more than one level) to get to a simple value.
//
// in some cases, e.g., FieldtypeFile, the data is not actually indirect but
// is not a standard simple value.
//
Page.prototype.indirectTypes = {
    // TODO this.fieldtypeRepeater, seems I can insert the functions themselves.
    FieldtypeFile: 'File',
    FieldtypeMatrix: 'Matrix',        // not in our DB at this time
    FieldtypeModule: 'Module',
    FieldtypePadNotes: 'PadNotes',
    FieldtypePage: 'Page',
    FieldtypePageTable: 'PageTable',
    FieldtypeRepeater: 'Repeater',
}

module.exports = PageFieldsFactory;

//
// simple test
//
if (require.main === module) {
    debugger;
}

