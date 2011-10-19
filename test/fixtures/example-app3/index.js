
if(!module.parent)
  require('example-dep1');
if(require.main == module)
  require('example-dep2'); 

process.nextTick(function () {
  //this doesn't get detected. 
  //load your modules syncronously.
  require('example-dep4');
});