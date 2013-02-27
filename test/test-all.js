#!/usr/bin/env node

var base = __dirname;
//if (process.argv.length > 2) base = require('path').join(__dirname,process.argv[2]);

base = require('path').join(__dirname,"mini-site");

require("../lib/refreshing/index").watchTrees(__dirname,base);
