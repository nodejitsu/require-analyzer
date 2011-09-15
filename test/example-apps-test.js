/*
 * example-apps-test.js: check that require-analyzer detects correct 
 * dependencies for example modules.
 *
 * (C) 2010, Nodejitsu Inc.
 *
 */

require.paths.unshift(require('path').join(__dirname, '..', 'lib'));

var fs = require('fs'),
    exec = require('child_process').exec,
    path = require('path'),
    vows = require('vows'),
    assert = require('assert'),
    analyzer = require('require-analyzer');

function dependencies (file, prerunner) {
  return function () { 
    var that = this;
    
    function runAnalyze () {
      analyzer.analyze({ 
        target: path.join(__dirname, file) 
      }, 
      function (err, pkgs) {
        return err ? that.callback(err) : that.callback(null, analyzer.extractVersions(pkgs));
      });
    }
    
    return prerunner 
      ? prerunner(runAnalyze) 
      : runAnalyze();
  }
}

vows.describe('require-analyzer/examples').addBatch({
  "should respond with the correct dependencies":{
    topic: dependencies('./fixtures/example-app1'),
    "in a simple example": function (err, pkgs) {
      require('eyes').inspect(arguments);
      assert.deepEqual(pkgs, {
        'vows' : '0.5.x'
      });
    }
  },
  "should respond with the correct dependencies":{
    topic: dependencies('./fixtures/example-app2'),
    "in a less simple example": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'example-dep1' : '0.1.x',
        'example-dep2' : '6.5.x'
      });
    }
  },
  "should respond with the correct dependencies":{
    topic: dependencies('./fixtures/socket-io-app/', function (callback) {
      var rootDir = path.join(__dirname, '..'),
          modulesDir = path.join(__dirname, 'fixtures', 'socket-io-app', 'node_modules');
          
      var commands = [
        'cd ' + rootDir,
        'npm install socket.io',
        'mkdir ' + modulesDir,
        'mv ' + path.join(rootDir, 'node_modules', 'socket.io') + ' ' + modulesDir
      ];
      
      exec(commands.join(' && '), callback);
    }),
    "in a less simple example": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'socket.io' : '0.8.x'
      });
    }
  },
  "the main module should know it's the main":{
    topic: dependencies('./fixtures/example-app3'),
    "in a less simple example": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        //
        // Since carapace now starts apps telling them they are the main module
        // it should work like that here too.
        //
        'example-dep1' : '0.1.x',  //if(!module.parent)
        'example-dep2' : '6.5.x'   //if(require.main === module)
        // 'example-dep3': '7.5.x' //only load modules defined in the first tick.
      });
    }
  },
  "detect first level dependencies":{
    topic: dependencies('./fixtures/conflicting-app'),
    "in app with conflicts": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'dep1' : '0.1.x',
        'dep2-with-conflict-on-dep1' : '6.5.x', 
      });
    }
  },
  "does not depend on require specified":{
    topic: dependencies('./fixtures/dynamic-deps'),
    "in app with dynamic dependencies": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'dep1' : '0.1.x',
        'dep2' : '6.5.x', 
        'dep3' : '7.5.x', 
      });
    }
  },
  "with no package.json or node_modules folder present": {
    topic: dependencies('./fixtures/require-only'),
    "dependencies are still properly detected": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'colors' : '*',
        'ncp' : '*'
      });
    }
  }
}).export(module);