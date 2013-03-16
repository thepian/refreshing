#!/usr/bin/env nodeunit

exports.testConcatenate = function(test) {
	test.expect(1);
	test.ok(true,"hmm strange");
	test.done();
};

/*
var base = __dirname;
//if (process.argv.length > 2) base = require('path').join(__dirname,process.argv[2]);

base = require('path').join(__dirname,"mini-site");

require("../lib/refreshing/index").watchTrees(__dirname,base);

base = require('path').join(__dirname,"sub-out");

require("../lib/refreshing/index").watchTrees(__dirname,base);
*/