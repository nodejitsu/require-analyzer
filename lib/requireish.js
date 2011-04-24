var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    spawn = require('child_process').spawn,
    async = require('async'),
    npm = require('npm'),
    findit = require('findit');

var requireish = exports;

//
// Create the list of `core` node.js modules for referencing later.
// Map the array of all `core` modules into an object for easy access.
//
var core = {};
Object.keys(process.binding('natives')).forEach(function (mod) {
 core[mod] = true;
});

requireish.dir = function (dir, callback) {
  //
  // Read the current directory 
  //
  fs.readdir(dir, function (err, files) {
    if (err) {
      return callback(err);
    }
    
    if (files.indexOf('package.json') !== -1) {
      return requireish.package(dir, callback);
    }
    
    var files  = [],
        finder = findit.find(dir);
        
    finder.on('file', function (file) {
      files.push(file);
    });
    
    finder.on('end', function () {
      var packages = {};
      
      function requireFile (file, next) {
        requireish.file(file, function (err, deps) {
          deps.forEach(function (dep) {
            packages[dep] = true;
          });
          
          next();
        });
      }
      
      async.forEach(files, requireFile, function () {
        callback(null, Object.keys(packages));
      });
    })
  });
};

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
      
      requireish.file(path.join(dir, path.normalize(pkg.main)), function (err, deps) {
        callback(null, deps);
      });
    }
    catch (ex) {
      return callback(ex);
    }
  });
};

requireish.file = function (file, callback) {
  var packages = {},
      deps = spawn('node', [path.join(__dirname, '..', 'bin', 'find-dependencies'), file]);
  
  deps.stdout.on('data', function (data) {
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
    callback(null, Object.keys(packages).filter(function (pkg) {
      return pkg[0] !== '.' && pkg.indexOf('/') === -1 && !core[pkg];
    }));
  });
};