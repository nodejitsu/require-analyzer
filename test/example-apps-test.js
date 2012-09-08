/*
 * example-apps-test.js: check that require-analyzer detects correct 
 * dependencies for example modules.
 *
 * (C) 2010, Nodejitsu Inc.
 *
 */

var fs = require('fs'),
    exec = require('child_process').exec,
    path = require('path'),
    vows = require('vows'),
    assert = require('assert'),
    analyzer = require('../lib/require-analyzer');

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
  "When passed a simple app with a dependency in node_modules but not package.json":{
    topic: dependencies('./fixtures/example-app1'),
    "the dependency is properly detected.": function (err, pkgs) {
      assert.deepEqual(pkgs, {
        'example-dep1': '0.1.x'
      });
    }
  },
  "When passed an app with all dependencies in node_modules but only some in package.json":{
    topic: dependencies('./fixtures/example-app2'),
    "dependencies are still properly detected.": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'example-dep1': '0.1.x',
        'example-dep2': '6.5.x'
      });
    }
  },
  "When passed an app with no package.json and an npm dependency (socket.io)":{
    topic: dependencies('./fixtures/socket-io-app/', function (callback) {
      var rootDir = path.join(__dirname, '..'),
          modulesDir = path.join(__dirname, 'fixtures', 'socket-io-app', 'node_modules');
      var commands = [
        'mkdir ' + modulesDir,
        'cd ' + modulesDir,
        'npm install socket.io@0.9'
      ];
      
      exec(commands.join(' && '), callback);
    }),
    "the dependency is properly detected.": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'socket.io': '0.9.x'
      });
    }
  },
  "When called with a module that needs to know it's the main and has a nextTick require":{
    topic: dependencies('./fixtures/example-app3'),
    "first-tick dependencies are still properly detected": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        //
        // Since carapace now starts apps telling them they are the main module
        // it should work like that here too.
        //
        'example-dep1': '0.1.x',  // if(!module.parent)
        'example-dep2': '6.5.x',  // if(require.main === module)
        'example-dep3': '7.5.x',  // present in package.json
        // 'example-dep4': '*' // only load modules defined in the first tick.
      });
    },
    "modules required after the first tick are not detected": function (err, pkgs) {
      assert.isNull(err);
      assert.isUndefined(pkgs['example-dep4']);
    }
  },
  "When passed an app with conflicts":{
    topic: dependencies('./fixtures/conflicting-app'),
    "first level dependencies should still be detected": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'dep1': '0.1.x',
        'dep2-with-conflict-on-dep1': '6.5.x', 
      });
    }
  },
  "When passed an app with dynamic dependencies":{
    topic: dependencies('./fixtures/dynamic-deps'),
    "dependencies will still be detected without require specified": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'dep1': '0.1.x',
        'dep2': '6.5.x', 
        'dep3': '7.5.x',
        'example-dep1': '0.1.x' 
      });
    }
  },
  "when passed a directory with no package.json or node_modules folder present": {
    topic: dependencies('./fixtures/require-only'),
    "dependencies are still properly detected": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'colors': '*',
        'ncp': '*'
      });
    }
  },
  "when passed a file with no package.json or node_modules folder present": {
    topic: dependencies('./fixtures/require-only/index.js'),
    "dependencies are still properly detected": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'colors': '*',
        'ncp': '*'
      });
    }
  },
  "when the package.json contains npm-supported wildcards that are not valid semver": {
    topic: dependencies('./fixtures/wildcards'),
    "dependencies should still be properly detected": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'example-dep1': '*',
        'example-dep2': '*'
      });
    }
  },
  "When passed an app with explicit dependency versions specified in its package.json": {
    topic: dependencies('./fixtures/explicit-versions'),
    "dependencies are still properly detected.": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'serveStuff': '==2.4.7',
        'makeShiny': '==0.16.2',
        'writeMyCSS': '0.17.x'
      });
    }
  },
  "When passed an app that does not have all its requires in the main script": {
    topic: dependencies('./fixtures/subdeps'),
    "dependencies are still properly detected.": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'serveStuff': '2.4.x',
        'makeShiny': '0.16.x',
        'writeMyCSS': '0.17.x'
      });
    }
  },
  "When passed an app with version ranges in its package.json": {
    topic: dependencies('./fixtures/version-ranges'),
    "the author's version ranges are not replaced with wildcards.": function (err, pkgs) {
      assert.isNull(err); 
      assert.deepEqual(pkgs, {
        'serveStuff': '==2.4.7',
        'makeShiny': '>=0.15.0 < 0.17.0',
        'writeMyCSS': '0.17.x'
      });
    }
  },
  "When passed an app with delayed & distributed dependencies": {
    topic: dependencies('./fixtures/delayed-require'),
    "all dependencies are found": function (err, pkgs){
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        "socket.io": "*",
        "some_module": "*"
      });
    }
  }
}).export(module);
