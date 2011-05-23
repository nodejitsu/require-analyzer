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
'semver',
'nopt',
'abbrev',
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
    },
    "when passed a file with errors": {
      topic: function () {
        analyzer.file({ target: path.join(__dirname, 'fixtures', 'throw-error') }, this.callback)
      },
      "should respond with an error": function (err, pkgs) {
        assert.isNotNull(err);
      }
    }
  }
}
}).export(module);