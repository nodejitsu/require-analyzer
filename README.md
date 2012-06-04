# require-analyzer

Determine dependencies for a given node.js file, directory tree, or module in code or on the command line

# Status
[![Build Status](https://secure.travis-ci.org/nodejitsu/require-analyzer.png)](http://travis-ci.org/nodejitsu/require-analyzer)

## Installation

### Installing npm (node package manager)
<pre>
  curl http://npmjs.org/install.sh | sh
</pre>

### Installing require-analyzer
<pre>
  [sudo] npm install require-analyzer
</pre>
NOTE: If you're using `npm >= 1.0` then you need to add the `-g` parameter to install `require-analyzer` globally.

## Usage
There are two distinct ways to use the `require-analyzer` library: from the command line or through code. The command line tool is designed to work with `package.json` files so make sure that you have created one for your project first. Checkout [jitsu][0] for a quick and easy way to create a package.json.

For more information read our blog post at [blog.nodejitsu.com][1].

### Command-line usage
Using require-analyzer from the command line is easy. The binary will attempt to read the `package.json` file in the current directory, then analyze the dependencies and cross reference the result. 
<pre>
  $ require-analyzer --help
  usage: require-analyzer [options] [directory]

  Analyzes the node.js requirements for the target directory. If no directory
  is supplied then the current directory is used

  options:
    --update     Update versions for existing dependencies
    -h, --help   You're staring at it
</pre>

Here's a sample of `require-analyzer` analyzing it's own dependencies:
<pre>
  $ require-analyzer
  info:  require-analyzer starting in /Users/Charlie/Nodejitsu/require-analyzer
  warn:  No dependencies found
  info:  Analyzing dependencies...
  info:  Done analyzing raw dependencies
  info:  Retrieved packages from npm
  info:  Additional dependencies found
  data:  {
  data:    findit: '>= 0.0.3',
  data:    npm: '>= 0.3.18'
  data:  }
  info:  Updating /Users/Charlie/Nodejitsu/require-analyzer/package.json
  info:  require-analyzer updated package.json dependencies
</pre>

### Programmatic usage
The easiest way to use `require-analyzer` programmatically is through the `.analyze()` method. This method will use `fs.stat()` on the path supplied and attempt one of three options:

1. If it is a directory that has a package.json, analyze `require` statements from `package.main`
2. If it is a directory with no package.json analyze every `.js` or `.coffee` file in the directory tree 
3. If it is a file, then analyze `require` statements from that individual file.

Lets dive into a quick sample usage:

```javascript
  var analyzer = require('require-analyzer');
  
  var options = {
    target: 'path/to/your/dependency' // e.g /Users/some-user/your-package
    reduce: true
  };
  
  var deps = analyzer.analyze(options, function (err, pkgs) {
    //
    // Log all packages that were discovered
    //
    console.dir(pkgs);
  });
  
  //
  // The call the `.analyze()` returns an `EventEmitter` which outputs
  // data at various stages of the analysis operation.
  //
  deps.on('dependencies', function (raw) {
    //
    // Log the raw list of dependencies (no versions)
    //
    console.dir(raw);
  });
  
  deps.on('search', function (pkgs) {
    //
    // Log the results from the npm search operation with the current
    // active version for each dependency
    //
    console.dir(pkgs);
  });
  
  deps.on('reduce', function (reduced) {
    //
    // Logs the dependencies after they have been cross-referenced with 
    // sibling dependencies. (i.e. if 'foo' requires 'bar', 'bar' will be removed).
    //
    console.dir(reduced);
  });
```

### Further analyzing dependencies
Sometimes when dealing with dependencies it is necessary to further analyze the dependencies that are returned. `require-analyzer` has a convenience method for doing just this:

```javascript
  var analyzer = require('require-analyzer');
  
  var current = {
    'foo': '>= 0.1.0'
  };
  
  var updated = {
    'foo': '>= 0.2.0',
    'bar': '>= 0.1.0'
  };
  
  var updates = analyzer.updates(current, updated);
  
  //
  // This will return an object literal with the differential
  // updates between the two sets of dependencies:
  //
  // {
  //   added: { 'bar': '>= 0.1.0' },
  //   updated: { 'foo': '>= 0.2.0' }
  // }
  //
```

## Tests
<pre>
  npm test
</pre>

#### Author: [Charlie Robbins][2]

[0]: http://github.com/nodejitsu/jitsu
[1]: http://blog.nodejitsu.com/analyze-nodejs-dependencies-like-magic
[2]: http://nodejitsu.com