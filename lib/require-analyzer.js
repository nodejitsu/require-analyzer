/*
 * require-analyzer.js: Determine dependencies for a given node.js file, directory tree, or module.
 *
 * (C) 2010, Nodejitsu Inc.
 *
 */

var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    path = require('path'),
    events = require('events'),
    spawn = require('child_process').spawn,
    npm = require('npm'),
    npmout = require('npm/lib/utils/output'),
    semver = require('semver'),
    findit = require('findit');

var analyzer = exports,
    _write = npmout.write;

//
// Create the list of `core` node.js modules for referencing later.
// Map the array of all `core` modules into an object for easy access.
//
var core = {};
Object.keys(process.binding('natives')).forEach(function (mod) {
 core[mod] = true;
});

//
// ### function analyze (options, callback)
// #### @options {Object} Options to analyze against
// #### @callback {function} Continuation to respond to when complete.
// Calls the appropriate `require-analyzer` method based on the result
// from `fs.stats()` on `options.target`. When dependencies are returned,
// `npmAnalyze()` is called with `options` and the resulting object is 
// returned to `callback`. Also returns an event emitter which outputs
// data at various stages of completion with events:
//
//     dependencies: Results from .dir(), .package(), or .file()
//     search: Results from initial npm search in .npmAnalyze()
//     reduce: Results from .npmAnalyze() if options.reduce is true.
//
analyzer.analyze = function (options, callback) {
  var emitter = new events.EventEmitter();
  
  if (!options || !options.target) {
    //
    // If there are no `options` and no `options.target` property
    // respond with the appropriate error.
    //
    callback(new Error('options and options.target are required'));
    return emitter;
  }
  
  //
  // Stat the directory and call the appropriate method
  // on `analyzer`.
  //
  fs.stat(options.target, function (err, stats) {
    if (err) {
      return callback(err);
    }
    
    var analyzeFn;
    if (stats.isDirectory()) {
      analyzeFn = analyzer.dir;
    }
    else if (stats.isFile()) {
      analyzeFn = analyzer.file;
    }
    else {
      return callback(new Error(target + ' is not a file or a directory.'));
    }
    
    analyzeFn.call(null, options, function (err, deps) {
      if (err) {
        return callback(err);
      }
      
      // Emit the `dependencies` event for streaming results.
      emitter.emit('dependencies', deps);
      
      if (options.npm === false) {
        return callback(null, deps);
      }
      
      var npmEmitter = analyzer.npmAnalyze(deps, options, callback);
      
      //
      // Re-emit the `search` and `reduce` events from the `npmEmitter`
      // for streaming results.
      //
      ['search', 'reduce'].forEach(function (ev) {
        npmEmitter.on(ev, function () {
          var args = Array.prototype.slice.call(arguments);
          args.unshift(ev);
          emitter.emit.apply(emitter, args);
        });
      });
    });
  });
  
  return emitter;
};

//
// ### function npmAnalyze (deps, options, callback) 
// #### @deps {Array} List of dependencies to analyze.
// #### @options {Object} Set of options to analyze with.
// #### @callback {function} Continuation to respond to when complete.
// Analyzes the list of dependencies using `npm`, consumes the options:
//
//     options.reduce: Will remove deps consumed by sibling deps
//
analyzer.npmAnalyze = function (deps, options, callback) {
  var emitter = new events.EventEmitter(),
      pkgs = {};
  
  //
  // Setup npm options
  // 
  options.npm = { exit: false };
  
  //
  // Monkey patch `npmout.write()` so that we don't need log or out files
  //
  npmout.write = function () {
    var args = Array.prototype.slice.call(arguments),
        callback;

    args.forEach(function (arg) {
      if (typeof arg === 'function') {
        callback = arg;
      }
    });

    callback();
  };
  
  npm.load(options.npm, function (err) {
    if (err) {
      return callback(err);
    }
    
    //
    // Analyze dependencies by searching for all installed locally via npm. 
    // Then see if it depends on any other dependencies that are in the
    // list so those dependencies may be removed (only if `options.reduce` is set).
    //
    npm.commands.search(['active', 'installed'], function (err, results) {
      if (err) {
        return callback(err);
      }
      
      Object.keys(results).forEach(function (result) {
        var parts = result.split('@'),
            pkg = parts[0],
            version = parts[1];
            
        if (deps.indexOf(pkg) !== -1) {
          pkgs[pkg] = results[result].data.versions[version];
        }
      });
      
      emitter.emit('search', pkgs);
      if (!options.reduce) {
        npmout.write = _write;
        return callback(null, pkgs);
      }
      
      var reduced = analyzer.merge({}, pkgs),
          suspect = {};
          
      deps.forEach(function (dep) {
        if (pkgs[dep] && pkgs[dep].dependencies) {
          Object.keys(pkgs[dep].dependencies).forEach(function (cdep) {
            if (reduced[cdep]) {
              suspect[cdep] = pkgs[cdep];
              delete reduced[cdep];
            }
          });
        }
      });
      
      emitter.emit('reduce', reduced, suspect);
      npmout.write = _write;
      callback(null, reduced, suspect);
    });
  });
  
  return emitter;
};

