# require-analyzer

Determine dependencies for a given node.js file, directory tree, or module in code or on the command line

## Installation

### Installing npm (node package manager)
<pre>
  curl http://npmjs.org/install.sh | sh
</pre>

### Installing require-analyzer
<pre>
  [sudo] npm install require-analyzer
</pre>
NOTE: If you're using `npm >= 1.0` then you need to add the `-g` parameter to install `require-analyzer` globally.

## Usage

### Command-line usage
Using require-analyzer from the command line is easy. The binary will attempt to read the `package.json` file in the current directory, then analyze the dependencies and cross reference the result. 
<pre>
  $ require-analyzer --help
  usage: require-analyzer [options] [directory]

  Analyzes the node.js requirements for the target directory. If no directory
  is supplied then the current directory is used

  options:
    --update     Update versions for existing dependencies
    -h, --help   You're staring at it
</pre>

Here's a sample of `require-analyzer` analyzing it's own dependencies:
<pre>
  $ require-analyzer
  info:  require-analyzer starting in /Users/Charlie/Nodejitsu/require-analyzer
  warn:  No dependencies found
  info:  Analyzing dependencies...
  info:  Done analyzing raw dependencies
  info:  Retrieved packages from npm
  info:  Additional dependencies found
  data:  {
  data:    async: '>= 0.1.8',
  data:    findit: '>= 0.0.3',
  data:    npm: '>= 0.3.18'
  data:  }
  info:  Updating /Users/Charlie/Nodejitsu/require-analyzer/package.json
  info:  require-analyzer updated package.json dependencies
</pre>

### Programmatic usage
The easiest way to use `require-analyzer` programmatically is through the `.analyze()` method. This method will use `fs.stat()` on the path supplied and attempt one of three options:

1. If it is a directory that has a package.json, analyze `require` statements from `package.main`
2. If it is a directory with no package.json analyze every `.js` or `.coffee` file in the directory tree 
3. If it is a file, then analyze `require` statements from that individual file.

Lets dive into a quick sample usage:
''' javascript
  var analyzer = require('require-analyzer');
'''

## Tests
<pre>
  vows --spec
</pre>

#### Author: [Charlie Robbins][0]

[0]: http://nodejitsu.com