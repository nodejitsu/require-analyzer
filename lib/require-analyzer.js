/*
 * require-analyzer.js: Determine dependencies for a given node.js file, directory tree, or module.
 *
 * (C) 2010, Nodejitsu Inc.
 *
 */

var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    exists = fs.exists || path.exists,
    events = require('events'),
    fork = require('child_process').fork,
    readInstalled = require('read-installed'),
    detective = require('detective'),
    resolve = require('resolve'),
    semver = require('semver');

var analyzer = exports;

//
// ### function analyze (options, callback)
// #### @options {Object} Options to analyze against
// #### @callback {function} Continuation to respond to when complete.
// Calls `path`. When dependencies are returned,
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
  
  //
  // let path determine what to do
  //
  analyzer.path(options, function (err, deps) {
    if (err) {
      emitter.emit('childError', err);
      return callback(err);
    }
    
    // Emit the `dependencies` event for streaming results.
    emitter.emit('dependencies', deps);
    
    if (options.npm === false || !deps || deps.length === 0) {
      return callback(null, deps);
    }
    
    var npmEmitter = analyzer.npmAnalyze(deps, options, callback);
    
    //
    // Re-emit the `search` and `reduce` events from the `npmEmitter`
    // for streaming results.
    //
    ['search', 'reduce'].forEach(function (ev) {
      npmEmitter.on(ev, emitter.emit.bind(emitter, ev));
    });
  });
  
  return emitter;
};

//
// ### function path (options, callback)
// #### @options {Object} Options to analyze against
// #### @callback {function} Continuation to respond to when complete.
// Calls the appropriate `require-analyzer` method based on the result
// from `fs.stats()` on `options.target`.
//
analyzer.path = function(options, callback){
  if (!options || !options.target) {
    //
    // If there are no `options` and no `options.target` property
    // respond with the appropriate error.
    //
    callback(new Error('options and options.target are required'));
  }
  
  //
  // Stat the directory and call the appropriate method
  // on `analyzer`.
  //
  fs.stat(options.target, function (err, stats) {
    if (err) {
      return callback(err);
    }
    else if (stats.isDirectory()) {
      analyzer.dir(options, callback);
    }
    else if (stats.isFile()) {
      if('fileFilter' in options && !options.fileFilter(options.target)) return;
      analyzer.file(options, callback);
    }
    else {
      err = new Error(options.target + ' is not a file or a directory.');
      err.code = 'UNSUPPORTED_TYPE';
      callback(err);
    }
  });
};

