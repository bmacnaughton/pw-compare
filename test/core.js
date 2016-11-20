'use strict';

//
// this module tests the fs level stream and buffer processing that underlie
// gulp file streams.
//

var PWDB = require('../pwdb');
var should = require('should');
var assert = require('assert');

// run a buffer/stream-independent test
runCoreTest();


//
// run core tests to make sure the constructor works and markers are added correctly
//
function runCoreTest() {
    let dbName = "whale_staging";
    var db = new PWDB({database: dbName});

    describe('core tests', function () {
        it('should find the right number of tables', function (done) {
            var expectedTables = [
                'caches',
                'field_email',
                'field_pass',
                'field_permissions',
                'field_process',
                'field_roles',
                'field_title',
                'fieldgroups',
                'fieldgroups_fields',
                'fields',
                'modules',
                'pages',
                'pages_access',
                'pages_parents',
                'pages_sortfields',
                'session_login_throttle',
                'templates'
            ];

            let p1 = db.query('show tables').then(r => {
                return r.rows.map(row => {
                    return row['Tables_in_' + dbName]
                });
            });


            let p2 = db.getTableDescs().then(tableDescs => {
                return Object.getOwnPropertyNames(tableDescs);
            });

            Promise.all([p1, p2]).then(results => {
                let rawTables = results[0];
                let getTables = results[1];
                rawTables.should.deepEqual(expectedTables);
                getTables.should.deepEqual(expectedTables);
                done();

            })
        });
    });
}
