!function() {

var path = require("path"), fs = require("fs-extra"), yaml = require("js-yaml"), less = require("less");
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
	this._startedCallback = opts.startedCallback;

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
		if (_config && _config.outputs) {
			if (_config.outputs[p]) return; // don't scan output
		}

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
	this._startedCallback();
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

/* 
	fs-watch-tree trigger when files/dir change 
*/
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

SourceTree.prototype.getNode = function(abs) 
{
	// in tree ?
	if (abs.substring(0,this.rootPrefix.length) != this.rootPrefix) return null;

	var p = abs.substring(this.rootPrefix.length);

	var sfn = p.split(path.sep), _children = this.root.children, child;
	console.log("getting node for",sfn);
	for(var i=0,n,l=sfn.length; i<l; ++i) {
		//console.log("children",_children);
		var n = sfn[i];
		if (n) { // skip leading undefined
			child = _children[n];
			//console.log("node",child.childPath().join("/"));
			if (child == undefined) return null;
			_children = child.children;
		}
	}
	return child;
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
		this.output = parent? parent.output:false;

		// mix in update/generate if needed
		if (this["ext "+this.name]) this["ext "+this.name](this);
		else if (this.ext && this["ext "+this.ext]) {
			//console.log("extension",">"+this.ext+"<",this.name);
			this["ext "+this.ext](this);
		}
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

SourceNode.prototype.setOnBranch = function(name,value) {
	this[name] = value;
	for(var n in this.children) this.children[n].setOnBranch(name,value);
};

SourceNode.prototype.update = function() {};
SourceNode.prototype.generate = function() {};

SourceNode.prototype.generateBranch = function() {
	if (! this.output) {
		this.generate();
		for(var n in this.children) {
			this.children[n].generateBranch();
		}
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

/* called on directory of config file
   when the config has been loaded.
*/
SourceNode.prototype.loadedConfig = function() {
	for(var n in this.config.outputs) {
		var outputPath = this.config.outputs[n].rootPrefix;
		fs.mkdirsSync(outputPath);
		var outputNode = this.tree.getNode(outputPath);
		if (outputNode) {
			outputNode.setOnBranch("output",true);
			//TODO copy this for added nodes
			//console.log("output node",outputNode,"for",outputPath);
		}
	}

	if (this.config.concatenate) {
		for(var i=0,c; c = this.config.concatenate[i]; ++i) {
			var p = path.relative(this.config.roootPrefix,c);
			
			//TODO ensureChild(children,name,parent,leaf)
		}
	}
 
	// Output the files below the config dir
	this.generateBranch();
	//console.log(this.config);

	if (this.config.serverPort && outputPath) {
		console.log("Server on",this.config.serverPort,"for",outputPath);
		var connect = require('connect');
		//TODO configurable index file name
		connect.createServer(
			connect.static(outputPath)
			).listen(this.config.serverPort);

		//var mdns = require('mdns'), ad = mdns.createAdvertisement(mdns.tcp('http'), 4321);
		//ad.start();

	}
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
			if (! this.output) this.generate();
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
			if (! this.output) this.generate();
			break;

		case "removed":
			//TODO generate dependents
			break;
	}
};

SourceNode.prototype.removeOutput = function() {

	var outputName = this.name.substring(0,this.name.length - 5);
	for(var n in this.config.outputs) {
		var pth = this.config.outputs[n].resolve(this.config.cssBase + path.sep + outputName + ".css");
		options.outputs.push( pth );
		try { fs.mkdirSync(path.dirname(pth)); } catch(ex) {}
	}

	var p =  this.tree.rootPath.concat(this.childPath()).join(path.sep);
	p = path.relative(this.tree.basePrefix,p);

	fs.unlink(p,this.removeDone.bind(this));
};

SourceNode.prototype.removeDone = function() {
	// mark it or remove node
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
	options.filename = path.relative(this.tree.rootPrefix,p);
	options.paths.push(path.dirname(p));
	//console.log("generating less for",options.paths.join("\n"));
	// [path.dirname(p)].concat(options.paths)
	//TODO alternative paths

	var outputName = this.name.substring(0,this.name.length - 5);
	for(var n in this.config.outputs) {
		var pth = this.config.outputs[n].resolve(this.config.cssBase + path.sep + outputName + ".css");
		options.outputs.push( pth );
		try { fs.mkdirRecursiveSync(path.dirname(pth)); } catch(ex) {}
	}
	//console.log(this.tree.rootPrefix,"config",this.config.rootPath,"outputs",options.outputs);

	var parser = less.Parser(options);

	var src = fs.readFileSync(p).toString();
	parser.parse(src,function(err,tree) {
		if (err) {
			//TODO what now
			console.log("Failed parsing LESS",p,err);
		} else {
			//console.log("tree imports",tree.imports || "no imports", options.paths, options.relativeUrls, tree.rules[0]);

			var css;
			try {
				css = tree.toCSS({
                    compress: options.compress,
                    yuicompress: options.yuicompress,
                    strictMaths: options.strictMaths,
                    strictUnits: options.strictUnits
                });
			} catch(ex) {
				var problem = yaml.dump([ex],{ indent:4 });
				css = "Failed to render LESS for "+options.filename+"\n"+problem;
				console.log(css);
				css = "/* " + css + " */";
			}
			//console.log(css," -> ",options.outputs);
			for(var i=0,o; o = options.outputs[i]; ++i) {
				//var out = fs.openSync(o,"w+");
				fs.outputFile(o, css, function(err) {
					//TODO flag error
					if (err) console.log("Failed to output", err);
				});
			}
		}
	});
};

SourceNode.prototype.generateScss = function() {
	// if no _ in path
	if (this.output) return;
	if (this.underscore) return;

};

SourceNode.prototype.updateCopy = function(action) {
	switch(action) {
		case "init":
		case "added":
		case "changed":
			if (! this.output) this.generate();
			break;

		case "removed":
			//TODO generate dependents
			this.removeOutput();
			break;
	}
};

SourceNode.prototype.generateCopy = function() {
	//console.log("inPath",this.tree.rootPrefix,"." + this.childPath().join(path.sep));
	var inPath = path.resolve(this.tree.rootPrefix,"." + this.childPath().join(path.sep));
	for(var n in this.config.outputs) {
		var outPath = this.config.outputs[n].resolve(this.childPath().join(path.sep));
		fs.copy(inPath,outPath);
		//console.log("Copying ",inPath,"to",outPath,this.name);
	}
};

SourceNode.prototype["ext _config.yml"] = function() {
	this.update = this.updateConfig;
	this.updateConfig();
};

SourceNode.prototype["ext .less"] = function() {
	this.update = this.updateLess;
	this.generate = this.generateLess;
};

SourceNode.prototype["ext .scss"] = function() {
	this.update = this.updateScss;
	this.generate = this.generateScss;
};

SourceNode.prototype["ext .css"] = function() {
	this.update = this.updateCopy;
	this.generate = this.generateCopy;
};

SourceNode.prototype["ext .txt"] = function() {
	this.update = this.updateCopy;
	this.generate = this.generateCopy;
};





function SiteOutput(config,prefix) {
	//console.log("output prefix",config.rootPath.join(path.sep),prefix);

	this.rootPrefix = path.resolve(config.rootPrefix,prefix);
	this.rootPath = this.rootPrefix.split(path.sep);
	// for(var i=0,n; n = this.rootPath[i]; ++i) {
	// 	fs.mkdirSync(path.dirname(pth));
	// }
	//console.log("site output prefix",this.rootPrefix);
}

SiteOutput.prototype.resolve = function(name) {
	name = name[0] == "/"? "." + name : name;
	if (typeof this.rootPrefix != "string" || typeof name != "string") console.log("output resolve failing",this.rootPrefix,name);

	return path.resolve(this.rootPrefix,name);
};

function SiteConfig(overallPath,rootPath,confName,loaded) {
	this.rootPath = overallPath.concat((rootPath[0] == undefined)? rootPath.slice(1) : rootPath);
	this.rootPrefix = this.rootPath.join(path.sep);
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

	"concatenate": "concatenate",

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

		//console.log(this.rootPrefix, this.lessName, this.scssName, this.libsName, this.partsName, this.alternate);

		for(var i=0,p; p = this.alternate[i]; ++i) {
			this.alternate[i] = path.resolve(this.rootPrefix, p);
		}

		this.lessPath = path.resolve(this.rootPrefix, this.lessName);
		this.scssPath = path.resolve(this.rootPrefix, this.scssName);
		this.libsPath = path.resolve(this.rootPrefix, this.libsName);
		this.partsPath = path.resolve(this.rootPrefix, this.partsName);

		this.hasLibs = fs.existsSync(this.libsPath);
		this.hasScss = fs.existsSync(this.scssPath);
		this.hasLess = fs.existsSync(this.lessPath);
		this.hasParts = fs.existsSync(this.partsPath);

		//console.log("config",this,doc);
		this._configOutput();
		this.loaded();
	} catch(ex) {
		console.log("Failed to load config",this.rootPath.join("/"),ex,ex.stack);
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

