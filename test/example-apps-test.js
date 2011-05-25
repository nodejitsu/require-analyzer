/*
 * example-apps-test.js: check that require-analyzer detects correct 
 * dependencies for example modules.
 *
 * (C) 2010, Nodejitsu Inc.
 *
 */

require.paths.unshift(require('path').join(__dirname, '..', 'lib'));

var fs = require('fs'),
    path = require('path'),
    vows = require('vows'),
    assert = require('assert'),
    analyzer = require('require-analyzer');

function dependencies(file) {
  return function () { 
    var that = this;
    analyzer.analyze({ 
      target: path.join(__dirname, file) 
    }, 
    function (err, pkgs) {
      that.callback(err, analyzer.extractVersions(pkgs))
    });
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
        //'example-dep3': '7.5.x', //only load modules defined in the first tick.
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
    "in app with conflicts": function (err, pkgs) {
      assert.isNull(err);
      assert.deepEqual(pkgs, {
        'dep1' : '0.1.x',
        'dep2' : '6.5.x', 
        'dep3' : '7.5.x', 
      });
    }
  }
}).export(module);

/*
  if(module.parent) //load
  if(require.main === module) //load

  nextTick //do not load

  conflicting dependencies.
  x 
   -> b 
      -> a 0.2.0
   -> a 0.1.0

  should report the first level.

  correct versions
  conflicting dependencies
  first tick
  
  still detects dependencies specified by variables.
  
*/
