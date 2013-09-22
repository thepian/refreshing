!function() {

var path = require("path"), fs = require("fs-extra"), yaml = require("js-yaml"), less = require("less");
var walkdir = require("./walkdir"), Step = require("./step");


function mkdirsSync(pathname, mode) {
	try {
		if (!fs.statSync(pathname).isDirectory()) throw new Error('Unable to create directory at: '+pathname);
	} catch(e) {
		if (e.code == 'ENOENT') {
			mkdirsSync(path.dirname(pathname));
			fs.mkdirSync(pathname,mode);
		} else throw e;
	}
}

/*
	SourceTree .root holds the children of rootPath.

	Each child can have { name, children, parent, config }
*/

function SourceTree(p,opts) {
	var p = path.resolve(p);
	this.rootPrefix = p;
	this.rootPath = p.split(path.sep);

	this.externals = {}; // source nodes outside the tree
	this.root = new SourceNode(this);
	this.basePrefix = opts.basedir;
	this._startedCallback = opts.startedCallback;

	this.starting = true;
	this.fileCount = 0;

	var emitter = walkdir(this.rootPrefix,this._scanExisting.bind(this));
	emitter.setMaxListeners(20);
	emitter.on('end',this.started.bind(this));
	emitter.on('error',this._scanError.bind(this));

}

SourceTree.prototype._scanExisting = function(p,stat) {

	var rest = p.substring(this.rootPrefix.length+1), sfn = rest.split(path.sep), basename = sfn[sfn.length-1], _config, child;

	var _children = this.root.children, _parent = this.root;
	for(var j=0,n,last=sfn.length-1; n=sfn[j]; ++j) {
		if (_config && _config.outputs) {
			if (_config.outputs[p]) return; // don't scan output
		}

		if (_children[n]) child = _children[n];
		else child = _children[n] = new SourceNode(this,n,_parent,j == last,stat);

		_children = child.children;
		_parent = child;
	}
	++this.fileCount;
};

SourceTree.prototype.started = function() {
	this.starting = false;
	console.log("Started scan,",this.fileCount,"files.");
	if (this._startedCallback) this._startedCallback();
};

SourceTree.prototype._scanError = function(err) {
	console.log("SourceTree error",this.basePrefix," -->",err);
};

//TODO rename to reflect purpose
SourceTree.prototype.ensureChild = function(children,name,parent,leaf,matter) {

    var stat,child,abs;
  	if (leaf) try{  		
  		abs = path.join(parent.pathPrefix(),name);
    	stat = fs.lstatSync(abs);
  	} catch (e) { }

	if (children[name] == undefined) {
		++this.fileCount;
		children[name] = new SourceNode(this,name,parent,leaf,stat,matter)
		children[name]._update("added");
		if (!this.starting && leaf) console.log("Added:",children[name].childPath().join("/"));
	} else if (leaf) {
		child = children[name]

		var p = child.childPath().join(path.sep);
		if (! child.skipThisOrParent()) {
			if (stat) {
				console.log(child.config? "Changed:" : "Resource:",p);
				if (child.isChanged(stat)) child.update("changed",stat);
			} else child.update("changed",stat);
		}
	}

	return children[name];
};

SourceTree.prototype.makeExternalNode = function(rel) {
	if (this.externals[rel]) return this.externals[rel]; //TODO

	var name = rel;
	var node = new SourceNode(this,name/*,parent,leaf,stat,matter*/);
	node.external = true;
	this.externals[rel] = node;
	var abs = path.resolve(this.rootPrefix,rel);
	var watcher = fs.watch(abs,function(){
		var stat = fs.lstatSync(abs);
		node.update("changed",stat);
	});
};

SourceTree.prototype.ensureNode = function(nodePath,matter) {

	var fromRoot = path.relative(this.rootPrefix,nodePath);
	// in tree ?
	if (nodePath.substring(0,this.rootPrefix.length) != this.rootPrefix) {
		if (matter.external) {
			return this.makeExternalNode(fromRoot);
		}
		else return null;
	}

	var p = nodePath.substring(this.rootPrefix.length);
	var sfn = p.split(path.sep), _config, _children = this.root.children, child, _parent = this.root;

	for(var i=0,n,l=sfn.length; i<l; ++i) {
		var n = sfn[i];

		child = this.ensureChild(_children,n, _parent, i == l-1, (i == l-1)? matter:null);
		if (child.config) _config = child.config;
		else if (_config) child.config = _config;
		_children = child.children;
		_parent = child;
	}
	return child;
};

SourceTree.prototype.removeChild = function(children,name,parent,leaf) {
	if (leaf) {
		if (children[name]) children[name]._update("removed");
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
	for(var j=0,n,last=sfn.length-1; n=sfn[j]; ++j) {
		if (n.charAt(0) == ".") return; // ignore . directories
		// exclude
	}
	// console.log(sfn, this.root.config);
	var config = this.root.config, rem = ev.name.substring(this.rootPrefix.length+1);
	// console.log("-->",rem,"del",ev.isDelete(),"excluding",config.exclude);
	for(var i=0,e; e = config.exclude[i]; ++i) {
		// app/ == app/css/abc.css
		// abc.css == app/css/abc.css
		// app/css/abc.css == app/css/abc.css
		if (e == rem.substring(0,e.length+1)) {
			// console.log("excluding ",ev.name);
			return;
		}
	}	

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

SourceTree.prototype.getNode = function(abs,createIfExists) 
{
	var rel = path.relative(this.rootPrefix,abs);
	if (this.externals[rel]) return this.externals[rel];

	// in tree ?
	if (abs.substring(0,this.rootPrefix.length) != this.rootPrefix) {
		if (createIfExists) {
			var x;
		}
		if (createIfExists && fs.existsSync(abs)) {
			// console.log("Creating additional node",abs);
			var node = this.ensureNode(abs,{ external:true }); //TODO ignore the ones created
			return node;
		}
		return null;
	}

	var p = abs.substring(this.rootPrefix.length);

	var sfn = p.split(path.sep), _children = this.root.children, child;
	//console.log("getting node for",sfn);
	for(var i=0,n,l=sfn.length; i<l; ++i) {
		//console.log("children",_children);
		var n = sfn[i];
		if (n) { // skip leading undefined
			child = _children[n];
			//console.log("node",child.childPath().join("/"));
			if (child == undefined) {
				/*
				if (createIfExists) {
					var x;
				}
				if (createIfExists && fs.existsSync(abs)) {
					console.log("Creating additional node",abs);
					var node = this.ensureNode(abs,{}); //TODO ignore the ones created
					return node;
				}
				*/
				return null;
			}			
			_children = child.children;
		}
	}
	return child;
};

function SourceNode(tree,name,parent,leaf,stat,matter) {
	this.tree = tree;
	this.children = {};
	this.matter = matter;
	this.derived = {}; // other nodes that depend on this

	if (name) {
		this.name = name;
		//if (parent == undefined) console.log(this, tree.root != null);
		this.leadDot = (name[0] == ".") || (parent && parent.leadDot);
		this.underscore = (name[0] == "_") || (parent && parent.underscore);
		this.skip = this.underscore || this.leadDot;

		this.ext = path.extname(name);
		this.parent = parent;
		this.stat = stat; // atime, mtime, ctime, mode
		this.config = parent? parent.config:null;
		this.output = parent? parent.output:false;

		if (this.matter == undefined) {
			//TODO load first bit of file to see if matter is there
			//TODO load the matter, else
			this.matter = {};
		}

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

/*
	Scan the LESS tree to determine nodes imported, set this
	node as derived on the imported nodes
*/
SourceNode.prototype.addDerivedLessPaths = function(lessTree,options) {
	var thisNode = this;
	var sourceTree = this.tree;
	var roots = options.paths;

	addBranch(lessTree);


	function addBranch(branch,branchNode) {

		for(var i=0,rule; rule = branch.rules[i]; ++i) {
			if (rule.path) {
				var node = findNode(rule.path,branchNode);
				if (node) {
					// rule imports a path
					node.derived[thisNode.pathPrefix()] = thisNode;
					//console.log(node.name, " trigers generate of ",thisNode.pathPrefix());

					// import less file
					if (rule.root && rule.root.rules) addBranch(rule.root,node); 
				}
				else {
					console.log("Couldn't find node for",rule.path,branchNode?branchNode.pathPrefix():sourceTree.rootPrefix);
				}
			}

			// nested rules that may have less file import
			if (rule.rules) addBranch(rule,branchNode); 
		}

	}

	function findNode(rulePath,branchNode) {
		if (branchNode) {
			var prefix = branchNode.pathPrefix(); //TODO perhaps this should be directory instead for files
			var abs = path.resolve(prefix,'..',rulePath);
			var node = sourceTree.getNode(abs,true);
			if (node) return node;
		}

		for(var j=0,prefix; prefix = roots[j]; ++j) {
			var node = sourceTree.getNode(path.join(prefix,rulePath),true);
			if (node) return node;
			// else console.log("Not found", path.join(prefix,rulePath));
		}	
		return undefined;
	}

};

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

SourceNode.prototype.update = function(eventName,stat) {
	if (!this.external) {
		this._update(eventName);
		this.stat = stat;
	}

	for(var p in this.derived) {
		d = this.derived[p];
		if (! d.external) {
			d._update(eventName);
			var dstat = fs.lstatSync(path.join(d.tree.rootPrefix,d.childPath().join(path.sep)));
			d.stat = dstat;
			console.log("updated",d.name);
		}
	}
};

SourceNode.prototype._update = function() {};
SourceNode.prototype.generate = function() {};

SourceNode.prototype.generateBranch = function() {
	if (! this.output) {
		this.generate();
		for(var n in this.children) {
			this.children[n].generateBranch();
		}
	}
};

/*
	Called for each node under a site source
*/
SourceNode.prototype.configBranch = function(parentConfig) {
	this.config = this.config || parentConfig;
	this.skip = this.config.toBeIgnored(this);

	for(var n in this.children) {
		this.children[n].configBranch(this.config);
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

SourceNode.prototype.pathPrefix = function()
{
	return path.join(this.tree.rootPrefix,this.childPath().join(path.sep));
};

SourceNode.prototype.skipThisOrParent = function() {
	for(var t = this; t; t = t.parent) {
		if (t.skip) return true;
	}
	return false;
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

	if (this.config.modules) {
		// console.log("setting up modules",this.config.modules);
		for(var n in this.config.modules){
			var moduleParts = this.config.modules[n];
			this.config.libs[n] = new SiteResource(n,moduleParts);
		}
	}

	if (this.config.concatenate) {
		//	console.log("going through",this.config.concatenate);
		for(var i=0,c; c = this.config.concatenate[i]; ++i) {
			var p = path.resolve(this.config.rootPrefix,c);
			var matter = {
				"concatenate": true // make the update plan concatenate JS
			};
			var node = this.tree.ensureNode(p,matter);
			node.skip = true; //TODO enforce when config updated
			node.config = this.config;
		}
	}

	// update the source files based on config
	// TODO do this when config is changed
	for(var n in this.children) if (n !== "_config.yml") {
		this.children[n].configBranch(this.config);
	}
 
	// Output the files below the config dir
	this.generateBranch();

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
		fs.mkdirsSync(path.dirname(pth));
	}
	//console.log(this.tree.rootPrefix,"config",this.config.rootPath,"outputs",options.outputs);

	var parser = less.Parser(options);

	var thisNode = this;
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

			thisNode.addDerivedLessPaths(tree,options);

			// console.log(options.filename,"dependencies",paths);

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
	if (! this.config) return;

	//console.log("inPath",this.tree.rootPrefix,"." + this.childPath().join(path.sep));
	var inPath = path.resolve(this.tree.rootPrefix,"." + this.childPath().join(path.sep));
	for(var n in this.config.outputs) {
		var output = this.config.outputs[n];
		if (! output.same) {
			var outPath = output.resolve(this.childPath().join(path.sep));
			fs.copy(inPath,outPath);
		}
		//console.log("Copying ",inPath,"to",outPath,this.name);
	}
};

SourceNode.prototype.updateConcatJs = function() {

	this.parts = [];

	if (this.config == undefined) return;// not yet

	var libsPath = this.config.libsPath, rootPrefix = this.config.rootPrefix;
	var names = this.name.substring(0,this.name.length-3),
		minExt = names.substring(this.name.length-5,this.name.length-1) == ".min",
		priorityExt = [".js",".min.js"];
	if (minExt) {
		names = names.substring(0,this.name.length-5);
		priorityExt = [".min.js",".js"];
	}

	var parts = this.name.substring(0,this.name.length-3).split(/[~*|+&]/);
	for(var i=0,n; n = parts[i]; ++i) {
		var part = {
			name: n,
			path: path.resolve(libsPath,n + priorityExt[0]),
			ok: false
		};

		if (fs.existsSync(part.path)) {
			part.ok = true;
		} else {
			part.path = path.resolve(libsPath,n + priorityExt[1]);
			part.ok = fs.existsSync(part.path);
			part.minify = minExt; // minified JS concat from non minified part
		}
		if (!part.ok) {
			if (this.config.libs && this.config.libs[n]) {
				var mod = this.config.libs[n];
				part.path = null;
				part.module = mod;
				part.ok = true;
			}
			else {
				//TODO node module?
			}
		}

		if (part.ok) this.parts.push(part);
	}

	//TODO delay updates until config is set, or do it again then
};

SourceNode.prototype.generateConcatJs = function() {
	var bits = [];

	if (this.parts.length == 0) this._update(); //TODO update when config set
	//console.log(this.config);

	var libsPath = this.config.libsPath, rootPrefix = this.config.rootPrefix;
	for(var i=0,part; part = this.parts[i]; ++i) {
		if (part.module) {
			// SiteResource
			part.module.pushToContent(bits,rootPrefix);
		}
		else {
			var content = fs.readFileSync(part.path,'utf8').toString();
			bits.push(content);
		}
		/*
	Step(
		function readConfig() {
			fs.readFile(fp, 'utf8', this);
		},
		*/

	}

	// console.log("concatenated",bits.join("\n"));

	for(var n in this.config.outputs) {
		var outPath = this.config.outputs[n].resolve(this.childPath().join(path.sep));

		fs.outputFile(outPath, bits.join("\n")); 
	}
};

SourceNode.prototype["ext _config.yml"] = function() {
	this._update = this.updateConfig;
	this.updateConfig();
};

SourceNode.prototype["ext .less"] = function() {
	this._update = this.updateLess;
	this.generate = this.generateLess;
};

SourceNode.prototype["ext .scss"] = function() {
	this._update = this.updateScss;
	this.generate = this.generateScss;
};

SourceNode.prototype["ext .css"] = function() {
	if (! this.underscore) {
		this._update = this.updateCopy;
		this.generate = this.generateCopy;
	}
};

SourceNode.prototype["ext .txt"] = function() {
	if (! this.underscore) {
		this._update = this.updateCopy;
		this.generate = this.generateCopy;
	}
};

SourceNode.prototype["ext .js"] = function() {
	//TODO handle matter
	//TODO handle .min.js
	if (this.matter.concatenate) {
		//console.log(this.config, this.parent);
		this._update = this.updateConcatJs;
		this.generate = this.generateConcatJs;
	} else if (! this.underscore) {
		// copy the file
		this._update = this.updateCopy;
		this.generate = this.generateCopy;
	}
};

// images
// SourceNode.prototype["ext .gif"] = 
// SourceNode.prototype["ext .jpg"] = 
// SourceNode.prototype["ext .jpeg"] = 
// SourceNode.prototype["ext .png"] = function() {
// 	if (! this.underscore) try {
// 		this._update = this.updateCopy;
// 		this.generate = this.generateCopy;
// 	} catch(ex) {
// 		console.error("Generating",this.name,":",ex);
// 	}
// };

// fonts
SourceNode.prototype["ext .eot"] =
SourceNode.prototype["ext .ttf"] =
SourceNode.prototype["ext .woff"] = function() {
	if (! this.underscore) {
		this.update = this.updateCopy;
		this.generate = this.generateCopy;
	}
};

// vectors
SourceNode.prototype["ext .svg"] = function() {
	if (! this.underscore) {
		this.update = this.updateCopy;
		this.generate = this.generateCopy;
	}
};






function SiteOutput(config,prefix) {
	//console.log("output prefix",config.rootPath.join(path.sep),prefix);

	this.rootPrefix = !prefix? config.rootPrefix : path.resolve(config.rootPrefix,prefix);
	this.same = config.rootPrefix == this.rootPrefix;
	this.rootPath = this.rootPrefix.split(path.sep);
	// for(var i=0,n; n = this.rootPath[i]; ++i) {
	// 	fs.mkdirSync(path.dirname(pth));
	// }
	// console.log("site output prefix",this.rootPrefix);
}

SiteOutput.prototype.resolve = function(name) {
	name = name[0] == "/"? "." + name : name;
	if (typeof this.rootPrefix != "string" || typeof name != "string") console.log("output resolve failing",this.rootPrefix,name);

	return path.resolve(this.rootPrefix,name);
};

function SiteResource(path,parts) {
	console.log("Site resource",path,parts.join("  "));
	this.path = path;
	this.parts = parts;
}

SiteResource.prototype.pushToContent = function(output,rootPrefix) {

	for(var j=0,mpart; mpart = this.parts[j]; ++j) {
		var p = path.resolve(rootPrefix,mpart);
		if (fs.existsSync(p)) {
			var content = fs.readFileSync(p,'utf8').toString();
			output.push(content);
		}
	}
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
	this.exclude = [];

	this.libs = {}; // JS lib resources

	var fp = this.rootPath.join(path.sep) + path.sep + confName;
	//console.log("config path", fp);

	var config = this;

	Step(
		function readConfig() {
			fs.readFile(fp, 'utf8', this);
		},

		function parseConfig(err,data) {
			if (err) {
				console.log(err,"for config",config.rootPrefix);
				throw err;
			}
			//console.log("Read config for",config.rootPrefix);
			config._applyConfig(data);
			this();
		},

		function configOutput(err) {
			if (err) {
				console.log(err,"for config",config.rootPrefix);
				throw err;
			}
			//console.log("Output for",config.rootPrefix);
			config._configOutput();
			this();
		},
		function complete(err) {
			if (err) {
				console.log(err,"for config",config.rootPrefix);
				throw err;
			}
			//console.log("Completed config for",config.rootPrefix);
			if (loaded) loaded(); // loading complete
		}
	);
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

	"exclude": "exclude",
	"concatenate": "concatenate",
	"modules": "modules",

	"libs_name": "libsName",
	"scss_name": "scssName",
	"less_name": "lessName",
	"parts_name": "partsName"
};

SiteConfig.prototype._applyConfig = function(data) {
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

		if (this.hasLibs) {
			var paths = fs.readdirSync(this.libsPath);
			for(var i=0,p; p = paths[i]; ++i) {

			}
		}
		if (typeof this.exclude === "string") {
			this.exclude = this.exclude.replace(/ ,/g, ",").replace(/, /g, ",").split(",");
		}
	} catch(ex) {
		console.log("Failed to load config",this.rootPath.join("/"),ex,ex.stack);
		//TODO
	}
	//console.log("done _applyConfig");
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
		case "undefined":
			this.outputs[this.destination] = new SiteOutput(this,".");
			break;
	}
};

/*
	Should the node be ignored
*/
SiteConfig.prototype.toBeIgnored = function(node) {

	//TODO should lead underscore in path be ignored?
	var skip = node.underscore || node.leadDot,
		p = node.pathPrefix().substring(this.rootPrefix.length);
	if (this.lessPath && this.lessPath == p.substring(0,this.lessPath.length)) skip = true;
	if (this.scssPath && this.scssPath == p.substring(0,this.scssPath.length)) skip = true;
	if (this.libsPath && this.libsPath == p.substring(0,this.libsPath.length)) skip = true;
	if (this.partsPath && this.partsPath == p.substring(0,this.partsPath.length)) skip = true;

	for(var i=0,e; e = this.exclude[i]; ++i) {
		if ("/"+e == p.substring(0,e.length+1)) skip = true;
	}	
	if (this.concatenate) {
		for(var i=0,c; c = this.concatenate[i]; ++i) {
			if ("/"+c == p) skip = true;
		}
	}
	// if (skip) console.log("Skipping -- ",p);

	return skip;
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