//
// ### function package (dir, callback)
// #### @dir {string} Parent directory to analyze
// #### @callback {function} Continuation to respond to when complete.
// Checks for the existance of a package.json in the specified `dir`
// running `analyzer.package()` if it exists. Otherwise attempts to run
// `analyzer.file()` on all files in the source tree.
//
analyzer.dir = function (options, callback) {
  //
  // Read the target directory 
  //
  fs.readdir(options.target, function (err, files) {
    if (err) {
      return callback(err);
    }
    
    //
    // If there is a package.json in the directory
    // then analyze the require(s) based on `package.main`
    //
    if (files.indexOf('package.json') !== -1) {
      return analyzer.package(options, callback);
    }
    
    //
    // Otherwise find all files in the directory tree
    // and attempt to run `analyzer.file()` on each of them
    // in parallel.
    //
    var files = [],
        done = [],
        packages = {},
        traversed = false,
        finder = findit.find(options.target);
    
    function onRequired () {
      //
      // Respond to the `callback` if all files have been traversed
      // and all files have been executed via `analyzer.file()`
      //
      if (traversed && files.length === done.length) {
        callback(null, Object.keys(packages));
      }
    }
     
    finder.on('file', function (file) {
      //
      // If the file is not `.js` or `.coffee` do no analyze it
      //
      var ext = path.extname(file),
          clone = analyzer.merge({}, options);
          
      if (ext !== '.js' && ext !== '.coffee') {
        return;
      }
      
      files.push(file);
      
      clone.target = file;
      analyzer.file(clone, function (err, deps) {
        deps.forEach(function (dep) {
          packages[dep] = true;
        });
        
        done.push(file);
        onRequired();
      });
    });
    
    finder.on('end', function () {
      traversed = true;
      onRequired();
    });
  });
};

//
// ### function package (dir, callback)
// #### @dir {string} Parent path of the package.json to analyze
// #### @callback {function} Continuation to respond to when complete.
// Attempts to read the package.json in the specified `dir` and then analyzes
// the require statements in the script located at `package.main`
//
analyzer.package = function (options, callback) {
  //
  // Attempt to read the package.json in the current directory 
  //
  fs.readFile(path.join(options.target, 'package.json'), function (err, pkg) {
    if (err) {
      return callback(err);
    }

    try {
      //
      // Attempt to read the package.json data.
      //
      pkg = JSON.parse(pkg.toString());
      
      //
      // TODO (indexzero): Support more than `main`
      //
      if (!pkg.main) {
        return callback(new Error('package.json must have a `main` property.'));
      }
      
      //
      // Analyze the require(s) based on the `main` property of the package.json
      //
      options.target = path.join(options.target, path.normalize(pkg.main));
      analyzer.file(options, function (err, deps) {
        deps = deps.filter(function (d) { return d !== pkg.name });
        callback(null, deps);
      });
    }
    catch (ex) {
      return callback(ex);
    }
  });
};

