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
  'findit': '0.0.x',
  'npm': '>= 1.0.100 < 1.1.0',
  'optimist': '0.2.x',
  'semver': '1.0.x',
  'winston': '0.5.x',
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
    'findit',
    'seq',
    'hashish',
    'traverse',
    'chainsaw'
];

var nativeSubjects = {};
Object.getOwnPropertyNames(process.binding('natives'))
      .concat(['net', 'tty', 'dgram', 'child_process', 'dns'])
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
        assert.deepEqual(pkgs, libPackages);
      }
    },
    "the package() method": {
      topic: function () {
        analyzer.package({ target: path.join(__dirname, '..') }, this.callback)
      },
      "should respond with the correct dependencies": function (err, pkgs) {
        assert.isNull(err);
        assert.deepEqual(pkgs, rawPackages);
      }
    },
    "the file() method": {
      "when passed a valid file": {
        topic: function () {
          analyzer.file({ target: path.join(__dirname, '..', 'lib', 'require-analyzer') }, this.callback)
        },
        "should respond with the correct dependencies": function (err, pkgs) {
          assert.isNull(err);
          assert.deepEqual(pkgs, libPackages);
        }
      }
    },
    "the isNative() method": {
      "when passed native package": nativeSubjects,
      "when passed non-native package": nonNativeSubjects
    }
  }
}).export(module);
