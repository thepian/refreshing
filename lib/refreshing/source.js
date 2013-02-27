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
	this.root = new SourceNode(this);
	this.basePrefix = opts.basedir;

	this.starting = true;
	this.fileCount = 0;

	var emitter = walkdir(this.rootPrefix,this.scanExisting.bind(this));
	emitter.on('end',this.started.bind(this));

}

SourceTree.prototype.scanExisting = function(p,stat) {
	//console.log(".. ",p.substring(this.rootPrefix.length+1));

	var sfn = p.substring(this.rootPrefix.length+1).split(path.sep), basename = sfn[sfn.length-1], _config, child;

	var _children = this.root.children, _parent = this.root;
	for(var j=0,n,last=sfn.length-1; n=sfn[j]; ++j) {
		if (_children[n]) child = _children[n];
		else child = _children[n] = new SourceNode(this,n,_parent,j == last,stat);

		if (child.config) _config = child.config;
		else if (_config) child.config = _config;
		_children = child.children;
		_parent = child;
	}
	++this.fileCount;
};

SourceTree.prototype.started = function() {
	this.starting = false;
	console.log("Started scan,",this.fileCount,"files.");
}

SourceTree.prototype.ensureChild = function(children,name,parent,leaf) {
    var stat,child;
  	if (leaf) try{
    	stat = fs.lstatSync(ev.name);
  	} catch (e) { }

	if (children[name] == undefined) {
		++this.fileCount;
		children[name] = new SourceNode(this,name,parent,leaf,stat)
		children[name].update("added");
		if (!this.starting && leaf) console.log("Added:",children[name].childPath().join("/"));
	} else if (leaf) {
		child = children[name]
		child.update("changed");
		var p = child.childPath().join(path.sep);

      	if (stat && child.isChanged(stat)) {
			console.log("Changed:",p);
			child.update("changed");
			child.stat = stat;
      	}
	}

	return children[name];
};

SourceTree.prototype.removeChild = function(children,name,parent,leaf) {
	if (leaf) {
		if (children[name]) children[name].update("removed");
		else {
			console.log("removed",name,"wasn't known");
		}
		if (!this.starting) console.log("Removed:",children[name].childPath().join("/"),"config:",children[name].config.rootPath.join(path.sep));
		children[name] = undefined;
	} else {
		if (children[name] == undefined) return null; 
	}

	return children[name];
};

SourceTree.prototype.trigger = function(ev) {
	var sfn = ev.name.substring(this.rootPrefix.length+1).split(path.sep), basename = sfn[sfn.length-1], _config, child;

	if (ev.isDelete()) {
		--this.fileCount;
		console.log("delete path=",sfn.join(path.sep),"");

		var _children = this.root.children, _parent = this.root;
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


	} else {
		var _children = this.root.children, _parent = this.root;
		for(var j=0,n,last=sfn.length-1; n=sfn[j]; ++j) {
			child = this.ensureChild(_children,n, _parent, j == last);
			if (child.config) _config = child.config;
			else if (_config) child.config = _config;
			_children = child.children;
			_parent = child;
		}
	}
};

function SourceNode(tree,name,parent,leaf,stat) {
	this.tree = tree;
	this.children = {};
	if (name) {
		this.name = name;
		if (parent == undefined) console.log(this, tree.root != null);
		this.underscore = (name[0] == "_") || (parent && parent.underscore);

		this.ext = path.extname(name);
		this.parent = parent;
		this.stat = stat; // atime, mtime, ctime, mode
		this.config = parent? parent.config:null;

		// mix in update/generate if needed
		if (this["mix "+this.name]) this["mix "+this.name](this);
		else if (this["mix "+this.ext]) this["mix "+this.ext](this);
	}
	else {
		this.underscore = false;
	}
}

SourceNode.prototype.isChanged = function(stat) {
	if (this.stat == undefined) return true;
	if (this.stat.size != stat.size) return true;
	//console.log('times',this.stat.ctime.getTime(),stat.ctime.getTime(),this.stat.mtime.getTime(),stat.mtime.getTime());
	if (this.stat.ctime.getTime() != stat.ctime.getTime()) return true;
	if (this.stat.mtime.getTime() != stat.mtime.getTime()) return true;

	return false;
};

SourceNode.prototype.update = function() {};
SourceNode.prototype.generate = function() {};

SourceNode.prototype.generateBranch = function() {
	this.generate();
	for(var n in this.children) {
		this.children[n].generateBranch();
	}
};

SourceNode.prototype.childPath = function() {
	var p = [], n = this;
	while(n) {
		p.unshift(n.name);
		n = n.parent;
	}
	return p;
};

// called on directory of config file
SourceNode.prototype.loadedConfig = function() {
	this.generateBranch();
};

SourceNode.prototype.updateConfig = function(action) {
	if (this.parent.config == undefined) {
		//console.log("Config for", this.parent.childPath().join("/"));
		this.parent.config = new SiteConfig(this.tree.rootPath,this.parent.childPath(),"_config.yml",this.parent.loadedConfig.bind(this.parent));
	}
};

SourceNode.prototype.updateLess = function(action) {
	switch(action) {
		case "init":
		case "added":
		case "changed":
			this.generate();
			break;

		case "removed":
			//TODO generate dependents
			break;
	}
};

SourceNode.prototype.updateScss = function(action) {
	switch(action) {
		case "init":
		case "added":
		case "changed":
			this.generate();
			break;

		case "removed":
			//TODO generate dependents
			break;
	}
};

SourceNode.prototype.generateLess = function() {
	// if no _ in path
	if (this.underscore) return;

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

	var p =  this.tree.rootPath.concat(this.childPath()).join(path.sep);
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
	parser.parse(src,function(err,tree) {
		if (err) {
			//TODO what now
			console.log("Failed parsing LESS",p,err);
		} else {
			console.log("tree imports",tree.imports || "no imports", options.paths, options.relativeUrls, tree.rules[0]);
			var css = tree.toCSS({
                    compress: options.compress,
                    yuicompress: options.yuicompress,
                    strictMaths: options.strictMaths,
                    strictUnits: options.strictUnits
                });
			//console.log(css," -> ",options.outputs);
			for(var i=0,o; o = options.outputs[i]; ++i) {
				var out = fs.openSync(o,"w+");
				fs.writeSync(out, css);
			}
		}
	});
};

SourceNode.prototype.generateScss = function() {
	// if no _ in path
	if (this.underscore) return;

};


SourceNode.prototype["mix _config.yml"] = function() {
	this.update = this.updateConfig;
	this.updateConfig();
};

SourceNode.prototype["mix .less"] = function() {
	this.update = this.updateLess;
	this.generate = this.generateLess;
};

SourceNode.prototype["mix .scss"] = function() {
	this.update = this.updateScss;
	this.generate = this.generateScss;
};





function SiteOutput(config,prefix) {
	this.rootPrefix = path.resolve(config.rootPath.join(path.sep),prefix);
	this.rootPath = this.rootPrefix.split(path.sep);
	// for(var i=0,n; n = this.rootPath[i]; ++i) {
	// 	fs.mkdirSync(path.dirname(pth));
	// }
	//console.log("site output prefix",this.rootPrefix);
}

SiteOutput.prototype.resolve = function(name) {
 	return this.rootPrefix + path.sep + name;
};

function SiteConfig(overallPath,rootPath,confName,loaded) {
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
	//console.log("config path", fp);

	fs.readFile(fp, 'utf8', this.loadedFile.bind(this));
	//TODO set names

	//TODO check if they exist
	this.loaded = loaded;
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
		this.loaded();
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

