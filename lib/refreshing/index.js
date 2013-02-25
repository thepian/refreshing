//TODO check that min node 0.9.2 on OSX
var stalker = require("./stalker"), source = require("./source");

var sourceTrees = {};

function watchTrees(basedir,t1,t2,t3) {

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

module.exports = {
	"watchTrees": watchTrees
};

/* 
exec("uname -o") == /Cygwin/
*/