'use strict';

const Promise = require('bluebird');

//
// Generate sets of keys that are in source and target objects. The keys are
// interpreted as indexes that can be used to match their contents across source
// and target.
//
function generateSets(s, t) {
    let sourceKeys = new Set(Object.keys(s));
    let targetKeys = new Set(Object.keys(t));

    return {
        inBoth: intersection(sourceKeys, targetKeys),
        inSource: difference(sourceKeys, targetKeys),
        inTarget: difference(targetKeys, sourceKeys)
    };
}

function intersection(a, b) {
    return new Set([...a].filter(x => b.has(x)));
}

function difference(a, b) {
    return new Set([...a].filter(x => !b.has(x)));
}

function union(a, b) {
    return new Set([...a, ...b]);
}

function bucketize(differences) {
    let buckets = {
        inSource: [],
        inBoth: [],
        inTarget: []
    }

    for (let key in differences) {
        if (differences[key].s && differences[key].t) {
            buckets.inBoth.push(key);
        } else if (differences[key].s) {
            buckets.inSource.push(key);
        } else {
            buckets.inTarget.push(key);
        }
    }
    return buckets;
}

function JSONtoObject(row, fields) {
    if (!Array.isArray(fields)) {
        fields = [fields];
    }
    fields.forEach(f => {
        row[f] = JSON.parse(row[f] && row[f].length ? row[f] : '{}');
    })
}

// given a source record and a target record compare them field by field
// ignoring keys specifed in the argument ignoreKeys (a Set).
// ignore is 'modified' by default.
function getDifferences(sourceRec, targetRec, keysToIgnore) {
    if (!keysToIgnore) {
        keysToIgnore = new Set(['modified']);
    } else {
        // TODO - should this add 'modified'?
        keysToIgnore = keysToIgnore.add('modified');
    }
    let differences = {};
    let sets = generateSets(sourceRec, targetRec);

    // differences for those only in source or target are the entire record
    sets.inSource.forEach(key => {
        differences[key] = {s: sourceRec[key], t: null};
    })
    sets.inTarget.forEach(key => {
        differences[key] = {s: null, t: targetRec[key]};
    })

    // now detect differences for those that are in both source and target
    sets.inBoth.forEach(key => {
        // if they are the same nothing to do
        if (sourceRec[key] === targetRec[key]) {
            return;
        }
        // ignore key if requested
        if (keysToIgnore.has(key)) {
            return;
        }
        // if it's an array make sure the lengths are the same then compare.
        if (Array.isArray(sourceRec[key]) && Array.isArray(targetRec[key])) {
            if (sourceRec[key].length !== targetRec[key].length) {
                differences[key] = {s: sourceRec[key], t: targetRec[key]};
                return;
            }
            for (let i = 0, len = sourceRec[key].length; i < len; i++) {
                if (sourceRec[key][i] !== targetRec[key][i]) {
                    differences[key] = {s: sourceRec[key], t: targetRec[key]};
                    return;
                }
            }
        } else if (typeof sourceRec[key] === 'object' && typeof targetRec[key] === 'object') {
            let subDifferences = getDifferences(sourceRec[key], targetRec[key]);
            if (subDifferences) {
                differences[key] = subDifferences;
            }
        } else {
            // it's just not equal
            differences[key] = {s: sourceRec[key], t: targetRec[key]};
        }
    })

    if (Object.keys(differences).length) {
        return differences;
    } else {
        return null;
    }
}

// bluebird.js-Promise-dependent implementation of a Promise-based
// while loop.
let promisewhile = Promise.method((test, action) => {
    if (!test()) {
        return;
    }
    return action().then(promisewhile.bind(this, test, action));
})

// Don't export the following for now - they aren't used. But they seem like they might
// be useful.

/*
function equalArrays(a1, a2) {
    if (!Array.isArray(a1) || !Array.isArray(a2)) {
        return false;
    }
    if (a1.length !== a2.length) {
        return false;
    }
    for (let i = 0, len = a1.length; i < len; i++) {
        if (a1[i] instanceof Array && a2[i] instanceof Array) {
            if (!equalArrays(a1[i], a2[i])) {
                return false;
            }
        } else if (a1[i] != a2[i]) {
            return false
        }
    }
    return true;
}

function equals(o1, o2) {
    if (o1 === o2) return true;
    if (o1 === null || o2 === null) return false;
    if (o1 !== o1 && o2 !== o2) return true; // NaN === NaN
    var t1 = typeof o1, t2 = typeof o2, length, key, keySet;
    if (t1 == t2) {
        if (t1 == 'object') {
            if (isArray(o1)) {
                if (!isArray(o2)) return false;
                if ((length = o1.length) == o2.length) {
                for(key=0; key<length; key++) {
                    if (!equals(o1[key], o2[key])) return false;
                }
                return true;
                }
            } else if (isDate(o1)) {
                return isDate(o2) && o1.getTime() == o2.getTime();
            } else if (isRegExp(o1) && isRegExp(o2)) {
                return o1.toString() == o2.toString();
            } else {
                if (isScope(o1) || isScope(o2) || isWindow(o1) || isWindow(o2) || isArray(o2)) return false;
                keySet = {};
                for(key in o1) {
                if (key.charAt(0) === '$' || isFunction(o1[key])) continue;
                if (!equals(o1[key], o2[key])) return false;
                keySet[key] = true;
                }
                for(key in o2) {
                if (!keySet.hasOwnProperty(key) &&
                    key.charAt(0) !== '$' &&
                    o2[key] !== undefined &&
                    !isFunction(o2[key])) return false;
                }
                return true;
            }
        }
    }
    return false;
}
// */

module.exports = {
    generateSets,
    intersection,
    difference,
    union,
    bucketize,
    JSONtoObject,
    getDifferences,
    promisewhile
};
