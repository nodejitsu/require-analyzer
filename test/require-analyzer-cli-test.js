var vows = require('vows'),
    exec = require('child_process').exec,
    path = require('path'),
    fs   = require('fs'),
    assert = require('assert')

var fixturesDir = path.join(__dirname, 'fixtures'),
    package1 = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'example-app3', 'package.json')));

vows.describe('require-analyzer/cli').addBatch({
  '--safe option prevents changing package.json': {
    topic: function () {
      assert.equal(package1.dependencies, null);
      exec(path.join(__dirname,'..','bin','require-analyzer'), [
        path.join(__dirname,'fixtures','example-app3'),
        '--safe'
      ], this.callback);
    },
    'package.json has not changed': function (error, stdout,stderr) {
      //
      // Now, the package.json should not have changed.
      //
      var package2 = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'example-app3', 'package.json')));
      assert.deepEqual(package1,package2);
      assert.equal(package2.dependencies, null);
    }
  }
}).export(module)