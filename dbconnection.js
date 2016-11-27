//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

const mysql = require('mysql');
const Promise = require('bluebird');

let required = ['host', 'user', 'password', 'database'];

function Connection(settings) {
    if (!required.every(p => settings.hasOwnProperty(p))) {
        throw "Missing required setting";
    }
    this.host = settings.host;
    this.user = settings.user;
    this.db = settings.database;

    this.conn = mysql.createConnection({
        host: settings.host,
        user: settings.user,
        password: settings.password,
        database: settings.database
    });
}

Connection.prototype.query = function(query, options) {
    options = options ? options : {};
    let context = options.context;
    var p = new Promise((resolve, reject) => {
        this.conn.query(query, (err, rows, fields) => {
            // get rid of the RowDataPacket wrapper
            if (rows) {
                rows = rows.map(r => Object.assign({}, r));
            }
            // resolve with appropriate results
            if (err) {
                let error = {err, query, context};
                reject(error);
            } else if (options.rowsOnly) {
                resolve(rows);
            } else {
                let value = {rows};
                if (options.fields) {
                    value.fields = fields;
                }
                if (options.context) {
                    value.context = context;
                }
                resolve(value);
            }
        });
    });
    return p;
}

Connection.prototype.close = function() {
    var p = new Promise((resolve, reject) => {
        this.conn.end(err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        })
    })
    return p;
}


//
// get DB table definitions
//
Connection.prototype.getTableDescs = function(options) {
    let tableDefinitions = {};

    return this.getTableNames().then(tables => {
        // array of the promises returned by queries
        let tableQueries = [];
        // store each result's rows in tableDefinitions as queries complete.
        let fn = tablename => {
            return this.query('desc ' + tablename).then(results => {
                tableDefinitions[tablename] = results;
            });
        };

        // request the description of each table.
        tables.forEach(tablename => {
            tableQueries.push(fn(tablename));
        })

        // done when they have all completed.
        return Promise.all(tableQueries).then(results => tableDefinitions);
    })

}

//
// get DB table names
//
Connection.prototype.getTableNames = function(options) {
    // helper function to remove the DB-specific 'Tables_in_' prefix
    let getTableName = rdp => rdp['Tables_in_' + this.db];

    var executeShowTables = () => {
        return this.query('show tables').then(result =>
            result.rows.map(getTableName)
        );
    }
    return executeShowTables();
}

Connection.tableDefinitionsAreEqual = function(d1, d2) {
    let descFields = ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'];

    // was a field added or removed from the table definition?
    if (d1.length !== d2.length) {
        return false;
    }

    for (let r = 0, nrows = d1.length; r < nrows; r++) {
        for (let i = 0, len = descFields.length; i < len; i++) {
            if (d1.rows[r][descFields[i]] !== d2.rows[r][descFields[i]]) {
                return false;
            }
        }
    }
    return true;
}

Connection.getDatabases = function (settings) {
    let required = ['host', 'user', 'password'];

    let conn = mysql.createConnection({
        host: settings.host,
        user: settings.user,
        password: settings.password
    });

    var p = new Promise((resolve, reject) => {
        conn.query('show databases', (err, rows, fields) => {
            // get rid of the {Database: } wrapper
            if (rows) {
                rows = rows.map(r => r.Database);
            }
            conn.end(err => null);
            // resolve with appropriate results
            if (err) {
                let error = {err};
                reject(error);
            } else {
                resolve(rows);
            }
        });
    });
    return p;
}


module.exports = Connection;

if (require.main === module) {
    let settings = {host: 'localhost', user: 'admin', password: ''};
    debugger;
    Connection.getDatabases(settings).then(r => {
        console.log(r);
    });

}