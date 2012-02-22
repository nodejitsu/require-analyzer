/*
 * require-analyzer.js: Determine dependencies for a given node.js file, directory tree, or module.
 *
 * (C) 2010, Nodejitsu Inc.
 *
 */

var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    events = require('events'),
    spawn = require('child_process').spawn,
    npm = require('npm'),
    npmout = require('npm/lib/utils/output'),
    npmls = require('npm/lib/utils/read-installed'),
    semver = require('semver'),
    findit = require('findit');

var analyzer = exports,
    _write = npmout.write;

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
    
    var analyzeFn, rootDir;
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
        emitter.emit('childError', err);
        return callback(err);
      }
      // Emit the `dependencies` event for streaming results.
      emitter.emit('dependencies', deps);
      
      if (options.npm === false || !deps || deps.length === 0) {
        return callback(null, deps);
      }
      
      var npmEmitter = analyzer.npmAnalyze(deps, options, function (nerr, reduced, suspect) {
        return callback(err || nerr, reduced, suspect);
      });
      
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
      
  if (!deps || deps.length === 0) {
    return callback();
  }
  
  analyzer.findModulesDir(options.target, function (err, root) {
    if (err) {
      return callback(err);
    }
    
    //
    // Setup npm options
    // 
    options.npm = { 
      prefix: root,
      exit: false 
    };

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

    npm.load(options.npm, function (err, npm) {
      if (err) {
        return callback(err);
      }

      //
      // Analyze dependencies by searching for all installed locally via npm. 
      // Then see if it depends on any other dependencies that are in the
      // list so those dependencies may be removed (only if `options.reduce` is set).
      //
      npmls(root, function (err, result) {
        if (err) {
          return callback(err);
        }
        else if (!result || !result.dependencies || Object.keys(result.dependencies).length === 0) {
          return callback(null, deps);
        }
        Object.keys(result.dependencies).forEach(function (pkg) {
          if (result.devDependencies && pkg in result.devDependencies) return;
          if (!Array.isArray(deps) && Object.keys(deps).length !== 0) {
            if (deps[pkg] === '*' || typeof deps[pkg] === 'undefined') {
              pkgs[pkg] = result.dependencies[pkg]
                          ? result.dependencies[pkg]['version']
                          : deps[pkg];
            }
            else {
              pkgs[pkg] = deps[pkg];
            }
          }
          else if (!deps || deps.indexOf(pkg) !== -1) {
            pkgs[pkg] = result.dependencies[pkg]['version'];
          }
        });

        emitter.emit('search', pkgs);
        if (!options.reduce) {
          npmout.write = _write;
          return callback(null, pkgs);
        }

        var reduced = analyzer.merge({}, pkgs),
            suspect = {};

        Object.keys(deps).forEach(function (dep) {
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
    if ((options.target && files.indexOf(options.target) !== -1) 
      || files.indexOf('package.json') !== -1) {
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
        
    function onRequired() {
      //
      // Respond to the `callback` if all files have been traversed
      // and all files have been executed via `analyzer.file()`
      //
      if (traversed && files.length === done.length) {
        callback(null, Object.keys(packages));
      }
    }
     
    finder.on('file', function (file) {
      if (file.match(/node_modules/)) {
        return;
      }
      
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
  var deps = {},
      pkgDeps = {},
      devDeps = {};
  //
  // Attempt to read the package.json in the current directory 
  //
  fs.readFile(path.join(options.target, options.file || 'package.json'), function (err, pkg) {
    if (!err) {
      try {
        //
        // Attempt to read the package.json data.
        //
        pkg = JSON.parse(pkg.toString());
        pkgDeps = pkg.dependencies;
        devDeps = pkg.devDependencies;
      }
      catch (e) {
        return callback(e);
      }
    }
    else {
      pkg = {};
    }
    
    try {
      //
      // Analyze the require(s) based on:
      //  - the `main` property of the package.json
      //  - the scripts in the options that relate to package.json
      //  - the default file if no package.json exists
      //
      var todo = 0,
          _deps = [];
          
      function dequeue(err) {
        todo--;
        if (todo === 0) {
          mergeDependencies(err, _deps, pkgDeps, devDeps, callback);
        }
      }
      
      function processOptions(options) {
        todo++;
        
        analyzer.file(options, function (err, deps) {
          _deps = _deps.concat(deps.filter(function (d) { 
            return _deps.indexOf(d) === -1 && d !== pkg.name;
          }));
          
          dequeue(err);
        });
      }
      
      var scripts = options.hasOwnProperty('scripts') ? options.scripts : ["test","prestart"];
      
      scripts = scripts.map(function (item) {
        return pkg.scripts && pkg.scripts[item];
      }).filter(function (item) {
        return !!item;  
      });
      
      if (scripts) {
        scripts.forEach(function analyzeScript(script) {
          if (!script) {
            return;
          }
          
          var newoptions = analyzer.clone(options);
          try {
            newoptions.target = require.resolve(path.join(newoptions.target, path.normalize(pkg.main || '/')));
          }
          catch (e) {
            todo = 1;
            deps = null;
            dequeue(e);
          }
          
          processOptions(newoptions);
        });
      }
      
      var newoptions = analyzer.clone(options);

      function setMain(files, pkg, newoptions, callback) {
        var file=null;

        function nextFile() {
          file = files.shift();
          if (typeof file === 'undefined') {
            return callback(pkg, newoptions);
          }
          checkFile(file);
        }

        function checkFile(file) {
          path.exists(file, fileExists)
        }

        function fileExists(exists) {
          if (exists) {
            pkg.main=file;
            return callback(pkg, newoptions);
          }
          nextFile();    
        }

        nextFile();
        return;
      }

      function setTarget(pkg, newoptions) {
        try {
          newoptions.target = require.resolve(path.join(newoptions.target, path.normalize(pkg.main || '/')));
        }
        catch (e) {
          todo = 1;
          deps = null;
          dequeue(e);
        }
        return processOptions(newoptions);
      }

      //add logic to default to app.js or server.js for main if main is not present.
      if (typeof pkg.main === 'undefined' || pkg.main === '') {
        var files=["app.js", "server.js", "index.js"]
        setMain(files, pkg, newoptions, setTarget);
      }
      else {
        setTarget(pkg, newoptions);
      }
    }
    catch (ex) {
      return callback(ex);
    }
  });
};

function mergeDependencies(err, deps, pkgDeps, devDeps, callback) {
  var merged = {};
  if (err) {
    return callback(err);
  }
  if (!Array.isArray(deps)) {
    if (typeof deps === 'undefined' || 
        Object.keys(deps).length === 0) {
      return callback(null, removeDevDeps(pkgDeps));
    }
  }
  
  if (typeof pkgDeps === 'undefined' || Object.keys(pkgDeps).length === 0) {
    deps.forEach(function (d) {
      merged[d] = '*';
    });
   
    return callback(null, removeDevDeps(merged));
  }

  deps.forEach(function (d) {
    merged[d] = pkgDeps[d] || '*';
  });

  Object.keys(pkgDeps).forEach(function (d) {
    if (typeof merged[d] === 'undefined') {
      merged[d] = pkgDeps[d];
    }
  });
  return callback(null, removeDevDeps(merged));

  function removeDevDeps(deps) {
    var obj = analyzer.clone(deps);
    for (var dep in devDeps) {
      if (typeof obj[dep] !== 'undefined') {
        delete obj[dep];
      }
    }
    return obj;
  }
}



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
      errs = ['Errors received when analyzing ' + options.target],
      deps = spawn('node', [path.join(__dirname, '..', 'bin', 'find-dependencies'), options.target]);
  
  function parseLines(data, prefix, fn) {
    data = data.toString();
    if (data !== '') {
      data.toString().split('\n').filter(function (line) {
        return line !== '';
      }).forEach(function (line) {
        if (line.indexOf(prefix) !== -1) {
          line = line.replace(prefix, '');
          fn(line);
        } 
      });
    }
  }
  
  deps.stdout.on('data', function (data) {
    //
    // For each line of data output from the child process remove empty 
    // lines and then add the specified packages to list of known packages.
    //
    parseLines(data, '__!load::', function (dep) {
      packages[dep] = true;
    });
  });
  
  deps.stderr.on('data', function (data) {
    parseLines(data, '__!err::', function (line) {
      errs.push(line);
    });
  });

  //
  // Set the default timeout to `5 seconds`
  //
  options.timeout = options.timeout || 5000;

  //
  // If a timeout has been set then exit the 
  // process after the specified timespan
  //
  var timeoutId = setTimeout(function () {
    deps.kill();
  }, options.timeout);
  
  deps.on('exit', function () {
    // 
    //
    // Remove the timeout now that we have exited.
    //
    clearTimeout(timeoutId);
    
    //
    // When the process is complete remove any core node.js packages
    // (i.e. the ones for which `require.resolve(module) == module`) and any packages
    // which are required with a relative directory (i.e. `require('./package')`). 
    //
    // Include any packages which may be of the form `require('package/relative/dir')`
    // because those relative directories are still supported by npm:
    // e.g.: `require('socket.io/lib/socket.io/utils')`.
    //
    packages = Object.keys(packages);
    (options.raw ? packages : packages.filter(function (pkg) {
      return pkg[0] !== '.' && pkg[0] !== '/' && !analyzer.isNative(pkg);
    }).map(function (pkg) {
      return pkg.split('/')[0];
    })).forEach(function (pkg) {
      merged[pkg] = true;
    });

    return errs.length > 1 
      ? callback(new Error(errs.join('\n')), Object.keys(merged))
      : callback(null, Object.keys(merged));
  });
};

//
// ### function findModulesDir (target)
// #### @target {string} The directory (or file) to search up from
// Searches up from the specified `target` until it finds a directory which contains
// a folder called `node_modules`
//
analyzer.findModulesDir = function (target, callback) {
  fs.stat(target, function (err, stats) {
    if (err) {
      return callback(err);
    }
    if (stats.isDirectory()) {
      return fs.readdir(target, function (err, files) {
        if (err) {
          return callback(err);
        }
        
        if (files.indexOf('node_modules') !== -1 || files.indexOf('package.json') !== -1) {
          return callback(null, target);
        }
        else {
          return callback(null, target);
        }
      });
    }
    else if (stats.isFile()) {
      return analyzer.findModulesDir(path.dirname(target), callback);
    }
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
  objs.forEach(function (o) {
    Object.keys(o).forEach(function (attr) {
      if (! o.__lookupGetter__(attr)) {
        target[attr] = o[attr];
      }
    });
  });
  
  return target;
};

//
// ### function clone (object)
// #### @object {Object} Object to clone.
// Shallow clones the target `object`.
//
analyzer.clone = function (object) {
  return Object.keys(object).reduce(function (obj, k) {
    obj[k] = object[k];
    return obj;
  }, {});
};

//
// ### function extractVersions (dependencies)
// #### @dependencies {Object} Set of dependencies to transform
// Transforms the `dependencies` object into the format that
// package.json files accept.
//
analyzer.extractVersions = function (dependencies) {
  var all = {};

  if (!dependencies) {
    return all;
  }

  if (Array.isArray(dependencies)) {
    dependencies.forEach(function (dep) {
      all[dep] = '*';
    });
    return all;
  }
  
  Object.keys(dependencies).forEach(function (pkg) {
    var raw     = dependencies[pkg] || '*',
        parse   = semver.expressions.parse.exec(raw.trim()),
        version = parse ? parse.slice(1) : raw,
        build   = version ? version[4] : null;
    if (!/^[v\d]+/.test(raw)) {
      all[pkg] = raw;
    }
    else if (typeof version === 'string') {
      all[pkg] = version;
    }
    else {
      version[2] = build ? version[2] : 'x';
      all[pkg]   = build ? '>= ' + dependencies[pkg].version : version.filter(Boolean).join('.');
    }
  });
  
  return all;
};

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

//
// ### function isNative (module)
// #### @module {string} Module
// Check if `module` is a native module (like `net` or `tty`).
//
analyzer.isNative = function (module) {
  try {
    return require.resolve(module) == module;
  }
  catch (err) {
    return false;
  }
};

