/*
 * require-analyzer-test.js: tests for require-analyzer's handling of error states.
 *
 * (C) 2010, Nodejitsu Inc.
 *
 */
 
var fs = require('fs'),
    path = require('path'),
    vows = require('vows'),
    assert = require('assert'),
    analyzer = require('../lib/require-analyzer');

vows.describe('require-analyzer error states').addBatch({
  "When using require-analyzer": {
    "the file() method": {
      "when passed a file with errors": {
        topic: function () {
          analyzer.file({ target: path.join(__dirname, 'fixtures', 'throw-error') }, this.callback)
        },
        "should respond with an error": function (err, pkgs) {
          assert.isNotNull(err);
        }
      },
      "when passed a file with falsey throws": {
        topic: function () {
          analyzer.file({ target: path.join(__dirname, 'fixtures', 'falsey-error') }, this.callback)
        },
        "should respond with an error": function (err, pkgs) {
          assert.isNotNull(err);
        }
      },
      "when passed a file with stack overflows": {
        topic: function () {
          analyzer.file({ target: path.join(__dirname, 'fixtures', 'stack-overflow-error') }, this.callback)
        },
        "should respond with an error": function (err, pkgs) {
          assert.isNotNull(err);
        }
      },
      "when passed a file with syntax-errors": {
        topic: function () {
          analyzer.file({ target: path.join(__dirname, 'fixtures', 'syntax-error') }, this.callback)
        },
        "should respond with an error": function (err, pkgs) {
          assert.isNotNull(err);
        }
      }
    }
  }
}).export(module);
