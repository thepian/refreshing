!function() {

var path = require("path"), fs = require("fs"), yaml = require("js-yaml"), less = require("less");
var walkdir = require("./walkdir");
/*
	SourceTree .root holds the children of rootPath.

	Each child can have { name, children, parent, config }
*/

function SourceTree(p,opts) {
	var p = path.resolve(p);
	this.rootPrefix = p;
	this.rootPath = p.split(path.sep);
	this.root = {};
	this.basePrefix = opts.basedir;

	this.starting = true;

	var emitter = walkdir(this.rootPrefix,this.scanExisting.bind(this));
	emitter.on('end',this.started.bind(this));

}

SourceTree.prototype.scanExisting = function(p,stat) {
	//console.log(".. ",p.substring(this.rootPrefix.length+1));

	var sfn = p.substring(this.rootPrefix.length+1).split(path.sep), basename = sfn[sfn.length-1], _config, child;

	var _children = this.root, _parent = this.root;
	for(var j=0,n,last=sfn.length-1; n=sfn[j]; ++j) {
		if (_children[n]) child = _children[n];
		else child = this.addChild(_children,n, _parent, j == last,stat,"init");

		if (child.config) _config = child.config;
		else if (_config) child.config = _config;
		_children = child.children;
		_parent = child;
	}

};

SourceTree.prototype.started = function() {
	this.starting = false;
	console.log("Started scan.");
}

SourceTree.prototype.FILETYPES = {
	"_config.yml": function(child) {
		child.update = this.updateConfig;
	},

	".less": function(child) {

		child.update = this.updateLess;
		child.generate = this.generateLess;
	},

	".scss": function(child) {
		child.update = this.updateScss;
		child.generate = this.generateScss;
	},

	"updateConfig": function(action) {
		if (this.parent.config == undefined) {
			console.log("Config for", this.tree.childPath(this.parent).join("/"));
			this.parent.config = new SiteConfig(this.tree.rootPath,this.tree.childPath(this.parent),"_config.yml");
		}
	},

	"updateLess": function(action) {
		switch(action) {
			case "init":
			case "added":
			case "changed":
				console.log(this.name,this.config);
				if (this.parent && this.parent.name == "_less") { //TODO config.lessNode
					this.generate();
				} 
				//TODO generate dependents
				break;
			case "removed":
				//TODO generate dependents
				break;
		}
	},

	"updateScss": function(action) {
		switch(action) {
			case "init":
			case "added":
			case "changed":
				if (this.parent && this.parent.name == "_scss") { //TODO config.lessNode
					this.generate();
				} 
				//TODO generate dependents
				break;
			case "removed":
				//TODO generate dependents
				break;
		}
	},

	"generateLess": function() {
		var options = {
		    compress: false,
		    yuicompress: false,
		    optimization: 1,
		    silent: false,
		    lint: false,
		    paths: [this.config.lessPath].concat(this.config.alternate), 
		    outputs: [],
		    color: true,
		    strictImports: false,
		    rootpath: '',
		    relativeUrls: false,
		    strictMaths: true
		};

		var p =  this.tree.rootPath.concat(this.tree.childPath(this)).join(path.sep);
		p = path.relative(this.tree.basePrefix,p);
		options.filename = p;
		options.paths.push(path.dirname(p));
		//console.log("generating less for",options.paths.join("\n"));
		// [path.dirname(p)].concat(options.paths)
		//TODO alternative paths

		var outputName = this.name.substring(0,this.name.length - 5);
		for(var n in this.config.outputs) {
			var pth = this.config.outputs[n].resolve(this.config.cssBase + path.sep + outputName + ".css");
			options.outputs.push( pth );
			try { fs.mkdirSync(path.dirname(pth)); } catch(ex) {}
		}
		//console.log(this.tree.rootPrefix,"config",this.config.rootPath,"outputs",options.outputs);

		var parser = less.Parser(options);

		var src = fs.readFileSync(p).toString();
		//console.log("src ...",src);
		parser.parse(src,function(err,tree) {
			if (err) {
				//TODO what now
				console.log("Failed parsing LESS",p,err);
			} else {
				console.log("tree imports",tree.imports);
				var css = tree.toCSS({
	                    compress: options.compress,
	                    yuicompress: options.yuicompress,
	                    strictMaths: options.strictMaths,
	                    strictUnits: options.strictUnits
	                });
				for(var i=0,o; o = options.outputs[i]; ++i) {
					var out = fs.openSync(o,"w+");
					fs.writeSync(out, css);
				}
			}
		});
	},

	"generateScss": function() {

	}
};

SourceTree.prototype.addChild = function(children,name,parent,leaf,stat,type) {
	var child = children[name] = { 
		name: name, 
		ext: path.extname(name), 
		children: {}, 
		parent: parent, 
		stat: stat, // atime, mtime, ctime, mode
		config: parent? parent.config:null,
		tree: this,

		generate: function() {}, 
		update: function() {} 
	};

	if (this.FILETYPES[child.name]) this.FILETYPES[child.name](child);
	else if (this.FILETYPES[child.ext]) this.FILETYPES[child.ext](child);
	child.update(type || "added");

	return child;
};

SourceTree.prototype.ensureChild = function(children,name,parent,leaf,stat) {
	if (children[name] == undefined) {
		this.addChild(children,name,parent,leaf,stat,"added");
		if (!this.starting && leaf) console.log("Added:",this.childPath(children[name]).join("/"));
	} else {
		children[name].update("changed");
		if (!this.starting && leaf) console.log("Changed:",this.childPath(children[name]).join("/"));
	}

	return children[name];
};

SourceTree.prototype.removeChild = function(children,name,parent,leaf) {
	if (leaf) {
		if (children[name]) children[name].update("removed");
		else {
			console.log("removed",name,"wasn't known");
		}
		if (!this.starting) console.log("Removed:",this.childPath(children[name]).join("/"),"config:",children[name].config.rootPath);
		children[name] = undefined;
	} else {
		if (children[name] == undefined) return null; 
	}

	return children[name];
};

SourceTree.prototype.childPath = function(child) {
	var p = [], n = child;
	while(n) {
		p.unshift(n.name);
		n = n.parent;
	}
	return p;
};

SourceTree.prototype.trigger = function(ev) {
	var sfn = ev.name.substring(this.rootPrefix.length+1).split(path.sep), basename = sfn[sfn.length-1], _config, child;

	if (ev.isDelete()) {
		console.log("delete path=",sfn.join(path.sep),"");

		var _children = this.root, _parent = null;
		for(var j=0,n,last=sfn.length-1; n=sfn[j]; ++j) {
			child = this.removeChild(_children,n, _parent, j == last);
			if (child) {
				if (child.config) _config = child.config;
				else if (_config) child.config = _config;
				_children = child.children;
				_parent = child;
			}
			else break;
		}


	} else if (ev.isModify()) {
		console.log("modify path=",sfn.join(path.sep),"");

	} else {
		console.log("add path=",sfn.join(path.sep),"");

		var _children = this.root, _parent = null;
		for(var j=0,n,last=sfn.length-1; n=sfn[j]; ++j) {
			child = this.ensureChild(_children,n, _parent, j == last);
			if (child.config) _config = child.config;
			else if (_config) child.config = _config;
			_children = child.children;
			_parent = child;
		}

	}
};

// obsolete
SourceTree.prototype.addedTrigger = function(err,files) {
	if (typeof files == "string") files = [files];
	for(var i=0,fn; fn=files[i]; ++i) {
		var sfn = fn.substring(this.rootPrefix.length+1).split(path.sep), 
			basename = sfn[sfn.length-1];

		var _config, child;
		var _children = this.root, _parent = null;
		for(var j=0,n,last=sfn.length-1; n=sfn[j]; ++j) {
			child = this.ensureChild(_children,n, _parent, j == last);
			if (child.config) _config = child.config;
			else if (_config) child.config = _config;
			_children = child.children;
			_parent = child;
		}

		switch(basename) {
			case "_config.yml":
				if (child.parent.config == undefined) {
					console.log("Config for", this.childPath(child.parent).join("/"));
					child.parent.config = new SiteConfig(this.rootPath,this.childPath(child.parent),"_config.yml");
				}
				break;
		}
	}
	
};

// obsolete
SourceTree.prototype.removedTrigger = function(err,files) {
	if (typeof files == "string") files = [files];
	for(var i=0,fn; fn=files[i]; ++i) {
		var sfn = fn.substring(this.rootPrefix.length+1).split(path.sep), basename = sfn[sfn.length-1];

		var _config, child;
		var _children = this.root, _parent = null;
		for(var j=0,n,last=sfn.length-1; n=sfn[j]; ++j) {
			child = this.removeChild(_children,n, _parent, j == last);
			if (child) {
				if (child.config) _config = child.config;
				else if (_config) child.config = _config;
				_children = child.children;
				_parent = child;
			}
			else break;
		}
	}
};

// obsolete
SourceTree.prototype.changedTrigger = function changed(err,files) {
	//console.log("changed files",files);
};

// obsolete
SourceTree.prototype.watchedTrigger = function watched(err,files) {
	this.starting = false;
	console.log("watched..............................");
};


function SiteOutput(config,prefix) {
	this.rootPrefix = path.resolve(config.rootPath.join(path.sep),prefix);
	this.rootPath = this.rootPrefix.split(path.sep);
	console.log("site output prefix",this.rootPrefix);
}

SiteOutput.prototype.resolve = function(name) {
 	return this.rootPrefix + path.sep + name;
};

function SiteConfig(overallPath,rootPath,confName) {
	this.rootPath = overallPath.concat(rootPath);
	this.alternate = [];
	this.libsName = "_libs";
	this.scssName = "_scss";
	this.lessName = "_less";
	this.partsName = "_parts";
	this.cssBase = "css";
	this.jsBase = "js";

	this.outputs = {};

	var fp = this.rootPath.join(path.sep) + path.sep + confName;
	console.log("config path", fp);

	fs.readFile(fp, 'utf8', this.loadedFile.bind(this));
	//TODO set names

	//TODO check if they exist

}

SiteConfig.prototype.YAML_ENTRIES = {
	"auto":"auto",
	"server":"server",
	"server_port":"serverPort",
	"baseurl":"baseURL",
	"alternate":"alternate",
	"destination":"destination",
	"assets-base":"assetsBase",
	"assets_base":"assetsBase",
	"css-base": "cssBase",
	"css_base": "cssBase",
	"js-base": "jsBase",
	"js_base": "jsBase",

	"libs_name": "libsName",
	"scss_name": "scssName",
	"less_name": "lessName",
	"parts_name": "partsName"
};

SiteConfig.prototype.loadedFile = function(err, data) {
	if (err) {
		console.log(err);
		return;
	}
	try {
		var doc = yaml.load(data);
		for(var n in this.YAML_ENTRIES) {
			if (doc[n] != undefined) this[this.YAML_ENTRIES[n]] = doc[n];
		}
		if (this.assetsBase) {
			this.cssBase = this.assetsBase + path.sep + "css";
			this.jsBase = this.assetsBase + path.sep + "js";
		}
		//TODO command line

		for(var i=0,p; p = this.alternate[i]; ++i) {
			this.alternate[i] = path.resolve(this.rootPath.join(path.sep), p);
		}

		this.lessPath = path.resolve(this.rootPath.join(path.sep), this.lessName);
		this.scssPath = path.resolve(this.rootPath.join(path.sep), this.scssName);
		this.libsPath = path.resolve(this.rootPath.join(path.sep), this.libsName);
		this.partsPath = path.resolve(this.rootPath.join(path.sep), this.partsName);

		this.hasLibs = fs.existsSync(this.libsPath);
		this.hasScss = fs.existsSync(this.scssPath);
		this.hasLess = fs.existsSync(this.lessPath);
		this.hasParts = fs.existsSync(this.partsPath);

		//console.log("config",this,doc);
		this._configOutput();
	} catch(ex) {
		console.log("Failed to load config",this.rootPath.join("/"),ex)
		//TODO
	}
};

SiteConfig.prototype._configOutput = function() {
	this.outputs = {};
	switch(typeof this.destination) {
		case "object":
			for(var i=0,prefix; prefix = this.destination[i]; ++i) this.outputs[prefix] = new SiteOutput(this,prefix);
			break;
		case "string":
			this.outputs[this.destination] = new SiteOutput(this,this.destination);
			break;
	}
};

SiteConfig.prototype.autoBuild = function autoBuild() {
	console.log("auto building");

	for(var n in this.outputs) {

	}
};

module.exports = {
	"SourceTree": SourceTree
};

}();

