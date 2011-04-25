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

var packages = [
  'npm',
  'semver',
  'findit',
  'seq',
  'hashish',
  'traverse',
  'chainsaw'
];

vows.describe('require-analyzer').addBatch({
  "When using require-analyzer": {
    "the dir() method": {
      topic: function () {
        var that = this;
        analyzer.dir({ target: path.join(__dirname, '..', 'lib') }, this.callback);
      },
      "should respond with the correct dependencies": function (err, pkgs) {
        assert.isNull(err);
        assert.deepEqual(pkgs, packages);
      }
    }
  }
}).addBatch({
  "When using require-analyzer": {
    "the package() method": {
      topic: function () {
        analyzer.package({ target: path.join(__dirname, '..') }, this.callback)
      },
      "should respond with the correct dependencies": function (err, pkgs) {
        assert.isNull(err);
        assert.deepEqual(pkgs, packages);
      }
    }
  }
}).addBatch({
  "When using require-analyzer": {
    "the file() method": {
      topic: function () {
        analyzer.file({ target: path.join(__dirname, '..', 'lib', 'require-analyzer') }, this.callback)
      },
      "should respond with the correct dependencies": function (err, pkgs) {
        assert.isNull(err);
        assert.deepEqual(pkgs, packages);
      }
    }
  }
}).export(module);