/*
* require-analyzer-test.js: Basic tests for the require-analyzer module.
*
* (C) 2010, Nodejitsu Inc.
*
*/

var fs = require('fs'),
    path = require('path'),
    vows = require('vows'),
    assert = require('assert'),
    analyzer = require('../lib/require-analyzer');

var rawPackages = { 
  'npm': '>= 1.0.100 < 1.1.0',
  'graceful-fs': '*',
  'nopt': '*',
  'abbrev': '*',
  'ini': '*',
  'proto-list': '*',
  'semver': '1.0.x',
  'slide': '*',
  'which': '*',
  'findit': '0.0.x',
  'seq': '*',
  'hashish': '*',
  'traverse': '*',
  'chainsaw': '*',
  'colors': '0.x.x',
  'optimist': '0.2.x',
  'winston': '0.5.x',
  'detective': '0.0.x',
  'eyes': '0.1.x'
 
};

var libDeps = { 
  'colors': '0.x.x',
  'read-installed': '0.0.x',
  'resolve': '0.2.x',
  'optimist': '0.3.x',
  'semver': '1.0.x',
  'winston': '0.6.x',
  'detective': '0.0.x',
  'eyes': '0.1.x' 
};

var libPackages = [
    'npm',
    'graceful-fs',
    'nopt',
    'abbrev',
    'ini',
    'proto-list',
    'semver',
    'slide',
    'which',
    'seq',
    'hashish',
    'traverse',
    'chainsaw'
];

var depsFromFile = [
  'read-installed',
  'detective', 
  'resolve', 
  'semver'
];

var nativeSubjects = {};
Object.getOwnPropertyNames(process.binding('natives'))
      .forEach(function (package) {
  nativeSubjects[package] = {
    topic: analyzer.isNative(package),
    'should respond with true': function (result) {
      assert.isTrue(result);
    }
  };
});

var nonNativeSubjects = {};
Object.keys(rawPackages).concat(libPackages).forEach(function (package) {
  nonNativeSubjects[package] = {
    topic: analyzer.isNative(package),
    'should respond with false': function (result) {
      assert.isFalse(result);
    }
  };
});

vows.describe('require-analyzer').addBatch({
  "When using require-analyzer": {
    "the analyze() method": {
      "when passed a directory": {
        "with a valid package.json": {
          topic: function () {
            analyzer.analyze({target: path.join(__dirname, '..') }, this.callback)
          },
          "should respond with the correct dependencies": function (err, pkgs) {
            assert.isNull(err);
            assert.deepEqual(pkgs, libDeps);
          }
        }
      }
    },
    "the dir() method": {
      topic: function () {
        var that = this;
        analyzer.dir({ target: path.join(__dirname, '..', 'lib') }, this.callback);
      },
      "should respond with the correct dependencies": function (err, pkgs) {
        assert.isNull(err);
        assert.deepEqual(pkgs, depsFromFile);
      }
    },
    "the package() method": {
      topic: function () {
        analyzer.package({ target: path.join(__dirname, '..') }, this.callback)
      },
      "should respond with the correct dependencies": function (err, pkgs) {
        assert.isNull(err);
        assert.deepEqual(pkgs, libDeps);
      }
    },
    "the file() method": {
      "when passed a valid file": {
        topic: function () {
          analyzer.file({ target: path.join(__dirname, '..', 'lib', 'require-analyzer.js') }, this.callback)
        },
        "should respond with the correct dependencies": function (err, pkgs) {
          console.dir(pkgs);
          assert.isNull(err);
          assert.deepEqual(pkgs, depsFromFile);
        }
      }
    },
    "the isNative() method": {
      "when passed native package": nativeSubjects,
      "when passed non-native package": nonNativeSubjects
    },
    "the extractVersions() method": {
      "when passed a version with a specified build": function(){
        var result = analyzer.extractVersions({"a": "0.1.2-3", "b": "2.3.4-five"});
        assert.deepEqual(result, {
          "a": ">= 0.1.2-3",
          "b": ">= 2.3.4-five"
        });
      }
    }
  }
}).export(module);
