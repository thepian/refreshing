#!/usr/bin/env mocha

var fs = require("fs"), path = require("path");
var source = require("../lib/refreshing/source"), watchTree = require("fs-watch-tree").watchTree;

var assert = require("assert")

describe('SourceTree', function(){
  describe('#concatenate:', function(){
    it('should create files listed in concatenate properties', function(){

		var a = "concatenate", options = {};
		// options.startedCallback = function() {
		// 	test.done();
		// };

		var tree = new source.SourceTree(a,options);
		//		watchTree(a, options, tree.trigger.bind(tree));



      assert.equal(-1, [1,2,3].indexOf(5));
      assert.equal(-1, [1,2,3].indexOf(0));
    })
  })
})

/*
var base = __dirname;
//if (process.argv.length > 2) base = require('path').join(__dirname,process.argv[2]);

base = require('path').join(__dirname,"mini-site");

require("../lib/refreshing/index").watchTrees(__dirname,base);

base = require('path').join(__dirname,"sub-out");

require("../lib/refreshing/index").watchTrees(__dirname,base);
*/