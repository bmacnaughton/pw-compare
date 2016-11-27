//
// ProcessWire Database Compare
//
// Copyright 2016, Bruce A. MacNaughton
//
'use strict';

DBConnection = require('./dbconnection');

//
// Processwire DB Constructor. Very thin layer.
//
function PWDB(settings) {
    settings = Object.assign({}, settings);

    DBConnection.call(this, settings);
    this.settings = settings;
}

PWDB.prototype = Object.create(DBConnection.prototype);
PWDB.prototype.constructor = PWDB;

//
// Class functions
//
PWDB.isFieldTable = tablename => {
    const len = 'field_'.length;
    return tablename.substring(0, len) === 'field_';
}

PWDB.getDatabases = function(settings) {
    settings = settings || {};
    settings = {
        host: settings.host || 'localhost',
        user: settings.user || 'admin',
        password: settings.password || 'pwwadmin'
    }
    return DBConnection.getDatabases(settings);
}

// propagate "class" function
PWDB.tableDefinitionsAreEqual = DBConnection.tableDefinitionsAreEqual;

module.exports = PWDB;
