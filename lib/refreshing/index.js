var source = require("./source"), watchTree = require("fs-watch-tree").watchTree;

var sourceTrees = {};

function watchTreesOld(basedir,t1,t2,t3) {
	var stalker = require("./stalker");
	var options = { buffer:200, strict:true, basedir:basedir };
	//console.log("basedir", basedir);

	for(var i=1,a; a = arguments[i]; ++i) {
		if (sourceTrees[a] == undefined) {
			//var options = {};
			var tree = new source.SourceTree(a,options);
			stalker.watch(a, options, tree.addedTrigger.bind(tree), tree.removedTrigger.bind(tree), tree.changedTrigger.bind(tree), tree.watchedTrigger.bind(tree));
			sourceTrees[a] = tree;
		}
	}
}

function watchTrees(basedir,t1,t2,t3) {

	var options = {};

	for(var i=1,a; a = arguments[i]; ++i) {
		if (sourceTrees[a] == undefined) {
			var tree = new source.SourceTree(a,options);
			watchTree(a, options, tree.trigger.bind(tree));
			sourceTrees[a] = tree;
		}
	}
}

module.exports = {
	"watchTrees": watchTrees
};

/* 
exec("uname -o") == /Cygwin/
*/