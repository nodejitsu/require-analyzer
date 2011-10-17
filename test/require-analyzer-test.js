/*
* require-analyzer-test.js: Basic tests for the require-analyzer module.
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

var rawPackages = [
  'npm',
  'graceful-fs',
  'ini',
  'proto-list',
  'semver',
  'nopt',
  'abbrev',
  'slide',
  'which',
  'findit',
  'seq',
  'hashish',
  'traverse',
  'chainsaw'
];

var packages = [
  'findit',
  'npm',
  'semver'
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
rawPackages.concat(packages).forEach(function (package) {
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
            assert.deepEqual(Object.keys(pkgs), packages);
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
        assert.deepEqual(pkgs, rawPackages);
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
          assert.deepEqual(pkgs, rawPackages);
        }
      }
    },
    "the isNative() method": {
      "when passed native package": nativeSubjects,
      "when passed non-native package": nonNativeSubjects
    }
  }
}).export(module);
