var source = require("./source"), watchTree = require("fs-watch-tree").watchTree;

var sourceTrees = {};

function watchTrees(basedir,t1,t2,t3) {

	var options = {};

	for(var i=1,a; a = arguments[i]; ++i) {
		if (sourceTrees[a] == undefined) {
			var tree = new source.SourceTree(a,options);
			watchTree(a, options, function(ev) {
				try {
					tree.trigger(ev);
				} catch(ex) {
					console.log("Failed tree watching update",ex,ev);
				}
			});
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