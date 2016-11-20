'use strict';

//
// create buckets keyed by keys specified at construction time.
//

//
// create a Keyed Buckets object.
//
// keys - a string or array of strings of the keys for ordering the tree.
// opts - object with options
//     opts.objects - object or array of objects to be added to the KeyedBuckets.
//
// uncommenting the test and running this as a standalone executable provides some examples.
function KeyedBuckets(keys, opts) {
    if (!Array.isArray(keys)) {
        keys = [keys];
    }
    this.keys = keys;
    this.hash = {};

    opts = opts ? opts : {};

    if (opts.objects) {
        this.addObjects(opts.objects);
    }
}

//
// add objects to the buckets defined by this.keys
//
KeyedBuckets.prototype.addObjects = function(obj) {
    if (!Array.isArray(obj)) {
        obj = [obj];
    }
    // add each object
    obj.forEach(o => {
        // for each key walk through the object and add to the tree
        let hash = this.hash;
        let n = this.keys.length - 1;
        for (let i = 0; i < n; i++) {
            if (!hash[o[this.keys[i]]]) {
                hash[o[this.keys[i]]] = {};
            }
            hash = hash[o[this.keys[i]]];
        }
        // is there already an array of matches for these keys?
        if (!hash[o[this.keys[n]]]) {
            hash[o[this.keys[n]]] = [];
        }
        hash[o[this.keys[n]]].push(o);
    })
}

KeyedBuckets.prototype.getKeys = function() {
    return [...this.iterator()].map(r => r.key);
}

KeyedBuckets.prototype.getRecords = function(key) {
    if (!Array.isArray(key)) {
        key = [key];
    }
    if (this.keys.length < key.length) {
        throw "getRecords(key) - key longer than defined keys: " + key;
    }
    let len = key.length;
    let hash = this.hash;
    for (let i = 0; i < len; i++) {
        hash = hash[key[i]];
        if (!hash) {
            return null;
        }
    }
    return hash;
}

KeyedBuckets.prototype.iterator = function* () {
    // use the number of keys to recognize the leaves.
    let i = this.keys.length - 1;
    let hash = this.hash;
    let values = Object.keys(hash);

    var keystack = [];

    function* nextValue(key) {
        if (i === 0) {
            yield {key: keystack.slice(), records: hash[key]};
        } else {
            let previousHash = hash;
            hash = hash[key];
            i -= 1;
            for (let k of Object.keys(hash)) {
                keystack.push(k);
                yield* nextValue(k);
                keystack.pop();
            }
            i += 1;
            hash = previousHash;
        }
    }

    for (let k of Object.keys(this.hash)) {
        keystack.push(k);
        yield* nextValue(k);
        keystack.pop();
    }
}

KeyedBuckets.prototype.groupBy = function(key) {
    let groups = {};
    let index = this.keys.indexOf(key);
    if (index < 0) {
        throw "key: " + key + " not in KeyedBuckets keys";
    }
    for (let item of this.iterator()) {
        groups[item.key[index]] = item.records;
    }
    return groups;
}

module.exports = KeyedBuckets;

//*
// test
// if this is run via command line as opposed to via require() then execute the test.
if (require.main === module) {
    var oh = new KeyedBuckets(['name']);

    oh.addObjects({name:'bruce', born: 'dallas', year: 1954});
    oh.addObjects({name:'bruce', born: 'dallas', year: 1955});
    oh.addObjects({name:'bruce', born: 'marvel', year: 1960})
    oh.addObjects({name:'wenxin', born: 'hohhut', year: 1962});
    oh.addObjects({name:'grace', born: 'palo alto', year: 2003});
    oh.addObjects({name:'heihei', born: 'campbell', year:2009});
    oh.addObjects({name:'tess', born: 'berkeley', year:2015});

    console.log('LOOP OH');
    var gen = oh.iterator();
    var result = gen.next();
    while (!result.done) {
        console.log(result.value);
        result = gen.next();
    }

    // expected output:
    //    { key: [ 'bruce' ],
    //      records:
    //       [ { name: 'bruce', born: 'dallas', year: 1954 },
    //         { name: 'bruce', born: 'dallas', year: 1955 },
    //         { name: 'bruce', born: 'marvel', year: 1960 } ] }
    //    { key: [ 'wenxin' ],
    //      records: [ { name: 'wenxin', born: 'hohhut', year: 1962 } ] }
    //    { key: [ 'grace' ],
    //      records: [ { name: 'grace', born: 'palo alto', year: 2003 } ] }
    //    { key: [ 'heihei' ],
    //      records: [ { name: 'heihei', born: 'campbell', year: 2009 } ] }
    //    { key: [ 'tess' ],
    //      records: [ { name: 'tess', born: 'berkeley', year: 2015 } ] }


    var recs = [
        {name:'bruce', born: 'dallas', year: 1954},
        {name:'bruce', born: 'dallas', year: 1955},
        {name:'bruce', born: 'marvel', year: 1960},
        {name:'wenxin', born: 'hohhut', year: 1962},
        {name:'grace', born: 'palo alto', year: 2003},
        {name:'heihei', born: 'campbell', year:2009},
        {name:'tess', born: 'berkeley', year:2015},
    ];
    var ot = new KeyedBuckets(['name', 'born'], {objects: recs});

    console.log('GETTING RECORDS with KEY BEFORE DUPS [bruce, dallas]');
    console.log(ot.getRecords(['bruce', 'dallas']));


    ot.addObjects([
        {name:'bruce', born: 'dallas', year: 1954},
        {name:'bruce', born: 'dallas', year: 1955},
        {name:'bruce', born: 'marvel', year: 1960},
        {name:'wenxin', born: 'hohhut', year: 1962},
        {name:'grace', born: 'palo alto', year: 2003},
        {name:'heihei', born: 'campbell', year:2009},
        {name:'tess', born: 'berkeley', year:2015},
    ]);

    console.log('CONSOLE.LOG OT');
    console.log(ot.hash);
    console.log(ot.getKeys());
    console.log('GETTING RECORDS with KEY [bruce, dallas]');
    console.log(ot.getRecords(['bruce', 'dallas']));


    console.log('LOOP OT');
    gen = ot.iterator(['name', 'born']);
    result = gen.next();
    while (!result.done) {
        console.log(result.value);
        result = gen.next();
    }

    console.log('SPREAD OH');
    console.log(JSON.stringify([...oh.iterator()]));
}
// */