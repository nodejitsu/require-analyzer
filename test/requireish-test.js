require.paths.unshift(require('path').join(__dirname, '..', 'lib'));

var fs = require('fs'),
    path = require('path'),
    vows = require('vows'),
    assert = require('assert'),
    requireish = require('requireish');

var packages = [
  'async',
  'npm',
  'semver',
  'findit',
  'seq',
  'hashish',
  'traverse',
  'chainsaw'
];

vows.describe('requireish').addBatch({
  "When using requireish": {
    "the dir() method": {
      topic: function () {
        var that = this;
        requireish.dir(path.join(__dirname, '..', 'lib'), this.callback);
      },
      "should respond with the correct dependencies": function (err, pkgs) {
        assert.isNull(err);
        assert.deepEqual(pkgs, packages);
      }
    }
  }
}).addBatch({
  "When using requireish": {
    "the package() method": {
      topic: function () {
        requireish.package(path.join(__dirname, '..'), this.callback)
      },
      "should respond with the correct dependencies": function (err, pkgs) {
        assert.isNull(err);
        assert.deepEqual(pkgs, packages);
      }
    }
  }
}).addBatch({
  "When using requireish": {
    "the file() method": {
      topic: function () {
        requireish.file(path.join(__dirname, '..', 'lib', 'requireish'), this.callback)
      },
      "should respond with the correct dependencies": function (err, pkgs) {
        assert.isNull(err);
        assert.deepEqual(pkgs, packages);
      }
    }
  }
}).export(module);