//
// ### function file (file, callback) 
// #### @file {string} Path of the node script to analyze
// #### @callback {callback} Continuation to respond to when complete.
// Attempts to find the packages required by the node script located at
// `file` by spawning an instance of the `find-dependencies` helper
// script and parsing the output.
//
analyzer.file = function (options, callback) {
  //
  // Spawn the `find-dependencies` bin helper to ensure that we are able to 
  // bypass any modules which have already been required in the current process. 
  //
  var packages = {},
      merged = {},
      deps = spawn('node', [path.join(__dirname, '..', 'bin', 'find-dependencies'), options.target]);
  
  deps.stdout.on('data', function (data) {
    //
    // For each line of data output from the child process remove empty 
    // lines and then add the specified packages to list of known packages.
    //
    data = data.toString();
    if (data !== '') {
      data.toString().split('\n').filter(function (line) {
        return line !== '';
      }).forEach(function (dep) {
        packages[dep] = true;
      });
    }
  });

  if (options.timeout) {
    //
    // If a timeout has been set then exit the 
    // process after the specified timespan
    //
    setTimeout(function () {
      deps.kill();
    }, options.timeout);
  }
  
  deps.on('exit', function () {
    //
    // When the process is complete remove any `core` node.js packages
    // (i.e. packages in `process.bindings('natives')`) and any packages
    // which are required with a relative directory (i.e. `require('./package')`). 
    //
    // Include any packages which may be of the form `require('package/relative/dir')`
    // because those relative directories are still supported by npm:
    // e.g.: `require('socket.io/lib/socket.io/utils')`.
    //
    Object.keys(packages).filter(function (pkg) {
      return pkg[0] !== '.' && pkg[0] !== '/' && !core[pkg];
    }).map(function (pkg) {
      return pkg.split('/')[0];
    }).forEach(function (pkg) {
      merged[pkg] = true;
    });
    
    return callback(null, Object.keys(merged));
  });
};

//
// ### function (target [arg1, arg2, ...])
// #### @target {Object} Object to merge into
// Merges all properties in `arg1 ... argn` 
// into the `target` object.
//
analyzer.merge = function (target) {
  var objs = Array.prototype.slice.call(arguments, 1);
  objs.forEach(function(o) {
    Object.keys(o).forEach(function (attr) {
      if (! o.__lookupGetter__(attr)) {
        target[attr] = o[attr];
      }
    });
  });
  
  return target;
};

//
// ### function extractVersions (dependencies)
// #### @dependencies {Object} Set of dependencies to transform
// Transforms the `dependencies` object into the format that
// package.json files accept.
//
analyzer.extractVersions = function (dependencies) {
  var all = {};

  Object.keys(dependencies).forEach(function (pkg) {
    all[pkg] = '>= ' + dependencies[pkg].version;
  });
  
  return all;
}

//
// ### function updates (current, updated)
// #### @current {Object} Current dependencies
// #### @updated {Object} Updated dependencies
// Compares the `current` dependencies against the 
// `updated` dependencies and returns an object 
// with the differences
//
//     {
//       added: { /* Intersection of updated / current */ }
//       updated: { /* Union of updated / current with new versions */ }
//     }
//
analyzer.updates = function (current, updated) {
  var updates = {
    added: {},
    updated: {}
  };
  
  if (!current) {
    updates.updated = updated || {};
    return updates;
  }
  else if (!updated) {
    return updates;
  }
  
  //
  // Get the list of all added dependencies
  // 
  Object.keys(updated).filter(function (key) {
    return !current[key];
  }).forEach(function (key) {
    updates.added[key] = updated[key];
  });
  
  //
  // Get the list of all dependencies that have been updated
  //
  Object.keys(updated).filter(function (key) {
    if (!current[key]) {
      return false;
    }
    
    var left = updated[key].replace(/\<|\>|\=|\s/ig, ''),
        right = current[key].replace(/\<|\>|\=|\s/ig, '');
        
    return semver.gt(left, right);
  }).forEach(function (key) {
    updates.updated[key] = updated[key];
  })
  
  return updates;
};