//
// ### function npmAnalyze (deps, options, callback) 
// #### @deps {Array} List of dependencies to analyze.
// #### @options {Object} Set of options to analyze with.
// #### @callback {function} Continuation to respond to when complete.
// Analyzes the list of dependencies using `read-installed`, consumes the options:
//
//     options.reduce: Will remove deps consumed by sibling deps
//
analyzer.npmAnalyze = function (deps, options, callback) {
  var emitter = new events.EventEmitter(),
      pkgs = {};
      
  if (!deps || deps.length === 0) {
    return callback();
  }
  
  analyzer.findNextDir(options.target, function (err, root) {
    if (err) {
      return callback(err);
    }

    //
    // Analyze dependencies by searching for all installed locally via read-installed. 
    // Then see if it depends on any other dependencies that are in the
    // list so those dependencies may be removed (only if `options.reduce` is set).
    //
    readInstalled(root, 1, function (err, result) {
      if (err) {
        return callback(err);
      }
      else if (!result || !result.dependencies || Object.keys(result.dependencies).length === 0) {
        // When no dependencies were found, return what we got
        if(Array.isArray(deps)){
          return callback(null, deps.reduce(function(obj, prop){
            obj[prop] = "*";
            return obj;
          }, {}));
        }
        else {
          return callback(null, deps);
        }
      }
      
      Object.keys(result.dependencies).forEach(function (pkg) {
        if (result.devDependencies && pkg in result.devDependencies) return;
        if (result.bundleDependencies && pkg in result.bundleDependencies) return;
        if (!Array.isArray(deps)) {
          if (deps[pkg] === '*' || !(pkg in deps) ) {
            pkgs[pkg] = pkg in result.dependencies
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
        return callback(null, pkgs);
      }

      var reduced = analyzer.clone(pkgs),
          suspect = {};

      Object.keys(deps).forEach(function (dep) {
        if (dep in pkgs && pkgs[dep].dependencies) {
          Object.keys(pkgs[dep].dependencies).forEach(function (cdep) {
            if (cdep in reduced) {
              suspect[cdep] = pkgs[cdep];
              delete reduced[cdep];
            }
          });
        }
      });

      emitter.emit('reduce', reduced, suspect);
      
      callback(null, reduced, suspect);   
    });
  });
  
  return emitter;
};

function filterFiles(file){
  //
  // If the file is not `.js` or `.coffee` do no analyze it
  //
  var ext = path.extname(file);
  return ext === '.js' || ext === '.coffee';
}

//
// ### function package (dir, callback)
// #### @dir {string} Parent directory to analyze
// #### @callback {function} Continuation to respond to when complete.
// Checks for the existance of a package.json in the specified `dir`
// running `analyzer.package()` if it exists. Otherwise attempts to run
// `analyzer.file()` on all files in the source tree.
//
analyzer.dir = function (options, callback) {
  var target = path.resolve(__dirname, options.target);

  //
  // Read the target directory 
  //
  fs.readdir(target, function (err, files) {
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

    var remaining = files.length,
        packages = {};

    //
    // Otherwise find all files in the directory tree
    // and attempt to run `analyzer.file()` on each of them
    // in parallel.
    //
    files.forEach(function(file){
      //
      // skip all files from 'node_modules' directories
      //
      if(file === 'node_modules') return remaining--;

      //
      // call analyzer.path and currate all dependencies
      //
      analyzer.path({
        __proto__: options,
        target: path.join(target, file),
        fileFilter: filterFiles
      }, function(err, deps){
        if(err && err.code !== 'UNSUPPORTED_TYPE'){
          //
          // skip symlinks & friends
          // but forward real errors
          //
          remaining = -1; //ensures that callback won't be called again
          callback(err);
          return;
        }

        deps.forEach(function(dep){
          packages[dep] = true;
        });

        //
        // when all files are analyzed, call the callback
        //
        if(!--remaining){
          callback(null, Object.keys(packages));
        }
      });
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
  fs.readFile(path.join(options.target, options.file || 'package.json'), function (err, pkg) {
    if (!err) {
      try {
        //
        // Attempt to read the package.json data.
        //
        pkg = JSON.parse(pkg.toString());
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
      //  - the default file if no package.json exists
      //
      var todo = 0,
          _deps = [];
          
      function dequeue(err) {
        todo--;
        if (todo === 0) {
          if(err) callback(err);
          else mergeDependencies(_deps, pkg, callback);
        }
      }
      
      function processOptions(options) {
        todo++;
        
        analyzer.file(options, function (err, deps) {
          _deps = _deps.concat(deps.filter(function (d) { 
            return d !== pkg.name && _deps.indexOf(d) === -1;
          }));
          
          dequeue(err);
        });
      }
      
      var newoptions = analyzer.clone(options);

      function setMain(files, pkg, newoptions, callback) {
        function nextFile() {
          if (!files.length) {
            return callback(pkg, newoptions);
          }

          var file = files.shift();
         
          exists(file, function(exists){
            if (exists) {
              pkg.main = file;
              callback(pkg, newoptions);
            }
            else nextFile();
          });
        }

        nextFile();
      }

      function setTarget(pkg, newoptions) {
        var newPath = path.join(newoptions.target, pkg.main ? path.normalize(pkg.main) : '/'),
            newTarget = analyzer.resolve(newPath);

        if (newTarget === false) {
          todo = 1;
          dequeue(new Error('Couldn\'t resolve path ' + newPath));
        }
        return processOptions(newoptions);
      }

      // add logic to default to app.js or server.js for main if main is not present.
      if ( !('main' in pkg) || pkg.main === '') {
        setMain(['app.js', 'server.js', 'index.js'], pkg, newoptions, setTarget);
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

function analyzeFile (options, callback) {
  var remaining = 1;

  function cb(err, data){
    if(!--remaining) callback();
  }

  fs.readFile(options.target, function(err, data){
    if(err) return callback(err);

    var files;

    try {
      files = detective.find(data.toString('utf8'));
    } catch(e){
      return callback(err);
    }

    files.strings.forEach(function(name){
      if(name in options.packages) return;

      options.packages[name] = true;

      var absolutePath = analyzer.resolve(name, options.target);
      if(!absolutePath || path.relative(options.target, absolutePath).indexOf('node_modules') >= 0){
        return;
      }

      remaining++;

      analyzeFile({
        __proto__: options,
        target: absolutePath
      }, cb);
    });

    if(files.expressions.length > 0){
      remaining++;
      spawnWorker({
        __proto__: options,
        target: options.target
      }, cb);
    }

    cb();
  });
}

var findDepsPath = path.join(__dirname, '..', 'bin', 'find-dependencies');

function spawnWorker (options, callback) {
  //
  // Spawn the `find-dependencies` bin helper to ensure that we are able to 
  // bypass any modules which have already been required in the current process. 
  //
  var packages = options.packages,
      errs = options.errors,
      deps = fork(findDepsPath, [options.target], {silent: true});

  deps.send(options.target);

  deps.on('message', function(data){
    switch(data.type){
      case 'load':
        packages[data.msg] = true;
        break;
      case 'error':
        errs.push(data.msg);
    }
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
    callback();
  });
}

//
// ### function file (file, callback) 
// #### @file {string} Path of the node script to analyze
// #### @callback {callback} Continuation to respond to when complete.
// Attempts to find the packages required by the node script located at
// `file` by spawning an instance of the `find-dependencies` helper
// script and parsing the output.
//

analyzer.file = function(options, callback){
  if(!options.packages) options.packages = {};
  if(!options.errors) options.errors = [];

  analyzeFile(options, function(err){
    if(options.errors.length > 0){
      callback(options.errors); //TODO call with real error object
    } else {
      //
      // Remove any core node.js packages
      // (i.e. the ones for which `require.resolve(module) == module`) and any packages
      // which are required with a relative directory (i.e. `require('./package')`). 
      //
      // Include any packages which may be of the form `require('package/relative/dir')`
      // because those relative directories are still supported by npm:
      // e.g.: `require('socket.io/lib/socket.io/utils')`.
      //

      var packages = Object.keys(options.packages);

      if(!options.raw){
        packages = packages.filter(function (pkg) {
          return pkg[0] !== '.' && pkg[0] !== '/' && !analyzer.isNative(pkg);
        }).map(function (pkg) {
          return pkg.split(path.sep, 2)[0];
        }).reduce(function(obj, name){
          obj[name] = true;
          return obj;
        }, {});

        packages = Object.keys(packages);
      }
      callback(null, packages);
    }
  });
};

//
// ### function findNextDir (target)
// #### @target {string} The path to search up from
// Searches up from the specified `target` until it finds a directory
//
analyzer.findNextDir = function(target, callback) {
  fs.stat(target, function (err, stats) {
    if (err) {
      callback(err);
    }
    else if (stats.isDirectory()) {
      callback(null, target);
    }
    else if (stats.isFile()) {
      analyzer.findNextDir(path.dirname(target), callback);
    }
    else {
      callback(new Error(target + ' is not a file or a directory.'));
    }
  });
};

//
// ### function findModulesDir (target)
// #### @target {string} The directory (or file) to search up from
// Searches up from the specified `target` until it finds a directory which contains
// a folder called `node_modules`
//
analyzer.findModulesDir = function (target, callback) {
  analyzer.findNextDir(target, function(err, dir){
    fs.readdir(target, function (err, files) {
      if (err) {
        callback(err);
      }
      else if (files.indexOf('node_modules') !== -1 || files.indexOf('package.json') !== -1) {
        //TODO ensure it's actually a directory/file
        callback(null, target);
      }
      else if (target === (target = path.dirname(target))){
        callback(new Error('Couldn\'t find a node_modules directory.'));
      }
      else {
        analyzer.findModulesDir(target, callback);
      }
    });
  });
};

//
// ### function (target [arg1, arg2, ...])
// #### @target {Object} Object to merge into
// Merges all properties in `arg1 ... argn` 
// into the `target` object.
//
// TODO remove this as it isn't used anymore
//
analyzer.merge = function (target) {
  var objs = Array.prototype.slice.call(arguments, 1);
  objs.forEach(function (o) {
    Object.keys(o).forEach(function (attr) {
      if ( !('get' in Object.getOwnPropertyDescriptor(o, attr)) ) {
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
        build   = version ? version[3] || version[4] : null;
    if (!/^[v\d]/.test(raw)) {
      all[pkg] = raw;
    }
    else if (typeof version === 'string') {
      all[pkg] = version;
    }
    else {
      version[2] = build ? version[2] : 'x';
      all[pkg]   = build ? '>= ' + dependencies[pkg] : version.filter(Boolean).join('.');
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
var cleanVersion = /\<|\>|\=|\s/ig;

analyzer.updates = function (current, updated) {
  var updates = {
    added: !current && updated || {},
    updated: {}
  };
  
  if (!current || !updated) {
    return updates;
  }
  
  //
  // Get the list of all added dependencies
  // 
  Object.keys(updated).filter(function (key) {
    return !(key in current);
  }).forEach(function (key) {
    updates.added[key] = updated[key];
  });
  
  //
  // Get the list of all dependencies that have been updated
  //
  Object.keys(updated).filter(function (key) {
    if ( !(key in current) ) {
      return false;
    }
    
    var left = updated[key].replace(cleanVersion, ''),
        right = current[key].replace(cleanVersion, '');
        
    return semver.gt(left, right);
  }).forEach(function (key) {
    updates.updated[key] = updated[key];
  });
  
  return updates;
};

//
// ### function isNative (module)
// #### @module {string} Module
// Check if `module` is a native module (like `net` or `tty`).
//
// TODO use the resolve module for this
// (faster & doesn't depend on the node version)
//
analyzer.isNative = function (module) {
  try {
    return require.resolve(module) === module;
  }
  catch (err) {
    return false;
  }
};

//
// ### function resolve (file, base)
// #### @file {string} filename
// #### @base {string} the root from which the file should be searched
// Check if `module` is a native module (like `net` or `tty`).
//
analyzer.resolve = function(file, base){
  try {
    return resolve.sync(file, {
      basedir: base && path.dirname(base),
      extensions: ['.js', '.coffee']
    });
  } catch (e) {
    return false;
  }
};

function mergeDependencies(deps, pkg, callback) {
  var pkgDeps = pkg.dependencies;

  function removeDevDeps(deps) {
    var obj = analyzer.clone(deps), dep;

    if('devDependencies' in pkg){
      for (dep in pkg.devDependencies) {
        if (dep in obj) {
          delete obj[dep];
        }
      }
    }

    if('bundleDependencies' in pkg){
      for (dep in pkg.bundleDependencies) {
        if (dep in obj) {
          delete obj[dep];
        }
      }
    }
    return obj;
  }
  
  var merged = {};
  
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
    if ( !(d in merged) ) {
      merged[d] = pkgDeps[d];
    }
  });
  
  return callback(null, removeDevDeps(merged));
}
