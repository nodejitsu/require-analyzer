var vows = require('vows'),
    exec = require('child_process').exec,
    join = require('path').join,
    fs   = require('fs'),
    assert = require('assert')
    package1 = 
      JSON.parse(fs.readFileSync(
        join(__dirname,'fixtures','example-app3','package.json')))



vows.describe('require-analyzer cli tool').addBatch({
  '--safe option prevents changing package.json': {
    topic: function (){

      assert.equal(package1.dependencies, null)
      exec( join(__dirname,'..','bin','require-analyzer'), [
        join(__dirname,'fixtures','example-app3'),
        '--safe'
        ], this.callback)
    },
    'package.json has not changed': function (error, stdout,stderr){
          //now, the package.json should not have changed.
          var package2 = 
            JSON.parse(fs.readFileSync(join(__dirname,'fixtures','example-app3','package.json')))
          assert.deepEqual(package1,package2)
          assert.equal(package2.dependencies, null)
        }
  }
}).export(module)