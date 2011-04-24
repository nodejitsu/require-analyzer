var util = require('util'),
    path = require('path'),
    eyes = require('eyes'),
    Module = require('module').Module,
    fs = require('fs');
    __load = Module._load;

//
// Create the list of `core` node.js modules for referencing later.
// Not the most elegant solution, but not sure how to get this information
// programatically.
//
var core = {}, modules;

modules = [
  'assert', 'buffer', 'child_process', 'console', 'constants', 
  'crypto', 'dgram', 'dns', 'events', 'freelist', 'fs', 'http', 
  'https', 'module', 'net', 'os', 'path', 'querystring', 'readline', 
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 
  'tty', 'url', 'util', 'vm'
];

modules.forEach(function (mod) {
 core[mod] = true;
});

var requireish = exports;

requireish.package = function (dir, callback) {
  fs.readFile(path.join(dir, 'package.json'), function (err, pkg) {
    if (err) {
      return callback(err);
    }

    try {
      pkg = JSON.parse(pkg.toString());
      
      //
      // Remark (indexzero): Support more than `main`
      //
      if (!pkg.main) {
        return callback(new Error('package.json must have a `main` property.'));
      }
      
      return callback(null, requireish.file(path.join(dir, path.normalize(pkg.main))));
    }
    catch (ex) {
      return callback(ex);
    }
  });
};

requireish.file = function (file) {
  var packages = {};
  
  //
  // Monkey punch `Module._load()` to observe the names
  // of packages as they are loaded. 
  //
  Module._load = function (name) {
    packages[name] = true;
    return __load.apply(Module, arguments);
  }
  
  try {    
    require(file);
    packages = Object.keys(packages).sort().filter(function (mod) {
      return mod[0] !== '.' && mod.indexOf('/') === -1 && !core[mod];
    });
  }
  catch (ex) {
    packages = null;
  }
  finally {
    //
    // Reset `Module._load()` to the original function without
    // additional observation. 
    //
    Module._load = __load;
    return packages;
  }
};