# ProcessWire DB Compare

This program allows the comparison of two ProcessWire databases.

## Why?

When the production database allows the creation of pages then it is not possible to apply a dump of a development database because page numbers will not match.

This program was designed to compare the development version of a ProcessWire database (the source) to a production version of a ProcessWire database (the target).

## What it does.

It outputs a summary of the differences to the console; if there are few changes this is probably all that is needed.

With `-w` it also writes detailed logs to the `logs/` directory in which pw-compare is run in addition to writing the console log to the file `logs/console`.

Longer-term I'd like to have pw-compare write script files that can be used by ProcessWire native code (like LostKobrakai's [migrations module](https://processwire.com/talk/topic/13045-migrations/)) to apply the changes to the target database.

## How to install

`pw-compare` requires nodejs version 6.2 or better. It was developed using v6.2.1 because arrow functions really help. If you're not running that version of node I suggest using [nvm](https://github.com/creationix/nvm). It makes it easy to run multiple versions of node.

First clone the repository using either SSH or HTTPS.
```
$ git clone git@github.com:bmacnaughton/pw-compare.git
```
or
```
$ git clone https://github.com/bmacnaughton/pw-compare.git
```

Then run `npm install` to download the node dependencies specified in package.json.
```
$ npm install
```

## Getting started

The database settings are configured by editing `db-settings.json`. They map directly to the [msqljs](https://github.com/mysqljs/mysql) settings.

To run

```
$ node pw-compare
```

```
It's possible to set the name of the source and target database on the command line for quick changes.

Options:
  --source, -s     source database name                       [default: "whale"]
  --target, -t     target database name               [default: "whale_testing"]
  --showall, -a    show identical elements in addition to different elements
                                                                [default: false]
  --write, -w      write util.inspect format files for each section
                                                                [default: false]
  --noconsole, -n  do not write normal output to the console    [default: false]
  --append, -A     do not delete logs/memory at the start, append to the file
                                                                [default: false]
  --debug, -d      hit breakpoints at beginning and end         [default: false]
  --help, -h       Show help                                           [boolean]
```

## Caveats

1. This has only been tested on a single DB we're working on. That database uses the Padloper store add-on and a number of other add-ons but certainly doesn't exercise everything in and available with ProcessWire.

2. It does not support FieldtypeMatrix. We don't use it and I haven't created one to see how it is stored.

3. Testing has been manual to this point - it doesn't have a test suite.

4. Pages to ignore are hardcoded in the `comparison/pages.js` module at this time. I'll move it to an external JSON file at some point.

5. Output could be improved - now all field values are output for a page even if only a single field value changes.

6. It's early in the life cycle. Not every error condition is tested and/or handled in a production fashion. But it doesn't ever write to the databases, so no harm should come of it. I'm releasing it to see what level of need there is for this.

## More details

pw-compare's logic flow:

1) compare tables and their definitions, output comparison

2) compare modules and their definitions, output comparison

3) compare fields and their definitions, output comparison

4) compare templates and their definitions, output comparison

5) compare pages and their definitions then the field values on the page. this is a bit tricky because pages can move, names can be duplicated at different places in the tree, etc. so the code reconstructs full paths and compares based on matching those. Output comparison.

