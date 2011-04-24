var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    path = require('path'),
    spawn = require('child_process').spawn,
    async = require('async'),
    npm = require('npm'),
    findit = require('findit');

var analyzer = exports;

//
// Create the list of `core` node.js modules for referencing later.
// Map the array of all `core` modules into an object for easy access.
//
var core = {};
Object.keys(process.binding('natives')).forEach(function (mod) {
 core[mod] = true;
});

//
// ### function package (dir, callback)
// #### @dir {string} Parent directory to analyze
// #### @callback {function} Continuation to respond to when complete.
// Checks for the existance of a package.json in the specified `dir`
// running `analyzer.package()` if it exists. Otherwise attempts to run
// `analyzer.file()` on all files in the source tree.
//
analyzer.dir = function (dir, callback) {
  //
  // Read the current directory 
  //
  fs.readdir(dir, function (err, files) {
    if (err) {
      return callback(err);
    }
    
    //
    // If there is a package.json in the directory
    // then analyze the require(s) based on `package.main`
    //
    if (files.indexOf('package.json') !== -1) {
      return analyzer.package(dir, callback);
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
        finder = findit.find(dir);
    
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
      var ext = path.extname(file);
      if (ext !== '.js' && ext !== '.coffee') {
        return;
      }
      
      files.push(file);
      
      analyzer.file(file, function (err, deps) {
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
analyzer.package = function (dir, callback) {
  //
  // Attempt to read the package.json in the current directory 
  //
  fs.readFile(path.join(dir, 'package.json'), function (err, pkg) {
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
      analyzer.file(path.join(dir, path.normalize(pkg.main)), function (err, deps) {
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
analyzer.file = function (file, callback) {
  //
  // Spawn the `find-dependencies` bin helper to ensure that we are able to 
  // bypass any modules which have already been required in the current process. 
  //
  var packages = {},
      merged = {},
      deps = spawn('node', [path.join(__dirname, '..', 'bin', 'find-dependencies'), file]);
  
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