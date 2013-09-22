var source = require("./source"), 
	chokidar = require("chokidar"),
	path = require("path");

var sourceTrees = {};

function once(scriptdir,t1,t2,t3) {

	var options = { server:false };

	for(var i=1,a; a = arguments[i]; ++i) {
		if (sourceTrees[a] == undefined) {
			var tree = new source.SourceTree(a,options);
			sourceTrees[a] = tree;
		}
	}
}

function watchTrees(scriptdir,t1,t2,t3) {

	var options = { server:true };

	for(var i=1,a; a = arguments[i]; ++i) {
		if (sourceTrees[a] == undefined) {
			var tree = new source.SourceTree(a,options);
			var watcher = chokidar.watch(a, options);
			watcher.on('all',function(type,path,stats) {
				var ev = {
					name: path,
					isDelete: function() { return type == "unlink"; },
					
				};
				try {
					tree.trigger(ev);
				} catch(ex) {
					console.log("Failed tree watching update",ex,ev);
				}
			});
			// watchTree(a, options, function(ev) {
			// });
			sourceTrees[a] = tree;
		}
	}
}

function justServer(scriptdir,basedir,rel) {
	var resources = rel? path.join(basedir,rel) : basedir;
	var connect = require('connect');
	//TODO configurable index file name

	var options = { serverPort:8000 };
	console.log(basedir,rel,resources);

	connect.createServer(
		connect.static(resources)
		).listen(options.serverPort);
}

module.exports = {
	"once": once,
	"justServer": justServer,
	"watchTrees": watchTrees
};

/* 
exec("uname -o") == /Cygwin/
*/